import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readBackup, restoreBackup } from '../scripts/lib/backup-files.mjs';

test('la restauracion valida rutas y no transfiere UUID de Auth del proyecto anterior', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'leticia-backup-test-'));
  try {
    const id = '00000000-0000-4000-8000-000000000001';
    const wish = { id, name: 'Ana', city: 'Rosario', country: 'Argentina', message: 'Gracias por tantos años de creatividad.', status: 'approved', photo_path: id + '/photo.jpg', thumbnail_path: id + '/thumbnail.jpg', created_at: '2026-11-07T12:00:00Z', consented_at: '2026-11-07T12:00:00Z', moderated_by: id };
    const manifest = { version: 1, bucket: 'wish-photos', wishes: [wish], files: [wish.photo_path, wish.thumbnail_path] };
    await mkdir(path.join(directory, 'photos', id), { recursive: true });
    for (const file of manifest.files) await writeFile(path.join(directory, 'photos', file), Buffer.from([255, 216, 255, 217]));
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    const result = await readBackup(directory);
    assert.equal(result.wishes[0].moderated_by, null);
    assert.equal(result.photos.length, 2);
    wish.city = wish.country = '';
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    const noLocation = await readBackup(directory);
    assert.equal(noLocation.wishes[0].city, '');
    assert.equal(noLocation.wishes[0].country, '');
    manifest.files.push('../../secret.txt');
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(readBackup(directory), /rutas/);
  } finally { const expectedRoot = path.resolve(tmpdir()) + path.sep; if (!path.resolve(directory).startsWith(expectedRoot) || !path.basename(directory).startsWith('leticia-backup-test-')) throw new Error('Unsafe temporary path'); await rm(directory, { recursive: true, force: true }); }
});

test('la restauracion exige destino vacio y revierte fotos si falla la insercion', async () => {
  const state = { rows: [], files: [], failInsert: false };
  const client = {
    from: () => ({
      select: () => ({ limit: async () => ({ data: state.rows, error: null }) }),
      insert: async (rows) => { if (state.failInsert) return { error: new Error('failed') }; state.rows.push(...rows); return { error: null }; },
    }),
    storage: { from: () => ({
      list: async () => ({ data: state.files, error: null }),
      upload: async (name) => { state.files.push(name); return { error: null }; },
      remove: async (names) => { state.files = state.files.filter((name) => !names.includes(name)); return { error: null }; },
    }) },
  };
  const backup = { wishes: [{ id: 'test' }], photos: [{ path: 'photo.jpg', bytes: new Uint8Array([1]) }] };
  state.rows = [{ id: 'existing' }];
  await assert.rejects(restoreBackup(client, backup), /vacíos/);
  assert.equal(state.files.length, 0);
  state.rows = [];
  state.failInsert = true;
  await assert.rejects(restoreBackup(client, backup), /failed/);
  assert.equal(state.files.length, 0);
  state.failInsert = false;
  await restoreBackup(client, backup);
  assert.equal(state.files.length, 1);
  assert.equal(state.rows.length, 1);
});
