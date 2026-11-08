import { HttpError, readLimitedBody, withHttp } from './http.js';
import { issueChallenge, verifyChallenge } from './challenge.js';
import { validateFields, validatePhoto } from './validation.js';

const BUCKET = 'wish-photos';

export function createSubmitHandler({ client, secret, origins, now = Date.now }) {
  return withHttp(async (request) => {
    if (!secret) throw new HttpError(503, 'El muro todavía no está disponible. Volvé a visitarnos pronto.');
    if (request.method === 'GET') return { body: await issueChallenge(request, secret, now()) };
    if (request.method !== 'POST') throw new HttpError(405, 'Método no permitido.');
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new HttpError(400, 'Enviá el formulario completo.');
    const bytes = await readLimitedBody(request, 400 * 1024);
    let form;
    try { form = await new Response(bytes, { headers: { 'content-type': request.headers.get('content-type') } }).formData(); }
    catch { throw new HttpError(400, 'No pudimos leer el formulario. Volvé a intentar.'); }
    if (String(form.get('website') || '').trim()) return { status: 201, body: { status: 'pending' } };
    const fields = validateFields(form);
    const challenge = await verifyChallenge(request, secret, form.get('challenge'), form.get('answer'), now());
    const photo = form.get('photo');
    const thumbnail = form.get('thumbnail');
    if (!!photo !== !!thumbnail) throw new HttpError(400, 'Volvé a elegir la foto para preparar su vista previa.');
    const photoBytes = photo ? await validatePhoto(photo, { maxBytes: 300 * 1024, maxSide: 1280 }) : null;
    const thumbBytes = thumbnail ? await validatePhoto(thumbnail, { maxBytes: 50 * 1024, maxSide: 480 }) : null;
    const reservation = await client.rpc('reserve_wish_submission', {
      p_fingerprint: challenge.fingerprint, p_nonce: challenge.nonce,
    });
    if (reservation.error) {
      if (reservation.error.message?.includes('SUBMISSION_RATE_LIMIT')) throw new HttpError(429, 'Ya recibimos varios recuerdos desde tu conexión. Podés volver a enviar dentro de una hora.');
      if (reservation.error.message?.includes('SUBMISSION_REPLAY')) throw new HttpError(409, 'Esta solicitud ya se usó. Cargá una nueva pregunta para volver a intentar.');
      throw reservation.error;
    }
    const id = challenge.nonce;
    const paths = photo ? [`${id}/photo.jpg`, `${id}/thumbnail.jpg`] : [];
    try {
      for (const [index, body] of [photoBytes, thumbBytes].entries()) {
        if (!body) continue;
        const uploaded = await client.storage.from(BUCKET).upload(paths[index], body, {
          contentType: 'image/jpeg', cacheControl: '600', upsert: false,
        });
        if (uploaded.error) throw uploaded.error;
      }
      const inserted = await client.from('wishes').insert({
        id, ...fields, status: 'pending', photo_path: paths[0] || null, thumbnail_path: paths[1] || null,
      });
      if (inserted.error) throw inserted.error;
    } catch (error) {
      if (paths.length) {
        try {
          const cleanup = await client.storage.from(BUCKET).remove(paths);
          if (cleanup.error) console.error('Pending upload cleanup needed', id);
        } catch { console.error('Pending upload cleanup needed', id); }
      }
      throw error;
    }
    return { status: 201, body: { status: 'pending' } };
  }, origins);
}
