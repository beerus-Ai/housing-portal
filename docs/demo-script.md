# Demo script (about 9 minutes)

Setup before the demo (not counted in the time): start the app (`npm start`, or the React app with `npm run dev` against it), open one browser window per role. Test accounts are created locally by registering residents through the UI and approving them as the committee; the committee admin comes from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. No real passwords or real resident data are used or shown. Optional AI keys are not needed: the rule-based path runs without them.

Prepare: one owner (flat A-101), one tenant (A-102) and one family member in A-101 added by the owner, one guard created by the committee, one vendor (for example a plumber). Give the owner a phone number so WhatsApp intake can match it.

| Time | Step | Who | Expected result |
| --- | --- | --- | --- |
| 0:00 | State the problem: WhatsApp groups, paper registers, phone calls. Show `docs/process-flows/as-is-complaint.bpmn` rendering | Presenter | Audience sees the pain points |
| 0:45 | Register a new owner with consent ticked | Owner | "An admin will review your account" |
| 1:15 | Try to sign in before approval | Owner | Blocked: awaiting approval |
| 1:30 | Committee approves in the approvals queue | Committee | Owner can now sign in; audit row written |
| 2:00 | Owner raises a request "water leaking in bathroom" with a photo | Owner | Request appears as open; committee gets a notification |
| 2:45 | Committee opens the dashboard: open by category, SLA, unassigned | Committee | New request counted |
| 3:15 | Committee assigns the vendor and moves it to in progress | Committee | Owner sees the tracker move and a notification |
| 4:00 | Close the request; owner rates 5 stars; show the family member cannot rate and the owner can | Committee, owner | Closed then rated; audit trail shows who did what and when |
| 5:00 | Messaging segment: from the Telegram test account (linked to flat T-101), send "Hi everyone" then "The lift is stuck" to @SahyandriHeightsBot. (Fallback: the committee WhatsApp/Telegram simulator) | Resident on Telegram | "Hi" is ignored as chatter; the lift message becomes a request with source Telegram, category lift; the bot replies with the request number |
| 5:30 | Close the dashboard and show the committee inbox: the email has the stage tracker and "Next step: Assign someone" with the AI-suggested vendor first. Click it and confirm | Committee (email) | Request assigned; resident told on Telegram; a follow-up email arrives with "Approve: start the work" |
| 5:50 | From the follow-up emails approve start, then approve done | Committee (email) | Request moves to in progress, then resolved; the dashboard and audit trail show the email actions |
| 6:10 | Send "status" from the same chat | Resident on Telegram | Reply lists the latest requests and their status |
| 6:20 | Message the bot from an unlinked account | Anyone | Reply asks them to share their phone number; no request created |
| 6:40 | Show the AI suggested vendor; committee confirms it (the human decides; AI only suggests) | Committee | Assignment audited |
| 7:10 | Notice drafter: type rough bullet points, review the draft, edit, post | Committee | Draft appears; nothing is posted until the committee clicks post; resident sees the notice |
| 7:50 | Show the weekly digest and the 48h SLA (an overdue request flags and notifies the committee; show the automated test or a request back-dated in a test database) | Committee | Escalation recorded once |
| 8:20 | Guard verifies a visitor pass by 6-digit code; guard cannot open any other screen | Guard | Allowed once; reuse denied; gate log row |
| 8:50 | Access control: committee turns off a permission for a role, resident of that role is refused | Committee | Access matrix takes effect |
| 9:15 | Close: architecture slide (`docs/architecture/architecture.md`), test counts (Node 65, Java 81, React 67), what is not yet verified | Presenter | Honest status |

Fallbacks: if Telegram, n8n or Gmail is unavailable, use the simulator and the rule-based gate; say so. The live site sleeps on the free plan: open it a minute before the demo, and remember its database resets on sleep or redeploy (the role accounts and the Telegram tester are re-seeded automatically; requests are not). If the live URL is down, demo locally and show the automated test output.
