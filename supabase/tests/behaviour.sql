-- Behaviour tests for the database rules. Each block raises an exception
-- when a rule is broken, so a clean run means every check passed.
\set ON_ERROR_STOP on

-- Minimal reference data
insert into public.geo_countries (id, iso2, name) values (101, 'IN', 'India'), (233, 'US', 'United States');
insert into public.geo_states (id, country_id, name) values (4022, 101, 'Uttar Pradesh'), (1452, 233, 'New York');
insert into public.geo_cities (id, state_id, country_id, name, lat, lng)
  values (133034, 4022, 101, 'Saharanpur', 29.968, 77.551), (1, 1452, 233, 'New York City', 40.71, -74.0);
insert into public.districts (name, state, slug, state_id, lat, lng)
  values ('Saharanpur', 'Uttar Pradesh', 'uttar-pradesh-saharanpur', 4022, 29.968, 77.551);
\i supabase/seed/seed_content.sql

do $$
declare
  s uuid := gen_random_uuid(); b uuid := gen_random_uuid(); prod uuid; ord uuid; n int; p record;
  addr jsonb := '{"name":"T","phone":"9999999999","line1":"1 Rd","city":"Saharanpur","state":"Uttar Pradesh","pincode":"247001"}';
  q record;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (s, 's@test.invalid', '{"role":"artisan","full_name":"Seller","preferred_language":"ta"}'),
    (b, 'b@test.invalid', '{"role":"buyer","full_name":"Buyer"}');

  select * into p from public.profiles where id = s;
  if p.role <> 'artisan' or p.preferred_language <> 'ta' then raise exception 'FAIL signup trigger: %', row_to_json(p); end if;

  set local role authenticated;

  -- Seller location rules
  perform set_config('request.jwt.claim.sub', s::text, true);
  begin
    update public.profiles set country_id = 101, onboarding_complete = true where id = s;
    raise exception 'FAIL seller in India saved without state and city';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  update public.profiles set country_id = 101, state_id = 4022, city_id = 133034, onboarding_complete = true where id = s;
  select * into p from public.profiles where id = s;
  if p.city_name <> 'Saharanpur' or p.lat is null then raise exception 'FAIL city did not set name and coordinates'; end if;
  begin
    update public.profiles set verified = true where id = s;
    raise exception 'FAIL user could mark themselves verified';
  exception when insufficient_privilege then null; end;

  -- Seller lists a product; a buyer cannot
  insert into public.shop_products (seller_id, title, price_inr, stock, image_urls, status)
    values (s, 'Carved box', 1000, 5, array['x.jpg'], 'active') returning id into prod;
  perform set_config('request.jwt.claim.sub', b::text, true);
  begin
    insert into public.shop_products (seller_id, title, price_inr, stock) values (b, 'Sneaky', 10, 1);
    raise exception 'FAIL buyer could list a product';
  exception when insufficient_privilege then null; end;

  -- Pricing is computed on the server: 2 x 1000, 5% standing, SANGAM10 (10%), free delivery
  insert into public.cart_items (user_id, product_id, qty) values (b, prod, 2);
  select * into q from public.quote_cart('SANGAM10');
  if (q.subtotal, q.standing_discount, q.coupon_discount, q.shipping, q.total) <> (2000::numeric, 100::numeric, 200::numeric, 0::numeric, 1700::numeric)
    then raise exception 'FAIL quote %', row_to_json(q); end if;

  ord := public.place_order(addr, 'cod', 'SANGAM10');
  select stock into n from public.shop_products where id = prod;
  if n <> 3 then raise exception 'FAIL stock after order = %', n; end if;

  begin
    insert into public.orders (buyer_id, payment_method, subtotal_inr, total_inr, address) values (b, 'cod', 1, 1, addr);
    raise exception 'FAIL buyer inserted an order directly';
  exception when insufficient_privilege then null; end;

  update public.shop_products set price_inr = 1 where id = prod;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL buyer changed a seller price'; end if;

  begin
    perform count(*) from public.coupons;
    raise exception 'FAIL coupons are readable';
  exception when insufficient_privilege then null; end;

  perform public.cancel_order(ord);
  select stock into n from public.shop_products where id = prod;
  if n <> 5 then raise exception 'FAIL cancel did not restock (stock %)', n; end if;

  reset role;

  -- Account deletion keeps orders without personal links
  delete from auth.users where id = b;
  select count(*) into n from public.orders where id = ord and buyer_id is null;
  if n <> 1 then raise exception 'FAIL order not kept after buyer deletion'; end if;

  raise notice 'ALL DATABASE BEHAVIOUR CHECKS PASSED';
end $$;

-- Every public table must have row-level security switched on.
do $$
declare missing text;
begin
  select string_agg(c.relname, ', ') into missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if missing is not null then raise exception 'FAIL tables without RLS: %', missing; end if;
  raise notice 'RLS ON FOR EVERY TABLE';
end $$;
