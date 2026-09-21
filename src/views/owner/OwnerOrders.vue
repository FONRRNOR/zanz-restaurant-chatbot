<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import { supabase } from "../../supabaseClient";
import { useAppState } from "../../services/appState";

import MobileNav from "../../components/common/MobileNav.vue";
import SideNav from "../../components/common/SideNav.vue";
import StatusPill from "../../components/common/StatusPill.vue";
import TopBar from "../../components/common/TopBar.vue";

const { state } = useAppState();
const orders = ref([]);
const selected = ref(null);
const filter = ref("active");
const loading = ref(true);
const restaurantId = ref("");
let realTimeSubscription = null;

// Modal States
const showCheckoutModal = ref(false);
const paymentMethod = ref("qr"); // 'qr' or 'cash'
const isProcessingPayment = ref(false);
const paymentSuccess = ref(false);

// Phone number or Citizen ID linked to store PromptPay
const promptpayId = ref("0987674247");

const ownerNav = [
  { label: "Dashboard", to: "/owner/dashboard", short: "Home" },
  { label: "Menu Management", to: "/owner/menu-management", short: "Menu" },
  { label: "Orders", to: "/owner/orders" },
  { label: "Staff Accounts", to: "/owner/staff-accounts", short: "Staff" },
  { label: "Logout", to: "/logout", short: "Logout" },
];

const statuses = ["active", "kitchen", "ready", "completed", "paid"];
const steps = ["new", "preparing", "ready", "completed"];

function mapDbStatusToUi(dbStatus) {
  const mapping = {
    pending: "new",
    preparing: "preparing",
    ready: "ready",
    served: "completed",
    paid: "paid",
    cancelled: "cancelled",
  };
  return mapping[dbStatus] || dbStatus;
}

function mapUiStatusToDb(uiStatus) {
  const mapping = {
    new: "pending",
    preparing: "preparing",
    ready: "ready",
    completed: "served",
    paid: "paid",
  };
  return mapping[uiStatus] || uiStatus;
}

function formatOrder(dbOrder) {
  const dbItems = dbOrder.order_items || [];

  const formattedItems = dbItems.map((item) => {
    let itemPrice = parseFloat(item.price_at_order || item.price || 0);

    return {
      name:
        item.menu_name ||
        (state.language === "en" ? "Unknown Item" : "ไม่ระบุชื่อเมนู"),
      quantity: parseInt(item.quantity || 1),
      price: itemPrice,
      note: item.note || "",
    };
  });

  const allergyList = [];

  return {
    id: dbOrder.id,
    orderNumber: dbOrder.order_code || dbOrder.id,
    tableNumber: dbOrder.table_number || "N/A",
    status: mapDbStatusToUi(dbOrder.status),
    allergies: allergyList,
    items: formattedItems,
    customerNote: dbOrder.customer_note || "",
    totalPrice: parseFloat(dbOrder.total_price || 0),
    time: new Date(dbOrder.created_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    raw: dbOrder,
  };
}

// Asynchronously fetch order list with items from Supabase
async function fetchOrders() {
  if (!restaurantId.value) return;

  loading.value = true;
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("restaurant_id", restaurantId.value)
    .order("created_at", { ascending: true });

  if (!error && data) {
    orders.value = data.map(formatOrder);
    const currentFiltered = getFilteredArray(orders.value, filter.value);

    if (selected.value) {
      const updatedSelected = orders.value.find(
        (o) => o.id === selected.value.id,
      );
      if (updatedSelected) {
        selected.value = updatedSelected;
      } else {
        selected.value = currentFiltered.length > 0 ? currentFiltered[0] : null;
      }
    } else if (currentFiltered.length > 0) {
      selected.value = currentFiltered[0];
    }
  } else {
    console.error("Error fetching orders:", error);
  }
  loading.value = false;
}

// Asynchronously advance order status to next step in database
async function updateOrderStatus(orderId, currentUiStatus) {
  const currentIdx = steps.indexOf(currentUiStatus);
  if (currentIdx >= steps.length - 1) return;

  const nextUiStatus = steps[currentIdx + 1];
  const nextDbStatus = mapUiStatusToDb(nextUiStatus);

  const orderIndex = orders.value.findIndex((o) => o.id === orderId);
  if (orderIndex !== -1) orders.value[orderIndex].status = nextUiStatus;
  if (selected.value && selected.value.id === orderId)
    selected.value.status = nextUiStatus;

  const { error } = await supabase
    .from("orders")
    .update({ status: nextDbStatus })
    .eq("id", orderId);

  if (error) {
    console.error("Error updating status:", error);
    fetchOrders();
  }
}

// Asynchronously mark order as cancelled in database
async function cancelOrder(orderId) {
  const confirmCancel = confirm(
    state.language === "en"
      ? "Are you sure you want to cancel this order?"
      : "คุณแน่ใจหรือไม่ที่จะยกเลิกคำสั่งซื้อนี้?",
  );
  if (!confirmCancel) return;

  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId);

  if (!error) {
    fetchOrders();
  } else {
    console.error("Error cancelling order:", error);
  }
}

function getStatusLabel(statusKey) {
  const labels = {
    active: state.language === "en" ? "Active" : "ปัจจุบัน (ทั้งหมด)",
    kitchen: state.language === "en" ? "Kitchen" : "ในครัว (ใหม่/กำลังทำ)",
    ready: state.language === "en" ? "To Serve" : "รอเสิร์ฟ",
    completed: state.language === "en" ? "To Pay" : "รอเช็คบิล",
    paid: state.language === "en" ? "History" : "ประวัติ (จ่ายแล้ว)",
  };
  return labels[statusKey?.toLowerCase()] || statusKey;
}

function getFilteredArray(allOrders, currentFilter) {
  return allOrders.filter((order) => {
    if (currentFilter === "active")
      return order.status !== "paid" && order.status !== "cancelled";

    if (currentFilter === "kitchen")
      return order.status === "new" || order.status === "preparing";

    return order.status === currentFilter;
  });
}

const filteredOrders = computed(() =>
  getFilteredArray(orders.value, filter.value),
);

const counts = computed(() => ({
  new: orders.value.filter((order) => order.status === "new").length,
  preparing: orders.value.filter((order) => order.status === "preparing")
    .length,
  ready: orders.value.filter((order) => order.status === "ready").length,
  completed: orders.value.filter((order) => order.status === "completed")
    .length,
  paid: orders.value.filter((order) => order.status === "paid").length,
}));

const orderTotal = computed(() =>
  selected.value ? selected.value.totalPrice : 0,
);

const canCancel = computed(
  () =>
    selected.value &&
    !["completed", "cancelled", "paid"].includes(selected.value.status),
);

const canAdvance = computed(
  () =>
    selected.value &&
    steps.indexOf(selected.value.status) < steps.length - 1 &&
    selected.value.status !== "cancelled",
);

// Asynchronously revert order status to previous step in database
async function rollbackOrderStatus(orderId, currentUiStatus) {
  const currentIdx = steps.indexOf(currentUiStatus);
  if (currentIdx <= 0) return;

  const prevUiStatus = steps[currentIdx - 1];
  const prevDbStatus = mapUiStatusToDb(prevUiStatus);

  const orderIndex = orders.value.findIndex((o) => o.id === orderId);
  if (orderIndex !== -1) orders.value[orderIndex].status = prevUiStatus;
  if (selected.value) selected.value.status = prevUiStatus;

  const { error } = await supabase
    .from("orders")
    .update({ status: prevDbStatus })
    .eq("id", orderId);

  if (error) {
    console.error("Error rolling back status:", error);
    fetchOrders();
  }
}

const canRollback = computed(
  () =>
    selected.value &&
    steps.indexOf(selected.value.status) > 0 &&
    selected.value.status !== "paid" &&
    selected.value.status !== "cancelled",
);

function openCheckoutModal() {
  if (!selected.value) return;
  paymentMethod.value = "qr";
  paymentSuccess.value = false;
  isProcessingPayment.value = false;
  showCheckoutModal.value = true;
}

function closeCheckoutModal() {
  if (isProcessingPayment.value && !paymentSuccess.value) return;
  showCheckoutModal.value = false;
}

// Asynchronously process order checkout, set paid status, and clear table session via RPC
async function confirmPayment() {
  if (!selected.value) return;
  isProcessingPayment.value = true;

  try {
    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: "paid" })
      .eq("id", selected.value.id);

    if (updateError) throw updateError;

    const targetTableId =
      selected.value.raw.table_id || selected.value.raw.table_number;
    const targetRestaurantId =
      selected.value.raw.restaurant_id || restaurantId.value;

    const { error: rpcError } = await supabase.rpc("clear_table_session", {
      p_table_id: targetTableId,
      p_restaurant_id: targetRestaurantId,
    });

    if (rpcError) throw rpcError;

    paymentSuccess.value = true;
    setTimeout(() => {
      showCheckoutModal.value = false;
      if (filter.value === "active" || filter.value === "completed") {
        selected.value = null;
      }
      fetchOrders();
    }, 2000);
  } catch (err) {
    console.error("Error clearing table:", err);
    alert(
      state.language === "en"
        ? "Error processing payment. Check console for details."
        : "เกิดข้อผิดพลาดในการชำระเงิน ดูรายละเอียดใน Console",
    );
    isProcessingPayment.value = false;
  }
}

onMounted(() => {
  const savedLanguage = localStorage.getItem("zank-language");
  if (savedLanguage) {
    state.language = savedLanguage;
  }

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

  fetchOrders();

  if (restaurantId.value) {
    realTimeSubscription = supabase
      .channel(`public:orders-${restaurantId.value}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId.value}`,
        },
        () => fetchOrders(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items" },
        () => fetchOrders(),
      )
      .subscribe();
  }
});

onUnmounted(() => {
  if (realTimeSubscription) {
    supabase.removeChannel(realTimeSubscription);
  }
});
</script>

<template>
  <div class="page-shell">
    <TopBar owner search-placeholder="Search order number, table, or item" />
    <div class="content-shell">
      <SideNav :items="ownerNav" />
      <main class="main-panel relative">
        <h1 class="text-4xl font-black">
          {{
            state.language === "en" ? "Order Management" : "การจัดการคำสั่งซื้อ"
          }}
        </h1>
        <p class="mt-2 text-muted">
          {{
            state.language === "en"
              ? "Monitor customer orders and review order details."
              : "ตรวจสอบสถานะคำสั่งซื้อจากลูกค้าและดูรายละเอียดประวัติรายการอาหาร"
          }}
        </p>

        <section
          class="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-5"
        >
          <article class="section-card p-5 flex flex-col justify-between">
            <p class="text-sm font-bold capitalize text-muted">
              {{ state.language === "en" ? "New Orders" : "ออเดอร์ใหม่" }}
            </p>
            <strong class="text-3xl font-black text-emerald-800 mt-2 block">{{
              counts.new
            }}</strong>
          </article>
          <article class="section-card p-5 flex flex-col justify-between">
            <p class="text-sm font-bold capitalize text-muted">
              {{ state.language === "en" ? "Preparing" : "กำลังปรุง" }}
            </p>
            <strong class="text-3xl font-black text-emerald-800 mt-2 block">{{
              counts.preparing
            }}</strong>
          </article>
          <article class="section-card p-5 flex flex-col justify-between">
            <p class="text-sm font-bold capitalize text-muted">
              {{ state.language === "en" ? "Ready to Serve" : "พร้อมเสิร์ฟ" }}
            </p>
            <strong class="text-3xl font-black text-emerald-800 mt-2 block">{{
              counts.ready
            }}</strong>
          </article>
          <article class="section-card p-5 flex flex-col justify-between">
            <p class="text-sm font-bold capitalize text-muted">
              {{ state.language === "en" ? "To Pay" : "รอเช็คบิล" }}
            </p>
            <strong class="text-3xl font-black text-emerald-800 mt-2 block">{{
              counts.completed
            }}</strong>
          </article>
          <article class="section-card p-5 flex flex-col justify-between">
            <p class="text-sm font-bold capitalize text-muted">
              {{ state.language === "en" ? "Paid" : "จ่ายเงินแล้ว" }}
            </p>
            <strong class="text-3xl font-black text-emerald-800 mt-2 block">{{
              counts.paid
            }}</strong>
          </article>
        </section>

        <!-- Filter Tab -->
        <div class="mt-6 flex flex-wrap gap-2">
          <button
            v-for="status in statuses"
            :key="status"
            class="rounded-full px-5 py-2.5 text-sm font-bold border border-stone-100/50 transition hover:opacity-90 active:scale-95"
            :class="
              filter === status
                ? 'bg-softGreen text-brand ring-2 ring-brand/10'
                : 'bg-white text-muted'
            "
            @click="
              filter = status;
              selected = null;
              fetchOrders();
            "
          >
            {{ getStatusLabel(status) }}
          </button>
        </div>

        <section class="mt-8 grid gap-8 xl:grid-cols-[1fr_420px] items-start">
          <!-- Left side: order list -->
          <article
            class="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-140px)]"
          >
            <!-- Header Sticky -->
            <div
              class="px-6 py-5 border-b border-stone-200 bg-stone-50/80 flex justify-between items-center sticky top-0 z-10"
            >
              <h3 class="font-black text-stone-800 text-lg">
                {{
                  state.language === "en" ? "Incoming Orders" : "รายการออเดอร์"
                }}
              </h3>
              <span
                class="bg-red-600 text-white text-md font-bold px-3 py-1 rounded-full"
              >
                {{ filteredOrders.length }}
              </span>
            </div>

            <!-- Scrollable orders box -->
            <div class="flex-1 overflow-y-auto custom-scrollbar">
              <div
                v-if="filteredOrders.length === 0"
                class="p-10 text-center text-stone-400 font-bold"
              >
                {{
                  state.language === "en"
                    ? "No orders found."
                    : "ไม่พบรายการออเดอร์"
                }}
              </div>
              <button
                v-else
                v-for="order in filteredOrders"
                :key="order.id"
                @click="selected = order"
                class="group relative w-full p-5 border-b border-stone-100 flex items-center justify-between transition-all duration-200 text-left"
                :class="[
                  selected?.id === order.id
                    ? 'bg-brand/5'
                    : 'bg-white hover:bg-stone-50',
                  order.status === 'paid' ? 'opacity-70' : '',
                ]"
              >
                <div
                  class="absolute left-0 top-0 bottom-0 w-1.5 transition-all"
                  :class="[
                    selected?.id === order.id ? 'bg-brand' : 'bg-transparent',
                    order.status === 'new' && selected?.id !== order.id
                      ? 'bg-emerald-400'
                      : '',
                  ]"
                ></div>

                <div class="flex items-center gap-4 pl-2 w-full">
                  <div
                    class="w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 shadow-sm border transition-colors"
                    :class="[
                      selected?.id === order.id
                        ? 'bg-brand text-white border-brand'
                        : 'bg-stone-50 text-stone-700 border-stone-200 group-hover:border-stone-300',
                    ]"
                  >
                    <span
                      class="text-[9px] font-black uppercase tracking-wider opacity-80 mb-[-4px]"
                    >
                      {{ state.language === "en" ? "Table" : "โต๊ะ" }}
                    </span>
                    <span class="text-xl font-black">
                      {{ order.tableNumber.replace("T-", "") }}
                    </span>
                  </div>

                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <p
                        class="font-extrabold text-stone-900 text-base truncate"
                      >
                        #{{ order.orderNumber }}
                      </p>
                      <span
                        v-if="order.allergies?.length"
                        class="text-red-500 text-xs ml-2"
                        title="Allergy Alert"
                        >Allergy Alert</span
                      >
                    </div>

                    <div
                      class="flex items-center gap-2 text-xs font-semibold text-stone-500"
                    >
                      <span class="flex items-center gap-1.5">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          class="opacity-70"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        {{ order.time }}
                      </span>
                      <span class="w-1 h-1 rounded-full bg-stone-300"></span>
                      <span class="flex items-center gap-1.5 text-brand">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          class="opacity-70"
                        >
                          <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
                          <path d="M7 2v20" />
                          <path
                            d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"
                          />
                        </svg>
                        {{ order.items.length }}
                        {{ state.language === "en" ? "Items" : "รายการ" }}
                      </span>
                    </div>
                  </div>
                </div>

                <div class="shrink-0 ml-2">
                  <StatusPill :status="order.status" />
                </div>
              </button>
            </div>
          </article>

          <!-- Right side: order detail view -->
          <aside
            v-if="selected"
            class="sticky top-24 bg-white rounded-3xl p-8 shadow-strong border border-stone-100 h-[calc(100vh-140px)] flex flex-col"
          >
            <div
              class="border-b border-stone-100 pb-4 mb-4 flex justify-between items-start"
            >
              <div>
                <h2 class="text-2xl font-black text-stone-900">
                  #{{ selected.orderNumber }}
                </h2>
                <p class="text-sm font-bold text-brand mt-1 uppercase">
                  {{ state.language === "en" ? "Table:" : "โต๊ะ:" }}
                  {{ selected.tableNumber }}
                </p>
              </div>

              <div
                v-if="['completed', 'paid'].includes(selected.status)"
                class="px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase flex items-center gap-1 mt-1"
                :class="
                  selected.status === 'paid'
                    ? 'bg-stone-200 text-stone-600'
                    : 'bg-emerald-100 text-emerald-700'
                "
              >
                <svg
                  class="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="3"
                    d="M5 13l4 4L19 7"
                  ></path>
                </svg>
                {{
                  selected.status === "paid"
                    ? state.language === "en"
                      ? "Paid / History"
                      : "จ่ายเงินแล้ว"
                    : state.language === "en"
                      ? "Completed"
                      : "เสร็จสิ้น"
                }}
              </div>
              <div
                v-if="selected.status === 'cancelled'"
                class="px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase flex items-center gap-1 mt-1 bg-red-100 text-red-700"
              >
                {{ state.language === "en" ? "Cancelled" : "ยกเลิกแล้ว" }}
              </div>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
              <div
                v-if="selected.status === 'completed'"
                class="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center gap-3 animate-in fade-in duration-300"
              >
                <div
                  class="bg-emerald-200/50 p-2 rounded-full text-emerald-600 shrink-0"
                >
                  <svg
                    class="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.5"
                      d="M5 13l4 4L19 7"
                    ></path>
                  </svg>
                </div>
                <div>
                  <h3 class="font-black text-emerald-800 text-sm">
                    {{
                      state.language === "en"
                        ? "All items have been served!"
                        : "เสิร์ฟอาหารครบทุกรายการแล้ว!"
                    }}
                  </h3>
                  <p class="text-xs font-semibold text-emerald-600/80 mt-0.5">
                    {{
                      state.language === "en"
                        ? "This order is fully completed."
                        : "ออเดอร์นี้เสร็จสมบูรณ์เรียบร้อย ไม่มีรายการค้าง"
                    }}
                  </p>
                </div>
              </div>

              <div
                v-if="selected.allergies?.length"
                class="p-4 rounded-2xl bg-red-50 text-red-700 text-sm font-bold border border-red-100"
              >
                {{
                  state.language === "en"
                    ? "Allergy Alert:"
                    : "แจ้งเตือนอาการแพ้:"
                }}
                {{ selected.allergies.join(", ") }}
              </div>

              <div class="space-y-3">
                <div
                  v-for="item in selected.items"
                  :key="item.name"
                  class="p-3 bg-stone-50 rounded-xl transition-opacity"
                  :class="
                    ['completed', 'paid', 'cancelled'].includes(selected.status)
                      ? 'opacity-70 grayscale-[20%]'
                      : ''
                  "
                >
                  <div class="flex justify-between items-center text-sm">
                    <span
                      class="font-bold text-stone-700 flex items-center gap-2"
                    >
                      <svg
                        v-if="['completed', 'paid'].includes(selected.status)"
                        class="w-4 h-4 text-emerald-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="3"
                          d="M5 13l4 4L19 7"
                        ></path>
                      </svg>
                      {{ item.quantity }}x {{ item.name }}
                    </span>
                    <span class="font-semibold text-stone-500"
                      >{{ item.price * item.quantity }}
                      {{ state.language === "en" ? "B." : "บ." }}</span
                    >
                  </div>
                  <p
                    v-if="item.note"
                    class="text-xs text-brand mt-1 italic pl-6"
                  >
                    {{ state.language === "en" ? "Note:" : "หมายเหตุ:" }} "{{
                      item.note
                    }}"
                  </p>
                </div>
              </div>
            </div>

            <!-- Action buttons -->
            <div
              v-if="
                !['completed', 'paid', 'cancelled'].includes(selected.status)
              "
              class="pt-6 border-t border-stone-100 mt-4 space-y-2"
            >
              <div class="flex gap-2">
                <button
                  v-if="canRollback"
                  @click="rollbackOrderStatus(selected.id, selected.status)"
                  class="w-1/3 bg-stone-100 text-stone-600 py-3 rounded-2xl font-bold hover:bg-stone-200 transition-colors"
                >
                  {{ state.language === "en" ? "Back" : "ย้อนกลับ" }}
                </button>
                <button
                  v-if="canAdvance"
                  @click="updateOrderStatus(selected.id, selected.status)"
                  class="flex-1 bg-brand text-white py-3 rounded-2xl font-black shadow-md hover:bg-brand/90 transition-colors"
                >
                  {{ state.language === "en" ? "Next Step" : "ขั้นตอนถัดไป" }}
                </button>
              </div>
              <button
                v-if="canCancel"
                @click="cancelOrder(selected.id)"
                class="w-full bg-red-50 text-red-600 py-3 rounded-2xl font-bold hover:bg-red-100 transition-colors"
              >
                {{ state.language === "en" ? "Cancel Order" : "ยกเลิกออเดอร์" }}
              </button>
            </div>

            <!-- Open Checkout and Clear Table modal -->
            <div
              v-if="selected.status === 'completed'"
              class="pt-6 border-t border-stone-100 mt-4"
            >
              <button
                @click="openCheckoutModal"
                class="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black shadow-md hover:bg-emerald-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                {{
                  state.language === "en"
                    ? "Checkout & Clear Table"
                    : "รับชำระเงิน & เคลียร์โต๊ะ"
                }}
              </button>
            </div>
          </aside>
        </section>
      </main>
    </div>
    <MobileNav :items="ownerNav" />

    <!-- Checkout Modal with Thai QR Payment -->
    <Transition name="fade">
      <div
        v-if="showCheckoutModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4"
      >
        <div
          class="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        >
          <!-- Success State -->
          <div
            v-if="paymentSuccess"
            class="p-10 flex flex-col items-center text-center justify-center min-h-[450px]"
          >
            <div
              class="w-24 h-24 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-6"
            >
              <svg
                class="w-12 h-12"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                stroke-width="3"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
            </div>
            <h2 class="text-3xl font-black text-stone-800 mb-2">
              {{
                state.language === "en"
                  ? "Payment Successful"
                  : "ชำระเงินสำเร็จ"
              }}
            </h2>
            <p class="text-stone-500 font-medium">
              {{
                state.language === "en"
                  ? "Table has been cleared."
                  : "เคลียร์โต๊ะเรียบร้อยแล้ว!"
              }}
            </p>
          </div>

          <!-- Checkout Details -->
          <div v-else class="flex flex-col h-full">
            <!-- Modal Header -->
            <div
              class="px-6 py-5 border-b border-stone-100 flex justify-between items-center bg-stone-50"
            >
              <div>
                <h3 class="font-black text-stone-800 text-lg">
                  {{ state.language === "en" ? "Checkout" : "ชำระเงิน" }}
                </h3>
                <p class="text-xs text-stone-500 font-bold uppercase mt-1">
                  {{ state.language === "en" ? "Table" : "โต๊ะ" }}
                  {{ selected?.tableNumber.replace("T-", "") }} • Order #{{
                    selected?.orderNumber
                  }}
                </p>
              </div>
              <button
                @click="closeCheckoutModal"
                :disabled="isProcessingPayment"
                class="p-2 bg-white border border-stone-200 rounded-full text-stone-400 hover:bg-stone-100 transition-colors disabled:opacity-50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <!-- Modal Body -->
            <div class="p-6">
              <!-- Total Amount Due -->
              <div class="text-center mb-6">
                <p
                  class="text-sm font-bold text-stone-500 uppercase tracking-wider mb-1"
                >
                  {{
                    state.language === "en" ? "Total Amount" : "ยอดที่ต้องชำระ"
                  }}
                </p>
                <div
                  class="text-5xl font-black text-stone-900 font-mono tracking-tight flex items-center justify-center gap-2"
                >
                  <span class="text-emerald-500">{{
                    orderTotal.toLocaleString()
                  }}</span>
                  <span class="text-2xl text-stone-400">{{
                    state.language === "en" ? "B." : "บ."
                  }}</span>
                </div>
              </div>

              <!-- Payment Method Tabs -->
              <div class="flex p-1 bg-stone-100 rounded-xl mb-6">
                <button
                  @click="paymentMethod = 'qr'"
                  class="flex-1 py-2.5 text-sm font-bold rounded-lg transition-all"
                  :class="
                    paymentMethod === 'qr'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-700'
                  "
                >
                  QR PromptPay
                </button>
                <button
                  @click="paymentMethod = 'cash'"
                  class="flex-1 py-2.5 text-sm font-bold rounded-lg transition-all"
                  :class="
                    paymentMethod === 'cash'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-700'
                  "
                >
                  {{ state.language === "en" ? "Cash" : "เงินสด" }}
                </button>
              </div>

              <!-- Payment Method Content -->
              <div
                class="min-h-[260px] flex flex-col items-center justify-center"
              >
                <!-- QR Code Display -->
                <div
                  v-if="paymentMethod === 'qr'"
                  class="flex flex-col items-center w-full animate-in fade-in zoom-in-95 duration-200"
                >
                  <!-- Thai QR Payment Standee Layout -->
                  <div
                    class="bg-white rounded-xl shadow-md border border-stone-200 overflow-hidden inline-block w-56 mb-3"
                  >
                    <!-- Thai QR Header -->
                    <div
                      class="bg-[#113566] py-2 text-center border-b-[3px] border-[#ed1c24]"
                    >
                      <span class="text-white font-bold tracking-widest text-xs"
                        >THAI QR PAYMENT</span
                      >
                    </div>
                    <!-- PromptPay QR Code Image -->
                    <div class="p-3 bg-white flex justify-center">
                      <img
                        :src="`https://promptpay.io/${promptpayId}/${orderTotal}.png`"
                        alt="PromptPay QR Code"
                        class="w-40 h-40 object-contain"
                      />
                    </div>
                    <!-- PromptPay Logo Footer -->
                    <div
                      class="bg-stone-50 py-2.5 text-center border-t border-stone-100 flex flex-col items-center justify-center"
                    >
                      <div class="flex items-center gap-1 leading-none mb-1">
                        <span class="text-[#113566] font-black italic text-base"
                          >Prompt</span
                        >
                        <span class="text-[#f47920] font-black italic text-base"
                          >Pay</span
                        >
                      </div>
                    </div>
                  </div>

                  <p class="text-xs text-stone-500 font-medium">
                    {{
                      state.language === "en"
                        ? "Scan to pay with any banking app"
                        : "ให้ลูกค้าสแกนเพื่อชำระเงินผ่านแอปธนาคาร"
                    }}
                  </p>
                </div>

                <!-- Cash Payment Display -->
                <div
                  v-else
                  class="flex flex-col items-center w-full animate-in fade-in zoom-in-95 duration-200 text-center px-4"
                >
                  <div
                    class="w-24 h-24 bg-stone-100 rounded-full flex items-center justify-center mb-5"
                  >
                    <svg
                      class="w-12 h-12 text-stone-500"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                      <circle cx="12" cy="12" r="2"></circle>
                      <path d="M6 12h.01M18 12h.01"></path>
                    </svg>
                  </div>
                  <h4 class="font-bold text-stone-800 text-lg mb-1">
                    {{
                      state.language === "en"
                        ? "Receive Cash"
                        : "รับเงินสดจากลูกค้า"
                    }}
                  </h4>
                  <p class="text-sm text-stone-500">
                    {{
                      state.language === "en"
                        ? "Please collect the exact amount or prepare change."
                        : "กรุณารับเงินและเตรียมเงินทอนให้เรียบร้อย"
                    }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Modal Footer Action -->
            <div class="p-6 pt-0 mt-auto">
              <button
                @click="confirmPayment"
                :disabled="isProcessingPayment"
                class="w-full py-4 rounded-2xl font-black text-white shadow-md transition-all flex items-center justify-center gap-2"
                :class="[
                  paymentMethod === 'qr'
                    ? 'bg-[#114380] hover:bg-[#0a2e5c]'
                    : 'bg-emerald-500 hover:bg-emerald-600',
                  isProcessingPayment
                    ? 'opacity-70 cursor-not-allowed'
                    : 'active:scale-[0.98]',
                ]"
              >
                <!-- Loading Spinner -->
                <svg
                  v-if="isProcessingPayment"
                  class="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>

                {{
                  isProcessingPayment
                    ? state.language === "en"
                      ? "Processing..."
                      : "กำลังดำเนินการ..."
                    : state.language === "en"
                      ? "Confirm Payment Received"
                      : "ยืนยันรับเงิน & เคลียร์โต๊ะ"
                }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #d6d3d1;
  border-radius: 10px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: #a8a29e;
}

/* Modal Transition Effect */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
