<script setup>
import { Bot, Send } from '@lucide/vue'
import { ref } from 'vue'
import { useAppState } from '../../services/appState';

const { recommend, addToCart, localizeMenuItem, t } = useAppState()
const input = ref('')
const messages = ref([
  { role: 'bot', text: "Hello! I'm Chef AI. I can help you find dishes by taste, ingredients, or dietary preference." },
])

function reply(text) {
  const matches = recommend(text).map(localizeMenuItem)
  if (text.toLowerCase().includes('status')) {
    messages.value.push({ role: 'bot', text: 'You can enter your order number on the Check Order Status page to see the latest status.' })
    return
  }
  if (matches.length) {
    messages.value.push({
      role: 'bot',
      text: `I found ${matches.length} option${matches.length > 1 ? 's' : ''}: ${matches.map((item) => item.displayName).join(', ')}. These match your menu data and are currently available.`,
      items: matches,
    })
  } else {
    messages.value.push({ role: 'bot', text: "I couldn't find a confident match in the menu data. Please ask staff if this is important for allergies." })
  }
}

function send(text = input.value) {
  if (!text.trim()) return
  messages.value.push({ role: 'user', text })
  input.value = ''
  reply(text)
}
</script>

<template>
  <aside class="flex min-h-[520px] flex-col rounded-3xl bg-white p-5 shadow-soft relative">
    <div class="mb-4 flex items-center justify-between border-b border-stone-100 pb-4">
      <div class="flex items-center gap-3">
        <div class="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-white">
          <Bot :size="24" />
        </div>
        <h2 class="font-bold text-brand">{{ t('Chef AI') }}</h2>
      </div>

      <!-- ปุ่มปิด (X) ขนาดใหญ่ขึ้น กดง่ายขึ้น -->
      <button 
        class="w-18 h-18 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 hover:bg-stone-200 active:scale-95 transition-all text-lg font-bold"
        aria-label="Close"
      >
        ✕
      </button>
    </div>

    <div class="flex-1 space-y-4 overflow-auto pr-1">
      <div
        v-for="(message, index) in messages"
        :key="index"
        :class="message.role === 'user' ? 'ml-auto bg-brand text-white' : 'bg-assistant text-stone-800'"
        class="max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
      >
        <p>{{ t(message.text) }}</p>
        <div v-if="message.items" class="mt-3 space-y-2">
          <button
            v-for="item in message.items"
            :key="item.id"
            class="flex w-full items-center justify-between rounded-xl bg-white/80 p-2 text-left text-stone-900"
            @click="addToCart(item.id)"
          >
            <span>
              <strong class="block">{{ item.displayName }}</strong>
              <small>{{ item.price }} {{ t('Baht') }}</small>
            </span>
            <span class="rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">{{ t('Add') }}</span>
          </button>
        </div>
      </div>
    </div>

    <div class="mt-4 grid gap-2">
      <button class="quick-btn" @click="send('Recommend a vegetarian dish')">{{ t('Recommend a dish') }}</button>
      <button class="quick-btn" @click="send('Check ingredients for Arrabbiata')">{{ t('Check ingredients') }}</button>
      <button class="quick-btn" @click="send('Show vegetarian options')">{{ t('Vegetarian options') }}</button>
      <button class="quick-btn" @click="send('Check order status')">{{ t('Check order status') }}</button>
    </div>

    <form class="mt-4 flex items-center gap-2 rounded-2xl bg-pale px-4 py-3" @submit.prevent="send()">
      <input v-model="input" class="min-w-0 flex-1 bg-transparent text-sm outline-none" :placeholder="t('Ask Chef AI...')" />
      <button class="text-brand" aria-label="Send">
        <Send :size="22" />
      </button>
    </form>
  </aside>
</template>