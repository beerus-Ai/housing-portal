# n8n workflows

Three importable workflows that put the portal inside your automation stack. They were test-imported into a clean n8n 2.29 install; they have **not** been run against live WhatsApp.

| File | What it does |
|---|---|
| `whatsapp-intake.json` | Receives WhatsApp messages from your provider (Meta Cloud API, Twilio, ...), forwards them to `/api/whatsapp/webhook`, and answers Meta's verification handshake. |
| `weekly-digest.json` | Every Monday 09:00: log in as the committee admin, fetch `/api/admin/digest`, send it to the committee on WhatsApp. |
| `sla-escalation-alert.json` | Every 15 minutes: run `/api/admin/escalations/run`; if anything was escalated, alert the committee on WhatsApp. |

## Import
1. Open n8n (http://localhost:5678 locally), **Workflows > Import from file**, pick each JSON.
2. In each workflow open the **Config** node and fill: `portal_url`, `webhook_secret` (portal > Settings > AI and WhatsApp), `admin_password`, `whatsapp_phone_id`, `whatsapp_token`, `committee_whatsapp`. Nothing is read from environment variables.
3. For intake, copy the Production URL of the *WhatsApp message* webhook node into your WhatsApp provider as the callback URL; use any token you like for the verify handshake only if you also set `WHATSAPP_WEBHOOK_SECRET` on the portal to that value.
4. Activate the workflows.

Credentials stay in your n8n instance. Replace the final HTTP node in the digest/alert workflows with Email or Slack if you prefer.
