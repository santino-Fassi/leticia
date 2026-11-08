import { HttpError } from './http.js';

const encoder = new TextEncoder();
const encode = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));

export async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

export async function fingerprint(request, secret) {
  // Supabase expone la IP del cliente en la primera entrada de X-Forwarded-For.
  // No usar la IP del proxy final, que puede ser compartida por visitantes distintos.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || 'unknown';
  return [...await hmac(secret, `wall-ip:${ip}`)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function issueChallenge(request, secret, now = Date.now()) {
  const numbers = crypto.getRandomValues(new Uint8Array(2));
  const payload = {
    left: numbers[0] % 8 + 1, right: numbers[1] % 8 + 1,
    nonce: crypto.randomUUID(), issued: now, fingerprint: await fingerprint(request, secret),
  };
  const encoded = encode(encoder.encode(JSON.stringify(payload)));
  const token = `${encoded}.${encode(await hmac(secret, encoded))}`;
  return { left: payload.left, right: payload.right, token };
}

export async function verifyChallenge(request, secret, token, answer, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 1024) throw new Error();
    const [encoded, signature, extra] = token.split('.');
    if (!encoded || !signature || extra) throw new Error();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('HMAC', key, decode(signature), encoder.encode(encoded))) throw new Error();
    const payload = JSON.parse(new TextDecoder().decode(decode(encoded)));
    if (!Number.isFinite(payload.issued) || now - payload.issued > 20 * 60 * 1000 || now < payload.issued) throw new Error();
    if (payload.fingerprint !== await fingerprint(request, secret)) throw new Error();
    if (now - payload.issued < 2000) throw new HttpError(400, 'Esperá un instante y volvé a enviar tu mensaje.');
    if (!/^\d{1,2}$/.test(String(answer)) || Number(answer) !== payload.left + payload.right) {
      throw new HttpError(400, 'Revisá el resultado de la cuenta y volvé a intentar.');
    }
    return payload;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'La pregunta venció. Cargá una nueva y volvé a intentar.');
  }
}
