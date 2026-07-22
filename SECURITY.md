# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | ✅                 |

We only support the latest commit on `master`. Always update before reporting.

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Instead, email the maintainer directly. We'll respond within 48 hours and work with you on a fix.

Once resolved, we'll publish a security advisory and credit you (unless you prefer to remain anonymous).

## Scope

Security concerns include but aren't limited to:

- Sensitive data exposure (API tokens, cookies, personal info in output)
- Code injection via crafted RSS/XML or podcast page content
- Supply chain risks in npm dependencies

## Best Practices for Users

- **Never commit `sources.yaml`** if it contains custom fields that might be sensitive — the file is gitignored by default
- **Proxy credentials**: Use environment variables (`HTTPS_PROXY`), never hardcode them
- **Xiaoyuzhou login tokens** are stored locally in `~/.awesome-ai-signals/` — keep this machine trusted
