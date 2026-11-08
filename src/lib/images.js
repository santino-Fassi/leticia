import { MAX_ORIGINAL_BYTES } from '../config.js';

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function jpegVariant(image, maxSide, maxBytes) {
  let scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#fdfbf7';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78 - attempt * 0.08));
      if (!blob) throw new Error('No pudimos preparar la foto. Probá con otra imagen.');
      if (blob.size <= maxBytes) return blob;
      scale *= 0.8;
    }
    throw new Error('Esta foto es demasiado grande. Probá con otra imagen.');
  } finally {
    canvas.width = canvas.height = 1;
  }
}

export async function preparePhoto(file) {
  if (!ACCEPTED.has(file.type)) throw new Error('Elegí una foto JPG, PNG o WebP.');
  if (file.size > MAX_ORIGINAL_BYTES) throw new Error('La foto puede pesar hasta 5 MB.');
  let image;
  try {
    image = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('No pudimos abrir esa foto. Probá con otra imagen JPG, PNG o WebP.');
  }
  try {
    if (image.width * image.height > 40000000) throw new Error('La foto tiene demasiada resolución. Elegí una versión más pequeña.');
    return {
      photo: await jpegVariant(image, 1280, 300 * 1024),
      thumbnail: await jpegVariant(image, 480, 50 * 1024),
    };
  } finally {
    image.close();
  }
}
