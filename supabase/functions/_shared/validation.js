import { HttpError } from './http.js';

export function validateFields(form) {
  const rules = { name: [2, 80, 'nombre'], city: [0, 80, 'ciudad'], country: [0, 80, 'país'], message: [10, 2000, 'mensaje'] };
  const result = {};
  for (const [field, [minimum, maximum, label]] of Object.entries(rules)) {
    const raw = form.get(field) ?? (minimum === 0 ? '' : null);
    if (typeof raw !== 'string') throw new HttpError(400, `Completá el campo ${label}.`);
    const value = raw.normalize('NFC').trim();
    const length = [...value].length;
    if (length < minimum || length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
      throw new HttpError(400, `El campo ${label} debe tener entre ${minimum} y ${maximum} caracteres válidos.`);
    }
    result[field] = value;
  }
  if (form.get('consent') !== 'true') throw new HttpError(400, 'Necesitamos tu permiso para publicar el recuerdo.');
  return result;
}

// Se reciben solo los JPEG normalizados por canvas, nunca SVG ni originales.
// Verificar bytes, estructura, dimensiones y fin del archivo, ademas del MIME.
export function jpegDimensions(bytes) {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8
      || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error('Invalid JPEG');
  let offset = 2;
  let size = null;
  while (offset < bytes.length - 2) {
    if (bytes[offset++] !== 0xff) throw new Error('Invalid JPEG marker');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda) {
      if (!size) throw new Error('Missing JPEG frame');
      return size;
    }
    if (offset + 2 > bytes.length) throw new Error('Truncated JPEG');
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new Error('Truncated JPEG');
    if (marker === 0xc0 || marker === 0xc2) {
      if (length < 8 || bytes[offset + 2] !== 8) throw new Error('Invalid JPEG frame');
      size = { height: bytes[offset + 3] * 256 + bytes[offset + 4], width: bytes[offset + 5] * 256 + bytes[offset + 6] };
    }
    offset += length;
  }
  throw new Error('Missing JPEG scan');
}

export async function validatePhoto(file, { maxBytes, maxSide }) {
  if (!file || typeof file === 'string' || file.type !== 'image/jpeg' || !file.size || file.size > maxBytes) {
    throw new HttpError(400, 'La foto no tiene un formato o un tamaño válido. Volvé a elegirla.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const { width, height } = jpegDimensions(bytes);
    if (!width || !height || width > maxSide || height > maxSide) throw new Error();
  } catch { throw new HttpError(400, 'No pudimos validar esa foto. Probá con otra imagen.'); }
  return bytes;
}
