<script setup>
import { useAppState } from '../../services/appState'

defineProps({
  status: { type: String, required: true },
})

const { t } = useAppState()
</script>

<template>
  <span :class="[
    'inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize',
    {
      'bg-blue-50 text-blue-700': status === 'new',
      'bg-amber-50 text-amber-700': status === 'preparing',
      'bg-green-50 text-green-700': status === 'ready' || status === 'available',
      'bg-stone-100 text-stone-600': status === 'completed',
      'bg-red-50 text-red-700': status === 'cancelled' || status === 'sold_out',
    }
  ]">
    {{ t(status) }}
  </span>
</template>
