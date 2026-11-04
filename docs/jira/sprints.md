# Sprints

Brief slide 9: three to four sprints, each with a goal and a short review note. Stories and points are in `backlog-v2.csv` (`Sprint` column). Points are relative estimates, not measured velocity. Review notes are written only where the outcome is already known; planned sprints have none.

## Sprint 1: Core loop (started 2026-11-04)
Goal: a resident can register, be approved, sign in securely, raise a request, and the committee can assign, progress and close it, with rating and an audit trail.
Scope: Onboarding registration and approval; sign-in and role checks; raise, assign, track, rate; flat visibility; audit trail; security hardening; automated tests.
Review note: the Node implementation of this scope and its API tests existed before the sprint start date was recorded (git history begins 2026-11-03). The sprint is being closed against the documentation, test evidence and manual React checks recorded in `docs/testing/test-results.md`. Peer review of each pull request is still to be evidenced in the contribution matrix.

## Sprint 2: Communication and visibility (planned)
Goal: residents are told about every change and the committee sees what is pending.
Scope: notifications, notices, live updates, dashboard, CSV export, household, leases, vendors, password reset.
Review note: none yet.

## Sprint 3: Estate features and platform (planned)
Goal: access rules and estate operations are configurable, and the Java and React stack reaches parity.
Scope: access matrix, feature flags, guards and gate passes, emergency and contacts, estate overview, vehicles, parking, workers, Google sign-in, Java backend and React app.
Review note: none yet.

## Sprint 4: AI-native workflows, deployment and acceptance (planned)
Goal: complaints can arrive on WhatsApp and be triaged by AI under human control; the portal is live; residents have tested it.
Scope: WhatsApp intake, AI triage, human confirmation, notice drafter, SLA escalation, weekly digest; Docker, PostgreSQL, HTTPS and CI; accessibility pass; acceptance testing; privacy documents.
Review note: none yet. The AI features are in development; the rule-based path and its tests exist in the repository, while LLM mode and real WhatsApp delivery are unverified.

Note: Sprint 3 and parts of Sprint 4 contain work that has already been coded. They are labelled planned because they have not been formally reviewed in a sprint review.
