/**
 * Substack fetcher — reads RSS feeds from Substack blogs.
 *
 * Substack natively serves RSS at: https://{blog}.substack.com/feed
 * No authentication required.
 *
 * Usage:
 *   bun run scripts/fetchers/substack.mjs --blog karpathy
 *   bun run scripts/fetchers/substack.mjs --blog drfeifei --dry
 */

import { parseArgs } from 'util';
import { getCursor, isDuplicate, markFetched } from './lib/state.mjs';
import { saveRaw } from './lib/storage.mjs';
import { fetchProxy } from './lib/fetch-proxy.mjs';

/**
 * Parse RSS pubDate (RFC 2822) to ISO 8601 date string.
 */
function parseRSSDate(pubDate) {
  if (!pubDate) return new Date().toISOString();
  try {
    const d = new Date(pubDate);
    if (isNaN(d.getTime())) return pubDate.slice(0, 10); // fallback
    return d.toISOString();
  } catch {
    return pubDate.slice(0, 10);
  }
}

/**
 * Minimal RSS 2.0 item parser using regex.
 * Avoids adding an XML dependency — RSS item structure is predictable.
 */
function parseRSSItems(xml) {
  const items = [];
  // Match <item>...</item> blocks (non-greedy across lines)
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title:       extract(block, 'title'),
      link:        extract(block, 'link'),
      pubDate:     extract(block, 'pubDate'),
      guid:        extract(block, 'guid'),
      description: extract(block, 'description'),
      content:     extract(block, 'content:encoded') || extract(block, 'encoded'),
      creator:     extract(block, 'dc:creator'),
    });
  }
  return items;
}

function extract(block, tag) {
  // Try with namespace prefix
  const re = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'is');
  const m = block.match(re);
  if (m) return unescapeXML(m[1].trim());
  // Try without namespace (for content:encoded where tag includes colon)
  return null;
}

function unescapeXML(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1');
}

function stripHTML(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function htmlToMarkdown(html) {
  if (!html) return '';
  // Basic HTML → Markdown conversions
  let md = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p>/gi, '')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<a\s+href="(.*?)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre>(.*?)<\/pre>/gi, '\n```\n$1\n```\n')
    .replace(/<h[1-6]>(.*?)<\/h[1-6]>/gi, '\n## $1\n')
    .replace(/<blockquote>(.*?)<\/blockquote>/gi, '\n> $1\n')
    .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?ul>/gi, '\n')
    .replace(/<\/?ol>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return md;
}

function slugFromURL(url) {
  if (!url) return 'unknown';
  const parts = url.replace(/\/$/, '').split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] || 'unknown';
}

/**
 * Fetch new posts from a Substack blog.
 * @param {string} blog - Substack subdomain (e.g. 'drfeifei')
 * @param {boolean} dry - if true, only print what would be fetched
 * @returns {{ fetched: number, items: object[] }}
 */
export async function fetchSubstack(blog, dry = false, customFeed = null) {
  const feedURL = customFeed || `https://${blog}.substack.com/feed`;
  console.log(`  📡 Fetching ${feedURL}`);

  const res = await fetchProxy(feedURL, {
    headers: { 'User-Agent': 'knowbase-fetcher/1.0' }
  });

  if (!res.ok) {
    if (res.status === 404) {
      console.log(`  ⚠️  ${blog}.substack.com: RSS feed not found (404)`);
      return { fetched: 0, items: [] };
    }
    throw new Error(`HTTP ${res.status} fetching ${feedURL}`);
  }

  const xml = await res.text();
  const items = parseRSSItems(xml);

  if (items.length === 0) {
    console.log(`  ℹ️  ${blog}: no items in feed`);
    return { fetched: 0, items: [] };
  }

  // Check which ones are new
  const newItems = [];
  for (const item of items) {
    const id = item.link || item.guid || slugFromURL(item.link);
    if (!id || isDuplicate('substack', blog, id)) continue;
    newItems.push({ ...item, _id: id });
  }

  if (dry) {
    console.log(`  🔍 ${blog}: ${items.length} total, ${newItems.length} new (dry run)`);
    for (const item of newItems.slice(0, 5)) {
      console.log(`     - ${item.title}`);
    }
    return { fetched: 0, items: newItems };
  }

  // Save new items
  for (const item of newItems) {
    const postSlug = slugFromURL(item.link);
    const body = item.content
      ? htmlToMarkdown(item.content)
      : htmlToMarkdown(item.description);

    saveRaw({
      platform: 'substack',
      key: blog,
      id: postSlug,
      title: item.title,
      url: item.link,
      author: item.creator || blog,
      sourceDate: parseRSSDate(item.pubDate),
      content: body || stripHTML(item.description),
      meta: {
        guid: item.guid,
        pub_date: item.pubDate,
      },
    });
  }

  // Update state
  if (newItems.length > 0) {
    markFetched(
      'substack',
      blog,
      newItems.map(i => i._id),
      newItems[0]._id
    );
  }

  console.log(`  ✅ ${blog}: ${items.length} total, ${newItems.length} new → saved`);
  return { fetched: newItems.length, items: newItems };
}

// CLI entry
async function main() {
  const { values } = parseArgs({
    options: {
      blog: { type: 'string', short: 'b' },
      dry: { type: 'boolean', default: false },
    },
  });

  const blog = values.blog;
  if (!blog) {
    console.error('Usage: bun run scripts/fetchers/substack.mjs --blog <subdomain>');
    process.exit(1);
  }

  await fetchSubstack(blog, values.dry);
}

if (import.meta.main) {
  main().catch(err => {
    console.error('Substack fetcher error:', err);
    process.exit(1);
  });
}
