# Assistant chat names

New chats immediately use a shortened version of the first prompt. Alongside the
first authenticated response, OpenPulse makes one separate GPT-6 Luna request
with low reasoning to generate a short title. Only the first prompt (at most
4,000 characters) is sent: no prior turns, health datasets, or tools.

The naming job shares the foreground run's authenticated credentials, checks
the account's model catalog, and has a 10-second total deadline. It uses the
public Responses API with streaming and storage disabled. One extra inference
request uses the connected ChatGPT plan; naming has no separate API key.

If Luna/low is unavailable, the stream fails or is incomplete, the deadline
expires, or the title is invalid, the first-prompt title remains. Attempts are
recorded before inference and never automatically retried, including on restart.
Older chats are not automatically renamed. Naming never delays the answer.

Generated names are stored with encrypted history. Renaming preserves messages,
pin/keep flags and the original activity timestamp. Stale saves cannot restore
the fallback title after a generated title arrives. Deletion, retention cleanup,
account changes, cancellation, window reload/closure and quitting discard late
results. No tokens, prompts or model output are logged by naming.

Automated verification uses synthetic credentials/storage and mocked model
streams. Live Luna access and packaged-app behavior require manual acceptance:
send a new prompt, confirm the fallback appears first and a short name replaces
it without interrupting the answer, then restart and check the name persists.
An older chat should keep its existing title. Handle any authentication or
Keychain/Safe Storage prompt personally; stop on the first failure.
