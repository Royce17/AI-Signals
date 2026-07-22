# SourceFetch

一键抓取 AI 领域高质量信息源的博客和播客，存入本地 Markdown 知识库。

支持 **Substack**、**独立博客 RSS**、**小宇宙播客**（含官方逐字稿）。

## 安装

```bash
# 作为 AI Agent Skill 安装（推荐）
npx skills add royce17/sourcefetch

# 或手动克隆
git clone https://github.com/royce17/sourcefetch.git
cd sourcefetch && npm install
```

支持 **Bun** 和 **Node.js 22+**。

## 快速开始

```bash
cp sources.example.yaml sources.yaml   # 编辑你的信息源
bun run scripts/fetch.mjs              # 抓取所有源
```

小宇宙播客需要登录一次（获取逐字稿和全量历史）：
```bash
bun run scripts/login-xiaoyuzhou.mjs
```

海外源需要代理：
```bash
export HTTPS_PROXY=http://127.0.0.1:7897
```

## 添加信息源

编辑 `sources.yaml`：

```yaml
sources:
  # Substack
  - name: "李飞飞"
    substack: "drfeifei"

  # 独立博客
  - name: "Lilian Weng"
    blog: "https://lilianweng.github.io/index.xml"

  # 小宇宙播客
  - name: "张小珺｜商业访谈录"
    xiaoyuzhou: "626b46ea9cbbf0451cf5a962"
```

## 输出格式

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
        └── 2026-07-22-147. 和蚂蚁灵波沈宇军聊....md
```

每篇 Markdown 带完整 YAML frontmatter，小宇宙播客含**简介 + 时间轴 + 逐字稿**。

## 与 AI Agent 配合

作为 skill 安装后，Agent 自动识别。你也可以直接说：

> "帮我把 sources.yaml 里的所有源抓取一遍"

## License

MIT
