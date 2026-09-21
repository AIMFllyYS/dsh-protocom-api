---
name: testing-dsh-web
description: How to run and E2E-test a DSH web deployment (dsh web) with linked plugins — token-gated URL, settings sections, composer model picker, common pitfalls
---

# Testing DSH web deployments

## Devin Secrets Needed
- Provider API keys as required by the plugin under test (e.g. an `OPENCODE_GO_API_KEY` value supplied by the user).

## Starting the server
- Node 22 lives at `~/tools/node-v22.20.0-linux-x64/bin` — put it on PATH first.
- `nohup npx dsh web --no-open --port 8899 > ~/dsh-e2e/dsh-web.log 2>&1 &`
- Read the log for `dsh web: http://127.0.0.1:8899/?token=<TOKEN>` — open the FULL URL. Plain `/` returns 401; the token exchange 303-redirects and sets an HttpOnly `dsh-auth-*` cookie. To curl API routes later: `curl -c /tmp/dsh-cookies.txt -sL 'http://127.0.0.1:8899/?token=<TOKEN>'` then `curl -b /tmp/dsh-cookies.txt ...`.
- Check the log for plugin errors: `grep -niE 'plugin-name|error' ~/dsh-e2e/dsh-web.log`.

## UI navigation notes
- Settings: gear icon bottom-left of the sidebar. Plugin sections appear in the left nav (below Agent presets). Nav rows are ~28px tall — aim for the text/icon, not the space below the last row.
- First session requires picking a workspace directory in a **native KDialog** — you can type the absolute path directly into its location field.
- Composer model seat (bottom-right of input) opens a small popover with "Model" and "Effort" rows; each row opens the picker/effort submenu. Escape may not close nested menus — click empty chat space.
- Reasoning output renders inside a collapsed "Thought for a while" group; expand it to see a "Think" sub-item with reasoning text. Context-injection steps (system prompt, model-change notes) also live in that group.
- Persisted state to verify writes: `~/.dsh/settings.yaml` (section values, `modelContexts`, `agent-default-model`) and `~/.dsh/.credentials.yaml` (key refs, never values).

## Gotchas observed
- `browser_console` / `read_dom` may evaluate against `chrome://new-tab-page` rather than the app tab — screenshots are the authoritative evidence; verify API routes with curl + the cookie jar instead.
- Schemastery (`@deepseek-ai/schemastery`) `z.array()` normalizes a MISSING field to `[]` — so `field ?? defaults` patterns silently lose defaults once a settings object is materialized. Check for this shape when menu/options counts collapse after enabling a feature.
- A Chrome "save password" popup may appear after saving API keys — dismiss it.
