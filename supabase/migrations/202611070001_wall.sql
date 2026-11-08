-- Ejecutar en un proyecto Supabase nuevo. Nunca desactivar RLS para publicar.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.wall_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table private.submission_attempts (
  nonce uuid primary key,
  fingerprint text not null check (length(fingerprint) = 64),
  created_at timestamptz not null default now()
);
create index submission_attempts_fingerprint_created on private.submission_attempts (fingerprint, created_at);
create index submission_attempts_created on private.submission_attempts (created_at);
alter table private.wall_admins enable row level security;
alter table private.submission_attempts enable row level security;

create function public.is_wall_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from private.wall_admins where user_id = (select auth.uid())); $$;
revoke all on function public.is_wall_admin() from public;
grant execute on function public.is_wall_admin() to anon, authenticated, service_role;

create function public.is_wall_admin_for(p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from private.wall_admins where user_id = p_user_id); $$;
revoke all on function public.is_wall_admin_for(uuid) from public, anon, authenticated;
grant execute on function public.is_wall_admin_for(uuid) to service_role;

create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  city text not null check (char_length(btrim(city)) between 1 and 80),
  country text not null check (char_length(btrim(country)) between 1 and 80),
  message text not null check (char_length(btrim(message)) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  photo_path text,
  thumbnail_path text,
  created_at timestamptz not null default now(),
  consented_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid references auth.users(id) on delete set null,
  constraint wish_photo_pair check (
    (photo_path is null and thumbnail_path is null) or
    (photo_path is not null and thumbnail_path is not null and photo_path = id::text || '/photo.jpg' and thumbnail_path = id::text || '/thumbnail.jpg')
  )
);
create index wishes_status_created on public.wishes (status, created_at desc, id desc);
alter table public.wishes enable row level security;
revoke all on public.wishes from anon, authenticated;
grant select (id, name, city, country, message, status, photo_path, thumbnail_path, created_at, moderated_at)
  on public.wishes to anon, authenticated;
grant all on public.wishes to service_role;

create policy "Approved wishes or administrator" on public.wishes
for select to anon, authenticated
using (status = 'approved' or (select public.is_wall_admin()));

-- Solo el servidor puede reservar un envio. El lock evita superar la cuota
-- con peticiones simultaneas. No se guarda la IP, solo un HMAC no reversible.
create function public.reserve_wish_submission(p_fingerprint text, p_nonce uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_fingerprint is null or length(p_fingerprint) <> 64 or p_nonce is null then
    raise exception 'INVALID_RESERVATION';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_fingerprint, 0));
  delete from private.submission_attempts where created_at < now() - interval '2 days';
  if exists (select 1 from private.submission_attempts where nonce = p_nonce) then
    raise exception 'SUBMISSION_REPLAY';
  end if;
  if (select count(*) from private.submission_attempts
      where fingerprint = p_fingerprint and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'SUBMISSION_RATE_LIMIT';
  end if;
  insert into private.submission_attempts (nonce, fingerprint) values (p_nonce, p_fingerprint);
end;
$$;
revoke all on function public.reserve_wish_submission(text, uuid) from public, anon, authenticated;
grant execute on function public.reserve_wish_submission(text, uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wish-photos', 'wish-photos', false, 307200, array['image/jpeg']);
-- No se otorgan politicas a visitantes para storage.objects.
-- Solo las funciones del servidor suben archivos o generan URLs temporales.
