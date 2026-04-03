# Privacy Policy — Browser Automation Assistant

**Last updated: 2026-04-03**

## Summary

Browser Automation Assistant is a **local-first** extension. All data stays on your device. No personal information is ever collected, stored remotely, or transmitted to third-party servers.

---

## Data Collection

**We collect no data.** Specifically:

| Category | Collected? | Notes |
|---|---|---|
| Browsing history | ❌ No | Page context is read only when a task is actively running and only passed to the local runner |
| Personal information | ❌ No | |
| Authentication data | ❌ No | |
| Keystrokes / input | ❌ No | |
| Financial / payment data | ❌ No | |
| Health data | ❌ No | |
| Location data | ❌ No | |
| Cookies | ❌ No | |
| User communications | ❌ No | |

---

## Network Requests

The extension communicates **exclusively** with a local runner process on your machine:

- Default: `http://localhost:3000`
- Configurable in extension settings (must remain a localhost address)

No requests are made to external servers, analytics services, CDNs, or any third-party endpoints. No telemetry. No crash reporting.

---

## AI / LLM Usage

When you submit a task, the extension sends page content to the **local runner** (on your machine). The runner may forward that content to an AI provider (e.g. OpenAI, Anthropic, or a local Ollama model) **based on your own settings configured in the runner**. This is under your direct control — the extension itself does not interact with any AI provider.

---

## Storage

The extension uses `chrome.storage.sync` and `chrome.storage.local` to persist:
- Your configured runner URL (default: `http://localhost:3000`)
- UI preferences (auto-start, approval mode)
- Local task history (stored on-device only, never synced externally)

No sensitive data is stored.

---

## Permissions Justification

| Permission | Why it's needed |
|---|---|
| `activeTab` | Read the URL/title of the currently active tab to route overlay messages |
| `nativeMessaging` | Launch and communicate with the local runner native host process |
| `scripting` | Inject the content script to collect page context and show task overlays |
| `sidePanel` | Display the automation panel in the browser sidebar |
| `storage` | Save settings and task history locally |
| `tabs` | Find the correct tab for overlay display when tasks run |
| `host_permissions: <all_urls>` | The content script must observe any page the user navigates to so the automation overlay can appear and page context can be collected regardless of which site is being automated |

---

## Contact

This extension is open-source. Report privacy concerns via the project GitHub repository.
