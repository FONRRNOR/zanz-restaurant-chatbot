<script setup>
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase } from "../../supabaseClient";
import { ArrowLeft } from "lucide-vue-next";
import { useAppState } from "../../services/appState";

const { state } = useAppState();
const route = useRoute();
const router = useRouter();
const orders = ref([]);
const loading = ref(true);

// ค้นหาและเปลี่ยนส่วน const tableId = computed(...) ให้อยู่ตามนี้ครับ
const tableId = computed(() => {
  const sessionTab = sessionStorage.getItem("customer_table_id");
  const urlTab = route.params.tableId || route.query.tableId;
  // ถ้ามีข้อมูลใน Session ตรงกับรหัสโต๊ะพื้นฐาน ให้นำไปใช้เพื่อแยกเครื่อง
  if (sessionTab && urlTab && sessionTab.startsWith(urlTab)) {
    return sessionTab;
  }
  return sessionTab || urlTab || route.params.orderId || "";
});

// Resolve restaurant ID with multiple fallbacks
const restaurantId = computed(() => {
  return (
    route.query.restaurantId ||
    route.params.restaurantId ||
    state.restaurantId ||
    sessionStorage.getItem("customer_restaurant_id") ||
    ""
  );
});

// Cache identifiers in session storage to persist across page refreshes
if (restaurantId.value) {
  sessionStorage.setItem("customer_restaurant_id", restaurantId.value);
}
if (tableId.value) {
  sessionStorage.setItem("customer_table_id", tableId.value);
}

// Check if this restaurant and table session is already marked expired
const isSessionExpired = ref(
  sessionStorage.getItem(`expired_${restaurantId.value}_${tableId.value}`) ===
    "true",
);

const t = {
  header: { en: "Order Status", th: "สถานะออเดอร์" },
  orderCode: { en: "Order Code", th: "รหัสออเดอร์" },
  items: { en: "Items", th: "รายการอาหาร" },
  total: { en: "Total", th: "ยอดรวม" },
  noHistory: { en: "No order history found", th: "ไม่พบประวัติการสั่งซื้อ" },
};
const text = (key) => t[key][state.language || "en"];

// Asynchronously fetch active orders for the current table and restaurant
const fetchOrders = async () => {
  if (!tableId.value) {
    loading.value = false;
    return;
  }

  let query = supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("table_number", tableId.value)
    .neq("status", "paid")
    .order("created_at", { ascending: false });

  if (restaurantId.value) {
    query = query.eq("restaurant_id", restaurantId.value);
  }

  const { data, error } = await query;

  if (!error && data) {
    orders.value = data;
  }
  loading.value = false;
};

let subscription;
let tableSessionSubscription;
let removeRouterGuard = null;

// Lock user out when session expires and prevent navigation back
const handleSessionExpiredState = () => {
  isSessionExpired.value = true;
  sessionStorage.setItem("is_table_cleared", "true"); // ซิงค์กับ CustomerMenu

  const resId = restaurantId.value;
  const tabId = tableId.value;
  if (resId && tabId) {
    sessionStorage.setItem(`expired_${resId}_${tabId}`, "true");
    sessionStorage.removeItem(`cart_${resId}_${tabId}`);
  }

  if (state) state.cart = [];

  if (!removeRouterGuard) {
    removeRouterGuard = router.beforeEach((to, from, next) => {
      next(false);
    });
  }

  window.history.pushState(null, "", window.location.href);
  window.onpopstate = function () {
    window.history.pushState(null, "", window.location.href);
  };
};

// Asynchronously verify table session status, fetch orders, and set up Realtime listeners
onMounted(async () => {
  const currentTabId = tableId.value;
  const currentResId = restaurantId.value;

  if (isSessionExpired.value) {
    handleSessionExpiredState();
    loading.value = false;
    return;
  }

  try {
    let sessionQuery = supabase
      .from("table_sessions")
      .select("status")
      .eq("table_id", currentTabId);

    if (currentResId) {
      sessionQuery = sessionQuery.eq("restaurant_id", currentResId);
    }

    const { data: sessionData } = await sessionQuery.maybeSingle();

    let orderQuery = supabase
      .from("orders")
      .select("id")
      .eq("table_number", currentTabId)
      .neq("status", "paid")
      .neq("status", "cancelled");

    if (currentResId) {
      orderQuery = orderQuery.eq("restaurant_id", currentResId);
    }

    const { data: activeOrders } = await orderQuery;

    // Lock session if table is cleared or empty with no active orders
    if (
      sessionData &&
      (sessionData.status === "available" || sessionData.status === "empty") &&
      (!activeOrders || activeOrders.length === 0)
    ) {
      handleSessionExpiredState();
      loading.value = false;
      return;
    }
  } catch (err) {
    console.error("Error checking table session:", err);
  }

  await fetchOrders();

  // Subscribe to Realtime order status updates for this table
  subscription = supabase
    .channel(`order-status-${currentResId}-${currentTabId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `table_number=eq.${currentTabId}`,
      },
      (payload) => {
        if (
          currentResId &&
          payload.new.restaurant_id &&
          payload.new.restaurant_id !== currentResId
        ) {
          return;
        }

        const index = orders.value.findIndex((o) => o.id === payload.new.id);
        if (index !== -1) {
          orders.value[index].status = payload.new.status;
        }
      },
    )
    .subscribe();

  // Subscribe to table session updates and deletions to handle table clearance
  tableSessionSubscription = supabase
    .channel(`session-status-${currentResId}-${currentTabId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "table_sessions",
        filter: `table_id=eq.${currentTabId}`,
      },
      (payload) => {
        if (payload.eventType === "DELETE") {
          handleSessionExpiredState();
          return;
        }

        if (payload.eventType === "UPDATE") {
          if (
            currentResId &&
            payload.new.restaurant_id &&
            payload.new.restaurant_id !== currentResId
          ) {
            return;
          }

          const newStatus = payload.new.status?.toLowerCase();
          if (
            newStatus === "available" ||
            newStatus === "empty" ||
            newStatus === "cleared"
          ) {
            handleSessionExpiredState();
          }
        }
      },
    )
    .subscribe();
});

onUnmounted(() => {
  if (subscription) supabase.removeChannel(subscription);
  if (tableSessionSubscription)
    supabase.removeChannel(tableSessionSubscription);
  if (removeRouterGuard) removeRouterGuard();
  window.onpopstate = null;
});

const getStatusColor = (status) => {
  switch (status?.toLowerCase()) {
    case "pending":
    case "new":
      return "bg-blue-100 text-blue-700 ring-2 ring-blue-400/20";
    case "cooking":
    case "preparing":
      return "bg-amber-100 text-amber-700 ring-2 ring-amber-400/20";
    case "ready":
      return "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-400/20";
    case "served":
    case "completed":
      return "bg-green-100 text-green-700 ring-2 ring-green-400/20";
    case "cancelled":
      return "bg-red-100 text-red-700 ring-2 ring-red-400/20";
    default:
      return "bg-stone-100 text-stone-600";
  }
};

const getStatusText = (status) => {
  const s = status?.toLowerCase();
  if (state.language === "th") {
    if (s === "pending" || s === "new") return "ออเดอร์ใหม่";
    if (s === "cooking" || s === "preparing") return "กำลังปรุง";
    if (s === "ready") return "พร้อมเสิร์ฟ";
    if (s === "served" || s === "completed") return "เสร็จสิ้น";
    if (s === "cancelled") return "ยกเลิกแล้ว";
  } else {
    if (s === "pending") return "New";
    if (s === "cooking") return "Preparing";
    if (s === "ready") return "Ready";
    if (s === "served") return "Completed";
    if (s === "cancelled") return "Cancelled";
  }
  return status;
};

const handleBack = () => {
  if (isSessionExpired.value) return;

  if (restaurantId.value && tableId.value) {
    router.push({
      path: "/customer/menu/mobile",
      query: {
        restaurantId: restaurantId.value,
        tableId: tableId.value,
      },
    });
  } else {
    router.back();
  }
};
</script>

<template>
  <div
    class="mobile-shell bg-stone-100 min-h-screen p-4 flex flex-col font-sans"
  >
    <!-- Session Expired Lock Screen -->
    <div
      v-if="isSessionExpired"
      class="flex-1 flex flex-col items-center justify-center p-6 text-center bg-stone-50 rounded-3xl shadow-sm my-auto"
    >
      <div
        class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 shadow-sm"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-10 w-10 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <h1 class="text-2xl font-bold text-stone-800 mb-2">
        {{
          state.language === "th"
            ? "ขอบคุณที่ใช้บริการครับ"
            : "Thank you for dining with us"
        }}
      </h1>
      <p class="text-stone-600 mb-6 text-sm">
        {{
          state.language === "th"
            ? "บิลนี้ถูกชำระเงินและโต๊ะถูกเคลียร์เรียบร้อยแล้ว"
            : "This bill has been paid and the table has been cleared."
        }}
      </p>
      <div class="bg-red-50 p-4 rounded-xl border border-red-100">
        <p class="text-red-500 font-semibold text-xs">
          {{
            state.language === "th"
              ? "หากต้องการสั่งอาหารเพิ่ม กรุณาสแกน QR Code ที่โต๊ะใหม่อีกครั้งครับ"
              : "If you would like to order more, please scan the QR code at your table again."
          }}
        </p>
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-else-if="loading"
      class="text-center pt-20 text-stone-500 font-medium"
    >
      Loading...
    </div>

    <!-- Receipt Style Order List -->
    <div v-else class="max-w-md mx-auto w-full pb-10">
      <header class="flex items-center mb-6">
        <button
          @click="handleBack"
          class="p-2 bg-white rounded-full shadow-sm active:scale-95 transition-transform text-stone-700"
        >
          <ArrowLeft class="w-5 h-5" />
        </button>
        <h1 class="ml-4 font-black text-lg text-stone-800">
          {{ text("header") }}
        </h1>
      </header>

      <!-- Loop Through Receipts -->
      <div
        v-for="order in orders"
        :key="order.id"
        class="mb-8 filter drop-shadow-sm"
      >
        <!-- Receipt Container -->
        <div
          class="bg-white rounded-t-2xl border border-stone-200 overflow-hidden relative"
        >
          <!-- Receipt Header -->
          <div
            class="p-6 text-center border-b-2 border-stone-200 border-dashed relative bg-stone-50/50"
          >
            <span
              class="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-stone-200 text-stone-600 text-[10px] px-3 py-0.5 rounded-full font-mono font-bold tracking-widest shadow-2xs"
            >
              RECEIPT
            </span>
            <p
              class="text-stone-400 text-xs font-bold uppercase mb-1 tracking-wider"
            >
              {{ text("orderCode") }}
            </p>
            <h2
              class="text-3xl font-black text-stone-900 mb-4 font-mono tracking-tight"
            >
              {{ order.order_code }}
            </h2>

            <div
              :class="[
                'inline-block px-4 py-1.5 rounded-full font-black uppercase text-xs tracking-wider shadow-2xs transition-colors',
                getStatusColor(order.status),
              ]"
            >
              {{ getStatusText(order.status) }}
            </div>
          </div>

          <!-- Receipt Items List -->
          <div class="p-6">
            <h3 class="font-bold text-stone-800 mb-3 text-sm tracking-wide">
              {{ text("items") }}
            </h3>

            <div class="space-y-3">
              <div
                v-for="item in order.order_items"
                :key="item.id"
                class="flex justify-between items-start py-1.5 border-b border-stone-100 text-sm"
              >
                <span class="font-medium text-stone-700 pr-2">
                  <span class="text-stone-400 font-bold mr-1.5 font-mono"
                    >{{ item.quantity }}x</span
                  >
                  {{ item.menu_name }}
                </span>
                <span
                  class="font-semibold text-stone-600 font-mono whitespace-nowrap"
                >
                  {{ item.price_at_order?.toLocaleString() }}
                  {{ state.language === "en" ? "Baht." : "บาท." }}
                </span>
              </div>
            </div>

            <!-- Total Price -->
            <div
              class="flex justify-between items-center mt-6 pt-4 border-t border-stone-200 border-dashed text-stone-900"
            >
              <span class="font-bold text-base">{{ text("total") }}</span>
              <span class="font-black text-xl font-mono text-emerald-600">
                {{ order.total_price?.toLocaleString() }}
                {{ state.language === "en" ? "Baht." : "บาท." }}
              </span>
            </div>
          </div>
        </div>

        <!-- Receipt Bottom Jagged Edge -->
        <div
          class="h-3 w-full bg-white rounded-b-lg relative overflow-hidden shadow-sm"
        >
          <div
            class="absolute inset-0 bg-[radial-gradient(circle,_transparent_50%,_#f5f5f4_50%)] bg-[length:12px_12px] rotate-180 translate-y-1"
          ></div>
        </div>
      </div>

      <div
        v-if="orders.length === 0"
        class="text-center text-stone-500 bg-white p-8 rounded-3xl border border-stone-200 shadow-sm"
      >
        {{ text("noHistory") }}
      </div>
    </div>
  </div>
</template>
