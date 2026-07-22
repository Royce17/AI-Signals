---
name: awesome-ai-signals
description: Signal, not noise. Curated AI blogs & podcasts from Substack, Xiaoyuzhou FM, and RSS feeds. Tracks Fei-Fei Li, Karpathy, Lilian Weng, Sebastian Raschka, Demis Hassabis, and more. Use when user wants to fetch or track AI thought leaders' content.
---

# Awesome AI Signals

Signal, not noise. Curated AI blogs & podcasts from Substack, independent blog RSS feeds, and Xiaoyuzhou FM (with official transcripts).

## Setup

```bash
cd awesome-ai-signals
bun install   # or npm install
cp sources.example.yaml sources.yaml   # edit your source list
```

Xiaoyuzhou podcasts require a one-time login (for transcripts and full history):
```bash
bun run scripts/login-xiaoyuzhou.mjs
```

For sources behind GFW (Substack etc.), set your proxy:
```bash
export HTTPS_PROXY=http://127.0.0.1:your-port
```

## Usage

```bash
# Fetch all sources (incremental, auto dedup)
bun run scripts/fetch.mjs

# Single platform
bun run scripts/fetch.mjs --platform xiaoyuzhou
bun run scripts/fetch.mjs --platform substack

# Dry run (preview only)
bun run scripts/fetch.mjs --dry
```

## Adding Sources

Curated lists in `curated/` directory — organized by topic, just uncomment:

- `curated/substack.yaml` — AI/LLM, AI Infra, AI Safety
- `curated/blogs.yaml` — Independent blogs
- `curated/xiaoyuzhou.yaml` — AI deep interviews, AI industry

Or edit `sources.yaml` directly:

```yaml
sources:
  - name: "Fei-Fei Li"
    substack: "drfeifei"
    tags: [ai, spatial-intelligence]

  - name: "Lilian Weng"
    blog: "https://lilianweng.github.io/index.xml"
    tags: [ai, llm, agents]
```

Supported fields: `substack` (subdomain), `blog` (full RSS URL), `xiaoyuzhou` (podcast PID).

## Output

Content saved to `./raw/social/{platform}/{source}/` as Markdown with YAML frontmatter, ready for LLM wiki ingest.
