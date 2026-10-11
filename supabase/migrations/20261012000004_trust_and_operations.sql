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
