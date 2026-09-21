<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  orderData: {
    type: Object,
    default: () => ({})
  },
  duration: {
    type: Number,
    default: 8
  }
})

const emit = defineEmits(['close'])

const isVisible = ref(false)
const timeLeft = ref(props.duration)
let timer = null

// 5 Core Steps in English
const STEPS = [
  { key: 'pending', label: 'Received', num: 1 },
  { key: 'cooking', label: 'Cooking', num: 2 },
  { key: 'ready', label: 'Ready', num: 3 },
  { key: 'served', label: 'Served', num: 4 },
  { key: 'completed', label: 'Completed', num: 5 }
]

// Identify the current step and text representation in English
const stepInfo = computed(() => {
  const rawStatus = String(props.orderData?.status || '').toLowerCase()

  let currentNum = 1
  let title = 'Order Status Updated'
  let desc = props.orderData?.message || ''

  if (rawStatus.includes('pending') || rawStatus.includes('รับออเดอร์')) {
    currentNum = 1
    title = 'Order Received'
    if (!desc) desc = 'The kitchen has received your order and queued it.'
  } else if (
    rawStatus.includes('cook') ||
    rawStatus.includes('prepar') ||
    rawStatus.includes('ปรุง') ||
    rawStatus.includes('ทำ')
  ) {
    currentNum = 2
    title = 'Cooking in Progress'
    if (!desc) desc = 'Our chefs are actively preparing your dishes.'
  } else if (rawStatus.includes('ready') || rawStatus.includes('พร้อม')) {
    currentNum = 3
    title = 'Ready to Serve'
    if (!desc) desc = 'Your food is cooked and will be served shortly.'
  } else if (rawStatus.includes('served') || rawStatus.includes('เสิร์ฟ')) {
    currentNum = 4
    title = 'Dishes Served'
    if (!desc) desc = 'Your dishes have been served. Enjoy your meal!'
  } else if (
    rawStatus.includes('complete') ||
    rawStatus.includes('เสร็จ') ||
    rawStatus.includes('ปิดบิล')
  ) {
    currentNum = 5
    title = 'Order Completed'
    if (!desc) desc = 'Payment confirmed. Thank you for dining with us!'
  } else if (props.orderData?.status) {
    title = props.orderData.status
  }

  return { currentNum, title, desc }
})

// Progress bar width (%)
const progressWidth = computed(() => {
  if (!props.duration) return '0%'
  return `${(timeLeft.value / props.duration) * 100}%`
})

const stopCountdown = () => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

const closeModal = () => {
  stopCountdown()
  isVisible.value = false
  emit('close')
}

const startCountdown = () => {
  stopCountdown()
  timeLeft.value = props.duration

  timer = setInterval(() => {
    if (timeLeft.value <= 1) {
      closeModal()
    } else {
      timeLeft.value -= 1
    }
  }, 1000)
}

const openModal = () => {
  isVisible.value = true
  startCountdown()
}

watch(
  () => props.isOpen,
  (newValue) => {
    if (newValue) {
      openModal()
    } else {
      stopCountdown()
      isVisible.value = false
    }
  },
  { immediate: true }
)

watch(
  () => props.orderData?.status,
  (newStatus, oldStatus) => {
    if (newStatus && newStatus !== oldStatus) {
      openModal()
    }
  }
)

onUnmounted(() => {
  stopCountdown()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="isVisible"
        class="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-6 bg-stone-900/60 backdrop-blur-sm"
        @click.self="closeModal"
      >
        <!-- กล่อง Modal ปรับขนาดเป็น max-w-md (448px) และ padding p-7 -->
        <div
          class="relative w-full max-w-md rounded-[32px] bg-white p-7 shadow-2xl overflow-hidden border border-stone-100 flex flex-col"
        >
          <!-- Top Countdown Progress Bar ขนาดหนาขึ้น (h-1.5) -->
          <div class="absolute top-0 left-0 right-0 h-1.5 bg-stone-100 overflow-hidden">
            <div
              class="h-full bg-emerald-500 transition-all duration-1000 ease-linear"
              :style="{ width: progressWidth }"
            ></div>
          </div>

          <!-- Close Icon (X) ขนาดใหญ่ขึ้นและกดง่าย -->
          <button
            @click="closeModal"
            class="absolute right-5 top-5 rounded-full p-2.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition active:scale-95"
            aria-label="Close modal"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <!-- Header Section (ขยายขนาดไอคอนและฟอนต์) -->
          <div class="flex items-center gap-4 mt-2">
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 flex-shrink-0 shadow-xs">
              <svg class="w-7 h-7 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div class="min-w-0 pr-8">
              <h3 class="text-xl font-black text-stone-900 leading-tight">
                Order Update
              </h3>
              <p class="text-sm font-semibold text-emerald-600 mt-1">
                Table {{ orderData?.table_number || '-' }} • Order #{{ orderData?.order_code || orderData?.orderId || '-' }}
              </p>
            </div>
          </div>

          <!-- 5-Step Timeline (ขยายขนาดวงกลมเป็น w-8 h-8) -->
          <div class="mt-6 flex items-center justify-between px-2 relative">
            <div class="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-1 bg-stone-100 z-0 rounded-full"></div>
            <div 
              class="absolute left-4 top-1/2 -translate-y-1/2 h-1 bg-emerald-500 z-0 transition-all duration-500 rounded-full"
              :style="{ width: `${((stepInfo.currentNum - 1) / 4) * 100}%` }"
            ></div>

            <div
              v-for="s in STEPS"
              :key="s.key"
              class="relative z-10 flex flex-col items-center"
            >
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all duration-300"
                :class="[
                  s.num < stepInfo.currentNum 
                    ? 'bg-emerald-500 text-white shadow-sm' 
                    : s.num === stepInfo.currentNum
                      ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 shadow-md scale-110'
                      : 'bg-stone-100 text-stone-400'
                ]"
              >
                <span v-if="s.num < stepInfo.currentNum">✓</span>
                <span v-else>{{ s.num }}</span>
              </div>
            </div>
          </div>

          <!-- Current Status Card (ขยายพื้นที่และการแสดงผล) -->
          <div class="mt-6 rounded-2xl bg-stone-50 p-5 border border-stone-200/70">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-stone-400 uppercase tracking-wider">Current Status</span>
              <span class="text-xs font-extrabold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
                Step {{ stepInfo.currentNum }} of 5
              </span>
            </div>

            <p class="text-lg sm:text-xl font-black text-stone-900 mt-2 flex items-center gap-2.5">
              <span class="relative flex h-3 w-3">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              {{ stepInfo.title }}
            </p>

            <!-- Description box ขนาดตัวอักษรใหญ่ขึ้นและอ่านง่าย -->
            <p
              v-if="stepInfo.desc"
              class="mt-3 text-sm text-stone-600 leading-relaxed bg-white p-3.5 rounded-xl border border-stone-200/80 shadow-xs"
            >
              {{ stepInfo.desc }}
            </p>
          </div>

          <!-- Footer: Countdown and Big Got It Button -->
          <div class="mt-6 flex items-center justify-between pt-1">
            <span class="text-sm font-medium text-stone-400 tabular-nums">
              Auto closes in <span class="font-bold text-stone-600">{{ timeLeft }}</span>s
            </span>
            <button
              @click="closeModal"
              class="rounded-2xl bg-stone-900 px-7 py-3 text-sm font-black text-white shadow-md hover:bg-stone-800 active:scale-95 transition"
            >
              Got it
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>