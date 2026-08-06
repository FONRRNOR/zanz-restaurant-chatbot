<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import MobileNav from "../../components/MobileNav.vue";
import SideNav from "../../components/SideNav.vue";
import StatusPill from "../../components/StatusPill.vue";
import TopBar from "../../components/TopBar.vue";
import { useAppState } from "../../services/appState";
import { supabase } from "../../supabaseClient";

const router = useRouter();
const { state, signOut } = useAppState();

const showExitModal = ref(false);
const dbLiveOrdersCount = ref(0);
const recentOrders = ref([]);
const restaurantName = ref("");
const restaurantId = ref("");
const menuItemsList = ref([]);

const ownerNav = [
  { label: "Dashboard", to: "/owner/dashboard", short: "Home" },
  { label: "Menu Management", to: "/owner/menu-management", short: "Menu" },
  { label: "Orders", to: "/owner/orders" },
  { label: "Staff Accounts", to: "/owner/staff-accounts", short: "Staff" },
  { label: "Logout", to: "/logout", short: "Logout" },
];

const liveOrders = computed(() => dbLiveOrdersCount.value);
const availableItemsCount = computed(
  () =>
    menuItemsList.value.filter((item) => item.availability === "available")
      .length,
);
const soldOutItemsList = computed(() =>
  menuItemsList.value.filter((item) => item.availability === "sold_out"),
);

// Function to determine status color styling
const getStatusStyle = (status) => {
  switch (status) {
    case "pending":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "preparing":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "ready":
      return "bg-green-100 text-green-700 border-green-200";
    case "served":
      return "bg-stone-100 text-stone-600 border-stone-200";
    default:
      return "bg-gray-100 text-gray-600 border-gray-200";
  }
};

function confirmExit() {
  signOut();
  sessionStorage.removeItem("zank-active-user");
  showExitModal.value = false;
  router.push("/owner/login");
}

async function initializeDashboard() {
  try {
    const savedUserJson = sessionStorage.getItem("zank-active-user"); 
    if (!savedUserJson) return;
    const localUser = JSON.parse(savedUserJson);
    restaurantId.value = localUser.restaurant_id;

    // 1. Fetch menu data
    const { data: menuData } = await supabase
      .from("menu_items")
      .select("*")
      .is("is_deleted", false)
      .eq("restaurant_id", restaurantId.value);
    if (menuData) menuItemsList.value = menuData;

    // 2. Fetch the count of Live Orders (from the orders table)
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "preparing", "ready", "served"]);
    dbLiveOrdersCount.value = count || 0;

    // 3. Fetch the list of Recent Orders (from the orders table)
    const { data: orderData } = await supabase
      .from("orders")
      .select("order_code, table_number, status, created_at")
      .order("created_at", { ascending: true })
      .limit(5);
    if (orderData) {
      recentOrders.value = orderData.map((o) => ({
        ...o,
        time: new Date(o.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));
    }
  } catch (error) {
    console.error("Dashboard error:", error.message);
  }
}

onMounted(initializeDashboard);
</script>

<template>
  <div class="page-shell">
    <TopBar owner />
    <div class="content-shell">
      <SideNav :items="ownerNav" />
      <main class="main-panel">
        <h1 class="text-4xl font-black mb-6">
          {{
            state.language === "en"
              ? "Owner Dashboard"
              : "หน้าหลักสำหรับเจ้าของร้าน"
          }}
        </h1>

        <!-- Stats Cards Section -->
        <section class="grid gap-5 md:grid-cols-3">
          <!-- Live Orders -->
          <article class="section-card p-5">
            <p class="text-sm font-bold text-muted">
              {{
                state.language === "en" ? "Live Orders" : "คำสั่งซื้อปัจจุบัน"
              }}
            </p>
            <strong class="mt-2 block text-4xl text-brand">{{
              liveOrders
            }}</strong>
            <span class="text-xs text-stone-500 font-medium">
              {{
                state.language === "en"
                  ? "Currently active in system"
                  : "กำลังดำเนินการในระบบ"
              }}
            </span>
          </article>

          <!-- Available Items -->
          <article class="section-card p-5">
            <p class="text-sm font-bold text-muted">
              {{ state.language === "en" ? "Available Items" : "เมนูพร้อมขาย" }}
            </p>
            <strong class="mt-2 block text-4xl text-brand">{{
              availableItemsCount
            }}</strong>
            <span class="text-xs text-stone-500 font-medium">
              {{
                state.language === "en"
                  ? "Ready for ordering"
                  : "พร้อมให้ลูกค้าสั่งได้ทันที"
              }}
            </span>
          </article>

          <!-- Sold Out Items -->
          <article class="section-card p-5">
            <p class="text-sm font-bold text-muted">
              {{ state.language === "en" ? "Sold Out Items" : "เมนูที่หมด" }}
            </p>
            <strong class="mt-2 block text-4xl text-brand">{{
              soldOutItemsList.length
            }}</strong>
            <span class="text-xs text-stone-500 font-medium">
              {{
                state.language === "en"
                  ? "Items currently hidden"
                  : "รายการที่ปิดการขายชั่วคราว"
              }}
            </span>
          </article>
        </section>

        <!-- Recent Orders & Menu Availability Section -->
        <section class="mt-6 grid gap-5 xl:grid-cols-[1fr_320px]">
          <!-- Recent Orders List -->
          <article class="section-card overflow-hidden">
            <div class="border-b border-stone-100 p-5">
              <h2 class="font-black">
                {{
                  state.language === "en" ? "Recent Orders" : "คำสั่งซื้อล่าสุด"
                }}
              </h2>
            </div>
            <div class="divide-y divide-stone-100">
              <div
                v-for="order in recentOrders"
                :key="order.order_code"
                class="grid items-center gap-4 p-5 hover:bg-stone-50 transition-colors"
                style="grid-template-columns: 80px 1fr 120px 60px"
              >
                <strong class="text-brand font-bold text-lg"
                  >#{{ order.order_code }}</strong
                >
                <span class="text-stone-600 truncate">
                  {{ state.language === "en" ? "Table" : "โต๊ะ" }}
                  {{ order.table_number }}
                </span>
                <div class="flex justify-start">
                  <span
                    :class="[
                      'px-3 py-1 rounded-full text-xs font-bold border text-center w-24',
                      getStatusStyle(order.status),
                    ]"
                  >
                    {{ order.status.toUpperCase() }}
                  </span>
                </div>
                <span
                  class="text-sm text-stone-400 font-medium text-right whitespace-nowrap"
                >
                  {{ order.time }}
                </span>
              </div>
            </div>
          </article>

          <!-- Menu Availability Status -->
          <article class="section-card p-5">
            <h2 class="font-black">
              {{
                state.language === "en"
                  ? "Menu Availability"
                  : "สถานะรายการเมนู"
              }}
            </h2>
            <div class="mt-4 space-y-3">
              <p
                v-for="item in soldOutItemsList"
                :key="item.id"
                class="flex items-center justify-between rounded-2xl bg-pale px-4 py-3 text-sm"
              >
                <span class="font-bold">
                  {{
                    state.language === "th"
                      ? item.name_th || item.name
                      : item.name
                  }}
                </span>
                <StatusPill status="sold_out" />
              </p>
            </div>
          </article>
        </section>
      </main>
    </div>
  </div>
</template>