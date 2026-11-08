// @ts-nocheck
// ARCHIVO GENERADO: copiar TODO en index.ts del editor web de Supabase.
// Nombre de la funcion: submit-wish
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

// supabase/functions/_shared/runtime.ts
var url = Deno.env.get("SUPABASE_URL");
var secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var runtime = {
  client: createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }),
  secret,
  origins: Deno.env.get("ALLOWED_ORIGINS") || DEFAULT_ORIGINS
};

// supabase/functions/_shared/challenge.js
var encoder = new TextEncoder();
var encode = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
var decode = (value) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
async function hmac(secret2, message) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret2), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}
async function fingerprint(request, secret2) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return [...await hmac(secret2, `wall-ip:${ip}`)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
async function issueChallenge(request, secret2, now = Date.now()) {
  const numbers = crypto.getRandomValues(new Uint8Array(2));
  const payload = {
    left: numbers[0] % 8 + 1,
    right: numbers[1] % 8 + 1,
    nonce: crypto.randomUUID(),
    issued: now,
    fingerprint: await fingerprint(request, secret2)
  };
  const encoded = encode(encoder.encode(JSON.stringify(payload)));
  const token = `${encoded}.${encode(await hmac(secret2, encoded))}`;
  return { left: payload.left, right: payload.right, token };
}
async function verifyChallenge(request, secret2, token, answer, now = Date.now()) {
  try {
    if (typeof token !== "string" || token.length > 1024) throw new Error();
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) throw new Error();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret2), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, decode(signature), encoder.encode(encoded))) throw new Error();
    const payload = JSON.parse(new TextDecoder().decode(decode(encoded)));
    if (!Number.isFinite(payload.issued) || now - payload.issued > 20 * 60 * 1e3 || now < payload.issued) throw new Error();
    if (payload.fingerprint !== await fingerprint(request, secret2)) throw new Error();
    if (now - payload.issued < 2e3) throw new HttpError(400, "Esper\xE1 un instante y volv\xE9 a enviar tu mensaje.");
    if (!/^\d{1,2}$/.test(String(answer)) || Number(answer) !== payload.left + payload.right) {
      throw new HttpError(400, "Revis\xE1 el resultado de la cuenta y volv\xE9 a intentar.");
    }
    return payload;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "La pregunta venci\xF3. Carg\xE1 una nueva y volv\xE9 a intentar.");
  }
}

// supabase/functions/_shared/validation.js
function validateFields(form) {
  const rules = { name: [2, 80, "nombre"], city: [1, 80, "ciudad"], country: [1, 80, "pa\xEDs"], message: [10, 2e3, "mensaje"] };
  const result = {};
  for (const [field, [minimum, maximum, label]] of Object.entries(rules)) {
    const raw = form.get(field);
    if (typeof raw !== "string") throw new HttpError(400, `Complet\xE1 el campo ${label}.`);
    const value = raw.normalize("NFC").trim();
    const length = [...value].length;
    if (length < minimum || length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
      throw new HttpError(400, `El campo ${label} debe tener entre ${minimum} y ${maximum} caracteres v\xE1lidos.`);
    }
    result[field] = value;
  }
  if (form.get("consent") !== "true") throw new HttpError(400, "Necesitamos tu permiso para publicar el recuerdo.");
  return result;
}
function jpegDimensions(bytes) {
  if (bytes.length < 12 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw new Error("Invalid JPEG");
  let offset = 2;
  let size = null;
  while (offset < bytes.length - 2) {
    if (bytes[offset++] !== 255) throw new Error("Invalid JPEG marker");
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218) {
      if (!size) throw new Error("Missing JPEG frame");
      return size;
    }
    if (offset + 2 > bytes.length) throw new Error("Truncated JPEG");
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new Error("Truncated JPEG");
    if (marker === 192 || marker === 194) {
      if (length < 8 || bytes[offset + 2] !== 8) throw new Error("Invalid JPEG frame");
      size = { height: bytes[offset + 3] * 256 + bytes[offset + 4], width: bytes[offset + 5] * 256 + bytes[offset + 6] };
    }
    offset += length;
  }
  throw new Error("Missing JPEG scan");
}
async function validatePhoto(file, { maxBytes, maxSide }) {
  if (!file || typeof file === "string" || file.type !== "image/jpeg" || !file.size || file.size > maxBytes) {
    throw new HttpError(400, "La foto no tiene un formato o un tama\xF1o v\xE1lido. Volv\xE9 a elegirla.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const { width, height } = jpegDimensions(bytes);
    if (!width || !height || width > maxSide || height > maxSide) throw new Error();
  } catch {
    throw new HttpError(400, "No pudimos validar esa foto. Prob\xE1 con otra imagen.");
  }
  return bytes;
}

// supabase/functions/_shared/submit.js
var BUCKET = "wish-photos";
function createSubmitHandler({ client, secret: secret2, origins, now = Date.now }) {
  return withHttp(async (request) => {
    if (!secret2) throw new HttpError(503, "El muro todav\xEDa no est\xE1 disponible. Volv\xE9 a visitarnos pronto.");
    if (request.method === "GET") return { body: await issueChallenge(request, secret2, now()) };
    if (request.method !== "POST") throw new HttpError(405, "M\xE9todo no permitido.");
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new HttpError(400, "Envi\xE1 el formulario completo.");
    const bytes = await readLimitedBody(request, 400 * 1024);
    let form;
    try {
      form = await new Response(bytes, { headers: { "content-type": request.headers.get("content-type") } }).formData();
    } catch {
      throw new HttpError(400, "No pudimos leer el formulario. Volv\xE9 a intentar.");
    }
    if (String(form.get("website") || "").trim()) return { status: 201, body: { status: "pending" } };
    const fields = validateFields(form);
    const challenge = await verifyChallenge(request, secret2, form.get("challenge"), form.get("answer"), now());
    const photo = form.get("photo");
    const thumbnail = form.get("thumbnail");
    if (!!photo !== !!thumbnail) throw new HttpError(400, "Volv\xE9 a elegir la foto para preparar su vista previa.");
    const photoBytes = photo ? await validatePhoto(photo, { maxBytes: 300 * 1024, maxSide: 1280 }) : null;
    const thumbBytes = thumbnail ? await validatePhoto(thumbnail, { maxBytes: 50 * 1024, maxSide: 480 }) : null;
    const reservation = await client.rpc("reserve_wish_submission", {
      p_fingerprint: challenge.fingerprint,
      p_nonce: challenge.nonce
    });
    if (reservation.error) {
      if (reservation.error.message?.includes("SUBMISSION_RATE_LIMIT")) throw new HttpError(429, "Ya recibimos varios recuerdos desde tu conexi\xF3n. Pod\xE9s volver a enviar dentro de una hora.");
      if (reservation.error.message?.includes("SUBMISSION_REPLAY")) throw new HttpError(409, "Esta solicitud ya se us\xF3. Carg\xE1 una nueva pregunta para volver a intentar.");
      throw reservation.error;
    }
    const id = challenge.nonce;
    const paths = photo ? [`${id}/photo.jpg`, `${id}/thumbnail.jpg`] : [];
    try {
      for (const [index, body] of [photoBytes, thumbBytes].entries()) {
        if (!body) continue;
        const uploaded = await client.storage.from(BUCKET).upload(paths[index], body, {
          contentType: "image/jpeg",
          cacheControl: "600",
          upsert: false
        });
        if (uploaded.error) throw uploaded.error;
      }
      const inserted = await client.from("wishes").insert({
        id,
        ...fields,
        status: "pending",
        photo_path: paths[0] || null,
        thumbnail_path: paths[1] || null
      });
      if (inserted.error) throw inserted.error;
    } catch (error) {
      if (paths.length) {
        try {
          const cleanup = await client.storage.from(BUCKET).remove(paths);
          if (cleanup.error) console.error("Pending upload cleanup needed", id);
        } catch {
          console.error("Pending upload cleanup needed", id);
        }
      }
      throw error;
    }
    return { status: 201, body: { status: "pending" } };
  }, origins);
}

// supabase/functions/submit-wish/index.ts
Deno.serve(createSubmitHandler(runtime));
