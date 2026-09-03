# Partial ballot rules
- Major (`target_id > 0`): titles may be skipped.
- Combined (`target_id < 0`): titles may be skipped.
- Whole (`target_id = 0`): every active title is mandatory.
- Major/Combined require at least one selection.
- Existing candidate eligibility, gender/title, and no-candidate-reuse rules remain.
- Final submission remains immutable (`submitted=true`).
- Skipped titles create no vote row.
