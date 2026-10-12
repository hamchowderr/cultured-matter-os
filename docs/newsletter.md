# Newsletter (FluentCRM)

The app keeps the newsletter list. FluentCRM, on her WordPress site, sends the emails.

- **People page:** the envelope button on a contact card adds them to the newsletter or takes them off. A contact needs an email address to be added. The strip above the cards shows how many people are on the list and how many changes are waiting. Click the count to show only newsletter people.
- **Sync newsletter:** sends the waiting changes to the FluentCRM list (`FLUENTCRM_LIST_ID`). Only contacts that changed since the last sync are sent.
  - A contact that is new in FluentCRM is created as `subscribed` on the list.
  - A contact that FluentCRM already has is added to the list, and their FluentCRM status is not changed.
  - A contact that FluentCRM has as `unsubscribed`, `bounced` or `complained` is **never** subscribed again from the app. Their newsletter flag is cleared in the app.
  - A contact whose flag was turned off in the app is removed from the list. They stay in FluentCRM.
  - A contact that fails stays in the queue for the next sync. If FluentCRM rejects the login, the sync stops after the first call.
- **Unsubscribes** come back from FluentCRM through a webhook and clear the flag. No sync is needed after this.
- **Website signups** go to the app first through the signup endpoint. The next sync sends them to FluentCRM.

Until the four `FLUENTCRM_*` settings hold real values, the People page says the newsletter is not connected yet. She can still mark people. They are sent when the connection is set up.

## Sending (FluentSMTP + toSend)

FluentCRM sends through FluentSMTP, and FluentSMTP sends through [toSend](https://tosend.com/docs/) (by the FluentCRM team). The From address is `newsletter@culturedmatter.com`, a free alias on her Google Workspace account, so replies reach her normal inbox. Google Workspace itself is not used for sending: it caps an account at about 2,000 recipients a day, and bulk mail from her mailbox would hurt her everyday email.

1. **Domain.** toSend → Domains → add `culturedmatter.com`, then add these records in Cloudflare ([toSend: domains](https://tosend.com/docs/guide/domains/)):

   | Type | Name | Value |
   | --- | --- | --- |
   | TXT | `tosend._domainkey` | The DKIM key shown in the toSend dashboard (unique to the account) |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` |
   | MX | `send` (priority 10) | `feedback-smtp.us-east-1.amazonses.com` (EU accounts: `eu-central-1`) |
   | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:<her address>`, added after the others verify |

   The `send` records carry bounces and do not touch her inbox (the root MX stays Google's). The domain also needs Google's own records for her everyday mail: root SPF `v=spf1 include:_spf.google.com ~all` and Google's DKIM (`google._domainkey`, from the Google Admin console). Copy names and values from the toSend dashboard, which shows the exact ones for the domain. toSend re-checks DNS every 10 minutes.

2. **API key.** toSend → API Keys → create one restricted to `culturedmatter.com`. It is shown once. Store it in Infisical, not in the WordPress database.
3. **FluentSMTP** (2.2.95 or later). Settings → Add Connection → toSend. From Email `newsletter@culturedmatter.com`, From Name "Simone Paz, Cultured Matter", Force From Email on. Store the key in `wp-config.php` as `define( 'FLUENTMAIL_TOSEND_API_KEY', '…' );`, with the value passed in from the Coolify environment ([FluentSMTP: toSend](https://docs.fluentsmtp.com/connect-tosend-with-fluentsmtp)).
4. **Bounces and complaints.** FluentCRM → Settings → Email Service → Bounce Handler: choose toSend and copy the URL. In toSend → Webhooks, create a webhook to that URL with the bounced and complaint events ([FluentCRM: bounce handling with toSend](https://docs.fluentcrm.com/bounce-handling-with-tosend)). FluentCRM then marks those contacts `bounced` or `complained`, which the sync above never subscribes again. toSend does not retry a failed webhook; its Logs and Suppressions pages are the record if one is missed. toSend also blocks hard bounces for 60 days and complaints for 180 days on its side.
5. **Test.** Send a test from FluentSMTP, then a test campaign to her, and check it lands in the inbox.

Cost is pay-as-you-go, about $0.30 per 1,000 emails.

## Settings

| Name                        | Value                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `FLUENTCRM_URL`             | The WordPress site address, `https://…` (HTTPS is required)                        |
| `FLUENTCRM_USER`            | The WordPress **username** (not the email address) of the API user                 |
| `FLUENTCRM_APP_PASSWORD`    | An application password for that user                                              |
| `FLUENTCRM_LIST_ID`         | The numeric ID of the newsletter list                                              |
| `NEWSLETTER_WEBHOOK_SECRET` | A random string of 16 or more characters, shared with FluentCRM's outgoing webhook |

The values go in Infisical and in Vercel. Do not put them in git.

## Setting up her FluentCRM install

1. **API user.** With FluentCRM Pro, add a dedicated CRM manager (FluentCRM → Settings → CRM Managers) that can read and manage contacts. Do not use an administrator. The free version only allows a user that can manage FluentCRM, which is usually an administrator.
2. **Application password.** Go to Users → that user → Application Passwords. Add one named "Cultured Matter OS" and copy it (WordPress shows it only once). This becomes `FLUENTCRM_APP_PASSWORD`.
3. **List.** Create the newsletter list (FluentCRM → Contacts → Lists). Its ID is in the list's URL or the lists table. This becomes `FLUENTCRM_LIST_ID`.
4. **Unsubscribe webhook (needs FluentCRM Pro for automations).** Create an automation:
   - Trigger: **List Removed** (the newsletter list). Also add the contact-unsubscribed trigger if the install has it.
   - Action: **Outgoing Webhook**. Method POST, URL `https://<app domain>/api/newsletter/webhook`, format JSON, data **Full Subscriber Data**, and a request header `X-Webhook-Secret: <NEWSLETTER_WEBHOOK_SECRET>`.

   The endpoint reads `email` (and `id`) from the top level of the payload, or from inside `subscriber` or `contact`. It also accepts `Authorization: Bearer <secret>` in place of the header.

5. **Live test.** Set the five values and run Sync newsletter from People with one test contact. Check that the contact is on the list in FluentCRM. Then unsubscribe the contact in FluentCRM and check that the flag clears in the app.

## Endpoints

These two endpoints are public: `proxy.ts` lets them through without a session.

### `POST /api/newsletter/webhook`

- Needs the shared secret (`X-Webhook-Secret` header or Bearer token). A missing or wrong secret gets `401`.
- If `NEWSLETTER_WEBHOOK_SECRET` is unset, a placeholder or shorter than 16 characters, every call gets `503`.
- Body (JSON or form): `{ "email": "…", "id": 123 }`.
- Reply: `{ ok, matched, changed }`. An email that is not in People is accepted and does nothing.

### `POST /api/newsletter/signup`

- Body (JSON, urlencoded or multipart): `email` (required), plus `name`, or `first_name` and `last_name`.
- If the email exists (case-insensitive), the app flags that contact and keeps its name. If not, the app creates a contact with source `newsletter_signup`.
- Reply: always `{ "ok": true }` on success, for new and existing emails alike, so the endpoint cannot be used to find out which emails are in People. A bad email gets `400`.
- CORS is open (`*`), so a form on another site can post to it with `fetch`.

**Abuse protection: a honeypot plus a per-IP rate limit.**

- _Honeypot._ A field named `website` that people never see. If it has a value, the request gets `200` and nothing is saved. Bots fill every field, so this stops most form spam with no extra step for real visitors. A CAPTCHA would need a widget on the Squarespace side, and the Zapier path cannot pass one.
- _Rate limit._ 10 signups per IP address in 10 minutes. Above that, the request gets `429`. The counter is in memory, so each warm Vercel instance has its own counter. This slows a flood but does not stop a determined attacker.
- _What a flood can do._ It can only add flagged contacts. It cannot remove contacts or read data. Nothing reaches FluentCRM until she clicks Sync, so she sees the new contacts in People first.
- _Next step if spam starts._ Add Cloudflare Turnstile to the custom form, or a shared token header on the Zapier step.

## Getting Squarespace signups to the app

Squarespace form and newsletter blocks cannot post to an external URL. Their storage options are email, Google Drive, Mailchimp and Zapier ([Squarespace: form storage](https://support.squarespace.com/hc/en-us/articles/205814638-Set-up-form-and-newsletter-storage)). Two paths work:

1. **Zapier (recommended, no code).** In the Squarespace form block, go to Storage → Zapier, then build a Zap:
   - Trigger: **Squarespace → New Form Submission**.
   - Action: **Webhooks by Zapier → POST** to `https://<app domain>/api/newsletter/signup`, payload type JSON, data `email` and `name` mapped from the form fields.

   _Webhooks by Zapier_ is a premium app, so this needs a paid Zapier plan. Zapier sends from shared IPs, which is why the rate limit is per IP and generous rather than strict. The honeypot does not apply on this path, because the Zap sends only the mapped fields. ([Squarespace: Zapier](https://support.squarespace.com/hc/en-us/articles/360000641507-Adding-form-integrations-with-Zapier))

2. **Custom form in a Code Block (no Zapier).** Replace the form block with an HTML form in a Code Block. Its script posts to the signup endpoint with `fetch` and includes a hidden `website` field (the honeypot). This costs nothing, but the form has to be styled by hand, and Code Blocks need a plan that allows them.

The FluentCRM sync sends website signups on her next Sync click. The app does not push them to FluentCRM automatically.
