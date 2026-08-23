# @drawtonomy/dev-server

Local development server for drawtonomy extension development.

On first run, downloads the latest build from `drawtonomy.com` and caches it locally. Always serves the same version as the live site — no manual updates needed.

## Quick Start

```bash
npx @drawtonomy/dev-server
```

This starts a local server at `http://localhost:3000` with the full drawtonomy editor.

## Extension Development

```bash
# Terminal 1: Start drawtonomy locally
npx @drawtonomy/dev-server

# Terminal 2: Start your extension
cd my-extension
pnpm dev --port 3001

# Browser
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## How it works

1. On startup, fetches the latest HTML/JS/CSS from `drawtonomy.com`
2. Caches files in `~/.drawtonomy-dev-server/cache/` (valid for 1 hour)
3. Serves the cached files on `localhost`
4. After 1 hour, automatically re-downloads on next startup

## Why use this?

- `drawtonomy.com` (HTTPS) cannot load extensions from `localhost` (HTTP) due to browser Private Network Access restrictions
- This dev server runs locally on HTTP, so localhost extensions work without issues
- Always up-to-date with `drawtonomy.com` — no manual version management

## AI scenario generation (bring your own key)

drawtonomy can generate a driving scenario from a plain-text description. The
generation loop runs in your browser, but browsers cannot call the AI vendors
directly — each vendor sets its own CORS policy, and some refuse browser-origin
requests outright. This server therefore exposes one route,
`POST /api/ai-scenario/llm-relay`, and forwards the request for the page.

Enter your own API key in the editor (the AI panel has a provider picker and a
key field). Supported providers:

| Provider | Key from |
|---|---|
| Anthropic | https://console.anthropic.com/ |
| OpenAI | https://platform.openai.com/api-keys |
| Gemini | https://aistudio.google.com/apikey |

The key is sent with each request as a header, used only to build the outgoing
call, and then discarded. It is never written to disk, never added to the
server's environment, and never logged. Requests are billed to your own account
by the provider you pick.

The relay is a development convenience bound to the same localhost surface as
the file serving — do not expose this server to a network you do not control.

## Options

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DRAWTONOMY_HOST` | `https://www.drawtonomy.com` | Host to download from |

```bash
# Custom port
PORT=8080 npx @drawtonomy/dev-server

# Force re-download (ignore cache)
npx @drawtonomy/dev-server --fresh
```
