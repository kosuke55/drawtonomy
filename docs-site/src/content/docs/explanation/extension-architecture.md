---
title: Extension architecture
description: How drawtonomy loads, isolates, and talks to third-party extensions.
---

drawtonomy extensions are not plugins compiled into the editor. They are
separate web apps loaded into an iframe, communicating with the host
through `postMessage`. This page explains why, and what falls out of
that choice.

## Loading

An extension is a URL pointing at a `manifest.json`. The user (or a
deep-link) opens the editor with `?ext=<manifestUrl>`:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

The editor fetches the manifest, creates an iframe, and loads the
extension's entry HTML. Multiple extensions can be loaded at once with
repeated `?ext=` parameters.

## Isolation

Extensions run inside an iframe with their own origin. They cannot:

- Touch the editor's DOM directly.
- Read drawtonomy's localStorage.
- Load resources past the host's CSP.

They can only do what they ask for in the manifest's `capabilities`
array (`shapes:read`, `shapes:write`, `ui:panel`, …) and what
`postMessage` exposes through `@drawtonomy/sdk`'s `ExtensionClient`.

This is intentional. Extensions are third-party code; the editor must
treat them as untrusted.

## Communication

The SDK wraps `postMessage` in an `ExtensionClient` that gives you a
typed, promise-based API:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

Under the hood:

- The extension posts a request to the host iframe.
- The host validates against the extension's capabilities.
- The host responds, or the request is rejected.

## Why iframes

The alternatives — npm-style plugins, Webpack module federation,
in-process scripts — all require trusting the extension's code with
your editor. They also couple extension lifetimes to the editor's build.

Iframes give us:

- **Origin isolation.** Browser-enforced; no JS sandbox to maintain.
- **Independent deploy cycles.** Extensions ship at their own pace.
- **Any framework.** React, Vue, Svelte, vanilla JS — the host does not
  care.
- **Same code in dev and prod.** The dev server hosts the editor at
  `localhost:3000`; you point it at your extension at `localhost:3001`.
  Same `?ext=` flag, same protocol.

The trade-off is that `postMessage` is async. Calls that look free
(`getShapes()`) cost an iframe round-trip. The SDK batches and caches
where it can; do not put a call inside a tight loop.

## Local development

The `@drawtonomy/dev-server` package serves the editor locally so you
can develop against it without a network round-trip:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # editor on :3000
cd my-extension && pnpm dev --port 3001        # extension on :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

The full guide is in the public repo:
[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## See also

- [Extension SDK API](/extend/extension-sdk/)
- [`@drawtonomy/sdk` overview](/reference/sdk/)
