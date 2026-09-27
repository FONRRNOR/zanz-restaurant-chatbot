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
  QrCode,
} from "@lucide/vue";

import { ref, computed, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAppState } from "../../services/appState";
import { supabase } from "../../supabaseClient";

defineProps({
  items: { type: Array, required: true },
  bottomLabel: { type: String, default: "" },
});

const router = useRouter();
const route = useRoute();

const { state, cartItems, t, signOut } = useAppState();

const showLogoutModal = ref(false);
const pendingOrdersCount = ref(0); // เก็บจำนวนออเดอร์ที่รอจัดการ

const totalCartCount = computed(() => {
  const cart = state.cart || [];
  return cart.reduce((total, item) => total + (item.quantity || 0), 0);
});

// ฟังก์ชันดึงจำนวนออเดอร์ที่ค้างอยู่จาก Supabase (สำหรับ Admin / Staff)
async function fetchPendingOrdersCount() {
  try {
    // เช็คก่อนว่าอยู่หน้าแดชบอร์ด/ระบบหลังบ้านหรือไม่ (เพื่อประหยัดการเรียกข้อมูลถ้าเป็นลูกค้า)
    if (route.path.startsWith('/customer/')) return;

    // ตัวอย่าง: ดึงออเดอร์ที่มีสถานะรอดำเนินการหรือกำลังทำอยู่ (ปรับเปลี่ยนสถานะตามตารางฐานข้อมูลจริงของคุณได้ครับ)
    const { count, error } = await supabase
      .from('orders') // ชื่อตารางออเดอร์ใน Supabase ของคุณ
      .select('*', { count: 'exact', head: true })
     .in('status', ['preparing', 'ready', 'pending']); // ดักจับสถานะที่ยังไม่เสร็จ

    if (!error && count !== null) {
      pendingOrdersCount.value = count;
    }
  } catch (err) {
    console.error("Error fetching pending orders count:", err);
  }
}

// กำหนดไอคอนให้ครอบคลุมชื่อกลุ่ม
const iconMap = {
  All: LayoutGrid,
  Starters: Utensils,
  "Main Courses": Soup,
  Drinks: Wine,
  Desserts: Utensils,
  "Check Order Status": ClipboardList,
  "Live Orders": Monitor,
  "Menu Items": MenuSquare,
  Dashboard: LayoutDashboard,
  "Menu Management": MenuSquare,
  "Table Management": QrCode,
  Orders: ClipboardList,
  "Staff Accounts": Users,
  Logout: LogOut,
  Settings,
  "Order History": History,
  Home,
  ออเดอร์สด: Monitor,
  รายการเมนู: MenuSquare,
  จัดการโต๊ะ: QrCode,
  ออกจากระบบ: LogOut,
};

function confirmLogout() {
  signOut();
  sessionStorage.removeItem("zank-active-user");
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
    if (item.label === "All") {
      return !queryCategory;
    }
    return queryCategory === item.label;
  }
  return route.path === item.to;
}

onMounted(() => {
  fetchPendingOrdersCount();
  // สามารถทำ Realtime หรือ Interval สั้นๆ คอยเช็คออเดอร์ใหม่ได้ถ้าต้องการ
});
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
          class="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-stone-700 transition-all duration-200 hover:bg-red-50 hover:text-red-600 cursor-pointer"
        >
          <component :is="iconMap[item.label] || Home" :size="20" />
          {{ state.language === "en" ? "Logout" : "ออกจากระบบ" }}
        </button>

        <RouterLink
          v-else
          :to="item.to"
          class="flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200 hover:bg-softGreen/50"
          :class="
            isCustomerItemActive(item)
              ? 'bg-softGreen text-stone-950 font-black shadow-xs ring-1 ring-brand/10'
              : 'text-stone-600 bg-transparent'
          "
        >
          <!-- ฝั่งซ้าย: ไอคอน + ชื่อเมนู -->
          <div class="flex items-center gap-3">
            <component :is="iconMap[item.label] || Home" :size="20" />
            <span>
              {{
                item.label === "Dashboard"
                  ? state.language === "en"
                    ? "Dashboard"
                    : "หน้าหลัก"
                  : item.label === "Menu Management"
                    ? state.language === "en"
                      ? "Menu Management"
                      : "จัดการเมนูอาหาร"
                    : item.label === "Table Management"
                      ? state.language === "en"
                        ? "Table Management"
                        : "จัดการโต๊ะและ QR Code"
                      : item.label === "Orders"
                        ? state.language === "en"
                          ? "Orders"
                          : "คำสั่งซื้อ"
                        : item.label === "Staff Accounts"
                          ? state.language === "en"
                            ? "Staff Accounts"
                            : "บัญชีพนักงาน"
                          : t(item.label)
              }}
            </span>
          </div>

          <!-- ฝั่งขวา: Badge แสดงตัวเลขจำนวนออเดอร์ (แสดงเฉพาะเมนู Orders หรือ ออเดอร์สด) -->
          <span
            v-if="(item.label === 'Orders' || item.label === 'Live Orders' || item.label === 'ออเดอร์สด') && pendingOrdersCount > 0"
            class="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-black text-white shadow-xs animate-pulse"
          >
            {{ pendingOrdersCount }}
          </span>
        </RouterLink>

        <!-- แสดง Table Management ต่อจาก Staff Accounts เมื่ออยู่ในโหมด Owner -->
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

    <!-- Modal ยืนยันออกจากระบบ -->
    <Teleport to="body">
      <div
        v-if="showLogoutModal"
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-opacity"
      >
        <div
          class="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 relative z-10"
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
              class="rounded-xl border border-stone-200 px-4 py-2 font-medium text-stone-600 hover:bg-stone-50 cursor-pointer"
              @click="cancelLogout"
            >
              {{ state.language === "en" ? "Cancel" : "ยกเลิก" }}
            </button>
            <button
              class="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white shadow-md hover:bg-red-700 active:scale-95 transition-all cursor-pointer"
              @click="confirmLogout"
            >
              {{ state.language === "en" ? "Logout" : "ออกจากระบบ" }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </aside>
</template>