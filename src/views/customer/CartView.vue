<script setup>
import { computed, reactive, ref, watch, onMounted } from "vue";
import { Trash2 } from "@lucide/vue";
import { useRouter, useRoute } from "vue-router"; // 🔥 เพิ่ม useRoute
import MobileNav from "../../components/MobileNav.vue";
import QuantityControl from "../../components/QuantityControl.vue";
import SideNav from "../../components/SideNav.vue";
import TagList from "../../components/TagList.vue";
import TopBar from "../../components/TopBarCustomer.vue";
import ChatPanel from "../../components/ChatPanel.vue";
import { useAppState } from "../../services/appState";
import { supabase } from "../../supabaseClient";

const router = useRouter();
const route = useRoute(); // 🔥 เรียกใช้งาน route

// Fetch data and actions from the App's Global State
const {
  state,
  cartItems,
  subtotal,
  total,
  serviceFee,
  conflictItems,
  updateCartItem,
  removeFromCart,
  createOrder,
  localizeMenuItem,
} = useAppState();

// 🔥 ดึงค่า restaurantId และ tableId จาก URL หรือ State
const currentRestaurantId = computed(() => route.query.restaurantId || state.restaurantId);
const currentTableId = computed(() => route.query.tableId || state.tableId);

// 🔥 ตั้งค่า tableNumber ให้ดึงมาจากระบบ แทนการฟิกซ์ T-24
const tableNumber = ref(currentTableId.value || "");

// ถ้า URL หรือ State มีการอัปเดต ให้เลขโต๊ะอัปเดตตาม
watch(currentTableId, (newVal) => {
  if (newVal) tableNumber.value = newVal;
}, { immediate: true });

const customerNote = ref("");
const noteDrafts = reactive({});
const savedNoteId = ref("");
const isSubmitting = ref(false);
const showSuccess = ref(false);
const lastOrderId = ref(null);

// 🔥 ทำให้ SideNav อิงตามหมวดหมู่จริงเหมือนหน้า Menu 
const categoryMapping = {
  "Cakes": "Desserts", "Pastries": "Desserts", "Tarts": "Desserts",
  "Bakery": "Desserts", "Desserts": "Desserts", "Coffee": "Drinks",
  "Tea": "Drinks", "Non-Coffee": "Drinks", "Drink": "Drinks", "Drinks": "Drinks",
};

const getUIGroupName = (dbCategory) => categoryMapping[dbCategory] || dbCategory;

const navItems = computed(() => {
  const baseParams = `restaurantId=${currentRestaurantId.value}${currentTableId.value ? `&tableId=${currentTableId.value}` : ''}`;
  
  const allGroups = (state.menuItems || []).map(item => getUIGroupName(item.category));
  const uniqueGroups = [...new Set(allGroups)].filter(Boolean);

  let links = uniqueGroups.map(group => ({
    label: group,
    to: `/customer/menu?${baseParams}&category=${encodeURIComponent(group)}`,
    short: group
  }));

  return [
    ...links,
    {
      label: "Check Order Status",
      to: `/customer/order-status?${baseParams}`,
      short: "Status",
    },
  ];
});

// Calculate items with conflicts (e.g., allergens)
const conflictsById = computed(() =>
  Object.fromEntries(conflictItems.value.map((item) => [item.id, true])),
);

// Localize cart items based on the user's language settings
const localizedCartItems = computed(() =>
  cartItems.value.map(localizeMenuItem),
);

// Format order ID for customer display
const orderDisplayId = computed(() => {
  return lastOrderId.value ? `A-${100 + lastOrderId.value}` : "A-000";
});

// Watch cart items and prepare note drafts for each item
watch(
  cartItems,
  (items) => {
    items.forEach((item) => {
      if (noteDrafts[item.id] === undefined)
        noteDrafts[item.id] = item.note || "";
    });
  },
  { immediate: true },
);

// Function to save notes for individual items
function saveItemNote(item) {
  updateCartItem(item.id, { note: noteDrafts[item.id] || "" });
  savedNoteId.value = item.id;
}

// Main function to submit the order to the Database
async function submitOrder() {
  if (!cartItems.value.length || isSubmitting.value) return;
  
  // ป้องกันกรณีไม่พบเลขโต๊ะ
  if (!tableNumber.value) {
    alert("Please enter a valid table number.");
    return;
  }

  isSubmitting.value = true;

  try {
    // 1. Create an order record in the 'orders' table
    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          restaurant_id: currentRestaurantId.value, // 🔥 ส่งรหัสร้านค้าไปด้วย
          table_number: tableNumber.value, // ดึงเลขโต๊ะมาจากช่อง Input (ที่ได้ค่าตั้งต้นจาก QR Code)
          customer_note: customerNote.value,
          total_price: total.value,
          status: "pending",
        },
      ])
      .select("id")
      .single();

    if (orderError) throw orderError;

    const orderId = orderData.id;
    lastOrderId.value = orderId; 

    localStorage.setItem('zank-active-order-id', orderId);

    // 2. Prepare item data for the 'order_items' table
    const orderItemsPayload = cartItems.value.map((item) => ({
      order_id: orderId,
      menu_id: item.id,
      menu_name: item.displayName || item.name || "Unknown Menu",
      quantity: item.quantity,
      price_at_order: parseFloat(item.price) || 0,
      note: noteDrafts[item.id] || "",
    }));

    // 3. Save all food items to the Database
    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItemsPayload);

    if (itemsError) throw itemsError;

    // 4. Show success status
    showSuccess.value = true;

    // Clear cart and order state
    createOrder({
      tableNumber: tableNumber.value,
      customerNote: customerNote.value,
    });

    // Delay for 2 seconds to let the user see the success modal before redirecting
    setTimeout(() => {
      router.push(`/customer/order-confirmation/${orderId}`);
    }, 2000);
  } catch (error) {
    console.error("Supabase Error Details:", error);
    alert("Failed to submit order: " + error.message);
  } finally {
    isSubmitting.value = false;
  }
}

// Function to navigate back to the menu page
function handleBackToMenu() {
  state.selectedCategory = "All";
  const baseParams = `restaurantId=${currentRestaurantId.value}${currentTableId.value ? `&tableId=${currentTableId.value}` : ''}`;
  router.push(`/customer/menu?${baseParams}`);
}

// Calculate total item quantity in the cart to display on TopBar
const totalCartQuantity = computed(() => {
  return cartItems.value.reduce((total, item) => total + item.quantity, 0);
});
</script>

<template>
  <div class="page-shell">
    <TopBar :cart-count="totalCartQuantity" />
    <div class="content-shell">
      <SideNav
        :items="navItems"
        bottom-label="Back to Menu"
        @click="handleBackToMenu"
      />
      <!-- Main content area -->
      <main class="main-panel">
        <div class="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section>
            <h1 class="text-4xl font-black">Review Your Order</h1>
            <p class="mt-2 text-muted">Check your basket before submitting.</p>
            <p class="mt-4 text-sm text-muted">
              <strong class="text-stone-900">Preferences:</strong>
              {{ state.customerPreferences.join(", ") }}
              <button class="ml-2 font-bold text-brand">Edit</button>
            </p>

            <!-- Display items in the cart -->
            <div class="mt-6 space-y-4">
              <article
                v-for="item in localizedCartItems"
                :key="item.id"
                class="section-card grid gap-4 p-4 md:grid-cols-[140px_1fr_auto]"
              >
                <img
                  :src="item.image"
                  :alt="item.displayName"
                  class="h-32 w-full rounded-2xl object-cover md:w-36"
                />
                <div>
                  <div class="flex flex-wrap justify-between gap-3">
                    <h2 class="text-xl font-black">{{ item.displayName }}</h2>
                    <strong class="text-brand">{{ item.price }} Baht</strong>
                  </div>
                  <p class="mt-2 text-sm text-muted">
                    {{ item.displayDescription }}
                  </p>
                  <TagList
                    class="mt-3"
                    :tags="[
                      ...item.displayTasteProfiles.slice(0, 1),
                      ...item.displayDietaryTags.slice(0, 1),
                      ...item.displayAllergens
                        .map((a) => `Contains ${a}`)
                        .slice(0, 1),
                    ]"
                  />
                  <!-- Alert for food allergen conflicts -->
                  <div
                    v-if="conflictsById[item.id]"
                    class="mt-3 rounded-2xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800"
                  >
                    Warning: This item contains {{ item.allergens.join(", ") }}.
                    <button
                      class="ml-3 font-black text-red-600"
                      @click="removeFromCart(item.id)"
                    >
                      Remove
                    </button>
                    <button class="ml-3 font-black text-brand">Replace</button>
                  </div>
                  <!-- Input field for special notes on each item -->
                  <div class="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      class="field py-2"
                      :value="noteDrafts[item.id] ?? item.note"
                      placeholder="Add note"
                      @input="noteDrafts[item.id] = $event.target.value"
                    />
                    <button
                      class="secondary-btn shrink-0 py-2 text-sm"
                      @click="saveItemNote(item)"
                    >
                      Save Note
                    </button>
                  </div>
                  <p
                    v-if="savedNoteId === item.id"
                    class="mt-2 text-xs font-bold text-brand"
                  >
                    Note saved for this item.
                  </p>
                </div>
                <!-- Quantity adjustment and delete button section -->
                <div class="flex items-center justify-between gap-3 md:flex-col">
                  <QuantityControl
                    :model-value="item.quantity"
                    @update:model-value="updateCartItem(item.id, { quantity: $event })"
                  />
                  <button class="text-red-500" @click="removeFromCart(item.id)">
                    <Trash2 :size="22" />
                  </button>
                </div>
              </article>
            </div>

            <div class="mt-6 grid gap-5 lg:grid-cols-2">
              <!-- Table info and kitchen note section -->
              <section class="section-card p-5">
                <h2 class="font-black">Dining Information</h2>
                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                  <label class="text-sm font-bold">
                    Table number
                    <!-- 🔥 ผูก Input ไว้กับตัวแปร tableNumber -->
                    <input
                      v-model="tableNumber"
                      class="field mt-2"
                      placeholder="e.g., T-01"
                    />
                  </label>
                  <label class="text-sm font-bold">
                    Kitchen note
                    <input
                      v-model="customerNote"
                      class="field mt-2"
                      placeholder="e.g., no onion, less spicy"
                    />
                  </label>
                </div>
              </section>
              <!-- Order summary and checkout confirmation -->
              <section class="section-card p-5">
                <h2 class="font-black">Order Summary</h2>
                <div class="mt-4 space-y-3 text-sm">
                  <p class="flex justify-between">
                    <span>Subtotal</span><strong>{{ subtotal }} Baht</strong>
                  </p>
                  <p class="flex justify-between">
                    <span>Service Fee</span>
                    <strong>{{ cartItems.length ? serviceFee : 0 }} Baht</strong>
                  </p>
                  <p class="flex justify-between border-t border-stone-100 pt-3 text-lg">
                    <span>Total</span><strong class="text-brand">{{ total }} Baht</strong>
                  </p>
                </div>
                <button
                  class="primary-btn mt-5 w-full"
                  :disabled="isSubmitting"
                  @click="submitOrder"
                >
                  {{ isSubmitting ? "Submitting..." : "Submit Order" }}
                </button>
                <p class="mt-3 text-center text-xs text-muted">
                  Order number will be created after submitting.
                </p>
              </section>
            </div>
          </section>
          <ChatPanel class="hidden xl:flex" />
        </div>
      </main>
    </div>

    <!-- Success modal after order submission -->
    <div
      v-if="showSuccess"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
    >
      <div class="bg-white p-8 rounded-3xl shadow-2xl text-center max-w-sm w-full mx-4">
        <h2 class="text-2xl font-black text-brand">Order Sent to Kitchen!</h2>
        <p class="text-xl font-bold text-stone-800 mt-2">
          Order ID: {{ orderDisplayId }}
        </p>
        <p class="text-stone-500 mt-1">
          Your order has been successfully placed.
        </p>
      </div>
    </div>

    <MobileNav :items="navItems" />
  </div>
</template>