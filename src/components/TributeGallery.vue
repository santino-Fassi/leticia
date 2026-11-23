<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { filterGalleryItems, galleryCounts, galleryItems } from '../lib/gallery-data.js';
import AccessibleDialog from './AccessibleDialog.vue';

const BATCH_SIZE = 12;

const activeFilter = ref('all');
const visibleCount = ref(BATCH_SIZE);
const selectedIndex = ref(null);
const activeVideoEl = ref(null);

let touchStartX = 0;

const filterOptions = [
  { id: 'all', label: 'Todo', count: galleryCounts.all },
  { id: 'image', label: 'Fotos', count: galleryCounts.image },
  { id: 'video', label: 'Videos', count: galleryCounts.video },
];

const filteredItems = computed(() => filterGalleryItems(galleryItems, activeFilter.value));

const visibleItems = computed(() => {
  if (activeFilter.value === 'video') return filteredItems.value;
  return filteredItems.value.slice(0, visibleCount.value);
});

const hasMore = computed(() => visibleItems.value.length < filteredItems.value.length);

const selectedItem = computed(() => {
  if (selectedIndex.value === null) return null;
  return filteredItems.value[selectedIndex.value] || null;
});

const statusLabel = computed(() => {
  const shown = visibleItems.value.length;
  const total = filteredItems.value.length;
  if (activeFilter.value === 'image') return `Mostrando ${shown} de ${total} fotos`;
  if (activeFilter.value === 'video') return `Mostrando ${shown} de ${total} videos`;
  return `Mostrando ${shown} de ${total} recuerdos (${galleryCounts.image} fotos y ${galleryCounts.video} videos)`;
});

function setFilter(filterId) {
  if (activeFilter.value === filterId) return;
  activeFilter.value = filterId;
  visibleCount.value = BATCH_SIZE;
  selectedIndex.value = null;
}

function showMore() {
  visibleCount.value = Math.min(visibleCount.value + BATCH_SIZE, filteredItems.value.length);
}

function showAll() {
  visibleCount.value = filteredItems.value.length;
}

function openLightbox(index) {
  selectedIndex.value = index;
}

function closeLightbox() {
  pauseActiveVideo();
  selectedIndex.value = null;
}

function pauseActiveVideo() {
  if (activeVideoEl.value && typeof activeVideoEl.value.pause === 'function') {
    activeVideoEl.value.pause();
  }
}

function stepLightbox(delta) {
  if (selectedIndex.value === null || !filteredItems.value.length) return;
  pauseActiveVideo();
  const total = filteredItems.value.length;
  selectedIndex.value = (selectedIndex.value + delta + total) % total;
}

function onKeydown(event) {
  if (selectedIndex.value === null) return;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    stepLightbox(-1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    stepLightbox(1);
  }
}

function onTouchStart(event) {
  if (!event.changedTouches?.length) return;
  touchStartX = event.changedTouches[0].clientX;
}

function onTouchEnd(event) {
  if (!event.changedTouches?.length || selectedIndex.value === null) return;
  const deltaX = event.changedTouches[0].clientX - touchStartX;
  if (Math.abs(deltaX) > 48) {
    stepLightbox(deltaX < 0 ? 1 : -1);
  }
}

function aspectRatioStyle(item) {
  if (item.width && item.height) {
    return { aspectRatio: `${item.width} / ${item.height}` };
  }
  return { aspectRatio: '4 / 3' };
}

watch(selectedIndex, () => {
  pauseActiveVideo();
});

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <section id="galeria" class="gallery-section" aria-labelledby="gallery-title">
    <div class="site-container">
      <div class="section-kicker">Recuerdos en imágenes y movimiento</div>
      <h2 id="gallery-title">Galería de 30 años</h2>
      <p class="gallery-intro">
        Postales, talleres, encuentros y momentos compartidos que cuentan tres décadas de arte, enseñanza y cariño.
      </p>

      <div class="gallery-toolbar">
        <div class="gallery-filters" role="tablist" aria-label="Filtrar recuerdos de la galería">
          <button
            v-for="option in filterOptions"
            :key="option.id"
            type="button"
            role="tab"
            class="gallery-filter-btn"
            :class="{ 'is-active': activeFilter === option.id }"
            :aria-selected="activeFilter === option.id"
            @click="setFilter(option.id)"
          >
            <span>{{ option.label }}</span>
            <span class="gallery-filter-count">{{ option.count }}</span>
          </button>
        </div>
        <p class="gallery-status" aria-live="polite">{{ statusLabel }}</p>
      </div>

      <div class="gallery-masonry">
        <article
          v-for="(item, idx) in visibleItems"
          :key="item.id"
          class="gallery-item"
        >
          <button
            type="button"
            class="gallery-card"
            :aria-label="item.type === 'video' ? `Reproducir ${item.title}` : `Ampliar ${item.title}`"
            @click="openLightbox(idx)"
          >
            <div
              class="gallery-media-frame"
              :style="item.type === 'image' || item.poster ? aspectRatioStyle(item) : undefined"
            >
              <template v-if="item.type === 'image'">
                <img
                  :src="item.thumb"
                  :alt="item.alt"
                  :width="item.width"
                  :height="item.height"
                  loading="lazy"
                  decoding="async"
                >
                <span class="gallery-card-hover-hint" aria-hidden="true">Ampliar</span>
              </template>

              <template v-else>
                <img
                  v-if="item.poster"
                  :src="item.poster"
                  :alt="item.alt"
                  :width="item.width"
                  :height="item.height"
                  loading="lazy"
                  decoding="async"
                >
                <div v-else class="gallery-video-placeholder">
                  <span class="gallery-video-placeholder-kicker">Archivo audiovisual</span>
                  <span class="gallery-video-placeholder-title">{{ item.title }}</span>
                </div>

                <div class="gallery-badge-row" aria-hidden="true">
                  <span class="gallery-pill">Video</span>
                  <span v-if="item.durationLabel" class="gallery-pill gallery-pill-duration">
                    {{ item.durationLabel }}
                  </span>
                </div>

                <div class="gallery-video-overlay" aria-hidden="true">
                  <span class="gallery-play-badge">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l11.02-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z" />
                    </svg>
                  </span>
                </div>
              </template>
            </div>
          </button>
        </article>
      </div>

      <div v-if="hasMore" class="gallery-actions">
        <button type="button" class="button button-primary" @click="showMore">
          Ver más recuerdos
        </button>
        <button type="button" class="button button-secondary" @click="showAll">
          Ver todos ({{ filteredItems.length }})
        </button>
      </div>
    </div>

    <AccessibleDialog
      v-if="selectedItem"
      title-id="gallery-lightbox-title"
      class="gallery-dialog"
      @close="closeLightbox"
    >
      <div class="dialog-heading">
        <h3 id="gallery-lightbox-title">{{ selectedItem.title }}</h3>
        <button
          type="button"
          class="dialog-close"
          aria-label="Cerrar visor de galería"
          @click="closeLightbox"
        >
          ×
        </button>
      </div>

      <div
        class="gallery-lightbox-stage"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
      >
        <img
          v-if="selectedItem.type === 'image'"
          class="gallery-lightbox-image"
          :src="selectedItem.src"
          :alt="selectedItem.alt"
        >

        <video
          v-else-if="selectedItem.isLocal"
          ref="activeVideoEl"
          :key="selectedItem.id"
          class="gallery-lightbox-video"
          :src="selectedItem.src"
          :poster="selectedItem.poster || undefined"
          controls
          playsinline
          preload="metadata"
        >
          Tu navegador no soporta la reproducción de video HTML5.
        </video>

        <div v-else class="gallery-lightbox-iframe-wrap">
          <iframe
            :key="selectedItem.id"
            class="gallery-lightbox-iframe"
            :src="selectedItem.drivePreviewUrl"
            :title="selectedItem.title"
            allow="autoplay; fullscreen"
            allowfullscreen
          />
        </div>
      </div>

      <div class="gallery-lightbox-nav">
        <div>
          <p class="gallery-lightbox-counter">
            {{ selectedIndex + 1 }} de {{ filteredItems.length }}
            <span v-if="selectedItem.durationLabel"> · {{ selectedItem.durationLabel }}</span>
          </p>
          <a
            v-if="selectedItem.type === 'video' && !selectedItem.isLocal && selectedItem.driveViewUrl"
            class="gallery-external-link"
            :href="selectedItem.driveViewUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir video en una pestaña nueva ↗
          </a>
        </div>

        <div class="gallery-lightbox-controls">
          <button
            type="button"
            class="button button-secondary"
            aria-label="Ver recuerdo anterior"
            @click="stepLightbox(-1)"
          >
            ← Anterior
          </button>
          <button
            type="button"
            class="button button-secondary"
            aria-label="Ver recuerdo siguiente"
            @click="stepLightbox(1)"
          >
            Siguiente →
          </button>
        </div>
      </div>
    </AccessibleDialog>
  </section>
</template>
