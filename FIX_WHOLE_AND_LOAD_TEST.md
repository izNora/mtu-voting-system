# Whole Candidate + 200-user Load Test Fix

## Whole candidate fixes
- Removed repeated automatic Whole-candidate reseeding from:
  - GET `/api/admin/whole-candidates`
  - POST `/api/admin/whole-candidates/{candidate_id}`
  - Whole festival start
- Default King/Queen winners are now seeded only when the final feeder festival's winners are finalized.
- Removing a default Whole candidate now persists instead of being recreated on refresh.
- New Whole candidates use `max(c_w_number) + 1`; removed-number gaps are not reused.
- Whole-number allocation is serialized using the reserved Whole completion row to avoid concurrent additions choosing the same number.
- Whole candidate cards now display the Whole number and candidate name on separate lines, preventing values such as Whole No. 1 + candidate name 1 from visually appearing as `#11`.

## Load-test rewrite
- `load_test_seed_200.sql` now matches the current schema, including `titles.major_id`.
- Uses isolated test target `major_id = 9001` and is rerunnable.
- Uses the current six built-in titles and 12 candidates.
- Creates 200 QR voters matched to `TOKEN_PEPPER=LOAD_TEST_ONLY_PEPPER_2026_CHANGE_ME`.
- `load_test_200_users.py` now follows the current frontend API sequence exactly:
  1. QR verify
  2. voter session
  3. ballot
  4. submit
- Each simulated voter has its own cookie-preserving HTTP client.
- Detailed stage failures and JSON report are retained.
