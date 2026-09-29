<script setup>
import { ref, watch, onMounted, onUnmounted } from "vue";
import { useAppState } from "../../services/appState";
import { useOwnerOrders } from "../../composables/owner/useOwnerOrders";

import MobileNav from "../../components/common/MobileNav.vue";
import SideNav from "../../components/common/SideNav.vue";
import StatusPill from "../../components/common/StatusPill.vue";
import TopBar from "../../components/common/TopBar.vue";

const { state } = useAppState();

// เรียกใช้ Composable
const {
  selected,
  filter,
  showCheckoutModal,
  paymentMethod,
  isProcessingPayment,
  paymentSuccess,
  promptpayId,
  statuses,
  filteredOrders,
  counts,
  orderTotal,
  canCancel,
  canAdvance,
  canRollback,
  updateOrderStatus,
  rollbackOrderStatus,
  cancelOrder,
  getStatusLabel,
  openCheckoutModal,
  closeCheckoutModal,
  confirmPayment,
  fetchOrders,
} = useOwnerOrders(state);

// State สำหรับควบคุม Modal แจ้งเตือนออเดอร์ใหม่ฝั่ง Admin
const showNewOrderAlert = ref(false);
const latestOrderAlert = ref(null);

// เก็บรายการ Order ID ที่เคยแจ้งเตือนไปแล้ว เพื่อป้องกันการแจ้งเตือนซ้ำ
const notifiedOrderIds = ref(new Set());
const isInitialLoad = ref(true);

let pollInterval = null;

const triggerNewOrderAlert = (orderData) => {
  latestOrderAlert.value = orderData;
  showNewOrderAlert.value = true;
};

const closeNewOrderAlert = () => {
  showNewOrderAlert.value = false;
  latestOrderAlert.value = null;
};

watch(
  () => filteredOrders.value,
  (orders) => {
    if (!orders || orders.length === 0) return;

    const newOrders = orders.filter((o) => o.status === "new");

    if (isInitialLoad.value) {
      newOrders.forEach((o) => notifiedOrderIds.value.add(o.id));
      isInitialLoad.value = false;
      return;
    }

    const trulyNewOrder = newOrders.find(
      (o) => !notifiedOrderIds.value.has(o.id),
    );

    if (trulyNewOrder) {
      notifiedOrderIds.value.add(trulyNewOrder.id);
      if (!showNewOrderAlert.value) {
        triggerNewOrderAlert(trulyNewOrder);
      }
    }
  },
  { deep: true },
);

onMounted(async () => {
  await fetchOrders();
  if (filteredOrders.value) {
    filteredOrders.value
      .filter((o) => o.status === "new")
      .forEach((o) => notifiedOrderIds.value.add(o.id));
  }
  isInitialLoad.value = false;

  pollInterval = setInterval(() => {
    fetchOrders();
  }, 5000);
});

onUnmounted(() => {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
});

const ownerNav = [
  { label: "Dashboard", to: "/owner/dashboard", short: "Home" },
  { label: "Menu Management", to: "/owner/menu-management", short: "Menu" },
  { label: "Orders", to: "/owner/orders" },
  { label: "Staff Accounts", to: "/owner/staff-accounts", short: "Staff" },
  { label: "Logout", to: "/logout", short: "Logout" },
];
</script>

<template>
  <!-- ล็อกความสูงหน้าจอแบบเต็ม 100vh และห้ามเลื่อนที่ Root -->
  <div class="h-screen w-screen overflow-hidden flex flex-col bg-[#F1FAEC]">
    <!-- TopBar คงที่อยู่ด้านบนสุด ไม่เลื่อน -->
    <TopBar owner search-placeholder="Search order number, table, or item" class="shrink-0" />

    <!-- Container ย่อย: ขึงความสูงที่เหลือหลังหัก TopBar -->
    <div class="flex-1 flex overflow-hidden min-h-0">
      <!-- SideNav อยู่กับที่ ยืดเต็มแนวตั้ง ไม่เลื่อนตาม main -->
      <SideNav :items="ownerNav" class="shrink-0" />

      <!-- Main Panel: จุดเดียวที่อนุญาตให้เลื่อนขึ้นลงได้ -->
      <main class="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8 custom-scrollbar min-w-0">
        <h1 class="text-3xl md:text-4xl font-black truncate">
          {{
            state.language === "en" ? "Order Management" : "การจัดการคำสั่งซื้อ"
          }}
        </h1>
        <p class="mt-2 text-muted text-sm md:text-base">
          {{
            state.language === "en"
              ? "Monitor customer orders and review order details."
              : "ตรวจสอบสถานะคำสั่งซื้อจากลูกค้าและดูรายละเอียดประวัติรายการอาหาร"
          }}
        </p>

        <!-- Stats Card Grid 5 ระดับ -->
        <section
          class="mt-6 grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
        >
          <!-- ระดับ 1: ออเดอร์ใหม่ -->
          <article
            class="section-card p-4 sm:p-5 flex flex-col justify-between"
          >
            <p
              class="text-xs sm:text-sm font-bold capitalize text-muted truncate"
            >
              {{ state.language === "en" ? "New Orders" : "ออเดอร์ใหม่" }}
            </p>
            <strong
              class="text-2xl sm:text-3xl font-black text-emerald-800 mt-2 block"
            >{{ counts.new }}</strong>
          </article>

          <!-- ระดับ 2: กำลังปรุง -->
          <article
            class="section-card p-4 sm:p-5 flex flex-col justify-between"
          >
            <p
              class="text-xs sm:text-sm font-bold capitalize text-muted truncate"
            >
              {{ state.language === "en" ? "Preparing" : "กำลังปรุง" }}
            </p>
            <strong
              class="text-2xl sm:text-3xl font-black text-emerald-800 mt-2 block"
            >{{ counts.preparing }}</strong>
          </article>

          <!-- ระดับ 3: พร้อมเสิร์ฟ -->
          <article
            class="section-card p-4 sm:p-5 flex flex-col justify-between"
          >
            <p
              class="text-xs sm:text-sm font-bold capitalize text-muted truncate"
            >
              {{ state.language === "en" ? "Ready to Serve" : "พร้อมเสิร์ฟ" }}
            </p>
            <strong
              class="text-2xl sm:text-3xl font-black text-emerald-800 mt-2 block"
            >{{ counts.ready }}</strong>
          </article>

          <!-- ระดับ 4: เสิร์ฟแล้ว (รอเช็คบิล) -->
          <article
            class="section-card p-4 sm:p-5 flex flex-col justify-between"
          >
            <p
              class="text-xs sm:text-sm font-bold capitalize text-muted truncate"
            >
              {{ state.language === "en" ? "To Pay (Served)" : "รอเช็คบิล (เสิร์ฟแล้ว)" }}
            </p>
            <strong
              class="text-2xl sm:text-3xl font-black text-emerald-800 mt-2 block"
            >{{ counts.served }}</strong>
          </article>

          <!-- ระดับ 5: ประวัติการจ่ายเงิน (History) -->
          <article
            class="section-card p-4 sm:p-5 flex flex-col justify-between col-span-2 sm:col-span-1"
          >
            <p
              class="text-xs sm:text-sm font-bold capitalize text-muted truncate"
            >
              {{ state.language === "en" ? "History (Paid)" : "ประวัติ (จ่ายแล้ว)" }}
            </p>
            <strong
              class="text-2xl sm:text-3xl font-black text-emerald-800 mt-2 block"
            >{{ counts.paid }}</strong>
          </article>
        </section>

        <!-- Filter Tab -->
        <div class="mt-6 flex flex-wrap gap-2">
          <button
            v-for="status in statuses"
            :key="status"
            class="rounded-full px-4 sm:px-5 py-2 text-xs sm:text-sm font-bold border border-stone-200 transition hover:opacity-90 active:scale-95"
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

        <section
          class="mt-8 grid gap-6 xl:grid-cols-[1fr_380px] 2xl:grid-cols-[1fr_420px] items-start min-w-0 pb-12"
        >
          <!-- Left side: order list -->
          <article
            class="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden flex flex-col min-w-0 h-[620px]"
          >
            <div
              class="px-5 py-4 border-b border-stone-200 bg-stone-50/80 flex justify-between items-center sticky top-0 z-10"
            >
              <h3 class="font-black text-stone-800 text-base sm:text-lg">
                {{
                  state.language === "en" ? "Incoming Orders" : "รายการออเดอร์"
                }}
              </h3>
              <span
                class="bg-red-600 text-white text-xs sm:text-sm font-bold px-2.5 py-0.5 rounded-full"
              >
                {{ filteredOrders.length }}
              </span>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar">
              <div
                v-if="filteredOrders.length === 0"
                class="p-10 text-center text-stone-400 font-bold text-sm"
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
                class="group relative w-full p-4 border-b border-stone-100 flex items-center justify-between transition-all duration-200 text-left min-w-0"
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
                <div class="flex items-center gap-3 pl-1 w-full min-w-0">
                  <div
                    class="h-10 px-3.5 rounded-xl flex items-center justify-center gap-1.5 shrink-0 shadow-sm border transition-colors"
                    :class="[
                      selected?.id === order.id
                        ? 'bg-brand text-white border-brand'
                        : 'bg-emerald-700 text-white border-emerald-800 hover:bg-emerald-800',
                    ]"
                  >
                    <span
                      class="text-[10px] font-bold uppercase tracking-wider opacity-80 pt-[1px]"
                    >
                      {{ state.language === "en" ? "Table" : "โต๊ะ" }}
                    </span>
                    <span class="text-sm font-black whitespace-nowrap">
                      {{ order.tableNumber.replace("T-", "") }}
                    </span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1">
                      <p class="font-extrabold text-stone-900 text-sm truncate">
                        #{{ order.orderNumber }}
                      </p>
                      <span
                        v-if="order.allergies?.length"
                        class="text-red-500 text-[11px] font-bold shrink-0"
                        title="Allergy Alert"
                        >• มีแพ้อาหาร</span
                      >
                    </div>
                    <div
                      class="flex items-center gap-2 text-xs font-semibold text-stone-500 truncate"
                    >
                      <span class="flex items-center gap-1 shrink-0">
                        {{ order.time }}
                      </span>
                      <span
                        class="w-1 h-1 rounded-full bg-stone-300 shrink-0"
                      ></span>
                      <span class="flex items-center gap-1 text-brand truncate">
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
            class="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-stone-200 w-full min-w-0 flex flex-col h-[620px]"
          >
            <div
              class="border-b border-stone-100 pb-4 mb-4 flex justify-between items-start gap-2"
            >
              <div class="min-w-0">
                <h2
                  class="text-xl sm:text-2xl font-black text-stone-900 truncate"
                >
                  #{{ selected.orderNumber }}
                </h2>
                <p
                  class="text-xs sm:text-sm font-bold text-brand mt-0.5 uppercase truncate"
                >
                  {{ state.language === "en" ? "Table:" : "โต๊ะ:" }}
                  {{ selected.tableNumber }}
                </p>
              </div>
              <div
                v-if="['served', 'paid'].includes(selected.status)"
                class="px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase flex items-center gap-1 shrink-0"
                :class="
                  selected.status === 'paid'
                    ? 'bg-stone-200 text-stone-600'
                    : 'bg-emerald-100 text-emerald-700'
                "
              >
                {{
                  selected.status === "paid"
                    ? state.language === "en"
                      ? "Paid"
                      : "จ่ายเงินแล้ว"
                    : state.language === "en"
                      ? "Served / To Pay"
                      : "เสิร์ฟแล้ว / รอจ่ายเงิน"
                }}
              </div>
              <div
                v-if="selected.status === 'cancelled'"
                class="px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase shrink-0 bg-red-100 text-red-700"
              >
                {{ state.language === "en" ? "Cancelled" : "ยกเลิกแล้ว" }}
              </div>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
              <!-- Banner แจ้งเตือนเมื่อสถานะเป็น served (เสิร์ฟแล้ว รอเช็คบิล) -->
              <div
                v-if="selected.status === 'served'"
                class="p-3.5 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center gap-2.5"
              >
                <div
                  class="bg-emerald-200/50 p-1.5 rounded-full text-emerald-600 shrink-0"
                >
                  <svg
                    class="w-5 h-5"
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
                <div class="min-w-0">
                  <h3 class="font-black text-emerald-800 text-xs sm:text-sm">
                    {{
                      state.language === "en"
                        ? "All items have been served!"
                        : "เสิร์ฟอาหารครบทุกรายการแล้ว!"
                    }}
                  </h3>
                  <p class="text-[11px] font-semibold text-emerald-600/80">
                    {{
                      state.language === "en"
                        ? "Ready for checkout and clearing table."
                        : "พร้อมสำหรับการเช็คบิลและเคลียร์โต๊ะ"
                    }}
                  </p>
                </div>
              </div>

              <div
                v-if="selected.allergies?.length"
                class="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-bold border border-red-100"
              >
                {{
                  state.language === "en"
                    ? "Allergy Alert:"
                    : "แจ้งเตือนอาการแพ้:"
                }}
                {{ selected.allergies.join(", ") }}
              </div>

              <div class="space-y-2">
                <div
                  v-for="item in selected.items"
                  :key="item.name"
                  class="p-3 bg-stone-50 rounded-xl"
                  :class="
                    ['paid', 'cancelled'].includes(selected.status)
                      ? 'opacity-70'
                      : ''
                  "
                >
                  <div
                    class="flex justify-between items-start text-xs sm:text-sm gap-2"
                  >
                    <span class="font-bold text-stone-700 flex-1 break-words">
                      {{ item.quantity }}x {{ item.name }}
                    </span>
                    <span class="font-semibold text-stone-500 shrink-0"
                      >{{ (item.price * item.quantity).toLocaleString() }}
                      {{ state.language === "en" ? "Baht" : "บาท" }}</span
                    >
                  </div>
                  <div
                    v-if="item.note"
                    class="text-[11px] mt-1 pl-2 font-semibold break-words"
                    :class="
                      item.note.toLowerCase().includes('แพ้') ||
                      item.note.toLowerCase().includes('allergic') ||
                      item.note.toLowerCase().includes('allergy')
                        ? 'text-red-600 bg-red-50 p-1.5 rounded border border-red-200'
                        : 'text-brand italic'
                    "
                  >
                    {{ state.language === "en" ? "Note:" : "หมายเหตุ:" }}
                    {{ item.note }}
                  </div>
                </div>
              </div>
            </div>

            <!-- ส่วนควบคุมปุ่ม Action สำหรับออเดอร์ -->
            <div
              v-if="!['paid', 'cancelled'].includes(selected.status)"
              class="pt-4 border-t border-stone-100 mt-3 space-y-2 shrink-0"
            >
              <!-- ปุ่มย้อนกลับและถัดไป (สำหรับ Step 1-3: new -> preparing -> ready) -->
              <div v-if="selected.status !== 'served'" class="flex gap-2">
                <button
                  v-if="canRollback"
                  @click="rollbackOrderStatus(selected.id, selected.status)"
                  class="w-1/3 bg-stone-100 text-stone-600 py-2.5 rounded-xl font-bold hover:bg-stone-200 transition-colors text-xs sm:text-sm cursor-pointer"
                >
                  {{ state.language === "en" ? "Back" : "ย้อนกลับ" }}
                </button>
                <button
                  v-if="canAdvance"
                  @click="updateOrderStatus(selected.id, selected.status)"
                  class="flex-1 bg-brand text-white py-2.5 rounded-xl font-black shadow hover:bg-brand/90 transition-colors text-xs sm:text-sm cursor-pointer"
                >
                  {{ state.language === "en" ? "Next Step" : "ขั้นตอนถัดไป" }}
                </button>
              </div>

              <!-- ปุ่มยกเลิกออเดอร์ -->
              <button
                v-if="canCancel"
                @click="cancelOrder(selected.id)"
                class="w-full bg-red-50 text-red-600 py-2.5 rounded-xl font-bold hover:bg-red-100 transition-colors text-xs sm:text-sm cursor-pointer"
              >
                {{ state.language === "en" ? "Cancel Order" : "ยกเลิกออเดอร์" }}
              </button>

              <!-- ปุ่ม Checkout และปุ่มย้อนสถานะ (จะแสดงเมื่อเสิร์ฟอาหารครบแล้ว - served) -->
              <div v-if="selected.status === 'served'" class="space-y-2">
                <button
                  @click="openCheckoutModal"
                  class="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white py-3 rounded-xl font-black shadow transition-all flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer"
                >
                  {{
                    state.language === "en"
                      ? "Checkout & Clear Table"
                      : "รับชำระเงิน & เคลียร์โต๊ะ"
                  }}
                </button>
                <button
                  v-if="canRollback"
                  @click="rollbackOrderStatus(selected.id, selected.status)"
                  class="w-full bg-stone-100 text-stone-600 py-2 rounded-xl font-bold hover:bg-stone-200 transition-colors text-xs cursor-pointer"
                >
                  {{ state.language === "en" ? "Rollback to Ready" : "ย้อนสถานะกลับไปรอเสิร์ฟ" }}
                </button>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
    <MobileNav :items="ownerNav" />

    <!-- New Order Alert Modal -->
    <Transition name="fade">
      <div
        v-if="showNewOrderAlert && latestOrderAlert"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm"
      >
        <div
          class="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-stone-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150"
        >
          <div class="bg-emerald-700 text-white px-6 py-5">
            <div
              class="inline-flex items-center bg-emerald-800/60 px-3 py-1 rounded-md mb-1"
            >
              <span class="relative flex h-2 w-2 mr-2">
                <span
                  class="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"
                ></span>
              </span>
              <span
                class="text-[12px] font-bold tracking-wider uppercase text-emerald-200"
              >
                {{ state.language === "en" ? "New Order" : "มีออเดอร์ใหม่" }}
              </span>
            </div>
            <h2 class="text-xl sm:text-2xl font-black tracking-tight mt-1">
              {{
                state.language === "en"
                  ? "Incoming Kitchen Order!"
                  : "มีรายการออเดอร์ใหม่เข้ามา!"
              }}
            </h2>
          </div>

          <div
            class="px-6 py-4 bg-stone-50 border-b border-stone-200 grid grid-cols-3 gap-2 text-center"
          >
            <div>
              <span class="text-xs font-medium text-stone-400 uppercase block">
                {{ state.language === "en" ? "Table" : "โต๊ะ" }}
              </span>
              <span
                class="text-lg sm:text-xl font-bold text-stone-800 truncate block"
              >
                {{ latestOrderAlert.tableNumber }}
              </span>
            </div>
            <div>
              <span class="text-xs font-medium text-stone-400 uppercase block">
                {{ state.language === "en" ? "Order Time" : "เวลาสั่งซื้อ" }}
              </span>
              <span
                class="text-base sm:text-lg font-semibold text-stone-700 block"
              >
                {{ latestOrderAlert.time || "-" }}
              </span>
            </div>
            <div>
              <span class="text-xs font-medium text-stone-400 uppercase block">
                {{ state.language === "en" ? "Order ID" : "รหัสออเดอร์" }}
              </span>
              <span
                class="text-base sm:text-lg font-semibold text-stone-700 font-mono truncate block"
              >
                #{{ latestOrderAlert.orderNumber }}
              </span>
            </div>
          </div>

          <div class="p-6">
            <div
              class="space-y-2.5 max-h-60 overflow-y-auto pr-1 custom-scrollbar"
            >
              <div
                v-for="(item, idx) in latestOrderAlert.items"
                :key="idx"
                class="flex items-start justify-between gap-3 p-3 rounded-xl bg-stone-50 border border-stone-200"
              >
                <div class="flex-1 min-w-0">
                  <div class="flex items-baseline gap-1.5">
                    <span
                      class="text-base font-black text-emerald-700 shrink-0"
                    >
                      {{ item.quantity }}&times;
                    </span>
                    <span class="text-sm font-bold text-stone-900 truncate">
                      {{ item.name }}
                    </span>
                  </div>
                  <p
                    v-if="item.note && item.note !== '-'"
                    class="mt-1 text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 break-words"
                  >
                    {{ item.note }}
                  </p>
                </div>
              </div>
            </div>

            <button
              @click="closeNewOrderAlert"
              class="w-full mt-6 py-3.5 rounded-xl bg-stone-800 hover:bg-stone-900 active:scale-[0.98] text-white font-extrabold text-sm sm:text-base transition cursor-pointer"
            >
              {{ state.language === "en" ? "Got It" : "รับทราบ" }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Checkout Modal -->
    <Transition name="fade">
      <div
        v-if="showCheckoutModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4"
      >
        <div
          class="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        >
          <div
            v-if="paymentSuccess"
            class="p-8 flex flex-col items-center text-center justify-center min-h-[380px]"
          >
            <div
              class="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-4"
            >
              <svg
                class="w-10 h-10"
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
            <h2 class="text-2xl font-black text-stone-800 mb-1">
              {{
                state.language === "en"
                  ? "Payment Successful"
                  : "ชำระเงินสำเร็จ"
              }}
            </h2>
            <p class="text-stone-500 text-sm">
              {{
                state.language === "en"
                  ? "Table has been cleared."
                  : "เคลียร์โต๊ะเรียบร้อยแล้ว!"
              }}
            </p>
          </div>

          <div v-else class="flex flex-col h-full">
            <div
              class="px-6 py-4 border-b border-stone-100 flex justify-between items-center bg-stone-50"
            >
              <div>
                <h3 class="font-black text-stone-800 text-base sm:text-lg">
                  {{ state.language === "en" ? "Checkout" : "ชำระเงิน" }}
                </h3>
                <p class="text-xs text-stone-500 font-bold uppercase mt-0.5">
                  {{ state.language === "en" ? "Table" : "โต๊ะ" }}
                  {{ selected?.tableNumber.replace("T-", "") }} • Order #{{
                    selected?.orderNumber
                  }}
                </p>
              </div>
              <button
                @click="closeCheckoutModal"
                :disabled="isProcessingPayment"
                class="p-1.5 bg-white border border-stone-200 rounded-full text-stone-400 hover:bg-stone-100 transition disabled:opacity-50 cursor-pointer"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
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

            <div class="p-6">
              <div class="text-center mb-5">
                <p
                  class="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1"
                >
                  {{
                    state.language === "en" ? "Total Amount" : "ยอดที่ต้องชำระ"
                  }}
                </p>
                <div
                  class="text-4xl font-black text-stone-900 font-mono tracking-tight flex items-center justify-center gap-1.5"
                >
                  <span class="text-emerald-600">{{
                    orderTotal.toLocaleString()
                  }}</span>
                  <span class="text-lg text-stone-400">{{
                    state.language === "en" ? "Baht" : "บาท"
                  }}</span>
                </div>
              </div>

              <div class="flex p-1 bg-stone-100 rounded-xl mb-5">
                <button
                  @click="paymentMethod = 'qr'"
                  class="flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition cursor-pointer"
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
                  class="flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition cursor-pointer"
                  :class="
                    paymentMethod === 'cash'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-700'
                  "
                >
                  {{ state.language === "en" ? "Cash" : "เงินสด" }}
                </button>
              </div>

              <div
                class="min-h-[220px] flex flex-col items-center justify-center"
              >
                <div
                  v-if="paymentMethod === 'qr'"
                  class="flex flex-col items-center w-full"
                >
                  <div
                    class="bg-white rounded-xl shadow border border-stone-200 overflow-hidden w-48 mb-2"
                  >
                    <div
                      class="bg-[#113566] py-1.5 text-center border-b-[2px] border-[#ed1c24]"
                    >
                      <span
                        class="text-white font-bold tracking-widest text-[10px]"
                        >THAI QR PAYMENT</span
                      >
                    </div>
                    <div class="p-2 bg-white flex justify-center">
                      <img
                        :src="`https://promptpay.io/${promptpayId}/${orderTotal}.png`"
                        alt="PromptPay QR Code"
                        class="w-36 h-36 object-contain"
                      />
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

                <div
                  v-else
                  class="flex flex-col items-center w-full text-center px-4"
                >
                  <div
                    class="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-3"
                  >
                    <svg
                      class="w-8 h-8 text-stone-500"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect x="2" y="6" width="20" height="12" rx="2"></rect>
                      <circle cx="12" cy="12" r="2"></circle>
                    </svg>
                  </div>
                  <h4 class="font-bold text-stone-800 text-base mb-1">
                    {{
                      state.language === "en"
                        ? "Receive Cash"
                        : "รับเงินสดจากลูกค้า"
                    }}
                  </h4>
                  <p class="text-xs text-stone-500">
                    {{
                      state.language === "en"
                        ? "Please collect the exact amount or prepare change."
                        : "กรุณารับเงินและเตรียมเงินทอนให้เรียบร้อย"
                    }}
                  </p>
                </div>
              </div>
            </div>

            <div class="p-6 pt-0 mt-auto">
              <button
                @click="confirmPayment"
                :disabled="isProcessingPayment"
                class="w-full py-3.5 rounded-xl font-black text-white shadow transition flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer"
                :class="[
                  paymentMethod === 'qr'
                    ? 'bg-[#114380] hover:bg-[#0a2e5c]'
                    : 'bg-emerald-500 hover:bg-emerald-600',
                  isProcessingPayment
                    ? 'opacity-70 cursor-not-allowed'
                    : 'active:scale-[0.98]',
                ]"
              >
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
  width: 5px;
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>