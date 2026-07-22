# Contributing to AISignals

Thanks for helping build the best AI content tracker!

## Ways to Contribute

### 🎯 Recommend a Source

The fastest way to contribute: [open an issue](https://github.com/Royce17/aisignals/issues) with a link to a great AI Substack, blog, or Xiaoyuzhou podcast. We'll add it to the curated lists.

### 📝 Add to Curated Lists

Curated lists live in `curated/`:

```
curated/
├── substack.yaml      # AI/LLM, AI Infra, AI Safety
├── blogs.yaml         # Independent blogs
└── xiaoyuzhou.yaml    # AI podcasts
```

1. Fork the repo
2. Add your source to the appropriate file (follow existing format — name, platform field, tags)
3. Open a PR with a short description of who they are and why they belong

### 🐛 Report a Bug

Found a fetch error or broken output? [Open an issue](https://github.com/Royce17/aisignals/issues) with:

- The source entry from your `sources.yaml`
- The command you ran
- Error output or unexpected behavior

### 🛠️ Submit Code

1. Fork & clone
2. `npm install`
3. Make your changes
4. Test with `bun run scripts/fetch.mjs --dry`
5. Open a PR

Keep PRs focused — one feature or fix per PR.

## Conventions

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

### Commit messages

- Use present tense (`add source X` not `added source X`)
- Keep the first line under 72 characters

## Output Format

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

## Adding a New Platform

1. Create `scripts/fetchers/<platform>.mjs` with an exported `fetch<Platform>()` function
2. It must accept `(key, { dry })` and return `{ fetched: number }`
3. Use `fetchProxy()` from `lib/fetch-proxy.mjs` for all HTTP requests
4. Use `isDuplicate()` / `markFetched()` from `lib/state.mjs` for dedup
5. Use `saveRaw()` from `lib/storage.mjs` for output
6. Register in `scripts/fetch.mjs` (import + dispatch in the `for` loop)

## Debugging Fetch Issues

- Check `console` output for error messages with platform tags
- Verify `HTTPS_PROXY` is set if the user is behind GFW
- For Substack: open `https://{blog}.substack.com/feed` in a browser to confirm the feed exists
- For Xiaoyuzhou: ensure login was completed (`bun run scripts/login-xiaoyuzhou.mjs`)
- State file `.aisignals-state.json` can be deleted to force a full refetch

## Rules

- Don't add new npm dependencies without strong justification (current dep: `js-yaml` only)
- Don't change the output directory structure (`raw/social/{platform}/{key}/`)
- Don't modify `.aisignals-state.json` directly — use `state.mjs` helpers
- Don't commit `sources.yaml` or `.aisignals-state.json` (both are in `.gitignore`)

## Questions?

Open a [discussion](https://github.com/Royce17/aisignals/discussions) or drop an issue.

---

Thanks for contributing! 🚀
