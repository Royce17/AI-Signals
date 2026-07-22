# Contributing to SourceFetch

Thanks for helping build the best AI content tracker!

## Ways to Contribute

### 🎯 Recommend a Source

The fastest way to contribute: [open an issue](https://github.com/Royce17/sourcefetch/issues) with a link to a great AI Substack, blog, or Xiaoyuzhou podcast. We'll add it to the curated lists.

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

Found a fetch error or broken output? [Open an issue](https://github.com/Royce17/sourcefetch/issues) with:

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

## Style

- **YAML**: Two-space indent, comment each source
- **Commit messages**: Use present tense (`add source X` not `added source X`)
- **Tags**: Lowercase, `kebab-case` for multi-word

## Questions?

Open a [discussion](https://github.com/Royce17/sourcefetch/discussions) or drop an issue.

---

Thanks for contributing! 🚀
