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
                        3 taps: native lang, learning lang, he/she
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

1. Create one product, **two recurring monthly prices** — Capybara and Capybara Ultimate.
   Copy both price ids (`price_…`).
2. Decide the quotas. Defaults are **750** (Standard) and **2500** (Ultimate); the
   `QUOTA_*` secrets below override them.

   Calibration: your own traffic is ~1,650 messages/month, which cost about **$25/month**
   before any of the annotation work. The rate now is **~$0.007/message** — calibrated
   against real spend, since the cost model came in 20% under the actual bill. A tenant
   sitting at the cap therefore costs roughly **$5.25** (Standard) or **$17.50** (Ultimate)
   in inference.

   Add Stripe (2.9% + $0.30 per charge) and price above the *cap* cost rather than the
   average — a quota exists so customers may reach it. That puts the break-even floor at
   about **$5.72** (Standard) and **$18.30** (Ultimate); $10–12 and $29–39 clear it with
   room. Supabase adds nothing while the project is on the free tier (see
   "Storage and the free tier" below).

   Re-derive `$/message` from the Anthropic console after a month of real traffic rather
   than trusting the figure above; divide real spend by real message count.
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
| `STRIPE_PRICE_ULTIMATE` | billing | `price_…` |
| `QUOTA_STANDARD` | **bot + billing** | Messages/period. Defaults to 750. Billing provisions it, the bot advertises it |
| `QUOTA_ULTIMATE` | **bot + billing** | Messages/period. Defaults to 2500. Same |
| `STRIPE_PAYMENT_LINK_STANDARD` | bot | The Payment Link from step 2. Without it the intro shows no Standard button |
| `STRIPE_PAYMENT_LINK_ULTIMATE` | bot | Same, for Ultimate |
| `STRIPE_PRICE_STANDARD` | **bot** + billing | The bot reads the live amount so displayed price always matches what is charged |
| `STRIPE_PRICE_ULTIMATE` | **bot** + billing | Same |

> **Changing a quota means redeploying BOTH functions.** `stripe-billing` provisions the
> number; `telegram-bot-saas` advertises it in the intro. They read the same two secrets,
> but each picks them up only at its own next deploy — so shipping one and not the other
> means customers are quoted a cap they will not be given.
>
> Supabase will not show you a secret's value after it is set, so don't try to remember
> which state you're in. Ask both:
>
> ```bash
> for fn in stripe-billing telegram-bot-saas; do
>   echo -n "$fn: "
>   curl -s "https://<commercial-ref>.supabase.co/functions/v1/$fn?health" \
>     | grep -o '"quota[^,}]*' | tr '\n' ' '; echo
> done
> ```
>
> The two lines must agree. `stripe-billing` additionally reports `quotaSource`, saying
> whether each number came from a secret or from the code default.

There is no `/update` self-deploy command in this build and no `GITHUB_*` secrets to set.
The single-tenant bot has one; here a single tap would redeploy the function serving every
tenant at once, so deploys go through the Actions workflow only.

## Step 4 — Register the Stripe webhook *(Stripe dashboard, test mode)*

**Before deploying, not after.** stripe-billing's health route reports
`stripeConfigured` only when BOTH `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are
set, and the deploy smoke test asserts it — so deploying first guarantees a red run.
Stripe does not check that an endpoint URL responds when you create it, so the endpoint
can be registered while the function does not yet exist.

Endpoint URL:

```
https://<commercial-ref>.supabase.co/functions/v1/stripe-billing
```

Events: `checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`.

Copy the signing secret (`whsec_…`) into the `STRIPE_WEBHOOK_SECRET` function secret.
That completes the twelve secrets, and the deploy below can pass.

## Step 5 — Deploy both functions

Actions → **deploy** → Run workflow, type `deploy`, and **set `project_ref` to the
commercial ref every time**. Run it twice:

- `function_name: telegram-bot-saas`
- `function_name: stripe-billing`

The gate, the CLI-from-disk deploy and the health smoke test all run per function. The
billing smoke test fails unless the Stripe secrets, the bot username and both price ids
are set — so a half-configured deploy is caught rather than discovered by a customer.

> Never dispatch with `project_ref` pointing at the personal project. That would put a
> schema expecting `tenant_id` on top of the live personal database.

Delete the stale `telegram-bot` function from this project while you are here: it is the
single-tenant build left over from an earlier experiment, and leaving it beside
`telegram-bot-saas` invites deploying to the wrong one.

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
call. One message is one translation plus one annotation pass, so a tenant at the cap has
cost you roughly `quota × $0.007`.

**One** annotation pass, not two, since `saas-v14`. Both builds now annotate only what a
human wrote, never the machine translation of it — `ANNOTATE_TRANSLATION_SIDE`, with
`migrations-saas/20260727000200` stopping `/backfill` from offering the other side.

That was originally a personal-bot-only change, on the grounds that halving a subscriber's
flashcards is a product decision rather than a cost one. Pricing settled it: at $0.012 a
Standard subscriber at cap cost $9.00, pinning the floor near $9.58 and making any price
under $12 a loss on heavy users. The half that was cut is the one sourced from Claude's
output rather than from a partner's actual writing — measured on the personal corpus, the
remaining half is 53% of Ukrainian and 48% of English card supply, all of it human-written.

**Changing a `QUOTA_*` secret does not move existing customers.** The quota is copied onto
`tenants.message_quota` at provisioning and rewritten only on a plan change, so a new value
applies to new subscribers and to anyone who switches plan. To move everyone already on a
plan, update the rows directly:
`update public.tenants set message_quota = 750 where plan = 'standard' and message_quota is not null;`
(`NULL` means uncapped — a comped account — so the `is not null` guard matters.)

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

## The free trial

A stranger who finds the bot on Telegram gets an intro (what it does, both plans with
**live prices read from Stripe**, and buttons) plus **5 free messages**. It exists because
the bot used to describe the product and then dead-end — there was no way to subscribe from
inside Telegram at all, so the only route in was a Payment Link pasted by hand.

This is the one path where somebody who has never paid causes API spend, so it is fenced:

| Limit | Where |
|---|---|
| 5 messages per Telegram id, **lifetime** | `TRIAL_MESSAGE_LIMIT`, enforced in `consume_trial_message` |
| Instance-wide ceiling per day | `TRIAL_DAILY_CAP` (500 ≈ $6/day worst case) |
| Text only, ≤500 chars, private chats only | Checked before any model call |
| Annotation on the **first** message only | It is ~83% of per-message cost |

Both counters move inside one locked SQL statement, so two simultaneous messages cannot
both spend the last one. Unlike the paid gate it fails **closed**: a database error denies
a stranger rather than granting free inference.

**Nothing a trial user sends is stored.** Text is translated and discarded — there is no
tenant to own it, and a row in `messages` with a null `tenant_id` would break the orphan
check in step 7. `trial_users` holds a Telegram id, a language pair and a counter.

That row is permanent by design: the allowance is lifetime, so deleting old rows would hand
every past visitor a fresh five messages. There is deliberately no retention job for it.

To watch the cost:

```sql
select day, messages_used from public.trial_daily_usage order by day desc limit 14;
select count(*) filter (where messages_used >= 5) as exhausted,
       count(*)                                   as visitors
  from public.trial_users;
```

Comping someone extra trial messages is `update public.trial_users set messages_used = 0
where telegram_id = ...`.

## Storage and the free tier

The commercial project runs on the Supabase **free tier**, so there is no monthly bill and
every subscriber is profitable from the first one. What it costs instead is headroom.

Nothing is ever deleted (see Retention below — that is deliberate), and embeddings are
~6 KB per message before indexes, an order of magnitude more than the message text. So the
database only grows, and grows **faster the better the product does**: roughly 4 MB per
couple per month at the Standard cap. Against a 500 MB ceiling that is somewhere near 100
couple-months — a year at 8 couples, half that at 16.

`/tenants` reports size against the ceiling and flags at 60%. Two triggers worth setting:

- **First paying customer who isn't you** → start taking a weekly `pg_dump`. The free tier
  has **no backups and no point-in-time recovery**, and on a product whose value is a
  private history that is a worse exposure than running out of space. It is also the silent
  one: storage limits announce themselves, data loss does not.
- **~5 paying couples, or past 300 MB** → move to Pro. At that point $25/month is under
  three subscribers' margin, and you are buying backups more than storage.

Free projects also pause after ~7 days of inactivity. Active subscribers prevent it, but a
quiet week would take the bot down for people who are paying.

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
