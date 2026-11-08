// Servidor optativo, SOLO para QA local. No se importa en el frontend ni se publica.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createSubmitHandler } from '../../supabase/functions/_shared/submit.js';
import { createWallHandler } from '../../supabase/functions/_shared/wall.js';
import { createModerateHandler } from '../../supabase/functions/_shared/moderate.js';
import { createFakeSupabase, sampleWish } from '../helpers/fake-supabase.js';

const { client, state } = createFakeSupabase(Array.from({ length: 14 }, (_, index) => sampleWish(index + 1, 'approved')));
const pending = sampleWish(90);
pending.photo_path = pending.id + '/photo.jpg';
pending.thumbnail_path = pending.id + '/thumbnail.jpg';
state.wishes.push(pending);
try {
  const photo = await readFile(new URL('../../.qa/photo.jpg', import.meta.url));
  state.files.set(pending.photo_path, { body: photo });
  state.files.set(pending.thumbnail_path, { body: photo });
} catch {
  pending.photo_path = pending.thumbnail_path = null;
}
const adminUser = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'equipo@example.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const accessToken = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: adminUser.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.local-qa-only';
state.users.set(accessToken, adminUser);
const signedPhotos = new Map();
client.storage.from = () => ({
  upload: async (file, body) => { state.files.set(file, { body }); return { data: { path: file }, error: null }; },
  remove: async (files) => { files.forEach((file) => state.files.delete(file)); return { data: [], error: null }; },
  createSignedUrls: async (files) => ({ data: files.map((file) => {
    const token = crypto.randomUUID();
    signedPhotos.set(token, file);
    return { path: file, signedUrl: 'http://127.0.0.1:54321/photo/' + token };
  }), error: null }),
});
const handlers = {
  'submit-wish': createSubmitHandler({ client, secret: 'local-fixture-only', origins: 'http://127.0.0.1:5173,http://127.0.0.1:5174' }),
  wall: createWallHandler({ client, origins: 'http://127.0.0.1:5173,http://127.0.0.1:5174' }),
  'moderate-wish': createModerateHandler({ client, origins: 'http://127.0.0.1:5173,http://127.0.0.1:5174' }),
};
createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url, 'http://127.0.0.1:54321');
  if (url.pathname.startsWith('/auth/v1/')) {
    const cors = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5174', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Content-Type': 'application/json' };
    if (incoming.method === 'OPTIONS') { outgoing.writeHead(204, cors); outgoing.end(); return; }
    if (url.pathname.endsWith('/logout')) { outgoing.writeHead(204, cors); outgoing.end(); return; }
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    let body = {};
    try { body = JSON.parse(Buffer.concat(chunks)); } catch {}
    if (url.pathname.endsWith('/token') && body.email === 'equipo@example.invalid' && body.password === 'local-qa-only') {
      outgoing.writeHead(200, cors);
      outgoing.end(JSON.stringify({ access_token: accessToken, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'local-qa-refresh', user: adminUser }));
    } else { outgoing.writeHead(400, cors); outgoing.end(JSON.stringify({ code: 'invalid_credentials', msg: 'Invalid login credentials' })); }
    return;
  }
  if (url.pathname.startsWith('/photo/')) {
    const file = signedPhotos.get(url.pathname.split('/').at(-1));
    const photo = state.files.get(file);
    outgoing.writeHead(photo ? 200 : 404, { 'Content-Type': 'image/jpeg' });
    outgoing.end(photo?.body);
    return;
  }
  const handler = handlers[url.pathname.split('/').at(-1)];
  if (!handler) { outgoing.writeHead(404); outgoing.end(); return; }
  try {
    const headers = new Headers(incoming.headers);
    headers.set('x-forwarded-for', '127.0.0.1');
    const request = new Request(url, { method: incoming.method, headers, ...(incoming.method === 'GET' || incoming.method === 'OPTIONS' ? {} : { body: incoming, duplex: 'half' }) });
    const response = await handler(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end(); }
}).listen(54321, '127.0.0.1', () => console.log('QA local con 14 mensajes sintéticos: http://127.0.0.1:54321'));
