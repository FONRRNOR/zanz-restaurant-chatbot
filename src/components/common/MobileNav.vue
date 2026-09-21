<script setup>
import { ClipboardList, Home, MenuSquare, Monitor, Soup, Utensils, Wine, Users, LayoutDashboard } from '@lucide/vue'
import { useAppState } from '../../services/appState'

defineProps({
  items: { type: Array, required: true },
})

const iconMap = {
  Starters: Utensils,
  'Main Courses': Soup,
  Drinks: Wine,
  'Check Order Status': ClipboardList,
  'Live Orders': Monitor,
  'Menu Items': MenuSquare,
  Dashboard: LayoutDashboard,
  'Menu Management': MenuSquare,
  Orders: ClipboardList,
  'Staff Accounts': Users,
  Home,
}

const { t } = useAppState()
</script>

<template>
  <nav class="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 rounded-3xl bg-white p-2 shadow-strong lg:hidden">
    <RouterLink
      v-for="item in items.slice(0, 4)"
      :key="item.label"
      :to="item.to"
      class="flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold text-muted"
      active-class="bg-softGreen text-brand"
    >
      <component :is="iconMap[item.label] || Home" :size="18" />
      <span class="truncate">{{ t(item.short || item.label) }}</span>
    </RouterLink>
  </nav>
</template>
