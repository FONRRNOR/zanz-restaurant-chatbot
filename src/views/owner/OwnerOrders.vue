<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import { supabase } from "../../supabaseClient";
import MobileNav from "../../components/MobileNav.vue";
import SideNav from "../../components/SideNav.vue";
import StatusPill from "../../components/StatusPill.vue";
import TopBar from "../../components/TopBar.vue";
import { useAppState } from "../../services/appState";

const { state } = useAppState();
const orders = ref([]);
const selected = ref(null);
const filter = ref("active");
const loading = ref(true);
let realTimeSubscription = null;

const ownerNav = [
  { label: "Dashboard", to: "/owner/dashboard", short: "Home" },
  { label: "Menu Management", to: "/owner/menu-management", short: "Menu" },
  { label: "Orders", to: "/owner/orders" },
  { label: "Staff Accounts", to: "/owner/staff-accounts", short: "Staff" },
  { label: "Logout", to: "/logout", short: "Logout" },
];

const statuses = [
  "active", // ดูทั้งหมดในร้านตอนนี้
  "kitchen", // รวมออเดอร์ใหม่ + กำลังทำ
  "ready", // รอเสิร์ฟ
  "completed", // รอเช็คบิล
  "paid", // ประวัติ
];
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

async function fetchOrders() {
  loading.value = true;
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
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
    active: state.language === "en" ? "Active (All)" : "ปัจจุบัน (ทั้งหมด)",
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

// 💡 เพิ่ม paid เข้าไปในตัวแปร counts เพื่อให้นับจำนวนได้
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

onMounted(() => {
  const savedLanguage = localStorage.getItem("zank-language");
  if (savedLanguage) {
    state.language = savedLanguage;
  }

  fetchOrders();

  realTimeSubscription = supabase
    .channel("public:orders-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "orders" },
      () => fetchOrders(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "order_items" },
      () => fetchOrders(),
    )
    .subscribe();
});

onUnmounted(() => {
  if (realTimeSubscription) {
    supabase.removeChannel(realTimeSubscription);
  }
});

async function rollbackOrderStatus(orderId, currentUiStatus) {
  const currentIdx = steps.indexOf(currentUiStatus);
  if (currentIdx <= 0) return;

  const prevUiStatus = steps[currentIdx - 1];
  const prevDbStatus = mapUiStatusToDb(prevUiStatus);

  const orderIndex = orders.value.findIndex((o) => o.id === orderId);
  if (orderIndex !== -1) orders.value[orderIndex].status = prevUiStatus;
  selected.value.status = prevUiStatus;

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

async function checkoutAndClearTable(order) {
  const confirmCheckout = confirm(
    state.language === "en"
      ? "Confirm payment and clear this table for the next customer?"
      : "ยืนยันการรับชำระเงินและล้างข้อมูลโต๊ะนี้ เพื่อให้ลูกค้าใหม่สแกนใช่หรือไม่?",
  );

  if (!confirmCheckout) return;

  try {
    const { error: rpcError } = await supabase.rpc("clear_table_session", {
      p_table_id: order.raw.table_number,
      p_restaurant_id: order.raw.restaurant_id,
    });

    if (rpcError) throw rpcError;

    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: "paid" })
      .eq("table_number", order.raw.table_number)
      .neq("status", "paid")
      .neq("status", "cancelled");

    if (updateError) throw updateError;

    alert(
      state.language === "en"
        ? "Table cleared successfully! Ready for next customer."
        : "เคลียร์โต๊ะสำเร็จ! ลูกค้าใหม่สามารถสแกน QR Code ได้เลย",
    );

    if (filter.value === "active") {
      selected.value = null;
    }

    fetchOrders();
  } catch (err) {
    console.error("Error clearing table:", err);
    alert(
      state.language === "en"
        ? "Error clearing table. Check console for details."
        : "เกิดข้อผิดพลาดในการเคลียร์โต๊ะ ดูรายละเอียดใน Console",
    );
  }
}
</script>

<template>
  <div class="page-shell">
    <TopBar owner search-placeholder="Search order number, table, or item" />
    <div class="content-shell">
      <SideNav :items="ownerNav" />
      <main class="main-panel">
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

        <!-- 💡 ปรับ Grid เป็น 5 คอลัมน์ และเปลี่ยนสีตัวเลขเป็นสีเขียว (text-emerald-500) ทั้งหมด -->
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
          <!-- 💡 เพิ่มกล่องใหม่ สำหรับยอดจ่ายแล้ว -->
          <article class="section-card p-5 flex flex-col justify-between">
            <p class="text-sm font-bold capitalize text-muted">
              {{ state.language === "en" ? "Paid" : "จ่ายเงินแล้ว" }}
            </p>
            <strong class="text-3xl font-black text-emerald-800 mt-2 block">{{
              counts.paid
            }}</strong>
          </article>
        </section>

        <!-- แถบ Filter -->
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
          <!-- ฝั่งซ้าย: รายการออเดอร์ -->
          <article
            class="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-140px)]"
          >
            <!-- Header แบบติดหนึบ (Sticky) -->
            <div
              class="px-6 py-5 border-b border-stone-200 bg-stone-50/80 flex justify-between items-center sticky top-0 z-10"
            >
              <h3 class="font-black text-stone-800 text-lg">
                {{
                  state.language === "en" ? "Incoming Orders" : "รายการออเดอร์"
                }}
              </h3>
              <!-- Badge บอกจำนวนออเดอร์ทั้งหมดที่แสดงอยู่ -->
              <span
                class="bg-stone-200 text-stone-600 text-md font-bold px-3 py-1 rounded-full"
              >
                {{ filteredOrders.length }}
              </span>
            </div>

            <!-- กล่อง Scroll รายการอาหาร -->
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
                <!-- แถบสีด้านซ้ายสุด บ่งบอกสถานะ Active หรือ ออเดอร์ใหม่ -->
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
                  <!-- ป้ายหมายเลขโต๊ะ (Table Badge) ให้ดูโดดเด่น -->
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

                  <!-- รายละเอียดออเดอร์ -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <p
                        class="font-extrabold text-stone-900 text-base truncate"
                      >
                        #{{ order.orderNumber }}
                      </p>
                      <!-- แจ้งเตือนแพ้อาหาร (ถ้ามี) โชว์ที่หน้ารวมเลยให้เชฟเห็นทันที -->
                      <span
                        v-if="order.allergies?.length"
                        class="text-red-500 text-xs ml-2"
                        title="Allergy Alert"
                        >⚠️ อาการแพ้</span
                      >
                    </div>

                    <!-- เวลา และ จำนวนไอเทม (ใส่ Icon ให้ดูง่ายขึ้น) -->
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

                <!-- ป้ายสถานะ (Status Pill) -->
                <div class="shrink-0 ml-2">
                  <StatusPill :status="order.status" />
                </div>
              </button>
            </div>
          </article>

          <!-- ฝั่งขวา: รายละเอียดออเดอร์ -->
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

              <!-- ป้ายกำกับเล็กๆ มุมขวาบน สำหรับ Finished/Paid -->
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
              <!-- ไฮไลต์แจ้งเตือน: ออเดอร์เสร็จสมบูรณ์ (แสดงเมื่อ status = completed) -->
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

              <!-- แจ้งเตือนแพ้อาหาร -->
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
                      <!-- ติ๊กถูกหน้ารายการอาหาร ถ้าออเดอร์เสร็จแล้วหรือจ่ายแล้ว -->
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
                  <!-- ส่วนแสดงวัตถุดิบและ Note -->
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

            <!-- ปุ่ม Action (ซ่อนกรอบนี้ทั้งหมดเมื่อ status = 'completed', 'paid', หรือ 'cancelled') -->
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

            <!-- ปุ่ม Checkout จะแสดงแค่ตอนเป็นสถานะ Completed เท่านั้น (Paid แล้วจะไม่เห็น) -->
            <div
              v-if="selected.status === 'completed'"
              class="pt-6 border-t border-stone-100 mt-4"
            >
              <button
                @click="checkoutAndClearTable(selected)"
                class="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black shadow-md hover:bg-emerald-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <!-- ไอคอนบัตรเครดิต/ชำระเงิน -->
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
  </div>
</template>

<style scoped>
/* ทำให้ Scrollbar ดูสะอาดตาแบบ Mac / Mobile */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #d6d3d1; /* stone-300 */
  border-radius: 10px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: #a8a29e; /* stone-400 */
}
</style>
