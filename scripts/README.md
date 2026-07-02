# scripts/

Developer utilities for capybara-bot. Nothing here is imported by the bot
(`supabase/functions/telegram-bot/index.ts`) or the deploy path — these are
off-to-the-side tools you run by hand.

## `model_latency_bench.py` — Sonnet 5 vs Opus 4.8 latency

Measures how much faster `claude-sonnet-5` is than `claude-opus-4-8` on the bot's
four Anthropic call shapes (translate, annotate, `/recap` synthesize, lemmatize),
so the Sonnet-vs-Opus tradeoff can be decided with real numbers instead of a
guess. The bot currently runs Opus 4.8 on these paths (see `CLAUDE_MODEL`).

**Methodology (why the numbers are meaningful):**

- **Thinking disabled on *both* models.** Sonnet 5 enables adaptive thinking by
  default; leaving it on would dominate latency and make the comparison
  meaningless. Both run with `thinking: {type: "disabled"}` — the apples-to-apples
  comparison, and how the bot would actually run Sonnet 5.
- **Total non-streaming round-trip** is timed — that's what the bot experiences
  (it doesn't stream).
- One **warmup** call per model is discarded; then N timed iterations (default 4).
- `max_tokens` mirror the bot's real values per task.

**Run it** (from anywhere with network access to `api.anthropic.com`):

```bash
export ANTHROPIC_API_KEY=sk-ant-...        # any key on your account
python3 scripts/model_latency_bench.py      # ~40 small calls, default N=4
N=6 python3 scripts/model_latency_bench.py   # tighter medians, more calls
```

Output ends with `sonnet-5 is N.NNx faster than opus-4-8` per task and an average.
Stdlib only — no `pip install`. Cost is a handful of small calls.

**Note on fidelity:** the prompts embedded in the script are compact stand-ins
matching the real prompts' structure and length. For a maximally faithful run
that uses the *exact* system prompts from `index.ts`, use the Claude Code
dispatch prompt below instead.

## Dispatch prompt for Claude Code (faithful variant)

Run Claude Code inside this checkout (so it can read the real prompts) and paste:

```
Benchmark request: measure how much faster claude-sonnet-5 is than
claude-opus-4-8 on THIS bot's actual API call shapes. My ANTHROPIC_API_KEY is
already set in the environment — read it from there, never hardcode or print it.

1. Read supabase/functions/telegram-bot/index.ts and extract the exact `system`
   prompts and `max_tokens` from these four functions, so the benchmark uses the
   bot's real prompt shapes:
     - translate()            (include the Ukrainian gender-agreement clause; target = uk)
     - annotateMessage()      (buildAnnotationPrompt("uk"))
     - synthesizeAnswer()     (buildSynthesisPrompt(...) — fabricate a small, realistic
                               couple-identity + retrieved-context block + question)
     - lemmatize()            (a single inflected Ukrainian word as input, e.g. "будинку")
   Use a realistic sample user input for each (a natural EN sentence for translate,
   a natural UK sentence for annotate).

2. Write a stdlib-only Python 3 script (urllib, no pip installs) that, for each of
   the four tasks, calls BOTH models via POST https://api.anthropic.com/v1/messages
   (headers: x-api-key, anthropic-version: 2023-06-01, content-type: application/json):
     - models: ["claude-sonnet-5", "claude-opus-4-8"]
     - CRITICAL: send "thinking": {"type": "disabled"} on BOTH models. This isolates
       raw model speed — Sonnet 5 enables adaptive thinking by default, which would
       otherwise dominate the latency and make the comparison meaningless.
     - non-streaming; measure total wall-clock round-trip (time.perf_counter around
       the request) — that's what the bot experiences.
     - 1 warmup iteration (discarded) + 4 timed iterations per (task, model).
     - capture usage.output_tokens per call.

3. Run it. Then print a table with, per task and model: median latency, p90 latency,
   median output tokens, tokens/sec — and per task the ratio
   opus_median_latency / sonnet_median_latency (= "sonnet-5 is N.NNx faster").
   Finish with the average ratio across tasks.

4. Note in the summary: outputs here are short, so absolute per-call gaps are small;
   the ratio matters most for /backfill throughput (many annotate calls in a 120s budget).

Cost is ~40 small calls total — fine to proceed without further confirmation.
```

`scripts/model_latency_bench.py` already implements the above with the compact
stand-in prompts, so it's the zero-setup path; the dispatch prompt is the
higher-fidelity path when you want the exact `index.ts` prompts.
