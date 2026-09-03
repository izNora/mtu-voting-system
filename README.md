# MTU Voting System — Connected React + FastAPI

This package contains the aligned FastAPI backend and React/Vite frontend.

## What was changed

- QR codes now open the React frontend route: `/qr-entry#<public_id>/<secret>`.
- React `/qr-entry` verifies credentials using `POST /api/voter/qr/verify`.
- The backend remains responsible for validating the QR and setting the HttpOnly voter session cookie.
- Frontend API calls now go through `src/lib/api.ts`, which supports the Vite proxy in development and `VITE_API_BASE_URL` in deployment.
- Backend CORS defaults are aligned with the frontend dev server on port `5174`.
- Organizer results redirect was corrected to `/admin/results`.
- Light/dark/system theme support was added with `next-themes` and a navbar toggle.
- Existing backend response-envelope compatibility is preserved: top-level response fields still work while `{ success, status, data }` remains available.

## Required software

- Python 3.11+ recommended
- Node.js 20+ recommended
- npm
- MySQL 8.x (or a compatible MySQL server)

## 1. Backend installation

```bash
cd backend
python -m venv .venv
```

Activate the environment:

Windows PowerShell:
```powershell
.\.venv\Scripts\Activate.ps1
```

Windows CMD:
```cmd
.venv\Scripts\activate.bat
```

macOS/Linux:
```bash
source .venv/bin/activate
```

Install Python libraries:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Create/configure `backend/.env`. Use `.env.example` as the safe template. Important local values are:

```env
BASE_URL=http://127.0.0.1:8000
FRONTEND_URL=http://127.0.0.1:5174
CORS_ORIGINS=http://localhost:5174,http://127.0.0.1:5174
COOKIE_SECURE=false
LOGIN_ATTEMPT_TIMEZONE=Asia/Yangon
```

Set your own MySQL password, `TOKEN_PEPPER`, `SESSION_SECRET`, and developer password.

Create the database:

```bash
mysql -u root -p < database.sql
```

Then seed it if this is a fresh database:

```bash
python seed.py
```

For an existing database created by an older package, do not re-import
`database.sql`. Apply the included login-attempt migration once instead:

```bash
mysql -u root -p voting_system < MIGRATION_LOGIN_ATTEMPTS_EMAIL_IP.sql
```

Run FastAPI:

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Backend API will be available at `http://127.0.0.1:8000`.

## 2. Frontend installation

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The Vite frontend runs on `http://127.0.0.1:5174` (also accessible through localhost). The Vite config proxies `/api` to the backend at `http://127.0.0.1:8000`, so for normal local development you do **not** need to set `VITE_API_BASE_URL`.

Frontend libraries are installed from `package.json`. Important ones include React 19, Vite 6, TypeScript, Tailwind CSS 4, Wouter, TanStack React Query, React Hook Form, Zod, Framer Motion, Lucide React, Radix UI, Recharts, Sonner, and `next-themes`.

Useful frontend commands:

```bash
npm run dev       # development server
npm run typecheck # TypeScript validation
npm run build     # production build
npm run serve     # preview production build
```

## 3. How frontend and backend connect

During local development the browser opens the frontend on port 5174. Calls such as `/api/admin/login` or `/api/voter/ballot` are sent to Vite, and Vite proxies them to FastAPI on port 8000. `credentials: "include"` is applied by the shared API helper so admin/voter cookies are included.

QR flow:

```text
Scan QR
  -> http://127.0.0.1:5174/qr-entry#PUBLIC_ID/SECRET
  -> React reads PUBLIC_ID + SECRET
  -> POST /api/voter/qr/verify
  -> FastAPI verifies token and voting status
  -> FastAPI sets HttpOnly voter cookie
  -> React redirects to /?voter_id=...
  -> voter opens /vote
  -> ballot/session APIs use the authenticated cookie
```

Do not put the POST request itself inside the QR code. The QR should contain only the frontend URL. The `/qr-entry` React page performs the POST request after it opens.

## 4. Production deployment

If frontend and backend are hosted on different origins, create `frontend/.env.production`:

```env
VITE_API_BASE_URL=https://api.example.com
```

Backend `.env` should then use the real frontend URL and CORS origin:

```env
BASE_URL=https://api.example.com
FRONTEND_URL=https://vote.example.com
CORS_ORIGINS=https://vote.example.com
COOKIE_SECURE=true
```

Regenerate QR codes after changing `FRONTEND_URL`, because previously generated QR images contain the old URL.

For cookie authentication, HTTPS is strongly recommended in production. If frontend and backend are deployed across different sites rather than subdomains/same-site origins, cookie `SameSite` policy may also need to be adjusted deliberately.

## 5. Troubleshooting

- QR opens backend instead of React: update `FRONTEND_URL` and regenerate the QR codes.
- CORS error: make sure the exact frontend origin is present in `CORS_ORIGINS`.
- Login succeeds but next API call is unauthorized: check browser cookies and ensure `credentials: include` is used (the shared API helper already does this).
- Every login is blocked after three failed checks for either its normalized email or client IP. A reverse proxy must be configured as trusted by Uvicorn so `Request.client.host` is the real, non-spoofable client address.
- Frontend cannot reach backend: confirm FastAPI is running on port 8000 and Vite on 5174.
- Candidate images fail: verify `PUBLIC_UPLOAD_BASE_URL` and the upload directory configuration.
- Database connection fails: verify the MySQL service, DB credentials, and that `database.sql` was imported.


## Voting rule updates

- The admin dashboard reads enveloped API array responses correctly and protects rendering from missing combination-member arrays.
- Every newly created major automatically receives: King, Queen, Smart, Style, Mr.Popular, and Ms.Popular. Existing majors are backfilled at backend startup.
- The reserved Whole target also owns the same six default titles.
- Candidate numbers are unique across genders inside the applicable major/combined-festival scope. A boy and a girl cannot share the same candidate number.
- Duplicate title names are rejected case-insensitively across the title-management scope, including combined majors.
- The voter welcome page requires a valid QR-created voter session, and the voting page continues to require the same QR session.
- The voter navigation no longer exposes an Admin link.
