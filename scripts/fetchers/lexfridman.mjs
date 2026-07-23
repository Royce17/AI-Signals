/**
 * Lex Fridman Podcast fetcher.
 *
 * Fetches RSS feed for episode discovery, then scrapes:
 *   1. Episode main page — description, links, sponsors, outline
 *   2. Transcript page — full timed dialogue
 *
 * Usage:
 *   node scripts/fetchers/lexfridman.mjs
 *   node scripts/fetchers/lexfridman.mjs --dry
 */

import { parseArgs } from 'util';
import { isDuplicate, markFetched } from './lib/state.mjs';
import { saveRaw } from './lib/storage.mjs';
import { fetchProxy } from './lib/fetch-proxy.mjs';

const FEED_URL = 'https://lexfridman.com/feed/podcast/';
const PLATFORM = 'lexfridman';
const KEY = 'lexfridman';

// ── RSS parsing ──

function parseRSSDate(pubDate) {
  if (!pubDate) return new Date().toISOString();
  try {
    const d = new Date(pubDate);
    if (isNaN(d.getTime())) return pubDate.slice(0, 10);
    return d.toISOString();
  } catch {
    return pubDate.slice(0, 10);
  }
}

function parseRSSItems(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title:       extractTag(block, 'title'),
      link:        extractTag(block, 'link'),
      pubDate:     extractTag(block, 'pubDate'),
      guid:        extractTag(block, 'guid'),
      description: extractTag(block, 'description'),
      content:     extractTag(block, 'content:encoded') || extractTag(block, 'encoded'),
      creator:     extractTag(block, 'dc:creator'),
    });
  }
  return items;
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'is');
  const m = block.match(re);
  if (m) return unescapeXML(m[1].trim());
  return null;
}

function unescapeXML(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1');
}

function stripHTML(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function slugFromURL(url) {
  if (!url) return 'unknown';
  // Strip query params and trailing slash
  const clean = url.replace(/\?.*$/, '').replace(/\/$/, '');
  const parts = clean.split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] || 'unknown';
}

// ── Transcript URL extraction ──

function extractTranscriptUrl(description, episodeLink) {
  if (!description) return null;

  // Try <a> tag with "transcript" in href
  const linkMatch = description.match(/<a[^>]*href="([^"]*transcript[^"]*)"[^>]*>/i);
  if (linkMatch) return linkMatch[1];

  // Try plain text "Transcript: URL"
  const text = stripHTML(description);
  const textMatch = text.match(/Transcript:\s*(https?:\/\/[^\s<>]+)/);
  if (textMatch) return textMatch[1];

  // Derive from episode link: /ep-slug/ → /ep-slug-transcript/
  if (episodeLink) {
    try {
      const url = new URL(episodeLink);
      const path = url.pathname.replace(/\/$/, '');
      if (path) return `https://lexfridman.com${path}-transcript/`;
    } catch {}
  }

  return null;
}

// ── Episode main page parsing ──

/**
 * Clean episode link: strip UTM params and trailing slash.
 */
function cleanEpisodeURL(link) {
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.origin + url.pathname.replace(/\/$/, '') + '/';
  } catch {
    return link.replace(/\?.*$/, '').replace(/\/$/, '') + '/';
  }
}

/**
 * Parse the main episode page (not the transcript page).
 * Extracts: intro description, episode links, sponsors, outline.
 */
function parseEpisodePage(html) {
  const sections = { description: '', links: '', sponsors: '', outline: '' };

  // Extract <div class="entry-content"> ... </div> (before the <!-- .entry-content --> comment and footer)
  const contentMatch = html.match(/<div\s+class="entry-content">([\s\S]*?)<\/div>\s*<!--\s*\.entry-content/i);
  if (!contentMatch) return sections;
  let content = contentMatch[1];

  // Remove audio player, iframe embeds, subscribe links
  content = content.replace(/<div\s+class="powerpress_player"[^>]*>[\s\S]*?<\/div>/gi, '');
  content = content.replace(/<p\s+class="powerpress_links[^"]*"[^>]*>[\s\S]*?<\/p>/gi, '');
  content = content.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');

  // Split into <p> blocks
  const paras = [...content.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
  const blocks = paras.map(m => m[1].trim()).filter(Boolean);

  // The first substantial paragraph is the description
  if (blocks.length > 0) {
    // First paragraph after audio player is the description
    sections.description = htmlToMarkdown(blocks[0]);
  }

  // Collect all blocks and identify sections by headings
  let currentSection = '';
  for (const block of blocks) {
    const stripped = stripHTML(block);

    if (/^EPISODE LINKS:/i.test(stripped)) {
      currentSection = 'links';
      sections.links = htmlToMarkdown(block) + '\n';
    } else if (/^SPONSORS:/i.test(stripped)) {
      currentSection = 'sponsors';
      sections.sponsors = htmlToMarkdown(block) + '\n';
    } else if (/^OUTLINE:/i.test(stripped)) {
      currentSection = 'outline';
      sections.outline = htmlToMarkdown(block) + '\n';
    } else if (/^(CONTACT LEX|PODCAST LINKS|Transcript):/i.test(stripped)) {
      currentSection = '';
    } else if (currentSection) {
      sections[currentSection] += htmlToMarkdown(block) + '\n';
    }
  }

  return sections;
}

/**
 * Convert basic HTML to Markdown (paragraphs, links, bold, line breaks).
 */
function htmlToMarkdown(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<a\s+href="(.*?)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/\n{3,}/g, '\n\n').trim();
}

// ── Transcript parsing ──

function parseTranscript(html) {
  const segments = [];
  const segRe = /<div\s+class="ts-segment">\s*<span\s+class="ts-name">([^<]*)<\/span>\s*<span\s+class="ts-timestamp"><a[^>]*>\((\d{2}:\d{2}:\d{2})\)<\/a>\s*<\/span>\s*<span\s+class="ts-text">([\s\S]*?)<\/span>\s*<\/div>/gi;

  let match;
  while ((match = segRe.exec(html)) !== null) {
    segments.push({
      name: match[1].trim(),
      timestamp: match[2],
      text: unescapeXML(stripHTML(match[3])),
    });
  }
  return segments;
}

function formatTranscript(segments) {
  return segments
    .map(s => `[${s.timestamp}] **${s.name}**: ${s.text}`)
    .join('\n\n');
}

// ── Main fetcher ──

/**
 * Fetch Lex Fridman Podcast episodes with full transcripts.
 * @param {boolean} dry - If true, preview only, don't save
 */
export async function fetchLexFridman(dry = false) {
  console.log(`  📡 Fetching Lex Fridman Podcast feed...`);

  const res = await fetchProxy(FEED_URL, {
    headers: { 'User-Agent': 'knowbase-fetcher/1.0' }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${FEED_URL}`);
  }

  const xml = await res.text();
  const items = parseRSSItems(xml);

  if (items.length === 0) {
    console.log(`  ℹ️  ${KEY}: no items in feed`);
    return { fetched: 0 };
  }

  // Check which are new
  const newItems = [];
  for (const item of items) {
    const id = slugFromURL(item.link);
    if (!id || isDuplicate(PLATFORM, KEY, id)) continue;
    newItems.push({ ...item, _id: id });
  }

  if (dry) {
    console.log(`  🔍 ${KEY}: ${items.length} total, ${newItems.length} new (dry run)`);
    for (const item of newItems.slice(0, 5)) {
      console.log(`     - ${item.title}`);
    }
    return { fetched: 0 };
  }

  console.log(`  📥 ${KEY}: ${items.length} total, ${newItems.length} new`);

  let fetched = 0;

  for (const item of newItems) {
    const postSlug = slugFromURL(item.link);
    const episodeURL = cleanEpisodeURL(item.link);
    const transcriptUrl = extractTranscriptUrl(item.description, item.link);

    // Fetch episode main page for description, links, sponsors, outline
    let episodeMeta = { description: '', links: '', sponsors: '', outline: '' };
    try {
      const epRes = await fetchProxy(episodeURL, {
        headers: { 'User-Agent': 'knowbase-fetcher/1.0' }
      });
      if (epRes.ok) {
        episodeMeta = parseEpisodePage(await epRes.text());
      }
    } catch (err) {
      console.log(`    ⚠️  Episode page fetch failed: ${err.message}`);
    }

    // Fetch transcript
    let transcriptBody = '';
    let segmentCount = 0;
    if (transcriptUrl) {
      console.log(`    📡 Transcript: ${postSlug}`);
      try {
        const txRes = await fetchProxy(transcriptUrl, {
          headers: { 'User-Agent': 'knowbase-fetcher/1.0' }
        });
        if (txRes.ok) {
          const html = await txRes.text();
          const segments = parseTranscript(html);
          if (segments.length > 0) {
            transcriptBody = formatTranscript(segments);
            segmentCount = segments.length;
            console.log(`      ✅ ${segments.length} segments`);
          } else {
            console.log(`      ⚠️  No ts-segment blocks found`);
          }
        } else {
          console.log(`      ⚠️  Transcript page HTTP ${txRes.status}`);
        }
      } catch (err) {
        console.log(`      ⚠️  Transcript fetch failed: ${err.message}`);
      }
    }

    // Assemble full content
    let body = '';
    if (episodeMeta.description) {
      body += `> ${episodeMeta.description}\n\n`;
    }
    if (episodeMeta.links) {
      body += `## Episode Links\n\n${episodeMeta.links}\n`;
    }
    if (episodeMeta.sponsors) {
      body += `## Sponsors\n\n${episodeMeta.sponsors}\n`;
    }
    if (episodeMeta.outline) {
      body += `## Outline\n\n${episodeMeta.outline}\n`;
    }
    if (transcriptBody) {
      body += `## Transcript\n\n${transcriptBody}\n`;
    }

    // Fallback: use RSS description
    if (!body.trim()) {
      body = item.description ? stripHTML(item.description) : '(No content available)';
    }

    saveRaw({
      platform: PLATFORM,
      key: KEY,
      id: postSlug,
      title: item.title,
      url: episodeURL,
      author: 'Lex Fridman',
      sourceDate: parseRSSDate(item.pubDate),
      content: body.trim(),
      meta: {
        transcript_url: transcriptUrl || null,
        transcript_segments: segmentCount || null,
        guid: item.guid,
        pub_date: item.pubDate,
      },
    });

    fetched++;
  }

  if (fetched > 0) {
    markFetched(PLATFORM, KEY, newItems.map(i => i._id), newItems[0]._id);
  }

  console.log(`  ✅ ${KEY}: ${fetched} new episodes saved`);
  return { fetched };
}

// ── CLI entry ──

async function main() {
  const { values } = parseArgs({
    options: {
      dry: { type: 'boolean', default: false },
    },
    strict: false,
  });

  const dry = values.dry || process.argv.includes('--dry');
  console.log(`${dry ? '🔍 DRY RUN' : '📥 FETCH'} — Lex Fridman Podcast\n`);
  await fetchLexFridman(dry);
}

if (import.meta.main) {
  main().catch(err => {
    console.error('Lex Fridman fetcher error:', err);
    process.exit(1);
  });
}
