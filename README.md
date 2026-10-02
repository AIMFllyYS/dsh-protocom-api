# dsh-protocom-api

**English** | [中文](./README.zh-CN.md)

[![GitHub Release](https://img.shields.io/github/v/release/AIMFllyYS/dsh-protocom-api?display_name=tag&sort=semver)](https://github.com/AIMFllyYS/dsh-protocom-api/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![DSH](https://img.shields.io/badge/DSH-%E2%89%A50.1.7--rc.2_%3C0.3.0-blue)](#system-requirements)
[![Tests](https://img.shields.io/badge/tests-536%20passed-brightgreen)](#development)

A DeepSeek Harness (DSH) plugin that brings four provider families into DSH's model menu: **Protocom official API, OpenCode Go, Command Code (incl. the GOAT tier), and ClinePass**. All four share the same settings UI, model menu, key pool, and retry policy — learn the subscription workflow once, use it everywhere.

> Note: the in-depth documentation under [`docs/`](./docs/) is currently written in Chinese; this page covers everything needed to install and get running.

## Supported providers

| Provider family | Provider route | Default endpoint | What it carries | Details |
| --- | --- | --- | --- | --- |
| **Protocom official API** | `protocom-aggregate/-codex/-stepfun/-grok` | `https://relay.protocom.org` | Relay service, one endpoint with four groups: open-source aggregate, Codex, StepFun, Grok | [docs/providers/protocom.md](./docs/providers/protocom.md) |
| **OpenCode Go subscription** | `opencode-go-sub` | `https://opencode.ai/zen/go` | Full Go subscription lineup (41 registry entries) | [docs/providers/opencode-go.md](./docs/providers/opencode-go.md) |
| **Command Code subscription** | `commandcode` | `https://api.commandcode.ai/provider` | Models covered by your plan (82 listed, 73 servable as measured) | [docs/providers/commandcode.md](./docs/providers/commandcode.md) |
| **ClinePass subscription** | `clinepass` | `https://api.cline.bot/api/v1` | Cline's curated set of 14 open-source coding models | [docs/providers/clinepass.md](./docs/providers/clinepass.md) |

## Features

Full details live in [docs/guides/features.md](./docs/guides/features.md); the outline:

- **Live model discovery** — `GET /v1/models` per group, with a curated display-name registry
- **Selectable context lengths** — each tier is its own menu entry; 200K/256K/400K/1M ladder, tiers beyond a model's window are never offered
- **Per-model effort submenus** — vocabularies measured per model and per family; no fake controls for capabilities the gateway doesn't expose
- **Cache-aware usage accounting** — cache hit rate, per-turn TPS, and token breakdown all correct
- **Balance & quota panels** — each family renders its endpoint's real shape (balance area / three-window quota bars / account strip)
- **Image input (multimodal)** — inline images on both chat-completions and responses protocols
- **Multi-key pool** — sticky (default, cache-friendly) or round-robin assignment, with automatic cooldown of rejected keys
- **Validate-on-write credentials** — obviously malformed shapes are rejected at save time, not at the next request
- **Configurable retry budget** — defaults cover roughly 8 hours of cumulative backoff, so overnight jobs survive relay outages
- **Fusion dual-model (Leader / Coder)** — the main thread runs the Leader seat; every subagent is pinned to the Coder seat
- **Guided settings pages** — four full pages plus Fusion, bilingual UI; per-row summaries with on-demand expansion

## Installation

See [System requirements](#system-requirements) first. The repo ships prebuilt artifacts (`lib/`), so git installs need no build step; the installer initializes the profile and appends the plugin to `dsh.profile.bundles` automatically — no YAML editing required.

### Desktop app (recommended)

The DSH desktop app ships with a built-in plugin manager — no command line needed:

1. Open the app and choose **Plugins (插件)** in the sidebar
2. Click **Add plugin (添加插件)** and paste:

   ```
   github:AIMFllyYS/dsh-protocom-api#v1.2.6
   ```

   (`#v1.2.6` pins the release; omit `#...` to install the latest commit on main)
3. Click **Install**, wait for pnpm to finish, then click **Enable now (立即启用)**

The dialog accepts package names, Git URLs, tarballs, and local paths — the same spec format as `dsh plugin add`. The plugin manager currently offers **no auto-update and no version picker**: upgrading means uninstalling and installing the newer version (your configuration and credentials are untouched).

### CLI (dsh web / self-hosted)

```bash
# Run inside a DSH checkout (the `web` profile; substitute any other profile name)
pnpm dsh plugin --profile web add "github:AIMFllyYS/dsh-protocom-api"
pnpm dsh web
```

The CLI works against any profile: `--profile web` installs into the profile served by `dsh web`, while `--profile desktop` targets the desktop app's profile. That said, package operations on a **running** desktop instance are owned by the in-app plugin manager, so the UI route above is preferred there (for boot-time-only profiles, stop the process before using the CLI).

Local-directory install (for development; rebuild to pick up changes):

```bash
pnpm dsh plugin --profile web add "/path/to/dsh-protocom-api-plugin"
```

## Quick start

1. **Configure credentials**: Settings → the provider's page (Protocom API / OpenCode Go / Command Code / ClinePass) → group card → paste the API key → save (saving enables the group). See [docs/guides/configuration.md](./docs/guides/configuration.md) for details.
2. **Verify the installation**:
   - The group card's model probe returns the model list (display names + context chips)
   - The chat model menu shows the group's entries, with an effort submenu where supported
   - Send a message: thinking models render a collapsible reasoning block; the stats area shows cache hit rate and TPS
   - Protocom cards show the balance area; OpenCode Go shows three-window quota bars; Command Code shows the account strip (ClinePass has no such endpoint — "balance unavailable" is expected)

## Documentation

| Document | Contents |
| --- | --- |
| [docs/providers/protocom.md](./docs/providers/protocom.md) | The four Protocom groups, why stepfun defaults to the responses channel, the refusal list |
| [docs/providers/opencode-go.md](./docs/providers/opencode-go.md) | Session headers, effort-only reasoning, protocol routing, three-window quotas |
| [docs/providers/commandcode.md](./docs/providers/commandcode.md) | Listing semantics, why 9 Claude models stay hidden, account panel & plan gating |
| [docs/providers/clinepass.md](./docs/providers/clinepass.md) | The 458-row decoy catalog, the real 14-model list, retired ids, toggle vocabularies |
| [docs/guides/features.md](./docs/guides/features.md) | Full feature reference: key pool, retry, Fusion, cache accounting |
| [docs/guides/configuration.md](./docs/guides/configuration.md) | UI vs. file-based configuration, 0.8.0 migration, credential storage |
| [docs/guides/security.md](./docs/guides/security.md) | baseURL pinning, telemetry route fencing, credential boundaries |
| [docs/guides/faq.md](./docs/guides/faq.md) | General FAQ (provider-specific entries live in each provider doc) |

## System requirements

- **DSH ≥ 0.1.7-rc.2 and < 0.3.0-0** (the measured peer range); verified through **0.2.0-rc.2**
- pnpm (the plugin manager installs and updates through it)

> ⚠️ **1.0.0 was a breaking release.** DSH 1.7 rewrote the settings subsystem and removed `offloadRequestImagesWithPolicy`; no single codebase supports both 0.1.6 and 0.1.7. On DSH ≤ 0.1.6, use plugin version **0.8.0**. Upgrading from ≤ 0.8.0 requires a config-shape migration — see [docs/guides/configuration.md](./docs/guides/configuration.md).

## Updating & uninstalling

```bash
pnpm dsh plugin --profile web update dsh-protocom-api   # update to latest main
pnpm dsh plugin --profile web remove dsh-protocom-api   # uninstall
```

Desktop users operate from the Plugins page: upgrading means uninstalling and reinstalling (in-place upgrades aren't supported yet).

## Development

```bash
pnpm install
pnpm run build   # tsdown → lib/index.js (Host, ESM) + lib/client.js (Web client, CJS factory); tsc -b → lib/types
pnpm run test    # vitest, 536 cases (incl. security regressions)
pnpm run check:consistency   # asserts lib/ matches src/ (build && git diff --exit-code)
```

This repo commits the `lib/` build output alongside the sources (so git installs need no build) — always run `pnpm run build` before committing code changes.

## Terminology

"Protocom official API" refers **only** to `relay.protocom.org`. OpenCode Go, Command Code, and ClinePass are their own subscription services; documentation, UI, and comments never describe their models as Protocom's. Collectively they are "provider families".

## License

[MIT](./LICENSE) © 2026 AIMFllyYS
