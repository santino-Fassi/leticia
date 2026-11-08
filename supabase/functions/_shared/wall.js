import { HttpError, requireAdmin, withHttp } from './http.js';

export function createWallHandler({ client, origins }) {
  return withHttp(async (request) => {
    if (request.method !== 'GET') throw new HttpError(405, 'Método no permitido.');
    const params = new URL(request.url).searchParams;
    const pageText = params.get('page') || '1';
    if (!/^[1-9]\d{0,3}$/.test(pageText)) throw new HttpError(400, 'La página solicitada no es válida.');
    const page = Number(pageText);
    const admin = params.get('admin') === 'true';
    if (admin) await requireAdmin(request, client);
    const status = admin ? params.get('status') || 'pending' : 'approved';
    if (!['pending', 'approved', 'rejected'].includes(status)) throw new HttpError(400, 'El filtro no es válido.');
    const id = params.get('id');
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new HttpError(400, 'El recuerdo solicitado no es válido.');
    let query = client.from('wishes')
      .select('id,name,city,country,message,status,photo_path,thumbnail_path,created_at')
      .eq('status', status).order('created_at', { ascending: false }).order('id', { ascending: false })
      .range((page - 1) * 12, page * 12);
    if (id) query = query.eq('id', id);
    const result = await query;
    if (result.error) throw result.error;
    const rows = result.data.slice(0, 12);
    const paths = rows.flatMap((wish) => [wish.photo_path, wish.thumbnail_path].filter(Boolean));
    const signed = paths.length
      ? await client.storage.from('wish-photos').createSignedUrls(paths, 600)
      : { data: [], error: null };
    if (signed.error || signed.data.some((entry) => entry.error || !entry.signedUrl)) {
      throw signed.error || new Error('Photo signing failed');
    }
    const urls = new Map(signed.data.map((entry) => [entry.path, entry.signedUrl]));
    return { body: {
      wishes: rows.map(({ photo_path, thumbnail_path, ...wish }) => ({
        ...wish, photo_url: urls.get(photo_path) || null, thumbnail_url: urls.get(thumbnail_path) || null,
      })),
      page, has_more: result.data.length > 12,
    } };
  }, origins);
}
