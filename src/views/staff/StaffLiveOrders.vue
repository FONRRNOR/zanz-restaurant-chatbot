<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import MobileNav from "../../components/MobileNav.vue";
import SideNav from "../../components/SideNav.vue";
import StatusPill from "../../components/StatusPill.vue";
import TopBar from "../../components/TopBar.vue";
import { useAppState } from "../../services/appState";
import { supabase } from "../../supabaseClient";

const router = useRouter();
const { state } = useAppState();

const orders = ref([]);
const activeFilter = ref("all");

const navItems = computed(() => [
  {
    label: state.language === "en" ? "Live Orders" : "ออเดอร์สด",
    to: "/staff/live-orders",
  },
  {
    label: state.language === "en" ? "Menu Items" : "รายการเมนู",
    to: "/staff/menu-items",
  },
  { label: state.language === "en" ? "Logout" : "ออกจากระบบ", to: "/logout" },
]);

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

  const now = new Date().toISOString();

  const orderIndex = orders.value.findIndex((o) => o.id === orderId);
  if (orderIndex !== -1) {
    orders.value[orderIndex].status =
      nextStatus === "pending" ? "new" : nextStatus;
  }

  const { error } = await supabase
    .from("orders")
    .update({
      status: nextStatus,
      updated_at: now,
    })
    .eq("id", orderId);

  if (error) {
    console.error("Update Status Error:", error);
    alert("Update failed: " + error.message);
    await fetchOrders();
  } else {
    console.log("Update successful!");
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
    next: "ready", // Database status set to ready
  },
  {
    status: "ready",
    title: state.language === "en" ? "Ready for Pickup" : "พร้อมเสิร์ฟ",
    action: state.language === "en" ? "Mark Completed" : "เสิร์ฟเรียบร้อย",
    next: "served", // Map to served status
  },
  {
    status: "served", // Display served status column
    title: state.language === "en" ? "Completed" : "เสร็จสิ้น",
    action: "",
    next: "",
  },
]);

const filterButtons = computed(() => [
  { id: "all", en: "All Matches", th: "ทั้งหมด" },
  { id: "dine_in", en: "Dine-In Only", th: "ทานที่ร้าน" },
  { id: "allergies", en: "Allergy Alerts", th: "แจ้งเตือนการแพ้" },
  { id: "ready_soon", en: "Ready Soon", th: "ใกล้เสร็จ" },
]);

function logout() {
  signOut();
  router.push("/");
}
</script>

<template>
  <div class="page-shell">
    <TopBar
      :search-placeholder="state.language === 'en' ? 'Search' : 'ค้นหาออเดอร์'"
    />

    <div class="content-shell flex">
      <SideNav :items="navItems" />

      <main class="main-panel flex-1 p-6">
        <header class="mb-6">
          <h1 class="text-4xl font-black text-stone-900">
            Kitchen Order Tracker
          </h1>
          <h3 class="mt-1 text-md text-stone-500">
            {{
              state.language === "en"
                ? "Monitor live incoming orders and update production tracking states."
                : "ติดตามออเดอร์ที่เข้ามาแบบสด (Real-time) และอัปเดตสถานะการปรุงอาหารในแต่ละขั้นตอน"
            }}
          </h3>
        </header>

        <div class="mb-6 flex flex-wrap gap-2">
          <button
            v-for="btn in filterButtons"
            :key="btn.id"
            @click="activeFilter = btn.id"
            :class="
              activeFilter === btn.id
                ? 'rounded-full bg-brand px-4 py-2 text-xs font-bold text-white shadow-sm'
                : 'rounded-full bg-white px-4 py-2 text-xs font-medium text-stone-600 shadow-sm transition hover:bg-stone-50'
            "
            class="rounded-full px-6 py-2 text-sm font-semibold transition-all duration-200 shadow-sm"
          >
            {{ state.language === "en" ? btn.en : btn.th }}
          </button>
        </div>

        <section class="grid gap-6 sm:grid-cols-2 xl:grid-cols-4 items-start">
          <div
            v-for="column in columns"
            :key="column.status"
            class="flex flex-col rounded-3xl bg-white p-4 shadow-soft border-2 min-h-[600px]"
            :class="{
              'border-blue-400': column.status === 'new',
              'border-amber-400': column.status === 'preparing',
              'border-emerald-500': column.status === 'ready',
              'border-stone-200': column.status === 'completed',
            }"
          >
            <!-- Header Section -->
            <div
              class="mb-4 flex items-center justify-between pb-3 border-b-2 transition-colors"
              :class="{
                'border-blue-400': column.status === 'new',
                'border-amber-400': column.status === 'preparing',
                'border-emerald-500': column.status === 'ready',
                'border-stone-200': column.status === 'completed',
              }"
            >
              <h2
                class="font-black text-sm uppercase"
                :class="{
                  'text-blue-600': column.status === 'new',
                  'text-amber-600': column.status === 'preparing',
                  'text-emerald-600': column.status === 'ready',
                  'text-stone-600': column.status === 'completed',
                }"
              >
                {{ column.title }}
              </h2>

              <span
                class="bg-stone-100 px-2 py-1 rounded-full text-xs font-bold"
                >{{
                  filteredOrders.filter((o) => o.status === column.status)
                    .length
                }}</span
              >
            </div>

            <div class="flex-1 space-y-4 overflow-y-auto max-h-[700px]">
              <article
                v-for="order in filteredOrders.filter(
                  (order) => order.status === column.status,
                )"
                :key="order.id"
                class="section-card rounded-2xl bg-white p-5 border border-stone-100 transition hover:shadow-md"
              >
                <div class="flex justify-between items-start mb-4">
                  <div>
                    <h3 class="font-black text-lg">#{{ order.orderNumber }}</h3>
                    <div class="flex items-center gap-2 mt-0.5">
                      <p class="text-xs text-stone-500 font-medium">
                        Table {{ order.tableNumber }}
                      </p>
                      <span
                        class="text-[10px] font-bold text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded uppercase"
                      >
                        {{ order.time }}
                      </span>
                    </div>
                  </div>
                  <StatusPill :status="order.status" />
                </div>

                <div class="mt-4 pt-3 text-sm">
                  <div
                    v-for="item in order.items"
                    :key="item.id"
                    class="leading-relaxed"
                  >
                    <div class="flex gap-2">
                      <span class="text-brand font-bold"
                        >{{ item.quantity }}×</span
                      >
                      <span
                        :class="[
                          'font-medium transition-colors',
                          item.isAllergy
                            ? 'text-red-600 font-black'
                            : 'text-stone-800',
                        ]"
                      >
                        {{ item.name }}
                      </span>
                    </div>

                    <div
                      v-if="item.note && item.note.trim() !== ''"
                      :class="[
                        'ml-6 text-[11px] italic px-2 py-1 rounded border-l-2 mt-1 transition-colors',
                        item.isAllergy
                          ? 'bg-red-50 border-red-500 text-red-700 font-bold'
                          : 'bg-stone-50 border-stone-200 text-stone-500',
                      ]"
                    >
                      <span class="mr-1 uppercase">
                        {{
                          item.isAllergy
                            ? state.language === "en"
                              ? "Allergy Alert:"
                              : "แจ้งเตือนแพ้อาหาร:"
                            : state.language === "en"
                              ? "Note:"
                              : "หมายเหตุ:"
                        }}
                      </span>
                      {{ item.note }}
                    </div>
                  </div>
                </div>

                <div
                  v-if="order.customerNote && order.customerNote.trim() !== ''"
                  class="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs italic text-amber-900"
                >
                  <span class="font-bold uppercase tracking-wider block mb-1">
                    {{ state.language === "en" ? "Note:" : "หมายเหตุ:" }}
                  </span>
                  &ldquo;{{ order.customerNote }}&rdquo;
                </div>

                <div class="mt-5 pt-4 border-t border-stone-50">
                  <button
                    v-if="column.action"
                    @click="updateOrderStatus(order.id, column.next)"
                    class="w-full rounded-xl py-2.5 text-xs font-bold bg-[#2e7d32] text-white hover:bg-[#428a46]"
                  >
                    {{ column.action }}
                  </button>

                  <div
                    v-else
                    class="rounded-xl bg-stone-100 py-2 text-center text-xs font-bold text-stone-500 uppercase"
                  >
                    {{
                      state.language === "en" ? "Completed" : "จัดเก็บเรียบร้อย"
                    }}
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
