# Exporter Playground

A drawtonomy extension that runs the [`@drawtonomy/sdk`][sdk] exporters
(OpenDRIVE, OpenSCENARIO, and esmini-ready zip bundle) against the current
canvas snapshot.

[sdk]: https://www.npmjs.com/package/@drawtonomy/sdk

## What is this for?

Mainly for SDK contributors who want to verify exporter changes against a
real scene drawn in drawtonomy, without copy-pasting fixtures into a script
by hand. End users can also use it as a way to drive the exporters from a
side panel.

When run with a locally linked `@drawtonomy/sdk`, every press of the
**Export** buttons goes through your local SDK build — making this the
canvas-driven counterpart to the snapshot-driven and esmini-only flows
described in the [Exporter Developer Guide][docs].

[docs]: ../../docs/exporter.md

## Quick Start

```bash
# 1. Install workspace deps (once at the repo root)
pnpm install

# 2. Start this extension on port 3003
cd extensions/exporter-playground
pnpm dev

# 3. Open drawtonomy with this extension loaded.
#    Locally with @drawtonomy/dev-server:
open "http://localhost:3000/?ext=http://localhost:3003/manifest.json"
#    Or against the hosted app (HTTPS-only):
open "https://drawtonomy.com/?ext=https://your-deployed-extension.example/manifest.json"
```

In the side panel:

1. Draw a scene on the canvas (lanes, vehicles, …).
2. Press **Refresh snapshot** if you change the scene.
3. Choose the format:
   - **Export OpenDRIVE (.xodr)** — road network XML
   - **Export OpenSCENARIO (.xosc)** — scenario XML referencing the .xodr
   - **Export esmini bundle (.zip)** — `<base>.zip` with both files inside

## Working against a local SDK build

This extension lives in the same workspace as `@drawtonomy/sdk`, so it
already imports the workspace SDK during `pnpm dev`. No separate `pnpm link`
step is needed — just rebuild the SDK after changes:

```bash
cd packages/drawtonomy-sdk && pnpm build
# Reload the extension in the browser.
```

## Source

- `manifest.json` — declares `snapshot:read`, `ui:panel`, `ui:notify` capabilities
- `index.html` — minimal panel UI (3 export buttons + status)
- `src/main.ts` — the only TypeScript file: wires `ExtensionClient` to `exporter.exportTo*` and downloads the result via `<a download>`

The whole extension is intentionally thin so it doubles as a code-reading
example for new SDK consumers.
