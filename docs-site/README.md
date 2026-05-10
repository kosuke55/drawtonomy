# drawtonomy docs site

The source for [docs.drawtonomy.com](https://docs.drawtonomy.com).

Content lives in [`src/content/docs/`](./src/content/docs/) as plain
Markdown / MDX so anyone can read it on GitHub or open a PR.

## Information architecture

The site follows the [Diátaxis](https://diataxis.fr/) framework:

| Folder | Purpose |
|---|---|
| `start/` | Entry pages (introduction, quickstart). |
| `tutorials/` | Hands-on lessons. New users learn by doing. |
| `guides/` | Task-oriented how-to recipes. |
| `reference/` | Facts to look up — shortcuts, formats, APIs. |
| `explanation/` | Concepts and design choices. |
| `extend/` | Building on top of drawtonomy (extensions, exporters, templates). |

When in doubt, ask: is the reader **learning**, **doing**, **looking up**,
or **understanding**? That picks the section.

## Local development

```bash
pnpm install                              # at the repo root
pnpm --filter @drawtonomy/docs-site dev   # http://localhost:4321
```

Build a production bundle:

```bash
pnpm --filter @drawtonomy/docs-site build
pnpm --filter @drawtonomy/docs-site preview
```

The build emits `dist/` with prerendered HTML, a Pagefind search index,
and a sitemap.

## How the site is hosted

`docs.drawtonomy.com` is served by Vercel as a separate project that
points at this `docs-site/` folder. The settings on the Vercel side are:

| Setting | Value |
|---|---|
| Root Directory | `docs-site` |
| Framework preset | Astro (auto-detected) |
| Build command | `pnpm build` |
| Output directory | `dist` |
| Install command | `pnpm install --frozen-lockfile` |
| Custom domain | `docs.drawtonomy.com` |

Preview deployments run on every PR. Production deploys when changes
land on `main`. If you fork the repo and want to host your own copy,
the same settings work on Vercel, Netlify, or any other static host
that can build an Astro project.

## Adding a page

1. Drop a Markdown / MDX file into the right folder under
   `src/content/docs/`.
2. The sidebar autogenerates from the folder. Use `sidebar.order` in
   frontmatter to control position within a section.
3. Run `pnpm dev` and check the page renders.

Frontmatter template:

```md
---
title: Short title
description: One-sentence summary used for SEO and the sidebar.
sidebar:
  order: 1
---
```

## Style

- Prefer the active voice and second person.
- Tutorials are step-numbered; how-to guides have steps too but assume
  some knowledge.
- Reference pages are tables and lists, no narrative.
- Link generously: every page is a few clicks from the rest.

## What stays out

This is the **public** documentation site. Do not include:

- References to private repositories or internal hostnames.
- Implementation paths beyond what is in `kosuke55/drawtonomy`.
- Internal release timelines, customer names, or unannounced features.

The CI guard in [`scripts/check-private-leaks.sh`](./scripts/check-private-leaks.sh)
greps the source for known forbidden patterns. Run it locally before
opening a PR:

```bash
./docs-site/scripts/check-private-leaks.sh
```
