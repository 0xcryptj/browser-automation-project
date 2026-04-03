# Chrome Web Store Listing — Browser Automation Assistant

---

## Extension Name
**Browser Automation Assistant**

## Short Name (≤12 chars for toolbar)
AutoAssist

---

## Short Description (132 chars max)
> **Current (116 chars):**
> Local-first AI browser automation. Describe tasks in plain English — runs entirely on your own machine.

✅ Within limit.

---

## Long Description

**Browser Automation Assistant** lets you describe browser tasks in plain English and executes them automatically — entirely on your own machine.

**How it works:**
1. Click the panel icon to open the side panel
2. Type a task like "Go to GitHub and open my latest PR" or "Fill out the form on this page"
3. The assistant plans and executes the steps, showing a live overlay so you can follow along
4. Approve sensitive steps before they run (configurable)

**Privacy-first by design:**
- 100% local processing — all automation runs via a local runner on your machine
- No data is sent to external servers
- No accounts, no cloud sync, no telemetry
- You choose your own AI provider (OpenAI, Anthropic, local Ollama, etc.) — configured in the local runner

**Key Features:**
- Plain-English task input
- Live visual overlay showing exactly what the automation is doing
- Step approval mode for sensitive actions (login, form submission, purchases)
- Works with any website
- Configurable to use local AI models (fully offline option)
- Task history stored locally

**Requirements:**
- The local runner must be installed and running on your machine
- See the project README for setup instructions

**Open Source** — inspect the full source code before installing.

---

## Category
**Productivity** (primary)
Secondary consideration: Developer Tools

---

## Language
English

---

## Screenshots Required (CWS requires at least 1, recommended 5)

Capture these at 1280×800 or 640×400:

1. **Side panel open** — Show the panel docked to the right side of Chrome with a task being typed in the input field
2. **Task running** — Show the blue overlay frame + badge on an active page mid-automation (e.g. navigating to a search page)
3. **Approval prompt** — Show the purple "awaiting approval" overlay + approval modal in the side panel
4. **Task completed** — Show the result/completion state in the side panel with task history visible
5. **Settings panel** — Show the settings panel with runner URL, planner model selection

> ⚠️ Screenshots must not include personal/sensitive data, login credentials, or real API keys.

---

## Promotional Images (optional but recommended)

- Small tile: 440×280 px
- Large tile: 920×680 px  
- Marquee: 1400×560 px

---

## Privacy Practices Declaration (for CWS Developer Dashboard)

When submitting, declare the following in the **Privacy practices** tab:

| Question | Answer |
|---|---|
| Does the extension collect or use user data? | **No** |
| Does it handle personally identifiable information? | **No** |
| Does it transmit data to a server? | **No** (only to localhost) |
| Does it use remote code? | **No** |
| Certified privacy policy URL | Link to PRIVACY.md or hosted version |

**Single-purpose description for CWS review:**
> "This extension provides an AI-powered browser automation interface. It injects a UI panel and page overlay, collects page context (DOM structure, visible text) to relay to a locally-running automation runner on the user's own machine, and displays real-time task status. It does not transmit any data to external servers."

---

## CWS Reviewer Notes (include in submission notes)

- `<all_urls>` in `host_permissions` is required because the automation overlay must appear on any site the user is currently visiting. The content script observes pages passively (runs at `document_idle`) and only activates when the user initiates a task from the side panel. All page data is sent to `localhost` only.
- `nativeMessaging` is used exclusively to launch and communicate with the local runner native host (`com.browser_automation.host`), which starts a local Node.js process. The native host manifest and install scripts are included in the open-source repository.
- No remote code is executed. All JS is bundled at build time with Vite.

---

## Version History

### 0.1.0 (initial release)
- Local-first AI browser automation
- Side panel UI with task input
- Visual overlay with element targeting
- Step approval mode
- Native host for auto-starting the local runner
