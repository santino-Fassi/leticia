import { test } from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { assertPublicConfig } from '../src/lib/public-config.js';
import { jpegDimensions, validatePhoto } from '../supabase/functions/_shared/validation.js';
import { fingerprint, issueChallenge, verifyChallenge } from '../supabase/functions/_shared/challenge.js';
import { readLimitedBody } from '../supabase/functions/_shared/http.js';

const anonymousKey = 'a.' + Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url') + '.c';
const serviceKey = 'a.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.c';

test('configuracion vacia deja la portada disponible y un secreto detiene el build', () => {
  assert.equal(assertPublicConfig({}).configured, false);
  assert.equal(assertPublicConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: anonymousKey }).configured, true);
  for (const key of [serviceKey, 'sb_secret_do_not_publish_this', 'invalid']) {
    assert.throws(() => assertPublicConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: key }), /clave/);
  }
  assert.throws(() => assertPublicConfig({ VITE_SUPABASE_URL: 'javascript:alert(1)' }), /URL/);
  assert.equal(assertPublicConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: anonymousKey }, true).configured, true);
});

test('valida JPEG reales, dimensiones, MIME y archivos truncados', async () => {
  const encoded = jpeg.encode({ width: 8, height: 6, data: Buffer.alloc(8 * 6 * 4, 255) }, 75).data;
  assert.deepEqual(jpegDimensions(encoded), { width: 8, height: 6 });
  await validatePhoto(new File([encoded], 'photo.jpg', { type: 'image/jpeg' }), { maxBytes: 10000, maxSide: 1280 });
  for (const file of [
    new File([encoded], 'photo.svg', { type: 'image/svg+xml' }),
    new File([encoded.subarray(0, -2)], 'photo.jpg', { type: 'image/jpeg' }),
    new File(['<html>not an image</html>'], 'photo.jpg', { type: 'image/jpeg' }),
  ]) await assert.rejects(validatePhoto(file, { maxBytes: 10000, maxSide: 1280 }));
  await assert.rejects(validatePhoto(new File([encoded], 'photo.jpg', { type: 'image/jpeg' }), { maxBytes: 10000, maxSide: 4 }));
});

test('el desafio vence, exige tiempo minimo y verifica firma', async () => {
  const request = new Request('https://example.invalid', { headers: { 'x-forwarded-for': '192.0.2.1' } });
  const challenge = await issueChallenge(request, 'test-secret', 1000000);
  const answer = String(challenge.left + challenge.right);
  await assert.rejects(verifyChallenge(request, 'test-secret', challenge.token, answer, 1000500), /instante/);
  await assert.rejects(verifyChallenge(request, 'test-secret', challenge.token, answer, 1000000 + 21 * 60 * 1000), /venció/);
  await assert.rejects(verifyChallenge(request, 'other-secret', challenge.token, answer, 1003000), /venció/);
  const verified = await verifyChallenge(request, 'test-secret', challenge.token, answer, 1003000);
  assert.ok(verified.nonce);
});

test('limita cuerpos aunque no incluyan Content-Length', async () => {
  const request = new Request('https://example.invalid', { method: 'POST', body: 'too long' });
  await assert.rejects(readLimitedBody(request, 4), (error) => error.status === 413);
});

test('la cuota distingue visitantes que pasan por el mismo proxy de Supabase', async () => {
  const direct = new Request('https://example.invalid', { headers: { 'x-forwarded-for': '192.0.2.1' } });
  const throughProxy = new Request('https://example.invalid', { headers: { 'x-forwarded-for': '192.0.2.1, 10.0.0.1' } });
  const otherVisitor = new Request('https://example.invalid', { headers: { 'x-forwarded-for': '192.0.2.2, 10.0.0.1' } });
  assert.equal(await fingerprint(direct, 'test-secret'), await fingerprint(throughProxy, 'test-secret'));
  assert.notEqual(await fingerprint(throughProxy, 'test-secret'), await fingerprint(otherVisitor, 'test-secret'));
});