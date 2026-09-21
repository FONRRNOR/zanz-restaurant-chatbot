<script setup>
import { useIncomingOrderModal } from "../../composables/useIncomingOrderModal";

// Destructure state and actions from the incoming order composable
const {
  isModalVisible,
  currentOrder,
  remainingSeconds,
  notificationError,
  clearNotificationError,
  handleApproveOrder,
} = useIncomingOrderModal();
</script>

<template>
  <!-- =========================================================
         SRS-181: New Order Notification Modal
         Displays when a new order is received.
         ========================================================= -->
  <div
    v-if="isModalVisible && currentOrder"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm"
  >
    <div
      class="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-stone-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150"
    >
      <!-- Header Clean Green Theme -->
      <div class="bg-emerald-700 text-white px-6 py-5">
        <div class="flex items-center justify-between">
          <div>
            <!-- New Order Label -->
            <div
              class="inline-flex justify-center items-center bg-emerald-800/60 px-7 py-1.5 rounded-md mb-1"
            >
              <!-- Blinking live indicator dot -->
              <span class="relative flex h-2 w-2 mr-2">
                <span
                  class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"
                ></span>

                <span
                  class="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"
                ></span>
              </span>

              <span
                class="text-[12px] font-bold tracking-wider uppercase text-emerald-200 leading-none pt-[2px]"
              >
                New Order
              </span>
            </div>

            <h2 class="text-2xl font-black tracking-tight mt-[8px]">
              Incoming Kitchen Order!
            </h2>
          </div>

          <!-- Countdown Timer -->
          <div class="flex flex-col justify-center items-center h-full">
            <span
              class="text-[12px] font-semibold text-emerald-100/90 mb-3 tracking-wide mt-[8px]"
            >
              Time Remaining
            </span>

            <div
              class="text-2xl font-black px-4 py-1.5 rounded-xl min-w-[70px] text-center border transition-all leading-none flex items-center justify-center"
              :class="
                remainingSeconds > 15
                  ? 'bg-emerald-800/80 text-white border-emerald-600/50'
                  : 'bg-rose-600 text-white border-rose-400 animate-pulse'
              "
            >
              {{ remainingSeconds > 0 ? `${remainingSeconds}s` : "Time's Up" }}
            </div>
          </div>
        </div>
      </div>

      <!-- Order Summary -->
      <div
        class="px-6 py-5 bg-stone-50 border-b border-stone-200 flex flex-col gap-1.5"
      >
        <!-- Field Labels -->
        <div class="flex justify-between items-end">
          <span
            class="text-xs font-medium text-stone-400 uppercase tracking-wide w-1/3 text-left"
          >
            Table
          </span>

          <span
            class="text-xs font-medium text-stone-400 uppercase tracking-wide w-1/3 text-center"
          >
            Order Time
          </span>

          <span
            class="text-xs font-medium text-stone-400 uppercase tracking-wide w-1/3 text-right"
          >
            Order ID
          </span>
        </div>

        <!-- Field Values -->
        <div class="flex justify-between items-baseline">
          <span class="text-2xl font-bold text-stone-800 w-1/3 text-left">
            Table {{ currentOrder.table_number }}
          </span>

          <span class="text-lg font-semibold text-stone-700 w-1/3 text-center">
            {{ currentOrder.order_time || "14:30" }}
          </span>

          <span
            class="text-lg font-semibold text-stone-700 font-mono w-1/3 text-right"
          >
            #{{ currentOrder.order_id }}
          </span>
        </div>
      </div>

      <!-- Menu Items List -->
      <div class="p-6">
        <div class="space-y-3 max-h-64 overflow-y-auto pr-1">
          <div
            v-for="(item, idx) in currentOrder.items"
            :key="idx"
            class="flex items-start justify-between gap-3 p-3.5 rounded-2xl bg-stone-50/80 border border-stone-200/80"
          >
            <div class="flex-1">
              <div class="flex items-baseline gap-2">
                <span class="text-lg font-black text-emerald-700">
                  {{ item.quantity }}&times;
                </span>

                <span class="text-base font-bold text-stone-900 leading-snug">
                  {{ item.name }}
                </span>
              </div>

              <!-- Warning / Allergy Note -->
              <p
                v-if="item.note && item.note !== '-'"
                class="mt-2 inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"
              >
                {{ item.note }}
              </p>
            </div>

            <span
              class="text-xs font-bold text-stone-400 whitespace-nowrap mt-1"
            >
              {{ item.quantity }} item(s)
            </span>
          </div>
        </div>

        <!-- Approve Button -->
        <button
          @click="handleApproveOrder"
          class="w-full mt-6 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-extrabold text-base shadow-lg shadow-emerald-700/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 stroke-[2.5]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>

          <span>Approve Order</span>
        </button>
      </div>
    </div>
  </div>

  <!-- =========================================================
         SRS-182: New Order Notification Error
         Displays when the new order notification cannot be delivered.
         ========================================================= -->
  <div
    v-if="notificationError"
    class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm"
  >
    <div
      class="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-stone-200 p-6 text-center"
    >
      <!-- Error Icon -->
      <div
        class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-7 w-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v3.75m0 3.75h.01M10.29 3.86l-7.2 12.5A2 2 0 004.82 19.5h14.36a2 2 0 001.73-3.14l-7.2-12.5a2 2 0 00-3.42 0z"
          />
        </svg>
      </div>

      <!-- Error Title -->
      <h2 class="mt-4 text-xl font-bold text-stone-900">Notification Error</h2>

      <!-- SRS-182 Exact Error Message -->
      <p class="mt-3 text-sm leading-6 text-stone-600">
        Unable to send the new order notification. Please try again later.
      </p>

      <!-- Close Button -->
      <button
        @click="clearNotificationError"
        class="w-full mt-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition"
      >
        Close
      </button>
    </div>
  </div>
</template>
