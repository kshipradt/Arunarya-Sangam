-- Phase 2 behaviour tests: verification, moderation, order steps, reviews,
-- complaints and search. Runs after behaviour.sql (reference data present).
\set ON_ERROR_STOP on

do $$
declare
  s uuid := gen_random_uuid(); b uuid := gen_random_uuid(); b2 uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  prod uuid; ord uuid; ord2 uuid; item uuid; n int; t_no text; t_id uuid; v record;
  addr jsonb := '{"name":"T","phone":"9999999999","line1":"1 Rd","city":"Saharanpur","state":"Uttar Pradesh","pincode":"247001"}';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (s, 's2@test.invalid', '{"role":"artisan","full_name":"Seller Two"}'),
    (b, 'b2@test.invalid', '{"role":"buyer","full_name":"Asha Buyer"}'),
    (b2, 'b3@test.invalid', '{"role":"buyer","full_name":"Other Buyer"}'),
    (adm, 'admin@test.invalid', '{"role":"buyer","full_name":"Admin"}');
  insert into public.staff (user_id, role) values (adm, 'admin');

  set local role authenticated;

  -- ---------- seller verification ----------
  perform set_config('request.jwt.claim.sub', s::text, true);
  begin
    insert into public.seller_verifications (profile_id, legal_name, business_address, customer_care_phone, status)
    values (s, 'Seller Two Crafts', '12 Khata Kheri, Saharanpur, UP', '+91 99999 88888', 'verified');
    raise exception 'FAIL seller verified themselves';
  exception when insufficient_privilege then null; end;
  insert into public.seller_verifications (profile_id, legal_name, business_address, customer_care_phone, gstin)
  values (s, 'Seller Two Crafts', '12 Khata Kheri, Saharanpur, UP', '+91 99999 88888', '09AAAPL1234C1ZV');
  begin
    perform public.admin_review_seller(s, true, null);
    raise exception 'FAIL non-staff approved a seller';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;

  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform public.admin_review_seller(s, true, 'Documents checked');
  if not (select verified from public.profiles where id = s) then raise exception 'FAIL approval did not verify profile'; end if;

  perform set_config('request.jwt.claim.sub', s::text, true);
  update public.seller_verifications set business_address = '14 Khata Kheri, Saharanpur, UP' where profile_id = s;
  select status into v from public.seller_verifications where profile_id = s;
  if v.status <> 'pending' or (select verified from public.profiles where id = s) then
    raise exception 'FAIL editing details did not send seller back for review';
  end if;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform public.admin_review_seller(s, true, null);

  -- ---------- products: sellers cannot set ratings or moderation ----------
  perform set_config('request.jwt.claim.sub', s::text, true);
  update public.profiles set country_id = 101, state_id = 4022, city_id = 133034, onboarding_complete = true,
         district_id = (select id from public.districts where slug = 'uttar-pradesh-saharanpur')
   where id = s;
  insert into public.shop_products (seller_id, title, price_inr, stock, image_urls, status, category)
    values (s, 'Sheesham jewellery box', 600, 4, array['a.jpg'], 'active', 'Woodcraft') returning id into prod;
  begin
    update public.shop_products set rating_count = 999 where id = prod;
    raise exception 'FAIL seller set their own rating';
  exception when insufficient_privilege then null; end;
  begin
    update public.shop_products set blocked = false where id = prod;
    raise exception 'FAIL seller touched moderation';
  exception when insufficient_privilege then null; end;

  -- ---------- search works for signed-out visitors ----------
  reset role;
  set local role anon;
  select count(*) into n from public.search_products('jewelery');   -- misspelt on purpose
  if n < 1 then raise exception 'FAIL fuzzy search found nothing'; end if;
  select count(*) into n from public.search_products(null, 4022);
  if n < 1 then raise exception 'FAIL state filter found nothing'; end if;
  reset role;
  set local role authenticated;

  -- moderation hides a product from the public
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform public.admin_set_product_block(prod, true, 'Photo does not match');
  reset role; set local role anon;
  select count(*) into n from public.search_products('jewellery');
  if n <> 0 then raise exception 'FAIL blocked product still searchable'; end if;
  reset role; set local role authenticated;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform public.admin_set_product_block(prod, false);

  -- ---------- order steps ----------
  perform set_config('request.jwt.claim.sub', b::text, true);
  insert into public.cart_items (user_id, product_id, qty) values (b, prod, 1);
  ord := public.place_order(addr, 'cod', null);
  select id into item from public.order_items where order_id = ord;

  begin
    perform public.submit_review(item, 5, 'Lovely', 'Beautiful work');
    raise exception 'FAIL review allowed before delivery';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;

  perform set_config('request.jwt.claim.sub', s::text, true);
  begin
    update public.order_items set status = 'delivered' where id = item;
    raise exception 'FAIL seller skipped straight to delivered';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  update public.order_items set status = 'confirmed' where id = item;
  update public.order_items set status = 'shipped' where id = item;
  if (select status from public.orders where id = ord) <> 'shipped' then raise exception 'FAIL order did not follow item'; end if;
  begin
    update public.order_items set status = 'cancelled' where id = item;
    raise exception 'FAIL shipped item was cancelled';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  update public.order_items set status = 'delivered' where id = item;
  if (select status from public.orders where id = ord) <> 'delivered' then raise exception 'FAIL order not delivered'; end if;

  -- ---------- reviews ----------
  perform set_config('request.jwt.claim.sub', b2::text, true);
  begin
    perform public.submit_review(item, 1, 'Fake', 'I never bought this');
    raise exception 'FAIL non-buyer reviewed';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform public.submit_review(item, 4, 'Lovely box', 'Fine carving, arrived safely');
  begin
    perform public.submit_review(item, 5, null, null);
    raise exception 'FAIL second review for the same purchase';
  exception when unique_violation then null; end;
  select rating_avg, rating_count into v from public.shop_products where id = prod;
  if v.rating_avg <> 4 or v.rating_count <> 1 then raise exception 'FAIL rating not updated: %', row_to_json(v); end if;

  -- ---------- cancellation restocks exactly once ----------
  select stock into n from public.shop_products where id = prod;   -- 3 after the first order
  insert into public.cart_items (user_id, product_id, qty) values (b, prod, 2);
  ord2 := public.place_order(addr, 'cod', null);
  perform public.cancel_order(ord2);
  if (select stock from public.shop_products where id = prod) <> n then
    raise exception 'FAIL cancel restock wrong: before %, after %', n, (select stock from public.shop_products where id = prod);
  end if;
  if (select status from public.orders where id = ord2) <> 'cancelled' then raise exception 'FAIL cancelled order status'; end if;

  -- ---------- complaints ----------
  t_no := public.open_ticket('delivery', 'Box arrived scratched', 'One corner is damaged.', ord);
  if t_no !~ '^SG-[0-9]+$' then raise exception 'FAIL ticket number %', t_no; end if;
  select id into t_id from public.tickets where ticket_no = t_no;
  perform set_config('request.jwt.claim.sub', b2::text, true);
  select count(*) into n from public.tickets where id = t_id;
  if n <> 0 then raise exception 'FAIL another buyer can see the complaint'; end if;
  begin
    perform public.open_ticket('order', 'Not my order', 'Trying to attach someone else''s order', ord);
    raise exception 'FAIL complaint attached to another buyer''s order';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  perform public.reply_ticket(t_id, 'Sorry about this. A replacement is on its way.', null);
  select status, acknowledged_at into v from public.tickets where id = t_id;
  if v.status <> 'acknowledged' or v.acknowledged_at is null then raise exception 'FAIL staff reply did not acknowledge'; end if;
  perform public.reply_ticket(t_id, 'Replacement delivered.', 'resolved');
  if (select resolved_at from public.tickets where id = t_id) is null then raise exception 'FAIL resolution time not stamped'; end if;

  -- ---------- admin-only controls ----------
  perform set_config('request.jwt.claim.sub', b::text, true);
  begin
    perform public.admin_set_setting('standing_discount_percent', 20);
    raise exception 'FAIL buyer changed the discount';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin
    perform * from public.admin_overview();
    raise exception 'FAIL buyer saw admin overview';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub', adm::text, true);
  select * into v from public.admin_overview();
  if v.live_products < 1 then raise exception 'FAIL admin overview counts'; end if;

  raise notice 'ALL PHASE 2 DATABASE CHECKS PASSED';
end $$;
