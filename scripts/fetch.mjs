#!/usr/bin/env bun
/**
 * AI-Signals — Fetch all tracked AI sources.
 *
 * Reads ./sources.yaml, runs fetchers, outputs to ./raw/social/
 *
 * Usage:
 *   bun run scripts/fetch.mjs                  # fetch all
 *   node scripts/fetch.mjs                     # also works with Node.js 22+
 *   bun run scripts/fetch.mjs --dry            # preview
 *   bun run scripts/fetch.mjs --platform xiaoyuzhou  # single platform
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';
import { fetchSubstack } from './fetchers/substack.mjs';
import { fetchXiaoyuzhou } from './fetchers/xiaoyuzhou.mjs';
import { fetchBlog } from './fetchers/blog.mjs';

const SOURCES_PATH = resolve(process.cwd(), 'sources.yaml');

function loadSources() {
  if (!existsSync(SOURCES_PATH)) {
    console.error('sources.yaml not found. Copy sources.example.yaml → sources.yaml and edit it.');
    process.exit(1);
  }
  const raw = readFileSync(SOURCES_PATH, 'utf-8');
  const data = yaml.load(raw);
  return data.sources || [];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { dry: false, source: null, platform: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry') opts.dry = true;
    else if (args[i] === '--source' && args[i + 1]) opts.source = args[++i];
    else if (args[i] === '--platform' && args[i + 1]) opts.platform = args[++i];
  }
  return opts;
}

async function main() {
  const { dry, source: sourceFilter, platform: platformFilter } = parseArgs();
  const allSources = loadSources();

  let sources = allSources;
  if (sourceFilter) {
    const lower = sourceFilter.toLowerCase();
    sources = allSources.filter(s =>
      s.name.toLowerCase().includes(lower) ||
      (s.substack && s.substack.toLowerCase().includes(lower)) ||
      (s.xiaoyuzhou && s.xiaoyuzhou.toLowerCase().includes(lower))
    );
    if (sources.length === 0) {
      console.error(`No source matching "${sourceFilter}" found.`);
      for (const s of allSources) console.error(`  - ${s.name}`);
      process.exit(1);
    }
  }

  const mode = dry ? '🔍 DRY RUN' : '📥 FETCH';
  const scope = sourceFilter ? `source: "${sourceFilter}"` : 'all sources';
  console.log(`${mode} — ${scope}\n`);

  let totalFetched = 0;
  const errors = [];

  for (const source of sources) {
    const label = source.name;
    console.log(`── ${label} ──`);

    if (source.substack && (!platformFilter || platformFilter === 'substack')) {
      try {
        const result = await fetchSubstack(source.substack, dry);
        totalFetched += result.fetched;
      } catch (err) {
        console.log(`  ❌ Substack error: ${err.message}`);
        errors.push({ source: label, platform: 'substack', error: err.message });
      }
    }

    if (source.xiaoyuzhou && (!platformFilter || platformFilter === 'xiaoyuzhou')) {
      try {
        const result = await fetchXiaoyuzhou(source.xiaoyuzhou, { dry });
        totalFetched += result.fetched;
      } catch (err) {
        console.log(`  ❌ Xiaoyuzhou error: ${err.message}`);
        errors.push({ source: label, platform: 'xiaoyuzhou', error: err.message });
      }
    }

    if (source.blog && (!platformFilter || platformFilter === 'blog')) {
      try {
        const result = await fetchBlog(source.blog);
        totalFetched += result.fetched;
      } catch (err) {
        console.log(`  ❌ Blog error: ${err.message}`);
        errors.push({ source: label, platform: 'blog', error: err.message });
      }
    }
  }

  console.log(`\n${'─'.repeat(40)}`);
  if (dry) {
    console.log(`🔍 Dry run complete. ${totalFetched} items would be fetched.`);
  } else {
    console.log(`📥 Done. ${totalFetched} new items saved to raw/social/`);
  }

  if (errors.length > 0) {
    console.log(`\n⚠️  ${errors.length} error(s):`);
    for (const e of errors) console.log(`  - [${e.platform}] ${e.source}: ${e.error}`);
  }
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
