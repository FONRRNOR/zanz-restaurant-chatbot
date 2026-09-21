import { ref } from "vue";

import { supabase } from "../supabaseClient";

const isModalVisible = ref(false);

const currentOrder = ref(null);

const remainingSeconds = ref(60);

// SRS-182: Stores notification service error state
const notificationError = ref(false);

let timerInterval = null;

const alertSound = new Audio("/sounds/alert.mp3");

alertSound.volume = 1.0;

export function useIncomingOrderModal() {
  // Unlock audio playback restrictions on touch devices such as iPad
  const unlockAudio = () => {
    alertSound
      .play()
      .then(() => {
        alertSound.pause();
        alertSound.currentTime = 0;
      })
      .catch((err) => console.warn("Unlock audio blocked:", err));
  };

  const playSingleChime = () => {
    try {
      alertSound.currentTime = 0;

      alertSound
        .play()
        .catch((err) => console.warn("Audio play blocked:", err));
    } catch (err) {
      console.warn("Audio error:", err);
    }
  };

  const playDoubleChime = () => {
    try {
      alertSound.currentTime = 0;

      alertSound
        .play()
        .then(() => {
          setTimeout(() => {
            alertSound.currentTime = 0;

            alertSound
              .play()
              .catch((err) => console.warn("Double play blocked:", err));
          }, 200);
        })
        .catch((err) => console.warn("Audio play blocked:", err));
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

  // SRS-178 / SRS-181:
  // Display a new order notification using a real-time modal interface.
  const showNewOrderModal = (orderData, timeLimitSec = 60) => {
    try {
      // Validate incoming order data before displaying notification.
      if (!orderData) {
        throw new Error("Invalid order notification data.");
      }

      // Clear previous notification error.
      notificationError.value = false;

      currentOrder.value = orderData;

      isModalVisible.value = true;

      startCountdown(timeLimitSec);
    } catch (error) {
      console.error("New Order Notification Error:", error);

      // SRS-182:
      // Mark the notification service as unavailable.
      notificationError.value = true;

      isModalVisible.value = false;

      currentOrder.value = null;

      clearInterval(timerInterval);

      alertSound.pause();
      alertSound.currentTime = 0;
    }
  };

  // SRS-182:
  // Handle notification service failure.
  const handleNotificationError = (error) => {
    console.error("Notification Service Error:", error);

    notificationError.value = true;

    isModalVisible.value = false;

    currentOrder.value = null;

    clearInterval(timerInterval);

    alertSound.pause();
    alertSound.currentTime = 0;
  };

  // Clear the notification error state.
  const clearNotificationError = () => {
    notificationError.value = false;
  };

  // Asynchronously approve the order and update status to preparing in Supabase
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

    // SRS-182
    notificationError,
    handleNotificationError,
    clearNotificationError,

    showNewOrderModal,
    handleApproveOrder,
    handleRejectOrder,
    unlockAudio,
  };
}
