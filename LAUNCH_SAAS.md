# Launching the paid service — runbook

Everything in the repo is built. This is the wiring that has to happen outside it, in
order. Nothing here is automatable: BotFather is interactive-only, and Stripe keys and
webhook secrets are created by hand.

Target project: the **commercial** Supabase project (not the personal one). Its schema is
already applied — `supabase/migrations/` followed by `supabase/migrations-saas/`.

---

## What the customer experiences

```
Payment Link  →  Stripe Checkout  →  success_url hits stripe-billing
                                          │  verifies the session, creates the tenant
                                          ▼
                                     302 → t.me/<bot>?start=<code>
                                          │  Telegram sends "/start <code>"
                                          ▼
                                   2 taps: languages, then he/she
                                          │
                                          ▼
                                   invite link for their partner
                                          │  partner taps, picks he/she
                                          ▼
                                     both set up, code retired
```

No website, no email, no manual step from you. The only thing you hand out is the Payment
Link.

---

## Step 1 — Create the bot *(Telegram / @BotFather)*

One bot serves **every** tenant, unlike the single-tenant product where each couple gets
their own.

1. `/newbot` → display name + a username ending in `bot`. Save the token.
2. `/setprivacy` → **Disable**. The bot must see all messages in a group; with privacy on
   it only sees commands and replies.
3. Note the **username without the @** — it becomes `TELEGRAM_BOT_USERNAME`, and the
   partner invite link is built from it.

> Use a *different* bot from your personal Capybara. Same token in two places means both
> projects receive every update.

## Step 2 — Stripe products and prices *(Stripe dashboard, test mode first)*

> **Test mode is not an alternative to creating things — it is a separate world.** Stripe
> keeps two of everything: products, prices, Payment Links, webhook endpoints and API
> keys all exist independently in test and live mode, and nothing is ever promoted from
> one to the other. So you create real objects here, while the **Test mode** toggle
> (top-right) is on, and then create them all again in live mode at Step 8.
>
> A test-mode Payment Link is a real, shareable URL; it simply refuses real cards and
> accepts `4242 4242 4242 4242`. Test price ids look exactly like live ones
> (`price_1abc…`) but only work with an `sk_test_…` key — if a price id ever appears not
> to exist, a test/live mismatch is almost always the reason.
>
> Build everything with the toggle ON. Creating it in the wrong mode is harmless but
> leaves half the configuration in the world you are not using.

1. Create one product, **two recurring monthly prices** — standard and heavy. Copy both
   price ids (`price_…`).
2. Decide the quotas. For calibration: your own traffic is ~1,650 messages/month, which
   costs about **$25/month** in Anthropic + OpenAI spend. Annotation is ~85% of that. Set
   the price above the quota's worst-case API cost, not above the average.
3. **Create a Payment Link** for each price. Under *After payment* → **Redirect to a page
   you specify**, set:

   ```
   https://<commercial-ref>.supabase.co/functions/v1/stripe-billing?session_id={CHECKOUT_SESSION_ID}
   ```

   `{CHECKOUT_SESSION_ID}` is substituted by Stripe. That URL is the whole onboarding
   handoff — get it wrong and paying customers land nowhere.

4. **Enable the customer portal** (*Settings → Billing → Customer portal*), allowing plan
   switching and cancellation. `/billing` mints links into it; without it that command
   degrades to a read-only summary.

## Step 3 — Function secrets *(Supabase → commercial project → Edge Functions → Secrets)*

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do not set them.

| Secret | Used by | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | bot **+ billing** | From step 1. Billing needs it to warn the couple when a payment fails |
| `TELEGRAM_BOT_USERNAME` | bot + billing | No `@`. Builds the deep links |
| `WEBHOOK_SECRET` | bot | Any long random string; also goes in the setWebhook call |
| `ANTHROPIC_API_KEY` | bot | |
| `OPENAI_API_KEY` | bot | Whisper + embeddings |
| `SUPERADMIN_TELEGRAM_ID` | bot | **You.** Gates deploys, the grinds, and diagnostics. Not a customer |
| `STRIPE_SECRET_KEY` | billing + bot | `sk_test_…` first. Also used by `/delete_account` to cancel the subscription |
| `STRIPE_WEBHOOK_SECRET` | billing | `whsec_…`, from step 5 |
| `STRIPE_PRICE_STANDARD` | billing | `price_…` |
| `STRIPE_PRICE_HEAVY` | billing | `price_…` |
| `QUOTA_STANDARD` | billing | Messages/period. Defaults to 3000 |
| `QUOTA_HEAVY` | billing | Defaults to 10000 |

Optional (`/update` self-deploy, inert if unset): `GITHUB_DEPLOY_TOKEN`, `GITHUB_REPO`,
`GITHUB_DEPLOY_BRANCH`.

## Step 4 — Deploy both functions

Actions → **deploy** → Run workflow, type `deploy`, and **set `project_ref` to the
commercial ref every time**. Run it twice:

- `function_name: telegram-bot-saas`
- `function_name: stripe-billing`

The gate, the CLI-from-disk deploy and the health smoke test all run per function. The
billing smoke test fails unless the Stripe secrets, the bot username and both price ids
are set — so a half-configured deploy is caught rather than discovered by a customer.

> Never dispatch with `project_ref` pointing at the personal project. That would put a
> schema expecting `tenant_id` on top of the live personal database.

## Step 5 — Register the Stripe webhook *(Stripe dashboard)*

Endpoint URL:

```
https://<commercial-ref>.supabase.co/functions/v1/stripe-billing
```

Events: `checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`.

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`, then **redeploy `stripe-billing`**
so it picks the secret up.

## Step 6 — Point the Telegram webhook at the bot

```bash
curl -sS "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<commercial-ref>.supabase.co/functions/v1/telegram-bot-saas" \
  -d "secret_token=<WEBHOOK_SECRET>"
```

## Step 7 — End-to-end test, in test mode

1. Pay through the Payment Link with card `4242 4242 4242 4242`.
2. You should be redirected into Telegram with the code pre-filled. Complete the two taps.
3. Send a message — it should translate.
4. Open the invite link from a **second Telegram account**, complete the one tap, and
   confirm both accounts now see each other's messages.
5. `/billing` → confirm plan, usage, and that the portal link opens.
6. Cancel in the portal → confirm **both** partners get the "subscription has ended"
   message, and that the bot then refuses and points at `/billing`.
7. Reactivate → confirm the "active again" message arrives.
8. `/delete_account` from the **partner** → must be refused (owner-only). Then from the
   owner → confirm the warning lists the right message count, and that confirming
   cancels the subscription in Stripe, empties `<tenant_id>/` in the `voice-messages`
   bucket, and leaves `select count(*) from public.tenants` one lower.

Then check isolation directly, because it is the one failure that is invisible from
inside a single account:

```sql
-- Every tenant-owned table should show one row per tenant, never a shared row.
select tenant_id, count(*) from public.messages group by 1;
-- Expect zero: a row belonging to nobody.
select count(*) from public.messages m
  left join public.tenants t on t.id = m.tenant_id where t.id is null;
```

## Step 8 — Go live

Swap Stripe to live mode: new `sk_live_…`, new price ids, a new webhook endpoint and
signing secret, new Payment Links. Update the secrets, redeploy `stripe-billing`, and run
step 7 once with a real card.

---

## Operating notes

**Quota is counted per inbound message**, not per API call, and consumed before any model
call. One message is one translation plus two annotation passes, so a tenant at the cap
has cost you roughly `quota × $0.015`.

**Comping an account:** set `message_quota = NULL` on the tenant. NULL means uncapped;
`status` still has to be `active`.

**`/tenants`** (superadmin) is the service-wide view: signups needing attention first,
then subscription and plan counts, then usage and estimated API spend. The line to watch
is *paid but never set up* — a customer charged with nothing to show for it, who is one
step from a chargeback. Revenue is deliberately not shown; that lives in Stripe and a
copy here would only go stale.

**Refunds and disputes** flow through the subscription events, so a refunded customer
loses access on the next message without you doing anything.

**A customer changing plan mid-period** keeps their usage count — the quota changes, the
counter does not reset. The reset happens on the first message after
`current_period_end`, which stays aligned with what Stripe bills.

## Retention

There is **no automatic deletion**. The 30-day `capybara-pii-retention` cron inherited
from the single-tenant schema is unscheduled and `delete_expired_pii` is dropped
(`migrations-saas/20260726000500`) — on a product selling a study corpus and a searchable
memory, a job that silently erases both after a month destroys what the customer pays for.

Data therefore lives as long as the account does. `/delete_account` is the customer's own
route out: owner-only, two-step, and it cancels the subscription, removes the Storage
audio, then deletes the tenant row (which cascades to every table). That order is
deliberate — if anything fails partway, the customer has stopped being charged.

## Known gaps

- **No card-expiry warning.** A failed payment now messages the couple in Telegram, but
  nothing warns them *before* a card expires. Stripe can email that on its own.

- **A cancelled customer keeps their data indefinitely** unless they run
  `/delete_account`. If that becomes a storage or liability concern, a "deleted N days
  after cancellation" job is the natural fix — deliberately not built, because it is the
  same invisible-clock behaviour that was just removed.
