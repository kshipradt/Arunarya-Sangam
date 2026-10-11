-- ARUNARYA Sangam · starting content
-- Run after load_reference_data.sql. Safe to run more than once.

insert into public.platform_settings (key, value, note) values
 ('standing_discount_percent', 5, 'Automatic platform-funded discount on every ARUNARYA Sangam order'),
 ('max_total_discount_percent', 30, 'Cap on standing discount plus coupon combined'),
 ('free_shipping_threshold_inr', 499, 'Free delivery at or above this payable subtotal'),
 ('flat_shipping_fee_inr', 49, 'Delivery fee below the threshold')
on conflict (key) do nothing;

insert into public.coupons (code, percent_off, max_discount_inr, min_order_inr, note) values
 ('SANGAM10', 10, 300, 999, 'Welcome offer: extra 10% on orders of Rs 999 and above'),
 ('DISTRICT5', 5, 150, 499, 'Extra 5% for supporting a district craft')
on conflict (code) do nothing;

-- Sample ODOP products for six districts. The full national list is imported
-- from the official DPIIT dataset (see docs/ODOP_DATA.md).
insert into public.odop_products (district_id, name, category, description)
select d.id, v.name, v.category, v.description from (values
 ('Varanasi','Uttar Pradesh','Banarasi Silk','Textiles','Handwoven silk brocade with zari work'),
 ('Saharanpur','Uttar Pradesh','Wood Carving','Woodcraft','Hand-carved furniture and decor in sheesham wood'),
 ('Firozabad','Uttar Pradesh','Glass & Bangles','Glassware','Glass bangles, decor and chandeliers'),
 ('Bulandshahr','Uttar Pradesh','Khurja Pottery','Ceramics','Glazed ceramic tableware and tiles'),
 ('Moradabad','Uttar Pradesh','Brassware','Metalcraft','Cast and engraved brass decor and utility ware'),
 ('Madhubani','Bihar','Madhubani Painting','Folk Art','Mithila folk paintings on paper, cloth and walls')
) as v(district, state, name, category, description)
join public.districts d on lower(d.name) = lower(v.district) and lower(d.state) = lower(v.state)
on conflict (district_id, name) do nothing;

insert into public.scheme_guides (slug, title, audience, summary, steps, official_url, last_verified, sort_order) values
('odop-overview', 'What is ODOP?', 'all',
 'One District One Product picks one signature product per district to promote local industries, artisans, jobs and exports. At national level it is anchored by DPIIT; Uttar Pradesh runs its own programme with several support schemes.',
 '["Find your district''s identified ODOP product","Check whether your craft or unit produces that product","Register on the official portal for your state before applying to any scheme","Confirm every detail on the official portal, as terms change"]'::jsonb,
 'https://odopup.in', '2026-10-10', 10),
('up-training-toolkit', 'Training and Toolkit Scheme (Uttar Pradesh)', 'artisan',
 'Skill-based training and free advanced toolkits for artisans associated with ODOP products in Uttar Pradesh, to raise productivity, quality and income. Registration on the official portal is required.',
 '["Confirm you work on your district''s ODOP product","Register on the official ODOP UP portal as a seller or artisan","Apply for training and toolkit under the scheme","Keep your registration details handy for your Sangam seller profile"]'::jsonb,
 'https://odopup.in/odop-schemes/training-and-toolkit-scheme-uttar-pradesh', '2026-10-10', 20),
('up-margin-money', 'ODOP Margin Money Scheme (Uttar Pradesh)', 'business_owner',
 'Financial assistance for units producing the ODOP product of their district. For projects up to Rs 25 lakh, margin money is 25% of project cost, capped at Rs 6.25 lakh. Higher project sizes have different slabs. Loans are processed through banks.',
 '["Check that your unit produces the ODOP product of your district","Prepare a project report and cost estimate","Apply through the official UP MSME portal","Loan is approved and disbursed through the bank after application","Verify current slabs and rules on the official page before applying"]'::jsonb,
 'https://msme1connect.up.gov.in/GovernmentScheme/GovernmentScheme638769672699910844.pdf', '2026-10-10', 30),
('up-marketing-assistance', 'Marketing Development Assistance (Uttar Pradesh)', 'all',
 'Financial support for artisans, weavers, entrepreneurs and MSMEs of ODOP products to market through fairs, exhibitions and e-commerce platforms, open to all 75 districts. Wrong information can lead to rejection or recovery of benefits.',
 '["Check eligibility for your ODOP product and district","Register on the official ODOP UP portal","Apply with accurate details and supporting documents","Keep invoices from fairs and platforms such as Sangam for your records"]'::jsonb,
 'https://odopup.in/odop-schemes/marketing-development-assistance-scheme-uttar-pradesh', '2026-10-10', 40),
('gi-tag-basics', 'GI tag: proving where your craft comes from', 'artisan',
 'A Geographical Indication tag certifies the origin and quality of a product from a particular region. If your craft holds a GI tag, mark it on your Sangam listing so buyers can see it.',
 '["Check whether your craft already has a GI registration","If yes, switch on the GI tag option when you list a product","Mention your craft group or registration in the description"]'::jsonb,
 null, '2026-10-10', 50),
('buyer-why-odop', 'Why buy ODOP products', 'buyer',
 'Every purchase goes to a maker in the district the craft comes from. On ARUNARYA Sangam every order also gets an automatic platform discount, with extra coupons from time to time.',
 '["Browse by district to meet the maker behind each craft","Look for the GI badge where a craft is certified","Apply a coupon in your cart for extra savings"]'::jsonb,
 null, '2026-10-10', 60)
on conflict (slug) do nothing;
