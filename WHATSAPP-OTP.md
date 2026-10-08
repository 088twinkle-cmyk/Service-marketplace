# WhatsApp OTP Verification

Registration (customer **and** provider) verifies the user's phone number
with a **one-time code delivered over WhatsApp**. One shared flow, one OTP
infrastructure.

```
Customer Registration ─┐
                       ├─> POST /api/auth/register/        (pending registration)
Provider Registration ─┘          │
                                  ▼
                       POST /api/auth/whatsapp/verify-otp/  (or otp/resend, whatsapp/send-otp)
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
             Customer Account            Provider Account
             → Customer home             → Provider onboarding → KYC
```

## Architecture (provider-agnostic)

```
Frontend (React Native / Expo + web)
        ↓
Django Auth API            backend/accounts/views.py
        ↓
Shared OTP Service         backend/accounts/otp.py
(generate / hash / expiry / attempts / cooldown / limits)
        ↓
WhatsAppOTPService         backend/whatsapp/service.py   (interface: send_otp(phone, otp))
        ↓
WhatsAppProvider           backend/whatsapp/providers/base.py
        ↓
WhatsAppCloudProvider      backend/whatsapp/providers/cloud.py   (the ONLY Meta-aware module)
        ↓
WhatsApp Business / Cloud API → user's WhatsApp
```

The authentication system depends only on `WhatsAppOTPService.send_otp(phone_number, otp)`.
Everything Meta-specific — endpoints, access tokens, Phone Number ID, Business
Account ID, template name/language, provider HTTP calls and provider error
payloads — lives inside `WhatsAppCloudProvider` and never appears in views,
serializers, models or frontend code. A different provider (local gateway,
aggregator) can be added by implementing `WhatsAppProvider` — no auth changes.

`DevelopmentWhatsAppProvider` (`providers/development.py`) is a clearly
labelled mock for local development and automated tests. It never contacts
Meta and reports `delivery: "simulated"` so the UI/API can say so honestly.
No automated test makes a real WhatsApp API call.

## Security properties

- Cryptographically secure 6-digit OTPs (`secrets.randbelow`).
- OTPs stored as keyed SHA-256 hashes — never in plaintext.
- OTP expiry (`OTP_EXPIRY_MINUTES`, default 10 min).
- Max wrong attempts per OTP (`OTP_MAX_ATTEMPTS`, default 5).
- Resend cooldown (`OTP_RESEND_COOLDOWN_SECONDS`, default 45 s).
- Max OTP requests per registration (`OTP_MAX_REQUESTS`, default 5) + DRF
  scope throttling (`THROTTLE_OTP`, default 5/min per IP on
  register / send-otp / otp/request / otp/resend).
- Single-use: a verified OTP is invalidated immediately; resending
  invalidates the previous code and resets attempts.
- Pending registrations expire (`PENDING_REGISTRATION_TTL_MINUTES`, 30 min).
- Password stored as a Django hash in the pending registration; the account
  is created only after verification.
- Phone numbers normalised to E.164 (Nepal → `+977…`) before delivery.
- `whatsapp/send-otp` is enumeration-safe (same response whether or not a
  number has a pending registration).
- Provider errors are sanitised — raw Meta responses only go to server logs.
- `debug_otp` is returned only while `OTP_DEBUG_RETURN` (DEBUG builds);
  production responses never contain the code, and OTPs are never logged.

## Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/auth/register/` | – | Validate + store pending registration, send WhatsApp OTP. Returns `registration_id` (202). No account exists yet. |
| `POST /api/auth/whatsapp/send-otp/` | – | `{phone_number}` → resume/resend a pending registration's OTP (also recovers a lost `registration_id` after a refresh). |
| `POST /api/auth/otp/resend/` | – | `{registration_id}` → new OTP (cooldown + limits enforced). |
| `POST /api/auth/whatsapp/verify-otp/` | – | `{registration_id, otp}` → verifies server-side, creates the account with the locked-in role, returns JWTs. |
| `POST /api/auth/otp/request/` | JWT | WhatsApp OTP for a signed-in unverified user (login re-verification). |
| `POST /api/auth/otp/verify/` | JWT | Verify that code; marks the account verified. |

The verify request can never change the role or any account attribute —
everything comes from the pending registration, and the role is captured at
register time. Provider KYC is **not** bypassed: phone verification and KYC
stay separate.

## Environment variables (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` (git-ignored) and fill in the
Meta values. **Never commit real credentials** — `backend/.env` is ignored
by Git (`.gitignore` contains `.env`); `.env.example` keeps empty
placeholders.

```env
# Delivery is disabled by default until real credentials exist.
WHATSAPP_OTP_ENABLED=false
# auto (default) | cloud (force real Cloud API) | development (force the mock)
WHATSAPP_PROVIDER=auto

WHATSAPP_API_BASE_URL=https://graph.facebook.com
WHATSAPP_API_VERSION=v21.0
WHATSAPP_ACCESS_TOKEN=            # secret — never commit
WHATSAPP_PHONE_NUMBER_ID=         # Meta "Phone Number ID"
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_OTP_TEMPLATE_NAME=       # approved template, e.g. otp_verification
WHATSAPP_OTP_TEMPLATE_LANGUAGE=en_US

# Public business/verification number users receive messages from
# (display info, not a credential):
WHATSAPP_VERIFICATION_NUMBER=9843677123

# OTP policy
OTP_EXPIRY_MINUTES=10
OTP_RESEND_COOLDOWN_SECONDS=45
OTP_MAX_ATTEMPTS=5
OTP_MAX_REQUESTS=5
PENDING_REGISTRATION_TTL_MINUTES=30
PHONE_DEFAULT_COUNTRY_CODE=+977
```

### Provider selection (`WHATSAPP_PROVIDER=auto`)

| State | Result |
|-------|--------|
| `WHATSAPP_OTP_ENABLED=true` + all required values | Real Cloud API delivery |
| `WHATSAPP_OTP_ENABLED=true` + **any** value missing (DEBUG or not) | **503 `whatsapp_not_configured`** — enabling real delivery never silently downgrades to the simulated provider |
| `WHATSAPP_OTP_ENABLED=false` (default), `DEBUG` | Development provider (simulated, clearly labelled) |
| `WHATSAPP_OTP_ENABLED=false` (default), production | 503 `whatsapp_not_configured` |
| `WHATSAPP_PROVIDER=cloud`, values missing | 503 `whatsapp_not_configured` |
| `WHATSAPP_PROVIDER=development` (forced) | Simulated (logs a warning outside DEBUG) |

## Required Meta credentials

| `backend/.env` variable | What it is | Where to get it |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | **Secret.** System-user access token with the `whatsapp_business_messaging` permission (permanent). Backend only — never in React/Expo code, frontend `.env`, or Git. | <https://developers.facebook.com> → your app → **Business settings → System users** → *Generate access token* → tick `whatsapp_business_messaging` |
| `WHATSAPP_PHONE_NUMBER_ID` | The "Phone number ID" of the sending number. Meta's messages endpoint is keyed on it: `POST /v21.0/{phone-number-id}/messages`. | App dashboard → **WhatsApp → API Setup** → "Phone number ID" |
| `WHATSAPP_OTP_TEMPLATE_NAME` | Name of the **approved** message template. Meta requires a template for business-initiated messages (outside the 24-hour customer window), so the OTP is always sent as a template message with the code as the `{{1}}` body parameter — never a free-form text. | **WhatsApp Manager → Message templates** → create an *Authentication* template (or a Utility template with one body param, e.g. `{{1}} is your Service Marketplace verification code. It expires in 10 minutes.`) → wait for **APPROVED** |
| `WHATSAPP_OTP_TEMPLATE_LANGUAGE` | Language of that template; must match exactly what Meta shows (`en_US`, `en`, `ne`, …). | Same template's language field |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp Business Account ID — **optional for sending** (needed only for management APIs); `whatsapp_status` reports it as optional. | App dashboard → WhatsApp → API Setup |
| `WHATSAPP_VERIFICATION_NUMBER` | The public business/sending number shown to users (`whatsapp_number` in API responses). Display info, not a credential. The actual sender on the wire is the Meta-registered number behind `WHATSAPP_PHONE_NUMBER_ID`. | Your business number (default `9843677123`, shown as `+977 9843677123`) |

## Enabling real WhatsApp delivery

1. Create an app at <https://developers.facebook.com> → add the *WhatsApp*
   product.
2. Collect the values from the table above.
3. Create the OTP template in WhatsApp Manager and wait for **approval**.
4. Fill the `WHATSAPP_*` values in `backend/.env` (NOT `.env.example`) and
   set `WHATSAPP_OTP_ENABLED=true`.
5. Restart Django, then check readiness:

   ```bash
   python manage.py whatsapp_status
   ```

   The command prints setting **names** and set/unset state only — values
   (especially the access token) are never printed, so its output is safe to
   paste into a ticket or chat. While `WHATSAPP_OTP_ENABLED=true` and a
   required value is missing, Django also raises a startup **system check
   warning** (`accounts.W001`) naming the missing settings, and every OTP
   request answers HTTP 503 `whatsapp_not_configured`.
6. Verify end to end: register with your own phone number, confirm the
   WhatsApp message arrives from the registered business number, then
   complete the OTP.

The destination of every OTP is the **user's own phone number**; the
business number above is only the sender.

## Tests

```bash
# Backend — the Meta API is fully mocked; tests never send real messages
cd backend
python manage.py test tests

# Configuration readiness (names only, values never printed)
python manage.py whatsapp_status

# Frontend
cd frontend
npm test
```

The automated tests cover (with `requests.post` mocked or the development
provider): the Cloud API request being a **template message** (configured
name, language, OTP as the `{{1}}` body parameter) to
`POST {base}/{version}/{phone-number-id}/messages` with the token as a
Bearer header; each required credential being individually required
(missing any one → 503 `whatsapp_not_configured`); `WHATSAPP_OTP_ENABLED=true`
never falling back to the simulated provider; provider failures mapping to
a sanitised `whatsapp_unavailable` 503 with raw Meta errors kept in server
logs only; and `whatsapp_status` / the system check never printing values.
