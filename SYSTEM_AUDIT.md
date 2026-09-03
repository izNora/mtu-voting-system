# System Audit — 2026-09-01

## Changes made in this audit

1. Whole voter welcome label now renders exactly **The Whole Welcome**.
2. Combined-festival create/edit names must be nonblank.
3. Combined-festival edit requests now validate every selected major server-side.
4. Final acceptance revalidates combined membership while major rows are locked, preventing one major from being accepted into multiple combined festivals through overlapping/racing requests.
5. The remaining browser `prompt()` on combination rejection was replaced by an in-app Confirm/Cancel rejection dialog.
6. API documentation was rewritten to match the current React frontend and current backend routes.
7. Login protection now tracks normalized email and client IP independently for both Developer and Admin logins.
8. Either counter blocks login after three failed credential checks until the next day.
9. Credential checks are reserved with atomic upserts, closing the simultaneous-request race that could otherwise allow more than three password guesses.
10. Expired login-attempt rows are deleted at startup and before login checks; the date boundary is configurable and defaults to `Asia/Yangon`.
11. Client IPs are canonicalized, including IPv4-mapped IPv6 addresses, and raw forwarding headers are not trusted by application code.
12. Developer constant-time comparisons now handle non-ASCII input without raising a server error.
13. Fresh-install SQL, existing-database migration SQL, ORM schema, API documentation, and tests now describe the same login-attempt model.

## Validation performed

- All Python backend modules compile with `py_compile`.
- Every remaining `/api/...` backend route is referenced by the current React frontend.
- No browser `alert()`, `confirm()`, or `prompt()` calls remain in `frontend/src`.
- No browser camera APIs (`getUserMedia` / `mediaDevices`) remain in the frontend.
- No runtime `festival_state` model/API dependency remains; only the startup `DROP TABLE IF EXISTS festival_state` cleanup is retained.
- Whole welcome formatter contains an explicit reserved-Whole case.
- Ten login-security tests pass, including email/IP bypass tests, next-day cleanup, third-check success/reset, and eight simultaneous requests competing for the same three allowed credential checks.
- MySQL `ON DUPLICATE KEY UPDATE` SQL for atomic counters compiles successfully.
- FastAPI imports successfully and both modified login routes register as POST endpoints.
- The complete React frontend production build and TypeScript no-emit check succeed.

## Deployment requirements

- Existing databases must apply `backend/MIGRATION_LOGIN_ATTEMPTS_EMAIL_IP.sql` once before running this backend. Fresh databases use the updated `backend/database.sql` directly.
- A reverse-proxy deployment must configure Uvicorn's trusted proxy addresses so `Request.client.host` represents the real client without accepting spoofed forwarding headers.
- Replace the development secrets in `backend/.env` before any production deployment.

## Important lifecycle assumptions retained

- `completion.status = 0`: Not Started.
- `completion.status = 1`: Starting / voting open.
- `completion.status = 2`: Finished.
- Combined targets use negative combined IDs.
- Whole uses target `0`.
- A Major Admin in an accepted combined festival organizes the combined target rather than a standalone event.
