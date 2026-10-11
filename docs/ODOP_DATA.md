# The national ODOP product list

The database holds all 784 Indian districts. The ODOP products for each district come from the Government's official list, which the data.gov.in site does not allow automated tools to download.

## Getting the file (one minute, in a browser)

1. Open https://www.data.gov.in/resource/one-district-one-product-list-description
2. Click **Download** → **CSV**. Fill the short form if asked (purpose: Non-commercial / Academic).
3. Attach the downloaded CSV in the chat with Claude.

## What happens next

Claude writes an import that:

- matches each row to a district by state and district name (reporting any that do not match, for a human to fix);
- inserts the products into `odop_products` with their category;
- records the source and download date, so the list can be refreshed when DPIIT updates it.

Until then, six sample products (Varanasi, Saharanpur, Firozabad, Bulandshahr, Moradabad, Madhubani) are loaded by `supabase/seed/seed_content.sql`.
