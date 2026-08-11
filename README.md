# <img src="./docs/images/logo.png" width="32" height="32" align="absmiddle" /> drawtonomy

<h3 align="center">
  Draw driving scenes. Run driving scenarios. 🚗
</h3>

<p align="center">
  A free, browser-based whiteboard for driving scenarios.<br />
  No install. No account.
</p>

<h4 align="center">
  🎬 <a href="https://drawtonomy.com/?open=https://github.com/esmini/esmini/blob/master/resources/xosc/acc-test.xosc">Play a live scenario</a> |
  🎨 <a href="https://drawtonomy.com">Start drawing</a> |
  📖 <a href="https://docs.drawtonomy.com">Docs</a> |
  💬 <a href="https://github.com/kosuke55/drawtonomy/issues">Issues</a>
</h4>

<p align="center">
  <img src="./docs/videos/drawtonomy-demo.gif" width="80%" />
</p>

Two modes, one canvas:

- **🎨 Scene mode — draw the scene.** Topology-aware lanes, vehicles, and
  intersections. Export figures (SVG / PDF) or maps (OpenDRIVE, Lanelet2).
- **🎬 Scenario mode — make it move.** Add events and triggers, press play —
  [esmini](https://github.com/esmini/esmini)-WASM runs it in the browser,
  PASS / FAIL verdict included.

## 🎨 Scene mode

- **[Topology-aware lanes](https://docs.drawtonomy.com/guides/lane-connections/)** — connections follow when you edit
- **[Lane tool](https://docs.drawtonomy.com/guides/lane-tool/)** — click a centerline, get both boundaries
- **[Map → lanes](https://docs.drawtonomy.com/guides/lane-from-map/)** — trace real roads from satellite/OSM data
- **[Intersection & roundabout templates](https://docs.drawtonomy.com/guides/intersections/)** — one click
- **[Vehicles, pedestrians, signs, and more](https://docs.drawtonomy.com/guides/participants/)** — a full driving-domain library
- **[Snap & point sharing](https://docs.drawtonomy.com/guides/snap/)** — geometry stays connected
- **[Path footprints](https://docs.drawtonomy.com/guides/path-footprint/)** — auto-placed and style-synced
- **[Math (LaTeX)](https://docs.drawtonomy.com/guides/math-equations/)** — typeset equations on the canvas
- **[Re-editable saves](https://docs.drawtonomy.com/reference/drawtonomy-svg/)** — `.drawtonomy.svg` reopens with everything intact

📖 **[Feature tour with demo videos](docs/feature-tour.md)** ·
[docs.drawtonomy.com](https://docs.drawtonomy.com)

## 🎬 Scenario mode

Start from a blank scene or an imported one, add events and triggers, and
author a full OpenSCENARIO storyboard yourself.

- **[Visual authoring](https://docs.drawtonomy.com/scenario/first-scenario/)** — phases, events, actions, and triggers on the scene you drew
- **[Open and edit any `.xosc`](https://docs.drawtonomy.com/scenario/open-and-play/)** — from disk or a GitHub URL, fully editable
- **[Full playback](https://docs.drawtonomy.com/scenario/playback/)** — seek, Follow Ego, ghost trails, `.webm` export
- **[PASS / FAIL verdicts](https://docs.drawtonomy.com/scenario/end-and-fail-conditions/)** on every run
- **[esmini-ready export](https://docs.drawtonomy.com/guides/export-asam/)** — `.xodr` + `.xosc` zip for desktop esmini

Any public `.xosc` on GitHub runs with one click:
**[Play a live scenario](https://drawtonomy.com/?open=https://github.com/esmini/esmini/blob/master/resources/xosc/acc-test.xosc)**.
The [**drawtonomy for GitHub**](https://docs.drawtonomy.com/integrations/github-extension/)
extension plays them right where they live:

<div align="center">
  <video src="https://github.com/user-attachments/assets/a8e85a81-114c-4250-8b85-1c5db7c86607" width="80%" controls></video>
</div>

## 🔄 Formats

OpenDRIVE, Lanelet2, OpenSCENARIO, ROS maps, and figures like SVG/PDF.
→ [Full format table](docs/feature-tour.md#-exportimport) ·
[export formats reference](https://docs.drawtonomy.com/reference/export-formats/)

## 🤖 AI & automation

- **[AI Scene Generator](extensions/ai-scene-generator/)** — generate scenes from natural language or OpenSCENARIO XML — by [@vishwesh5](https://github.com/vishwesh5)
- **[MCP Server](https://www.npmjs.com/package/@drawtonomy/mcp-server)** — let AI agents draw scenes for you
- **[Headless SDK](https://www.npmjs.com/package/@drawtonomy/sdk)** — generate and export scenes from Node.js, no browser

## 🔒 Privacy

Browser-only. No backend, no account, no telemetry — files never leave your
browser, even the esmini engine runs locally as WebAssembly.
([details](https://docs.drawtonomy.com/security/))

## 🧩 Build on it

An iframe-based extension system with an SDK and postMessage API:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server
# then open http://localhost:3000/?ext=http://localhost:3001/manifest.json
```

📖 [Extending drawtonomy](https://docs.drawtonomy.com/extend/) ·
[Extension guide](docs/extensions.md) ·
[Exporter guide](docs/exporter.md)

## 📚 More

- 🎞️ [Feature tour](docs/feature-tour.md)
- ⌨️ [Keyboard shortcuts](https://docs.drawtonomy.com/reference/shortcuts/)
- ⚖️ [Comparisons](https://docs.drawtonomy.com/compare/)
- 💡 [Use cases](https://docs.drawtonomy.com/use-cases/)
- ❓ [FAQ](https://docs.drawtonomy.com/faq/)

<sub>[日本語](README.ja.md)</sub>
