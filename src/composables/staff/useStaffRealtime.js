import { onMounted, onUnmounted } from "vue";
import { supabase } from "../../supabaseClient";
import { useIncomingOrderModal } from "../shared/useIncomingOrderModal";

export function useStaffRealtime() {
    const { showNewOrderModal, unlockAudio } = useIncomingOrderModal();
    let globalChannel = null;

    async function triggerGlobalAlert(orderId) {
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
            items: (data.order_items || []).map((item) => ({
                name: item.menu_name || item.name,
                quantity: item.quantity,
                note: item.note || "-",
            })),
        };

        showNewOrderModal(modalData, 60);
    }

    onMounted(() => {
        // ปลดล็อกเสียงบนอุปกรณ์พกพา
        const unlockOnInteraction = () => {
            if (typeof unlockAudio === "function") unlockAudio();
        };
        window.addEventListener("touchstart", unlockOnInteraction, { once: true });
        window.addEventListener("click", unlockOnInteraction, { once: true });

        // ดึงข้อมูลพนักงานจาก session เพื่อดู restaurant_id
        const savedUserJson = sessionStorage.getItem("zank-active-user");
        if (savedUserJson) {
            try {
                const localUser = JSON.parse(savedUserJson);
                const resId = localUser.restaurant_id;
                if (resId) {
                    globalChannel = supabase
                        .channel(`global-staff-orders-${resId}`)
                        .on(
                            "postgres_changes",
                            {
                                event: "INSERT",
                                schema: "public",
                                table: "orders",
                                filter: `restaurant_id=eq.${resId}`,
                            },
                            (payload) => {
                                const newStatus = payload.new.status;
                                if (
                                    !newStatus ||
                                    newStatus === "pending" ||
                                    newStatus === "new"
                                ) {
                                    triggerGlobalAlert(payload.new.id);
                                }
                            },
                        )
                        .subscribe();
                }
            } catch (e) {
                console.error("Error setting up global realtime:", e);
            }
        }
    });

    onUnmounted(() => {
        if (globalChannel) {
            supabase.removeChannel(globalChannel);
        }
    });
}