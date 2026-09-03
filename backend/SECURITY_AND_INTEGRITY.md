# Security and voting-integrity invariants

## Roles
- Developer: developer endpoints only.
- Major Admin: own-major candidate/title/combine operations and organizer target authorized by `organizer_target`.
- Whole Admin: Whole candidate staging only.
- Whole Organizer: Whole organizer target only.
- Voter: only the voter represented by the matching `voter_session_{voter_id}` cookie.
- UI visibility is not authorization; every protected API uses backend dependencies and target/ownership checks.

## QR lifecycle
QR credentials are `public_id + secret`; only `public_id$HMAC(secret)` is stored.
Verification is POST-only. New QR links use `/qr-entry#PUBLIC_ID/SECRET`.
A QR must exist, be active, match its HMAC, and belong to a currently-running festival.
Completed festivals delete voter rows and QR artifacts, invalidating old QR sessions server-side.
QR generation is rejected after completion.

## Multi-session isolation
New sessions use `voter_session_<voter_id>`. A supplied `voter_id` must have its matching signed cookie.
A cookie for voter 104 cannot authorize voter 151. Draft keys remain scoped by target and voter.

## Atomic final submission
Submission locks the festival completion row first, then the voter row. It re-checks that voting is open,
the voter is active and not submitted, all current titles are present exactly once, candidates belong to
the target, gender/title rules match, and no candidate is reused. Votes + `submitted=true` commit together.
Any conflict rolls back.

## Database protection
Fresh `database.sql` enforces unique voter token, unique voter/title vote, candidate number per
major+gender, Whole candidate ID/number, combined membership, combine response, final winner keys,
admin Gmail, Major name, and daily security-log keys. Vote rows cascade when a voter is deleted.
Completion status and positive vote weight have CHECK constraints.

## Login protection
Developer and Admin credential checks reserve atomic daily counters for both normalized email and
canonical client IP. Only the first three checks for each bucket may reach password verification;
changing either email or IP does not bypass the other bucket. A successful login clears its two
counters. Failed counters remain through the configured local day, and all older rows are deleted
automatically so the table does not accumulate historical attempt data.

## API errors
All `/api/*` HTTP errors return `success:false`, numeric `status`, and `detail`.
Validation errors are HTTP 422 with `errors`. Expected conflicts use 409 rather than 500.
