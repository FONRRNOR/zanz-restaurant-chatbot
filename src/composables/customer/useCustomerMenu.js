import { ref, computed, watch, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase } from "../../supabaseClient";
import { useSession } from "../useSession"; // อ้างอิงกลับไปที่ composables/useSession.js

export function useCustomerMenu(state, onMenuFetched = () => {}) {
  const route = useRoute();
  const router = useRouter();
  const { saveSession, loadSession } = useSession();

  // ==========================================
  // 1. State Declarations
  // ==========================================
  const loading = ref(true);
  const isSessionExpired = ref(false);
  const customerInfo = ref(null);

  const showModal = ref(false);
  const selectedItem = ref(null);
  const isAiChatOpen = ref(false);
  const showRecommendationModal = ref(false);
  const userPreferences = ref(null);

  const isOrderModalOpen = ref(false);
  const latestOrderUpdate = ref(null);
  const previousOrderStatusMap = ref({});

  let orderRealtimeChannel = null;
  let realtimeChannel = null;

  // ==========================================
  // 2. Computed Properties
  // ==========================================
  const restaurantId = computed(
    () =>
      route.query.restaurantId ||
      sessionStorage.getItem("customer_restaurant_id") ||
      "",
  );
  const tableId = computed(
    () =>
      route.query.tableId || sessionStorage.getItem("customer_table_id") || "",
  );
  const targetMenuId = computed(() => route.query.idmenu || null);
  const language = computed(() => state.language || "th");
  const cart = computed(() => state.cart || []);

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
      if (item._status.isRecommended) recommendedItems.push(item);

      const key = item.category || "Other";
      const label = isTh
        ? item.category_th || item.category || "อื่นๆ"
        : item.category || "Other";

      if (!groups.has(key)) groups.set(key, { key, label, items: [] });
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

  // ==========================================
  // 3. Helper Functions & Formatters
  // ==========================================
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

  const handlePreferencesSaved = (prefs) => {
    userPreferences.value = prefs;
    showRecommendationModal.value = false;
  };

  function getItemStatus(item, prefs) {
    if (!prefs)
      return {
        isRecommended: Boolean(item.is_recommended),
        isAllergic: false,
        isTooSpicy: false,
        isDietConflict: false,
      };

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
    for (const allergy of prefs.allergies || []) {
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
      if (!dietaryTags.includes("vegan") && !dietaryTags.includes("เจ"))
        isDietConflict = true;
    } else if (userDiets.some((d) => d.toLowerCase() === "vegetarian")) {
      if (
        !dietaryTags.includes("vegetarian") &&
        !dietaryTags.includes("vegan") &&
        !dietaryTags.includes("มังสวิรัติ")
      )
        isDietConflict = true;
    }

    const isTooSpicy = spiceLevel > (prefs.spiceLevel ?? 3);
    const isRecommended =
      Boolean(item.is_recommended) &&
      !isAllergic &&
      !isDietConflict &&
      !isTooSpicy;

    return { isRecommended, isAllergic, isTooSpicy, isDietConflict };
  }

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
        return JSON.parse(allergens).join(", ");
      } catch (e) {
        return allergens.replace(/[\[\]"]/g, "");
      }
    }
    return allergens;
  };

  const formatIngredients = (ingredients) => {
    if (!ingredients) return "";
    if (Array.isArray(ingredients)) return ingredients.join(", ");
    if (typeof ingredients === "string") {
      try {
        return JSON.parse(ingredients).join(", ");
      } catch (e) {
        return ingredients.replace(/[\[\]"]/g, "");
      }
    }
    return ingredients;
  };

  const getItemQuantity = (itemId) => {
    if (!state.cart) return 0;
    return state.cart
      .filter(
        (cartItem) => cartItem.id === itemId || cartItem.menu_id === itemId,
      )
      .reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  };

  const goToOrder = () => {
    if (restaurantId.value)
      sessionStorage.setItem("customer_restaurant_id", restaurantId.value);
    if (tableId.value)
      sessionStorage.setItem("customer_table_id", tableId.value);
    router.push({
      path: "/order",
      query: { restaurantId: restaurantId.value, tableId: tableId.value },
    });
  };

  // ==========================================
  // 4. API & Realtime Subscriptions
  // ==========================================
  const setupRealtimeOrders = async (resId, tabId) => {
    if (!resId || !tabId) return;
    if (orderRealtimeChannel) {
      await supabase.removeChannel(orderRealtimeChannel);
      orderRealtimeChannel = null;
    }

    const cleanTabId = String(tabId).trim();
    const paddedTabId = cleanTabId.padStart(2, "0");
    const channelName = `realtime_orders_${resId}_${cleanTabId}_${Date.now()}`;

    orderRealtimeChannel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const newOrder = payload.new;
          if (!newOrder) return;

          const targetRes = String(newOrder.restaurant_id || "").trim();
          const targetTable = String(newOrder.table_number || "").trim();
          const isSameRestaurant =
            !targetRes || targetRes === String(resId).trim();
          const isSameTable =
            targetTable === cleanTabId ||
            targetTable === paddedTabId ||
            parseInt(targetTable, 10) === parseInt(cleanTabId, 10);

          if (!isSameRestaurant || !isSameTable) return;

          const orderIdKey = String(newOrder.id);
          const oldStatus = previousOrderStatusMap.value[orderIdKey];
          const newStatus = newOrder.status;

          previousOrderStatusMap.value[orderIdKey] = newStatus;

          if (oldStatus && oldStatus === newStatus) return;

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

            isOrderModalOpen.value = false;
            nextTick(() => {
              isOrderModalOpen.value = true;
            });
          }
        },
      )
      .subscribe();
  };

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
      onMenuFetched();
    }
  }

  async function initializeCustomerSession(resId, tabId) {
    if (!resId || !tabId) return;
    let sessionData = loadSession("customer_session");
    if (!sessionData) {
      sessionData = {
        id:
          "c_" + Date.now().toString(36) + Math.random().toString(36).substr(2),
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

  // ==========================================
  // 5. Cart Management
  // ==========================================
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
          state.cart = payload.new.cart_items || [];
        },
      )
      .subscribe();
  };

  const syncCartToServer = async (currentCart) => {
    if (!restaurantId.value || !tableId.value) return;
    try {
      await supabase.rpc("sync_table_cart", {
        p_table_id: tableId.value,
        p_restaurant_id: restaurantId.value,
        p_cart_items: currentCart,
      });
    } catch (err) {
      console.error("Error syncing cart to server:", err);
    }
  };

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
      currentCart[existingIndex].quantity =
        (Number(currentCart[existingIndex].quantity) || 1) + quantityToAdd;
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
    if (!restaurantId.value || !tableId.value) return;
    const savedCart = sessionStorage.getItem(
      `cart_${restaurantId.value}_${tableId.value}`,
    );
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

  // ==========================================
  // 6. Watchers & Lifecycles
  // ==========================================
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
      if (restaurantId.value && tableId.value && newCart) {
        sessionStorage.setItem(
          `cart_${restaurantId.value}_${tableId.value}`,
          JSON.stringify(newCart),
        );
      }
    },
    { deep: true },
  );

  const handleVisibilityChange = () => {
    if (document.hidden) isOrderModalOpen.value = false;
  };

  onUnmounted(() => {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    if (orderRealtimeChannel) supabase.removeChannel(orderRealtimeChannel);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });

  return {
    loading,
    isSessionExpired,
    showModal,
    selectedItem,
    isAiChatOpen,
    showRecommendationModal,
    isOrderModalOpen,
    latestOrderUpdate,
    restaurantId,
    tableId,
    language,
    cart,
    cartCount,
    cartTotal,
    groupedMenu,
    openModal,
    closeModal,
    handlePreferencesSaved,
    getMenuName,
    getMenuDescription,
    getMenuAllergens,
    formatAllergens,
    formatIngredients,
    getItemQuantity,
    goToOrder,
    addToCart,
    removeFromCart,
    handleUpdateCartNote,
    handleVisibilityChange,
  };
}
