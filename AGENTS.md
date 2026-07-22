# AGENTS.md

Instructions for AI coding agents working on this repository.

## Project

AI-Signals — CLI tool that fetches curated AI blogs/podcasts from Substack, RSS, and Xiaoyuzhou FM into local Markdown files. Node.js 22+ / Bun, ESM, minimal dependencies (only `js-yaml`).

## Architecture

```
sources.yaml          →   scripts/fetch.mjs (entry point)
                            ├── fetchers/substack.mjs   → RSS → parseRSSItems() regex
                            ├── fetchers/blog.mjs       → RSS/Atom
                            └── fetchers/xiaoyuzhou.mjs → web scrape / API
                            all use:
                            ├── lib/storage.mjs    → saveRaw() → raw/social/{platform}/{key}/
                            ├── lib/state.mjs      → .ai-signals-state.json (dedup cursor)
                            └── lib/fetch-proxy.mjs → HTTPS_PROXY-aware fetch wrapper
```

**Key design decisions:**

- **No XML parser dependency.** Substack RSS is parsed with regex (`/<item>([\s\S]*?)<\/item>/gi`). This is intentional — RSS 2.0 item structure is predictable. Do not add an XML library unless adding Atom support that requires it.
- **Incremental fetch via state file.** `.ai-signals-state.json` stores `lastUrls[]` per platform/key. `isDuplicate()` checks this before saving. Keep this approach — don't switch to timestamp-only dedup.
- **Xiaoyuzhou uses official transcript API** (not local Whisper). Login flow saves tokens to `~/.ai-signals/`.

## Commands

```bash
bun run scripts/fetch.mjs                  # fetch all sources
bun run scripts/fetch.mjs --dry            # preview only
bun run scripts/fetch.mjs --platform substack
bun run scripts/fetch.mjs --source "Fei-Fei Li"
bun run scripts/login-xiaoyuzhou.mjs       # one-time SMS login
```

## File Structure

| Path | Role |
|------|------|
| `sources.yaml` | User's source list (gitignored, copy from example) |
| `sources.example.yaml` | Template for user config |
| `curated/*.yaml` | Pre-made lists organized by topic (commented out) |
| `scripts/fetch.mjs` | CLI entry point, dispatches to fetchers |
| `scripts/fetchers/substack.mjs` | Substack RSS fetcher |
| `scripts/fetchers/blog.mjs` | Generic RSS/Atom blog fetcher |
| `scripts/fetchers/xiaoyuzhou.mjs` | Xiaoyuzhou FM podcast fetcher |
| `scripts/fetchers/lib/state.mjs` | Read/write `.ai-signals-state.json` |
| `scripts/fetchers/lib/storage.mjs` | Write Markdown + YAML frontmatter to `raw/social/` |
| `scripts/fetchers/lib/fetch-proxy.mjs` | Fetch wrapper with `HTTPS_PROXY` support |
| `SKILL.md` | AI agent skill manifest (for pi skill system) |
| `raw/social/` | Output directory (gitignored) |
| `.ai-signals-state.json` | Incremental fetch state (gitignored) |

## Conventions

### Naming

- **Project name**: `AI-Signals` — always use this hyphenated PascalCase form in prose and docs.
- **npm package / CLI command / state file / config dir**: `ai-signals` — lowercase kebab-case for all technical identifiers.
- **GitHub repo**: `royce17/ai-signals` — matches the npm package name.

### YAML (curated/*.yaml, sources.yaml)

```yaml
sources:
  # Comment describing the source (Chinese or English, one line)
  # - name: "Name"
  #   substack: "subdomain"        # → subdomain.substack.com
  #   tags: [lowercase, kebab-case]
```

- Two-space indent
- Each source starts commented out in curated lists
- Tags: lowercase, hyphen-separated
- `name` field is required

### JavaScript

- ESM (`import`/`export`), `.mjs` extension
- Node.js 22+ built-in APIs only (no extra deps without strong reason)
- Functions use JSDoc comments: `/** ... */`
- Console output prefixes: `✅` success, `❌` error, `⚠️` warning, `🔍` dry run, `📡` fetching, `📥` saving

### Output format

```markdown
---
title: "Post Title"
source: https://example.com/post
author: Author Name
source_date: 2025-07-22T00:00:00.000Z
date: 2025-07-22
platform: substack
---

# Post Title

Content in Markdown...
```

YAML frontmatter generated via `js-yaml` dump in `storage.mjs`.

## Common Task Patterns

### Adding a source to curated lists

1. Open the appropriate file in `curated/` (`substack.yaml`, `blogs.yaml`, or `xiaoyuzhou.yaml`)
2. Add the entry commented out, following existing format
3. Include a one-line comment describing who they are
4. For Substack: the `substack` field is the subdomain only (e.g., `demishassabis` from `demishassabis.substack.com`)
5. For Xiaoyuzhou: the PID is the hex string in the podcast URL after `podcast/`

### Adding a new platform

1. Create `scripts/fetchers/<platform>.mjs` with an exported `fetch<Platform>()` function
2. It must accept `(key, { dry })` and return `{ fetched: number }`
3. Use `fetchProxy()` from `lib/fetch-proxy.mjs` for all HTTP requests
4. Use `isDuplicate()` / `markFetched()` from `lib/state.mjs` for dedup
5. Use `saveRaw()` from `lib/storage.mjs` for output
6. Register in `scripts/fetch.mjs` (import + dispatch in the `for` loop)

### Debugging fetch issues

- Check `console` output for error messages with platform tags
- Verify `HTTPS_PROXY` is set if the user is behind GFW
- For Substack: open `https://{blog}.substack.com/feed` in a browser to confirm the feed exists
- For Xiaoyuzhou: ensure login was completed (`bun run scripts/login-xiaoyuzhou.mjs`)
- State file `.ai-signals-state.json` can be deleted to force a full refetch

## Don't

- Don't add new npm dependencies without strong justification (current dep: `js-yaml` only)
- Don't change the output directory structure (`raw/social/{platform}/{key}/`)
- Don't modify `.ai-signals-state.json` directly — use `state.mjs` helpers
- Don't commit `sources.yaml` or `.ai-signals-state.json` (both are in `.gitignore`)
