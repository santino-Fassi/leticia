import { readFile } from 'node:fs/promises';
import path from 'node:path';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const idPattern = new RegExp('^' + UUID + '$', 'i');
const filePattern = new RegExp('^' + UUID + '/(photo|thumbnail)\\.jpg$', 'i');

export async function readBackup(directory) {
  const root = path.resolve(directory);
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.bucket !== 'wish-photos' || !Array.isArray(manifest.wishes) || !Array.isArray(manifest.files)) throw new Error('El manifiesto de la copia no es válido.');
  const files = new Set(manifest.files);
  if (files.size !== manifest.files.length || [...files].some((file) => typeof file !== 'string' || !filePattern.test(file))) throw new Error('La copia contiene rutas inválidas o repetidas.');
  const ids = new Set();
  const wishes = manifest.wishes.map((row) => {
    if (!idPattern.test(row.id) || ids.has(row.id) || !['pending', 'approved', 'rejected'].includes(row.status)) throw new Error('La copia contiene mensajes inválidos o repetidos.');
    ids.add(row.id);
    for (const [field, minimum, maximum] of [['name', 2, 80], ['city', 0, 80], ['country', 0, 80], ['message', 10, 2000]]) {
      if (typeof row[field] !== 'string' || [...row[field].trim()].length < minimum || [...row[field]].length > maximum) throw new Error('La copia contiene textos inválidos.');
    }
    if (row.photo_path !== null || row.thumbnail_path !== null) {
      if (row.photo_path !== row.id + '/photo.jpg' || row.thumbnail_path !== row.id + '/thumbnail.jpg' || !files.has(row.photo_path) || !files.has(row.thumbnail_path)) throw new Error('Faltan las fotos de un mensaje.');
    }
    for (const field of ['created_at', 'consented_at']) if (!row[field] || !Number.isFinite(Date.parse(row[field]))) throw new Error('La copia contiene fechas inválidas.');
    if (row.moderated_at && !Number.isFinite(Date.parse(row.moderated_at))) throw new Error('La copia contiene fechas inválidas.');
    return {
      id: row.id, name: row.name, city: row.city, country: row.country, message: row.message,
      status: row.status, photo_path: row.photo_path, thumbnail_path: row.thumbnail_path,
      created_at: row.created_at, consented_at: row.consented_at,
      moderated_at: row.moderated_at || null,
      // Los UUID de Auth pertenecen al proyecto anterior; se recrean aparte.
      moderated_by: null,
    };
  });
  const photos = [];
  for (const file of files) {
    const bytes = await readFile(path.join(root, 'photos', file));
    if (bytes.length > (file.endsWith('/thumbnail.jpg') ? 50 : 300) * 1024) throw new Error('Una foto de la copia supera el tamaño permitido.');
    photos.push({ path: file, bytes });
  }
  return { wishes, photos };
}

export async function restoreBackup(client, backup) {
  const existing = await client.from('wishes').select('id').limit(1);
  if (existing.error) throw existing.error;
  const stored = await client.storage.from('wish-photos').list('', { limit: 1 });
  if (stored.error) throw stored.error;
  if (existing.data.length || stored.data.length) throw new Error('La restauración exige una tabla y un bucket vacíos. No se sobrescribieron datos.');
  const uploaded = [];
  try {
    for (const file of backup.photos) {
      const result = await client.storage.from('wish-photos').upload(file.path, file.bytes, { contentType: 'image/jpeg', upsert: false, cacheControl: '600' });
      if (result.error) throw result.error;
      uploaded.push(file.path);
    }
    // Una unica insercion: PostgreSQL acepta todos los mensajes o ninguno.
    if (backup.wishes.length) {
      const result = await client.from('wishes').insert(backup.wishes);
      if (result.error) throw result.error;
    }
  } catch (error) {
    if (uploaded.length) {
      const cleanup = await client.storage.from('wish-photos').remove(uploaded);
      if (cleanup.error) throw new Error('La restauración falló y quedaron archivos por revisar en el bucket destino.');
    }
    throw error;
  }
}
