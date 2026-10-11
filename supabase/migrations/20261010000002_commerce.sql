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
