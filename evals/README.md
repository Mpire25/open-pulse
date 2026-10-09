# Assistant evals

Asks the real assistant a fixed set of health questions and scores the answers,
so a change to the harness (prompts, tools, routing, speed work) can be compared
with the version before it.

The assistant code under test is the real one: `codex-chat`, its tools, prompts
and tool loop, sign-in and token refresh, all calling the live Responses API.
Only these are swapped out:

- **Health data** comes from a deterministic synthetic history
  (`fixture.ts`), so every run sees identical data and a score change means the
  code changed. The history has deliberate stories for the cases to find:
  weight gain driven by an evening snack, fewer runs, short nights in the last
  fortnight with resting heart rate up and HRV down, five days when the tracker
  was not worn, and a partial today.
- **Sign-in** uses the eval's own ChatGPT session, stored in
  `~/.config/openpulse-evals/store.json` (owner-only permissions), not the
  app's Keychain-encrypted store.

Each run uses your ChatGPT plan, like using the assistant in the app. A full
run is 16 conversations.

## Running

```sh
bun run eval --sign-in                 # once: opens ChatGPT in your browser
bun run eval                           # the current checkout
bun run eval --ref 158b596             # another version, e.g. before a change
bun run eval --cases trend,simple      # some categories or case ids
bun run eval --repeat 3                # each case three times
bun run eval --compare evals/results/a.json --compare evals/results/b.json
bun run eval --rescore evals/results/a.json   # re-check saved answers after changing checks
bun run eval --sign-out                # revoke and delete the eval session
```

The model and reasoning effort default to the ones set in the app; override
them with `--model` and `--effort`. Results are saved in `evals/results/`
(git-ignored) and contain only synthetic data.

## Scoring

Each case has deterministic checks (`cases.ts`), computed from the fixture
rather than typed in:

- **What it read:** did the assistant query the dates the question needs, for
  example at least the last 57 days of weight for "the last couple of months"?
- **What it said:** does the answer contain the right numbers (with a
  tolerance), name the right food, avoid claiming data is missing, and avoid
  reporting zero steps on a day the tracker was not worn?
- **Cost:** web searches and model requests, for the questions that should be
  quick.

A case passes when all its critical checks pass. Non-critical checks (marked
`·` in the report) only lower the check score. The report also gives the median
time to the full answer and to the first streamed text, requests per run and
tokens per run.

The model is not deterministic, so use `--repeat 3` before trusting a small
difference between two versions.
