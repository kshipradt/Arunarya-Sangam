-- ARUNARYA Sangam · STEP 1 of 2: build the database
-- Paste this whole file into Supabase → SQL Editor → New query, then press Run.
-- It runs as one unit: if anything fails, nothing is half-made. Run it only once on a fresh project.
begin;

-- ===== 20261010000001_core_network.sql =====
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

-- ===== 20261010000002_commerce.sql =====
-- ARUNARYA Sangam · 0002 · Commerce
-- Seller products, cart, server-side pricing with the standing ARUNARYA
-- discount and coupons, orders, advertising, scheme guides, product images.
-- Every price and total is computed in the database, never in the browser.

create type public.product_status as enum ('draft','active','paused');
create type public.order_status as enum ('placed','confirmed','shipped','delivered','cancelled');
create type public.payment_method as enum ('cod','upi','netbanking','card');
create type public.payment_status as enum ('pending','paid','failed','refunded');
create type public.ad_placement as enum ('home_banner','district_spotlight','featured_product');
create type public.ad_status as enum ('pending_review','active','paused','ended','rejected');

create table public.platform_settings (
  key text primary key,
  value numeric not null,
  note text
);

create table public.shop_products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  seller_name text not null default '',
  odop_product_id uuid references public.odop_products(id),
  district_id uuid references public.districts(id),
  title text not null check (char_length(title) between 3 and 120),
  description text check (description is null or char_length(description) <= 2000),
  price_inr numeric(12,2) not null check (price_inr > 0),
  mrp_inr numeric(12,2) check (mrp_inr is null or mrp_inr >= price_inr),
  stock int not null default 0 check (stock >= 0),
  unit text not null default 'piece',
  image_urls text[] not null default '{}',
  gi_tagged boolean not null default false,
  status public.product_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_shop_products_status_district on public.shop_products(status, district_id);
create index idx_shop_products_seller on public.shop_products(seller_id);
create index idx_shop_products_odop on public.shop_products(odop_product_id);

create table public.cart_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.shop_products(id) on delete cascade,
  qty int not null check (qty between 1 and 20),
  added_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.coupons (
  code text primary key check (code = upper(code)),
  percent_off numeric not null check (percent_off between 1 and 50),
  max_discount_inr numeric check (max_discount_inr is null or max_discount_inr > 0),
  min_order_inr numeric not null default 0,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit int,
  used_count int not null default 0,
  note text
);

-- buyer_id / seller_id become NULL when an account is deleted: records are kept for accounting.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references public.profiles(id) on delete set null,
  status public.order_status not null default 'placed',
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'pending',
  subtotal_inr numeric(12,2) not null,
  standing_discount_inr numeric(12,2) not null default 0,
  coupon_code text,
  coupon_discount_inr numeric(12,2) not null default 0,
  shipping_inr numeric(12,2) not null default 0,
  total_inr numeric(12,2) not null,
  address jsonb not null,
  gateway_order_id text,
  created_at timestamptz not null default now()
);
create index idx_orders_buyer on public.orders(buyer_id, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.shop_products(id) on delete set null,
  seller_id uuid references public.profiles(id) on delete set null,
  title text not null,
  unit_price_inr numeric(12,2) not null,
  qty int not null check (qty > 0),
  status public.order_status not null default 'placed'
);
create index idx_order_items_order on public.order_items(order_id);
create index idx_order_items_seller on public.order_items(seller_id, status);

create table public.ad_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  business text check (business is null or char_length(business) <= 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  phone text check (phone is null or char_length(phone) <= 20),
  budget_range text check (budget_range is null or char_length(budget_range) <= 60),
  message text check (message is null or char_length(message) <= 1000),
  created_at timestamptz not null default now()
);

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  creative_text text check (creative_text is null or char_length(creative_text) <= 200),
  image_url text,
  placement public.ad_placement not null,
  district_id uuid references public.districts(id),
  product_id uuid references public.shop_products(id) on delete set null,
  daily_budget_inr numeric(12,2) not null check (daily_budget_inr > 0),
  starts_on date not null,
  ends_on date not null,
  status public.ad_status not null default 'pending_review',
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index idx_ad_campaigns_active on public.ad_campaigns(status, placement, starts_on, ends_on);

create table public.scheme_guides (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  audience text not null check (audience in ('artisan','trader','business_owner','buyer','all')),
  summary text not null,
  steps jsonb not null default '[]'::jsonb,
  official_url text,
  last_verified date,
  sort_order int not null default 100
);

-- ===== helpers =====
create or replace function public.is_seller(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_uid and role in ('artisan','business_owner','trader'))
$$;
create or replace function public.is_order_buyer(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders where id = p_order and buyer_id = auth.uid())
$$;
create or replace function public.is_order_seller(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.order_items where order_id = p_order and seller_id = auth.uid())
$$;
revoke execute on function public.is_seller(uuid), public.is_order_buyer(uuid), public.is_order_seller(uuid) from public, anon;
grant execute on function public.is_seller(uuid), public.is_order_buyer(uuid), public.is_order_seller(uuid) to authenticated;

create or replace function public.shop_products_prepare() returns trigger
language plpgsql set search_path = public as $$
declare pr record;
begin
  select coalesce(nullif(business_name,''), nullif(full_name,''), 'Sangam seller') as nm, district_id as did
    into pr from public.profiles where id = new.seller_id;
  new.seller_name := coalesce(pr.nm, 'Sangam seller');
  if new.district_id is null then new.district_id := pr.did; end if;
  if new.status = 'active' and coalesce(cardinality(new.image_urls), 0) = 0 then
    raise exception 'Add at least one photo before publishing a product';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_shop_products_prepare before insert or update on public.shop_products
  for each row execute function public.shop_products_prepare();

-- ===== pricing engine =====
create or replace function public.compute_quote(p_uid uuid, p_coupon text)
returns table (subtotal numeric, standing_discount numeric, coupon_discount numeric, shipping numeric, total numeric, coupon_ok boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  sub numeric; sd numeric; cd numeric := 0; ship numeric;
  stand_pct numeric; maxpct numeric; thr numeric; fee numeric; cap numeric;
  c record; ok boolean := false;
begin
  select coalesce(sum(p.price_inr * ci.qty), 0) into sub
    from public.cart_items ci join public.shop_products p on p.id = ci.product_id and p.status = 'active'
    where ci.user_id = p_uid;
  select coalesce((select value from public.platform_settings where key = 'standing_discount_percent'), 0) into stand_pct;
  select coalesce((select value from public.platform_settings where key = 'max_total_discount_percent'), 30) into maxpct;
  select coalesce((select value from public.platform_settings where key = 'free_shipping_threshold_inr'), 499) into thr;
  select coalesce((select value from public.platform_settings where key = 'flat_shipping_fee_inr'), 49) into fee;
  sd := round(sub * stand_pct / 100, 2);
  if p_coupon is not null and length(p_coupon) > 0 then
    select * into c from public.coupons
      where code = upper(trim(p_coupon)) and active
        and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())
        and (usage_limit is null or used_count < usage_limit) and sub >= min_order_inr;
    if found then
      ok := true;
      cd := round(sub * c.percent_off / 100, 2);
      if c.max_discount_inr is not null then cd := least(cd, c.max_discount_inr); end if;
    end if;
  end if;
  cap := round(sub * maxpct / 100, 2);
  if sd + cd > cap then cd := greatest(cap - sd, 0); sd := least(sd, cap); end if;
  ship := case when sub = 0 then 0 when (sub - sd - cd) >= thr then 0 else fee end;
  return query select sub, sd, cd, ship, (sub - sd - cd + ship), ok;
end $$;
revoke execute on function public.compute_quote(uuid, text) from public, anon, authenticated;

create or replace function public.quote_cart(p_coupon text default null)
returns table (subtotal numeric, standing_discount numeric, coupon_discount numeric, shipping numeric, total numeric, coupon_ok boolean)
language sql stable security definer set search_path = public as $$
  select * from public.compute_quote(auth.uid(), nullif(upper(trim(coalesce(p_coupon, ''))), ''))
$$;

create or replace function public.place_order(p_address jsonb, p_method public.payment_method, p_coupon text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_code text; q record; v_order uuid; bad int;
begin
  if v_uid is null then raise exception 'Please sign in to place an order'; end if;
  if p_address is null or coalesce(p_address->>'name','') = '' or coalesce(p_address->>'phone','') = ''
     or coalesce(p_address->>'line1','') = '' or coalesce(p_address->>'city','') = ''
     or coalesce(p_address->>'state','') = '' or coalesce(p_address->>'pincode','') !~ '^[1-9][0-9]{5}$' then
    raise exception 'Please complete the delivery address';
  end if;
  if not exists (select 1 from public.cart_items where user_id = v_uid) then raise exception 'Your cart is empty'; end if;
  perform 1 from public.shop_products p join public.cart_items ci on ci.product_id = p.id where ci.user_id = v_uid for update of p;
  select count(*) into bad from public.cart_items ci left join public.shop_products p on p.id = ci.product_id
    where ci.user_id = v_uid and (p.id is null or p.status <> 'active' or p.stock < ci.qty or p.seller_id = v_uid);
  if bad > 0 then raise exception 'Some items are unavailable, out of stock, or your own listing'; end if;
  v_code := nullif(upper(trim(coalesce(p_coupon, ''))), '');
  select * into q from public.compute_quote(v_uid, v_code);
  if v_code is not null and not q.coupon_ok then raise exception 'That coupon is not valid for this cart'; end if;
  insert into public.orders (buyer_id, payment_method, payment_status, subtotal_inr, standing_discount_inr,
                             coupon_code, coupon_discount_inr, shipping_inr, total_inr, address)
  values (v_uid, p_method, 'pending', q.subtotal, q.standing_discount, case when q.coupon_ok then v_code end,
          q.coupon_discount, q.shipping, q.total, p_address)
  returning id into v_order;
  insert into public.order_items (order_id, product_id, seller_id, title, unit_price_inr, qty)
    select v_order, p.id, p.seller_id, p.title, p.price_inr, ci.qty
    from public.cart_items ci join public.shop_products p on p.id = ci.product_id where ci.user_id = v_uid;
  update public.shop_products p set stock = p.stock - ci.qty
    from public.cart_items ci where ci.product_id = p.id and ci.user_id = v_uid;
  if q.coupon_ok then
    update public.coupons set used_count = used_count + 1 where code = v_code;
  end if;
  delete from public.cart_items where user_id = v_uid;
  return v_order;
end $$;

create or replace function public.cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.orders where id = p_order and buyer_id = auth.uid() and status = 'placed') then
    raise exception 'This order can no longer be cancelled';
  end if;
  update public.shop_products p set stock = p.stock + oi.qty
    from public.order_items oi where oi.order_id = p_order and oi.product_id = p.id;
  update public.order_items set status = 'cancelled' where order_id = p_order;
  update public.orders set status = 'cancelled' where id = p_order;
end $$;

revoke execute on function public.quote_cart(text), public.place_order(jsonb, public.payment_method, text), public.cancel_order(uuid) from public, anon;
grant execute on function public.quote_cart(text), public.place_order(jsonb, public.payment_method, text), public.cancel_order(uuid) to authenticated;

-- ===== row level security =====
alter table public.platform_settings enable row level security;
alter table public.shop_products enable row level security;
alter table public.cart_items enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.ad_inquiries enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.scheme_guides enable row level security;

create policy "settings readable" on public.platform_settings for select to anon, authenticated using (true);
create policy "guides readable" on public.scheme_guides for select to anon, authenticated using (true);

create policy "active products public" on public.shop_products for select to anon, authenticated
  using (status = 'active' or seller_id = auth.uid());
create policy "sellers add products" on public.shop_products for insert to authenticated
  with check (seller_id = auth.uid() and public.is_seller(auth.uid()));
create policy "sellers edit own products" on public.shop_products for update to authenticated
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create policy "sellers delete own products" on public.shop_products for delete to authenticated
  using (seller_id = auth.uid());

create policy "cart select own" on public.cart_items for select to authenticated using (user_id = auth.uid());
create policy "cart insert own" on public.cart_items for insert to authenticated with check (user_id = auth.uid());
create policy "cart update own" on public.cart_items for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cart delete own" on public.cart_items for delete to authenticated using (user_id = auth.uid());

create policy "orders visible to buyer or seller" on public.orders for select to authenticated
  using (buyer_id = auth.uid() or public.is_order_seller(id));
create policy "order items visible to parties" on public.order_items for select to authenticated
  using (seller_id = auth.uid() or public.is_order_buyer(order_id));
create policy "sellers progress own items" on public.order_items for update to authenticated
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());

create policy "anyone can enquire about advertising" on public.ad_inquiries for insert to anon, authenticated with check (true);

create policy "active ads public, own ads private" on public.ad_campaigns for select to anon, authenticated
  using ((status = 'active' and current_date between starts_on and ends_on) or advertiser_id = auth.uid());
create policy "members book ads for review" on public.ad_campaigns for insert to authenticated
  with check (advertiser_id = auth.uid() and status = 'pending_review');
create policy "advertisers edit creative" on public.ad_campaigns for update to authenticated
  using (advertiser_id = auth.uid()) with check (advertiser_id = auth.uid());

-- ===== least-privilege grants =====
revoke all on public.coupons from anon, authenticated;
revoke all on public.cart_items, public.orders, public.order_items, public.ad_inquiries, public.ad_campaigns from anon;
revoke insert, update, delete on public.platform_settings, public.scheme_guides from anon, authenticated;
revoke insert, update, delete on public.orders, public.order_items from authenticated;
grant update (status) on public.order_items to authenticated;
revoke select on public.ad_inquiries from authenticated;
grant insert on public.ad_inquiries to anon, authenticated;
revoke update on public.ad_campaigns from authenticated;
grant update (title, creative_text, image_url) on public.ad_campaigns to authenticated;
revoke insert, update, delete on public.shop_products from anon;

-- ===== product image storage (Supabase Storage) =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "product images public read" on storage.objects for select
  using (bucket_id = 'product-images');
create policy "sellers upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sellers update own images" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sellers delete own images" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===== 20261012000003_world_locations_and_profiles.sql =====
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

-- ===== 20261012000004_trust_and_operations.sql =====
-- ARUNARYA Sangam · 0004 · Trust and operations
-- Staff (admin console), seller verification, product moderation, order
-- status rules, verified-purchase reviews, grievance tickets with the
-- Consumer Protection (E-Commerce) Rules timers, and catalogue search.

-- ===================== staff =====================
-- Rows are added by the owner in the Supabase SQL editor only; there is no
-- API path to make yourself staff.
create table public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','support')),
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;
revoke all on public.staff from anon, authenticated;

create or replace function public.is_staff(p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = p_uid)
$$;
create or replace function public.is_admin(p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = p_uid and role = 'admin')
$$;
-- Callable by visitors too: row-level policies on public tables use it, and
-- for a signed-out visitor it simply answers false.
revoke execute on function public.is_staff(uuid), public.is_admin(uuid) from public;
grant execute on function public.is_staff(uuid), public.is_admin(uuid) to anon, authenticated;

create policy "staff see own staff row" on public.staff for select to authenticated using (user_id = auth.uid());
grant select on public.staff to authenticated;

-- ===================== seller verification =====================
-- What the e-commerce rules require us to show for every seller, plus GSTIN
-- for tax collection at source. Bank and identity documents are collected by
-- the payment gateway (Phase 3), never stored here.
create type public.verification_status as enum ('pending','verified','rejected');

create table public.seller_verifications (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  legal_name text not null check (char_length(legal_name) between 2 and 160),
  business_address text not null check (char_length(business_address) between 10 and 400),
  pincode text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  customer_care_phone text not null check (customer_care_phone ~ '^\+?[0-9 -]{8,16}$'),
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  status public.verification_status not null default 'pending',
  review_note text,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);
alter table public.seller_verifications enable row level security;

create policy "seller sees own verification" on public.seller_verifications for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());
create policy "seller submits own verification" on public.seller_verifications for insert to authenticated
  with check (profile_id = auth.uid() and public.is_seller(auth.uid()) and status = 'pending');
create policy "seller edits own verification" on public.seller_verifications for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
revoke all on public.seller_verifications from anon;
revoke update on public.seller_verifications from authenticated;
grant update (legal_name, business_address, pincode, customer_care_phone, gstin) on public.seller_verifications to authenticated;

-- Editing details after a decision sends them back for review.
create or replace function public.seller_verification_reset() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    new.status := 'pending';
    new.submitted_at := now();
    new.reviewed_by := null;
    new.reviewed_at := null;
    update public.profiles set verified = false where id = new.profile_id and verified;
  end if;
  return new;
end $$;
create trigger trg_seller_verification_reset before update on public.seller_verifications
  for each row execute function public.seller_verification_reset();

-- Public, rule-required seller details shown on product pages (only once verified).
create or replace function public.seller_public_details(p_seller uuid)
returns table (legal_name text, business_address text, customer_care_phone text, verified boolean)
language sql stable security definer set search_path = public as $$
  select v.legal_name, v.business_address, v.customer_care_phone, true
  from public.seller_verifications v where v.profile_id = p_seller and v.status = 'verified'
$$;
grant execute on function public.seller_public_details(uuid) to anon, authenticated;

create or replace function public.admin_review_seller(p_profile uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only ARUNARYA staff can review sellers'; end if;
  update public.seller_verifications
     set status = case when p_approve then 'verified'::public.verification_status else 'rejected' end,
         review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   where profile_id = p_profile;
  if not found then raise exception 'No verification request for this seller'; end if;
  update public.profiles set verified = p_approve where id = p_profile;
end $$;
revoke execute on function public.admin_review_seller(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_seller(uuid, boolean, text) to authenticated;

-- ===================== product moderation and safer editing =====================
alter table public.shop_products
  add column blocked boolean not null default false,
  add column blocked_reason text,
  add column category text,
  add column country_of_origin text not null default 'India',
  add column rating_avg numeric(3,2),
  add column rating_count int not null default 0;

create extension if not exists pg_trgm with schema extensions;
create index idx_shop_products_title_trgm on public.shop_products using gin (title extensions.gin_trgm_ops);

drop policy "active products public" on public.shop_products;
create policy "live products public" on public.shop_products for select to anon, authenticated
  using ((status = 'active' and not blocked) or seller_id = auth.uid() or public.is_staff());

-- Sellers may change only these columns; ratings and moderation are not theirs to set.
revoke update on public.shop_products from authenticated;
grant update (odop_product_id, district_id, title, description, price_inr, mrp_inr, stock, unit,
              image_urls, gi_tagged, status, category, country_of_origin)
  on public.shop_products to authenticated;

create or replace function public.admin_set_product_block(p_product uuid, p_blocked boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only ARUNARYA staff can moderate products'; end if;
  update public.shop_products set blocked = p_blocked, blocked_reason = case when p_blocked then p_reason end
   where id = p_product;
end $$;
revoke execute on function public.admin_set_product_block(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_product_block(uuid, boolean, text) to authenticated;

-- ===================== order status rules =====================
-- Sellers move items forward: placed → confirmed → shipped → delivered.
-- They may cancel only before shipping. The order follows its items.
create or replace function public.order_item_status_guard() returns trigger
language plpgsql set search_path = public as $$
declare rank_old int; rank_new int;
begin
  if new.status = old.status then return new; end if;
  if public.is_staff() then return new; end if;
  rank_old := array_position(array['placed','confirmed','shipped','delivered']::text[], old.status::text);
  rank_new := array_position(array['placed','confirmed','shipped','delivered']::text[], new.status::text);
  if old.status in ('delivered','cancelled') then
    raise exception 'This item is already %', old.status;
  end if;
  if new.status = 'cancelled' then
    if old.status = 'shipped' then raise exception 'A shipped item cannot be cancelled'; end if;
    update public.shop_products set stock = stock + old.qty where id = old.product_id;
  elsif rank_new is null or rank_new <> rank_old + 1 then
    raise exception 'Order status can only move one step forward';
  end if;
  return new;
end $$;
create trigger trg_order_item_status before update of status on public.order_items
  for each row execute function public.order_item_status_guard();

create or replace function public.order_status_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.order_status;
begin
  select case
    when bool_and(status = 'cancelled') then 'cancelled'
    when bool_and(status in ('delivered','cancelled')) then 'delivered'
    when bool_or(status = 'shipped') or bool_or(status = 'delivered') then 'shipped'
    when bool_and(status in ('confirmed','cancelled')) then 'confirmed'
    else 'placed' end::public.order_status
  into s from public.order_items where order_id = new.order_id;
  update public.orders set status = s where id = new.order_id and status is distinct from s;
  return null;
end $$;
create trigger trg_order_status_sync after update of status on public.order_items
  for each row execute function public.order_status_sync();

-- Buyer cancellation: restocking now happens in the item trigger, once per item.
create or replace function public.cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.orders where id = p_order and buyer_id = auth.uid() and status = 'placed') then
    raise exception 'This order can no longer be cancelled';
  end if;
  update public.order_items set status = 'cancelled' where order_id = p_order and status = 'placed';
end $$;

-- ===================== verified-purchase reviews =====================
create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.shop_products(id) on delete cascade,
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  buyer_id uuid references public.profiles(id) on delete set null,
  buyer_name text not null default '',
  rating int not null check (rating between 1 and 5),
  title text check (title is null or char_length(title) <= 120),
  body text check (body is null or char_length(body) <= 2000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_reviews_product on public.product_reviews(product_id, created_at desc) where not hidden;
alter table public.product_reviews enable row level security;
create policy "visible reviews public" on public.product_reviews for select to anon, authenticated
  using (not hidden or buyer_id = auth.uid() or public.is_staff());
revoke insert, update, delete on public.product_reviews from anon, authenticated;

-- Only the buyer of a delivered item can review it, once.
create or replace function public.submit_review(p_order_item uuid, p_rating int, p_title text default null, p_body text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare it record; v_id uuid; v_name text;
begin
  select oi.id, oi.product_id, oi.status, o.buyer_id into it
    from public.order_items oi join public.orders o on o.id = oi.order_id
   where oi.id = p_order_item;
  if it.id is null or it.buyer_id is distinct from auth.uid() then raise exception 'You can only review items you bought'; end if;
  if it.status <> 'delivered' then raise exception 'You can review an item after it is delivered'; end if;
  if it.product_id is null then raise exception 'This product is no longer listed'; end if;
  select coalesce(nullif(split_part(full_name, ' ', 1), ''), 'Buyer') into v_name from public.profiles where id = auth.uid();
  insert into public.product_reviews (product_id, order_item_id, buyer_id, buyer_name, rating, title, body)
  values (it.product_id, p_order_item, auth.uid(), v_name, p_rating, nullif(trim(p_title), ''), nullif(trim(p_body), ''))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.submit_review(uuid, int, text, text) from public, anon;
grant execute on function public.submit_review(uuid, int, text, text) to authenticated;

create or replace function public.admin_hide_review(p_review uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only ARUNARYA staff can moderate reviews'; end if;
  update public.product_reviews set hidden = p_hidden where id = p_review;
end $$;
revoke execute on function public.admin_hide_review(uuid, boolean) from public, anon;
grant execute on function public.admin_hide_review(uuid, boolean) to authenticated;

create or replace function public.refresh_product_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  update public.shop_products p set
    rating_avg = (select round(avg(rating)::numeric, 2) from public.product_reviews where product_id = pid and not hidden),
    rating_count = (select count(*) from public.product_reviews where product_id = pid and not hidden)
  where p.id = pid;
  return null;
end $$;
create trigger trg_reviews_rating after insert or update or delete on public.product_reviews
  for each row execute function public.refresh_product_rating();

-- ===================== grievance tickets =====================
-- Consumer Protection (E-Commerce) Rules, 2020: acknowledge within 48 hours,
-- resolve within one month. Due times are stored so the admin queue can
-- show what is late.
create type public.ticket_status as enum ('open','acknowledged','resolved','closed');
create sequence public.ticket_number_seq start 1001;

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique default ('SG-' || nextval('public.ticket_number_seq')),
  created_by uuid references public.profiles(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  category text not null check (category in ('order','delivery','refund','product','seller','account','other')),
  subject text not null check (char_length(subject) between 4 and 140),
  status public.ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  ack_due_at timestamptz not null default now() + interval '48 hours',
  resolve_due_at timestamptz not null default now() + interval '30 days',
  acknowledged_at timestamptz,
  resolved_at timestamptz
);
create index idx_tickets_status on public.tickets(status, created_at);

create table public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  from_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index idx_ticket_messages on public.ticket_messages(ticket_id, created_at);

alter table public.tickets enable row level security;
alter table public.ticket_messages enable row level security;
create policy "ticket owner or staff" on public.tickets for select to authenticated
  using (created_by = auth.uid() or public.is_staff());
create policy "ticket messages owner or staff" on public.ticket_messages for select to authenticated
  using (public.is_staff() or exists (select 1 from public.tickets t where t.id = ticket_id and t.created_by = auth.uid()));
revoke all on public.tickets, public.ticket_messages from anon;
revoke insert, update, delete on public.tickets, public.ticket_messages from authenticated;

create or replace function public.open_ticket(p_category text, p_subject text, p_body text, p_order uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if auth.uid() is null then raise exception 'Please log in to raise a complaint'; end if;
  if p_order is not null and not exists (
       select 1 from public.orders o where o.id = p_order and (o.buyer_id = auth.uid() or public.is_order_seller(o.id))) then
    raise exception 'That order is not yours';
  end if;
  insert into public.tickets (created_by, order_id, category, subject)
  values (auth.uid(), p_order, p_category, trim(p_subject)) returning * into t;
  insert into public.ticket_messages (ticket_id, author_id, body) values (t.id, auth.uid(), trim(p_body));
  return t.ticket_no;
end $$;

create or replace function public.reply_ticket(p_ticket uuid, p_body text, p_status public.ticket_status default null)
returns void language plpgsql security definer set search_path = public as $$
declare t record; staff boolean := public.is_staff();
begin
  select * into t from public.tickets where id = p_ticket;
  if t.id is null or (t.created_by is distinct from auth.uid() and not staff) then raise exception 'Ticket not found'; end if;
  if t.status = 'closed' and not staff then raise exception 'This complaint is closed. Please open a new one.'; end if;
  insert into public.ticket_messages (ticket_id, author_id, from_staff, body) values (p_ticket, auth.uid(), staff, trim(p_body));
  if staff then
    update public.tickets set
      status = coalesce(p_status, case when status = 'open' then 'acknowledged'::public.ticket_status else status end),
      acknowledged_at = coalesce(acknowledged_at, now()),
      resolved_at = case when coalesce(p_status, status) in ('resolved','closed') then coalesce(resolved_at, now()) else resolved_at end
    where id = p_ticket;
  elsif t.status = 'resolved' then
    update public.tickets set status = 'open', resolved_at = null where id = p_ticket;  -- buyer reopened
  end if;
end $$;
revoke execute on function public.open_ticket(text, text, text, uuid), public.reply_ticket(uuid, text, public.ticket_status) from public, anon;
grant execute on function public.open_ticket(text, text, text, uuid), public.reply_ticket(uuid, text, public.ticket_status) to authenticated;

-- ===================== staff visibility for the admin console =====================
create policy "staff see all orders" on public.orders for select to authenticated using (public.is_staff());
create policy "staff see all order items" on public.order_items for select to authenticated using (public.is_staff());
create policy "staff see ad inquiries" on public.ad_inquiries for select to authenticated using (public.is_staff());
grant select on public.ad_inquiries to authenticated;
create policy "staff see campaigns" on public.ad_campaigns for select to authenticated using (public.is_staff());

create or replace function public.admin_set_campaign_status(p_campaign uuid, p_status public.ad_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an ARUNARYA admin can change campaigns'; end if;
  update public.ad_campaigns set status = p_status where id = p_campaign;
end $$;
create or replace function public.admin_set_setting(p_key text, p_value numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Only an ARUNARYA admin can change settings'; end if;
  if p_key = 'standing_discount_percent' and (p_value < 0 or p_value > 25) then raise exception 'Standing discount must be 0 to 25%%'; end if;
  update public.platform_settings set value = p_value where key = p_key;
  if not found then raise exception 'Unknown setting %', p_key; end if;
end $$;
revoke execute on function public.admin_set_campaign_status(uuid, public.ad_status), public.admin_set_setting(text, numeric) from public, anon;
grant execute on function public.admin_set_campaign_status(uuid, public.ad_status), public.admin_set_setting(text, numeric) to authenticated;

-- One call for the admin dashboard tiles.
create or replace function public.admin_overview()
returns table (pending_sellers bigint, open_tickets bigint, late_tickets bigint, orders_today bigint, gmv_30d numeric, live_products bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only ARUNARYA staff'; end if;
  return query select
    (select count(*) from public.seller_verifications where status = 'pending'),
    (select count(*) from public.tickets where status in ('open','acknowledged')),
    (select count(*) from public.tickets where (status = 'open' and ack_due_at < now()) or (status in ('open','acknowledged') and resolve_due_at < now())),
    (select count(*) from public.orders where created_at >= date_trunc('day', now())),
    (select coalesce(sum(total_inr), 0) from public.orders where status <> 'cancelled' and created_at >= now() - interval '30 days'),
    (select count(*) from public.shop_products where status = 'active' and not blocked);
end $$;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

create or replace function public.seller_is_verified(p_seller uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select verified from public.profiles where id = p_seller), false)
$$;
grant execute on function public.seller_is_verified(uuid) to anon, authenticated;

-- ===================== catalogue search =====================
-- One call returns a page of live products with their district, state and rating.
create or replace function public.search_products(
  p_query text default null, p_state int default null, p_district uuid default null,
  p_category text default null, p_min numeric default null, p_max numeric default null,
  p_gi boolean default false, p_sort text default 'relevance', p_limit int default 24, p_offset int default 0)
returns table (
  id uuid, title text, price_inr numeric, mrp_inr numeric, image_url text, gi_tagged boolean,
  stock int, seller_id uuid, seller_name text, seller_verified boolean, district_name text, state_name text,
  category text, rating_avg numeric, rating_count int, total_count bigint)
language sql stable security invoker set search_path = public, extensions as $$
  with q as (select nullif(trim(p_query), '') as text)
  select p.id, p.title, p.price_inr, p.mrp_inr, p.image_urls[1], p.gi_tagged, p.stock, p.seller_id, p.seller_name,
         public.seller_is_verified(p.seller_id), d.name, d.state, coalesce(p.category, op.category), p.rating_avg, p.rating_count,
         count(*) over ()
  from public.shop_products p
  cross join q
  left join public.districts d on d.id = p.district_id
  left join public.odop_products op on op.id = p.odop_product_id
  where p.status = 'active' and not p.blocked
    and (q.text is null or p.title ilike '%' || q.text || '%' or p.title % q.text
         or op.name ilike '%' || q.text || '%' or d.name ilike '%' || q.text || '%')
    and (p_state is null or d.state_id = p_state)
    and (p_district is null or p.district_id = p_district)
    and (p_category is null or coalesce(p.category, op.category) = p_category)
    and (p_min is null or p.price_inr >= p_min)
    and (p_max is null or p.price_inr <= p_max)
    and (not coalesce(p_gi, false) or p.gi_tagged)
  order by
    case when p_sort = 'price_asc' then p.price_inr end asc,
    case when p_sort = 'price_desc' then p.price_inr end desc,
    case when p_sort = 'rating' then p.rating_avg end desc nulls last,
    case when p_sort = 'relevance' and q.text is not null then similarity(p.title, q.text) end desc,
    p.created_at desc
  limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0)
$$;
grant execute on function public.search_products(text, int, uuid, text, numeric, numeric, boolean, text, int, int) to anon, authenticated;

commit;
select 'Step 1 done: database built' as result;
