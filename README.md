# Awesome AI Signals

[![Awesome](https://awesome.re/badge.svg)](https://awesome.re)

![Awesome AI Signals](assets/banner-dark.svg)

**Signal, not noise.** Curated AI blogs & podcasts into your local Markdown knowledge base.

Supports **Substack**, **independent blog RSS feeds**, and **Xiaoyuzhou FM podcasts** (with official word-for-word transcripts, not local Whisper).

## Curated Sources

> 9 hand-picked AI thought leaders across 3 platforms. See [`curated/`](curated/) for the full YAML lists.

### Substack

| Source | Description |
|--------|-------------|
| [Fei-Fei Li](https://drfeifei.substack.com) | Spatial intelligence, world models, computer vision |
| [Sebastian Raschka](https://sebastianraschka.substack.com) | Ahead of AI: LLM engineering, coding agents, paper reviews |
| [Andrej Karpathy](https://karpathy.substack.com) | Former Tesla/OpenAI AI lead. Infrequent but essential. |
| [Demis Hassabis](https://demishassabis.substack.com) | CEO of Google DeepMind. AGI, AlphaFold, RL. |
| [Zara Zhang](https://zarazhang.substack.com) | AI investing, China-US tech, learning |

### Independent Blogs

| Source | Description |
|--------|-------------|
| [Lilian Weng](https://lilianweng.github.io) | Former OpenAI safety VP. RL, agents, LLMs, scaling laws. |
| [Dwarkesh Patel](https://www.dwarkesh.com) | In-depth interviews with AI pioneers and scientists |

### Xiaoyuzhou FM (小宇宙)

| Source | Description |
|--------|-------------|
| 张小珺Jùn｜商业访谈录 | 2-7 hour deep interviews: AI, self-driving, robotics, chips |
| 十字路口Crossing | Koji's podcast: AI × business, agents, coding, startups |

## Installation

```bash
# Install as an AI Agent Skill (recommended)
npx skills add royce17/awesome-ai-signals

# Or clone manually
git clone https://github.com/royce17/awesome-ai-signals.git
cd awesome-ai-signals && npm install
```

Works with **Bun** and **Node.js 22+**.

## Quick Start

```bash
cp sources.example.yaml sources.yaml   # Edit your source list
bun run scripts/fetch.mjs              # Fetch all sources
```

Xiaoyuzhou podcasts require a one-time login (for full history and transcripts):
```bash
bun run scripts/login-xiaoyuzhou.mjs   # SMS login, takes 30 seconds
```

For sources behind GFW (Substack, etc.), set your proxy:
```bash
export HTTPS_PROXY=http://127.0.0.1:your-port
```

## How It Works

```mermaid
flowchart LR
    A[sources.yaml] --> B[fetch.mjs]
    B --> C{Platform?}

    C -->|substack| D[Substack RSS]
    C -->|blog| E[Blog RSS]
    C -->|xiaoyuzhou| F{Xiaoyuzhou}

    D --> G[Parse XML]
    E --> G

    F -->|no auth| H["Scrape web page
Next.js __NEXT_DATA__"]
    F -->|has auth| I["SMS login
API + pagination"]

    H --> J[~15 recent eps]
    I --> K[All episodes<br/>+ shownotes<br/>+ transcript API]

    G --> L[Markdown + frontmatter]
    J --> L
    K --> L

    L --> M["raw/social/
{platform}/{source}"]

    M --> N[".awesome-ai-signals-state.json
dedup & incremental"]
```

## Adding Sources

**Recommended: use the curated lists** in `curated/` to get started fast. Just uncomment the sources you want.

```bash
ls curated/
# substack.yaml    — AI/LLM, AI Infra, AI Safety
# blogs.yaml       — Independent blogs (Lilian Weng, Dwarkesh)
# xiaoyuzhou.yaml  — AI deep interviews, AI industry, AI startups
```

Uncomment and copy to `sources.yaml`, or edit `sources.yaml` directly:

```yaml
sources:
  # Substack
  - name: "Fei-Fei Li"
    substack: "drfeifei"

  - name: "Sebastian Raschka"
    substack: "sebastianraschka"

  # Independent blogs (any RSS/Atom feed)
  - name: "Lilian Weng"
    blog: "https://lilianweng.github.io/index.xml"

  - name: "Dwarkesh Patel"
    blog: "https://www.dwarkesh.com/feed.xml"

  # Xiaoyuzhou podcasts (copy PID from podcast page URL)
  - name: "张小珺｜商业访谈录"
    xiaoyuzhou: "626b46ea9cbbf0451cf5a962"
```

### Platform Fields

| Field | Format | Example |
|-------|--------|---------|
| `substack` | Subdomain | `drfeifei` → `drfeifei.substack.com` |
| `blog` | Full RSS/Atom URL | `https://example.com/feed.xml` |
| `xiaoyuzhou` | Podcast PID | String after `podcast/` in the URL |

## Output

```
raw/social/
├── substack/
│   └── drfeifei/
│       └── 2025-11-10-from-words-to-worlds.md
├── blog/
│   └── lilianweng.github.io/
│       └── 2026-07-04-harness.md
└── xiaoyuzhou/
    └── 张小珺Jùn｜商业访谈录/
        └── 2026-07-22-147-robotics-foundation-model.md
```

Each file is a Markdown document with full YAML frontmatter. Xiaoyuzhou episodes include **description + timeline + transcript** (via the official transcript API — no GPU, instant delivery).

## Features

- 🔌 **Multi-platform** — One YAML config for Substack, RSS blogs, and Xiaoyuzhou
- 🎙️ **Official transcripts** — The only tool using Xiaoyuzhou's transcript API (zero GPU)
- 🔐 **SMS login** — Built-in guided login for Xiaoyuzhou, token auto-refresh
- 🌐 **Proxy support** — `HTTPS_PROXY` for users behind GFW
- 📥 **Incremental fetch** — Deduplication built-in, only pulls new content
- 📝 **Markdown output** — Clean frontmatter, ready for LLM ingest

## AI Agent Integration

When installed as a skill, AI agents auto-detect it. You can also say:

> "Fetch all the sources in my sources.yaml"

## License

MIT

---

**Community-curated.** Know a great AI podcast or Substack that belongs here? [Open an issue](https://github.com/Royce17/awesome-ai-signals/issues) to recommend it.
