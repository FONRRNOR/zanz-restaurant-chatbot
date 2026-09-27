import { ref } from "vue";
import { useRouter } from "vue-router"; // 🌟 เพิ่ม router
import { supabase } from "../../supabaseClient";

const isModalVisible = ref(false);
const currentOrder = ref(null);
const remainingSeconds = ref(60);
const notificationError = ref(false);

let timerInterval = null;
const alertSound = new Audio("/sounds/alert.mp3");
alertSound.volume = 1.0;

export function useIncomingOrderModal() {
  const router = useRouter(); // 🌟 เรียกใช้ router

  const unlockAudio = () => {
    alertSound.play().then(() => {
      alertSound.pause();
      alertSound.currentTime = 0;
    }).catch((err) => console.warn("Unlock audio blocked:", err));
  };

  const playSingleChime = () => {
    try {
      alertSound.currentTime = 0;
      alertSound.play().catch((err) => console.warn("Audio play blocked:", err));
    } catch (err) {
      console.warn("Audio error:", err);
    }
  };

  const playDoubleChime = () => {
    try {
      alertSound.currentTime = 0;
      alertSound.play().then(() => {
        setTimeout(() => {
          alertSound.currentTime = 0;
          alertSound.play().catch((err) => console.warn("Double play blocked:", err));
        }, 200);
      }).catch((err) => console.warn("Audio play blocked:", err));
    } catch (err) {
      console.warn("Audio error:", err);
    }
  };

  const startCountdown = (initialSeconds = 60) => {
    clearInterval(timerInterval);
    remainingSeconds.value = initialSeconds;
    playSingleChime();

    timerInterval = setInterval(() => {
      if (remainingSeconds.value > 0) {
        remainingSeconds.value--;
      }
      if (remainingSeconds.value === 0) {
        playDoubleChime();
      } else {
        playSingleChime();
      }
    }, 1000);
  };

  const showNewOrderModal = (orderData, timeLimitSec = 60) => {
    // 🌟 เช็คว่าถ้า Staff ยังไม่ล็อกอิน (ไม่มี activeUser) จะไม่แสดง Modal และไม่แจ้งเตือนใดๆ
    const savedUserString = sessionStorage.getItem("zank-active-user");
    if (!savedUserString) return;

    try {
      if (!orderData) {
        throw new Error("Invalid order notification data.");
      }

      notificationError.value = false;
      currentOrder.value = orderData;
      isModalVisible.value = true;
      startCountdown(timeLimitSec);
    } catch (error) {
      console.error("New Order Notification Error:", error);
      notificationError.value = true;
      isModalVisible.value = false;
      currentOrder.value = null;
      clearInterval(timerInterval);
      alertSound.pause();
      alertSound.currentTime = 0;
    }
  };

  const handleNotificationError = (error) => {
    console.error("Notification Service Error:", error);
    notificationError.value = true;
    isModalVisible.value = false;
    currentOrder.value = null;
    clearInterval(timerInterval);
    alertSound.pause();
    alertSound.currentTime = 0;
  };

  const clearNotificationError = () => {
    notificationError.value = false;
  };

  // 🌟 เมื่อกด Approve จะอัปเดตสถานะและพาไปหน้า /staff/live-orders ทันที
  const handleApproveOrder = async () => {
    clearInterval(timerInterval);
    alertSound.pause();
    alertSound.currentTime = 0;

    const orderRawId = currentOrder.value?.raw_id;
    isModalVisible.value = false;

    if (orderRawId) {
      const { error } = await supabase
        .from("orders")
        .update({
          status: "preparing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderRawId);

      if (error) {
        console.error("Approve Order Error:", error);
      }
    }

    // สั่งเปลี่ยนหน้าไปที่ Live Orders ของ Staff ทันที
    router.push("/staff/live-orders");
  };

  const handleRejectOrder = () => {
    clearInterval(timerInterval);
    alertSound.pause();
    alertSound.currentTime = 0;
    isModalVisible.value = false;
    currentOrder.value = null;
  };

  return {
    isModalVisible,
    currentOrder,
    remainingSeconds,
    notificationError,
    handleNotificationError,
    clearNotificationError,
    showNewOrderModal,
    handleApproveOrder,
    handleRejectOrder,
    unlockAudio,
  };
}