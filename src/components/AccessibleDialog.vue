<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

defineProps({ titleId: { type: String, required: true } });
const emit = defineEmits(['close']);
const dialog = ref(null);
let returnFocus;
function close() { emit('close'); }
function backdrop(event) {
  if (event.target !== dialog.value) return;
  const bounds = dialog.value.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
}
onMounted(async () => {
  returnFocus = document.activeElement;
  dialog.value.showModal();
  await nextTick();
  (dialog.value.querySelector('[autofocus]') || dialog.value.querySelector('input, button'))?.focus();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  returnFocus?.focus();
});
</script>

<template>
  <dialog ref="dialog" class="wish-dialog" :aria-labelledby="titleId" @cancel.prevent="close" @click="backdrop">
    <slot />
  </dialog>
</template>
