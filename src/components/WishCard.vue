<script setup>
import { ref, watch } from 'vue';
const props = defineProps({ wish: { type: Object, required: true } });
const emit = defineEmits(['open-photo', 'refresh-photo']);
const photoFailed = ref(false);
watch(() => props.wish.thumbnail_url, () => { photoFailed.value = false; });
const formatDate = (value) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(new Date(value));
</script>

<template>
  <article class="wish-card h-100">
    <button v-if="wish.thumbnail_url && !photoFailed" type="button" class="wish-photo-button" :aria-label="`Ampliar la foto de ${wish.name}`" @click="emit('open-photo', wish)">
      <img :src="wish.thumbnail_url" :alt="`Recuerdo compartido por ${wish.name}`" width="480" height="360" loading="lazy" decoding="async" @error="photoFailed = true">
      <span class="photo-hint" aria-hidden="true">Ver foto ↗</span>
    </button>
    <button v-else-if="wish.thumbnail_url" type="button" class="btn btn-link p-3" @click="emit('refresh-photo')">Volver a cargar la foto</button>
    <div class="wish-card-copy">
      <span class="wish-flower" aria-hidden="true">❀</span>
      <p class="wish-message">{{ wish.message }}</p>
      <footer class="wish-signature">
        <strong>{{ wish.name }}</strong>
        <span>{{ [wish.city, wish.country].filter(Boolean).join(', ') }}</span>
        <time :datetime="wish.created_at">{{ formatDate(wish.created_at) }}</time>
      </footer>
    </div>
  </article>
</template>
