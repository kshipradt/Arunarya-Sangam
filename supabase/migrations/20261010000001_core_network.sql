-- ARUNARYA Sangam · 0001 · Core network
-- Roles, districts, ODOP products, profiles, private contacts, listings,
-- connections, the bi-directional matching engine, and row-level security.

create type public.user_role as enum ('buyer','business_owner','artisan','trader');
create type public.listing_kind as enum ('offer','need');
create type public.connection_status as enum ('pending','accepted','declined');

create table public.districts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text not null,
  slug text not null unique,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  unique (name, state)
);

create table public.odop_products (
  id uuid primary key default gen_random_uuid(),
  district_id uuid not null references public.districts(id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (district_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'buyer',
  full_name text not null default '',
  business_name text,
  bio text,
  district_id uuid references public.districts(id),
  pincode text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  lat double precision,
  lng double precision,
  verified boolean not null default false,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Phone numbers live apart from profiles: visible only after both sides accept a connection.
create table public.profile_contacts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  phone text,
  whatsapp text,
  updated_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.odop_products(id) on delete cascade,
  kind public.listing_kind not null,
  quantity_note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (profile_id, product_id, kind)
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status public.connection_status not null default 'pending',
  message text check (message is null or char_length(message) <= 500),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> recipient_id),
  unique (requester_id, recipient_id)
);

create index idx_profiles_district on public.profiles(district_id);
create index idx_profiles_role on public.profiles(role);
create index idx_odop_products_district on public.odop_products(district_id);
create index idx_listings_product_kind on public.listings(product_id, kind) where active;
create index idx_listings_profile on public.listings(profile_id);
create index idx_connections_recipient on public.connections(recipient_id, status);
create index idx_connections_requester on public.connections(requester_id, status);

-- ===== helpers =====
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable parallel safe set search_path = public as $$
  select case when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
  else 6371 * 2 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))) end
$$;

create or replace function public.are_connected(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and ((c.requester_id = a and c.recipient_id = b) or (c.requester_id = b and c.recipient_id = a)))
$$;
revoke execute on function public.are_connected(uuid, uuid) from public, anon;
grant execute on function public.are_connected(uuid, uuid) to authenticated;

create or replace function public.stamp_connection_response() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then new.responded_at = now(); end if;
  return new;
end $$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_contacts_updated before update on public.profile_contacts
  for each row execute function public.set_updated_at();
create trigger trg_connections_response before update on public.connections
  for each row execute function public.stamp_connection_response();

-- ===== row level security =====
alter table public.districts enable row level security;
alter table public.odop_products enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.listings enable row level security;
alter table public.connections enable row level security;

create policy "districts readable by all" on public.districts for select to anon, authenticated using (true);
create policy "products readable by all" on public.odop_products for select to anon, authenticated using (true);

create policy "profiles readable by members" on public.profiles for select to authenticated using (true);
create policy "profiles insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "contacts visible to owner or connected" on public.profile_contacts for select to authenticated
  using (profile_id = auth.uid() or public.are_connected(auth.uid(), profile_id));
create policy "contacts insert own" on public.profile_contacts for insert to authenticated with check (profile_id = auth.uid());
create policy "contacts update own" on public.profile_contacts for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "contacts delete own" on public.profile_contacts for delete to authenticated using (profile_id = auth.uid());

create policy "listings readable" on public.listings for select to authenticated using (active or profile_id = auth.uid());
create policy "listings insert own" on public.listings for insert to authenticated with check (profile_id = auth.uid());
create policy "listings update own" on public.listings for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "listings delete own" on public.listings for delete to authenticated using (profile_id = auth.uid());

create policy "connections visible to parties" on public.connections for select to authenticated
  using (requester_id = auth.uid() or recipient_id = auth.uid());
create policy "connections request as self" on public.connections for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending');
create policy "connections respond as recipient" on public.connections for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy "connections withdraw pending" on public.connections for delete to authenticated
  using (requester_id = auth.uid() and status = 'pending');

-- ===== least-privilege grants =====
revoke all on public.profiles, public.profile_contacts, public.listings, public.connections from anon;
revoke update on public.connections from authenticated;
grant update (status) on public.connections to authenticated;
revoke insert, update, delete on public.districts, public.odop_products from anon, authenticated;
