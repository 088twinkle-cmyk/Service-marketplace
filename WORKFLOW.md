# Service Marketplace — Workflow & Project Layout

This repo follows the end-to-end flow from the project specification.

## Platform

| Layer | Stack |
|-------|--------|
| Mobile | React Native (Expo Router) — customer & provider in one app |
| API | Django REST + JWT |
| Admin | Django Admin (KYC approval, users, services) |

## Backend apps (`backend/`)

| Spec folder | Django app | Purpose |
|-------------|------------|---------|
| `accounts/` | `accounts/` | Register, WhatsApp OTP, login |
| `kyc/` | `kyc/` | Provider profile, KYC submit |
| `services/` | `marketplace/` | Service catalog |
| `portfolio/` | `portfolio/` | Provider portfolio items |
| `bookings/` | `bookings/` | Booking lifecycle |
| `chat/` | `chats/` | Chat rooms & messages |
| `notifications/` | `notifications/` | In-app / event notifications |
| `reviews/` | `reviews/` | Post-service reviews |
| `analytics/` | `analytics/` | Admin summary stats |
| `maps/` | `maps/` | Map search (placeholder) |
| `media/` | `media_app/` | Uploaded files |

### Main API paths

- `POST /api/auth/register/` → `POST /api/auth/whatsapp/verify-otp/` (shared customer + provider registration; see `WHATSAPP-OTP.md`)
- `POST /api/auth/whatsapp/send-otp/` — request/resume a WhatsApp OTP by phone number
- `POST /api/auth/otp/resend/` — resend a pending registration's OTP (cooldown applies)
- `POST /api/auth/login/` → `POST /api/auth/otp/request/` + `POST /api/auth/otp/verify/` (re-verification for unverified accounts)
- `POST /providers/profile/` — provider setup
- `POST /kyc/submit/` — KYC submission
- `GET/POST /services/` — services
- `GET/POST /bookings/` — bookings
- `GET /analytics/summary/` — admin metrics

## Frontend layout (`frontend/src/`)

```
src/
  screens/          # UI by role (auth, customer, provider, shared)
  navigation/       # routes.ts, workflow.ts (post-login routing)
  services/api/     # axios client + API modules
  components/       # Navbar, shared UI
  auth/             # session helpers
  utils/            # AsyncStorage keys
  theme/            # colors
app/                # expo-router thin re-exports → screens
```

## Customer flow

1. **Register** → **WhatsApp OTP verification** (shared flow) → signed in
2. **Choose services** (`/choose-services`)
3. **Dashboard** (`/home`) → Search → Book → Chat → Review

## Provider flow

1. **Register** → **WhatsApp OTP verification** (shared flow) → signed in
2. **Provider setup** (`/provider-onboarding`) → `POST /providers/profile/`
3. **KYC** (`/provider-kyc`) → `POST /kyc/submit/` (separate from phone verification)
4. **Admin approval** (Django Admin → approve KYC)
5. **Dashboard** (`/provider-home`) → Create service / portfolio / availability

## Booking flow (backend ready, UI placeholder)

Pending → Provider accept/reject → Chat → Service → Completion → Review

## Run locally

```bash
# Backend
cd backend
.\venv\Scripts\python.exe manage.py runserver 0.0.0.0:8001

# Frontend
cd frontend
npx expo start
```

Update `frontend/src/services/api/client.ts` `baseURL` to your machine IP.
