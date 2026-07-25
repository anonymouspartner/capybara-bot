// Capybara SaaS — billing edge function. Commercial project only.
//
// Two routes, one function:
//
//   GET  ?session_id=cs_...   the Checkout success_url. Verifies the session with
//                             Stripe, provisions the tenant, and 302s the customer to
//                             https://t.me/<bot>?start=<pairing_code>.
//   POST (stripe-signature)   the webhook. Subscription lifecycle -> tenants.status.
//   GET  ?health              side-effect-free probe, same shape as the bot's.
//
// This is separate from telegram-bot-saas because the two have different callers and
// different authentication. The bot's entry point rejects anything without the shared
// WEBHOOK_SECRET; Stripe authenticates with an HMAC over the raw body and knows nothing
// about that secret. Folding them together would mean one route with two auth schemes
// and a body that must not be parsed before it is verified — a bad place to be clever.
//
// PROVISIONING LIVES ON THE GET ROUTE, NOT THE WEBHOOK. Stripe redirects the customer's
// browser and delivers the webhook at roughly the same moment, with no ordering
// guarantee, so a claim link that depended on the webhook having landed would fail for
// whoever lost the race — at the worst possible time, seconds after taking their money.
// Instead the claim route fetches the session from Stripe itself and provisions if
// needed. Both paths are idempotent (unique indexes on the checkout session and
// subscription ids), so whichever arrives first wins and the other is a no-op.
//
// No Stripe SDK. Signature verification is ~20 lines of WebCrypto and the two API calls
// are plain fetch, which avoids an esm.sh dependency on the one function whose
// availability decides whether paying customers can start using the product.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const BUILD_VERSION = "billing-v4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
// The bot's @username, used to build the deep link the customer is redirected to after
// paying. Normalized and then VALIDATED, because this is the single most brittle string
// in the product: it is set by hand, and a wrong one breaks the handoff at the worst
// possible moment -- seconds after a successful payment, with the customer watching.
//
// Accepts what a person actually pastes: "@name", "name", or a full t.me URL. Anything
// that is not a legal Telegram username after that is treated as UNSET, so the deploy
// smoke test's botUsernameConfigured check fails on a malformed value instead of
// reporting healthy and emitting broken links.
const TELEGRAM_BOT_USERNAME = (() => {
  const raw = (Deno.env.get("TELEGRAM_BOT_USERNAME") ?? "").trim();
  const name = raw
    .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(name)) {
    if (raw) console.error(`TELEGRAM_BOT_USERNAME is not a valid Telegram username: ${JSON.stringify(raw)}`);
    return "";
  }
  return name;
})();

// Price -> plan mapping lives here rather than in the database so prices can be
// re-pointed, renamed or superseded without a migration. These two ids are the whole
// definition of what this service sells: a Checkout session for anything else is not a
// Capybara purchase and is refused (see planForPrice).
const PRICE_STANDARD = Deno.env.get("STRIPE_PRICE_STANDARD") ?? "";
const PRICE_HEAVY = Deno.env.get("STRIPE_PRICE_HEAVY") ?? "";
const QUOTA_STANDARD = Number(Deno.env.get("QUOTA_STANDARD") ?? 3000);
const QUOTA_HEAVY = Number(Deno.env.get("QUOTA_HEAVY") ?? 10000);

const db = createClient(SUPABASE_URL, SERVICE_ROLE);

// Returns null for anything that is not one of OUR prices. Deliberately not a fallback:
// an earlier version defaulted an unrecognized price to the standard quota, which turned
// "we don't know what this is" into "here is a full subscription". Combined with the
// claim route accepting any paid Checkout session, that meant a customer who bought
// anything at all through this Stripe account -- some other product, a one-off -- could
// take their own session id, hit the claim URL, and be provisioned a Capybara tenant.
function planForPrice(priceId: string | null): { plan: string; quota: number } | null {
  if (priceId && priceId === PRICE_HEAVY) return { plan: "heavy", quota: QUOTA_HEAVY };
  if (priceId && priceId === PRICE_STANDARD) return { plan: "standard", quota: QUOTA_STANDARD };
  return null;
}

// Deliberately excludes look-alike characters (0/O, 1/l/I). The code is read off a
// screen and sometimes typed by hand when the deep link is forwarded as plain text, and
// Telegram's start payload only accepts [A-Za-z0-9_-] anyway.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generatePairingCode(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

// --- Stripe REST (no SDK) ---------------------------------------------------

async function stripeGet(path: string): Promise<any | null> {
  if (!STRIPE_SECRET_KEY) {
    console.error("stripeGet: STRIPE_SECRET_KEY is not set");
    return null;
  }
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Stripe-Version": "2024-06-20",
    },
  });
  if (!resp.ok) {
    console.error(`stripe GET ${path} failed: ${resp.status} ${(await resp.text()).slice(0, 300)}`);
    return null;
  }
  return await resp.json();
}

// --- Webhook signature ------------------------------------------------------

// Verifies Stripe's `Stripe-Signature: t=<ts>,v1=<hex>` header: HMAC-SHA256 of
// "<timestamp>.<raw body>" under the endpoint secret.
//
// The raw body text must be the exact bytes Stripe signed, so the caller reads it as
// text and never JSON.parses before this returns true. Re-serializing parsed JSON would
// change key order and whitespace and break every signature.
async function verifyStripeSignature(rawBody: string, sigHeader: string | null): Promise<boolean> {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("webhook rejected: STRIPE_WEBHOOK_SECRET is not set");
    return false;
  }
  if (!sigHeader) return false;

  let timestamp = "";
  const provided: string[] = [];
  for (const part of sigHeader.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k?.trim() === "t") timestamp = v?.trim() ?? "";
    // A header can carry several v1 signatures during a secret rotation; any match wins.
    if (k?.trim() === "v1" && v) provided.push(v.trim());
  }
  if (!timestamp || provided.length === 0) return false;

  // Replay window. Without this, a signature stays valid forever and a captured request
  // could be re-sent to, say, re-activate a cancelled subscription.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) {
    console.error(`webhook rejected: timestamp outside tolerance (${age}s)`);
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const expected = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");

  return provided.some((p) => timingSafeEqual(p, expected));
}

// Constant-time compare. A short-circuiting === leaks how many leading hex characters
// matched, which is enough to forge a signature one nibble at a time.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- Provisioning -----------------------------------------------------------

// Creates the tenant and its conversation, or returns the existing one. Idempotent on
// the checkout session id, which is what makes the claim/webhook race harmless.
//
// Returns the pairing code the customer needs, or null if this session cannot be
// provisioned (unpaid, unknown, Stripe unreachable).
async function provisionFromCheckoutSession(sessionId: string): Promise<string | null> {
  // Already provisioned? Hand back the same code — the customer may simply have
  // refreshed the success page, and re-reading it must not mint a second tenant.
  const { data: existing } = await db.from("tenants")
    .select("id, pairing_code").eq("stripe_checkout_session_id", sessionId).maybeSingle();
  if (existing) return existing.pairing_code ?? null;

  // Fetch from Stripe rather than trusting the query string. The session id arrives via
  // the customer's browser, so this call is what establishes that it is real and paid —
  // otherwise anyone could provision a tenant by inventing an id.
  const session = await stripeGet(`checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (!session) return null;
  if (session.payment_status !== "paid") {
    console.warn(`session ${sessionId} not paid (payment_status=${session.payment_status})`);
    return null;
  }
  // "Paid" is not the same as "paid for THIS". A Stripe account may sell other things,
  // and the claim URL is discoverable -- it is the redirect target on the Payment Link,
  // so every customer sees it. Requiring subscription mode rejects one-off purchases,
  // which would otherwise provision a tenant with no subscription behind it: no
  // current_period_end, so the quota never rolls, and nothing for a lifecycle event to
  // ever deactivate.
  if (session.mode !== "subscription") {
    console.warn(`session ${sessionId} rejected: mode=${session.mode}, expected subscription`);
    return null;
  }

  const subscriptionId: string | null = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id ?? null;
  const customerId: string | null = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id ?? null;

  // The subscription carries the price and the period end; the session does not.
  let priceId: string | null = null;
  let periodEnd: string | null = null;
  if (subscriptionId) {
    const sub = await stripeGet(`subscriptions/${encodeURIComponent(subscriptionId)}`);
    priceId = sub?.items?.data?.[0]?.price?.id ?? null;
    periodEnd = sub?.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;
  }

  // The actual entitlement check: the money has to have been for one of our two prices.
  const plan_ = planForPrice(priceId);
  if (!plan_) {
    console.error(
      `session ${sessionId} rejected: price ${priceId} is not STRIPE_PRICE_STANDARD or STRIPE_PRICE_HEAVY`);
    return null;
  }
  const { plan, quota } = plan_;
  const pairingCode = generatePairingCode();

  const { data: tenant, error } = await db.from("tenants").insert({
    display_name: session.customer_details?.email ?? null,
    stripe_checkout_session_id: sessionId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    stripe_price_id: priceId,
    plan,
    status: "active",
    message_quota: quota,
    messages_used: 0,
    current_period_end: periodEnd,
    pairing_code: pairingCode,
    // Long enough that a couple can onboard across a weekend, short enough that an
    // abandoned subscription's link does not stay live indefinitely.
    pairing_code_expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
  }).select("id, pairing_code").single();

  if (error) {
    // Most likely the webhook provisioned it in the gap between our SELECT and INSERT.
    // The unique index is the arbiter; re-read and use whatever landed.
    console.error("tenant insert failed, re-reading:", error);
    const { data: raced } = await db.from("tenants")
      .select("pairing_code").eq("stripe_checkout_session_id", sessionId).maybeSingle();
    return raced?.pairing_code ?? null;
  }

  // Every message insert needs this row (conversationIdFor in the bot throws without
  // it), so it is created with the tenant rather than lazily on first message.
  const { error: convErr } = await db.from("conversations")
    .insert({ tenant_id: tenant.id, title: "Capybara" });
  if (convErr) console.error(`conversation insert failed for tenant ${tenant.id}:`, convErr);

  console.log(`provisioned tenant ${tenant.id} (plan=${plan}, quota=${quota})`);
  return tenant.pairing_code ?? null;
}

// --- Webhook events ---------------------------------------------------------

// Stripe's subscription statuses map onto ours directly, so they are stored verbatim
// rather than collapsed. consume_message_quota treats 'active' and 'trialing' as
// entitled and everything else as denied, which means a status Stripe adds later fails
// closed instead of silently granting service.
const ENTITLED_STATUSES = new Set(["active", "trialing"]);

async function applySubscriptionEvent(sub: any): Promise<void> {
  const priceId: string | null = sub?.items?.data?.[0]?.price?.id ?? null;
  const mapped = planForPrice(priceId);

  // Read the old status first so the notification below can fire on the TRANSITION
  // rather than on every event. Stripe re-sends subscription.updated for many reasons
  // (renewals, metadata edits, its own retries), and a message on each one would turn a
  // single failed payment into a stream of identical warnings.
  const { data: before } = await db.from("tenants")
    .select("id, status").eq("stripe_subscription_id", sub.id).maybeSingle();

  // Status and period always apply -- a cancellation has to deactivate the tenant even
  // if the price on it is one we don't recognise, or an unknown price would become a way
  // to keep service after cancelling.
  //
  // The plan and quota only move when the price maps to one of ours. An unmapped price
  // leaves the existing entitlement untouched rather than granting a default one; the
  // operator sees the log and fixes the mapping, and nobody is silently upgraded in the
  // meantime.
  const patch: Record<string, unknown> = {
    status: sub.status,
    stripe_price_id: priceId,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
  };
  if (mapped) {
    patch.plan = mapped.plan;
    patch.message_quota = mapped.quota;
  } else {
    console.error(
      `subscription ${sub.id} has unmapped price ${priceId}; status/period updated, plan and quota left as-is`);
  }

  const { error } = await db.from("tenants").update(patch)
    .eq("stripe_subscription_id", sub.id);

  if (error) {
    console.error(`subscription update failed for ${sub.id}:`, error);
    return;
  }
  console.log(`subscription ${sub.id} -> status=${sub.status} plan=${mapped?.plan ?? "(unchanged)"}`);

  if (!before) return;
  const wasEntitled = ENTITLED_STATUSES.has(before.status);
  const isEntitled = ENTITLED_STATUSES.has(sub.status);
  if (wasEntitled === isEntitled) return;

  // Without this the bot simply stops answering, and the couple's only clue is a refusal
  // the next time one of them writes something. Telling them where the problem is, in
  // the place they already use, is the difference between a lapsed card being fixed in a
  // minute and a churned customer who thinks the product broke.
  if (isEntitled) {
    await notifyTenant(before.id, "Your Capybara subscription is active again — everything's back on. 🙂");
  } else if (sub.status === "past_due" || sub.status === "unpaid") {
    await notifyTenant(before.id,
      "Capybara here — your last payment didn't go through, so I've paused translating.\n\n" +
      "Nothing has been deleted. Send /billing to update your card and I'll pick straight back up.");
  } else {
    await notifyTenant(before.id,
      "Your Capybara subscription has ended, so I've paused translating.\n\n" +
      "Your messages and study decks are still here. Send /billing if you'd like to resubscribe.");
  }
}

// Messages every member of a tenant. Best-effort: a delivery failure is logged, never
// thrown, because a webhook that 500s over an undeliverable notification would have
// Stripe retry the whole event and re-apply a state change that already succeeded.
async function notifyTenant(tenantId: string, text: string): Promise<void> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  if (!token) {
    console.warn("notifyTenant: TELEGRAM_BOT_TOKEN not set; skipping billing notification");
    return;
  }
  const { data: members, error } = await db.from("users")
    .select("telegram_id").eq("tenant_id", tenantId);
  if (error) { console.error("notifyTenant: member read failed:", error); return; }

  for (const m of members ?? []) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: m.telegram_id, text }),
      });
      // A blocked bot or deleted account is normal and permanent; log and move on.
      if (!resp.ok) console.error(`notifyTenant: send to ${m.telegram_id} failed: ${resp.status}`);
    } catch (e) {
      console.error(`notifyTenant: send to ${m.telegram_id} threw:`, e);
    }
  }
}

async function handleStripeEvent(event: any): Promise<void> {
  switch (event.type) {
    // Provisioning normally happens on the claim route, but handle it here too: a
    // customer who closes the tab before the redirect still gets a tenant, and their
    // link still works when they come back to the receipt.
    case "checkout.session.completed": {
      const session = event.data?.object;
      if (session?.id) await provisionFromCheckoutSession(session.id);
      break;
    }
    // Upgrades, downgrades, renewals, cancellations, and payment failures all surface
    // as a subscription state change, so one handler covers the whole lifecycle.
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscriptionEvent(event.data?.object);
      break;
    default:
      // Everything else is acknowledged and ignored. Returning 200 stops Stripe
      // retrying events this endpoint has no opinion about.
      console.log(`ignoring event type ${event.type}`);
  }
}

// --- Entry point ------------------------------------------------------------

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.has("health")) {
    return Response.json({
      status: "ok",
      version: BUILD_VERSION,
      stripeConfigured: Boolean(STRIPE_SECRET_KEY) && Boolean(STRIPE_WEBHOOK_SECRET),
      botUsernameConfigured: Boolean(TELEGRAM_BOT_USERNAME),
      pricesConfigured: Boolean(PRICE_STANDARD) && Boolean(PRICE_HEAVY),
      // Not smoke-tested as a hard failure: without it billing still works end to end,
      // the couple just isn't told when their payment lapses.
      notificationsConfigured: Boolean(Deno.env.get("TELEGRAM_BOT_TOKEN")),
    });
  }

  // --- Claim route: Checkout success_url --------------------------------------
  if (req.method === "GET") {
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) return new Response("Missing session_id.", { status: 400 });

    const code = await provisionFromCheckoutSession(sessionId);
    if (!code) {
      // Deliberately vague to the customer, detailed in the logs. They have paid, so the
      // message says what to do next rather than what went wrong internally.
      return new Response(
        "We couldn't confirm that payment yet. If you were charged, contact support and we'll finish setting up your account.",
        { status: 202, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
    if (!TELEGRAM_BOT_USERNAME) {
      console.error("claim: TELEGRAM_BOT_USERNAME is not set; cannot build the deep link");
      return new Response(`Your setup code is: ${code}\n\nSend "/start ${code}" to the bot on Telegram.`,
        { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    // Telegram sends "/start <payload>" on the customer's behalf when they open this,
    // so claiming the first seat costs them one tap and no typing.
    return Response.redirect(`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${code}`, 302);
  }

  // --- Webhook ----------------------------------------------------------------
  if (req.method === "POST") {
    // Read as text and verify BEFORE parsing: the signature covers these exact bytes.
    const rawBody = await req.text();
    const ok = await verifyStripeSignature(rawBody, req.headers.get("stripe-signature"));
    if (!ok) return new Response("Invalid signature.", { status: 400 });

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response("Malformed JSON.", { status: 400 });
    }

    try {
      await handleStripeEvent(event);
    } catch (e) {
      // 500 asks Stripe to retry. Handlers are idempotent, so a retry is safe, and
      // failing loudly beats acknowledging an event whose effect never landed.
      console.error(`handler threw for event ${event?.id} (${event?.type}):`, e);
      return new Response("Handler error.", { status: 500 });
    }
    return new Response("ok", { status: 200 });
  }

  return new Response("Method not allowed.", { status: 405 });
});
