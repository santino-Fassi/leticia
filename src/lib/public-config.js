export function isPublicKey(value) {
  if (value.startsWith('sb_publishable_') && value.length > 20) return true;
  try {
    const payload = JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'anon';
  } catch { return false; }
}

export function isProjectUrl(value, allowLocal = false) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(value)
    || (allowLocal && /^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(value));
}

export function assertPublicConfig(env, allowLocal = false) {
  const url = (env.VITE_SUPABASE_URL || '').trim();
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (key && !isPublicKey(key)) throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY debe ser una clave publicable/anon. Las claves secret/service_role no se pueden publicar.');
  if (url && !isProjectUrl(url, allowLocal)) throw new Error('VITE_SUPABASE_URL debe ser la URL de tu proyecto Supabase.');
  return { url, key, configured: !!url && !!key };
}
