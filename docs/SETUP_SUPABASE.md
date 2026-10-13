# Moving the database to ARUNARYA's own Supabase account

Time needed: about 20 minutes. Cost: free plan. Claude can do steps 3 onwards once given access.

## 1. Create the project (you)

1. Log in at https://supabase.com with the ARUNARYA account.
2. **New project** → organisation `ARUNARYA` → name `arunarya-sangam`.
3. Region: **South Asia (Mumbai)** (closest to most users; keeps data in India).
4. Create a strong database password and store it in a password manager. Do not share it in chat.
5. Wait about two minutes for the project to start.

## 2. Give Claude what it needs

From **Project Settings → API Keys**, copy the **Project URL** and the **publishable key** (starts `sb_publishable_`). Both are public by design and safe to paste.

Never paste the **secret key** or the **database password** into a chat.

## 3. Build the database

In **SQL Editor → New query**, paste and **Run** these two files, one after the other:

1. `supabase/setup/step1_build_database.sql`: all tables, security rules and functions (runs as one unit; if anything fails, nothing is half-made).
2. `supabase/setup/step2_load_data.sql`: world and India locations, ODOP districts, sample ODOP products, discounts and scheme guides. Takes 1–3 minutes. The last result should show about 250 countries, 5,328 states, 152,571 cities and 784 districts.

Both files are built from `supabase/migrations/` and `supabase/seed/`, and the same SQL is tested automatically (`scripts/test-db.sh`).

### Make yourself an administrator

After you have signed up in the app with your own email, run this once in a new query (change the email):

```sql
insert into public.staff (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com';
```

The **ARUNARYA console** then appears in your account menu.

## 4. Sign-in settings (Authentication)

| Setting | Where | Value |
| --- | --- | --- |
| Site URL | Authentication → URL Configuration | The live address, e.g. `https://sangam.arunarya.co.in` |
| Redirect URLs | same page | `https://sangam.arunarya.co.in/auth/callback` and `http://localhost:5173/auth/callback` |
| Confirm email | Authentication → Sign In / Providers → Email | On |
| Minimum password length | Authentication → Sign In / Providers → Email | 8 |
| Password requirements | same | Lowercase, uppercase, digits and symbols |
| Leaked password protection | same | Off for now (needs the Pro plan; the app blocks common passwords itself) |
| Bot protection | Authentication → Attack Protection | On, provider **Cloudflare Turnstile**, paste the Turnstile **secret** key |

### Sign-in codes by email

Authentication → Emails → **Magic Link** template: subject `Your ARUNARYA Sangam sign-in code`, body:

```html
<h2>Your ARUNARYA Sangam sign-in code</h2>
<p>Enter this code to sign in:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>If you didn't ask for this, you can ignore this email.</p>
```

Phone (SMS) codes: see `docs/PHONE_SIGN_IN.md`.

## 5. Cloudflare Turnstile keys (free)

1. https://dash.cloudflare.com → **Turnstile** → **Add widget**.
2. Name `ARUNARYA Sangam`, hostnames `sangam.arunarya.co.in` and `localhost`, mode **Managed**.
3. The **site key** goes in the app's `PUBLIC_TURNSTILE_SITE_KEY`.
4. The **secret key** goes only into Supabase (step 4). Never into the app or the repository.

## 6. Email sender (before launch)

Supabase's built-in email is limited to a few messages per hour and is for testing only. Before launch, connect a sending service under **Authentication → Emails → SMTP** (for example Resend or Amazon SES; both have free tiers). Claude will guide this when you are ready.
