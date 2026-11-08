import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Completá .env.backup con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY. No uses variables VITE_ para secretos.');
  process.exit(1);
}
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const destination = path.resolve('backups', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(destination, { recursive: true });
const wishes = [];
for (let from = 0; ; from += 500) {
  const { data, error } = await client.from('wishes').select('*').order('id').range(from, from + 499);
  if (error) throw error;
  wishes.push(...data);
  if (data.length < 500) break;
}
const files = new Set(wishes.flatMap((wish) => [wish.photo_path, wish.thumbnail_path].filter(Boolean)));
// Incluir tambien archivos huerfanos de una subida interrumpida.
for (let offset = 0; ; offset += 100) {
  const roots = await client.storage.from('wish-photos').list('', { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
  if (roots.error) throw roots.error;
  for (const folder of roots.data) {
    if (!/^[0-9a-f-]{36}$/i.test(folder.name)) continue;
    const children = await client.storage.from('wish-photos').list(folder.name, { limit: 100 });
    if (children.error) throw children.error;
    for (const item of children.data) files.add(folder.name + '/' + item.name);
  }
  if (roots.data.length < 100) break;
}
for (const file of files) {
  if (!/^[0-9a-f-]{36}\/(photo|thumbnail)\.jpg$/i.test(file)) throw new Error('Ruta inesperada en Storage; la copia se detuvo.');
  const { data, error } = await client.storage.from('wish-photos').download(file);
  if (error) throw error;
  const target = path.join(destination, 'photos', file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await data.arrayBuffer()), { flag: 'wx' });
}
// El manifiesto se escribe al final: sin el, la copia NO esta completa.
await writeFile(path.join(destination, 'manifest.json'), JSON.stringify({
  version: 1, created_at: new Date().toISOString(), bucket: 'wish-photos',
  wishes, files: [...files],
}, null, 2), { flag: 'wx' });
console.log('Copia completa: ' + destination);
console.log(wishes.length + ' mensajes y ' + files.size + ' archivos. Conservá otra copia fuera de esta computadora.');
