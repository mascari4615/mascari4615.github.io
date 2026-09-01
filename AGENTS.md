# AGENTS.md

This file provides context and operating rules for AI coding agents working in this repository.

## Required shared rules

Paths named here are not loaded automatically. Before editing, read:

- `../memo/UMBRELLA.md`
- `../memo/rules/process.md`
- `../memo/rules/git.md`
- `../memo/rules/quality.md`
- `../memo/rules/persona.md`
- `../memo/rules/code-style.md` for code changes
- `../memo/rules/docs.md` for documentation changes
- `../memo/rules/commit.md` before commit or push

Start every change in a repository lane. The shared rules apply even when the AI client has no lifecycle-hook support. If this file conflicts with `CLAUDE.md`, the shared rules and this file take precedence for vendor-neutral behavior.

## Project Snapshot

- Repository: mascari4615.github.io (monorepo; the site is assembled by Node. `apps/karmolab/scripts/assemble-site.mjs`. Jekyll/Chirpy were removed in the cutover)
- Main site: Korean blog/portfolio deployed to GitHub Pages (`blog.mascari4615.com`); the app shell lives at `/`
- Companion apps: KarmoLab, Tauri app, Discord bots, browser extension

## KarmoLab UI work: use the hot-reload dev server (KL-100)

`cd apps/karmolab && npm run dev` → http://127.0.0.1:8813/apps/karmolab/index.html

Do **not** wait for a deploy to see UI changes. Styles apply instantly with no reload;
widgets are hot-swapped (open tabs and typed input survive); only shell changes
(`src/toolbox.ts`, `widgets-loader`, `index.html`) trigger a reload.

Widgets that start timers or global listeners must hand cleanup to `Toolbox.onDispose(fn)`
inside `build`. otherwise they pile up on every swap.

If you change `index.html`, run `npm run audit:pages`: the 127 tool detail pages are
generated from that shell at deploy time, and a shape change there can stop deploys entirely.

## Important Working Boundaries

- Do not edit compiled output under `assets/js/dist/`. Edit source files in `_javascript/` instead.
- Treat each app under `apps/` as an independent project with its own install/build flow.
- Avoid changing `_config.yml` unless the task explicitly requires global site behavior changes.
- Keep changes focused. Do not mix unrelated refactors into feature/fix work.

## High-Signal Paths

- Site source: `_posts/`, `_tabs/`, `_layouts/`, `_includes/`, `_sass/`, `_javascript/`
- KarmoLab source: `apps/karmolab/src/`
- Shared AI utilities: `packages/ai/`
- CI workflows: `.github/workflows/`

## Common Commands

### Root (site)

```bash
npm run build
npm run build:css
npm run build:js
npm run test
bundle exec jekyll serve
bundle exec jekyll b
```

### KarmoLab

```bash
cd apps/karmolab
npm ci
npm run typecheck
npm run build
```

### Shared AI Package

```bash
cd packages/ai
npm ci
npm run build
```

## AI-Related Change Checklist

When editing AI-related paths (for example `apps/karmolab/src/gemini.ts`, chatbot widgets, or `packages/ai/`):

1. Run type checks for affected app/package.
2. Run build for affected app/package.
3. Keep provider-specific behavior explicit (AI Studio vs Vertex).
4. Preserve existing env-based configuration contracts unless migration is requested.
5. Update docs/comments only when behavior or public config contracts changed.

## Commit and PR Conventions

- Use Conventional Commits (`feat:`, `fix:`, `chore:`, etc.).
- Keep PR scope single-purpose.
- In PRs, mark AI usage in `.github/PULL_REQUEST_TEMPLATE.md` when applicable.
