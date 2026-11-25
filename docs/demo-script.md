# Demo script (about 10 minutes)

Setup (not timed): run locally (`npm start`) or open the live site a minute early (it sleeps on the free plan and resets data; role accounts and the Telegram tester are re-seeded). One browser window per role. Synthetic accounts only: owner A-101, family member in A-101, tenant A-102, guard, staff, one vendor. No AI key needed.

Society modules setup: as committee add a Clubhouse (08:00-20:00, 2-hour slots), bill November dues, add an item with a reorder level, and set a weekly waste schedule.

| Time | Step | Who | Expected |
| --- | --- | --- | --- |
| 0:00 | Problem: WhatsApp groups, paper registers, calls. Show `docs/process-flows/as-is-complaint.bpmn` | Presenter | Pain points clear |
| 0:40 | Register an owner with consent; sign-in blocked; committee approves | Owner, committee | Signs in after approval; audited |
| 1:30 | Owner raises "water leaking in bathroom" with a photo | Owner | Open; committee notified |
| 2:00 | Committee dashboard; confirm the AI-suggested vendor; move to in progress | Committee | Owner sees tracker move; AI only suggested |
| 2:50 | Close; family member cannot rate, owner rates 5 stars; show audit trail | Committee, owner | Rated once; who/what/when shown |
| 3:30 | Telegram: "Hi everyone", then "The lift is stuck", then "status" to @SahyandriHeightsBot (fallback: simulator) | Resident on Telegram | Chatter ignored; lift request created with reply; status list |
| 4:20 | Committee inbox: email with stage tracker and "Next step: Assign someone"; assign, then approve start and done from follow-ups | Committee (email) | Request resolved; dashboard and audit show email actions |
| 5:20 | Notice drafter: rough bullets, edit, post; mention weekly digest and 48 h SLA (automated test) | Committee | Nothing posted until the committee posts |
| 6:10 | Guard verifies a pass by 6-digit code; reuse denied; guard sees no other screen | Guard | One entry; gate log row |
| 6:50 | Society services: owner books a clubhouse slot; a second flat sees it as taken | Owner | Booking shown on home |
| 7:30 | Committee records a part UPI payment for A-101 | Committee | Status partial; resident sees own flat only |
| 8:00 | Staff takes stock out to the reorder level; committee sees low-stock alert; show the waste schedule and today's pickups | Staff, committee | Alert and schedule shown |
| 8:40 | Flutter app on the Android emulator (or APK): sign in, see requests (20 s) | Presenter | Same API, same data |
| 9:00 | Access control: committee turns off a permission; resident of that type is refused | Committee | Matrix takes effect |
| 9:30 | Close: architecture (`docs/architecture/`), tests Node 78, Java 81, React 67, Flutter 8, CI 6/6 green; what is not verified | Presenter | Honest status |

Fallbacks: if Telegram, n8n or Gmail is down, use the simulator and rule-based gate and say so. If the live URL is down, demo locally and show test output.
