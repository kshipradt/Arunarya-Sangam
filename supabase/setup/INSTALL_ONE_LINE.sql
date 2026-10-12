-- ARUNARYA Sangam · one-step install for a NEW, empty Supabase project.
-- Paste into Supabase → SQL Editor and press Run. Takes 1–3 minutes. Run only once.
create extension if not exists http with schema extensions;
do $$ begin execute (select content from extensions.http_get('https://raw.githubusercontent.com/kshipradt/Arunarya-Sangam/main/supabase/setup/full_install.sql')); end $$;
drop extension if exists http;
select (select count(*) from public.geo_countries) countries, (select count(*) from public.geo_states) states, (select count(*) from public.geo_cities) cities, (select count(*) from public.districts) districts;
