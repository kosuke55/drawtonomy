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
npm run dev -- --port 3001

# Browser
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## How it works

1. On startup, fetches the latest HTML/JS/CSS from `drawtonomy.com`
2. Caches files in `~/.drawtonomy-dev-server/cache/` (valid for 1 hour)
3. Serves the cached files on `localhost`
4. After 1 hour, automatically re-downloads on next startup

No drawtonomy source code is included in this package — it fetches the same minified build that `drawtonomy.com` serves.

## Why use this?

- `drawtonomy.com` (HTTPS) cannot load extensions from `localhost` (HTTP) due to browser Private Network Access restrictions
- This dev server runs locally on HTTP, so localhost extensions work without issues
- Always up-to-date with `drawtonomy.com` — no manual version management

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
