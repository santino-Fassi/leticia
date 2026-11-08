import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL aplica RLS y privilegios a visitantes y administradores', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon, authenticated, service_role;
      grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
      insert into auth.users values ('00000000-0000-4000-8000-000000000001', 'admin@example.invalid'), ('00000000-0000-4000-8000-000000000002', 'visitor@example.invalid');
    `);
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(migrations)).filter((file) => file.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(file, migrations), 'utf8'));
    }
    await db.exec(`
      insert into private.wall_admins (user_id) values ('00000000-0000-4000-8000-000000000001');
      insert into public.wishes (name, city, country, message, status) values
      ('Pendiente', 'Rosario', 'Argentina', 'Mensaje privado pendiente.', 'pending'),
      ('Aprobado', 'Rosario', 'Argentina', 'Mensaje publico aprobado.', 'approved'),
      ('Rechazado', 'Rosario', 'Argentina', 'Mensaje privado rechazado.', 'rejected');
      insert into storage.objects (bucket_id, name) values ('wish-photos', 'private.jpg');
    `);

    async function asRole(role, user = '') {
      await db.exec('reset role;');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
      await db.exec('set role ' + role);
    }
    await asRole('anon');
    assert.deepEqual((await db.query('select name from public.wishes')).rows, [{ name: 'Aprobado' }]);
    assert.equal((await db.query('select name from storage.objects')).rows.length, 0);
    await assert.rejects(db.exec("insert into public.wishes(name, city, country, message) values ('Spammer','X','X','Texto suficientemente largo')"), /permission denied/);
    await assert.rejects(db.exec("update public.wishes set status = 'approved'"), /permission denied/);
    await assert.rejects(db.exec("select * from private.wall_admins"), /permission denied/);
    await assert.rejects(db.exec("select public.is_wall_admin_for('00000000-0000-4000-8000-000000000001')"), /permission denied/);
    await assert.rejects(db.exec("select public.reserve_wish_submission(repeat('a',64), gen_random_uuid())"), /permission denied/);
    await assert.rejects(db.exec("insert into storage.objects(bucket_id,name) values ('wish-photos','evil.svg')"), /row-level security/);

    await asRole('authenticated', '00000000-0000-4000-8000-000000000002');
    assert.equal((await db.query('select name from public.wishes')).rows.length, 1);
    assert.equal((await db.query('select public.is_wall_admin() as allowed')).rows[0].allowed, false);

    await asRole('authenticated', '00000000-0000-4000-8000-000000000001');
    assert.equal((await db.query('select name from public.wishes')).rows.length, 3);
    assert.equal((await db.query('select public.is_wall_admin() as allowed')).rows[0].allowed, true);
    await assert.rejects(db.exec("update public.wishes set status = 'approved'"), /permission denied/);
    assert.equal((await db.query('select name from storage.objects')).rows.length, 0);

    await asRole('service_role');
    const noLocation = await db.query("insert into public.wishes(name, message) values ('Sin ubicación', 'Gracias por compartir tu arte.') returning city, country, status");
    assert.deepEqual(noLocation.rows, [{ city: '', country: '', status: 'pending' }]);
    await db.exec("insert into public.wishes(name, city, country, message) values ('Ubicación vacía', '', '', 'Gracias por tantos años de enseñanza.')");
    await assert.rejects(db.exec("insert into public.wishes(name, city, message) values ('Ciudad larga', repeat('x', 81), 'Gracias por compartir tu arte.')"), /wishes_city_check/);
    await assert.rejects(db.exec("insert into public.wishes(name, country, message) values ('País largo', repeat('x', 81), 'Gracias por compartir tu arte.')"), /wishes_country_check/);
    assert.equal((await db.query("select public.is_wall_admin_for('00000000-0000-4000-8000-000000000001') as allowed")).rows[0].allowed, true);
    for (let index = 0; index < 3; index++) await db.exec("select public.reserve_wish_submission(repeat('a',64), gen_random_uuid())");
    await assert.rejects(db.exec("select public.reserve_wish_submission(repeat('a',64), gen_random_uuid())"), /SUBMISSION_RATE_LIMIT/);
    await asRole('postgres');
    const { rows } = await db.query('select nonce from private.submission_attempts limit 1');
    await asRole('service_role');
    await assert.rejects(db.query("select public.reserve_wish_submission(repeat('b',64), $1::uuid)", [rows[0].nonce]), /SUBMISSION_REPLAY/);
    await assert.rejects(db.exec("insert into public.wishes(name,city,country,message,photo_path) values ('Test','X','X','Mensaje de prueba suficientemente largo.','bad.jpg')"), /wish_photo_pair/);
    await asRole('postgres');
    assert.equal((await db.query("select public from storage.buckets where id = 'wish-photos'")).rows[0].public, false);
  } finally { await db.close(); }
});
