-- ARUNARYA Sangam · 0003 · Worldwide locations, language preference, sign-up
-- Countries, states/regions and cities for the whole world; India's districts
-- linked to their states; location and language on every profile, with the
-- rules for each role enforced in the database.
--
-- Reference data (250 countries, 5,328 regions, 152,571 cities, 784 districts)
-- is loaded by supabase/seed/load_reference_data.sql, not by this migration.

create extension if not exists pg_trgm with schema extensions;

create table public.geo_countries (
  id int primary key,
  iso2 char(2) not null unique,
  iso3 char(3),
  name text not null,
  native_name text,
  phone_code text,
  currency text,
  emoji text,
  region text
);

create table public.geo_states (
  id int primary key,
  country_id int not null references public.geo_countries(id) on delete cascade,
  name text not null,
  state_code text,
  kind text
);
create index idx_geo_states_country on public.geo_states(country_id, name);

create table public.geo_cities (
  id int primary key,
  state_id int not null references public.geo_states(id) on delete cascade,
  country_id int not null references public.geo_countries(id) on delete cascade,
  name text not null,
  lat double precision,
  lng double precision
);
create index idx_geo_cities_state_name on public.geo_cities(state_id, name);
create index idx_geo_cities_name_trgm on public.geo_cities using gin (name extensions.gin_trgm_ops);

alter table public.geo_countries enable row level security;
alter table public.geo_states enable row level security;
alter table public.geo_cities enable row level security;
create policy "countries readable" on public.geo_countries for select to anon, authenticated using (true);
create policy "states readable" on public.geo_states for select to anon, authenticated using (true);
create policy "cities readable" on public.geo_cities for select to anon, authenticated using (true);
revoke insert, update, delete on public.geo_countries, public.geo_states, public.geo_cities from anon, authenticated;

-- India's districts belong to a state; coordinates come from a matching town
-- ('city_match') or, failing that, the state's centre ('state_centre').
alter table public.districts add column state_id int references public.geo_states(id);
alter table public.districts add column coord_source text;
create index idx_districts_state on public.districts(state_id, name);

alter table public.profiles
  add column country_id int references public.geo_countries(id),
  add column state_id int references public.geo_states(id),
  add column city_id int references public.geo_cities(id),
  add column city_name text check (city_name is null or char_length(city_name) <= 100),
  add column preferred_language text not null default 'en'
    check (preferred_language in ('en','hi','bn','mr','te','ta','gu','ur','kn','or','ml','pa','as'));

-- Location rules (mirrored in src/lib/domain/location.ts for instant feedback):
--  * the state must belong to the country, and the city to the state
--  * an ODOP district can only be chosen inside India
--  * on completing onboarding: everyone needs a country; sellers in India need
--    state and city; buyers need a state when their country has any
create or replace function public.profiles_location_guard() returns trigger
language plpgsql set search_path = public as $$
declare v_india int; c record;
begin
  select id into v_india from public.geo_countries where iso2 = 'IN';
  if new.state_id is not null and not exists (
       select 1 from public.geo_states where id = new.state_id and country_id = new.country_id) then
    raise exception 'The selected state does not belong to the selected country';
  end if;
  if new.city_id is not null then
    select * into c from public.geo_cities where id = new.city_id;
    if c.state_id is distinct from new.state_id then
      raise exception 'The selected city does not belong to the selected state';
    end if;
    new.lat := c.lat; new.lng := c.lng; new.city_name := c.name;
  end if;
  if new.district_id is not null and new.country_id is distinct from v_india then
    raise exception 'An ODOP district can only be chosen for a location in India';
  end if;
  if new.onboarding_complete then
    if new.country_id is null then raise exception 'Please choose your country'; end if;
    if new.role in ('artisan','trader','business_owner') and new.country_id = v_india
       and (new.state_id is null or (new.city_id is null and coalesce(new.city_name,'') = '')) then
      raise exception 'Sellers in India must choose their state and city';
    end if;
    if new.role = 'buyer' and new.state_id is null
       and exists (select 1 from public.geo_states where country_id = new.country_id) then
      raise exception 'Please choose your state or region';
    end if;
  end if;
  return new;
end $$;

create trigger trg_profiles_location before insert or update on public.profiles
  for each row execute function public.profiles_location_guard();

-- People may change only these columns about themselves (never verified, lat/lng, ids).
revoke update on public.profiles from authenticated;
grant update (role, full_name, business_name, bio, district_id, pincode, onboarding_complete,
              country_id, state_id, city_id, city_name, preferred_language)
  on public.profiles to authenticated;

-- A profile row is created on sign-up, carrying role, name and chosen language.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.user_role; lang text;
begin
  begin r := (new.raw_user_meta_data->>'role')::public.user_role;
  exception when others then r := 'buyer'; end;
  if r is null then r := 'buyer'; end if;
  lang := coalesce(new.raw_user_meta_data->>'preferred_language', 'en');
  if lang not in ('en','hi','bn','mr','te','ta','gu','ur','kn','or','ml','pa','as') then lang := 'en'; end if;
  insert into public.profiles (id, role, full_name, preferred_language)
  values (new.id, r, left(coalesce(new.raw_user_meta_data->>'full_name', ''), 120), lang)
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Bi-directional matching: my offers meet others' needs (and the reverse) for
-- the same ODOP product, same district first, then nearest by distance.
create or replace function public.find_matches(p_limit int default 20)
returns table (
  m_profile_id uuid, m_full_name text, m_business_name text, m_role public.user_role,
  m_district text, m_product text, m_their_kind public.listing_kind,
  m_same_district boolean, m_distance_km numeric)
language sql stable security invoker set search_path = public as $$
  with me as (
    select p.id, p.district_id, coalesce(p.lat, d.lat) as lat, coalesce(p.lng, d.lng) as lng
    from public.profiles p left join public.districts d on d.id = p.district_id
    where p.id = auth.uid()
  )
  select o.id, o.full_name, o.business_name, o.role, coalesce(od.name, o.city_name), pr.name, l2.kind,
         (me.district_id is not null and o.district_id = me.district_id),
         round(public.haversine_km(me.lat, me.lng, coalesce(o.lat, od.lat), coalesce(o.lng, od.lng))::numeric, 1)
  from me
  join public.listings l1 on l1.profile_id = me.id and l1.active
  join public.listings l2 on l2.product_id = l1.product_id and l2.active and l2.profile_id <> me.id
       and l2.kind = case l1.kind when 'offer' then 'need'::public.listing_kind else 'offer'::public.listing_kind end
  join public.profiles o on o.id = l2.profile_id
  left join public.districts od on od.id = o.district_id
  join public.odop_products pr on pr.id = l1.product_id
  order by 8 desc, 9 asc nulls last
  limit least(greatest(p_limit, 1), 50)
$$;
revoke execute on function public.find_matches(int) from public, anon;
grant execute on function public.find_matches(int) to authenticated;
