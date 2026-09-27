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

// ตัวแปรเก็บ Interval สำหรับ Polling
let pollInterval = null;

// ฟังก์ชันสำหรับเรียกเปิดแจ้งเตือน
const triggerNewOrderAlert = (orderData) => {
  latestOrderAlert.value = orderData;
  showNewOrderAlert.value = true;
};

// ฟังก์ชันปิดแจ้งเตือน
const closeNewOrderAlert = () => {
  showNewOrderAlert.value = false;
  latestOrderAlert.value = null;
};

// เฝ้าระวังจำนวนออเดอร์ใหม่ ถ้าเพิ่มขึ้น ให้เด้ง Modal แจ้งเตือนอัตโนมัติ
watch(
  () => counts.value.new,
  (newVal, oldVal) => {
    if (newVal > (oldVal || 0) && filteredOrders.value.length > 0) {
      // ค้นหาออเดอร์ล่าสุดที่มีสถานะเป็น 'new'
      const latestNewOrder = filteredOrders.value.find(
        (o) => o.status === "new",
      );
      if (latestNewOrder && !showNewOrderAlert.value) {
        triggerNewOrderAlert(latestNewOrder);
      }
    }
  },
);

// ตั้งค่าดึงข้อมูลอัตโนมัติ (Polling) ทุกๆ 5 วินาที เพื่อให้หน้าเว็บอัปเดตออเดอร์ใหม่โดยไม่ต้องรีเฟรช
onMounted(() => {
  fetchOrders(); // โหลดครั้งแรกตอนเข้าหน้า
  pollInterval = setInterval(() => {
    fetchOrders();
  }, 5000); // ทุก 5 วินาที
});

// ล้าง Interval เมื่อออกจากหน้า เพื่อป้องกัน memory leak
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
                      >{{ state.language === "en" ? "Table" : "โต๊ะ" }}</span
                    >
                    <span class="text-xl font-black">{{
                      order.tableNumber.replace("T-", "")
                    }}</span>
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
                      >{{ (item.price * item.quantity).toLocaleString() }}
                      {{ state.language === "en" ? "Baht." : "บาท." }}</span
                    >
                  </div>
                  <div
                    v-if="item.note"
                    class="text-xs mt-1 pl-6 font-semibold"
                    :class="
                      item.note.toLowerCase().includes('แพ้') ||
                      item.note.toLowerCase().includes('allergic') ||
                      item.note.toLowerCase().includes('allergy')
                        ? 'text-red-600 bg-red-50 p-2 rounded-lg border border-red-200 font-bold'
                        : 'text-brand italic'
                    "
                  >
                    {{ state.language === "en" ? "Note:" : "หมายเหตุ:" }} "{{
                      item.note
                    }}"
                  </div>
                </div>
              </div>
            </div>

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

    <!-- =========================================================
         New Order Notification Modal (สำหรับแจ้งเตือนฝั่ง Admin)
         ไม่มีปุ่ม Approve, ไม่มีเสียง, ไม่มีนับถอยหลัง
         ========================================================= -->
    <Transition name="fade">
      <div
        v-if="showNewOrderAlert && latestOrderAlert"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm"
      >
        <div
          class="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-stone-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150"
        >
          <!-- Header Clean Green Theme -->
          <div class="bg-emerald-700 text-white px-6 py-5">
            <div class="flex items-center justify-between">
              <div>
                <div
                  class="inline-flex justify-center items-center bg-emerald-800/60 px-3.5 py-1 rounded-md mb-1"
                >
                  <span class="relative flex h-2 w-2 mr-2">
                    <span
                      class="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"
                    ></span>
                  </span>

                  <span
                    class="text-[12px] font-bold tracking-wider uppercase text-emerald-200 leading-none pt-[2px]"
                  >
                    {{
                      state.language === "en"
                        ? "New Order Notification"
                        : "การแจ้งเตือนคำสั่งซื้อใหม่"
                    }}
                  </span>
                </div>

                <h2 class="text-2xl font-black tracking-tight mt-[4px]">
                  {{
                    state.language === "en"
                      ? "Incoming Kitchen Order!"
                      : "มีรายการออเดอร์ใหม่เข้ามา!"
                  }}
                </h2>
              </div>
            </div>
          </div>

          <!-- Order Summary -->
          <div
            class="px-6 py-5 bg-stone-50 border-b border-stone-200 flex flex-col gap-1.5"
          >
            <div class="flex justify-between items-end">
              <span
                class="text-xs font-medium text-stone-400 uppercase tracking-wide w-1/3 text-left"
              >
                {{ state.language === "en" ? "Table" : "โต๊ะ" }}
              </span>

              <span
                class="text-xs font-medium text-stone-400 uppercase tracking-wide w-1/3 text-center"
              >
                {{ state.language === "en" ? "Order Time" : "เวลาสั่งซื้อ" }}
              </span>

              <span
                class="text-xs font-medium text-stone-400 uppercase tracking-wide w-1/3 text-right"
              >
                {{ state.language === "en" ? "Order ID" : "รหัสออเดอร์" }}
              </span>
            </div>

            <div class="flex justify-between items-baseline">
              <span class="text-2xl font-bold text-stone-800 w-1/3 text-left">
                Table {{ latestOrderAlert.tableNumber }}
              </span>

              <span
                class="text-lg font-semibold text-stone-700 w-1/3 text-center"
              >
                {{ latestOrderAlert.time || "14:30" }}
              </span>

              <span
                class="text-lg font-semibold text-stone-700 font-mono w-1/3 text-right"
              >
                #{{ latestOrderAlert.orderNumber }}
              </span>
            </div>
          </div>

          <!-- Menu Items List -->
          <div class="p-6">
            <div class="space-y-3 max-h-64 overflow-y-auto pr-1">
              <div
                v-for="(item, idx) in latestOrderAlert.items"
                :key="idx"
                class="flex items-start justify-between gap-3 p-3.5 rounded-2xl bg-stone-50/80 border border-stone-200/80"
              >
                <div class="flex-1">
                  <div class="flex items-baseline gap-2">
                    <span class="text-lg font-black text-emerald-700">
                      {{ item.quantity }}&times;
                    </span>

                    <span
                      class="text-base font-bold text-stone-900 leading-snug"
                    >
                      {{ item.name }}
                    </span>
                  </div>

                  <p
                    v-if="item.note && item.note !== '-'"
                    class="mt-2 inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                  >
                    {{ item.note }}
                  </p>
                </div>

                <span
                  class="text-xs font-bold text-stone-400 whitespace-nowrap mt-1"
                >
                  {{ item.quantity }}
                  {{ state.language === "en" ? "item(s)" : "รายการ" }}
                </span>
              </div>
            </div>

            <!-- Got It / Close Button -->
            <button
              @click="closeNewOrderAlert"
              class="w-full mt-6 py-4 rounded-2xl bg-stone-800 hover:bg-stone-900 active:scale-[0.98] text-white font-extrabold text-base shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{{ state.language === "en" ? "Got It" : "รับทราบ" }}</span>
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
          class="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        >
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

          <div v-else class="flex flex-col h-full">
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

            <div class="p-6">
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
                    state.language === "en" ? "Baht." : "บาท."
                  }}</span>
                </div>
              </div>

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

              <div
                class="min-h-[260px] flex flex-col items-center justify-center"
              >
                <div
                  v-if="paymentMethod === 'qr'"
                  class="flex flex-col items-center w-full animate-in fade-in zoom-in-95 duration-200"
                >
                  <div
                    class="bg-white rounded-xl shadow-md border border-stone-200 overflow-hidden inline-block w-56 mb-3"
                  >
                    <div
                      class="bg-[#113566] py-2 text-center border-b-[3px] border-[#ed1c24]"
                    >
                      <span class="text-white font-bold tracking-widest text-xs"
                        >THAI QR PAYMENT</span
                      >
                    </div>
                    <div class="p-3 bg-white flex justify-center">
                      <img
                        :src="`https://promptpay.io/${promptpayId}/${orderTotal}.png`"
                        alt="PromptPay QR Code"
                        class="w-40 h-40 object-contain"
                      />
                    </div>
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
