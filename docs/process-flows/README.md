# Process flows (BPMN 2.0)

| File | Model |
| --- | --- |
| `as-is-complaint.bpmn` | How complaints work today: WhatsApp groups, paper register, phone calls |
| `to-be-complaint.bpmn` | Portal, Telegram and WhatsApp intake, AI gate and triage, committee assigns and approves each stage (dashboard or email), vendor, resolved, rating, 48h SLA escalation |
| `to-be-email-approvals.bpmn` | Committee drives a request through its stages from email: portal builds the email, n8n sends it with Gmail, committee clicks the next-step button and confirms, portal runs the dashboard action and emails the next step until nothing is left |
| `to-be-onboarding.bpmn` | Registration with DPDP consent, committee approval, optional household add |

Each file is a BPMN 2.0 collaboration with one pool, swim lanes, and `bpmndi` diagram information (shapes and edges), so it renders on import.

## Import into Signavio
1. Open Signavio Process Manager and choose a folder.
2. Right-click the folder, then **Import** (the exact menu label may differ by version), choose **BPMN 2.0 XML**, and select the `.bpmn` file.
3. Open the imported diagram. If the layout looks cramped, use Signavio's auto-layout or drag shapes; the logic is unaffected.
4. Check each task name against the table below, then link the Jira keys in the task's documentation field.

The files were generated and checked as well-formed XML (updated 2026-11-14 for Telegram and the email approvals); they have not yet been imported into a Signavio tenant, so the first import is the real test. They also open in bpmn.io (demo.bpmn.io) if Signavio is not available.

## Step to Jira story area mapping
Jira keys are in `docs/jira/backlog-v2.csv` (`Signavio Step` column holds the step id used here).

### To-be complaint (`to-be-complaint.bpmn`)
| Step id | Task | Story area | Test cases |
| --- | --- | --- | --- |
| t1 | Raise request in portal, Telegram or WhatsApp | Work requests; Telegram and WhatsApp intake | TC-WR-01, TC-AI-01, TC-TG-01 |
| t2 | AI gate; create request; map sender to flat | Message gate and intake (AI epic) | TC-AI-01, TC-AI-02, TC-TG-02 |
| t3 | AI triage with PII stripping and fallback | AI triage (AI epic) | TC-AI-03, TC-AI-04 |
| t4 | Committee assigns (dashboard or email) | Work requests (assign); Email desk | TC-WR-03, TC-EM-01 |
| t5 | Notify resident, email committee the next step, audit | Notifications; Audit; Email desk | TC-NO-01, TC-AD-02, TC-EM-02 |
| t6, t7 | Work, approve start, approve done | Work requests (lifecycle); Email desk | TC-WR-04, TC-WR-05, TC-EM-02 |
| t8 | Rate | Work requests (rating) | TC-WR-06 |
| b1, t9 | 48h SLA and escalation | SLA timers (AI epic) | TC-AI-06 |

### To-be email approvals (`to-be-email-approvals.bpmn`)
| Step id | Task | Story area | Test cases |
| --- | --- | --- | --- |
| s1, t1 | Build the email (stage, next step, signed buttons) when no admin is on the dashboard | Email desk (HSP-42) | TC-EM-01, TC-EM-03 |
| t2 | n8n sends it with Gmail | Email desk (n8n) | TC-EM-01; live run 2026-11-13 |
| t3 | Committee clicks the next-step button and confirms | Email desk | TC-EM-01, TC-EM-02 |
| t4, g1 | Portal runs the dashboard action; follow-up email until resolved | Email desk | TC-EM-02, TC-EM-04 |

### To-be onboarding (`to-be-onboarding.bpmn`)
| Step id | Task | Story area | Test cases |
| --- | --- | --- | --- |
| t1, g0 | Form and consent validation | Onboarding | TC-ON-01, TC-ON-02 |
| t2 | Create pending account, notify committee | Onboarding | TC-ON-01 |
| t3, g1, t4, t5 | Committee decision | Onboarding (approval) | TC-ON-03, TC-ON-04 |
| t6 | Owner adds household | Household | TC-ON-05 |

### As-is complaint (`as-is-complaint.bpmn`)
Baseline only. Pain points it shows map to the brief's three problems: no tracking (t3, t4), no committee visibility (g1), scattered vendor records (t5).
