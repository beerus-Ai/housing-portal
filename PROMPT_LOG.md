# Prompt log (AI use disclosure)

| # | Prompt / intent | Outcome | Failure / fix |
|---|---|---|---|
| 1 | "READ THE DOC" then "DO": read the assignment PDF and build the portal | Express + SQLite MVP covering all five core requirements, API tests, UI | `node --test test/` failed on Node 24 (directory treated as module); fixed with a glob |
| 2 | Claude Design handoff bundle: implement `Housing Portal.dc.html` as the website **and** the mobile app, keep the existing Express API (scope option 1) | Restyled web app (4 resident roles + committee) and a new installable mobile app at `/m/`; API extended for flat-wide visibility, owner-only rating, household, lease and dashboard stats; `npm run seed` demo data; 4 API tests | `DesignSync` could not read the project (needed `/design-login`), so the zip export was used. Browser screenshots timed out, so UI was verified through DOM checks and API tests, not visually. Prototype's 5th tracker step ("Closed after rating") was mapped onto the existing 4-status lifecycle instead of adding a status |
