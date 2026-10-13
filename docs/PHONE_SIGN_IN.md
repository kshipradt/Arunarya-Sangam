# Sign-in by SMS code (phone OTP)

The app already contains the phone sign-in screen (`/auth/code`, "Mobile number" tab).
It stays switched off until an SMS provider is connected, then is turned on with
`PUBLIC_PHONE_SIGN_IN=true` in the hosting settings.

## What has to happen first (the operating company)

1. **DLT registration** (TRAI rule for all business SMS in India): register the company
   as a "principal entity" on one operator's DLT portal, get a sender ID (e.g. `ARNRYA`)
   and approve one OTP template, for example:
   `{#var#} is your ARUNARYA Sangam sign-in code. Do not share it with anyone. - ARUNARYA`
   The operator registration fee is typically about ₹5,000–7,000 one-time; templates and sender IDs are free.
2. **Choose an Indian SMS company** that handles DLT for you (MSG91, Authkey, SpringEdge, Textlocal…).
   Typical OTP price: about ₹0.13–0.20 per SMS. Some offer startup credit (Authkey: ₹2,500 free for verified startups).
3. **Connect it to Supabase**: either the built-in Textlocal provider
   (Authentication → Providers → Phone), or any Indian provider through Supabase's
   *Send SMS hook*, which Claude can write.

No central or state government scheme was found that gives free OTP SMS to private platforms
(checked October 2026). Startup credits from SMS companies are the realistic way to start free.

## Cheaper alternative: WhatsApp OTP

Meta's "authentication" messages cost roughly ₹0.11–0.13 each in India and do not use
the SMS DLT system. Many artisans use WhatsApp daily. Needs a WhatsApp Business account
for the company. Can be added through the same Send SMS hook.

## Cost example

1,000 active artisans signing in about 4 times a month ≈ 4,000 codes ≈ ₹600–800 a month.
Sessions last weeks, so most people do not need a new code each visit.
