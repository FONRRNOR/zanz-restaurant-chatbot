import { ref, computed, watch, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { supabase } from "../../supabaseClient";

export function useCustomerCart(state) {
  const router = useRouter();
  const route = useRoute();

  const isSubmitting = ref(false);
  const showDeleteModal = ref(false);
  const itemToDelete = ref(null);
  const itemNotes = ref({});
  const showNoteInput = ref({});
  const showSuccessModal = ref(false);
  const successOrderCode = ref("");

  const getResId = () =>
    route.query.restaurantId ||
    sessionStorage.getItem("customer_restaurant_id");
  const getTabId = () => {
    const sessionTab = sessionStorage.getItem("customer_table_id");
    const urlTab = route.query.tableId;
    if (sessionTab && urlTab && sessionTab.startsWith(urlTab))
      return sessionTab;
    return sessionTab || urlTab;
  };

  const currencyUnit = computed(() =>
    state.language === "th" ? "บาท." : "Baht.",
  );

  const getGroupKey = (item) => {
    const noteStr = (item.notes || item.note || "").trim();
    return `${item.id || item.menu_id}_${noteStr}`;
  };

  const groupedCartItems = computed(() => {
    if (!state.cart || !Array.isArray(state.cart)) return [];
    const groups = {};
    state.cart.forEach((item) => {
      // ข้ามรายการที่ข้อมูลไม่ครบถ้วน
      if (!item || (!item.id && !item.menu_id) || (!item.name && !item.name_th))
        return;

      const key = getGroupKey(item);
      const itemQty = Number(item.quantity) || 1;
      const itemNote = (item.notes || item.note || "").trim();

      if (!groups[key]) {
        groups[key] = { ...item, groupKey: key, notes: itemNote, quantity: 0 };
      }
      groups[key].quantity += itemQty;
    });
    return Object.values(groups);
  });

  const subtotal = computed(() => {
    if (!state.cart) return 0;
    return state.cart.reduce((sum, item) => {
      const price = item.priceNum || parseFloat(item.price) || 0;
      const qty = Number(item.quantity) || 1;
      return sum + price * qty;
    }, 0);
  });

  const serviceFee = computed(() => 0);
  const total = computed(() => subtotal.value + serviceFee.value);

  onMounted(() => {
    const resId = getResId();
    const tabId = getTabId();

    if (resId && tabId) {
      const savedCart = sessionStorage.getItem(`cart_${resId}_${tabId}`);
      if (savedCart) {
        try {
          state.cart = JSON.parse(savedCart);
        } catch (e) {
          state.cart = [];
        }
      }

      const savedNotes = sessionStorage.getItem(`notes_${resId}_${tabId}`);
      if (savedNotes) {
        try {
          const parsedNotes = JSON.parse(savedNotes);
          itemNotes.value = parsedNotes;
          Object.keys(parsedNotes).forEach((key) => {
            if (parsedNotes[key] && parsedNotes[key].trim() !== "") {
              showNoteInput.value[key] = true;
            }
          });
        } catch (e) {
          console.error("Error parsing notes:", e);
        }
      }
    }

    if (state.cart && state.cart.length > 0) {
      state.cart.forEach((item) => {
        const key = getGroupKey(item);
        const noteStr = (item.notes || item.note || "").trim();
        if (noteStr && !itemNotes.value[key]) {
          itemNotes.value[key] = noteStr;
        }
      });
    }
  });

  watch(
    () => state.cart,
    (newCart) => {
      const resId = getResId();
      const tabId = getTabId();
      if (resId && tabId && newCart) {
        sessionStorage.setItem(
          `cart_${resId}_${tabId}`,
          JSON.stringify(newCart),
        );
      }
    },
    { deep: true },
  );

  watch(
    itemNotes,
    (newNotes) => {
      const resId = getResId();
      const tabId = getTabId();
      if (resId && tabId) {
        sessionStorage.setItem(
          `notes_${resId}_${tabId}`,
          JSON.stringify(newNotes),
        );
      }
    },
    { deep: true },
  );

  const toggleNoteInput = (key) => {
    showNoteInput.value[key] = !showNoteInput.value[key];
  };

  const goBackToMenu = () => {
    const resId =
      getResId() ||
      route.query.restaurantId ||
      sessionStorage.getItem("customer_restaurant_id");
    const tabId =
      getTabId() ||
      route.query.tableId ||
      sessionStorage.getItem("customer_table_id");

    // บันทึกสำรองตะกร้าลง sessionStorage ไว้ก่อนเปลี่ยนหน้าเสมอ
    if (resId && tabId && state.cart) {
      const cartData = JSON.stringify(state.cart);
      sessionStorage.setItem(`cart_${resId}_${tabId}`, cartData);
      sessionStorage.setItem(`cart_${resId}`, cartData);
    }

    // ย้อนกลับพร้อมแนบ Query Parameters ให้ครบถ้วน
    router.push({
      path: "/customer/menu/mobile",
      query: {
        restaurantId: resId,
        tableId: tabId,
      },
    });
  };

  const adjustQuantity = (item, amount) => {
    if (!state.cart) state.cart = [];
    const targetKey = item.groupKey || getGroupKey(item);

    if (amount > 0) {
      state.cart.push({
        ...item,
        quantity: 1,
        notes: itemNotes.value[targetKey] || item.notes || "",
        note: itemNotes.value[targetKey] || item.notes || "",
      });
    } else {
      const matchingItems = state.cart.filter(
        (c) => (c.groupKey || getGroupKey(c)) === targetKey,
      );
      const totalQty = matchingItems.reduce(
        (sum, c) => sum + (Number(c.quantity) || 1),
        0,
      );
      if (totalQty <= 1) {
        itemToDelete.value = item;
        showDeleteModal.value = true;
      } else {
        const index = state.cart.findIndex(
          (c) => (c.groupKey || getGroupKey(c)) === targetKey,
        );
        if (index !== -1) {
          if (state.cart[index].quantity && state.cart[index].quantity > 1) {
            state.cart[index].quantity--;
          } else {
            state.cart.splice(index, 1);
          }
        }
      }
    }
  };

  const promptRemoveItem = (item) => {
    itemToDelete.value = item;
    showDeleteModal.value = true;
  };

  const confirmDelete = () => {
    if (itemToDelete.value && state.cart) {
      const targetKey =
        itemToDelete.value.groupKey || getGroupKey(itemToDelete.value);
      state.cart = state.cart.filter(
        (c) => (c.groupKey || getGroupKey(c)) !== targetKey,
      );
      delete itemNotes.value[targetKey];
      delete showNoteInput.value[targetKey];
    }
    showDeleteModal.value = false;
    setTimeout(() => {
      itemToDelete.value = null;
    }, 300);
  };

  const cancelDelete = () => {
    showDeleteModal.value = false;
    setTimeout(() => {
      itemToDelete.value = null;
    }, 300);
  };

  const submitOrder = async () => {
    if (!state.cart || state.cart.length === 0) return;
    isSubmitting.value = true;

    try {
      const resId = getResId();
      const tabId = getTabId();

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert({
          table_number: tabId,
          total_price: total.value,
          restaurant_id: resId,
          status: "pending",
        })
        .select("id, order_code")
        .single();

      if (orderError) throw orderError;

      const orderItems = groupedCartItems.value.map((item) => {
        const targetKey = item.groupKey || getGroupKey(item);
        const finalNote = itemNotes.value[targetKey] || item.notes || "";
        return {
          order_id: orderData.id,
          menu_id: item.id || item.menu_id,
          menu_name: item.name,
          menu_name_th:
            item.name_th || item.name_TH || item.nameTh || item.name,
          quantity: item.quantity,
          price_at_order: item.priceNum || parseFloat(item.price) || 0,
          note: finalNote && finalNote.trim() !== "" ? finalNote.trim() : null,
        };
      });

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);
      if (itemsError) throw itemsError;

      successOrderCode.value = orderData.order_code;
      state.cart = [];
      itemNotes.value = {};
      showNoteInput.value = {};
      sessionStorage.removeItem(`cart_${resId}_${tabId}`);
      sessionStorage.removeItem(`notes_${resId}_${tabId}`);

      showSuccessModal.value = true;
    } catch (error) {
      console.error("Error submitting order:", error);
      alert("เกิดข้อผิดพลาดในการสั่งอาหาร กรุณาลองใหม่อีกครั้ง");
    } finally {
      isSubmitting.value = false;
    }
  };

  const closeSuccessModal = () => {
    showSuccessModal.value = false;
    goBackToMenu();
  };

  return {
    isSubmitting,
    showDeleteModal,
    showSuccessModal,
    successOrderCode,
    itemNotes,
    showNoteInput,
    currencyUnit,
    groupedCartItems,
    subtotal,
    serviceFee,
    total,
    toggleNoteInput,
    goBackToMenu,
    adjustQuantity,
    promptRemoveItem,
    confirmDelete,
    cancelDelete,
    submitOrder,
    closeSuccessModal,
  };
}
