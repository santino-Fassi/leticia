<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getChallenge, submitWish } from '../lib/api.js';
import { preparePhoto } from '../lib/images.js';
import AccessibleDialog from './AccessibleDialog.vue';

const emit = defineEmits(['close']);
const form = ref({ name: '', city: '', country: '', message: '', consent: false, website: '', answer: '' });
const challenge = ref(null);
const challengeLoading = ref(false);
const error = ref('');
const photoError = ref('');
const busy = ref(false);
const preparing = ref(false);
const success = ref(false);
const photo = ref(null);
const preview = ref('');
const selectionVersion = ref(0);
const errorBox = ref(null);
const canSubmit = computed(() => !busy.value && !preparing.value && !photoError.value && !!challenge.value);

async function refreshChallenge() {
  challenge.value = null;
  challengeLoading.value = true;
  form.value.answer = '';
  try { challenge.value = await getChallenge(); }
  catch (cause) { error.value = cause.message; }
  finally { challengeLoading.value = false; }
}
async function selectPhoto(event) {
  const version = ++selectionVersion.value;
  photoError.value = '';
  photo.value = null;
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = '';
  const file = event.target.files?.[0];
  if (!file) return;
  preparing.value = true;
  try {
    const prepared = await preparePhoto(file);
    if (version !== selectionVersion.value) return;
    photo.value = prepared;
    preview.value = URL.createObjectURL(prepared.photo);
  } catch (cause) {
    if (version === selectionVersion.value) { photoError.value = cause.message; event.target.value = ''; }
  } finally { if (version === selectionVersion.value) preparing.value = false; }
}
function removePhoto() {
  selectionVersion.value++;
  photo.value = null;
  preparing.value = false;
  photoError.value = '';
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = '';
  document.getElementById('wish-photo').value = '';
}
async function send() {
  if (!canSubmit.value) return;
  busy.value = true;
  error.value = '';
  const body = new FormData();
  for (const field of ['name', 'city', 'country', 'message', 'website', 'answer']) body.set(field, form.value[field].trim());
  body.set('consent', String(form.value.consent));
  body.set('challenge', challenge.value.token);
  if (photo.value) {
    body.set('photo', photo.value.photo, 'photo.jpg');
    body.set('thumbnail', photo.value.thumbnail, 'thumbnail.jpg');
  }
  try { await submitWish(body); success.value = true; }
  catch (cause) { error.value = cause.message; await refreshChallenge(); errorBox.value?.focus(); }
  finally { busy.value = false; }
}
function close() { if (!busy.value) emit('close'); }
onMounted(refreshChallenge);
onUnmounted(() => { selectionVersion.value++; if (preview.value) URL.revokeObjectURL(preview.value); });
</script>

<template>
  <AccessibleDialog title-id="wish-form-title" @close="close">
    <div class="dialog-heading"><h3 id="wish-form-title">Un mensaje con amor</h3><button type="button" class="dialog-close" aria-label="Cerrar formulario" :disabled="busy" @click="close">×</button></div>
    <div v-if="success" class="wish-success" role="status">
      <span class="wish-flower" aria-hidden="true">❀</span><h4>¡Tu abrazo ya llegó!</h4>
      <p>Gracias por compartir este recuerdo. El equipo lo revisará y, una vez aprobado, aparecerá en el muro de Lety.</p>
      <button type="button" class="button button-primary" @click="close">Volver al homenaje</button>
    </div>
    <form v-else class="wish-form" @submit.prevent="send">
      <p>Contanos qué significa Lety para vos. No necesitás crear una cuenta.</p>
      <div v-if="error" ref="errorBox" class="wall-notice" role="alert" tabindex="-1">{{ error }}</div>
      <fieldset :disabled="busy" class="border-0 p-0 m-0">
        <div class="mb-3"><label for="wish-name" class="form-label">Tu nombre <span aria-hidden="true">*</span></label><input id="wish-name" v-model="form.name" class="form-control" name="name" autocomplete="name" required minlength="2" maxlength="80" autofocus></div>
        <div class="row g-3 mb-3">
          <div class="col-sm-6"><label for="wish-city" class="form-label">Ciudad <span class="text-muted">(opcional)</span></label><input id="wish-city" v-model="form.city" class="form-control" autocomplete="address-level2" maxlength="80"></div>
          <div class="col-sm-6"><label for="wish-country" class="form-label">País <span class="text-muted">(opcional)</span></label><input id="wish-country" v-model="form.country" class="form-control" autocomplete="country-name" maxlength="80"></div>
        </div>
        <div class="mb-3"><label for="wish-message" class="form-label">Tu mensaje para Lety <span aria-hidden="true">*</span></label><textarea id="wish-message" v-model="form.message" class="form-control" rows="5" required minlength="10" maxlength="2000" aria-describedby="message-help"></textarea><div id="message-help" class="form-text">De 10 a 2000 caracteres. {{ form.message.length }}/2000</div></div>
        <div class="mb-3"><label for="wish-photo" class="form-label">Una foto de recuerdo <span class="text-muted">(opcional)</span></label><input id="wish-photo" type="file" class="form-control" accept="image/jpeg,image/png,image/webp" aria-describedby="photo-help photo-error" :disabled="preparing" @change="selectPhoto"><div id="photo-help" class="form-text">JPG, PNG o WebP, hasta 5 MB. Puede ser una creación tuya o una foto con Lety.</div><p v-if="preparing" role="status" class="form-text">Preparando tu foto…</p><p v-if="photoError" id="photo-error" class="text-danger" role="alert">{{ photoError }} <button type="button" class="btn btn-link" @click="removePhoto">Continuar sin foto</button></p><div v-if="preview" class="photo-preview"><img :src="preview" alt="Vista previa de tu foto"><button type="button" class="btn btn-sm btn-outline-secondary" @click="removePhoto">Quitar foto</button></div></div>
        <div class="honeypot" aria-hidden="true"><label for="wish-website">Dejá este campo vacío</label><input id="wish-website" v-model="form.website" name="website" tabindex="-1" autocomplete="off"></div>
        <div class="mb-3">
          <label for="wish-answer" class="form-label">Una cuenta sencilla para cuidar el muro <span aria-hidden="true">*</span></label>
          <template v-if="challenge"><p id="challenge-help">¿Cuánto es {{ challenge.left }} + {{ challenge.right }}?</p><input id="wish-answer" v-model="form.answer" class="form-control challenge-answer" type="text" inputmode="numeric" pattern="[0-9]{1,2}" maxlength="2" required aria-describedby="challenge-help"></template>
          <p v-else-if="challengeLoading" role="status">Preparando la pregunta…</p><button v-else type="button" class="btn btn-outline-secondary" @click="refreshChallenge">Volver a cargar la pregunta</button>
        </div>
        <div class="form-check mb-4"><input id="wish-consent" v-model="form.consent" type="checkbox" class="form-check-input" required><label for="wish-consent" class="form-check-label">Acepto que mi nombre, ubicación, mensaje y foto se publiquen en este homenaje después de su revisión. Si comparto una foto, tengo permiso de las personas que aparecen.</label></div>
        <button type="submit" class="button button-primary w-100" :disabled="!canSubmit"><span v-if="busy" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>{{ busy ? 'Enviando tu abrazo…' : 'Enviar mi mensaje' }}</button>
      </fieldset>
      <p class="form-text mt-3 mb-0">Los campos con * son obligatorios. Tu mensaje aparecerá cuando el equipo lo apruebe.</p>
    </form>
  </AccessibleDialog>
</template>
