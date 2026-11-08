import { test } from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { createSubmitHandler } from '../supabase/functions/_shared/submit.js';
import { createWallHandler } from '../supabase/functions/_shared/wall.js';
import { createModerateHandler } from '../supabase/functions/_shared/moderate.js';
import { createFakeSupabase, sampleWish } from './helpers/fake-supabase.js';

const ORIGIN = 'http://localhost:5173';
const SECRET = 'test-only-not-a-real-supabase-secret';
const headers = (token) => ({ origin: ORIGIN, 'x-forwarded-for': '192.0.2.1', ...(token ? { authorization: 'Bearer ' + token } : {}) });
const request = (name, options = {}) => new Request('https://test.supabase.co/functions/v1/' + name, { headers: headers(), ...options });
const pixel = jpeg.encode({ width: 2, height: 2, data: Buffer.alloc(16, 255) }, 70).data;

async function formRequest(handler, options = {}) {
  const challenge = await (await handler(request('submit-wish'))).json();
  const form = new FormData();
  const values = { name: 'Ana', city: 'Rosario', country: 'Argentina', message: 'Gracias Lety por tantos años de enseñanza.', consent: 'true', answer: String(challenge.left + challenge.right), challenge: challenge.token, ...options.fields };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  if (options.photo) {
    form.set('photo', new Blob([pixel], { type: 'image/jpeg' }), 'recuerdo.jpg');
    form.set('thumbnail', new Blob([pixel], { type: 'image/jpeg' }), 'miniatura.jpg');
  }
  return { form, makeRequest: () => request('submit-wish', { method: 'POST', body: form }) };
}
function setup() {
  const fake = createFakeSupabase();
  let clock = 1000000;
  const handler = createSubmitHandler({ client: fake.client, secret: SECRET, now: () => clock });
  return { ...fake, handler, advance: () => { clock += 3000; } };
}

test('texto queda pendiente, persiste y no se devuelve informacion privada', async () => {
  const s = setup();
  const form = await formRequest(s.handler);
  s.advance();
  const response = await s.handler(form.makeRequest());
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { status: 'pending' });
  assert.equal(s.state.wishes.length, 1);
  assert.equal(s.state.wishes[0].status, 'pending');
  assert.equal(s.state.wishes[0].photo_path, null);
});

test('acepta ciudad y pais vacios, omitidos o completados por separado', async () => {
  for (const fields of [
    { city: '', country: '' },
    { city: '   ', country: '\t ' },
    { city: 'Rosario', country: '' },
    { city: '', country: 'Argentina' },
    null,
  ]) {
    const s = setup();
    const form = await formRequest(s.handler, { fields: fields || {} });
    if (!fields) { form.form.delete('city'); form.form.delete('country'); }
    s.advance();
    assert.equal((await s.handler(form.makeRequest())).status, 201);
    assert.equal(s.state.wishes[0].city, fields?.city.trim() || '');
    assert.equal(s.state.wishes[0].country, fields?.country.trim() || '');
    assert.equal(s.state.wishes[0].status, 'pending');
  }
});

test('la ubicacion opcional sigue rechazando textos demasiado largos, controles y archivos', async () => {
  for (const field of ['city', 'country']) {
    for (const value of ['x'.repeat(81), 'texto\u0000', new Blob(['archivo'], { type: 'text/plain' })]) {
      const s = setup();
      const form = await formRequest(s.handler);
      form.form.set(field, value);
      s.advance();
      assert.equal((await s.handler(form.makeRequest())).status, 400);
      assert.equal(s.state.wishes.length, 0);
    }
  }
});

test('foto y miniatura se guardan como JPEG en el espacio privado', async () => {
  const s = setup();
  const form = await formRequest(s.handler, { photo: true });
  s.advance();
  assert.equal((await s.handler(form.makeRequest())).status, 201);
  assert.equal(s.state.files.size, 2);
  assert.ok([...s.state.files.keys()].every((key) => /\/(photo|thumbnail)\.jpg$/.test(key)));
  assert.ok([...s.state.files.values()].every((value) => value.options.contentType === 'image/jpeg' && !value.options.upsert));
});

test('fallos de Storage o base de datos limpian las fotos subidas', async () => {
  for (const failure of ['failInsert', 'failUploadAt']) {
    const s = setup();
    s.state[failure] = failure === 'failInsert' ? true : 2;
    const form = await formRequest(s.handler, { photo: true });
    s.advance();
    assert.equal((await s.handler(form.makeRequest())).status, 503);
    assert.equal(s.state.files.size, 0);
    assert.equal(s.state.wishes.length, 0);
  }
});

test('rechaza cuenta incorrecta, consentimiento ausente, formato falso y desafio manipulado', async () => {
  const invalidCases = [{ answer: '99' }, { consent: 'false' }, { name: 'A' }, { message: 'corto' }, { challenge: 'fake.signature' }];
  for (const fields of invalidCases) {
    const s = setup();
    const form = await formRequest(s.handler, { fields });
    s.advance();
    assert.equal((await s.handler(form.makeRequest())).status, 400);
    assert.equal(s.state.wishes.length, 0);
  }
  const s = setup();
  const form = await formRequest(s.handler, { photo: true });
  form.form.set('photo', new Blob(['<svg onload="alert(1)"></svg>'], { type: 'image/jpeg' }), 'fake.jpg');
  s.advance();
  assert.equal((await s.handler(form.makeRequest())).status, 400);
});

test('el desafio esta atado a la conexion y no se puede reutilizar', async () => {
  const s = setup();
  const form = await formRequest(s.handler);
  s.advance();
  const other = request('submit-wish', { method: 'POST', body: form.form, headers: { ...headers(), 'x-forwarded-for': '192.0.2.2' } });
  assert.equal((await s.handler(other)).status, 400);
  assert.equal((await s.handler(form.makeRequest())).status, 201);
  assert.equal((await s.handler(form.makeRequest())).status, 409);
  assert.equal(s.state.wishes.length, 1);
});

test('limita envios, descarta honeypot y rechaza origenes no habilitados', async () => {
  const s = setup();
  for (let index = 0; index < 4; index++) {
    const form = await formRequest(s.handler);
    s.advance();
    assert.equal((await s.handler(form.makeRequest())).status, index < 3 ? 201 : 429);
  }
  const trap = await formRequest(s.handler, { fields: { website: 'spam.invalid' } });
  assert.equal((await s.handler(trap.makeRequest())).status, 201);
  assert.equal(s.state.wishes.length, 3);
  const badOrigin = request('submit-wish', { headers: { origin: 'https://other.invalid' } });
  const blocked = await s.handler(badOrigin);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get('access-control-allow-origin'), null);
  assert.equal((await s.handler(request('submit-wish', { method: 'OPTIONS' }))).status, 204);
});

test('el muro pagina de a 12 y nunca firma fotos de mensajes pendientes', async () => {
  const seed = Array.from({ length: 14 }, (_, index) => sampleWish(index + 1, 'approved'));
  const pending = sampleWish(90);
  pending.photo_path = pending.id + '/photo.jpg';
  pending.thumbnail_path = pending.id + '/thumbnail.jpg';
  const { client, state } = createFakeSupabase([...seed, pending]);
  const wall = createWallHandler({ client });
  const page1 = await (await wall(request('wall?page=1&status=pending'))).json();
  assert.equal(page1.wishes.length, 12);
  assert.equal(page1.has_more, true);
  assert.ok(page1.wishes.every((wish) => wish.status === 'approved'));
  const page2 = await (await wall(request('wall?page=2'))).json();
  assert.equal(page2.wishes.length, 2);
  assert.equal(page2.has_more, false);
  assert.equal(state.signedPaths.length, 0);
  assert.equal((await wall(request('wall?page=-1'))).status, 400);
});

test('solo el administrador puede leer pendientes, aprobar y rechazar', async () => {
  const pending = sampleWish();
  pending.photo_path = pending.id + '/photo.jpg';
  pending.thumbnail_path = pending.id + '/thumbnail.jpg';
  const { client, state } = createFakeSupabase([pending]);
  state.files.set(pending.photo_path, {});
  state.files.set(pending.thumbnail_path, {});
  const wall = createWallHandler({ client });
  const moderate = createModerateHandler({ client });
  for (const token of [null, 'bad-token', 'visitor-token']) {
    const response = await wall(request('wall?admin=true', { headers: headers(token) }));
    assert.equal(response.status, token === 'visitor-token' ? 403 : 401);
    const attempted = await moderate(request('moderate-wish', { method: 'POST', headers: headers(token), body: JSON.stringify({ id: pending.id, action: 'approve' }) }));
    assert.equal(attempted.status, token === 'visitor-token' ? 403 : 401);
  }
  const adminPage = await (await wall(request('wall?admin=true', { headers: headers('admin-token') }))).json();
  assert.equal(adminPage.wishes[0].id, pending.id);
  assert.equal(state.signedPaths.length, 2);
  const action = (value) => moderate(request('moderate-wish', { method: 'POST', headers: headers('admin-token'), body: JSON.stringify({ id: pending.id, action: value }) }));
  assert.equal((await action('approve')).status, 200);
  const publicPage = await (await wall(request('wall'))).json();
  assert.equal(publicPage.wishes[0].id, pending.id);
  assert.ok(publicPage.wishes[0].photo_url);
  assert.equal((await action('reject')).status, 200);
  assert.equal(state.files.size, 0);
  assert.equal(state.wishes[0].photo_path, null);
  assert.equal((await (await wall(request('wall'))).json()).wishes.length, 0);
  assert.equal((await action('approve')).status, 409);
});

test('la moderacion detecta cambios concurrentes y permite reintentar limpieza', async () => {
  const pending = sampleWish();
  pending.photo_path = pending.id + '/photo.jpg';
  pending.thumbnail_path = pending.id + '/thumbnail.jpg';
  const { client, state } = createFakeSupabase([pending]);
  const handler = createModerateHandler({ client });
  const action = (value) => handler(request('moderate-wish', { method: 'POST', headers: headers('admin-token'), body: JSON.stringify({ id: pending.id, action: value }) }));
  state.raceUpdate = true;
  assert.equal((await action('approve')).status, 409);
  state.failRemove = true;
  const rejected = await (await action('reject')).json();
  assert.equal(rejected.status, 'rejected');
  assert.ok(rejected.warning);
  state.failRemove = false;
  assert.equal((await action('reject')).status, 200);
  assert.equal(state.wishes[0].photo_path, null);
});

test('ampliar una foto renueva su enlace y sigue bloqueando pendientes', async () => {
  const approved = sampleWish(20, 'approved');
  approved.photo_path = approved.id + '/photo.jpg';
  approved.thumbnail_path = approved.id + '/thumbnail.jpg';
  const pending = sampleWish(21);
  pending.photo_path = pending.id + '/photo.jpg';
  pending.thumbnail_path = pending.id + '/thumbnail.jpg';
  const { client, state } = createFakeSupabase([approved, pending]);
  const wall = createWallHandler({ client });
  const hidden = await (await wall(request('wall?id=' + pending.id))).json();
  assert.equal(hidden.wishes.length, 0);
  assert.equal(state.signedPaths.length, 0);
  const visible = await (await wall(request('wall?id=' + approved.id))).json();
  assert.equal(visible.wishes.length, 1);
  assert.equal(visible.wishes[0].id, approved.id);
  assert.ok(visible.wishes[0].photo_url);
  assert.deepEqual(state.signedPaths, [approved.photo_path, approved.thumbnail_path]);
});
