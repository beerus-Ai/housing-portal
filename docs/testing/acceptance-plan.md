# Acceptance plan with residents

Status: **not yet run.** This is the plan for testing with the partner society (brief slide 11, "Test with residents", week 8).

## 1. Before anything starts
1. Written permission from the partner society's committee (use the template in `docs/privacy-and-consent.md`), naming what will be tested, for how long, and who may see results.
2. Agree data handover or deletion at the end.
3. Decide the environment: a staging copy, not a database holding real residents' records.

## 2. Synthetic data rule
Participants sign in with test accounts created for the session, with invented names, `*.test` emails and made-up phone numbers. No real flat numbers, real phone numbers or real complaints are entered. For WhatsApp intake, use the committee's simulator or a dedicated test number registered to a test account. Nothing from the session is pasted into Claude or any model.

## 3. Consent for participants
Participants are told: what is being tested, that it is the software and not them, that they can stop at any time, what is recorded (task success, time, comments, no personal data), and that feedback may be quoted without names. Verbal consent recorded by the facilitator is enough for usability feedback when no personal data is collected; if real data is used, the DPDP consent in `privacy-and-consent.md` applies instead.

## 4. Participants
Aim for each persona at least twice: owner, tenant, family member, committee member, guard, and one resident who would use WhatsApp only. Numbers are not fixed in advance; record how many took part.

## 5. Tasks (script)
| # | Persona | Task | Success looks like |
| --- | --- | --- | --- |
| 1 | Owner | Register and get approved | Reaches the home screen after committee approval |
| 2 | Owner | Raise a request with a photo | Request visible with status |
| 3 | WhatsApp-only | Message the test number about a problem, ask for status | Reply received; request appears for committee |
| 4 | Committee | Review AI suggestion, confirm vendor, post notice (with drafter) | Assignment and notice done by the human |
| 5 | Tenant | Find lease and days left | Found without help |
| 6 | Owner | Rate a resolved request | Rating saved |
| 7 | Guard | Verify a visitor pass | Allowed or denied with reason |

Measure per task: completed unaided (yes/no), time taken, errors, one comment. Add an overall ease score from 1 to 5 and a free-text question.

## 6. Acceptance criteria
- Every Must-have story is completed unaided by at least one participant of the relevant persona.
- No critical or high defect is raised during the session; new defects go to `defect-log.md`.
- The partner committee states in writing whether it would use the portal; the wording is recorded, not paraphrased.

## 7. After the session
Record results in `test-results.md` (new section with date, facilitator, participants by persona, outcomes). Delete test accounts and any recordings. Return or delete data as agreed.
