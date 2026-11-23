'use strict';

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildInterleavedGallery, filterGalleryItems, formatDuration } from '../src/lib/gallery-utils.js';

const ROOT = process.cwd();
const manifest = JSON.parse(readFileSync(join(ROOT, 'src', 'lib', 'gallery-manifest.json'), 'utf8'));

test('gallery manifest incluye las 44 fotos y 7 videos con archivos optimizados', () => {
  assert.equal(manifest.images.length, 44);
  assert.equal(manifest.videos.length, 7);

  for (const img of manifest.images) {
    assert.ok(img.width > 0 && img.height > 0, `Dimensiones válidas para ${img.id}`);
    assert.ok(existsSync(join(ROOT, 'src', 'galeria', 'imagenes', img.file)), `Falta imagen ${img.file}`);
    assert.ok(existsSync(join(ROOT, 'src', 'galeria', 'thumbs', img.file)), `Falta miniatura ${img.file}`);
  }

  for (const vid of manifest.videos) {
    const hasLocal = existsSync(join(ROOT, 'src', 'galeria', 'videos', vid.file));
    const hasDrive = Boolean(vid.driveId);
    assert.ok(hasLocal || hasDrive, `El video ${vid.id} debe tener archivo local o fallback de Drive`);
  }
});

test('formatDuration formatea duraciones en M:SS', () => {
  assert.equal(formatDuration(52), '0:52');
  assert.equal(formatDuration(125), '2:05');
  assert.equal(formatDuration(null), '');
  assert.equal(formatDuration(0), '');
});

test('buildInterleavedGallery y filterGalleryItems mantienen todos los elementos y filtran correctamente', () => {
  const combined = buildInterleavedGallery(manifest.images, manifest.videos);
  assert.equal(combined.length, 51);
  assert.equal(filterGalleryItems(combined, 'all').length, 51);
  assert.equal(filterGalleryItems(combined, 'image').length, 44);
  assert.equal(filterGalleryItems(combined, 'video').length, 7);
});
