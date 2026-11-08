import { createClient } from '@supabase/supabase-js';
import { isConfigured, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  : null;

export async function callFunction(name, { method = 'POST', body, query, authenticated = false } = {}) {
  if (!supabase) throw new Error('El muro todavía no está disponible. Volvé a visitarnos pronto.');
  const url = new URL(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${name}`);
  for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, value);
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY };
  if (authenticated) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error('Tu sesión venció. Ingresá nuevamente.');
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(45000) });
  } catch {
    throw new Error('No pudimos conectarnos. Revisá tu conexión e intentá nuevamente.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || 'El muro no está disponible en este momento. Intentá más tarde.');
  }
  return result;
}

export const listWishes = (page = 1) => callFunction('wall', { method: 'GET', query: { page } });
export const getChallenge = () => callFunction('submit-wish', { method: 'GET' });
export const submitWish = (body) => callFunction('submit-wish', { body });
export const moderateWish = (id, action) => callFunction('moderate-wish', {
  body: { id, action }, authenticated: true,
});
export const listAdminWishes = (page, status) => callFunction('wall', {
  method: 'GET', query: { page, status, admin: 'true' }, authenticated: true,
});

export async function getWish(id, { admin = false, status = 'approved' } = {}) {
  const result = await callFunction('wall', {
    method: 'GET', query: { id, ...(admin ? { admin: 'true', status } : {}) }, authenticated: admin,
  });
  if (!result.wishes.length) throw new Error('Este recuerdo ya no está disponible. Actualizá el muro.');
  return result.wishes[0];
}
