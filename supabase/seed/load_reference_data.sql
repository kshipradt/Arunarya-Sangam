-- ARUNARYA Sangam · reference data loader
-- Run ONCE in the Supabase SQL editor after the migrations. Takes about a minute.
--
-- Sources (both open):
--   * countries-states-cities-database by dr5hn (ODbL-1.0):
--     https://github.com/dr5hn/countries-states-cities-database
--     Attribution is shown in the app footer, as the licence requires.
--   * India's districts, scraped from the official igod.gov.in directory
--     (MIT): https://github.com/KTBsomen/Indian-state-district-json
--
-- Uses the `http` extension only for this load, then removes it again.

create extension if not exists http with schema extensions;
select extensions.http_set_curlopt('CURLOPT_TIMEOUT', '170');

-- Countries
with src as (
  select content::jsonb as j from extensions.http_get(
    'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries.json')
)
insert into public.geo_countries (id, iso2, iso3, name, native_name, phone_code, currency, emoji, region)
select (c->>'id')::int, c->>'iso2', c->>'iso3', c->>'name', c->>'native', c->>'phonecode', c->>'currency', c->>'emoji', c->>'region'
from src, jsonb_array_elements(src.j) c
on conflict (id) do update set name = excluded.name, iso2 = excluded.iso2;

-- States and regions
with src as (
  select content::jsonb as j from extensions.http_get(
    'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/states.json')
)
insert into public.geo_states (id, country_id, name, state_code, kind)
select (s->>'id')::int, (s->>'country_id')::int, s->>'name', s->>'state_code', s->>'type'
from src, jsonb_array_elements(src.j) s
where exists (select 1 from public.geo_countries gc where gc.id = (s->>'country_id')::int)
on conflict (id) do update set name = excluded.name;

-- Cities (one 53 MB file; staged in a temporary table)
create temporary table _geo_raw as
  select content from extensions.http_get(
    'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries%2Bstates%2Bcities.json');

insert into public.geo_cities (id, state_id, country_id, name, lat, lng)
select (ci->>'id')::int, (st->>'id')::int, (co->>'id')::int, ci->>'name',
       nullif(ci->>'latitude','')::double precision, nullif(ci->>'longitude','')::double precision
from _geo_raw r,
     jsonb_array_elements(r.content::jsonb) co,
     jsonb_array_elements(coalesce(co->'states','[]'::jsonb)) st,
     jsonb_array_elements(coalesce(st->'cities','[]'::jsonb)) ci
where exists (select 1 from public.geo_states gs where gs.id = (st->>'id')::int)
on conflict (id) do nothing;
drop table _geo_raw;

-- India's districts, linked to their state
with src as (
  select content::jsonb j from extensions.http_get(
    'https://raw.githubusercontent.com/KTBsomen/Indian-state-district-json/main/india-states-districts-latest.json')
), rows as (
  select s->>'state' as state, initcap(trim(d)) as district
  from src, jsonb_array_elements(src.j) s, jsonb_array_elements_text(s->'districts') d
)
insert into public.districts (name, state, slug)
select r.district, r.state,
       trim(both '-' from regexp_replace(lower(r.state || '-' || r.district), '[^a-z0-9]+', '-', 'g'))
from rows r
on conflict (name, state) do nothing;

update public.districts d set state_id = gs.id
from public.geo_states gs join public.geo_countries gc on gc.id = gs.country_id and gc.iso2 = 'IN'
where d.state_id is null and lower(gs.name) = lower(d.state);

-- District coordinates: a town of the same name, else the state's centre
update public.districts d set lat = c.lat, lng = c.lng, coord_source = 'city_match'
from (
  select distinct on (dd.id) dd.id did, gc.lat, gc.lng
  from public.districts dd
  join public.geo_cities gc on gc.state_id = dd.state_id
   and (lower(gc.name) = lower(dd.name)
        or lower(gc.name) = lower(regexp_replace(dd.name, '\s+(district|nagar)$', '', 'i'))
        or lower(dd.name) like lower(gc.name) || ' %'
        or lower(gc.name) like lower(dd.name) || ' %')
  where dd.lat is null and gc.lat is not null
  order by dd.id, (lower(gc.name) = lower(dd.name)) desc
) c
where d.id = c.did;

update public.districts d set lat = s.lat, lng = s.lng, coord_source = 'state_centre'
from (select state_id, avg(lat) lat, avg(lng) lng from public.geo_cities where lat is not null group by state_id) s
where d.lat is null and s.state_id = d.state_id;

drop extension if exists http;

select (select count(*) from public.geo_countries) countries,
       (select count(*) from public.geo_states) states,
       (select count(*) from public.geo_cities) cities,
       (select count(*) from public.districts) districts,
       (select count(*) from public.districts where state_id is null) districts_unmatched;
-- Expected on 2026-10-12: 250 countries, 5,328 states, 152,571 cities, 784 districts, 0 unmatched.
