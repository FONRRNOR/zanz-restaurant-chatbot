import { ref, computed, watch, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase } from "../../supabaseClient";
import { useSession } from "../useSession";

export function useCustomerMenu(state, onMenuFetched = () => {}) {
  const route = useRoute();
  const router = useRouter();
  const { saveSession, loadSession } = useSession();

  const loading = ref(true);

  // เช็คจาก Storage ทันที
  const isSessionExpired = ref(
    sessionStorage.getItem("is_table_cleared") === "true",
  );
  const customerInfo = ref(null);

  const showModal = ref(false);
  const selectedItem = ref(null);
  const isAiChatOpen = ref(false);
  const showRecommendationModal = ref(false);

  const filterVersion = ref(0);

  // ตัวแปรป้องกัน Ghost Click และแก้บั๊ก Realtime ตีกัน
  let cartActionCooldown = false;
  let syncTimer = null;
  let lastLocalCartUpdate = 0;

  const getInitialPreferences = () => {
    try {
      const saved = sessionStorage.getItem("customer_preferences");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error("[useCustomerMenu] Error parsing preferences:", e);
      return null;
    }
  };

  const userPreferences = ref(getInitialPreferences());

  const isOrderModalOpen = ref(false);
  const latestOrderUpdate = ref(null);
  const previousOrderStatusMap = ref({});

  let orderRealtimeChannel = null;
  let realtimeChannel = null;
  let removeMenuRouterGuard = null;

  const restaurantId = computed(
    () =>
      route.query.restaurantId ||
      sessionStorage.getItem("customer_restaurant_id") ||
      "",
  );

  const tableId = computed(() => {
    const sessionTab = sessionStorage.getItem("customer_table_id");
    const urlTab = route.query.tableId;
    if (sessionTab && urlTab && sessionTab.startsWith(urlTab)) {
      return sessionTab;
    }
    return sessionTab || urlTab || "";
  });

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
    const _forceTrigger = filterVersion.value;
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
    sessionStorage.setItem("customer_preferences", JSON.stringify(prefs));
    filterVersion.value++;
    showRecommendationModal.value = false;
  };

  const handlePreferencesReset = () => {
    userPreferences.value = null;
    sessionStorage.removeItem("customer_preferences");
    filterVersion.value++;
  };

  function getItemStatus(item, prefs) {
    const hasActiveFilters = Boolean(
      prefs &&
      ((Array.isArray(prefs.diets) && prefs.diets.length > 0) ||
        (Array.isArray(prefs.allergies) && prefs.allergies.length > 0) ||
        (typeof prefs.spiceLevel === "number" && prefs.spiceLevel < 3)),
    );

    if (!hasActiveFilters) {
      return {
        isRecommended: false,
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
    if (!state.cart || !Array.isArray(state.cart)) return 0;

    // รวมจำนวน (quantity) ของทุกชิ้นในตะกร้าที่มี id หรือ menu_id ตรงกัน
    return state.cart.reduce((sum, item) => {
      const currentId = item.id || item.menu_id;
      if (String(currentId) === String(itemId)) {
        return sum + (Number(item.quantity) || 1);
      }
      return sum;
    }, 0);
  };

  const lockToThankYouState = () => {
    isSessionExpired.value = true;
    loading.value = false;

    if (!removeMenuRouterGuard) {
      removeMenuRouterGuard = router.beforeEach((to, from, next) => {
        next(false);
      });
    }

    window.history.pushState(null, "", window.location.href);
    window.onpopstate = () => {
      window.history.pushState(null, "", window.location.href);
    };
  };

  const triggerSessionClear = () => {
    isOrderModalOpen.value = false;
    state.cart = [];
    sessionStorage.setItem("is_table_cleared", "true");
    if (restaurantId.value && tableId.value) {
      sessionStorage.setItem(
        `expired_${restaurantId.value}_${tableId.value}`,
        "true",
      );
      sessionStorage.removeItem(`cart_${restaurantId.value}_${tableId.value}`);
    }
    localStorage.removeItem("customer_session");
    sessionStorage.removeItem("has_seen_recommendation");
    sessionStorage.removeItem("customer_preferences");

    lockToThankYouState();
  };

  async function checkTableStatus(resId, tabId) {
    if (sessionStorage.getItem("is_table_cleared") === "true") {
      lockToThankYouState();
      return false;
    }

    try {
      const cleanTabId = String(tabId).trim();
      const rawClean = cleanTabId.split("-")[0].replace(/\D/g, "").trim();

      const { data: sessionData, error: sessionErr } = await supabase
        .from("table_sessions")
        .select("status")
        .eq("restaurant_id", resId)
        .eq("table_id", tabId)
        .maybeSingle();

      if (sessionErr) console.error("Session check error:", sessionErr);

      // ถ้าไม่มีข้อมูล Session เลย (เช่น เพิ่งลบออก หรือโต๊ะใหม่กิ๊ก)
      // ให้ถือว่าโต๊ะยังปกติ (ยังไม่ต้องเคลียร์) เพื่อรอให้ initializeCustomerSession ไปสร้างใหม่อัตโนมัติ
      if (!sessionData) {
        isSessionExpired.value = false;
        return true;
      }

      // ถ้ามีข้อมูล session แล้ว ค่อยเช็คว่าสถานะเป็น cleared / empty / available หรือไม่
      const isCleared = ["available", "empty", "cleared"].includes(
        sessionData.status?.toLowerCase(),
      );

      if (isCleared) {
        triggerSessionClear();
        return false;
      }

      isSessionExpired.value = false;
      return true;
    } catch (err) {
      console.error("Error checking table status:", err);
      return true;
    }
  }

  const setupRealtimeOrders = async (resId, tabId) => {
    if (!resId || !tabId) return;
    if (orderRealtimeChannel) {
      await supabase.removeChannel(orderRealtimeChannel);
      orderRealtimeChannel = null;
    }

    const cleanTabId = String(tabId).trim();
    const rawClean = cleanTabId.split("-")[0].replace(/\D/g, "").trim();
    const paddedTabId = rawClean ? rawClean.padStart(2, "0") : cleanTabId;
    const channelName = `realtime_orders_${resId}_${cleanTabId}_${Date.now()}`;

    orderRealtimeChannel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        async (payload) => {
          const newOrder = payload.new;
          if (!newOrder) return;

          const targetRes = String(newOrder.restaurant_id || "").trim();
          const targetTable = String(newOrder.table_number || "").trim();
          const targetTableBase = targetTable
            .split("-")[0]
            .replace(/\D/g, "")
            .trim();

          const isSameRestaurant =
            !targetRes || targetRes === String(resId).trim();

          const isSameTable =
            targetTable === cleanTabId ||
            targetTable === paddedTabId ||
            (rawClean &&
              (targetTable === rawClean || targetTableBase === rawClean));

          if (!isSameRestaurant || !isSameTable) return;

          const orderIdKey = String(newOrder.id);
          const oldStatus = previousOrderStatusMap.value[orderIdKey];
          const newStatus = String(newOrder.status || "").toLowerCase();

          previousOrderStatusMap.value[orderIdKey] = newStatus;
          if (oldStatus && oldStatus === newStatus) return;

          if (newStatus === "paid" || newStatus === "completed") {
            triggerSessionClear();
            return;
          }

          if (newStatus) {
            await fetchMenuData();
            await checkTableStatus(resId, tabId);

            const statusDetail = getDetailedOrderStatus(newStatus);
            latestOrderUpdate.value = {
              orderId: newOrder.order_code || newOrder.id,
              order_code: newOrder.order_code || `#${newOrder.id}`,
              table_number: newOrder.table_number || cleanTabId,
              status:
                statusDetail.step > 0
                  ? `Step ${statusDetail.step}/4: ${statusDetail.title}`
                  : statusDetail.title,
              message: newOrder.customer_note
                ? `${statusDetail.desc} (Note: ${newOrder.customer_note})`
                : statusDetail.desc,
            };

            isOrderModalOpen.value = false;
            await nextTick();
            isOrderModalOpen.value = true;
          }
        },
      )
      .subscribe();
  };

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
    if (!resId || !tabId || isSessionExpired.value) return;
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

  // ปรับปรุง setupRealtimeCart: ตรวจสอบข้อมูลก่อนรับเข้ามาทับ
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
          event: "*",
          schema: "public",
          table: "table_sessions",
          filter: `table_id=eq.${tabId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            triggerSessionClear();
            return;
          }
          if (payload.new?.restaurant_id && payload.new.restaurant_id !== resId)
            return;
          if (
            payload.new?.status === "available" ||
            payload.new?.status === "empty" ||
            payload.new?.status === "cleared"
          ) {
            triggerSessionClear();
            return;
          }

          if (Date.now() - lastLocalCartUpdate < 1500) {
            return;
          }

          const incomingCart = payload.new?.cart_items || [];
          
          // ตรวจสอบว่า incomingCart เป็น Array ที่ถูกต้องและมีข้อมูลครบ
          if (Array.isArray(incomingCart)) {
            const validCart = incomingCart.filter(item => item && (item.id || item.menu_id) && (item.name || item.name_th));
            if (JSON.stringify(state.cart) !== JSON.stringify(validCart)) {
              state.cart = validCart;
            }
          }
        },
      )
      .subscribe();
  };

  // ✅ ฟังก์ชัน Debounce การซิงค์ไปเซิร์ฟเวอร์ ป้องกัน Request ชนกัน
  const queueCartSync = (cartToSync) => {
    lastLocalCartUpdate = Date.now();
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      if (!restaurantId.value || !tableId.value || isSessionExpired.value)
        return;
      try {
        await supabase.rpc("sync_table_cart", {
          p_table_id: tableId.value,
          p_restaurant_id: restaurantId.value,
          p_cart_items: cartToSync,
        });
      } catch (err) {
        console.error("Error syncing cart to server:", err);
      }
    }, 350);
  };

  const addToCart = async (item) => {
    if (isSessionExpired.value) return;

    // ล็อกป้องกันการกดซ้ำเร็วเกินไป หรือเบราว์เซอร์ยิง click ซ้อน
    if (cartActionCooldown) return;
    cartActionCooldown = true;
    setTimeout(() => {
      cartActionCooldown = false;
    }, 280);

    let currentCart = state.cart ? [...state.cart] : [];
    const itemId = item.id || item.menu_id;
    const itemNote = (item.notes || item.note || "").trim();

    // หากมีการกำหนด quantity มาจาก AI (เช่น สั่ง 2 หรือ 3 จาน) ให้ใช้ค่านั้นเป็นค่าตั้งต้น
    // แต่ถ้าเป็นการกดปุ่มบวกปกติ จะไม่มี item.quantity ส่งมา ให้ default เป็น 1
    const targetQuantity = Number(item.quantity);
    const hasExplicitQuantity = !isNaN(targetQuantity) && targetQuantity > 0;
    const quantityToAdd = hasExplicitQuantity ? targetQuantity : 1;

    const existingIndex = currentCart.findIndex(
      (c) =>
        (c.id === itemId || c.menu_id === itemId) &&
        (c.notes || c.note || "").trim() === itemNote,
    );

    if (existingIndex > -1) {
      if (hasExplicitQuantity) {
        // ถ้าเป็นการสั่งผ่าน AI ที่ระบุจำนวนมาชัดเจน ให้เซ็ตทับด้วยจำนวนนั้นทันทีเพื่อป้องกันการบวกซ้ำสะสม
        currentCart[existingIndex].quantity = quantityToAdd;
      } else {
        // ถ้าเป็นการกดปุ่มบวกหน้าจอปกติ ให้บวกสะสมเพิ่มทีละ 1
        currentCart[existingIndex].quantity =
          (Number(currentCart[existingIndex].quantity) || 1) + quantityToAdd;
      }
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
        image: finalImage,
        cartItemId: `${itemId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        added_by_name: customerInfo.value?.name,
        added_by_id: customerInfo.value?.id,
      });
    }

    state.cart = currentCart;
    queueCartSync(currentCart);
  };

  // ✅ removeFromCart ที่มี Cooldown
  const removeFromCart = async (itemId) => {
    if (isSessionExpired.value) return;

    if (cartActionCooldown) return;
    cartActionCooldown = true;
    setTimeout(() => {
      cartActionCooldown = false;
    }, 280);

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
      queueCartSync(currentCart);
    }
  };

  const initCart = () => {
    // ถ้าใน state.cart มีของอยู่แล้ว ไม่ต้องไปโหลดทับให้ของหาย
    if (state.cart && state.cart.length > 0) return;

    const resId =
      restaurantId.value || sessionStorage.getItem("customer_restaurant_id");
    const tabId = tableId.value || sessionStorage.getItem("customer_table_id");

    if (!resId) return;

    let savedCart = null;
    if (tabId) {
      savedCart = sessionStorage.getItem(`cart_${resId}_${tabId}`);
    }
    if (!savedCart) {
      savedCart = sessionStorage.getItem(`cart_${resId}`);
    }

    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed) && parsed.length > 0) {
          state.cart = parsed;
          return;
        }
      } catch (e) {
        console.error("Error parsing saved cart:", e);
      }
    }

    // ถ้าไม่มีจริงๆ และ state.cart ยังเป็นค่าว่าง ค่อยกำหนดเป็น []
    if (!state.cart) {
      state.cart = [];
    }
  };

  const handleUpdateCartNote = async ({ target, note }) => {
    if (isSessionExpired.value) return;
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
    queueCartSync(currentCart);
  };

  const goToOrder = async () => {
    // ซิงค์ตะกร้าที่ค้างอยู่ให้เรียบร้อยก่อนย้ายหน้า
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
      if (restaurantId.value && tableId.value) {
        await supabase.rpc("sync_table_cart", {
          p_table_id: tableId.value,
          p_restaurant_id: restaurantId.value,
          p_cart_items: state.cart || [],
        });
      }
    }

    if (restaurantId.value)
      sessionStorage.setItem("customer_restaurant_id", restaurantId.value);
    if (tableId.value)
      sessionStorage.setItem("customer_table_id", tableId.value);
    router.push({
      path: "/order",
      query: { restaurantId: restaurantId.value, tableId: tableId.value },
    });
  };

  watch(
    () => [
      route.query.restaurantId,
      route.query.tableId,
      route.query.restaurantName,
    ],
    ([resId, tabId, name]) => {
      const prevTable = sessionStorage.getItem("customer_table_id");
      const prevRes = sessionStorage.getItem("customer_restaurant_id");

      if (resId) sessionStorage.setItem("customer_restaurant_id", resId);
      
      if (tabId) {
        const baseTabId = tabId.split("-")[0];
        let currentSessionTable = sessionStorage.getItem("customer_table_id");

        // ถ้าสแกนโต๊ะใหม่ หรือเปลี่ยนร้านอาหาร ให้เคลียร์ Cart เดิมทิ้งทันที
        if (
          (prevTable && !prevTable.startsWith(baseTabId)) ||
          (prevRes && prevRes !== resId)
        ) {
          state.cart = [];
          sessionStorage.removeItem(`cart_${prevRes}_${prevTable}`);
          sessionStorage.removeItem(`cart_${prevRes}`);
        }

        if (
          !currentSessionTable ||
          !currentSessionTable.startsWith(baseTabId + "-")
        ) {
          const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
          const randomLetter = letters.charAt(
            Math.floor(Math.random() * letters.length),
          );
          const randomNumber = String(
            Math.floor(Math.random() * 99) + 1,
          ).padStart(2, "0");
          const suffix = `${randomLetter}${randomNumber}`;

          currentSessionTable = `${baseTabId}-${suffix}`;
          sessionStorage.setItem("customer_table_id", currentSessionTable);

          // รีเซ็ต Cart ประจำ Session ใหม่
          state.cart = [];

          router.replace({
            query: {
              ...route.query,
              tableId: currentSessionTable,
            },
          });
        } else {
          if (route.query.tableId !== currentSessionTable) {
            router.replace({
              query: {
                ...route.query,
                tableId: currentSessionTable,
              },
            });
          }
        }

        const parts = currentSessionTable.split("-");
        const baseTable = parts[0];
        const guestCode = parts[1];

        state.tableNumber = guestCode
          ? `${baseTable} (${guestCode})`
          : baseTable;
      }
      if (name) state.restaurantName = name;
    },
    { immediate: true },
  );

  watch(
    () => [restaurantId.value, tableId.value],
    ([resId, tabId]) => {
      if (resId && tabId) {
        (async () => {
          if (sessionStorage.getItem("is_table_cleared") === "true") {
            lockToThankYouState();
            return;
          }

          const isOpen = await checkTableStatus(resId, tabId);
          if (!isOpen) return;

          initCart();
          await fetchMenuData();
          await initializeCustomerSession(resId, tabId);
          await setupRealtimeCart(resId, tabId);
          await setupRealtimeOrders(resId, tabId);
        })();
      }
    },
    { immediate: true },
  );

  watch(
    () => state.cart,
    (newCart) => {
      const resId =
        restaurantId.value || sessionStorage.getItem("customer_restaurant_id");
      const tabId =
        tableId.value || sessionStorage.getItem("customer_table_id");
      if (resId && newCart) {
        const cartData = JSON.stringify(newCart);
        sessionStorage.setItem(`cart_${resId}`, cartData);
        if (tabId) {
          sessionStorage.setItem(`cart_${resId}_${tabId}`, cartData);
        }
      }
    },
    { deep: true },
  );

  const handleVisibilityChange = () => {
    if (document.hidden) isOrderModalOpen.value = false;
  };

  const addMultipleToCart = async (items) => {
    if (isSessionExpired.value || !Array.isArray(items) || items.length === 0) return;

    let currentCart = state.cart ? [...state.cart] : [];

    items.forEach((item) => {
      const itemId = item.id || item.menu_id;
      const itemNote = (item.notes || item.note || "").trim();
      const targetQuantity = Number(item.quantity);
      const quantityToAdd = !isNaN(targetQuantity) && targetQuantity > 0 ? targetQuantity : 1;

      const existingIndex = currentCart.findIndex(
        (c) =>
          (c.id === itemId || c.menu_id === itemId) &&
          (c.notes || c.note || "").trim() === itemNote,
      );

      if (existingIndex > -1) {
        currentCart[existingIndex].quantity = quantityToAdd;
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
    });

    state.cart = currentCart;
    queueCartSync(currentCart);
  };

  onUnmounted(() => {
    if (syncTimer) clearTimeout(syncTimer);
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    if (orderRealtimeChannel) supabase.removeChannel(orderRealtimeChannel);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    if (removeMenuRouterGuard) removeMenuRouterGuard();
    window.onpopstate = null;
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
    userPreferences,
    handlePreferencesSaved,
    handlePreferencesReset,
    getMenuName,
    getMenuDescription,
    getMenuAllergens,
    formatAllergens,
    formatIngredients,
    getItemQuantity,
    goToOrder,
    addToCart,
    addMultipleToCart,
    removeFromCart,
    handleUpdateCartNote,
    handleVisibilityChange,
  };
}
