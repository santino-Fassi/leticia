// @ts-nocheck
// ARCHIVO GENERADO: copiar TODO en index.ts del editor web de Supabase.
// Nombre de la funcion: wall
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

// supabase/functions/_shared/wall.js
function createWallHandler({ client, origins }) {
  return withHttp(async (request) => {
    if (request.method !== "GET") throw new HttpError(405, "M\xE9todo no permitido.");
    const params = new URL(request.url).searchParams;
    const pageText = params.get("page") || "1";
    if (!/^[1-9]\d{0,3}$/.test(pageText)) throw new HttpError(400, "La p\xE1gina solicitada no es v\xE1lida.");
    const page = Number(pageText);
    const admin = params.get("admin") === "true";
    if (admin) await requireAdmin(request, client);
    const status = admin ? params.get("status") || "pending" : "approved";
    if (!["pending", "approved", "rejected"].includes(status)) throw new HttpError(400, "El filtro no es v\xE1lido.");
    const id = params.get("id");
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new HttpError(400, "El recuerdo solicitado no es v\xE1lido.");
    let query = client.from("wishes").select("id,name,city,country,message,status,photo_path,thumbnail_path,created_at").eq("status", status).order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 12, page * 12);
    if (id) query = query.eq("id", id);
    const result = await query;
    if (result.error) throw result.error;
    const rows = result.data.slice(0, 12);
    const paths = rows.flatMap((wish) => [wish.photo_path, wish.thumbnail_path].filter(Boolean));
    const signed = paths.length ? await client.storage.from("wish-photos").createSignedUrls(paths, 600) : { data: [], error: null };
    if (signed.error || signed.data.some((entry) => entry.error || !entry.signedUrl)) {
      throw signed.error || new Error("Photo signing failed");
    }
    const urls = new Map(signed.data.map((entry) => [entry.path, entry.signedUrl]));
    return { body: {
      wishes: rows.map(({ photo_path, thumbnail_path, ...wish }) => ({
        ...wish,
        photo_url: urls.get(photo_path) || null,
        thumbnail_url: urls.get(thumbnail_path) || null
      })),
      page,
      has_more: result.data.length > 12
    } };
  }, origins);
}

// supabase/functions/wall/index.ts
Deno.serve(createWallHandler(runtime));
