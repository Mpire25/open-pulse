# ChatGPT plan migration acceptance

Automated tests use synthetic credentials and mocked storage; they do not access
macOS Keychain or verify ChatGPT plan eligibility. Complete this checklist in the
packaged app before considering live account acceptance finished.

1. Open Settings and choose **Continue with ChatGPT**. For an old Codex sign-in,
   confirm the reconnect notice appears and existing chats/settings remain.
2. Complete browser authorization yourself. Handle any Keychain prompt manually;
   stop on the first authentication or decryption failure.
3. Confirm the active account and plan-enabled state. If plan consent was not
   granted, the app should retain the sign-in and offer **Enable plan usage**.
4. Confirm models load, refresh the catalog, and select a model. Leave reasoning
   on **Automatic** initially. Discovery is a catalog, not proof of inference
   access; send a simple message and wait for a completed answer.
5. Request a health summary, then a question needing external research. Confirm
   local tool results, visualizations, web citations when supplied, and that
   restricted research is reported rather than presented as successful.
6. Cancel a streaming response. An unfinished response must not appear completed
   or execute pending model tools. Usage-limit errors must stop the run.
7. Restart the app and confirm the session, selected model, and chats persist.
8. With a previously cached catalog, disconnect the network and refresh models.
   Cached choices should remain with a stale/error message; the selection should
   not change. Restore the network and refresh successfully.
9. Add or reauthorize another account registration. Confirm catalogs stay separate
   and a failed or cancelled sign-in preserves the previous active registration.
10. Sign out. Confirm local credentials are cleared, the registration remains
    available for later sign-in, and unconfirmed remote revocation is disclosed.

No automated step should approve, dismiss, or retry Keychain authentication.
See the official [ChatGPT plan flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
and [preview requirements](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
