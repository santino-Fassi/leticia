'use strict';

/**
 * Formatea una duración en segundos al formato M:SS.
 * @param {number|null|undefined} seconds Duración en segundos.
 * @returns {string} Duración legible o cadena vacía si no está disponible.
 */
export function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Construye la lista intercalada de recuerdos para la vista "Todo"
 * de modo que los videos aparezcan distribuidos con ritmo editorial entre las fotos.
 * @param {Array<object>} images Lista de fotos normalizadas.
 * @param {Array<object>} videos Lista de videos normalizados.
 * @returns {Array<object>} Colección combinada.
 */
export function buildInterleavedGallery(images, videos) {
  if (!videos.length) return [...images];
  if (!images.length) return [...videos];

  const result = [];
  const step = Math.max(3, Math.floor(images.length / videos.length));
  let videoIndex = 0;

  for (let i = 0; i < images.length; i += 1) {
    result.push(images[i]);
    if ((i + 1) % step === 0 && videoIndex < videos.length) {
      result.push(videos[videoIndex]);
      videoIndex += 1;
    }
  }

  while (videoIndex < videos.length) {
    result.push(videos[videoIndex]);
    videoIndex += 1;
  }

  return result;
}

/**
 * Filtra los elementos de la galería por categoría.
 * @param {Array<object>} items Colección completa.
 * @param {'all'|'image'|'video'} filter Filtro activo.
 * @returns {Array<object>} Elementos filtrados.
 */
export function filterGalleryItems(items, filter) {
  if (filter === 'image') return items.filter((item) => item.type === 'image');
  if (filter === 'video') return items.filter((item) => item.type === 'video');
  return items;
}
