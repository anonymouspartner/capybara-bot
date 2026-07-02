#!/usr/bin/env python3
"""
Latency benchmark: claude-sonnet-5 vs claude-opus-4-8 on capybara-bot's actual
call shapes. Stdlib only (urllib) -- no pip install needed.

Fair comparison: thinking is DISABLED on BOTH models so we measure raw model
speed, not Sonnet 5's adaptive-thinking-by-default overhead (which is exactly
what the bot would turn off). Non-streaming total round-trip is measured because
that is what the bot experiences.

The prompt shapes below are compact stand-ins for the bot's real prompts. For a
maximally faithful run, use the Claude Code dispatch prompt in scripts/README.md,
which reads the exact system prompts out of
supabase/functions/telegram-bot/index.ts instead.

Run:
    export ANTHROPIC_API_KEY=sk-ant-...
    python3 scripts/model_latency_bench.py       # default 4 timed iters/task/model
    N=6 python3 scripts/model_latency_bench.py    # more iters = tighter medians

Cost: ~ (tasks * models * (warmup+N)) small calls. Default = 4*2*(1+4)=40 calls.
"""
import json, os, sys, time, statistics, urllib.request, urllib.error

API_KEY = os.environ.get("ANTHROPIC_API_KEY")
BASE = os.environ.get("ANTHROPIC_API_BASE", "https://api.anthropic.com")
MODELS = ["claude-sonnet-5", "claude-opus-4-8"]
N = int(os.environ.get("N", "4"))            # timed iterations per (task, model)
WARMUP = 1                                    # discarded to avoid cold-start skew

# Force a DIRECT connection (some sandboxes route anthropic.com around the proxy).
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

# --- Compact stand-ins for the bot's real prompt shapes ----------------------
# (same structure/length class, since prompt size drives time-to-first-token)
TRANSLATE_SYS = (
    "You are a translator between English and Ukrainian. Translate the user's "
    "message naturally, preserving tone and register. Output ONLY the translation, "
    "no preamble or commentary. If the input contains slang, idioms, or culturally-"
    "specific phrases, render an equivalent natural expression in the target language.\n\n"
    "CRITICAL LANGUAGE RULES:\n"
    "- Never produce Russian. The Cyrillic-script language in this conversation is ALWAYS Ukrainian.\n"
    "- If the input appears Russian or ambiguous, treat it as Ukrainian.\n"
    "- When the target is Ukrainian, output standard literary Ukrainian only (no surzhyk).\n\n"
    "GENDER AGREEMENT:\n"
    "Written by Andriy (male), addressing Olena (female). Ukrainian marks gender on past-tense "
    "verbs/adjectives: first person -> male, second person -> female; 'we' -> plural."
)
ANNOTATE_SYS = (
    "Analyze the Ukrainian text and return a JSON object with keys:\n"
    '- "vocabulary": array of {lemma, part_of_speech, english_gloss, lemma_translation} for content words.\n'
    "  lemma = dictionary form; part_of_speech in noun|verb|adjective|adverb|phrase; english_gloss 1-4 words, "
    "sense-disambiguated; lemma_translation = most common English dictionary form.\n"
    "  SKIP prepositions, conjunctions, particles, pronouns, numerals, proper nouns.\n"
    '- "grammar": array of grammatical features (e.g. instrumental case, imperfective aspect).\n'
    '- "idioms": array of idiomatic expressions.\n'
    '- "register": one of formal|informal|neutral.\n'
    "Output ONLY raw JSON. No markdown fences, no preamble."
)
SYNTH_SYS = (
    "You are the /recap feature of a couple's private translation bot, answering a question "
    "about their shared conversational history. Answer in English.\n"
    "Rules: ground every claim in the CONTEXT; if absent, say so plainly. Quote sparingly (max 3), "
    "in the original language. Distinguish messages from private notes. Be concise: narrow questions "
    "1-4 sentences. You do recall/synthesis only, not advice or prediction.\n\n"
    "# CONTEXT\n"
    "2026-03-14 | Olena said: «Я нарешті записалася на курси кераміки, починаю у квітні.»\n"
    "2026-03-20 | Andriy noted: Olena seemed really happy about the pottery class; buy her an apron.\n"
    "2026-04-02 | Olena said: «Перше заняття було чудове, але глина всюди!»\n\n"
    "# QUESTION\nWhat has Olena said about her pottery class?"
)
LEMMA_SYS = (
    "Return the dictionary (lemma) form of the given Ukrainian word. Nouns: nominative singular; "
    "verbs: infinitive; adjectives: masculine singular. Output ONLY raw JSON: {\"lemma\": \"<word>\"} "
    "or {\"lemma\": null} if not a recognizable Ukrainian word. No markdown fences, no preamble."
)

# task -> (system, user_input, max_tokens)  [max_tokens mirror the bot's values]
TASKS = {
    "translate":  (TRANSLATE_SYS,
                   "I told my mom we'd visit this weekend, but honestly I'm wiped and could use a quiet night in.",
                   1024),
    "annotate":   (ANNOTATE_SYS,
                   "Вчора ми довго гуляли парком і випадково натрапили на маленьку затишну кав'ярню.",
                   8192),
    "synthesize": (SYNTH_SYS, "What has Olena said about her pottery class?", 1024),
    "lemmatize":  (LEMMA_SYS, "будинку", 128),
}

def call(model, system, user, max_tokens):
    """One non-streaming call; returns (latency_s, output_tokens)."""
    body = json.dumps({
        "model": model,
        "max_tokens": max_tokens,
        "thinking": {"type": "disabled"},   # isolate raw model speed on BOTH
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }).encode()
    req = urllib.request.Request(
        f"{BASE}/v1/messages", data=body, method="POST",
        headers={"x-api-key": API_KEY, "anthropic-version": "2023-06-01",
                 "content-type": "application/json"},
    )
    t0 = time.perf_counter()
    with _opener.open(req, timeout=120) as r:
        data = json.loads(r.read())
    dt = time.perf_counter() - t0
    return dt, data.get("usage", {}).get("output_tokens", 0)

def main():
    if not API_KEY:
        sys.exit("ANTHROPIC_API_KEY is not set -- export it and re-run.")
    print(f"models={MODELS}  timed_iters={N}  warmup={WARMUP}  thinking=disabled\n")
    results = {t: {m: [] for m in MODELS} for t in TASKS}
    for task, (system, user, mt) in TASKS.items():
        for model in MODELS:
            for i in range(WARMUP + N):
                try:
                    dt, out = call(model, system, user, mt)
                except urllib.error.HTTPError as e:
                    sys.exit(f"HTTP {e.code} on {model}/{task}: {e.read().decode()[:300]}")
                if i >= WARMUP:
                    results[task][model].append((dt, out))
                print(f"  {task:10s} {model:16s} iter{i} "
                      f"{'(warmup)' if i < WARMUP else '        '} {dt:5.2f}s {out}tok", flush=True)

    print("\n" + "=" * 78)
    print(f"{'task':11s} {'model':16s} {'med_lat':>8s} {'p90':>7s} {'out_tok':>8s} {'tok/s':>7s}")
    print("-" * 78)
    ratios = []
    for task in TASKS:
        med = {}
        for model in MODELS:
            lats = sorted(x[0] for x in results[task][model])
            toks = statistics.median(x[1] for x in results[task][model])
            m = statistics.median(lats)
            p90 = lats[min(len(lats) - 1, int(0.9 * len(lats)))]
            med[model] = m
            print(f"{task:11s} {model:16s} {m:7.2f}s {p90:6.2f}s {toks:8.0f} {toks/m:7.1f}")
        if med.get("claude-opus-4-8") and med.get("claude-sonnet-5"):
            r = med["claude-opus-4-8"] / med["claude-sonnet-5"]
            ratios.append(r)
            print(f"{'':11s} -> sonnet-5 is {r:.2f}x faster than opus-4-8 on {task}\n")
    if ratios:
        print("=" * 78)
        print(f"AVERAGE: sonnet-5 is {statistics.mean(ratios):.2f}x faster "
              f"(range {min(ratios):.2f}x-{max(ratios):.2f}x) across these tasks.")
        print("Note: total non-streaming round-trip, thinking disabled on both. Short "
              "outputs mean per-call wall-clock gaps are small in absolute terms.")

if __name__ == "__main__":
    main()
