# Assistant response notifications

Enable **Settings → Assistant notifications → Notify when a response finishes**.
Notifications and sound are both off by default. The banner says **OpenPulse —
Your AI response is ready.** It never includes health details or a chat title.

One notification is sent for a successfully completed response after the renderer
accepts it. Viewing that chat in the focused main window suppresses the banner,
whether it is on the Assistant page or in the side panel. A different selected
chat, a closed panel, or a background/minimized window does not suppress it.
Tool progress, tool-limit answers, stopped responses, timeouts, and errors do not
produce success notifications. History persistence failure does not prevent a
notification for an answer that remains available in the running window.

Clicking a banner restores/focuses the main window and opens the existing chat.
Deleted chats and previous-account notifications cannot open another chat.
Account changes, window destruction/reload, disabling notifications, and quitting
dismiss the relevant notifications. Retention cleanup dismisses expired-chat
notifications when the refreshed history snapshot arrives.

The chat window must stay open or minimized. Closing it still cancels its runs;
this feature does not introduce execution after window closure or app exit.

## Verification

Automated tests use synthetic data and mocked Electron/OS transport. They cover
completion classification, matching renderer acknowledgements, duplicate/stale
events, multiple chats, visibility/focus suppression, click navigation, account
and deletion cleanup, unsupported systems, delivery failures, settings controls,
and reading notification preferences without accessing encrypted credentials.

Native macOS delivery must also be checked in the packaged app. Electron requires
code signing, and macOS notification permissions/Focus settings determine whether
banners and sounds appear. A build or mocked transport test does not establish
that the OS delivered a notification.

Manual acceptance steps:

1. Open the packaged app and enable notifications. Leave sound disabled.
2. Send a response and keep its chat visible in the focused window: no banner.
3. Send again and switch apps or minimize OpenPulse: one silent generic banner.
4. Click that banner: the window restores and displays the correct existing chat.
5. Repeat with two different chats running; each banner opens its own chat.
6. Keep OpenPulse focused with a different chat selected or the assistant panel
   closed: the completed background chat produces a banner. Viewing the same
   chat in the open assistant panel suppresses it.
7. Stop a response or cause a request failure: no success banner.
8. Enable sound and repeat a background completion; verify the OS plays it when
   notification and Focus settings permit. Disable notifications and confirm
   subsequent completions do not produce a banner.
9. Delete a notified chat or sign out: its existing banner is dismissed and
   cannot navigate to another conversation.

Handle any macOS permission or Keychain prompts personally. Native acceptance
has not been automated against the user's running app or account.
