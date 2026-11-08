<script setup>
import { onMounted, ref } from 'vue';
import { isConfigured } from '../config.js';
import { getWish, listWishes } from '../lib/api.js';
import AccessibleDialog from './AccessibleDialog.vue';
import WishCard from './WishCard.vue';
import WishForm from './WishForm.vue';

const wishes = ref([]);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(false);
const error = ref('');
const showForm = ref(false);
const selectedPhoto = ref(null);
const resultsTitle = ref(null);
async function openPhoto(wish) {
  selectedPhoto.value = { ...wish, photo_url: null, loading: true, error: '' };
  try {
    const fresh = await getWish(wish.id);
    if (selectedPhoto.value?.id === wish.id) selectedPhoto.value = { ...fresh, loading: false, error: '' };
  } catch (cause) {
    if (selectedPhoto.value?.id === wish.id) selectedPhoto.value = { ...wish, photo_url: null, loading: false, error: cause.message };
  }
}
async function loadPage(nextPage = 1, moveFocus = false) {
  loading.value = true;
  error.value = '';
  try {
    const result = await listWishes(nextPage);
    wishes.value = result.wishes;
    hasMore.value = result.has_more;
    page.value = nextPage;
    if (moveFocus) resultsTitle.value?.focus();
  } catch (cause) {
    error.value = cause.message;
  } finally {
    loading.value = false;
  }
}
onMounted(() => { if (isConfigured) loadPage(); });
</script>

<template>
  <section id="muro" class="wall-section" aria-labelledby="wall-title">
    <div class="site-container">
      <div class="section-kicker">Un recuerdo que hacemos juntas</div>
      <h2 id="wall-title">El Muro de los Deseos</h2>
      <p class="wall-intro">Un cofre de recuerdos, abrazos y palabras lindas para Lety. Cada mensaje es una forma de decirle: gracias por estos treinta años.</p>
      <div class="wall-instructions">
        <h3>¿Cómo dejar tu mensaje de cariño?</h3>
        <ol>
          <li><span>1</span><div><strong>Tocá «Dejar mi mensaje»</strong><p>Escribí tu nombre y desde dónde la seguís.</p></div></li>
          <li><span>2</span><div><strong>Compartí tu recuerdo</strong><p>Una anécdota, un agradecimiento o unas palabras de cariño. Si querés, sumá una foto.</p></div></li>
          <li><span>3</span><div><strong>Enviá tu abrazo</strong><p>El equipo lo revisará antes de publicarlo. No necesitás registrarte.</p></div></li>
        </ol>
        <button type="button" class="button button-primary wall-add" :disabled="!isConfigured" @click="showForm = true"><span aria-hidden="true">＋</span> Dejar mi mensaje</button>
      </div>

      <div v-if="!isConfigured" class="wall-empty" role="status">
        <span class="wish-flower" aria-hidden="true">❀</span>
        <h3>Estamos preparando este rincón de cariño</h3>
        <p>Muy pronto vas a poder dejar tu recuerdo para Lety. ¡Gracias por acompañarnos!</p>
      </div>
      <template v-else>
        <h3 ref="resultsTitle" class="wall-results-title" tabindex="-1">Abrazos para Lety</h3>
        <div v-if="error" class="wall-notice" role="alert"><p>{{ error }}</p><button type="button" class="btn btn-outline-secondary" @click="loadPage(page)">Volver a intentar</button></div>
        <p v-if="loading" role="status" class="text-center py-4"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span> Buscando recuerdos…</p>
        <div v-if="!loading && !error && !wishes.length" class="wall-empty"><span class="wish-flower" aria-hidden="true">❀</span><h3>El primer abrazo puede ser el tuyo</h3><p>Los mensajes aparecerán aquí después de que el equipo los revise.</p></div>
        <div v-if="!loading && !error" class="row g-4" aria-live="polite" :aria-busy="loading">
          <div v-for="wish in wishes" :key="wish.id" class="col-12 col-md-6 col-lg-4"><WishCard :wish="wish" @open-photo="openPhoto" @refresh-photo="loadPage(page)" /></div>
        </div>
        <nav v-if="page > 1 || hasMore" class="wall-pagination" aria-label="Páginas del muro">
          <button type="button" class="button button-secondary" :disabled="loading || page === 1" @click="loadPage(page - 1, true)">← Anteriores</button>
          <span aria-current="page">Página {{ page }}</span>
          <button type="button" class="button button-secondary" :disabled="loading || !hasMore" @click="loadPage(page + 1, true)">Siguientes →</button>
        </nav>
      </template>
      <p class="wall-moderation-note">Cada recuerdo se publica con mucho cuidado. Las fotos y los mensajes pasan primero por el equipo del homenaje.</p>
    </div>
    <WishForm v-if="showForm" @close="showForm = false" />
    <AccessibleDialog v-if="selectedPhoto" title-id="photo-title" @close="selectedPhoto = null">
      <div class="dialog-heading"><h3 id="photo-title">Un recuerdo de {{ selectedPhoto.name }}</h3><button type="button" class="dialog-close" aria-label="Cerrar foto" @click="selectedPhoto = null">×</button></div>
      <p v-if="selectedPhoto.loading" role="status">Buscando tu recuerdo…</p>
      <p v-else-if="selectedPhoto.error" role="alert">{{ selectedPhoto.error }}</p>
      <img v-else class="expanded-photo" :src="selectedPhoto.photo_url" :alt="`Recuerdo compartido por ${selectedPhoto.name}`" @error="selectedPhoto.error = 'No pudimos abrir esta foto. Volvé a intentar más tarde.'">
      <p class="mt-3">{{ selectedPhoto.message }}</p>
    </AccessibleDialog>
  </section>
</template>
