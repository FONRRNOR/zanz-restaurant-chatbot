<script setup>
defineProps({
  modelValue: { type: Number, required: true },
});

const emit = defineEmits(["update:modelValue"]);
</script>

<template>
  <div
    class="inline-flex items-center rounded-full bg-pale px-2 py-1 text-brand"
  >
    <button
      class="grid h-7 w-7 place-items-center text-lg font-bold"
      @click="emit('update:modelValue', Math.max(0, modelValue - 1))"
    >
      -
    </button>
    <span class="w-8 text-center font-semibold">{{ modelValue }}</span>
    <button
      class="grid h-7 w-7 place-items-center text-lg font-bold"
      @click="emit('update:modelValue', modelValue + 1)"
    >
      +
    </button>
  </div>
</template>
