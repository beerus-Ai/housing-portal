# Process flows (BPMN 2.0)

| File | Model |
| --- | --- |
| `as-is-complaint.bpmn` | Today: WhatsApp groups, paper register, phone calls |
| `to-be-complaint.bpmn` | Portal or Telegram/WhatsApp intake, AI gate and triage, committee assigns and approves each stage (dashboard or email), rating, 48 h SLA escalation |
| `to-be-email-approvals.bpmn` | Portal builds the stage email, n8n sends it, committee confirms the next step, portal runs it and emails the next step |
| `to-be-onboarding.bpmn` | Registration with DPDP consent, committee approval, household add |

Each file is one pool with lanes and diagram information, checked as well-formed XML. The review roles and society modules have no BPMN yet.

## Import into Signavio (pending)
Not yet imported into a Signavio tenant.
1. In Signavio Process Manager, right-click a folder, choose **Import** > **BPMN 2.0 XML**, pick the file.
2. Open it; use auto-layout if cramped.
3. Check task names against the tables below and add the Jira keys to each task's documentation.

Fallback viewer: demo.bpmn.io.

## Step mapping
Jira keys: `docs/jira/backlog-v2.csv` (`Signavio Step` column).

### To-be complaint
| Step | Task | Test cases |
| --- | --- | --- |
| t1 | Raise request (portal, Telegram, WhatsApp) | TC-WR-01, TC-AI-01, TC-TG-01 |
| t2 | AI gate; create request; map sender to flat | TC-AI-01, TC-AI-02, TC-TG-02 |
| t3 | AI triage with PII stripping and fallback | TC-AI-03, TC-AI-04 |
| t4 | Committee assigns (dashboard or email) | TC-WR-03, TC-EM-01 |
| t5 | Notify, email next step, audit | TC-NO-01, TC-AD-02, TC-EM-02 |
| t6, t7 | Work, approve start, approve done | TC-WR-04, TC-WR-05, TC-EM-02 |
| t8 | Rate | TC-WR-06 |
| b1, t9 | 48 h SLA escalation | TC-AI-06 |

### To-be email approvals
| Step | Task | Test cases |
| --- | --- | --- |
| s1, t1 | Build the email when no admin is on the dashboard | TC-EM-01, TC-EM-03 |
| t2 | n8n sends it with Gmail | TC-EM-01 |
| t3 | Committee clicks and confirms | TC-EM-01, TC-EM-02 |
| t4, g1 | Portal runs the action; follow-up until resolved | TC-EM-02, TC-EM-04 |

### To-be onboarding
| Step | Task | Test cases |
| --- | --- | --- |
| t1, g0 | Form and consent validation | TC-ON-01, TC-ON-02 |
| t2 | Create pending account, notify committee | TC-ON-01 |
| t3, g1, t4, t5 | Committee decision | TC-ON-03, TC-ON-04 |
| t6 | Owner adds household | TC-ON-05 |

### As-is complaint
Baseline. Pain points: no tracking (t3, t4), no committee visibility (g1), scattered vendor records (t5).
