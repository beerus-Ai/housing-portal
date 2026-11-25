# Acceptance plan with residents

Status: **not run.** Plan for testing with the partner society (brief slide 11, week 8).

## Before starting
1. Written permission from the partner committee (template in `docs/privacy-and-consent.md`): what is tested, for how long, who sees results.
2. Agree data deletion or handover at the end.
3. Use a staging copy, never a database with real residents' records.

## Data and consent
- Test accounts only: invented names, `*.test` emails, made-up phones and flats. Nothing from the session goes into Claude or any model.
- Tell participants what is tested (the software, not them), that they can stop any time, and what is recorded (task success, time, comments). Verbal consent is enough when no personal data is collected; otherwise the DPDP consent in `privacy-and-consent.md` applies.

## Participants
Each persona at least twice: owner, tenant, family member, committee member, guard, staff, and a resident who uses Telegram only. Record how many took part.

## Tasks
| # | Persona | Task | Success |
| --- | --- | --- | --- |
| 1 | Owner | Register and get approved | Reaches home after approval |
| 2 | Owner | Raise a request with a photo | Request visible with status |
| 3 | Telegram-only | Message the bot about a problem, ask for status | Reply received; committee sees the request |
| 4 | Committee | Review the AI suggestion, assign, post a notice with the drafter | Done by the human |
| 5 | Tenant | Find lease and days left | Found unaided |
| 6 | Owner | Rate a resolved request | Rating saved |
| 7 | Guard | Verify a visitor pass | Allowed or denied with reason |
| 8 | Owner | Book a clubhouse slot and check dues | Booking shown; balance correct |
| 9 | Staff | Take up a job, take stock out, log a waste collection | All saved |

Measure per task: unaided (yes/no), time, errors, one comment. Add an overall ease score (1 to 5) and one free-text question.

## Acceptance criteria
- Every Must-have story completed unaided by at least one participant of its persona.
- No critical or high defect raised; new defects go to `defect-log.md`.
- The partner committee states in writing whether it would use the portal; record the wording as given.

## After
Add a dated section to `test-results.md` (facilitator, participants by persona, outcomes). Delete test accounts and recordings.
