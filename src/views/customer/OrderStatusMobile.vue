<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase } from "../../supabaseClient";
import { ArrowLeft } from "lucide-vue-next";
import { useAppState } from "../../services/appState";

const { state } = useAppState();
const route = useRoute();
const router = useRouter();
const orders = ref([]);
const loading = ref(true);

const tableId = route.params.orderId;

// 🔴 1. เช็คจาก sessionStorage ทันทีตั้งแต่โหลด เพื่อป้องกันการกด Refresh แล้วหลุด
const isSessionExpired = ref(
  sessionStorage.getItem(`expired_${tableId}`) === "true"
);

const t = {
  header: { en: "Order Status", th: "สถานะออเดอร์" },
  orderCode: { en: "Order Code", th: "รหัสออเดอร์" },
  items: { en: "Items", th: "รายการอาหาร" },
  total: { en: "Total", th: "ยอดรวม" },
  noHistory: { en: "No order history found", th: "ไม่พบประวัติการสั่งซื้อ" },
};
const text = (key) => t[key][state.language || "en"];

const fetchOrders = async () => {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("table_number", tableId)
    .neq("status", "paid")
    .order("created_at", { ascending: false });

  if (data) {
    orders.value = data;
  }
  loading.value = false;
};

let subscription;
let tableSessionSubscription;
let removeRouterGuard = null;

const handleSessionExpiredState = () => {
  isSessionExpired.value = true;
  
  // 🔴 2. บันทึกสถานะลงใน sessionStorage เพื่อให้จำได้แม้จะกด Refresh
  sessionStorage.setItem(`expired_${tableId}`, "true");
  
  sessionStorage.clear();
  // เซ็ตค่าหมดอายุกลับไปใหม่หลัง clear เพื่อให้จำสถานะนี้ไว้
  sessionStorage.setItem(`expired_${tableId}`, "true");
  localStorage.removeItem("customer_session");

  if (state) {
    state.cart = [];
    state.tableId = null;
  }

  // ป้องกันการกด Back หรือเปลี่ยนหน้าผ่าน Vue Router
  if (!removeRouterGuard) {
    removeRouterGuard = router.beforeEach((to, from, next) => {
      if (isSessionExpired.value) {
        next(false);
      } else {
        next();
      }
    });
  }

  window.history.pushState(null, "", window.location.href);
};

onMounted(async () => {
  // ถ้าจำจาก sessionStorage ได้ว่าเป็น expired แล้ว ให้ล็อกหน้าจอขอบคุณทันทีไม่ต้องรอโหลด
  if (isSessionExpired.value) {
    handleSessionExpiredState();
    loading.value = false;
    return;
  }

  try {
    const { data: sessionData } = await supabase
      .from("table_sessions")
      .select("status")
      .eq("table_id", tableId)
      .single();

    const { data: activeOrders } = await supabase
      .from("orders")
      .select("id")
      .eq("table_number", tableId)
      .neq("status", "paid")
      .neq("status", "cancelled");

    if (
      sessionData &&
      sessionData.status === "available" &&
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

  // Realtime ดักฟังออเดอร์
  subscription = supabase
    .channel(`order-status-channel-${tableId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `table_number=eq.${tableId}`,
      },
      (payload) => {
        const index = orders.value.findIndex((o) => o.id === payload.new.id);
        if (index !== -1) {
          orders.value[index].status = payload.new.status;
        }
      },
    )
    .subscribe();

  // Realtime ดักฟังเมื่อแอดมินกดเคลียร์โต๊ะ
  tableSessionSubscription = supabase
    .channel(`table_session_sync_${tableId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "table_sessions",
        filter: `table_id=eq.${tableId}`,
      },
      (payload) => {
        if (payload.new.status === "available") {
          handleSessionExpiredState();
        }
      },
    )
    .subscribe();
});

// ดักจับการกดปุ่ม Back ของเบราว์เซอร์
onMounted(() => {
  window.history.pushState(null, "", window.location.href);
  window.addEventListener("popstate", () => {
    if (isSessionExpired.value) {
      window.history.pushState(null, "", window.location.href);
    }
  });
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
</script>

<template>
  <div class="mobile-shell bg-stone-50 min-h-screen p-4 flex flex-col">
    <!-- หน้าจอแสดงผลเมื่อโต๊ะถูกเคลียร์ (Session Expired / Thank You) -->
    <div
      v-if="isSessionExpired"
      class="flex-1 flex flex-col items-center justify-center p-6 text-center bg-stone-50"
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
      <p class="text-stone-600 mb-6">
        {{
          state.language === "th"
            ? "บิลนี้ถูกชำระเงินและโต๊ะถูกเคลียร์เรียบร้อยแล้ว"
            : "This bill has been paid and the table has been cleared."
        }}
      </p>
      <div class="bg-red-50 p-4 rounded-xl border border-red-100">
        <p class="text-red-500 font-semibold text-sm">
          {{
            state.language === "th"
              ? "หากต้องการสั่งอาหารเพิ่ม กรุณาสแกน QR Code ที่โต๊ะใหม่อีกครั้งครับ"
              : "If you would like to order more, please scan the QR code at your table again."
          }}
        </p>
      </div>
    </div>

    <!-- โหลดดิ้ง -->
    <div
      v-else-if="loading"
      class="text-center pt-20 text-stone-500 font-medium"
    >
      Loading...
    </div>

    <!-- เนื้อหาปกติ -->
    <div v-else class="max-w-md mx-auto w-full">
      <header class="flex items-center mb-6">
        <button
          @click="router.back()"
          class="p-2 bg-white rounded-full shadow-sm active:scale-95 transition-transform"
        >
          <ArrowLeft />
        </button>
        <h1 class="ml-4 font-black text-lg text-stone-800">
          {{ text("header") }}
        </h1>
      </header>

      <div v-for="order in orders" :key="order.id" class="mb-8">
        <div
          class="bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden transition-all hover:shadow-md"
        >
          <div
            class="p-6 text-center border-b border-stone-100 border-dashed relative"
          >
            <p class="text-stone-400 text-xs font-bold uppercase mb-2">
              {{ text("orderCode") }}
            </p>
            <h2 class="text-3xl font-black text-stone-900 mb-5">
              {{ order.order_code }}
            </h2>

            <div
              :class="[
                'inline-block px-5 py-2 rounded-full font-black uppercase text-xs tracking-wider shadow-sm transition-colors',
                getStatusColor(order.status),
              ]"
            >
              {{ getStatusText(order.status) }}
            </div>
          </div>

          <div class="p-6">
            <h3 class="font-bold text-stone-800 mb-4">{{ text("items") }}</h3>

            <div class="space-y-3">
              <div
                v-for="item in order.order_items"
                :key="item.id"
                class="flex justify-between py-2 border-b border-stone-50"
              >
                <span class="font-medium text-stone-700">
                  <span class="text-stone-400 font-bold mr-1"
                    >{{ item.quantity }}x</span
                  >
                  {{ item.menu_name }}
                </span>
                <span class="font-semibold text-stone-600">
                  {{ item.price_at_order.toLocaleString() }}
                  {{ state.language === "en" ? "B." : "บ." }}
                </span>
              </div>
            </div>

            <div
              class="flex justify-between mt-6 pt-2 font-black text-lg text-stone-900"
            >
              <span>{{ text("total") }}</span>
              <span
                >{{ order.total_price.toLocaleString() }}
                {{ state.language === "en" ? "B." : "บ." }}</span
              >
            </div>
          </div>
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
