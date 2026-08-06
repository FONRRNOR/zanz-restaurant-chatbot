<script setup>
import { computed, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { Globe2, ShoppingCart, UserCircle } from "@lucide/vue";
import MobileNav from "../../components/MobileNav.vue";
import SideNav from "../../components/SideNav.vue";
import StatusPill from "../../components/StatusPill.vue";
import TopBar from "../../components/TopBar.vue";
import { useAppState } from "../../services/appState";

const router = useRouter();
const { state } = useAppState();

const orders = ref([]);
const activeFilter = ref("all");

async function fetchOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items (*)")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Supabase Error:", error);
    return;
  }

  const allergyKeywords = [
    "no onion",
    "no peanuts",
    "no shrimp",
    "no dairy",
    "no egg",
    "allergic",
    "แพ้",
  ];

  orders.value = data.map((order) => ({
    id: order.id,
    orderNumber: order.order_code || `A-${100 + order.id}`,
    tableNumber: order.table_number?.replace("T-", "") || "?",
    time: new Date(order.created_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    status: order.status === "pending" ? "new" : order.status,
    items: (order.order_items || []).map((item, index) => {
      const noteText = (item.note || "").toLowerCase();
      const isAllergy = allergyKeywords.some((keyword) =>
        noteText.includes(keyword),
      );

      return {
        id: `${order.id}-${item.id}-${index}`,
        name: item.menu_name,
        quantity: item.quantity,
        note: item.note,
        isAllergy: isAllergy,
      };
    }),
    customerNote: order.customer_note,
    allergies: order.allergies || [],
    type: order.type || "dine_in",
  }));
}

const filteredOrders = computed(() => {
  let result = orders.value;

  if (activeFilter.value === "dine_in") {
    result = result.filter((o) => o.type === "dine_in");
  } else if (activeFilter.value === "allergies") {
    result = result.filter((o) => o.allergies && o.allergies.length > 0);
  }

  return result;
});

async function updateOrderStatus(orderId, nextStatus) {
  console.log(`Updating Database - ID: ${orderId} | Status: ${nextStatus}`);

  // 1. ดึงเวลาปัจจุบัน
  const now = new Date().toISOString();

  // 2. อัปเดต UI ทันที (เพื่อให้การ์ดกระโดดไปคอลัมน์ถัดไปแบบไม่ต้องรอโหลด)
  const orderIndex = orders.value.findIndex((o) => o.id === orderId);
  if (orderIndex !== -1) {
    // ปรับชื่อสถานะให้ตรงกับที่ UI ใช้ (ถ้าเป็น pending ให้ใช้ new)
    orders.value[orderIndex].status =
      nextStatus === "pending" ? "new" : nextStatus;
  }

  // 3. ส่งข้อมูลไปบันทึกที่ Supabase พร้อมกับเวลาที่กดปุ่ม
  const { error } = await supabase
    .from("orders")
    .update({
      status: nextStatus,
      updated_at: now, // บันทึกเวลาล่าสุดลง Database
    })
    .eq("id", orderId);

  if (error) {
    console.error("Update Status Error:", error);
    alert("Update failed: " + error.message);
    // ถ้ายืนยันผิดพลาด ให้ดึงข้อมูลใหม่เพื่อคืนค่าเดิม
    await fetchOrders();
  } else {
    console.log("Update successful!");
    // ดึงข้อมูลมา sync ให้ตรงกับ Database อีกครั้งเพื่อความชัวร์
    await fetchOrders();
  }
}

let channel;
onMounted(() => {
  fetchOrders();

  channel = supabase
    .channel("public:orders")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "orders" },
      () => {
        fetchOrders();
      },
    )
    .subscribe();
});

onUnmounted(() => {
  if (channel) supabase.removeChannel(channel);
});

const columns = computed(() => [
  {
    status: "new",
    title: state.language === "en" ? "New Tasks" : "ออเดอร์ใหม่",
    action: state.language === "en" ? "Start Preparing" : "เริ่มเตรียมอาหาร",
    next: "preparing",
  },
  {
    status: "preparing",
    title: state.language === "en" ? "Preparing" : "กำลังปรุง",
    action: state.language === "en" ? "Mark Ready" : "ปรุงเสร็จแล้ว",
    next: "ready",
  },
  {
    status: "ready",
    title: state.language === "en" ? "Ready for Pickup" : "พร้อมเสิร์ฟ",
    action: state.language === "en" ? "Mark Completed" : "เสิร์ฟเรียบร้อย",
    next: "completed",
  },
  {
    status: "completed",
    title: state.language === "en" ? "Completed" : "เสร็จสิ้น",
    action: "",
    next: "",
  },
]);

const navItems = computed(() => [
  {
    label: state.language === "en" ? "Live Orders" : "ออเดอร์สด",
    to: "/staff/live-orders",
    short: "Orders",
  },
  {
    label: state.language === "en" ? "Menu Items" : "รายการเมนู",
    to: "/staff/menu-items",
    short: "Menu",
  },
  {
    label: state.language === "en" ? "Logout" : "ออกจากระบบ",
    to: "/logout",
    short: "Logout",
  },
]);

const filterButtons = computed(() => [
  { id: "all", en: "All Matches", th: "ทั้งหมด" },
  { id: "dine_in", en: "Dine-In Only", th: "ทานที่ร้าน" },
  { id: "allergies", en: "Allergy Alerts", th: "แจ้งเตือนการแพ้" },
  { id: "ready_soon", en: "Ready Soon", th: "ใกล้เสร็จ" },
]);

const liveCount = computed(
  () =>
    state.orders.filter(
      (order) => !["completed", "cancelled"].includes(order.status),
    ).length,
);

function logout() {
  signOut();
  router.push("/");
}
</script>

<template>
  <div class="page-shell">
    <TopBar
      :search-placeholder="
        state.language === 'en'
          ? 'Search orders, table, or item'
          : 'ค้นหาออเดอร์, โต๊ะ หรือรายการอาหาร'
      "
    />

    <div class="content-shell">
      <SideNav :items="navItems" />

      <main class="main-panel">
        <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 class="text-4xl font-black tracking-tight text-stone-900">
              {{
                state.language === "en"
                  ? "Kitchen Order Tracker"
                  : "ระบบติดตามออเดอร์ห้องครัว"
              }}
            </h1>
            <p class="mt-2 text-muted">
              {{
                state.language === "en"
                  ? "Monitor live incoming orders and update production tracking states."
                  : "จัดการสถานะรายการอาหารที่กำลังสั่งเข้ามาในระบบห้องครัวแบบสดใหม่"
              }}
            </p>
          </div>
        </header>

        <div class="mb-6 flex flex-wrap items-center gap-2">
          <button
            v-for="(btn, idx) in filterButtons"
            :key="btn.id"
            :class="
              idx === 0
                ? 'rounded-full bg-brand px-4 py-2 text-xs font-bold text-white shadow-sm'
                : 'rounded-full bg-white px-4 py-2 text-xs font-medium text-stone-600 shadow-sm transition hover:bg-stone-50'
            "
          >
            {{ state.language === "en" ? btn.en : btn.th }}
          </button>
        </div>

        <section class="grid gap-6 sm:grid-cols-2 xl:grid-cols-4 items-start">
          <div
            v-for="column in columns"
            :key="column.status"
            class="flex flex-col rounded-3xl bg-white p-4 shadow-soft border-2 min-h-[600px] overflow-hidden transition-colors"
            :class="{
              'border-blue-400': column.status === 'new',
              'border-amber-400': column.status === 'preparing',
              'border-emerald-400': column.status === 'ready',
              'border-green-400': column.status === 'completed',
            }"
          >
            <!-- Header Section (ใช้สีโทน 50 เป็น Background) -->
            <div
              class="-mx-4 -mt-4 mb-4 flex items-center justify-between px-4 py-3 border-b-2 transition-colors"
              :class="{
                'bg-blue-50 border-blue-400': column.status === 'new',
                'bg-amber-50 border-amber-400': column.status === 'preparing',
                'bg-emerald-50 border-emerald-400': column.status === 'ready',
                'bg-green-50 border-green-400': column.status === 'completed',
              }"
            >
              <h2
                class="font-black text-sm uppercase flex items-center gap-2"
                :class="{
                  'text-blue-600': column.status === 'new',
                  'text-amber-600': column.status === 'preparing',
                  'text-emerald-600': column.status === 'ready',
                  'text-green-600': column.status === 'completed',
                }"
              >
                {{ column.title }}
              </h2>

              <!-- Badge Section (ใช้สีโทน 100 เป็นพื้นหลัง และโทน 600 เป็นสีตัวอักษร) -->
              <span
                class="px-2.5 py-1 rounded-full text-xs font-bold transition-colors"
                :class="{
                  'bg-blue-100 text-blue-600': column.status === 'new',
                  'bg-amber-100 text-amber-600': column.status === 'preparing',
                  'bg-emerald-100 text-emerald-600': column.status === 'ready',
                  'bg-green-100 text-green-600': column.status === 'completed',
                }"
              >
                {{
                  filteredOrders.filter((o) => o.status === column.status)
                    .length
                }}
              </span>
            </div>

            <!-- Order Cards -->
            <div
              class="flex-1 space-y-4 overflow-y-auto max-h-[700px] px-1 pb-2 scrollbar-hide"
            >
              <article
                v-for="order in state.orders.filter(
                  (order) => order.status === column.status,
                )"
                :key="order.id"
                class="section-card rounded-2xl bg-white p-5 border border-stone-100 transition hover:shadow-md hover:border-stone-200"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h3 class="font-black text-lg text-stone-900">
                      #{{ order.orderNumber }}
                    </h3>
                    <p class="text-xs font-medium text-stone-500 mt-0.5">
                      {{ state.language === "en" ? "Table" : "โต๊ะ" }}
                      {{ order.tableNumber }} &middot; {{ order.time }}
                    </p>
                  </div>
                  <StatusPill :status="order.status" />
                </div>

                <div
                  class="mt-4 space-y-2.5 border-t border-stone-100 pt-3 text-sm text-stone-800"
                >
                  <div
                    v-for="item in order.items"
                    :key="item.name"
                    class="leading-relaxed"
                  >
                    <p class="font-medium">
                      <span class="text-brand font-bold mr-1.5"
                        >{{ item.quantity }}&times;</span
                      >
                      {{ item.name }}
                    </p>
                    <span
                      v-if="item.note"
                      class="mt-0.5 block text-xs font-medium text-amber-700 bg-amber-50 rounded px-2 py-0.5 w-fit"
                    >
                      {{
                        state.language === "en" ? "Mod" : "หมายเหตุเพิ่มเติม"
                      }}: {{ item.note }}
                    </span>
                  </div>
                </div>

                <div
                  v-if="order.allergies.length"
                  class="mt-4 rounded-xl bg-red-50 border border-red-100 p-3 text-xs font-bold text-red-800 shadow-xs"
                >
                  {{
                    state.language === "en"
                      ? "ALLERGY ALERT"
                      : "แจ้งเตือนข้อมูลคนแพ้อาหาร"
                  }}: {{ order.allergies.join(", ") }}
                </div>

                <div class="mt-5 pt-4 border-t border-stone-50">
                  <!-- Action Button (ใช้สีโทน 600 เป็นพื้นหลัง) -->
                  <button
                    v-if="column.action"
                    @click="updateOrderStatus(order.id, column.next)"
                    class="w-full rounded-xl py-2.5 text-xs font-bold text-white transition-all shadow-sm hover:shadow active:scale-95"
                    :class="{
                      'bg-blue-600 hover:bg-blue-700': column.status === 'new',
                      'bg-amber-600 hover:bg-amber-700':
                        column.status === 'preparing',
                      'bg-emerald-600 hover:bg-emerald-700':
                        column.status === 'ready',
                      'bg-green-600 hover:bg-green-700':
                        column.status === 'completed',
                    }"
                  >
                    {{ column.action }}
                  </button>

                  <!-- Completed / End State -->
                  <div
                    v-else
                    class="rounded-xl py-2 text-center text-xs font-bold uppercase transition-colors"
                    :class="{
                      'bg-green-100 text-green-700':
                        column.status === 'completed',
                      'bg-stone-100 text-stone-500':
                        column.status !== 'completed',
                    }"
                  >
                    {{
                      state.language === "en"
                        ? "Archived Out"
                        : "จัดเก็บเรียบร้อย"
                    }}
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>
      </main>
    </div>

    <MobileNav :items="navItems" />
  </div>
</template>
