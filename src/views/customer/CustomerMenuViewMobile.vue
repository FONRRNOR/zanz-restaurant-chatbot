<script setup>
import { ref, computed, watch, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase } from "../../supabaseClient";
import { useAppState } from "../../services/appState";
import TopBarCustomer from "../../components/TopBarCustomer.vue";
import { Plus, Minus } from "lucide-vue-next";

// นำเข้า useSession สำหรับจัดการข้อมูลลูกค้า
import { useSession } from "../../composables/useSession";

const { state } = useAppState();
const route = useRoute();
const router = useRouter();
const loading = ref(true);

// 🔴 ตัวแปรสำหรับเช็คว่าโต๊ะถูกเคลียร์หรือยัง
const isSessionExpired = ref(false);

const { saveSession, loadSession } = useSession();
const customerInfo = ref(null);

// โยนค่าจาก URL เข้า Global State
watch(
  () => [route.query.restaurantName, route.query.tableId],
  ([name, table]) => {
    if (name) state.restaurantName = name;
    if (table) state.tableNumber = table;
  },
  { immediate: true },
);

const targetMenuId = computed(() => route.query.idmenu || null);

// --- State สำหรับ Modal ---
const showModal = ref(false);
const selectedItem = ref(null);

const openModal = (item) => {
  selectedItem.value = item;
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  setTimeout(() => {
    selectedItem.value = null;
  }, 300);
};

// --- เช็คการเลื่อนจอ ---
const isScrolling = ref(false);
let scrollTimeout = null;
let realtimeChannel = null; // ตัวแปรเก็บช่องสัญญาณ Realtime

const handleScroll = () => {
  isScrolling.value = true;
  if (scrollTimeout) clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    isScrolling.value = false;
  }, 300);
};

// เคลียร์การทำงานเมื่อออกจากหน้า
onUnmounted(() => {
  if (scrollTimeout) clearTimeout(scrollTimeout);
  // ยกเลิกการดักฟัง Realtime เมื่อปิดหน้าจอ
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
});

// 💡 ฟังก์ชันเช็คสถานะโต๊ะจาก database ก่อนโหลดหน้าเว็บ
// 💡 ฟังก์ชันเช็คและรีเซ็ตสถานะโต๊ะอัตโนมัติเมื่อลูกค้าสแกนเข้ามาใหม่
async function checkTableStatus(resId, tabId) {
  try {
    const { data, error } = await supabase
      .from("table_sessions")
      .select("status")
      .eq("table_id", tabId)
      .single();

    if (error) throw error;

    // ถ้าระบบพบว่าโต๊ะนี้สถานะเป็น available (ถูกเคลียร์ไปแล้ว)
    // หมายถึงมีลูกค้าใหม่สแกนเข้ามา! เราต้องทำการอัปเดตให้โต๊ะนี้กลับมาเปิดใช้งาน
    if (data && data.status === "available") {
      const { error: updateError } = await supabase
        .from("table_sessions")
        .update({ status: "occupied", cart_items: [] }) // เปลี่ยนสถานะกลับเป็นใช้งาน และล้างตะกร้าเก่า
        .eq("table_id", tabId);

      if (updateError) throw updateError;
    }

    // ผ่านฉลุย ให้ทำงานต่อได้ปกติ (ไม่ล็อกหน้าจอ)
    isSessionExpired.value = false;
    return true;
  } catch (err) {
    console.error("Error checking/resetting table status:", err);
    return true; // ป้องกันเว็บติดขัดถ้า query พลาด
  }
}

// 💡 ดึงข้อมูลเมนู
async function fetchMenuData() {
  const restaurantId = route.query.restaurantId;
  if (!restaurantId || isSessionExpired.value) {
    loading.value = false;
    return;
  }

  try {
    loading.value = true;
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("is_deleted", false)
      .eq("availability", "available")
      .order("id", { ascending: true });

    if (error) throw error;

    state.menuItems = (data || []).map((item) => ({
      ...item,
      priceNum: parseFloat(item.price) || 0,
    }));

    if (targetMenuId.value && state.menuItems.length > 0) {
      const itemToOpen = state.menuItems.find(
        (item) => String(item.id) === String(targetMenuId.value),
      );
      if (itemToOpen) openModal(itemToOpen);
    }
  } catch (err) {
    console.error("Error fetching menu:", err);
  } finally {
    loading.value = false;
  }
}

const menuContainerRef = ref(null);

watch(
  () => state.selectedCategory,
  async () => {
    await nextTick();
    if (menuContainerRef.value) {
      menuContainerRef.value.scrollTo({ top: 0, behavior: "smooth" });
    }
  },
);

const filteredMenu = computed(() => {
  if (!state.menuItems) return [];
  let items = state.menuItems;
  if (state.searchQuery && state.searchQuery.trim() !== "") {
    const query = state.searchQuery.toLowerCase().trim();
    items = items.filter((item) => {
      const matchEng = item.name && item.name.toLowerCase().includes(query);
      const matchTh =
        item.name_th && item.name_th.toLowerCase().includes(query);
      return matchEng || matchTh;
    });
  } else if (state.selectedCategory !== "All" && state.selectedCategory) {
    items = items.filter((item) => item.category === state.selectedCategory);
  }
  return items;
});

// ==========================================
// 💡 ระบบ Table Session และ Real-time Cart
// ==========================================
async function initializeCustomerSession(resId, tabId) {
  if (!resId || !tabId) return;

  let sessionData = loadSession("customer_session");
  if (!sessionData) {
    sessionData = {
      id: "c_" + Date.now().toString(36) + Math.random().toString(36).substr(2),
      name: "Guest_" + Math.floor(Math.random() * 1000),
    };
    saveSession("customer_session", sessionData);
  }
  customerInfo.value = sessionData;

  try {
    const { error } = await supabase.rpc("join_table_session", {
      p_table_id: tabId,
      p_restaurant_id: resId,
      p_customer_id: customerInfo.value.id,
      p_customer_name: customerInfo.value.name,
    });
    if (error) throw error;
  } catch (err) {
    console.error("Error joining table:", err.message);
  }
}

// 💡 1. ฟังก์ชันรับ-ส่งสัญญาณ Realtime จาก Database
const setupRealtimeCart = (resId, tabId) => {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);

  // ดักฟังตาราง table_sessions เฉพาะของโต๊ะนี้
  realtimeChannel = supabase
    .channel(`cart_sync_${tabId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "table_sessions",
        filter: `table_id=eq.${tabId}`,
      },
      (payload) => {
        // 🔴 เช็คว่าโต๊ะถูกเคลียร์แล้วหรือไม่
        if (
          payload.new.status === "available" &&
          (payload.old.status !== "available" ||
            payload.old.status === undefined)
        ) {
          // ล้างข้อมูลตะกร้าในหน้าจอ และ sessionStorage
          state.cart = [];
          sessionStorage.removeItem(`cart_${resId}_${tabId}`);
          localStorage.removeItem("customer_session");

          // ล็อกหน้าจอทันที
          isSessionExpired.value = true;
          return;
        }

        // เมื่อมีคนอื่นอัปเดตตะกร้า ให้อัปเดตข้อมูลบนหน้าจอเราทันที
        const newCartItems = payload.new.cart_items || [];
        state.cart = newCartItems;
      },
    )
    .subscribe();
};

// 💡 2. ฟังก์ชันอัปเดตข้อมูลตะกร้าขึ้น Database ทันทีที่กด
const syncCartToServer = async (currentCart) => {
  const resId = route.query.restaurantId;
  const tabId = route.query.tableId;
  if (!resId || !tabId) return;

  try {
    await supabase.rpc("sync_table_cart", {
      p_table_id: tabId,
      p_restaurant_id: resId,
      p_cart_items: currentCart,
    });
  } catch (err) {
    console.error("Error syncing cart to server:", err);
  }
};

const cartCount = computed(() => (state.cart ? state.cart.length : 0));
const cartTotal = computed(() => {
  if (!state.cart || state.cart.length === 0) return 0;
  return state.cart.reduce((sum, item) => {
    return sum + (Number(item.priceNum) || Number(item.price) || 0);
  }, 0);
});

// 💡 3. แก้ไขการกดเพิ่ม-ลดอาหาร ให้ซิงค์ขึ้นเซิร์ฟเวอร์
const addToCart = async (item) => {
  let currentCart = state.cart ? [...state.cart] : [];
  currentCart.push({
    ...item,
    added_by_name: customerInfo.value?.name,
    added_by_id: customerInfo.value?.id,
  });

  state.cart = currentCart;
  await syncCartToServer(currentCart);
};

const removeFromCart = async (itemId) => {
  if (!state.cart) return;
  let currentCart = [...state.cart];
  const index = currentCart.findIndex((cartItem) => cartItem.id === itemId);

  if (index !== -1) {
    currentCart.splice(index, 1);
    state.cart = currentCart;
    await syncCartToServer(currentCart);
  }
};

const initCart = () => {
  const resId = route.query.restaurantId;
  const tabId = route.query.tableId;
  if (!resId || !tabId) return;

  const savedCart = sessionStorage.getItem(`cart_${resId}_${tabId}`);
  if (savedCart) {
    try {
      state.cart = JSON.parse(savedCart);
    } catch (e) {
      state.cart = [];
    }
  } else {
    state.cart = [];
  }
};

// 💡 ปรับปรุง Watch เพื่อเช็คสถานะโต๊ะก่อนทำงานทุกครั้งที่ query เปลี่ยน
watch(
  () => [route.query.restaurantId, route.query.tableId],
  async ([resId, tabId]) => {
    if (resId && tabId) {
      isSessionExpired.value = false;

      // 1. เช็คว่าโต๊ะเปิดใช้งานอยู่หรือไม่
      const isOpen = await checkTableStatus(resId, tabId);
      if (!isOpen) return; // ถ้าโต๊ะเคลียร์ไปแล้ว หยุดการทำงาน (โชว์หน้า Lock)

      // 2. ถ้าปกติ โหลดเมนูและ Session ต่อ
      initCart();
      await fetchMenuData();
      await initializeCustomerSession(resId, tabId);
      setupRealtimeCart(resId, tabId);
    }
  },
  { immediate: true },
);

watch(
  () => state.cart,
  (newCart) => {
    const resId = route.query.restaurantId;
    const tabId = route.query.tableId;
    if (resId && tabId && newCart) {
      sessionStorage.setItem(`cart_${resId}_${tabId}`, JSON.stringify(newCart));
    }
  },
  { deep: true },
);

// --- Helper Functions ---
const getMenuName = (item) =>
  state.language === "th" && item.name_th ? item.name_th : item.name;
const getMenuDescription = (item) =>
  state.language === "th" && item.description_th
    ? item.description_th
    : item.description;
const getMenuAllergens = (item) =>
  state.language === "th" && item.allergens_th
    ? item.allergens_th
    : item.allergens;
const formatAllergens = (allergens) => {
  if (!allergens) return "";
  if (Array.isArray(allergens)) return allergens.join(", ");
  if (typeof allergens === "string") {
    try {
      const parsed = JSON.parse(allergens);
      if (Array.isArray(parsed)) return parsed.join(", ");
    } catch (e) {
      return allergens.replace(/[\[\]"]/g, "");
    }
  }
  return allergens;
};

const getItemQuantity = (itemId) => {
  if (!state.cart) return 0;
  return state.cart.filter((cartItem) => cartItem.id === itemId).length;
};

const goToOrder = () => {
  router.push({
    path: "/order",
    query: {
      restaurantId: route.query.restaurantId,
      tableId: route.query.tableId,
    },
  });
};
</script>

<template>
  <div
    class="mobile-shell flex flex-col h-screen bg-white overflow-hidden relative"
  >
    <!-- 🔴 หน้าจอ Lock: แสดงเมื่อบิลเคลียร์แล้ว -->
    <div
      v-if="isSessionExpired"
      class="flex-1 flex flex-col items-center justify-center p-6 text-center z-50 bg-stone-50"
    >
      <div
        class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 shadow-sm"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-10 w-10 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <h1 class="text-2xl font-bold text-stone-800 mb-2">
        {{
          state.language === "th"
            ? "ขอบคุณที่ใช้บริการครับ"
            : "Thank you for dining with us"
        }}
      </h1>
      <p class="text-stone-600 mb-6">
        {{
          state.language === "th"
            ? "บิลนี้ถูกชำระเงินและโต๊ะถูกเคลียร์เรียบร้อยแล้ว"
            : "This bill has been paid and the table has been cleared."
        }}
      </p>
      <div class="bg-red-50 p-4 rounded-xl border border-red-100">
        <p class="text-red-500 font-semibold text-sm">
          {{
            state.language === "th"
              ? "หากต้องการสั่งอาหารเพิ่ม กรุณาสแกน QR Code ที่โต๊ะใหม่อีกครั้งครับ"
              : "If you would like to order more, please scan the QR code at your table again."
          }}
        </p>
      </div>
    </div>

    <!-- หน้าจอ Loading -->
    <div
      v-else-if="loading"
      class="flex-1 flex items-center justify-center text-stone-400 font-bold"
    >
      {{ state.language === "th" ? "กำลังโหลดเมนู..." : "Loading menu..." }}
    </div>

    <!-- 🟢 หน้าจอ Menu ปกติ -->
    <template v-else>
      <TopBarCustomer class="sticky top-0 z-20" />

      <!-- Menu List -->
      <main
        ref="menuContainerRef"
        class="flex-1 overflow-y-auto px-4 pb-32 pt-2"
        @scroll="handleScroll"
      >
        <div class="flex flex-col">
          <div
            v-for="item in filteredMenu"
            :key="item.id"
            @click="openModal(item)"
            class="flex gap-4 items-start py-6 border-b border-dashed border-stone-200 last:border-none cursor-pointer hover:bg-stone-50 transition-colors rounded-xl px-2 -mx-2"
          >
            <!-- รูปภาพ -->
            <div
              class="w-24 h-24 rounded-2xl bg-stone-100 flex-shrink-0 overflow-hidden shadow-sm"
            >
              <img
                v-if="item.image"
                :src="item.image"
                class="w-full h-full object-cover"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center text-stone-300 text-xs text-center p-2"
              >
                {{ state.language === "th" ? "ไม่มีรูปภาพ" : "No Image" }}
              </div>
            </div>

            <!-- รายละเอียดทั้งหมด -->
            <div
              class="flex-1 min-h-[6rem] flex flex-col justify-between min-w-0 py-1"
            >
              <div>
                <h3
                  class="font-bold text-stone-900 text-base leading-snug line-clamp-2 break-words whitespace-normal"
                >
                  {{ getMenuName(item) }}
                </h3>

                <p
                  v-if="item.allergens || item.allergens_th"
                  class="text-xs text-stone-500 mt-1 line-clamp-1 break-words whitespace-normal"
                >
                  <span class="font-medium">{{
                    state.language === "th" ? "สารก่อภูมิแพ้:" : "Allergens:"
                  }}</span>
                  {{ formatAllergens(getMenuAllergens(item)) }}
                </p>
              </div>

              <div class="flex justify-between items-center mt-3">
                <p class="font-bold text-stone-900 text-lg">
                  {{ item.priceNum ? item.priceNum.toLocaleString() : 0 }} B.
                </p>

                <div class="h-10 flex justify-end items-center">
                  <button
                    v-if="getItemQuantity(item.id) === 0"
                    @click.stop="addToCart(item)"
                    class="touch-manipulation w-9 h-9 rounded-full border border-stone-200 text-stone-900 flex items-center justify-center active:scale-95 transition-transform hover:bg-stone-100 hover:border-stone-300 bg-white shadow-sm flex-shrink-0"
                  >
                    <Plus
                      :size="18"
                      stroke-width="2.5"
                      class="text-stone-500"
                    />
                  </button>

                  <div
                    v-else
                    class="flex items-center gap-2 bg-white border border-stone-200 rounded-full p-1 shadow-sm animate-fade-in"
                    @click.stop
                  >
                    <button
                      @click.stop="removeFromCart(item.id)"
                      class="touch-manipulation w-8 h-8 rounded-full flex items-center justify-center bg-stone-100 text-stone-600 hover:bg-stone-200 active:scale-95 transition-transform flex-shrink-0"
                    >
                      <Minus :size="14" stroke-width="3" />
                    </button>

                    <span
                      class="w-7 text-center text-md font-bold text-stone-900 flex-shrink-0"
                    >
                      {{ getItemQuantity(item.id) }}
                    </span>

                    <button
                      @click.stop="addToCart(item)"
                      class="touch-manipulation w-8 h-8 rounded-full flex items-center justify-center bg-stone-900 text-white hover:bg-stone-800 active:scale-95 transition-transform flex-shrink-0"
                    >
                      <Plus :size="14" stroke-width="3" class="text-white" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- Fixed Bottom Cart Bar -->
      <div
        :class="[
          'fixed bottom-0 left-0 right-0 p-4 z-30',
          'transition-all duration-700 ease-out',
          cartCount > 0 && !isScrolling
            ? 'translate-y-0 opacity-100'
            : 'translate-y-full opacity-0 pointer-events-none',
        ]"
      >
        <button
          @click="goToOrder"
          class="touch-manipulation w-full bg-stone-900 text-white py-4 rounded-2xl font-black flex justify-between items-center px-6 active:scale-[0.99] transition-transform shadow-lg"
        >
          <span>
            {{ state.language === "th" ? "ดูตะกร้า" : "View Cart" }}
            <span class="mx-1.5 opacity-60">•</span>
            {{ cartCount }}
            {{
              state.language === "th"
                ? "รายการ"
                : cartCount === 1
                  ? "item"
                  : "items"
            }}
          </span>
          <span>{{ cartTotal.toLocaleString() }} B.</span>
        </button>
      </div>

      <!-- ================= Modal ================= -->
      <Transition name="fade">
        <div
          v-if="showModal"
          class="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/60 backdrop-blur-sm"
          @click="closeModal"
        >
          <Transition name="zoom">
            <div
              v-if="showModal && selectedItem"
              @click.stop
              class="bg-white w-full max-w-[340px] rounded-3xl overflow-hidden flex flex-col shadow-2xl relative"
            >
              <div class="relative h-60 w-full bg-stone-100 flex-shrink-0">
                <img
                  v-if="selectedItem.image"
                  :src="selectedItem.image"
                  class="w-full h-full object-cover"
                />
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center text-stone-400"
                >
                  {{
                    state.language === "th"
                      ? "ไม่มีรูปภาพ"
                      : "No Image Available"
                  }}
                </div>

                <button
                  @click="closeModal"
                  class="absolute top-4 right-4 w-7 h-7 bg-black/40 hover:bg-black/50 transition-colors rounded-full flex items-center justify-center text-white backdrop-blur-sm"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div class="p-5 pb-8 text-left">
                <h2
                  class="text-xl font-bold text-stone-900 leading-snug mb-3 break-words whitespace-normal"
                >
                  {{ getMenuName(selectedItem) }}
                </h2>

                <p
                  v-if="getMenuDescription(selectedItem)"
                  class="text-sm text-stone-600 mb-5 leading-relaxed break-words whitespace-normal"
                >
                  {{ getMenuDescription(selectedItem) }}
                </p>

                <div class="space-y-1.5">
                  <p class="text-[13px] text-stone-400 font-medium">
                    {{
                      state.language === "th"
                        ? "ข้อมูลอาหาร"
                        : "Food Information"
                    }}
                  </p>
                  <p class="text-[14px] text-stone-600 leading-relaxed">
                    {{
                      state.language === "th"
                        ? "สารก่อภูมิแพ้: ประกอบด้วย:"
                        : "Allergen Information: Contains:"
                    }}
                    {{
                      selectedItem.allergens || selectedItem.allergens_th
                        ? formatAllergens(getMenuAllergens(selectedItem))
                        : state.language === "th"
                          ? "ไม่มี"
                          : "None"
                    }}
                  </p>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </template>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.zoom-enter-active,
.zoom-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.zoom-enter-from,
.zoom-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
