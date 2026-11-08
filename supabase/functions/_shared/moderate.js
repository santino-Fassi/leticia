import { HttpError, readLimitedBody, requireAdmin, withHttp } from './http.js';

export function createModerateHandler({ client, origins, now = Date.now }) {
  return withHttp(async (request) => {
    if (request.method !== 'POST') throw new HttpError(405, 'Método no permitido.');
    const user = await requireAdmin(request, client);
    let payload;
    try { payload = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 4096))); }
    catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'La solicitud no es válida.'); }
    const { id, action } = payload || {};
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      || !['approve', 'reject'].includes(action)) throw new HttpError(400, 'Elegí un mensaje y una acción válidos.');
    const found = await client.from('wishes').select('*').eq('id', id).maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) throw new HttpError(404, 'No encontramos ese mensaje.');
    const wish = found.data;
    const target = action === 'approve' ? 'approved' : 'rejected';
    if (action === 'approve' && wish.status === 'rejected') throw new HttpError(409, 'Un mensaje rechazado no puede publicarse.');
    if (wish.status !== target) {
      const updated = await client.from('wishes').update({
        status: target, moderated_by: user.id, moderated_at: new Date(now()).toISOString(),
      }).eq('id', id).eq('status', wish.status).select('id').maybeSingle();
      if (updated.error) throw updated.error;
      if (!updated.data) throw new HttpError(409, 'Otra persona acaba de revisar este mensaje. Actualizá la lista.');
    }
    let warning = null;
    if (target === 'rejected') {
      const paths = [wish.photo_path, wish.thumbnail_path].filter(Boolean);
      if (paths.length) {
        const removed = await client.storage.from('wish-photos').remove(paths);
        if (removed.error) warning = 'El mensaje fue retirado. Volvé a rechazarlo para reintentar la eliminación de las fotos.';
        else {
          const cleaned = await client.from('wishes').update({ photo_path: null, thumbnail_path: null })
            .eq('id', id).eq('status', 'rejected');
          if (cleaned.error) warning = 'Las fotos se eliminaron. Actualizá la lista para comprobar el estado.';
        }
      }
    }
    return { body: { status: target, warning } };
  }, origins);
}
