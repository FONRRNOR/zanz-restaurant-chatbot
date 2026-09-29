import { ref, computed } from "vue";
import { supabase } from "../../supabaseClient";

export function useStaffOrders(state, showNewOrderModal) {
  const orders = ref([]);
  const activeFilter = ref("all");
  const restaurantId = ref("");
  let channel = null;

  // Asynchronously fetch active orders with line items and format for display
  async function fetchOrders() {
    if (!restaurantId.value) return;

    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items (*)")
      .eq("restaurant_id", restaurantId.value)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Supabase Error:", error);
      return;
    }

    const allergyKeywords = [
      "no onion",
      "no peanuts",
      "no shrimp",
      "no dairy",
      "no egg",
      "allergic",
      "allergy",
      "แพ้",
      "ห้ามใส่",
      "ไม่ใส่",
    ];

    orders.value = (data || []).map((order) => {
      // ✅ ย้ายเข้ามาตรวจราย order ข้างในลูป
      const orderNoteText = (order.customer_note || "").toLowerCase();
      const isOrderAllergy = allergyKeywords.some((keyword) =>
        orderNoteText.includes(keyword),
      );

      let detectedAllergies = order.allergies || [];
      if (isOrderAllergy && detectedAllergies.length === 0) {
        detectedAllergies = [order.customer_note || "มีประวัติการแพ้อาหาร"];
      }

      return {
        id: order.id,
        orderNumber: order.order_code || `A-${100 + order.id}`,
        tableNumber: order.table_number?.replace("T-", "") || "?",
        time: new Date(order.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        status: order.status === "pending" ? "new" : order.status,
        items: (order.order_items || []).map((item, index) => {
          const noteText = (item.note || "").toLowerCase();
          const isAllergy = allergyKeywords.some((keyword) =>
            noteText.includes(keyword),
          );

          let displayName = item.menu_name;
          if (state.language === "th") {
            displayName = item.menu_name_th || item.name_th || item.menu_name;
          } else {
            displayName = item.menu_name || item.name;
          }

          return {
            id: `${order.id}-${item.id}-${index}`,
            name: displayName,
            quantity: item.quantity,
            note: item.note,
            isAllergy: isAllergy,
          };
        }),
        customerNote: order.customer_note,
        allergies: detectedAllergies,
        type: order.type || "dine_in",
      };
    });
  }

  // Trigger alert modal for new order
  async function triggerNewOrderAlert(orderId) {
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items (*)")
      .eq("id", orderId)
      .single();

    if (error || !data) return;

    const modalData = {
      raw_id: data.id,
      order_id: data.order_code || `A-${100 + data.id}`,
      customer_name: data.customer_name || "Dine-in Customer",
      table_number: data.table_number?.replace("T-", "") || "?",
      order_time: new Date(data.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      items: (data.order_items || []).map((item) => {
        let displayName = item.menu_name;
        if (state.language === "th") {
          displayName = item.menu_name_th || item.name_th || item.menu_name;
        }
        return {
          name: displayName,
          quantity: item.quantity,
          note: item.note || "-",
        };
      }),
    };

    showNewOrderModal(modalData, 60);
  }

  const filteredOrders = computed(() => {
    let result = orders.value;

    if (activeFilter.value === "dine_in") {
      result = result.filter((o) => o.type === "dine_in");
    } else if (activeFilter.value === "allergies") {
      result = result.filter((o) => o.allergies && o.allergies.length > 0);
    }

    return result;
  });

  async function updateOrderStatus(orderId, nextStatus) {
    const now = new Date().toISOString();

    const orderIndex = orders.value.findIndex((o) => o.id === orderId);
    if (orderIndex !== -1) {
      orders.value[orderIndex].status =
        nextStatus === "pending" ? "new" : nextStatus;
    }

    const { error } = await supabase
      .from("orders")
      .update({
        status: nextStatus,
        updated_at: now,
      })
      .eq("id", orderId);

    if (error) {
      console.error("Update Status Error:", error);
      alert("Update failed: " + error.message);
    }
    await fetchOrders();
  }

  function setupRealtimeSubscription(resId) {
    if (!resId) return;

    if (channel) {
      supabase.removeChannel(channel);
    }

    channel = supabase
      .channel(`staff-orders-${resId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${resId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newStatus = payload.new.status;
            if (!newStatus || newStatus === "pending" || newStatus === "new") {
              triggerNewOrderAlert(payload.new.id);
            }
          }
          fetchOrders();
        },
      )
      .subscribe();
  }

  function cleanupRealtime() {
    if (channel) {
      supabase.removeChannel(channel);
    }
  }

  return {
    orders,
    activeFilter,
    restaurantId,
    filteredOrders,
    fetchOrders,
    updateOrderStatus,
    setupRealtimeSubscription,
    cleanupRealtime,
  };
}