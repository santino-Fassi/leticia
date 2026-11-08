export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const DEFAULT_ORIGINS = 'https://santino-fassi.github.io,http://localhost:5173,http://127.0.0.1:5173';

export function withHttp(handler, origins = DEFAULT_ORIGINS) {
  const allowed = new Set(origins.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean));
  return async (request) => {
    const origin = request.headers.get('origin') || '';
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    if (!allowed.has(origin.toLowerCase())) {
      return new Response(JSON.stringify({ error: 'Este origen no está habilitado para el muro.' }), { status: 403, headers });
    }
    headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      const result = await handler(request);
      return new Response(JSON.stringify(result.body), { status: result.status || 200, headers });
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('Wall request failed', error?.code || error?.name || 'Error');
      return new Response(JSON.stringify({
        error: error instanceof HttpError ? error.message : 'El muro no está disponible en este momento. Intentá más tarde.',
      }), { status: error instanceof HttpError ? error.status : 503, headers });
    }
  };
}

export async function readLimitedBody(request, limit) {
  const declared = Number(request.headers.get('content-length'));
  if (declared > limit) throw new HttpError(413, 'El envío es demasiado grande. Probá con una foto más pequeña.');
  if (!request.body) throw new HttpError(400, 'Faltan los datos del mensaje.');
  const reader = request.body.getReader();
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw new HttpError(413, 'El envío es demasiado grande. Probá con una foto más pequeña.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function requireAdmin(request, client) {
  const token = (request.headers.get('authorization') || '').match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new HttpError(401, 'Ingresá con tu cuenta de administración.');
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Tu sesión venció. Ingresá nuevamente.');
  const role = await client.rpc('is_wall_admin_for', { p_user_id: data.user.id });
  if (role.error) throw role.error;
  if (!role.data) throw new HttpError(403, 'Esta cuenta no tiene permiso para administrar el muro.');
  return data.user;
}
