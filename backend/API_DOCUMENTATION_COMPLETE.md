# MTU Fresher Welcome Voting System — API Documentation

This document describes every backend API currently used by the bundled React frontend.

## 1. Base URL and transport

The frontend reads `VITE_API_BASE_URL`. In local development this is normally the FastAPI server, for example `http://127.0.0.1:8000`.

All authenticated frontend requests use cookies (`credentials: include`). The project no longer requires HTTPS for browser-camera access because the web application does not open the camera itself. Production deployments may still use HTTPS normally for transport security.

## 2. Authentication model

There are three independent session types.

| Session | Cookie | Created by | Lifetime | Used by |
|---|---|---|---:|---|
| Developer | `developer_session` | `POST /api/developer/login` | 8 hours | Developer APIs |
| Admin | `admin_session` | `POST /api/admin/login` | 8 hours | Admin + Organizer APIs |
| Voter | `voter_session_<voter_id>` | `POST /api/voter/qr/verify` | 12 hours | Voter session, ballot and submit APIs |

The voter ID by itself is not authorization. The matching secure voter-session cookie must also be valid.

## 3. Festival target IDs and lifecycle

The system uses one integer `target_id`/`major_id` namespace for festival lifecycle operations.

| Target | Meaning |
|---:|---|
| `0` | The Whole Welcome |
| positive integer, e.g. `3` | Standalone Major festival for major 3 |
| negative integer, e.g. `-2` | Combined Festival whose `combined_id` is 2 |

Lifecycle status is stored in `completion.status`:

| Status | Meaning |
|---:|---|
| `0` | Not Started |
| `1` | Starting / voting open |
| `2` | Finished / winners finalized |

A combined festival is represented by one negative target. All member majors use that combined target for voting, results and organizer lifecycle.

## 4. JSON response contract

Successful JSON responses preserve their endpoint-specific top-level fields and also include:

```json
{
  "success": true,
  "http_status": 200,
  "data": { "...original endpoint payload...": "..." }
}
```

If the endpoint itself has a domain field named `status` (for example festival `0/1/2` or combine request `pending/accepted/rejected`), that value is preserved. HTTP status is exposed separately as `http_status`.

Typical errors use:

```json
{
  "success": false,
  "status": 409,
  "detail": "Human-readable message",
  "error": {
    "code": "error_code",
    "type": "api_error",
    "message": "Human-readable message"
  }
}
```

Database-capacity errors return HTTP `503` and include `X-Request-ID` and `Retry-After: 1`.

---

# 5. Developer APIs

Developer APIs require a valid `developer_session` cookie except the login endpoint.

## POST `/api/developer/login`

Authenticates the configured developer account.

**Content-Type:** `multipart/form-data`

| Field | Type | Required |
|---|---|---|
| `email` | string | yes |
| `password` | string | yes |

**Success:** sets `developer_session`; returns `ok`, `role`, and `email`.

**Common errors:** `401` invalid credentials, `429` daily email or IP login limit.

Three failed attempts by either normalized email or client IP block further
logins for that account type until the next day. Expired counter rows are
automatically deleted.

## GET `/api/developer/me`

Checks whether the current developer cookie is valid.

**Success fields:** `ok`, `role`, `email`.

**Errors:** `401` if not authenticated.

## GET `/api/developer/majors`

Returns real majors only. Reserved Whole (`major_id = 0`) is excluded.

**Success fields:**

```json
{
  "majors": [
    { "major_id": 1, "major": "MC" }
  ]
}
```

## POST `/api/developer/majors`

Creates a major, its `completion(status=0)` row, and the six default titles.

**Form fields:** `major` (required string).

Default titles are King, Queen, Smart, Style, Mr.Popular, and Ms.Popular.

**Success:** HTTP `201`, returns `major_id` and `major`.

**Common errors:** `400` blank name, `409` duplicate/conflict.

## DELETE `/api/developer/majors/{major_id}`

Deletes a major only when system references permit deletion.

**Path:** `major_id` positive integer.

**Common errors:** `404` not found, `409` when referenced by active system data.

## GET `/api/developer/accounts`

Returns all Admin accounts and their assigned major names.

**Success field:** `accounts[]` with `admin_id`, `admin_name`, `admin_role`, `major_id`, `major`, `admin_gmail`.

## POST `/api/developer/accounts`

Creates an Admin account.

**Form fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `admin_name` | string | yes | display name |
| `admin_role` | string | yes | `major_admin` or `whole_admin` |
| `gmail` | string | yes | unique |
| `password` | string | yes | minimum 8 characters |
| `major_id` | integer | for `major_admin` | must be a real major |

A Major Admin is assigned to exactly one major. Whole Admin has no normal major assignment. Only one account may own a given major and only one Whole Admin may exist.

## PUT `/api/developer/accounts/{admin_id}`

Updates an Admin account and optionally changes its password. Admins cannot change their own passwords elsewhere; password management is Developer-only.

**Form fields:** `admin_name` required, `gmail` required, `password` optional/blank to keep current password.

Changing sensitive account data revokes older Admin sessions through `session_version`.

## DELETE `/api/developer/accounts/{admin_id}`

Deletes an Admin account when permitted.

---

# 6. Admin authentication and session APIs

## POST `/api/admin/login`

Authenticates a Major Admin or Whole Admin.

**Form fields:** `gmail`, `password`.

**Success:** sets `admin_session`; returns Admin identity/role information.

**Common errors:** `401` invalid credentials, `429` daily email or IP login limit.

## GET `/api/admin/me`

Requires `admin_session`.

Returns the logged-in Admin identity including `admin_id`, `admin_name`, `admin_role`, `major_id` and major display data used by the dashboard.

---

# 7. Major Admin candidate APIs

These endpoints require a logged-in `major_admin`.

Candidate management is locked when the standalone major or any combined festival containing that major has status `1` or `2`.

## GET `/api/admin/candidate-management-status`

Returns whether candidate management is locked and a human-readable message.

## GET `/api/admin/candidates`

Returns the logged-in Major Admin's own candidate list.

## POST `/api/admin/candidates`

Creates a candidate.

**Content-Type:** `multipart/form-data`

| Field | Type | Required |
|---|---|---|
| `c_name` | string | yes |
| `c_number` | integer | yes |
| `c_gender` | string | yes (`boy`/`girl`) |
| `c_photo` | file | yes |

Candidate numbers must remain valid/unique according to the festival rules, including combined-event collision checks.

## PUT `/api/admin/candidates/{candidate_id}`

Edits the logged-in major's candidate.

**Form fields:** `c_name`, `c_number`, optional `c_photo`.

Gender is not changed by this endpoint.

## DELETE `/api/admin/candidates/{candidate_id}`

Deletes the logged-in major's candidate when management is unlocked and the candidate is not already referenced by finalized awards.

---

# 8. Combined Festival APIs

These endpoints require a logged-in `major_admin`.

A major may belong to only one accepted Combined Festival. Final request acceptance revalidates membership under database row locks to prevent overlapping/racing requests from placing one major into multiple combined festivals.

## GET `/api/admin/combine/available-majors`

Returns majors that can currently be selected for a new/edit combination request.

Excludes Whole, the caller's own major, locked majors, majors already in another combined festival, and majors already tied up by pending combination requests.

## GET `/api/admin/combine`

Returns:

- `combined_festivals[]` involving the caller's major
- `requests[]` involving the caller's major

Combined festival entries include `combined_id`, negative `target_id`, name, members, status and editability.

## POST `/api/admin/combine`

Creates a new combination request.

**Form fields:**

- `combined_name` — required, nonblank
- `major_ids` — one or more selected other major IDs; repeated form field

The caller's own major is added automatically. At least two total majors are required.

The festival is created only after every invited Major Admin accepts.

## PUT `/api/admin/combine/{combined_id}`

Creates an edit request for an existing, not-started Combined Festival involving the caller.

**Form fields:** `combined_name`, repeated `major_ids`.

Edits are blocked after the Combined Festival starts/finishes and when generated Combined Festival voter QR records still exist.

Server-side validation also prevents selecting a major that is already in another combined festival or whose event lifecycle is locked.

## PUT `/api/admin/combine/requests/{request_id}/response`

Accepts or rejects an invitation.

**Form fields:**

| Field | Values | Required |
|---|---|---|
| `response` | `accepted` or `rejected` | yes |
| `message` | rejection reason | optional |

When the last required admin accepts, the server revalidates memberships and candidate-number conflicts, then creates/updates the Combined Festival and its negative completion target.

## GET `/api/admin/combined-candidates`

Returns the active Combined Festival metadata and all candidates from its member majors for the caller's dashboard.

---

# 9. Title APIs

These endpoints require `major_admin`.

For Combined Festivals, same-name titles across member majors are exposed as one conceptual award. Title management is locked whenever the caller's standalone/combined event has status `1` or `2`.

## GET `/api/admin/titles`

Returns:

- `locked` boolean
- `titles[]` containing `title_id`, `title`, `group`

For a combined event, duplicate title names are de-duplicated case-insensitively.

## POST `/api/admin/titles`

Creates a title before the event starts.

**Form fields:** `title` and `group` (`boy` or `girl`).

A same-name title already present in the combined conceptual title set is rejected.

## DELETE `/api/admin/titles/{title_id}`

Deletes a manageable title before the event starts. Deletion is rejected if voting/results data already references that title.

---

# 10. Whole Admin candidate APIs

These endpoints require `whole_admin`.

Whole candidate management becomes available only when every actual feeder festival is finished. Standalone majors are checked once by positive target ID; each Combined Festival is checked once by its negative target ID. Reserved Whole is never treated as an input major.

## GET `/api/admin/whole-candidates`

If feeder festivals are incomplete, returns `ready: false` and `missing_majors`.

If ready, returns the selected Whole candidate list, including original major and major-award titles.

## GET `/api/admin/whole-candidates/available`

Returns current Major/Combined Festival winners that are eligible to be added to the Whole candidate set.

## POST `/api/admin/whole-candidates/{candidate_id}`

Adds a current major winner to the Whole candidate pool and allocates the next free Whole candidate number.

Blocked after Whole starts/finishes.

## DELETE `/api/admin/whole-candidates/{candidate_id}`

Removes a Whole candidate before Whole starts.

## PUT `/api/admin/whole-candidates/{candidate_id}`

Changes a Whole candidate's Whole-specific number.

**Form field:** `c_w_number` integer.

---

# 11. Organizer APIs

All Organizer APIs require a valid Admin session. The server derives the Admin's one current organizer target:

- Major Admin not combined → own positive major target
- Major Admin in Combined Festival → that Combined Festival negative target
- Whole Admin → target `0`

The current frontend displays that event directly; it does not ask the organizer to choose from a dropdown.

## GET `/api/organizer/targets`

Returns the authorized organizer target list. In the current UI the first/only target is loaded automatically.

## GET `/api/organizer/status?target_id=<id>`

Returns the exact lifecycle status from the `completion` row for the authorized target.

Important fields:

- `target_id`, `major_id`
- `major` event display name
- `festival_type`: `major`, `combined`, or `whole`
- `status`: `0`, `1`, `2`
- `voting_open`
- `year`
- `qr_counts.students`, `qr_counts.teachers`
- `can_start`, `can_end`
- `started_by_admin_id`
- `action_message`

For a Combined Festival, only the Admin who started it can end it.

When status is `2`, the frontend shows **View Results** and can reopen finalized results at any time.

## POST `/api/organizer/generate-qr`

Creates any missing QR voters needed to reach the requested totals.

**Form fields:**

- `students` integer >= 0
- `teachers` integer >= 0
- `target_id` optional; frontend supplies the derived target

Returns generation counts and current totals.

QR codes are links intended to be scanned with the phone's normal camera. The web frontend does not open a camera automatically.

## GET `/api/organizer/download-qr/{role}?target_id=<id>`

Downloads the generated QR archive for `role = student` or `teacher`.

**Response:** ZIP file.

## POST `/api/organizer/start`

Starts the authorized event.

**Form field:** optional `target_id`.

Changes completion to status `1`, resets current voter submission state, and opens voting. Whole cannot start until feeder festivals are complete.

## POST `/api/organizer/stop`

Ends a currently running event.

**Form field:** optional `target_id`.

Calculates and saves winners, sets completion status `2`, closes/removes current event voter data as designed, clears QR artifacts, and returns finalized winners.

## GET `/api/organizer/winners?target_id=<id>`

Returns event results.

- status `2` → `source: "final"`, reads saved winners
- otherwise → `source: "live"`, calculates current leaders

Returns `titles[]` grouped by award with winner/candidate information.

---

# 12. Voter APIs

## POST `/api/voter/qr/verify`

Verifies a QR credential pair.

**Content-Type:** `application/json`

```json
{
  "public_id": "...",
  "secret": "..."
}
```

Verification requires:

1. registered public ID
2. active voter row
3. matching signed/hashed QR secret
4. festival status `1`

**Success:** sets `voter_session_<voter_id>` and returns `valid`, `voter_id`, festival target/name and redirect metadata.

The React flow stores only non-secret voter/event display information in local storage, returns the voter to the public welcome page, then uses the secure cookie for actual authorization.

## GET `/api/voter/session?voter_id=<id>`

Validates that a stored voter ID still has its matching valid voter cookie and that voting is still open.

Returns `voter_id`, target, festival name and `submitted`.

## GET `/api/voter/ballot?voter_id=<id>`

Loads the authorized ballot. Authentication is resolved from `voter_id` plus its matching voter session cookie.

Returns:

- `titles[]`
- `candidates[]`
- previously selected candidate IDs if any
- `complete`
- `submitted`
- `submitted_votes[]` for an already submitted ballot

Combined festivals de-duplicate same-name titles. Whole uses Whole-specific candidate numbers.

## POST `/api/voter/submit?voter_id=<id>`

Submits the final ballot.

**Content-Type:** `application/json`

```json
{
  "selections": [
    { "title_id": 1, "candidate_id": 10 },
    { "title_id": 2, "candidate_id": 15 }
  ]
}
```

The server validates that voting is still open, the title belongs to the active festival, the candidate is eligible for that festival/title group, and the voter session is valid. Submission is final according to the current frontend flow.

---

# 13. Frontend browser routes (not APIs)

FastAPI keeps redirect helpers so opening backend URLs does not return a raw 404:

- `/` → React `/`
- `/admin` → React `/admin`
- `/admin/dashboard` → React `/admin/dashboard`
- `/admin/organizer` → React `/admin/organizer`
- `/admin/results` → React `/admin/results`
- `/developer` → React `/developer`
- `/developer/dashboard` → React `/developer/dashboard`

React itself protects Admin and Developer dashboards by calling `/api/admin/me` or `/api/developer/me` before rendering protected dashboard UI.

# 14. Current welcome naming

The voter session returns the festival name from the target. The React welcome page displays:

- Whole target (`Whole`) → **The Whole Welcome**
- standalone `MC` → **MC Major Fresher Welcome**
- names already ending in `Major` → `<name> Fresher Welcome`
- combined festival name → `<combined name> Major Fresher Welcome` under the current naming formatter

# 15. Security and consistency notes

- Admin passwords are managed only by Developer APIs; there is no Admin self-change endpoint.
- Candidate and title writes are enforced server-side, not only hidden in the UI.
- Combined membership is revalidated under row locks at final acceptance.
- Event lifecycle is stored in `completion`; the legacy `festival_state` table is dropped at startup.
- HTTP response status metadata never overwrites lifecycle/request `status` values.
- Browser `alert()`, `confirm()`, and `prompt()` are not used by the current frontend; actions use in-app dialogs.
- Every remaining `/api/...` route in this document is referenced by the current React frontend.

## Multiple QR voters in one browser

The voter flow supports multiple independently verified QR voters in the same browser. QR verification creates an HttpOnly cookie whose name is scoped to the voter (`voter_session_<voter_id>`), so verifying another QR does not overwrite an earlier voter session. The frontend keeps a non-secret registry of verified voter IDs/event labels and a tab-specific active voter. Every voter API request includes `voter_id`; the backend then requires the matching voter-specific HttpOnly cookie before authorizing the request.

This permits AA and BB QR voters to coexist in one browser. Separate tabs can remain on different voters, and the Welcome page exposes the verified sessions when more than one exists so the operator can switch the active voter without rescanning. The browser registry is navigation state only and is not trusted for authorization.
