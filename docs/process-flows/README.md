# Process flows (BPMN 2.0)

| File | Model |
| --- | --- |
| `as-is-complaint.bpmn` | How complaints work today: WhatsApp groups, paper register, phone calls |
| `to-be-complaint.bpmn` | Portal and WhatsApp intake, AI triage, committee confirmation, vendor, resolved, rating, 48h SLA escalation |
| `to-be-onboarding.bpmn` | Registration with DPDP consent, committee approval, optional household add |

Each file is a BPMN 2.0 collaboration with one pool, swim lanes, and `bpmndi` diagram information (shapes and edges), so it renders on import.

## Import into Signavio
1. Open Signavio Process Manager and choose a folder.
2. Right-click the folder, then **Import** (the exact menu label may differ by version), choose **BPMN 2.0 XML**, and select the `.bpmn` file.
3. Open the imported diagram. If the layout looks cramped, use Signavio's auto-layout or drag shapes; the logic is unaffected.
4. Check each task name against the table below, then link the Jira keys in the task's documentation field.

The files were generated and checked as well-formed XML; they have not yet been imported into a Signavio tenant, so the first import is the real test. They also open in bpmn.io (demo.bpmn.io) if Signavio is not available.

## Step to Jira story area mapping
Jira keys are in `docs/jira/backlog-v2.csv` (`Signavio Step` column holds the step id used here).

### To-be complaint (`to-be-complaint.bpmn`)
| Step id | Task | Story area | Test cases |
| --- | --- | --- | --- |
| t1 | Raise request in portal or WhatsApp | Work requests; WhatsApp intake | TC-WR-01, TC-AI-01 |
| t2 | Create request; webhook maps phone to flat | WhatsApp intake (AI epic) | TC-AI-01, TC-AI-02 |
| t3 | AI triage with PII stripping and fallback | AI triage (AI epic) | TC-AI-03, TC-AI-04 |
| t4 | Committee reviews and assigns | Work requests (assign) | TC-WR-03 |
| t5 | Notify resident and audit | Notifications; Audit | TC-NO-01, TC-AD-02 |
| t6, t7 | Work and close | Work requests (lifecycle) | TC-WR-04, TC-WR-05 |
| t8 | Rate | Work requests (rating) | TC-WR-06 |
| b1, t9 | 48h SLA and escalation | SLA timers (AI epic) | TC-AI-06 |

### To-be onboarding (`to-be-onboarding.bpmn`)
| Step id | Task | Story area | Test cases |
| --- | --- | --- | --- |
| t1, g0 | Form and consent validation | Onboarding | TC-ON-01, TC-ON-02 |
| t2 | Create pending account, notify committee | Onboarding | TC-ON-01 |
| t3, g1, t4, t5 | Committee decision | Onboarding (approval) | TC-ON-03, TC-ON-04 |
| t6 | Owner adds household | Household | TC-ON-05 |

### As-is complaint (`as-is-complaint.bpmn`)
Baseline only. Pain points it shows map to the brief's three problems: no tracking (t3, t4), no committee visibility (g1), scattered vendor records (t5).
