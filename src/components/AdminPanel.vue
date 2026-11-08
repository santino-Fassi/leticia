<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { isConfigured } from '../config.js';
import { getWish, listAdminWishes, moderateWish, supabase } from '../lib/api.js';
import AccessibleDialog from './AccessibleDialog.vue';
import WishCard from './WishCard.vue';

const session = ref(null);
const email = ref('');
const password = ref('');
const status = ref('pending');
const page = ref(1);
const wishes = ref([]);
const hasMore = ref(false);
const loading = ref(false);
const starting = ref(true);
const error = ref('');
const notice = ref('');
const acting = ref(false);
const confirmation = ref(null);
const selectedPhoto = ref(null);
let subscription;
let requestVersion = 0;
let disposed = false;
async function openPhoto(wish) {
  selectedPhoto.value = { ...wish, photo_url: null, loading: true, error: '' };
  try {
    const fresh = await getWish(wish.id, { admin: true, status: wish.status });
    if (selectedPhoto.value?.id === wish.id) selectedPhoto.value = { ...fresh, loading: false, error: '' };
  } catch (cause) {
    if (selectedPhoto.value?.id === wish.id) selectedPhoto.value = { ...wish, photo_url: null, loading: false, error: cause.message };
  }
}

async function load(nextPage = 1) {
  const version = ++requestVersion;
  loading.value = true;
  error.value = '';
  try {
    const result = await listAdminWishes(nextPage, status.value);
    if (version !== requestVersion || disposed) return;
    if (!result.wishes.length && nextPage > 1) return load(nextPage - 1);
    wishes.value = result.wishes;
    hasMore.value = result.has_more;
    page.value = nextPage;
  } catch (cause) {
    if (version === requestVersion) { error.value = cause.message; wishes.value = []; }
  } finally { if (version === requestVersion) loading.value = false; }
}
async function login() {
  loading.value = true;
  error.value = '';
  try {
    const result = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
    if (result.error) throw new Error('No pudimos ingresar. Revisá tu correo y tu contraseña.');
    password.value = '';
    session.value = result.data.session;
    await load();
  } catch (cause) { error.value = cause.message; }
  finally { loading.value = false; }
}
async function logout() {
  error.value = '';
  const { error: cause } = await supabase.auth.signOut({ scope: 'local' });
  if (cause) { error.value = 'No pudimos cerrar la sesión. Volvé a intentar.'; return; }
  requestVersion++;
  session.value = null;
  wishes.value = [];
  notice.value = '';
}
async function review(wish, action) {
  acting.value = true;
  confirmation.value = null;
  error.value = '';
  notice.value = '';
  try {
    const result = await moderateWish(wish.id, action);
    notice.value = result.warning || (action === 'approve' ? 'El recuerdo ya está publicado en el muro.' : 'El recuerdo fue retirado y sus fotos se eliminaron.');
    await load(page.value);
  } catch (cause) { error.value = cause.message; }
  finally { acting.value = false; }
}
onMounted(async () => {
  if (!supabase) { starting.value = false; return; }
  const { data, error: cause } = await supabase.auth.getSession();
  if (disposed) return;
  if (cause) error.value = 'No pudimos recuperar tu sesión. Volvé a ingresar.';
  session.value = data.session;
  subscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
    session.value = nextSession;
    if (!nextSession) { requestVersion++; wishes.value = []; }
  }).data.subscription;
  starting.value = false;
  if (session.value) await load();
});
onUnmounted(() => { disposed = true; requestVersion++; subscription?.unsubscribe(); });
</script>

<template>
  <main class="admin-panel site-container">
    <a href="#inicio" class="admin-back">← Volver al homenaje</a>
    <div class="section-kicker mt-4">El equipo del homenaje</div>
    <h1 class="admin-title">Cuidamos cada recuerdo</h1>
    <p class="wall-intro">Revisá los mensajes antes de compartirlos con Lety y su comunidad.</p>
    <div v-if="!isConfigured" class="wall-empty"><h2>El acceso todavía no está disponible</h2><p>Estamos preparando el muro y su espacio de administración.</p></div>
    <p v-else-if="starting" role="status" class="text-center">Comprobando tu sesión…</p>
    <form v-else-if="!session" class="admin-login" @submit.prevent="login">
      <h2>Ingresar al equipo</h2>
      <p>Usá la cuenta que te asignaron para moderar los mensajes.</p>
      <p v-if="error" class="wall-notice" role="alert">{{ error }}</p>
      <div class="mb-3"><label for="admin-email" class="form-label">Correo electrónico</label><input id="admin-email" v-model="email" type="email" class="form-control" autocomplete="username" required :disabled="loading"></div>
      <div class="mb-4"><label for="admin-password" class="form-label">Contraseña</label><input id="admin-password" v-model="password" type="password" class="form-control" autocomplete="current-password" required :disabled="loading"></div>
      <button type="submit" class="button button-primary w-100" :disabled="loading">{{ loading ? 'Ingresando…' : 'Ingresar' }}</button>
    </form>
    <template v-else>
      <div class="admin-toolbar">
        <div><label for="admin-filter" class="form-label">Ver mensajes</label><select id="admin-filter" v-model="status" class="form-select" :disabled="acting" @change="load(1)"><option value="pending">Pendientes de revisión</option><option value="approved">Publicados</option><option value="rejected">Rechazados</option></select></div>
        <div class="d-flex flex-wrap gap-2"><button type="button" class="button button-secondary" :disabled="loading || acting" @click="load(page)">Actualizar</button><button type="button" class="button button-secondary" :disabled="acting" @click="logout">Cerrar sesión</button></div>
      </div>
      <p v-if="notice" role="status" class="wall-notice notice-success">{{ notice }}</p>
      <p v-if="error" role="alert" class="wall-notice">{{ error }}</p>
      <p v-if="loading" role="status" class="text-center py-4">Buscando recuerdos…</p>
      <p v-else-if="!wishes.length && !error" class="wall-empty">No hay mensajes en esta sección.</p>
      <div v-else-if="!loading" class="row g-4">
        <div v-for="wish in wishes" :key="wish.id" class="col-12 col-md-6 col-lg-4 admin-wish">
          <WishCard :wish="wish" @open-photo="openPhoto" @refresh-photo="load(page)" />
          <div class="admin-actions">
            <button v-if="wish.status === 'pending'" type="button" class="button button-primary" :disabled="acting" @click="review(wish, 'approve')">Publicar</button>
            <button v-if="wish.status !== 'rejected'" type="button" class="button button-secondary" :disabled="acting" @click="confirmation = wish">{{ wish.status === 'approved' ? 'Retirar del muro' : 'Rechazar' }}</button>
            <button v-else-if="wish.photo_url" type="button" class="button button-secondary" :disabled="acting" @click="review(wish, 'reject')">Reintentar borrar fotos</button>
          </div>
        </div>
      </div>
      <nav v-if="page > 1 || hasMore" class="wall-pagination" aria-label="Páginas de administración"><button type="button" class="button button-secondary" :disabled="loading || acting || page === 1" @click="load(page - 1)">← Anteriores</button><span>Página {{ page }}</span><button type="button" class="button button-secondary" :disabled="loading || acting || !hasMore" @click="load(page + 1)">Siguientes →</button></nav>
    </template>
    <AccessibleDialog v-if="confirmation" title-id="reject-title" @close="confirmation = null">
      <div class="dialog-heading"><h2 id="reject-title">¿Retirar este recuerdo?</h2><button type="button" class="dialog-close" aria-label="Cancelar" @click="confirmation = null">×</button></div>
      <p>El mensaje de {{ confirmation.name }} quedará en la sección de rechazados. Sus fotos se eliminarán y el recuerdo no se mostrará en el muro.</p>
      <div class="d-flex flex-wrap gap-2"><button type="button" class="button button-secondary" @click="confirmation = null">Conservar</button><button type="button" class="button button-primary" @click="review(confirmation, 'reject')">Retirar recuerdo</button></div>
    </AccessibleDialog>
    <AccessibleDialog v-if="selectedPhoto" title-id="admin-photo-title" @close="selectedPhoto = null">
      <div class="dialog-heading"><h2 id="admin-photo-title">Foto de {{ selectedPhoto.name }}</h2><button type="button" class="dialog-close" aria-label="Cerrar foto" @click="selectedPhoto = null">×</button></div>
      <p v-if="selectedPhoto.loading" role="status">Buscando el recuerdo…</p>
      <p v-else-if="selectedPhoto.error" role="alert">{{ selectedPhoto.error }}</p>
      <img v-else class="expanded-photo" :src="selectedPhoto.photo_url" :alt="`Recuerdo compartido por ${selectedPhoto.name}`" @error="selectedPhoto.error = 'No pudimos abrir esta foto. Volvé a intentar más tarde.'">
    </AccessibleDialog>
  </main>
</template>
