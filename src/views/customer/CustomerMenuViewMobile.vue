<script setup>
import { ref, computed, watch, onUnmounted, nextTick, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase } from "../../supabaseClient";
import { useAppState } from "../../services/appState";
import TopBarCustomer from "../../components/common/TopBarCustomer.vue";
import { Plus, Minus, Bot } from "lucide-vue-next";
import AiChatModal from "../../components/chat/AiChatModal.vue";
import RecommendationModal from "../../components/menu/RecommendationModal.vue";
import OrderUpdateModal from "../../components/order/OrderUpdateModal.vue";
import { useSession } from "../../composables/useSession";

const { state } = useAppState();
const route = useRoute();
const router = useRouter();
const loading = ref(true);

const isSessionExpired = ref(false);
const { saveSession, loadSession } = useSession();
const customerInfo = ref(null);

// Variables for Order Update Modal
const isOrderModalOpen = ref(false);
const latestOrderUpdate = ref(null);
let orderRealtimeChannel = null;

// Track the latest status of each order to avoid duplicate triggers
const previousOrderStatusMap = ref({});

const restaurantId = computed(() => {
  return (
    route.query.restaurantId ||
    sessionStorage.getItem("customer_restaurant_id") ||
    ""
  );
});

const tableId = computed(() => {
  return (
    route.query.tableId || sessionStorage.getItem("customer_table_id") || ""
  );
});

watch(
  () => [
    route.query.restaurantId,
    route.query.tableId,
    route.query.restaurantName,
  ],
  ([resId, tabId, name]) => {
    if (resId) sessionStorage.setItem("customer_restaurant_id", resId);
    if (tabId) sessionStorage.setItem("customer_table_id", tabId);
    if (name) state.restaurantName = name;
    if (tabId) state.tableNumber = tabId;
  },
  { immediate: true },
);

const targetMenuId = computed(() => route.query.idmenu || null);

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

const isScrolling = ref(false);
let scrollTimeout = null;
let realtimeChannel = null;

const handleScroll = () => {
  isScrolling.value = true;
  if (scrollTimeout) clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    isScrolling.value = false;
  }, 300);
};

const showRecommendationModal = ref(false);
const userPreferences = ref(null);

const handlePreferencesSaved = (prefs) => {
  userPreferences.value = prefs;
  showRecommendationModal.value = false;
};

function getItemStatus(item, prefs) {
  if (!prefs) {
    return {
      isRecommended: Boolean(item.is_recommended),
      isAllergic: false,
      isTooSpicy: false,
      isDietConflict: false,
    };
  }

  const allergensSource = [
    ...(Array.isArray(item.allergens) ? item.allergens : [item.allergens]),
    ...(Array.isArray(item.allergens_th)
      ? item.allergens_th
      : [item.allergens_th]),
    ...(Array.isArray(item.ingredients)
      ? item.ingredients
      : [item.ingredients]),
    ...(Array.isArray(item.ingredients_th)
      ? item.ingredients_th
      : [item.ingredients_th]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const dietaryTags = (item.dietary_tags || []).map((t) =>
    String(t).toLowerCase(),
  );
  const spiceLevel = item.spice_level ? parseInt(item.spice_level, 10) : 0;

  const allergyMap = {
    dairy: ["dairy", "milk", "cheese", "butter", "นม", "เนย", "ชีส"],
    eggs: ["egg", "ไข่"],
    soy: ["soy", "ถั่วเหลือง", "ซีอิ๊ว", "เต้าหู้"],
    wheat: ["wheat", "gluten", "แป้งสาลี", "กลูเตน"],
    peanuts: ["peanut", "ถั่วลิสง"],
    "tree nuts": [
      "tree nut",
      "almond",
      "walnut",
      "cashew",
      "ถั่วเปลือกแข็ง",
      "อัลมอนด์",
      "เม็ดมะม่วง",
    ],
    fish: ["fish", "ปลา"],
    shellfish: [
      "shellfish",
      "shrimp",
      "crab",
      "prawn",
      "squid",
      "กุ้ง",
      "หอย",
      "ปู",
      "หมึก",
    ],
    sesame: ["sesame", "งา"],
  };

  let isAllergic = false;
  const userAllergies = prefs.allergies || [];

  for (const allergy of userAllergies) {
    const key = allergy.toLowerCase();
    const searchTerms = allergyMap[key] || [key];
    if (searchTerms.some((term) => allergensSource.includes(term))) {
      isAllergic = true;
      break;
    }
  }

  let isDietConflict = false;
  const userDiets = prefs.diets || [];

  if (userDiets.some((d) => d.toLowerCase() === "vegan")) {
    if (!dietaryTags.includes("vegan") && !dietaryTags.includes("เจ")) {
      isDietConflict = true;
    }
  } else if (userDiets.some((d) => d.toLowerCase() === "vegetarian")) {
    if (
      !dietaryTags.includes("vegetarian") &&
      !dietaryTags.includes("vegan") &&
      !dietaryTags.includes("มังสวิรัติ")
    ) {
      isDietConflict = true;
    }
  }

  const isTooSpicy = spiceLevel > (prefs.spiceLevel ?? 3);
  const isRecommended =
    Boolean(item.is_recommended) &&
    !isAllergic &&
    !isDietConflict &&
    !isTooSpicy;

  return { isRecommended, isAllergic, isTooSpicy, isDietConflict };
}

// Map status to readable details and steps
const getDetailedOrderStatus = (status) => {
  const isTh = state.language === "th";
  const stepMap = {
    pending: {
      step: 1,
      title: isTh ? "รับออเดอร์แล้ว" : "Order Received",
      desc: isTh
        ? "ห้องครัวได้รับรายการแล้ว กำลังรอเริ่มปรุง"
        : "Kitchen received your order and is queued.",
    },
    preparing: {
      step: 2,
      title: isTh ? "กำลังปรุงอาหาร" : "Cooking in Progress",
      desc: isTh
        ? "เชฟกำลังปรุงอาหารตามคิวของคุณ"
        : "Chefs are actively preparing your food.",
    },
    cooking: {
      step: 2,
      title: isTh ? "กำลังปรุงอาหาร" : "Cooking in Progress",
      desc: isTh
        ? "เชฟกำลังปรุงอาหารตามคิวของคุณ"
        : "Chefs are actively preparing your food.",
    },
    ready: {
      step: 3,
      title: isTh ? "อาหารพร้อมเสิร์ฟ" : "Food Ready to Serve",
      desc: isTh
        ? "อาหารปรุงเสร็จแล้ว พนักงานกำลังนำไปเสิร์ฟที่โต๊ะ"
        : "Your dishes are plated and being brought over.",
    },
    served: {
      step: 4,
      title: isTh ? "เสิร์ฟอาหารแล้ว" : "Food Served",
      desc: isTh
        ? "อาหารเสิร์ฟครบถึงโต๊ะเรียบร้อยแล้ว ขอให้มีความสุขกับมื้อนี้ครับ"
        : "Enjoy your meal! Served at your table.",
    },
    completed: {
      step: 5,
      title: isTh ? "ปิดบิลเสร็จสิ้น" : "Order Completed",
      desc: isTh
        ? "ชำระเงินเรียบร้อยแล้ว ขอบคุณที่มาอุดหนุนครับ"
        : "Bill settled. Thank you for dining with us!",
    },
    cancelled: {
      step: 0,
      title: isTh ? "ออเดอร์ถูกยกเลิก" : "Order Cancelled",
      desc: isTh
        ? "รายการนี้ถูกยกเลิกแล้ว หากมีข้อสงสัยโปรดติดต่อพนักงาน"
        : "This order has been cancelled.",
    },
  };

  return (
    stepMap[status] || {
      step: 0,
      title: status,
      desc: isTh ? "สถานะออเดอร์มีการปรับปรุง" : "Order status updated.",
    }
  );
};

// Connect Supabase Realtime to observe orders table updates
const setupRealtimeOrders = async (resId, tabId) => {
  if (!resId || !tabId) {
    console.warn("[setupRealtimeOrders] Missing restaurantId or tableId:", {
      restaurantId: resId,
      tableId: tabId,
    });
    return;
  }

  if (orderRealtimeChannel) {
    console.log(
      "[setupRealtimeOrders] Removing existing channel before creating a new one",
    );
    await supabase.removeChannel(orderRealtimeChannel);
    orderRealtimeChannel = null;
  }

  const cleanTabId = String(tabId).trim();
  const paddedTabId = cleanTabId.padStart(2, "0");
  const channelName = `realtime_orders_${resId}_${cleanTabId}_${Date.now()}`;

  console.log(`[setupRealtimeOrders] Subscribing to channel: ${channelName}`);

  orderRealtimeChannel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "orders",
      },
      (payload) => {
        console.log("[Realtime Payload] Received UPDATE payload:", payload.new);

        const newOrder = payload.new;
        if (!newOrder) {
          console.warn("[Realtime] Payload payload.new is null or empty");
          return;
        }

        // 1. Verify restaurant and table matches
        const targetRes = String(newOrder.restaurant_id || "").trim();
        const targetTable = String(newOrder.table_number || "").trim();

        console.log("[Realtime Check] Validating order match criteria:", {
          orderCode: newOrder.order_code,
          latestStatus: newOrder.status,
          dbTable: targetTable,
          currentClientTable: cleanTabId,
          dbRestaurantId: targetRes,
          currentClientRestaurantId: resId,
        });

        const isSameRestaurant =
          !targetRes || targetRes === String(resId).trim();
        const isSameTable =
          targetTable === cleanTabId ||
          targetTable === paddedTabId ||
          parseInt(targetTable, 10) === parseInt(cleanTabId, 10);

        if (!isSameRestaurant) {
          console.warn("[Realtime] Skipped: restaurant_id does not match");
          return;
        }

        if (!isSameTable) {
          console.warn("[Realtime] Skipped: table_number does not match");
          return;
        }

        // 2. Verify status change
        const orderIdKey = String(newOrder.id);
        const oldStatus = previousOrderStatusMap.value[orderIdKey];
        const newStatus = newOrder.status;

        console.log(
          `[Status Check] Order #${newOrder.order_code || orderIdKey} | Old Status: "${oldStatus}" -> New Status: "${newStatus}"`,
        );

        previousOrderStatusMap.value[orderIdKey] = newStatus;

        if (oldStatus && oldStatus === newStatus) {
          console.log(
            "[Realtime] Skipped: Status unchanged, skipping modal trigger",
          );
          return;
        }

        // 3. Prepare payload and open modal
        if (newStatus) {
          const statusDetail = getDetailedOrderStatus(newStatus);

          latestOrderUpdate.value = {
            orderId: newOrder.order_code || newOrder.id,
            order_code: newOrder.order_code || `#${newOrder.id}`,
            table_number: newOrder.table_number || cleanTabId,
            status:
              statusDetail.step > 0
                ? `Step ${statusDetail.step}/5: ${statusDetail.title}`
                : statusDetail.title,
            message: newOrder.customer_note
              ? `${statusDetail.desc} (Note: ${newOrder.customer_note})`
              : statusDetail.desc,
          };

          console.log(
            "[Modal Trigger] Displaying OrderUpdateModal with data:",
            latestOrderUpdate.value,
          );

          isOrderModalOpen.value = false;
          nextTick(() => {
            isOrderModalOpen.value = true;
          });
        }
      },
    )
    .subscribe((status, err) => {
      console.log(
        `[Supabase Realtime Status] Orders channel status: ${status}`,
      );
      if (err) {
        console.error("[Supabase Realtime Error] Subscription error:", err);
      }
    });
};

// Close modal when switching away to another browser tab
const handleVisibilityChange = () => {
  if (document.hidden) {
    isOrderModalOpen.value = false;
  }
};

onUnmounted(() => {
  if (scrollTimeout) clearTimeout(scrollTimeout);
  if (observer) observer.disconnect();
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  if (orderRealtimeChannel) {
    console.log("[onUnmounted] Removing orderRealtimeChannel subscription");
    supabase.removeChannel(orderRealtimeChannel);
    orderRealtimeChannel = null;
  }
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});

async function checkTableStatus(resId, tabId) {
  try {
    const { data, error } = await supabase
      .from("table_sessions")
      .select("status")
      .eq("restaurant_id", resId)
      .eq("table_id", tabId)
      .maybeSingle();

    if (error) throw error;

    if (data && data.status === "available") {
      const { error: updateError } = await supabase
        .from("table_sessions")
        .update({ status: "occupied", cart_items: [] })
        .eq("restaurant_id", resId)
        .eq("table_id", tabId);

      if (updateError) throw updateError;
    }

    isSessionExpired.value = false;
    return true;
  } catch (err) {
    console.error("Error checking table status:", err);
    return true;
  }
}

async function fetchMenuData() {
  const currentResId = restaurantId.value;
  if (!currentResId || isSessionExpired.value) {
    loading.value = false;
    return;
  }

  try {
    loading.value = true;
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", currentResId)
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
    await nextTick();
    setupIntersectionObserver();
  }
}

const menuContainerRef = ref(null);

const groupedMenu = computed(() => {
  const items = state.menuItems || [];
  const isTh = state.language === "th";
  const query = (state.searchQuery || "").toLowerCase().trim();
  const prefs = userPreferences.value;

  const enhancedItems = items.map((item) => ({
    ...item,
    _status: getItemStatus(item, prefs),
  }));

  if (query) {
    const filtered = enhancedItems.filter((item) => {
      const matchEng = item.name && item.name.toLowerCase().includes(query);
      const matchTh =
        item.name_th && item.name_th.toLowerCase().includes(query);
      return matchEng || matchTh;
    });

    return [
      {
        key: "Search",
        label: isTh
          ? `ผลการค้นหา (${filtered.length})`
          : `Search Results (${filtered.length})`,
        items: filtered,
      },
    ];
  }

  const groups = new Map();
  const recommendedItems = [];

  enhancedItems.forEach((item) => {
    if (item._status.isRecommended) {
      recommendedItems.push(item);
    }

    const key = item.category || "Other";
    const label = isTh
      ? item.category_th || item.category || "อื่นๆ"
      : item.category || "Other";

    if (!groups.has(key)) {
      groups.set(key, { key, label, items: [] });
    }
    groups.get(key).items.push(item);
  });

  const result = Array.from(groups.values());

  if (recommendedItems.length > 0) {
    result.unshift({
      key: "Recommended",
      label: isTh ? "เมนูแนะนำสำหรับคุณ" : "Recommended for You",
      items: recommendedItems,
    });
  }

  return result;
});

let observer = null;

const setupIntersectionObserver = () => {
  if (observer) observer.disconnect();
  if (!menuContainerRef.value) return;

  const options = {
    root: menuContainerRef.value,
    rootMargin: "-10px 0px -70% 0px",
    threshold: 0,
  };

  observer = new IntersectionObserver((entries) => {
    if (state.isManualScrolling) return;

    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const catKey = entry.target.getAttribute("data-category-key");
        if (catKey) {
          state.selectedCategory = catKey;
        }
      }
    });
  }, options);

  const sections = menuContainerRef.value.querySelectorAll(
    ".category-menu-section",
  );
  sections.forEach((sec) => observer.observe(sec));
};

watch(
  () => [groupedMenu.value, state.language],
  async () => {
    await nextTick();
    setupIntersectionObserver();
  },
);

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

const setupRealtimeCart = async (resId, tabId) => {
  if (!resId || !tabId) return;

  if (realtimeChannel) {
    await supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  const channelName = `cart_sync_${resId}_${tabId}_${Date.now()}`;

  realtimeChannel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "table_sessions",
        filter: `table_id=eq.${tabId}`,
      },
      (payload) => {
        if (payload.new.restaurant_id && payload.new.restaurant_id !== resId)
          return;

        if (
          payload.new.status === "available" &&
          (payload.old.status !== "available" ||
            payload.old.status === undefined)
        ) {
          state.cart = [];
          sessionStorage.removeItem(`cart_${resId}_${tabId}`);
          localStorage.removeItem("customer_session");
          isSessionExpired.value = true;
          return;
        }

        const newCartItems = payload.new.cart_items || [];
        state.cart = newCartItems;
      },
    )
    .subscribe();
};

const syncCartToServer = async (currentCart) => {
  const resId = restaurantId.value;
  const tabId = tableId.value;
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

const cartCount = computed(() => {
  if (!state.cart) return 0;
  return state.cart.reduce(
    (sum, item) => sum + (Number(item.quantity) || 1),
    0,
  );
});

const cartTotal = computed(() => {
  if (!state.cart || state.cart.length === 0) return 0;
  return state.cart.reduce((sum, item) => {
    const price = Number(item.priceNum) || Number(item.price) || 0;
    const qty = Number(item.quantity) || 1;
    return sum + price * qty;
  }, 0);
});

const addToCart = async (item) => {
  let currentCart = state.cart ? [...state.cart] : [];

  const itemId = item.id || item.menu_id;
  const itemNote = (item.notes || item.note || "").trim();
  const quantityToAdd = Number(item.quantity) || 1;

  const existingIndex = currentCart.findIndex(
    (c) =>
      (c.id === itemId || c.menu_id === itemId) &&
      (c.notes || c.note || "").trim() === itemNote,
  );

  if (existingIndex > -1) {
    const currentQty = Number(currentCart[existingIndex].quantity) || 1;
    currentCart[existingIndex].quantity = currentQty + quantityToAdd;
  } else {
    currentCart.push({
      ...item,
      id: itemId,
      menu_id: itemId,
      name: item.name,
      name_th: item.name_th,
      price: item.priceNum || parseFloat(item.price) || 0,
      priceNum: item.priceNum || parseFloat(item.price) || 0,
      quantity: quantityToAdd,
      notes: itemNote,
      note: itemNote,
      image: item.image || "",
      cartItemId: `${itemId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      added_by_name: customerInfo.value?.name,
      added_by_id: customerInfo.value?.id,
    });
  }

  state.cart = currentCart;
  await syncCartToServer(currentCart);
};

const removeFromCart = async (itemId) => {
  if (!state.cart || state.cart.length === 0) return;
  let currentCart = [...state.cart];

  const index = currentCart.findIndex(
    (cartItem) => cartItem.id === itemId || cartItem.menu_id === itemId,
  );

  if (index !== -1) {
    if (currentCart[index].quantity && currentCart[index].quantity > 1) {
      currentCart[index].quantity--;
    } else {
      currentCart.splice(index, 1);
    }
    state.cart = currentCart;
    await syncCartToServer(currentCart);
  }
};

const initCart = () => {
  const resId = restaurantId.value;
  const tabId = tableId.value;
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

onMounted(() => {
  document.addEventListener("visibilitychange", handleVisibilityChange);

  const savedPrefs = sessionStorage.getItem("customer_preferences");
  if (!savedPrefs) {
    showRecommendationModal.value = true;
  } else {
    userPreferences.value = JSON.parse(savedPrefs);
  }
});

watch(
  () => [restaurantId.value, tableId.value],
  async ([resId, tabId]) => {
    if (resId && tabId) {
      isSessionExpired.value = false;

      const isOpen = await checkTableStatus(resId, tabId);
      if (!isOpen) return;

      initCart();
      await fetchMenuData();
      await initializeCustomerSession(resId, tabId);
      await setupRealtimeCart(resId, tabId);
      await setupRealtimeOrders(resId, tabId);
    }
  },
  { immediate: true },
);

watch(
  () => state.cart,
  (newCart) => {
    const resId = restaurantId.value;
    const tabId = tableId.value;
    if (resId && tabId && newCart) {
      sessionStorage.setItem(`cart_${resId}_${tabId}`, JSON.stringify(newCart));
    }
  },
  { deep: true },
);

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
  return state.cart
    .filter((cartItem) => cartItem.id === itemId || cartItem.menu_id === itemId)
    .reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
};

const goToOrder = () => {
  const currentResId = restaurantId.value;
  const currentTabId = tableId.value;

  if (currentResId)
    sessionStorage.setItem("customer_restaurant_id", currentResId);
  if (currentTabId) sessionStorage.setItem("customer_table_id", currentTabId);

  router.push({
    path: "/order",
    query: {
      restaurantId: currentResId,
      tableId: currentTabId,
    },
  });
};

const formatIngredients = (ingredients) => {
  if (!ingredients) return "";
  if (Array.isArray(ingredients)) return ingredients.join(", ");
  if (typeof ingredients === "string") {
    try {
      const parsed = JSON.parse(ingredients);
      if (Array.isArray(parsed)) return parsed.join(", ");
    } catch (e) {
      return ingredients.replace(/[\[\]"]/g, "");
    }
  }
  return ingredients;
};

const isAiChatOpen = ref(false);
const language = computed(() => state.language || "th");
const cart = computed(() => state.cart || []);

const handleAddToCart = async (item) => {
  await addToCart(item);
};

const handleRemoveFromCart = async (itemId) => {
  await removeFromCart(itemId);
};

const handleUpdateCartNote = async ({ target, note }) => {
  if (!state.cart || state.cart.length === 0) return;

  const currentCart = [...state.cart];

  if (target === "LAST_ITEM" || !target) {
    const lastIndex = currentCart.length - 1;
    currentCart[lastIndex] = {
      ...currentCart[lastIndex],
      notes: note,
      note: note,
    };
  } else {
    const targetLower = target.toLowerCase();
    const index = currentCart
      .slice()
      .reverse()
      .findIndex(
        (item) =>
          (item.name && item.name.toLowerCase().includes(targetLower)) ||
          (item.name_th && item.name_th.includes(target)),
      );

    if (index !== -1) {
      const realIndex = currentCart.length - 1 - index;
      currentCart[realIndex] = {
        ...currentCart[realIndex],
        notes: note,
        note: note,
      };
    }
  }

  state.cart = currentCart;
  await syncCartToServer(currentCart);
};
</script>

<template>
  <div
    class="mobile-shell flex flex-col h-screen bg-white overflow-hidden relative"
  >
    <!-- Food Recommendation Modal -->
    <RecommendationModal
      :is-open="showRecommendationModal"
      :language="state.language"
      @save="handlePreferencesSaved"
      @skip="handlePreferencesSaved"
    />

    <!-- Order Update Alert Modal (ปิดอัตโนมัติใน 10 วินาที หรือกด X) -->
    <OrderUpdateModal
      :is-open="isOrderModalOpen"
      :order-data="latestOrderUpdate"
      :duration="10"
      @close="isOrderModalOpen = false"
    />

    <!-- Session Expired Lock Screen -->
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
    </div>

    <!-- Loading State Screen -->
    <div
      v-else-if="loading"
      class="flex-1 flex items-center justify-center text-stone-400 font-bold"
    >
      {{ state.language === "th" ? "กำลังโหลดเมนู..." : "Loading menu..." }}
    </div>

    <!-- Normal Menu Screen -->
    <template v-else>
      <TopBarCustomer class="flex-shrink-0" />

      <!-- Menu List Container with Smooth Scrollspy -->
      <main
        id="main-menu-scroll-container"
        ref="menuContainerRef"
        class="flex-1 min-h-0 overflow-y-auto px-4 pb-36 pt-2 scroll-smooth"
        @scroll="handleScroll"
      >
        <!-- Empty Search Result Display -->
        <div
          v-if="
            groupedMenu.length === 0 ||
            (groupedMenu[0]?.key === 'Search' &&
              groupedMenu[0].items.length === 0)
          "
          class="text-center py-16 text-stone-400"
        >
          <p class="text-sm font-medium">
            {{
              state.language === "th" ? "ไม่พบเมนูที่ค้นหา" : "No menus found"
            }}
          </p>
        </div>

        <!-- Render Menu Sections -->
        <div v-else class="flex flex-col">
          <section
            v-for="(group, index) in groupedMenu"
            :key="group.key"
            :id="`category-section-${group.key}`"
            :data-category-key="group.key"
            class="category-menu-section scroll-mt-2"
          >
            <!-- Category Divider -->
            <div
              v-if="index > 0"
              class="border-b border-dashed border-stone-400 mt-2 mb-4"
            ></div>

            <!-- Category Header -->
            <h2
              v-if="group.key === 'Recommended'"
              class="font-black text-xl mb-2 flex items-center gap-2 text-emerald-800"
            >
              {{ group.label }}
            </h2>
            <h2
              v-else-if="group.key !== 'Search'"
              class="font-black text-lg mb-2 text-stone-900"
            >
              {{ group.label }}
            </h2>

            <!-- Menu Items inside Category -->
            <div class="flex flex-col">
              <div
                v-for="item in group.items"
                :key="group.key + '-' + item.id"
                @click="openModal(item)"
                class="flex gap-4 items-start py-5 border-b border-dashed border-stone-200 last:border-none cursor-pointer hover:bg-stone-50 transition-opacity rounded-xl px-2 -mx-2 relative"
                :class="{
                  'opacity-40':
                    item._status?.isAllergic || item._status?.isDietConflict,
                }"
              >
                <!-- Image Container -->
                <div
                  class="w-24 h-24 rounded-2xl bg-stone-100 flex-shrink-0 overflow-hidden shadow-sm relative"
                >
                  <img
                    v-if="item.image"
                    :src="item.image"
                    loading="lazy"
                    class="w-full h-full object-cover"
                  />
                  <div
                    v-else
                    class="w-full h-full flex items-center justify-center text-stone-300 text-xs text-center p-2"
                  >
                    {{ state.language === "th" ? "ไม่มีรูปภาพ" : "No Image" }}
                  </div>
                </div>

                <!-- Text Details -->
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
                        state.language === "th"
                          ? "สารก่อภูมิแพ้:"
                          : "Allergens:"
                      }}</span>
                      {{ formatAllergens(getMenuAllergens(item)) }}
                    </p>

                    <!-- Badges เตือนข้อจำกัดทางอาหาร -->
                    <div
                      v-if="item._status?.isAllergic"
                      class="text-[11px] text-red-600 font-bold mt-1.5 bg-red-50 px-2 py-0.5 rounded w-fit flex items-center gap-1 border border-red-200"
                    >
                      {{
                        state.language === "th"
                          ? "มีส่วนผสมที่คุณแพ้"
                          : "Contains your allergens"
                      }}
                    </div>
                    <div
                      v-else-if="item._status?.isDietConflict"
                      class="text-[11px] text-amber-700 font-bold mt-1.5 bg-amber-50 px-2 py-0.5 rounded w-fit flex items-center gap-1 border border-amber-200"
                    >
                      {{
                        state.language === "th"
                          ? "ไม่ตรงกับรูปแบบอาหารที่คุณทาน"
                          : "Not matching your diet"
                      }}
                    </div>
                    <div
                      v-else-if="item._status?.isTooSpicy"
                      class="text-[10px] text-orange-600 font-bold mt-1.5 bg-orange-50 px-2 py-0.5 rounded w-fit flex items-center gap-1 border border-orange-100"
                    >
                      🌶️
                      {{
                        state.language === "th"
                          ? "เผ็ดกว่าที่คุณเลือก"
                          : "Spicier than preferred"
                      }}
                    </div>
                  </div>

                  <!-- Price and Cart Buttons -->
                  <div
                    class="flex justify-between items-center mt-3 relative z-20"
                  >
                    <p class="font-bold text-stone-900 text-lg">
                      {{ item.priceNum ? item.priceNum.toLocaleString() : 0 }}
                      {{ state.language === "th" ? "บาท" : "Baht" }}
                    </p>

                    <div class="h-10 flex justify-end items-center">
                      <button
                        v-if="getItemQuantity(item.id) === 0"
                        @click.stop="
                          item._status?.isAllergic ||
                          item._status?.isDietConflict
                            ? null
                            : addToCart(item)
                        "
                        :disabled="
                          item._status?.isAllergic ||
                          item._status?.isDietConflict
                        "
                        :class="[
                          'touch-manipulation w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-transform shadow-sm border',
                          item._status?.isAllergic ||
                          item._status?.isDietConflict
                            ? 'bg-stone-100 border-stone-200 text-stone-300 cursor-not-allowed'
                            : 'bg-white border-stone-200 text-stone-900 hover:bg-stone-100 active:scale-95',
                        ]"
                      >
                        <Plus
                          :size="18"
                          stroke-width="2.5"
                          :class="
                            item._status?.isAllergic ||
                            item._status?.isDietConflict
                              ? 'text-stone-300'
                              : 'text-stone-500'
                          "
                        />
                      </button>

                      <div
                        v-else
                        class="flex items-center gap-2 bg-white border border-stone-200 rounded-full p-1 shadow-sm"
                        @click.stop
                      >
                        <button
                          @click.stop="removeFromCart(item.id)"
                          class="touch-manipulation w-8 h-8 rounded-full flex items-center justify-center bg-stone-100 text-stone-600 hover:bg-stone-200"
                        >
                          <Minus :size="14" stroke-width="3" />
                        </button>
                        <span
                          class="w-7 text-center text-md font-bold text-stone-900"
                          >{{ getItemQuantity(item.id) }}</span
                        >
                        <button
                          @click.stop="addToCart(item)"
                          class="touch-manipulation w-8 h-8 rounded-full flex items-center justify-center bg-stone-900 text-white"
                        >
                          <Plus
                            :size="14"
                            stroke-width="3"
                            class="text-white"
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <!-- Floating AI Chatbot Button -->
      <button
        @click="isAiChatOpen = true"
        class="fixed right-5 bottom-24 z-40 w-14 h-14 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-full shadow-xl flex items-center justify-center transition-all duration-300 group"
        aria-label="Chat with AI"
      >
        <Bot :size="24" class="group-hover:scale-110 transition-transform" />
        <span
          class="absolute top-0 right-0 w-3.5 h-3.5 bg-amber-400 border-2 border-white rounded-full"
        ></span>
      </button>

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
          <span>
            {{ cartTotal.toLocaleString() }}
            {{ language === "th" ? "บาท." : "Baht." }}
          </span>
        </button>
      </div>

      <!-- AI Chat Modal -->
      <AiChatModal
        :is-open="isAiChatOpen"
        :restaurant-id="restaurantId"
        :language="language"
        :cart="cart"
        @close="isAiChatOpen = false"
        @add-to-cart="handleAddToCart"
        @remove-from-cart="handleRemoveFromCart"
        @update-cart-note="handleUpdateCartNote"
      />

      <!-- Menu Item Detail Modal -->
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
              class="bg-white w-full max-w-[340px] max-h-[85vh] rounded-3xl overflow-y-auto flex flex-col shadow-2xl relative"
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
                  class="absolute top-4 right-4 w-7 h-7 bg-black/40 hover:bg-black/50 rounded-full flex items-center justify-center text-white"
                >
                  ✕
                </button>
              </div>

              <div class="p-5 pb-8 text-left space-y-4">
                <div class="flex justify-between items-start">
                  <h2 class="text-xl font-bold text-stone-900 leading-snug">
                    {{ getMenuName(selectedItem) }}
                  </h2>
                  <span
                    class="text-lg font-bold text-emerald-700 whitespace-nowrap ml-2"
                  >
                    {{
                      selectedItem.priceNum
                        ? selectedItem.priceNum.toLocaleString()
                        : 0
                    }}
                    {{ state.language === "th" ? "บาท" : "Baht" }}
                  </span>
                </div>

                <!-- Warning Tag in Item Detail Modal -->
                <div
                  v-if="selectedItem._status?.isAllergic"
                  class="text-xs text-red-600 font-bold bg-red-50 px-3 py-2 rounded-xl flex items-start gap-2 border border-red-100"
                >
                  <span>{{
                    state.language === "th"
                      ? "คำเตือน: เมนูนี้มีส่วนผสมที่คุณแพ้ กรุณาหลีกเลี่ยง"
                      : "Warning: This dish contains allergens you specified. Please avoid."
                  }}</span>
                </div>

                <div
                  v-else-if="selectedItem._status?.isDietConflict"
                  class="text-xs text-amber-700 font-bold bg-amber-50 px-3 py-2 rounded-xl flex items-start gap-2 border border-amber-100"
                >
                  <span>{{
                    state.language === "th"
                      ? "คำเตือน: เมนูนี้ไม่ตรงกับประเภทอาหารที่คุณเลือกไว้"
                      : "Warning: This dish does not match your selected dietary preferences."
                  }}</span>
                </div>

                <div v-if="getMenuDescription(selectedItem)">
                  <p class="text-sm text-stone-600 leading-relaxed">
                    {{ getMenuDescription(selectedItem) }}
                  </p>
                </div>

                <div
                  v-if="selectedItem.ingredients || selectedItem.ingredients_th"
                  class="border-t border-stone-100 pt-3"
                >
                  <p class="text-[13px] text-stone-400 font-medium mb-1">
                    {{
                      state.language === "th"
                        ? "ส่วนผสมและองค์ประกอบ"
                        : "Ingredients & Components"
                    }}
                  </p>
                  <p class="text-[14px] text-stone-900 leading-relaxed">
                    {{
                      formatIngredients(
                        state.language === "th" && selectedItem.ingredients_th
                          ? selectedItem.ingredients_th
                          : selectedItem.ingredients,
                      )
                    }}
                  </p>
                </div>

                <div class="border-t border-stone-100 pt-3">
                  <p class="text-[13px] text-stone-400 font-medium mb-1">
                    {{
                      state.language === "th"
                        ? "สารก่อภูมิแพ้"
                        : "Allergen Information *"
                    }}
                  </p>
                  <p class="text-[14px] text-stone-900">
                    {{
                      formatAllergens(getMenuAllergens(selectedItem)) ||
                      (state.language === "th"
                        ? "ไม่มีข้อมูลสารก่อภูมิแพ้"
                        : "None")
                    }}
                  </p>
                </div>

                <div
                  class="flex gap-4 border-t border-stone-100 pt-3 text-xs text-stone-500"
                >
                  <div v-if="selectedItem.category">
                    <span class="font-medium text-stone-400">{{
                      state.language === "th" ? "หมวดหมู่: " : "Category: "
                    }}</span>
                    {{ selectedItem.category }}
                  </div>
                  <div v-if="selectedItem.calories">
                    <span class="font-medium text-stone-400">Calories: </span>
                    {{ selectedItem.calories }} kcal
                  </div>
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
