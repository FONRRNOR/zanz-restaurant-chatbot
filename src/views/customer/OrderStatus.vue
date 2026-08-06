<script setup>
import { ref, onMounted, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import ChatPanel from "../../components/ChatPanel.vue";
import MobileNav from "../../components/MobileNav.vue";
import SideNav from "../../components/SideNav.vue";
import TopBar from "../../components/TopBarCustomer.vue";
import { supabase } from "../../supabaseClient";
import { useAppState } from "../../services/appState"; // 🔥 ดึง state มาใช้สร้าง Dynamic Menu

const router = useRouter();
const route = useRoute();
const { state } = useAppState();

const orders = ref([]);
const isLoading = ref(false);

// 🔥 ดึงค่า restaurantId และ tableId จาก URL หรือ LocalStorage
const currentRestaurantId = computed(
  () => route.query.restaurantId || localStorage.getItem("zank-restaurant-id"),
);
const currentTableId = computed(
  () => route.query.tableId || localStorage.getItem("zank-table-number"),
);

// Define order stages for tracking progress
const dbSteps = ["pending", "preparing", "ready", "served"];
const displaySteps = ["Received", "Preparing", "Ready", "Served"];

// 🔥 ทำให้ SideNav อิงตามหมวดหมู่จริงเหมือนหน้า Menu
const categoryMapping = {
  Cakes: "Desserts",
  Pastries: "Desserts",
  Tarts: "Desserts",
  Bakery: "Desserts",
  Desserts: "Desserts",
  Coffee: "Drinks",
  Tea: "Drinks",
  "Non-Coffee": "Drinks",
  Drink: "Drinks",
  Drinks: "Drinks",
};

const getUIGroupName = (dbCategory) =>
  categoryMapping[dbCategory] || dbCategory;

const navItems = computed(() => {
  const baseParams = `restaurantId=${currentRestaurantId.value}${currentTableId.value ? `&tableId=${currentTableId.value}` : ""}`;

  const allGroups = (state.menuItems || []).map((item) =>
    getUIGroupName(item.category),
  );
  const uniqueGroups = [...new Set(allGroups)].filter(Boolean);

  let links = uniqueGroups.map((group) => ({
    label: group,
    to: `/customer/menu?${baseParams}&category=${encodeURIComponent(group)}`,
    short: group,
  }));

  if (links.length === 0) {
    links = [
      { label: "All Menu", to: `/customer/menu?${baseParams}`, short: "Menu" },
    ];
  }

  return [
    ...links,
    {
      label: "Check Order Status",
      to: `/customer/order-status?${baseParams}`,
      short: "Status",
    },
  ];
});

// Fetch all orders for the current table & restaurant from Supabase
async function fetchMyOrders() {
  if (!currentTableId.value || !currentRestaurantId.value) {
    console.warn("ไม่พบ Table ID หรือ Restaurant ID");
    isLoading.value = false;
    return;
  }

  // 🔥 ให้ใช้ค่า currentTableId.value ตรงๆ เลย ไม่ต้องเติม 'T-' แล้ว
  const formattedTable = currentTableId.value;

  console.log("กำลังค้นหาออเดอร์ของโต๊ะ:", formattedTable);
  console.log("รหัสร้านค้า:", currentRestaurantId.value);

  isLoading.value = true;

  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items (*)")
      .eq("table_number", formattedTable) // ค้นหาด้วย '01' ตรงๆ
      .eq("restaurant_id", currentRestaurantId.value)
      .order("created_at", { ascending: false });

    if (error) throw error;

    console.log("ข้อมูลที่ได้จาก Supabase:", data);
    orders.value = data || [];
  } catch (error) {
    console.error("Error fetching orders:", error.message);
  } finally {
    isLoading.value = false;
  }
}

// Initialize data retrieval on mount
onMounted(() => {
  fetchMyOrders();
});

// Helper to get item name or return default
function itemName(item) {
  return item.menu_name || "Unknown Item";
}

// Reset category state and navigate to menu (🔥 เพิ่ม Base Params ไม่ให้ลิงก์หลุด)
function handleBackToMenu() {
  state.selectedCategory = "All";
  const baseParams = `restaurantId=${currentRestaurantId.value}${currentTableId.value ? `&tableId=${currentTableId.value}` : ""}`;
  router.push(`/customer/menu?${baseParams}`);
}
</script>

<template>
  <div class="page-shell">
    <TopBar />
    <div class="content-shell">
      <SideNav
        :items="navItems"
        bottom-label="Back to Menu"
        @click="handleBackToMenu"
      />

      <!-- Main view container -->
      <main class="main-panel grid gap-6 xl:grid-cols-[1fr_360px]">
        <section>
          <h1 class="text-4xl font-black mb-6">Order Status</h1>

          <!-- State handling: Loading, Data available, or No orders -->
          <div
            v-if="isLoading"
            class="p-10 text-center text-stone-400 font-bold"
          >
            Loading your orders...
          </div>

          <section v-else-if="orders.length > 0">
            <!-- Iterate through orders -->
            <div
              v-for="order in orders"
              :key="order.id"
              class="section-card mt-6 p-6 animate-in fade-in duration-200"
            >
              <div class="flex justify-between items-center mb-6">
                <div>
                  <h2 class="text-xl font-black">
                    Order #{{ order.order_code || `A-${100 + order.id}` }}
                  </h2>
                  <p class="text-sm text-stone-400 mt-1">
                    Table {{ order.table_number }} ·
                    {{
                      new Date(order.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    }}
                  </p>
                </div>
              </div>

              <!-- Progress bar visualization -->
              <div class="mb-8">
                <div class="grid grid-cols-4 gap-2 mb-2">
                  <div
                    v-for="(step, index) in dbSteps"
                    :key="step"
                    class="h-2 rounded-full bg-stone-100 overflow-hidden relative"
                  >
                    <div
                      class="h-full rounded-full bg-gradient-to-l from-emerald-600 to-emerald-800 shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-all duration-[1500ms] ease-in-out"
                      :class="[
                        dbSteps.indexOf(order.status) >= index
                          ? 'w-full'
                          : 'w-0',
                        dbSteps.indexOf(order.status) === index
                          ? 'animate-loop-progress'
                          : '',
                      ]"
                    ></div>
                  </div>
                </div>
                <!-- Status labels -->
                <div
                  class="grid grid-cols-4 gap-2 text-[10px] sm:text-xs font-bold text-stone-400 uppercase text-center"
                >
                  <span v-for="label in displaySteps" :key="label">{{
                    label
                  }}</span>
                </div>
              </div>

              <!-- List items contained in the order -->
              <div class="rounded-2xl bg-stone-50 p-4">
                <div
                  v-for="(item, index) in order.order_items"
                  :key="index"
                  class="flex justify-between py-1 text-sm border-b border-stone-200/40 last:border-none"
                >
                  <span>{{ itemName(item) }} × {{ item.quantity }}</span>
                  <span class="font-bold"
                    >{{
                      (parseFloat(item.price_at_order) * item.quantity).toFixed(
                        2,
                      )
                    }}
                    Baht</span
                  >
                </div>
              </div>
            </div>
          </section>

          <section
            v-else
            class="section-card mt-6 p-6 font-bold text-muted text-center"
          >
            No active orders found.
          </section>
        </section>

        <!-- Sidebar for chat interactions -->
        <ChatPanel class="hidden xl:flex" />
      </main>
    </div>
    <MobileNav :items="navItems" />
  </div>
</template>

<style scoped>
/* Animation for active progress step */
@keyframes loop-progress {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(0%);
  }
}

.animate-loop-progress {
  animation: loop-progress 3s linear infinite;
}
</style>
