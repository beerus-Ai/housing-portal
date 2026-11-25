# Sprints

Brief slide 9: sprints with a goal and a review note. Stories and points: `backlog-v2.csv` (`Sprint` column). Points are relative estimates. Review notes only where the outcome is known.

## Sprint 1: Core loop (from 2026-11-04)
Goal: register, approve, sign in, raise a request; committee assigns, progresses, closes; rating and audit trail.
Review: scope was built before the sprint date was recorded (git starts 2026-11-03); closed against the tests and manual React checks in `docs/testing/test-results.md`.

## Sprint 2: Communication and visibility
Goal: residents hear about every change; the committee sees what is pending.
Scope: notifications, notices, live updates, dashboard, CSV export, household, leases, vendors, password reset.

## Sprint 3: Estate features and platform
Goal: configurable access and estate operations; Java and React at parity.
Scope: access matrix, feature flags, guards and gate passes, emergency and contacts, estate overview, vehicles, parking, workers, Google sign-in, Java and React.

## Sprint 4: AI workflows, deployment, acceptance
Goal: complaints arrive by message and are triaged by AI under human control; portal live; residents test it.
Review (2026-11-14): Telegram replaced WhatsApp (Meta blocked); n8n LLM gate; AI suggested actions; email desk; live on Render. Verified with real Telegram messages and n8n runs. Open: WhatsApp, Java/React ports, durable hosting, acceptance (HSP-41..45).

## Sprint 5: Faculty review (2026-11-21 to 2026-11-25)
Goal: act on the faculty review and whiteboard.
Scope: review roles (HSP-46..58); Flutter app; product and technology architecture doc; society modules (amenities, dues, inventory, waste) on web.
Review (2026-11-25): all merged (PRs #19-#24) and deployed; Node 78, Java 81, React 67, Flutter 8 tests; CI 6/6 green. Flutter and modules have no Jira issues yet (to add). Open: Java/React ports, Flutter assign and toast colour, payment gateway.

Sprints 2 and 3 contain coded work that has not had a formal sprint review.
