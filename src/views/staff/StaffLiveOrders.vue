<script setup>
import { onMounted, onUnmounted, watch, computed } from "vue";
import { useRouter } from "vue-router";
import MobileNav from "../../components/common/MobileNav.vue";
import SideNav from "../../components/common/SideNav.vue";
import StatusPill from "../../components/common/StatusPill.vue";
import TopBar from "../../components/common/TopBar.vue";
import IncomingOrderModal from "../../components/order/IncomingOrderModal.vue";
import { useAppState } from "../../services/appState";
import { useIncomingOrderModal } from "../../composables/shared/useIncomingOrderModal.js";
import { useStaffOrders } from "../../composables/staff/useStaffOrders.js";

const router = useRouter();
const { state, signOut } = useAppState();

const { showNewOrderModal, unlockAudio } = useIncomingOrderModal();
const {
  activeFilter,
  restaurantId,
  filteredOrders,
  fetchOrders,
  updateOrderStatus,
  setupRealtimeSubscription,
  cleanupRealtime,
} = useStaffOrders(state, showNewOrderModal);

let globalChannel = null;

onMounted(() => {
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

watch(
  () => state.language,
  () => {
    if (restaurantId.value) {
      fetchOrders();
    }
  },
);

onUnmounted(() => {
  cleanupRealtime();
});

const columns = computed(() => [
  {
    status: "new",
    title: state.language === "en" ? "1. New Orders" : "1. ออเดอร์ใหม่",
    action: state.language === "en" ? "Start Cooking" : "เริ่มทำอาหาร",
    next: "preparing",
  },
  {
    status: "preparing",
    title: state.language === "en" ? "2. Cooking" : "2. กำลังปรุง",
    action: state.language === "en" ? "Mark Ready" : "ปรุงเสร็จแล้ว",
    next: "ready",
  },
  {
    status: "ready",
    title: state.language === "en" ? "3. Ready to Serve" : "3. พร้อมเสิร์ฟ",
    action: state.language === "en" ? "Mark Served" : "เสิร์ฟแล้ว",
    next: "served",
  },
  {
    status: "served",
    title:
      state.language === "en" ? "4. Served (Dine-in)" : "4. เสิร์ฟเรียบร้อย",
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
            <!-- Column Header -->
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
