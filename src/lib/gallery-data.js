'use strict';

import manifest from './gallery-manifest.json';
import { buildInterleavedGallery, filterGalleryItems, formatDuration } from './gallery-utils.js';

/**
 * Carga estática de recursos optimizados en src/galeria mediante Vite.
 * Si se agregan nuevos videos optimizados en src/galeria/videos/ con el script
 * npm run optimize:gallery, se detectan automáticamente en la compilación.
 */
const fullImages = import.meta.glob('../galeria/imagenes/*.webp', { eager: true, import: 'default' });
const thumbImages = import.meta.glob('../galeria/thumbs/*.webp', { eager: true, import: 'default' });
const localVideos = import.meta.glob('../galeria/videos/*.mp4', { eager: true, import: 'default' });
const videoPosters = import.meta.glob('../galeria/posters/*.webp', { eager: true, import: 'default' });

const normalizedImages = manifest.images.map((item, index) => {
  const src = fullImages[`../galeria/imagenes/${item.file}`] || '';
  const thumb = thumbImages[`../galeria/thumbs/${item.file}`] || src;
  return {
    ...item,
    order: index + 1,
    src,
    thumb,
    title: `Recuerdo fotográfico ${index + 1}`,
  };
}).filter((item) => Boolean(item.src));

const normalizedVideos = manifest.videos.map((item, index) => {
  const localSrc = localVideos[`../galeria/videos/${item.file}`] || '';
  const poster = videoPosters[`../galeria/posters/${item.poster}`] || '';
  const drivePreviewUrl = item.driveId
    ? `https://drive.google.com/file/d/${item.driveId}/preview`
    : '';
  const driveViewUrl = item.driveId
    ? `https://drive.google.com/file/d/${item.driveId}/view`
    : '';

  return {
    ...item,
    order: index + 1,
    src: localSrc,
    isLocal: Boolean(localSrc),
    poster,
    drivePreviewUrl,
    driveViewUrl,
    durationLabel: formatDuration(item.duration),
  };
}).filter((item) => Boolean(item.src || item.drivePreviewUrl));

export { buildInterleavedGallery, filterGalleryItems, formatDuration };
export const galleryImages = normalizedImages;
export const galleryVideos = normalizedVideos;
export const galleryItems = buildInterleavedGallery(normalizedImages, normalizedVideos);
export const galleryCounts = {
  all: galleryItems.length,
  image: galleryImages.length,
  video: galleryVideos.length,
};
