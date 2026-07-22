---
name: sourcefetch
description: Fetch high-quality AI blogs and podcasts from Substack, Xiaoyuzhou FM, and RSS feeds. Supports tracking Li Feifei, Karpathy, Lilian Weng, Sebastian Raschka, and more. Use when user wants to fetch or track AI thought leaders' content.
---

# SourceFetch

一键抓取 AI 领域高质量信息源的博客和播客，支持 Substack、独立博客 RSS、小宇宙播客。

## Setup

```bash
cd sourcefetch
bun install   # 或 npm install
cp sources.example.yaml sources.yaml   # 编辑你的源列表
```

小宇宙播客需要登录一次（获取逐字稿和全量历史）：
```bash
bun run scripts/login-xiaoyuzhou.mjs
```

Substack 等海外源需要代理：
```bash
export HTTPS_PROXY=http://127.0.0.1:7897
```

## Usage

```bash
# 抓取所有源（增量，自动去重）
bun run scripts/fetch.mjs

# 只抓特定平台
bun run scripts/fetch.mjs --platform xiaoyuzhou
bun run scripts/fetch.mjs --platform substack

# 预览模式
bun run scripts/fetch.mjs --dry
```

## 添加信息源

编辑 `sources.yaml`：

```yaml
sources:
  - name: "李飞飞"
    substack: "drfeifei"
    tags: [ai, spatial-intelligence]

  - name: "张小珺｜商业访谈录"
    xiaoyuzhou: "626b46ea9cbbf0451cf5a962"
    tags: [ai, podcast]
```

支持的平台字段：`substack`（子域名）、`blog`（完整 RSS URL）、`xiaoyuzhou`（播客 PID）。

## 输出

内容存入 `./raw/social/{platform}/{source}/`，Markdown + YAML frontmatter，可直接被 LLM wiki ingest 流程使用。
