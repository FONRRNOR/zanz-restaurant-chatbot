import { ref, computed, onMounted, onUnmounted } from "vue";
import { supabase } from "../../supabaseClient";

export function useOwnerOrders(state) {
  // ==========================================
  // 1. State Declarations
  // ==========================================
  const orders = ref([]);
  const selected = ref(null);
  const filter = ref("active");
  const loading = ref(true);
  const restaurantId = ref("");
  let realTimeSubscription = null;

  // Modal States
  const showCheckoutModal = ref(false);
  const paymentMethod = ref("qr"); // 'qr' or 'cash'
  const isProcessingPayment = ref(false);
  const paymentSuccess = ref(false);

  // Phone number or Citizen ID linked to store PromptPay
  const promptpayId = ref("0987674247");

  // Constants
  const statuses = ["active", "kitchen", "ready", "completed", "paid"];
  const steps = ["new", "preparing", "ready", "completed"];

  // ==========================================
  // 2. Helper Functions
  // ==========================================
  function mapDbStatusToUi(dbStatus) {
    const mapping = {
      pending: "new",
      preparing: "preparing",
      ready: "ready",
      served: "completed",
      paid: "paid",
      cancelled: "cancelled",
    };
    return mapping[dbStatus] || dbStatus;
  }

  function mapUiStatusToDb(uiStatus) {
    const mapping = {
      new: "pending",
      preparing: "preparing",
      ready: "ready",
      completed: "served",
      paid: "paid",
    };
    return mapping[uiStatus] || uiStatus;
  }

  function formatOrder(dbOrder) {
    const dbItems = dbOrder.order_items || [];
    const formattedItems = dbItems.map((item) => {
      let itemPrice = parseFloat(item.price_at_order || item.price || 0);
      return {
        get name() {
          let displayName = item.menu_name;
          if (item.menu_items) {
            if (state.language === "th") {
              displayName = item.menu_items.name_th || item.menu_items.name || item.menu_name;
            } else {
              displayName = item.menu_items.name || item.menu_items.name_th || item.menu_name;
            }
          }
          return displayName || (state.language === "en" ? "Unknown Item" : "ไม่ระบุชื่อเมนู");
        },
        quantity: parseInt(item.quantity || 1),
        price: itemPrice,
        note: item.note || "",
      };
    });

    return {
      id: dbOrder.id,
      orderNumber: dbOrder.order_code || dbOrder.id,
      tableNumber: dbOrder.table_number || "N/A",
      status: mapDbStatusToUi(dbOrder.status),
      allergies: [], // ขยายเพิ่มได้หากมีข้อมูล allergy
      items: formattedItems,
      customerNote: dbOrder.customer_note || "",
      totalPrice: parseFloat(dbOrder.total_price || 0),
      time: new Date(dbOrder.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      raw: dbOrder,
    };
  }

  function getStatusLabel(statusKey) {
    const labels = {
      active: state.language === "en" ? "Active" : "ปัจจุบัน (ทั้งหมด)",
      kitchen: state.language === "en" ? "Kitchen" : "ในครัว (ใหม่/กำลังทำ)",
      ready: state.language === "en" ? "To Serve" : "รอเสิร์ฟ",
      completed: state.language === "en" ? "To Pay" : "รอเช็คบิล",
      paid: state.language === "en" ? "History" : "ประวัติ (จ่ายแล้ว)",
    };
    return labels[statusKey?.toLowerCase()] || statusKey;
  }

  function getFilteredArray(allOrders, currentFilter) {
    return allOrders.filter((order) => {
      if (currentFilter === "active") return order.status !== "paid" && order.status !== "cancelled";
      if (currentFilter === "kitchen") return order.status === "new" || order.status === "preparing";
      return order.status === currentFilter;
    });
  }

  // ==========================================
  // 3. Computed Properties
  // ==========================================
  const filteredOrders = computed(() => getFilteredArray(orders.value, filter.value));

  const counts = computed(() => ({
    new: orders.value.filter((o) => o.status === "new").length,
    preparing: orders.value.filter((o) => o.status === "preparing").length,
    ready: orders.value.filter((o) => o.status === "ready").length,
    completed: orders.value.filter((o) => o.status === "completed").length,
    paid: orders.value.filter((o) => o.status === "paid").length,
  }));

  const orderTotal = computed(() => (selected.value ? selected.value.totalPrice : 0));

  const canCancel = computed(
    () => selected.value && !["completed", "cancelled", "paid"].includes(selected.value.status)
  );

  const canAdvance = computed(
    () => selected.value && steps.indexOf(selected.value.status) < steps.length - 1 && selected.value.status !== "cancelled"
  );

  const canRollback = computed(
    () => selected.value && steps.indexOf(selected.value.status) > 0 && selected.value.status !== "paid" && selected.value.status !== "cancelled"
  );

  // ==========================================
  // 4. API & Actions
  // ==========================================
  async function fetchOrders() {
    if (!restaurantId.value) return;
    loading.value = true;
    
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*, menu_items(*))")
      .eq("restaurant_id", restaurantId.value)
      .order("created_at", { ascending: true });

    if (!error && data) {
      orders.value = data.map(formatOrder);
      const currentFiltered = getFilteredArray(orders.value, filter.value);

      if (selected.value) {
        const updatedSelected = orders.value.find((o) => o.id === selected.value.id);
        if (updatedSelected) {
          selected.value = updatedSelected;
        } else {
          selected.value = currentFiltered.length > 0 ? currentFiltered[0] : null;
        }
      } else if (currentFiltered.length > 0) {
        selected.value = currentFiltered[0];
      }
    } else {
      console.error("Error fetching orders:", error);
    }
    loading.value = false;
  }

  async function updateOrderStatus(orderId, currentUiStatus) {
    const currentIdx = steps.indexOf(currentUiStatus);
    if (currentIdx >= steps.length - 1) return;

    const nextUiStatus = steps[currentIdx + 1];
    const nextDbStatus = mapUiStatusToDb(nextUiStatus);

    const orderIndex = orders.value.findIndex((o) => o.id === orderId);
    if (orderIndex !== -1) orders.value[orderIndex].status = nextUiStatus;
    if (selected.value && selected.value.id === orderId) selected.value.status = nextUiStatus;

    const { error } = await supabase.from("orders").update({ status: nextDbStatus }).eq("id", orderId);
    if (error) {
      console.error("Error updating status:", error);
      fetchOrders();
    }
  }

  async function rollbackOrderStatus(orderId, currentUiStatus) {
    const currentIdx = steps.indexOf(currentUiStatus);
    if (currentIdx <= 0) return;

    const prevUiStatus = steps[currentIdx - 1];
    const prevDbStatus = mapUiStatusToDb(prevUiStatus);

    const orderIndex = orders.value.findIndex((o) => o.id === orderId);
    if (orderIndex !== -1) orders.value[orderIndex].status = prevUiStatus;
    if (selected.value) selected.value.status = prevUiStatus;

    const { error } = await supabase.from("orders").update({ status: prevDbStatus }).eq("id", orderId);
    if (error) {
      console.error("Error rolling back status:", error);
      fetchOrders();
    }
  }

  async function cancelOrder(orderId) {
    const confirmCancel = confirm(
      state.language === "en" ? "Are you sure you want to cancel this order?" : "คุณแน่ใจหรือไม่ที่จะยกเลิกคำสั่งซื้อนี้?"
    );
    if (!confirmCancel) return;

    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
    if (!error) {
      fetchOrders();
    } else {
      console.error("Error cancelling order:", error);
    }
  }

  // ==========================================
  // 5. Checkout & Payment
  // ==========================================
  function openCheckoutModal() {
    if (!selected.value) return;
    paymentMethod.value = "qr";
    paymentSuccess.value = false;
    isProcessingPayment.value = false;
    showCheckoutModal.value = true;
  }

  function closeCheckoutModal() {
    if (isProcessingPayment.value && !paymentSuccess.value) return;
    showCheckoutModal.value = false;
  }

  async function confirmPayment() {
    if (!selected.value) return;
    isProcessingPayment.value = true;

    try {
      const { error: updateError } = await supabase.from("orders").update({ status: "paid" }).eq("id", selected.value.id);
      if (updateError) throw updateError;

      const targetTableId = selected.value.raw.table_id || selected.value.raw.table_number;
      const targetRestaurantId = selected.value.raw.restaurant_id || restaurantId.value;

      const { error: rpcError } = await supabase.rpc("clear_table_session", {
        p_table_id: targetTableId,
        p_restaurant_id: targetRestaurantId,
      });

      if (rpcError) throw rpcError;

      paymentSuccess.value = true;
      setTimeout(() => {
        showCheckoutModal.value = false;
        if (filter.value === "active" || filter.value === "completed") {
          selected.value = null;
        }
        fetchOrders();
      }, 2000);
    } catch (err) {
      console.error("Error clearing table:", err);
      alert(state.language === "en" ? "Error processing payment." : "เกิดข้อผิดพลาดในการชำระเงิน");
      isProcessingPayment.value = false;
    }
  }

  // ==========================================
  // 6. Lifecycle Hooks
  // ==========================================
  onMounted(() => {
    const savedLanguage = localStorage.getItem("zank-language");
    if (savedLanguage) state.language = savedLanguage;

    const savedUserJson = sessionStorage.getItem("zank-active-user");
    if (savedUserJson) {
      try {
        const localUser = JSON.parse(savedUserJson);
        restaurantId.value = localUser.restaurant_id || "";
      } catch (e) {
        console.error("Error parsing user session:", e);
      }
    }

    if (!restaurantId.value && state.activeUser) {
      restaurantId.value = state.activeUser.restaurant_id || "";
    }

    fetchOrders();

    if (restaurantId.value) {
      realTimeSubscription = supabase
        .channel(`public:orders-${restaurantId.value}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId.value}` },
          () => fetchOrders()
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "order_items" },
          () => fetchOrders()
        )
        .subscribe();
    }
  });

  onUnmounted(() => {
    if (realTimeSubscription) supabase.removeChannel(realTimeSubscription);
  });

  return {
    orders,
    selected,
    filter,
    loading,
    restaurantId,
    showCheckoutModal,
    paymentMethod,
    isProcessingPayment,
    paymentSuccess,
    promptpayId,
    statuses,
    filteredOrders,
    counts,
    orderTotal,
    canCancel,
    canAdvance,
    canRollback,
    fetchOrders,
    updateOrderStatus,
    rollbackOrderStatus,
    cancelOrder,
    getStatusLabel,
    openCheckoutModal,
    closeCheckoutModal,
    confirmPayment,
  };
}