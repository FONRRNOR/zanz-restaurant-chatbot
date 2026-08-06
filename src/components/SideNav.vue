<script setup>
import {
  ClipboardList,
  Home,
  LogOut,
  MenuSquare,
  Monitor,
  Settings,
  Soup,
  Utensils,
  Wine,
  Users,
  History,
  LayoutDashboard,
  LayoutGrid,
} from "@lucide/vue";

import { ref, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAppState } from "../services/appState";

defineProps({
  items: { type: Array, required: true },
  bottomLabel: { type: String, default: "" },
});

const router = useRouter();
const route = useRoute();

const { state, cartItems, t, signOut } = useAppState();

const showLogoutModal = ref(false);

const totalCartCount = computed(() => {
  const cart = state.cart || [];
  return cart.reduce((total, item) => total + (item.quantity || 0), 0);
});

const iconMap = {
  All: LayoutGrid,
  Starters: Utensils,
  "Main Courses": Soup,
  Drinks: Wine,
  "Check Order Status": ClipboardList,
  "Live Orders": Monitor,
  "Menu Items": MenuSquare,
  Dashboard: LayoutDashboard,
  "Menu Management": MenuSquare,
  Orders: ClipboardList,
  "Staff Accounts": Users,
  Logout: LogOut,
  Settings,
  "Order History": History,
  Home,
  ออเดอร์สด: Monitor,
  รายการเมนู: MenuSquare,
  ออกจากระบบ: LogOut,
};

function handleNavClick(item, event) {
  if (item.label === "Logout") {
    event.preventDefault();
    showLogoutModal.value = true;
  }
}

function confirmLogout() {
  signOut();
  localStorage.removeItem("zank-active-user");
  showLogoutModal.value = false;
  router.push("/");
}

function cancelLogout() {
  showLogoutModal.value = false;
}

function isCustomerItemActive(item) {
  if (route.path === "/customer/menu") {
    const queryCategory = route.query.category;

    if (item.label === "All")
      return (
        queryCategory === undefined ||
        queryCategory === null ||
        queryCategory === ""
      );
    if (item.label === "Starters") return queryCategory === "Starters";
    if (item.label === "Main Courses") return queryCategory === "Main Courses";
    if (item.label === "Drinks")
      return queryCategory === "Drink" || queryCategory === "Drinks";
  }
  return route.path === item.to;
}

</script>

<template>
  <aside
    class="sticky top-20 hidden w-64 shrink-0 flex-col justify-between rounded-r-3xl bg-white p-5 shadow-soft h-[calc(100vh-5rem)] lg:flex"
  >
    <div class="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
      <RouterLink
        v-if="route.path.startsWith('/customer/')"
        to="/customer/menu"
        class="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-stone-700 transition-all duration-200 hover:bg-softGreen/50"
        :class="
          isCustomerItemActive({ label: 'All' })
            ? 'bg-softGreen text-stone-950 font-black shadow-xs ring-1 ring-brand/10'
            : 'text-stone-600 bg-transparent'
        "
      >
        <component :is="iconMap['All']" :size="20" />
        {{ state.language === "en" ? "All Menu" : "เมนูทั้งหมด" }}
      </RouterLink>

      <template v-for="item in items" :key="item.label">
        <button
          v-if="item.label === 'Logout'"
          @click="showLogoutModal = true"
          class="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-stone-700 transition-all duration-200 hover:bg-red-50 hover:text-red-600"
        >
          <component :is="iconMap[item.label] || Home" :size="20" />
          {{ state.language === "en" ? "Logout" : "ออกจากระบบ" }}
        </button>

        <RouterLink
          v-else
          :to="item.to"
          class="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-stone-600 transition-all duration-200 hover:bg-softGreen/50"
          :class="
            isCustomerItemActive(item)
              ? 'bg-softGreen text-stone-950 font-black shadow-xs ring-1 ring-brand/10'
              : 'text-stone-600 bg-transparent'
          "
        >
          <component :is="iconMap[item.label] || Home" :size="20" />

          {{
            item.label === "Dashboard"
              ? state.language === "en"
                ? "Dashboard"
                : "หน้าหลัก"
              : item.label === "Menu Management"
                ? state.language === "en"
                  ? "Menu Management"
                  : "จัดการเมนูอาหาร"
                : item.label === "Orders"
                  ? state.language === "en"
                    ? "Orders"
                    : "คำสั่งซื้อ"
                  : item.label === "Staff Accounts"
                    ? state.language === "en"
                      ? "Orders"
                      : "คำสั่งซื้อ"
                    : item.label === "Staff Accounts"
                      ? state.language === "en"
                        ? "Staff Accounts"
                        : "บัญชีพนักงาน"
                      : t(item.label)
          }}
        </RouterLink>

        <!-- Condition check: When the loop encounters the 'Staff Accounts' menu and is on the owner URL, display the 'Table Management' menu immediately after -->
        <RouterLink
          v-if="
            item.label === 'Staff Accounts' && route.path.startsWith('/owner/')
          "
          to="/owner/tables"
          class="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200 hover:bg-softGreen/50"
          :class="
            route.path === '/owner/tables'
              ? 'bg-softGreen text-stone-950 font-black shadow-xs ring-1 ring-brand/10'
              : 'text-stone-600 bg-transparent'
          "
        >
          <component :is="iconMap['Table Management']" :size="20" />
          {{
            state.language === "en"
              ? "Table Management"
              : "จัดการโต๊ะและ QR Code"
          }}
        </RouterLink>

      </template>
    </div>

    <div class="mt-4 pt-4 border-t border-stone-50 shrink-0">
      <RouterLink
        v-if="bottomLabel"
        to="/customer/cart"
        class="relative flex items-center justify-center gap-2 w-full rounded-full bg-brand px-5 py-3 text-center text-sm font-bold text-white shadow-soft transition-all active:scale-95 hover:bg-brand/90"
      >
        <span>{{ t(bottomLabel) }}</span>

        <span
          v-if="totalCartCount > 0"
          class="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-black text-brand ring-2 ring-brand/20 animate-in scale-in duration-200"
        >
          {{ totalCartCount }}
        </span>
      </RouterLink>
    </div>

    <div
      v-if="showLogoutModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs"
    >
      <div
        class="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150"
      >
        <h2 class="text-lg font-black text-red-600">
          {{ state.language === "en" ? "Confirm Logout" : "ยืนยันออกจากระบบ" }}
        </h2>

        <p class="mt-3 text-sm text-stone-600 leading-relaxed">
          {{
            state.language === "en"
              ? "Are you sure you want to log out? You will need to sign in again."
              : "คุณต้องการออกจากระบบใช่หรือไม่? คุณจำเป็นต้องกรอกรหัสเข้าสู่ระบบใหม่อีกครั้งเพื่อใช้งาน"
          }}
        </p>

        <div class="mt-6 flex justify-end gap-3">
          <button
            class="rounded-xl border border-stone-200 px-4 py-2 font-medium text-stone-600 hover:bg-stone-50"
            @click="cancelLogout"
          >
            {{ state.language === "en" ? "Cancel" : "ยกเลิก" }}
          </button>

          <button
            class="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white shadow-md hover:bg-red-700 active:scale-95 transition-all"
            @click="confirmLogout"
          >
            {{ state.language === "en" ? "Logout" : "ออกจากระบบ" }}
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
