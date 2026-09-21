<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import MobileNav from "../../components/common/MobileNav.vue";
import SideNav from "../../components/common/SideNav.vue";
import StatusPill from "../../components/common/StatusPill.vue";
import TopBar from "../../components/common/TopBar.vue";
import IncomingOrderModal from "../../components/order/IncomingOrderModal.vue";
import { useAppState } from "../../services/appState";
import { supabase } from "../../supabaseClient";
import { useIncomingOrderModal } from "../../composables/useIncomingOrderModal";

const router = useRouter();
const { state, signOut } = useAppState();

// Destructure incoming order modal handler and audio unlock from composable
const { showNewOrderModal, unlockAudio } = useIncomingOrderModal();

const orders = ref([]);
const activeFilter = ref("all");
const restaurantId = ref("");

// Asynchronously fetch active orders with line items and format for display
async function fetchOrders() {
  if (!restaurantId.value) return;

  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items (*)")
    .eq("restaurant_id", restaurantId.value)
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

      let displayName = item.menu_name;
      if (state.language === "th") {
        displayName = item.menu_name_th || item.name_th || item.menu_name;
      } else {
        displayName = item.menu_name || item.name;
      }

      return {
        id: `${order.id}-${item.id}-${index}`,
        name: displayName,
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

// Asynchronously fetch details for an incoming order and trigger the countdown alert modal
async function triggerNewOrderAlert(orderId) {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items (*)")
    .eq("id", orderId)
    .single();

  if (error || !data) return;

  const modalData = {
    raw_id: data.id,
    order_id: data.order_code || `A-${100 + data.id}`,
    customer_name: data.customer_name || "Dine-in Customer",
    table_number: data.table_number?.replace("T-", "") || "?",
    order_time: new Date(data.created_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    items: (data.order_items || []).map((item) => {
      let displayName = item.menu_name;
      if (state.language === "th") {
        displayName = item.menu_name_th || item.name_th || item.menu_name;
      }
      return {
        name: displayName,
        quantity: item.quantity,
        note: item.note || "-",
      };
    }),
  };

  showNewOrderModal(modalData, 60);
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

// Asynchronously update order status in Supabase and refresh local order state
async function updateOrderStatus(orderId, nextStatus) {
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
    await fetchOrders();
  }
}

let channel = null;

function setupRealtimeSubscription(resId) {
  if (!resId) return;

  if (channel) {
    supabase.removeChannel(channel);
  }

  channel = supabase
    .channel(`staff-orders-${resId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `restaurant_id=eq.${resId}`,
      },
      (payload) => {
        if (payload.eventType === "INSERT") {
          const newStatus = payload.new.status;
          if (!newStatus || newStatus === "pending" || newStatus === "new") {
            triggerNewOrderAlert(payload.new.id);
          }
        }
        fetchOrders();
      },
    )
    .subscribe();
}

onMounted(() => {
  // Listen for initial user interaction to unlock audio playback restrictions on iPad
  const unlockOnInteraction = () => {
    if (typeof unlockAudio === "function") unlockAudio();
  };

  window.addEventListener("touchstart", unlockOnInteraction, { once: true });
  window.addEventListener("click", unlockOnInteraction, { once: true });

  const savedUserJson = sessionStorage.getItem("zank-active-user");
  if (savedUserJson) {
    try {
      const localUser = JSON.parse(savedUserJson);
      restaurantId.value = localUser.restaurant_id || "";
    } catch (e) {
      console.error("Error parsing user session:", e);
    }
  }

  if (!restaurantId.value && state.activeUser) {
    restaurantId.value = state.activeUser.restaurant_id || "";
  }

  if (restaurantId.value) {
    fetchOrders();
    setupRealtimeSubscription(restaurantId.value);
  }
});

watch(restaurantId, (newId) => {
  if (newId) {
    fetchOrders();
    setupRealtimeSubscription(newId);
  }
});

// Re-fetch orders to refresh language-specific menu item names when language changes
watch(
  () => state.language,
  () => {
    if (restaurantId.value) {
      fetchOrders();
    }
  },
);

onUnmounted(() => {
  if (channel) {
    supabase.removeChannel(channel);
  }
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
            v-for="btn in filterButtons"
            :key="btn.id"
            @click="activeFilter = btn.id"
            :class="
              activeFilter === btn.id
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
            class="flex flex-col rounded-2xl bg-stone-50/60 p-3 border border-stone-200/60 min-h-[600px] overflow-hidden"
          >
            <!-- Column Header with Status Dot -->
            <div
              class="-mx-3 -mt-3 mb-3 flex items-center justify-between px-4 py-3 bg-white border-b border-stone-200/60"
            >
              <div class="flex items-center gap-2">
                <span
                  class="w-3 h-3 rounded-full"
                  :class="{
                    'bg-blue-500': column.status === 'new',
                    'bg-amber-500': column.status === 'preparing',
                    'bg-emerald-500': column.status === 'ready',
                    'bg-stone-400': column.status === 'completed',
                  }"
                ></span>
                <h2
                  class="font-bold text-sm uppercase tracking-wide text-stone-700"
                >
                  {{ column.title }}
                </h2>
              </div>

              <span
                class="px-2 py-0.5 rounded-full text-sm font-semibold bg-stone-100 text-stone-600"
              >
                {{
                  filteredOrders.filter((o) => o.status === column.status)
                    .length
                }}
              </span>
            </div>

            <!-- Order Cards -->
            <div
              class="flex-1 space-y-3 overflow-y-auto max-h-[700px] px-0.5 pb-2 scrollbar-hide border-stone-200/60"
            >
              <article
                v-for="order in filteredOrders.filter(
                  (order) => order.status === column.status,
                )"
                :key="order.id"
                class="rounded-xl bg-white p-4 border border-stone-300 shadow-2xs transition hover:border-stone-600"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h3 class="font-bold text-base text-stone-900">
                      #{{ order.orderNumber }}
                    </h3>
                    <p class="text-sm text-stone-500 mt-2">
                      {{ state.language === "en" ? "Table" : "โต๊ะ" }}
                      {{ order.tableNumber }} &middot; {{ order.time }}
                    </p>
                  </div>
                  <StatusPill :status="order.status" />
                </div>

                <div
                  class="mt-4 space-y-3 border-t border-stone-100 pt-3 text-sm text-stone-800"
                >
                  <div
                    v-for="item in order.items"
                    :key="item.id"
                    class="bg-white p-3 rounded-xl border border-stone-200/60 shadow-2xs space-y-2"
                  >
                    <!-- Quantity and Item Name Row -->
                    <div class="flex items-center gap-3">
                      <span
                        class="bg-amber-400 text-stone-950 font-black text-sm px-2.5 py-1 rounded-lg flex-shrink-0 text-center min-w-[36px]"
                      >
                        {{ item.quantity }}&times;
                      </span>

                      <span
                        class="font-medium text-base text-stone-900 leading-snug tracking-tight"
                      >
                        {{ item.name }}
                      </span>
                    </div>

                    <!-- Item Note Row -->
                    <div
                      v-if="item.note"
                      class="text-xs font-semibold text-stone-700 bg-amber-50 border border-amber-200/70 rounded-lg px-2.5 py-1.5 w-full flex items-center gap-1.5"
                    >
                      <span class="text-amber-700 font-bold">
                        {{
                          state.language === "en" ? "Note" : "หมายเหตุ"
                        }}:</span
                      >
                      <span>{{ item.note }}</span>
                    </div>
                  </div>
                </div>

                <div
                  v-if="order.allergies.length"
                  class="mt-3 rounded-lg bg-red-50 border border-red-200 p-2.5 text-sm font-semibold text-red-700"
                >
                  {{
                    state.language === "en"
                      ? "ALLERGY ALERT"
                      : "แจ้งเตือนคนแพ้อาหาร"
                  }}: {{ order.allergies.join(", ") }}
                </div>

                <div class="mt-4 pt-3 border-t border-stone-100">
                  <button
                    v-if="column.action"
                    @click="updateOrderStatus(order.id, column.next)"
                    class="w-full rounded-xl py-2.5 px-4 text-xs font-bold text-white bg-brand hover:bg-brand/90 active:scale-[0.98] transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>{{ column.action }}</span>
                    <span class="text-white/70 font-normal">→</span>
                  </button>

                  <div
                    v-else
                    class="rounded-lg py-1.5 text-center text-xs font-medium text-stone-400 bg-stone-100 uppercase"
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

    <IncomingOrderModal />
  </div>
</template>
