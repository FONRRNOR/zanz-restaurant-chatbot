<script setup>
import { useAppState } from '../../services/appState'

defineProps({
  tags: { type: Array, default: () => [] },
  tone: { type: String, default: 'green' },
})

const { t } = useAppState()
</script>

<template>
  <div class="flex content-start items-start flex-wrap gap-2">
    <span
      v-for="tag in tags"
      :key="tag"
      :class="[
        'rounded-full px-2.5 py-1 text-xs font-semibold',
        tone === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-softGreen text-brand'
      ]"
    >
      {{ tag.startsWith('Contains ') ? `${t('Contains')} ${t(tag.replace('Contains ', ''))}` : t(tag) }}
    </span>
  </div>
</template>
