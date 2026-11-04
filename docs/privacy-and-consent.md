# Privacy and consent (DPDP Act, 2023)

This document describes what the portal does and what a society should agree before use. It is a working note for the assignment, not legal advice; the society should have its own legal review.

## 1. Roles
The society (committee) decides why and how resident data is used, so it acts as the data fiduciary under the DPDP Act, 2023. The portal builders act on its behalf as processors while testing or hosting.

## 2. Consent
- Registration cannot complete without an explicit consent tick (`consent: true`); the time is stored in `users.consent_at`.
- Consent text shown at registration should state: purposes (running the society: approvals, requests, notices, gate, emergencies), data collected, who sees it (committee, and guards for gate checks), how long it is kept, and how to withdraw.
- Accounts added by an owner for family or tenants are created pending and also require `consent: true` (the form says "They agree to the processing of their data by the society"), stored in `users.consent_at`. Here the owner ticks it on the person's behalf, so the person never sees it themselves. Open improvement: show the same consent to them on first sign-in.
- Withdrawal: the resident asks the committee, who suspends or removes the account.

## 3. Minimal data
Collected: name, email, flat, phone, resident type, password (stored only as a bcrypt hash). Leases add owner contact and police-verification date for tenants. Gate passes hold visitor name, purpose and validity. Request photos are stored in `uploads/` (access checked per request). No payment, biometric or identity-document data is collected.

## 4. Retention and deletion
No automatic retention schedule is implemented yet. Proposed: resident data kept while resident lives in the society, then removed within a period the society agrees (suggest 90 days after move-out); audit entries keep actor id and action but no free-text personal data; gate logs trimmed on a schedule the society sets. Committee can remove a user (`DELETE /api/admin/users/:id`). Backups follow the same schedule. These periods are proposals for the society to decide.

## 5. What is sent to an LLM (AI triage, notice drafter, digest)
Never names, phone numbers, email addresses or flat numbers. Text is run through a redaction step before any model call (`redact` in `ai.js`, covered by an automated test). Only the problem description and a list of vendor trades are sent. Photos are not sent. With no API key the portal uses a local rule-based classifier and sends nothing anywhere. The model's output is a suggestion; a committee member confirms assignments and sends notices. Redaction is pattern-based and can miss unusual formats, so residents should avoid typing personal details into the description and the committee should review suggestions.

WhatsApp: messages pass through the WhatsApp provider under its terms; the portal stores inbound and outbound messages in `whatsapp_messages` for the committee's use. The society should decide how long to keep them.

## 6. Security measures
Hashed passwords, role checks on every route, HTTPS in production, no secrets in the repository, strict CSP, audit trail, login throttling, webhook secret check.

## 7. Development rule
No real resident data in prompts to Claude, fixtures or tests. Synthetic data only (see `CLAUDE.md`).

## 8. Template: partner society permission and data handover
*Template only. Fill the blanks and have both parties sign.*

> **Permission to test the Sahyadri Heights housing-society portal**
> Society: ______________ Committee representative: ______________ Date: ________
> 1. The committee permits the student team to test the portal with residents on the following dates: ______.
> 2. Testing will use: [ ] synthetic data only  [ ] real resident data with each resident's consent.
> 3. Residents take part voluntarily and may stop at any time.
> 4. Data collected during testing: ______________. Who can see it: ______________.
> 5. Data handover or deletion: at the end of testing on ________, the team will [ ] hand all data to the committee  [ ] delete all data and confirm in writing within ____ days. Backups and test accounts are included.
> 6. No data from the testing will be pasted into AI tools or shared outside the team.
> 7. Contact for questions or withdrawal: ______________.
> Signed (society): ______________ Signed (team representative): ______________
