<script setup>
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import TopBar from "../../components/TopBarCustomer.vue";
import SideNav from "../../components/SideNav.vue";
import MobileNav from "../../components/MobileNav.vue";
import ChatPanel from "../../components/ChatPanel.vue";
import StatusPill from "../../components/StatusPill.vue";
import { supabase } from "../../supabaseClient";
import { useAppState } from "../../services/appState"; // 🔥 ดึง state มาใช้

const route = useRoute();
const router = useRouter();
const { state } = useAppState(); // 🔥 ใช้งาน state

// Reactive state for the order data and loading status
const order = ref(null);
const isLoading = ref(true);

// 🔥 ดึงค่า restaurantId และ tableId จาก URL หรือ LocalStorage
const currentRestaurantId = computed(
  () => route.query.restaurantId || localStorage.getItem("zank-restaurant-id"),
);
const currentTableId = computed(
  () => route.query.tableId || localStorage.getItem("zank-table-number"),
);

// 🔥 สร้าง Base Params เพื่อใช้ต่อท้าย URL เสมอ
const baseParams = computed(
  () =>
    `restaurantId=${currentRestaurantId.value}${currentTableId.value ? `&tableId=${currentTableId.value}` : ""}`,
);

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
  const allGroups = (state.menuItems || []).map((item) =>
    getUIGroupName(item.category),
  );
  const uniqueGroups = [...new Set(allGroups)].filter(Boolean);

  let links = uniqueGroups.map((group) => ({
    label: group,
    to: `/customer/menu?${baseParams.value}&category=${encodeURIComponent(group)}`,
    short: group,
  }));

  if (links.length === 0) {
    links = [
      {
        label: "All Menu",
        to: `/customer/menu?${baseParams.value}`,
        short: "Menu",
      },
    ];
  }

  return [
    ...links,
    {
      label: "Check Order Status",
      to: `/customer/order-status?${baseParams.value}`,
      short: "Status",
    },
  ];
});

/**
 * Fetches order data and associated items from Supabase
 * using the orderId from the URL parameter.
 */
async function fetchOrderDetails() {
  isLoading.value = true;
  try {
    const orderId = route.params.orderId;

    // 1. Fetch main order record
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!orderData) throw new Error("Order not found");

    // 2. Fetch all menu items linked to this specific order
    const { data: itemsData, error: itemsError } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    if (itemsError) throw itemsError;

    // 3. Merge order record with its items into a single reactive object
    order.value = {
      ...orderData,
      order_items: itemsData || [],
    };
  } catch (error) {
    console.error("Error loading details:", error.message);
  } finally {
    isLoading.value = false;
  }
}

// Trigger data fetch when the component is mounted
onMounted(() => {
  fetchOrderDetails();
});

// Helper function to return the item name or a fallback
function itemName(item) {
  return item.menu_name || "Unknown Item";
}

// Redirect user back to the menu and update state (🔥 พก Base Params ไปด้วย)
function handleBackToMenu() {
  state.selectedCategory = "All";
  router.push(`/customer/menu?${baseParams.value}`);
}
</script>

<template>
  <div class="page-shell h-screen flex flex-col overflow-hidden">
    <TopBar />

    <div class="content-shell flex-1 flex overflow-hidden">
      <SideNav
        :items="navItems"
        bottom-label="Back to Menu"
        @click="handleBackToMenu"
      />

      <main
        class="main-panel flex-1 h-full overflow-y-auto grid gap-6 xl:grid-cols-[1fr_360px] p-6"
      >
        <section
          v-if="isLoading"
          class="section-card flex items-center justify-center w-full max-w-2xl mx-auto p-8 text-center text-stone-400 font-bold"
        >
          Loading order details...
        </section>

        <section
          v-else-if="order"
          class="section-card w-full max-w-2xl mx-auto p-6 text-center flex flex-col justify-center"
        >
          <div
            class="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-softGreen text-2xl"
          >
            ✓
          </div>
          <h1 class="text-3xl font-black">Order Submitted</h1>
          <p class="mt-1 text-muted text-sm">
            Your order has been sent to the kitchen.
          </p>

          <p class="mt-4 text-xs font-bold text-muted">Order No.</p>
          <!-- 🔥 Fallback กรณี order_code ว่าง (ใช้เหมือนในหน้า Order Status) -->
          <p class="text-4xl font-black text-brand">
            {{ order.order_code || `A-${100 + order.id}` }}
          </p>

          <div class="mt-2"><StatusPill :status="order.status" /></div>
          <p class="mt-2 text-xs text-muted">
            Table {{ order.table_number }} ·
            {{
              new Date(order.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            }}
          </p>

          <div
            class="mt-4 rounded-3xl bg-pale p-4 text-left max-h-[250px] overflow-y-auto custom-scrollbar"
          >
            <div
              v-for="(item, index) in order.order_items"
              :key="index"
              class="py-1.5 text-sm border-b border-stone-100/50 last:border-none"
            >
              <div class="flex justify-between gap-4">
                <span>{{ itemName(item) }} × {{ item.quantity }}</span>
                <strong
                  >{{
                    (parseFloat(item.price_at_order) * item.quantity).toFixed(2)
                  }}
                  Baht</strong
                >
              </div>
              <p
                v-if="item.note"
                class="mt-0.5 rounded-2xl bg-white px-2 py-1 text-[10px] font-semibold text-muted"
              >
                Note: {{ item.note }}
              </p>
            </div>
          </div>

          <p class="mt-3 text-[11px] text-muted">
            Use your order number to check status later.
          </p>

          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <!-- 🔥 เปลี่ยนลิงก์ปุ่มให้แนบ Base Params ไปด้วย -->
            <RouterLink
              :to="`/customer/order-status?${baseParams}`"
              class="primary-btn px-4 py-2 text-sm"
              >Check Status</RouterLink
            >
            <button
              @click="handleBackToMenu"
              class="secondary-btn px-4 py-2 text-sm"
            >
              Back to Menu
            </button>
          </div>
        </section>

        <section
          v-else
          class="section-card mx-auto w-full max-w-2xl p-8 text-center font-bold text-red-500"
        >
          No order found in our system.
        </section>

        <ChatPanel class="hidden xl:flex" />
      </main>
    </div>

    <MobileNav :items="navItems" />
  </div>
</template>
