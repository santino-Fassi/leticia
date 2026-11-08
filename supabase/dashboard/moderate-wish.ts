// @ts-nocheck
// ARCHIVO GENERADO: copiar TODO en index.ts del editor web de Supabase.
// Nombre de la funcion: moderate-wish
// En Details, desactivar Verify JWT with legacy secret.
// No pegar claves: el servidor usa sus variables de entorno.
// Editar los fuentes de supabase/functions/ y regenerar con npm run prepare:supabase.


// supabase/functions/_shared/runtime.ts
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

// supabase/functions/_shared/http.js
var HttpError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var DEFAULT_ORIGINS = "https://santino-fassi.github.io,http://localhost:5173,http://127.0.0.1:5173";
function withHttp(handler, origins = DEFAULT_ORIGINS) {
  const allowed = new Set(origins.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  return async (request) => {
    const origin = request.headers.get("origin") || "";
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Vary": "Origin",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };
    if (!allowed.has(origin.toLowerCase())) {
      return new Response(JSON.stringify({ error: "Este origen no est\xE1 habilitado para el muro." }), { status: 403, headers });
    }
    headers["Access-Control-Allow-Origin"] = origin;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      const result = await handler(request);
      return new Response(JSON.stringify(result.body), { status: result.status || 200, headers });
    } catch (error) {
      if (!(error instanceof HttpError)) console.error("Wall request failed", error?.code || error?.name || "Error");
      return new Response(JSON.stringify({
        error: error instanceof HttpError ? error.message : "El muro no est\xE1 disponible en este momento. Intent\xE1 m\xE1s tarde."
      }), { status: error instanceof HttpError ? error.status : 503, headers });
    }
  };
}
async function readLimitedBody(request, limit) {
  const declared = Number(request.headers.get("content-length"));
  if (declared > limit) throw new HttpError(413, "El env\xEDo es demasiado grande. Prob\xE1 con una foto m\xE1s peque\xF1a.");
  if (!request.body) throw new HttpError(400, "Faltan los datos del mensaje.");
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
        throw new HttpError(413, "El env\xEDo es demasiado grande. Prob\xE1 con una foto m\xE1s peque\xF1a.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
async function requireAdmin(request, client) {
  const token = (request.headers.get("authorization") || "").match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new HttpError(401, "Ingres\xE1 con tu cuenta de administraci\xF3n.");
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Tu sesi\xF3n venci\xF3. Ingres\xE1 nuevamente.");
  const role = await client.rpc("is_wall_admin_for", { p_user_id: data.user.id });
  if (role.error) throw role.error;
  if (!role.data) throw new HttpError(403, "Esta cuenta no tiene permiso para administrar el muro.");
  return data.user;
}

// supabase/functions/_shared/runtime.ts
var url = Deno.env.get("SUPABASE_URL");
var secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var runtime = {
  client: createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }),
  secret,
  origins: Deno.env.get("ALLOWED_ORIGINS") || DEFAULT_ORIGINS
};

// supabase/functions/_shared/moderate.js
function createModerateHandler({ client, origins, now = Date.now }) {
  return withHttp(async (request) => {
    if (request.method !== "POST") throw new HttpError(405, "M\xE9todo no permitido.");
    const user = await requireAdmin(request, client);
    let payload;
    try {
      payload = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 4096)));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, "La solicitud no es v\xE1lida.");
    }
    const { id, action } = payload || {};
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !["approve", "reject"].includes(action)) throw new HttpError(400, "Eleg\xED un mensaje y una acci\xF3n v\xE1lidos.");
    const found = await client.from("wishes").select("*").eq("id", id).maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) throw new HttpError(404, "No encontramos ese mensaje.");
    const wish = found.data;
    const target = action === "approve" ? "approved" : "rejected";
    if (action === "approve" && wish.status === "rejected") throw new HttpError(409, "Un mensaje rechazado no puede publicarse.");
    if (wish.status !== target) {
      const updated = await client.from("wishes").update({
        status: target,
        moderated_by: user.id,
        moderated_at: new Date(now()).toISOString()
      }).eq("id", id).eq("status", wish.status).select("id").maybeSingle();
      if (updated.error) throw updated.error;
      if (!updated.data) throw new HttpError(409, "Otra persona acaba de revisar este mensaje. Actualiz\xE1 la lista.");
    }
    let warning = null;
    if (target === "rejected") {
      const paths = [wish.photo_path, wish.thumbnail_path].filter(Boolean);
      if (paths.length) {
        const removed = await client.storage.from("wish-photos").remove(paths);
        if (removed.error) warning = "El mensaje fue retirado. Volv\xE9 a rechazarlo para reintentar la eliminaci\xF3n de las fotos.";
        else {
          const cleaned = await client.from("wishes").update({ photo_path: null, thumbnail_path: null }).eq("id", id).eq("status", "rejected");
          if (cleaned.error) warning = "Las fotos se eliminaron. Actualiz\xE1 la lista para comprobar el estado.";
        }
      }
    }
    return { body: { status: target, warning } };
  }, origins);
}

// supabase/functions/moderate-wish/index.ts
Deno.serve(createModerateHandler(runtime));
