-- Permitir mensajes sin ciudad o pais. Ejecutar tambien en proyectos ya creados.
-- La ubicacion ausente se guarda como texto vacio para conservar el formato de la API.
begin;

alter table public.wishes
  drop constraint if exists wishes_city_check,
  drop constraint if exists wishes_country_check;

alter table public.wishes
  alter column city set default '',
  alter column country set default '',
  add constraint wishes_city_check check (char_length(btrim(city)) between 0 and 80),
  add constraint wishes_country_check check (char_length(btrim(country)) between 0 and 80);

commit;
