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
| `WHATSAPP_OTP_ENABLED=true` + full credentials | Real Cloud API delivery |
| `WHATSAPP_OTP_ENABLED=true`, no credentials, `DEBUG` | Development provider (simulated) |
| `WHATSAPP_OTP_ENABLED=true`, no credentials, production | 503 `whatsapp_not_configured` — the server never pretends an OTP was sent |
| `WHATSAPP_OTP_ENABLED=false` (default), `DEBUG` | Development provider (simulated) |
| `WHATSAPP_OTP_ENABLED=false` (default), production | 503 `whatsapp_not_configured` |

## Enabling real WhatsApp delivery

1. Create an app at <https://developers.facebook.com> → add the *WhatsApp*
   product → note the **Phone Number ID** and **WhatsApp Business Account ID**.
2. Create a system user and generate a permanent **access token**.
3. In the WhatsApp Business Manager create an **authentication/OTP template**
   with a body parameter for the code, e.g.
   `{{1}} is your Service Marketplace verification code. It expires in 10 minutes.`
   Get it approved.
4. Fill the `WHATSAPP_*` values in `backend/.env` and set
   `WHATSAPP_OTP_ENABLED=true`.
5. Restart Django. Registration now delivers real WhatsApp OTPs from the
   configured business number (+977 9843677123 by default).

The destination of every OTP is the **user's own phone number**; the
business number above is only the sender.

## Tests

```bash
# Backend (WhatsApp provider mocked/development — no real API calls)
cd backend
python manage.py test tests

# Frontend
cd frontend
npm test
```
