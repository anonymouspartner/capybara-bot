# Capybara Deploy-Safety — Recovery & Prevention Handoff

This is a **design + recovery** handoff, not an implementation task. Nothing was
deployed or changed in the conversation that produced it. Its job is to let you
(or a future Claude) pick up cold and finish getting Capybara out of a recurring
class of deploy failures.

Read sections 0–3 before doing anything. Section 3 is the only thing that's
time-sensitive.

---

## 0. TL;DR / state on the day this was written

- **The bot is UP.** The live `telegram-bot` function is currently working.
- **You do NOT have a file you trust to be the real, complete current source.**
  This is the core problem. Every prevention and rollback idea assumes a trusted
  baseline to deploy *from*, and that baseline does not yet exist.
- **You have the Supabase CLI on your laptop.** That's the machine the recovery
  needs. (Phone / ssh / Termux paths were considered and dropped — moot now.)
- **Single most important next action:** while the bot is still up, extract the
  live source via the CLI, verify it's real and complete, and commit it to git.
  That converts "the bot is up" (ephemeral — the next bad deploy erases it) into
  "I have the running bytes on disk and in version control" (durable). See §3.
- **Do not deploy anything** until a verified baseline exists. Download and
  inspection are read-only and safe. Deploy is the dangerous verb.

---

## 1. The problem — root cause, not symptoms

### The recurring failure
Multiple times, a deploy has silently shipped a **stub** — a placeholder string,
or a truncated / reconstructed file — instead of the real function body. Each
time the live bot goes down: every Telegram webhook returns HTTP 500, and it
isn't noticed until someone messages the bot and gets silence. Known instances:
a v35→v36 stub, a v38 stub (origin unknown), and a v39 stub deployed by passing
the literal string `"PLACEHOLDER"` in the content field.

### The actual root cause
Not the inline-content deploy tool, and not the masked read-back — those are real
but downstream. The root cause is:

> **The deploy has no canonical source-of-truth input.** The string that gets
> shipped is assembled ad hoc at deploy time — sometimes from a real file,
> sometimes reconstructed from an old version plus memory, once from the literal
> word "PLACEHOLDER." Nothing pins the deploy origin to ground truth, and nothing
> validates the payload before it goes live.

All three incidents are the same failure in different clothes. Fix the *origin*
and the inline-tool and masking problems stop mattering, because the deployed
bytes are then *required* to come from a fixed, versioned file rather than from
whatever's in working memory.

### Why "verify after deploy" (the documented protocol) doesn't save you
Two reasons, and the second is the important one:
1. It depends on the read-back working, and `get_edge_function` returns masked
   content (`PLACEHOLDER_WILL_NOT_DEPLOY`) instead of real source — so it
   silently fails.
2. **Content verification is the wrong layer entirely.** Even if read-back
   returned real source tomorrow, diffing source-against-source is fragile. What
   you actually want to verify is *behavior*: does the deployed function respond
   correctly? That's observable regardless of masking. **Do not spend time trying
   to make read-back diffing work. Route around it** with a behavioral check
   (see §4, version route + health check).

### Compounding factors (real, but secondary)
- The masked read-back means you can't diff a deploy against what's live, before
  or after.
- The inline-content tool design makes it easy to send the wrong string and hard
  to verify what landed.
- Recovery has sometimes happened from a *reconstructed* file (old version +
  memory) rather than ground-truth source — a second risk layer that has itself
  introduced stubs.

---

## 2. Current state

| Thing | State |
|---|---|
| Live bot | **UP** (as of this conversation) |
| Trusted baseline file on disk | **None.** This is the hole to climb out of. |
| Supabase CLI | Installed on laptop |
| CLI authenticated / project linked | **Unknown — confirm** (`supabase login`, `supabase link`) |
| MCP `get_edge_function` | Masks source (`PLACEHOLDER_WILL_NOT_DEPLOY`) |
| Whether CLI `functions download` is also masked | **Unknown — the §3 verification settles this** |
| git repo for the function | Assume not yet established; create during recovery |

---

## 3. Step zero — manufacture a trusted baseline (DO THIS FIRST)

All on the laptop. Read-only until the final commit; nothing here can hurt the
running bot.

**The trap to avoid:** do NOT reconstruct the file from the project's old v26 +
memory of what's been added since. That is exactly how reconstructed-from-memory
files entered the deploy chain. A reconstruction *feels* like ground truth and
isn't. Extract real bytes, or treat any reconstruction as suspect until proven
behaviorally (see the "if masked" branch).

```bash
# 1. Authenticate + link (skip if already done)
supabase login                 # wants a personal access token from the dashboard
supabase link --project-ref <project-ref>

# 2. Extract the live source — your shot at ground truth
supabase functions download telegram-bot

# 3. Inspect the downloaded file as a CANDIDATE, not as trusted truth
wc -l supabase/functions/telegram-bot/index.ts   # expect well over 1500; ~2000 if recap shipped
deno check supabase/functions/telegram-bot/index.ts
grep -E "Deno.serve|handleUpdate|BACKFILL_ADMIN_TELEGRAM_ID" supabase/functions/telegram-bot/index.ts
grep -E "handleRecap|handleReconcile|handlePinned" supabase/functions/telegram-bot/index.ts  # if recap is supposed to be live
```

**Interpreting the result:**

- **If it's real and complete** (line count high, `deno check` passes, anchors
  present): you've just manufactured your first trustworthy baseline. Commit it
  immediately and tag it. *You are now out of the hole.*
  ```bash
  git init        # if needed
  git add -A
  git commit -m "Recovered live telegram-bot source as ground-truth baseline"
  git tag v-recovered-baseline
  ```
- **If it comes back masked or stubbed** (11 characters, a few hundred lines,
  won't compile, anchors missing): the masking followed us to the CLI. Do **not**
  trust it and do **not** deploy it. This is important information — replan. The
  fallback is reconstruction, but reconstruction only becomes a baseline after it
  *survives a behavioral gauntlet*: deploy it to a throwaway / branch function
  (never the live one), run the smoke tests, exercise `/recap`, `/pin`, and a
  translation round-trip. Eyeballing is not enough; only behavior earns trust.

Whichever branch: the **download is safe to run right now** and settles the one
unknown the whole plan hinges on. That's the immediate next action.

---

## 4. The prevention design (only meaningful once §3 produces a baseline)

The options, weighed by effort vs. how much of the failure class they actually
eliminate. The priority is **prevention that doesn't depend on you remembering to
do anything.**

| # | Option | Effort | Failure eliminated |
|---|---|---|---|
| 1 | **Canonical source in git; deploy only via `supabase functions deploy` (reads from disk, no inline-string path)** | Medium, mostly one-time | **Nearly the whole class.** Structurally impossible to ship a placeholder, truncation, or reconstruction. Highest leverage; needs no memory on your part. |
| 2 | **Pre-deploy sanity gate** (wrapper / pre-push hook / CI: `deno check` clean + line count ≥ ~1500 + anchors present) | Low | Backstop. An 11-char "PLACEHOLDER" fails all three instantly. Catches a bad payload even if #1 is bypassed. |
| 3 | **Version/build constant + no-side-effect health route** returning `200 {version}` without touching the corpus or messaging the partner | Low | The behavioral substitute for the broken read-back. A single GET tells you exactly which build is live; masking can't hide it. Quietly one of the most valuable items. |
| 4 | **External uptime monitor** on the health route (GitHub Action / Supabase cron / uptime service) alerting on 500 or version mismatch — Telegram message to admin ID is the obvious channel | Low–Medium | Doesn't prevent; closes the "downed bot unnoticed until a human messages it" gap. |
| 5 | **Post-deploy smoke test baked into the deploy command** (hit health route, assert 200 + expected version) | Low *if automated* | Useful **only** if automatic. A manual step rots into the same failure class as "verify after deploy." |
| 6 | **Rollback via git tags** (redeploy previous tag from disk) | Low | Bounds blast radius / MTTR. Because it redeploys ground truth, it doesn't reintroduce the reconstruction risk. |

**Recommended stack: #1 + #3 as the spine; #2 and #4 as cheap high-value
wrappers; #5 automatic-only; #6 a natural byproduct of tagging.** This contains
no manual ritual you must remember — the property you said you care about most.

**Do NOT invest in:**
- Making the content read-back / source-diff work (wrong layer — verify behavior
  instead, via #3).
- A content hash the deploy "must match" — you can only hash the *input*, and if
  you're already deploying from a committed file, the file *is* the hash. Redundant
  once #1 exists; only relevant if you're still hand-assembling strings, in which
  case it's papering over the unsolved real problem.

**Degraded variant** — if you're ever forced back onto the MCP inline tool: the
spine becomes "a wrapper script that cats the disk file into the tool" + the #2
gate. Weaker, because the gate is then the only thing between memory and prod,
but still a large improvement.

---

## 5. Target end-state deploy ritual

Once the baseline + spine exist, every deploy is:

```bash
# edit on disk, commit
git add -A && git commit -m "..."
# sanity gate (hook or manual): deno check + line floor + anchors
# deploy from the committed file — never an inline string
supabase functions deploy telegram-bot --project-ref <project-ref> --no-verify-jwt
# smoke (automatic, in the same script): GET health route, assert 200 + version
git tag vNN   # rollback point
```

No reconstruction, no hand-typed content, no reliance on remembering to verify.

---

## 6. Open decisions still to make

1. **§3 outcome — is the CLI download real or masked?** Everything branches off
   this. Settled by running the download. (Replaces the old "is v26 ground truth"
   question — the answer to that was *no*, which is why §3 exists.)
2. **CLI auth** — confirm `supabase login` works in your environment and the
   project links. (Likely fine since the CLI is installed, but unconfirmed.)
3. **Health route shape & gating** — webhook is `WEBHOOK_SECRET`-protected; decide
   whether the monitor uses that secret or you add a separate side-effect-free
   health path with its own token. Decide whether it returns just version or also
   a shallow dependency check (Anthropic / OpenAI reachable, like `/diag` does).
4. **Monitor home + alert channel + interval** — GitHub Action vs. Supabase cron
   vs. uptime service; Telegram-to-admin vs. email; every 2–5 min.
5. **Where the git repo lives** and whether deploys run from laptop only or also
   from CI.

---

## 7. Do-not list

- **Do not deploy anything until §3 yields a verified baseline.** Download +
  inspect is safe; deploy is not.
- **Do not reconstruct the file from old version + memory and treat it as truth.**
  That's the documented second risk layer. Extract real bytes, or behaviorally
  prove a reconstruction on a non-live function before trusting it.
- **Do not trust the CLI download blindly** — treat it as a candidate until line
  count, `deno check`, and anchors confirm it.
- **Do not try to fix the masked read-back / source diffing.** Route around it
  with the version route (#3).
- **Do not verify model strings from memory** — they drift; confirm at
  https://docs.claude.com/en/docs/about-claude/models/overview before any deploy.

---

## 8. Key identifiers

- Supabase project ref: `<project-ref>`
- Edge function: `telegram-bot` (entrypoint `index.ts`)
- Admin Telegram ID (alert target / admin gate): `<admin-telegram-id>`
- Expected line count if recap shipped: ~2000 (floor for sanity gate: ~1500)
- Deploy command: `supabase functions deploy telegram-bot --project-ref <project-ref> --no-verify-jwt`
- Download command (recovery): `supabase functions download telegram-bot`

---

*End of handoff. The next action is one safe, read-only command:*
`supabase functions download telegram-bot` *— then report line count and whether
`deno check` passes.*
