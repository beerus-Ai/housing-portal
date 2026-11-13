# n8n workflows (housing project)

These belong to the Sahyadri Heights housing project (Jira HSP-31). They are saved in the team n8n cloud account (voltedge-demo31.app.n8n.cloud, Personal project) as "Sahyadri: ...", inactive until the Config nodes are filled. That account also hosts unrelated VoltEdge workflows; do not edit those.

Three importable workflows that put the portal inside your automation stack. They were test-imported into a clean n8n 2.29 install; they have **not** been run against live WhatsApp.

| File | What it does |
|---|---|
| `whatsapp-intake.json` | Receives WhatsApp messages from your provider (Meta Cloud API, Twilio, ...), forwards them to `/api/whatsapp/webhook`, and answers Meta's verification handshake. |
| `phone-call-intake.json` | A caller describes the problem; a voice provider (Twilio style, form data with From and SpeechResult) posts the transcript, which goes through the same intake as WhatsApp. No audio is stored. |
| `weekly-digest.json` | Every Monday 09:00: log in as the committee admin, fetch `/api/admin/digest`, send it to the committee on WhatsApp. |
| `sla-escalation-alert.json` | Every 15 minutes: run `/api/admin/escalations/run`; if anything was escalated, alert the committee on WhatsApp. |

## Import
1. Open n8n (http://localhost:5678 locally), **Workflows > Import from file**, pick each JSON.
2. In each workflow open the **Config** node and fill: `portal_url`, `webhook_secret` (portal > Settings > AI and WhatsApp), `admin_password`, `whatsapp_phone_id`, `whatsapp_token`, `committee_whatsapp`. Nothing is read from environment variables.
3. For intake, copy the Production URL of the *WhatsApp message* webhook node into your WhatsApp provider as the callback URL; use any token you like for the verify handshake only if you also set `WHATSAPP_WEBHOOK_SECRET` on the portal to that value.
4. Activate the workflows.

Credentials stay in your n8n instance. Replace the final HTTP node in the digest/alert workflows with Email or Slack if you prefer.

## Sahyadri: admin email desk (`admin-email-desk.json`)
Emails the committee every new complaint, message to check, registration and emergency when nobody has the dashboard open
(emergencies always). The portal builds the email with signed action buttons (assign vendor, start, close, reply,
approve/dismiss AI suggestion, approve/reject resident, create/dismiss review message, resolve emergency). Each button
opens a confirm page at `/desk/<token>` on the portal, which runs the same API route as the dashboard (audited).

Setup: import, connect the Gmail credential on both Gmail nodes, change the webhook path `sahyadri-admin-email-CHANGE-ME`
to a random secret path, publish, then set `ADMIN_EMAIL_WEBHOOK_URL=https://<n8n-host>/webhook/<that path>` on the portal.
Optional portal env: `PUBLIC_URL` (link base; Render's RENDER_EXTERNAL_URL is used otherwise), `EMAIL_ACTION_SECRET` (link signing key).
