/**
 * Lenny's Newsletter fetcher — specialized handler for Lenny Rachitsky's Substack.
 *
 * Unlike the generic Substack fetcher, this one:
 *   1. Categorizes posts into articles / podcast / community
 *   2. Fetches full transcripts for podcast episodes from Substack's CDN
 *   3. Saves to subdirectories: raw/social/substack/lenny/{articles,podcast,community}/
 *
 * RSS parsing functions are duplicated from substack.mjs (TODO: extract to lib/rss.mjs).
 */

import { getCursor, isDuplicate, markFetched } from './lib/state.mjs';
import { saveRaw } from './lib/storage.mjs';
import { fetchProxy } from './lib/fetch-proxy.mjs';

// ── RSS parsing (same as substack.mjs / blog.mjs) ──

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
      title:       extract(block, 'title'),
      link:        extract(block, 'link'),
      pubDate:     extract(block, 'pubDate'),
      guid:        extract(block, 'guid'),
      description: extract(block, 'description'),
      content:     extract(block, 'content:encoded') || extract(block, 'encoded'),
      creator:     extract(block, 'dc:creator'),
      enclosure:   extractAttr(block, 'enclosure', 'url'),
      enclosureType: extractAttr(block, 'enclosure', 'type'),
    });
  }
  return items;
}

function extract(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'is');
  const m = block.match(re);
  if (m) return unescapeXML(m[1].trim());
  return null;
}

function extractAttr(block, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']*)["'][^>]*>`, 'i');
  const m = block.match(re);
  return m ? m[1] : null;
}

function unescapeXML(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1');
}

function stripHTML(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function htmlToMarkdown(html) {
  if (!html) return '';
  let md = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n').replace(/<p>/gi, '')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*').replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<a\s+href="(.*?)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre>(.*?)<\/pre>/gi, '\n```\n$1\n```\n')
    .replace(/<h[1-6]>(.*?)<\/h[1-6]>/gi, '\n## $1\n')
    .replace(/<blockquote>(.*?)<\/blockquote>/gi, '\n> $1\n')
    .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?ul>/gi, '\n').replace(/<\/?ol>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/\n{3,}/g, '\n\n').trim();
  return md;
}

function slugFromURL(url) {
  if (!url) return 'unknown';
  const parts = url.replace(/\/$/, '').split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] || 'unknown';
}

// ── Content type detection ──

/**
 * Detect content type from RSS item metadata.
 * @returns {'articles'|'podcast'|'community'}
 */
function detectType(item) {
  const title = item.title || '';
  const content = item.content || item.description || '';

  if (title.includes('Community Wisdom') || title.includes('🧠')) {
    return 'community';
  }

  // Podcast signals (require strong markers — articles may also link to YouTube):
  const hasTimestampChapter = /\(\d{1,2}:\d{2}/.test(content); // like ([00:00](...)
  const hasListenLink = /Listen (on|now)/i.test(content);
  const hasPodcastEmoji = /🎙️/.test(title);
  const hasAudioEnclosure = item.enclosure && /\.(mp3|m4a|ogg|wav)/i.test(item.enclosure);

  // "youtube.com/watch" alone is not enough — articles often link to podcast episodes.
  // Only count YouTube as a podcast signal when combined with timestamps or listen links.
  const hasYouTube = content.includes('youtube.com/watch') || content.includes('youtu.be/');

  if (hasAudioEnclosure || hasTimestampChapter || hasListenLink || hasPodcastEmoji) {
    return 'podcast';
  }

  // Fallback: YouTube link + video/audio enclosure (podcasts with video enclosures)
  // Exclude image-only enclosures which are common on articles.
  const hasMediaEnclosure = item.enclosure && item.enclosureType &&
    /^(video|audio)/i.test(item.enclosureType);
  if (hasYouTube && hasMediaEnclosure) {
    return 'podcast';
  }

  return 'articles';
}

// ── Transcript fetching ──

/**
 * Fetch and format podcast transcript from Substack CDN.
 * @param {string} postUrl - the Substack post URL
 * @returns {string|null} formatted transcript markdown, or null
 */
async function fetchTranscript(postUrl) {
  try {
    console.log(`    🎤 Fetching transcript page...`);
    const res = await fetchProxy(postUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; awesome-ai-signals/1.0)' }
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract the transcription CDN URL from the embedded JSON
    const cdnMatch = html.match(
      /https:\/\/substackcdn\.com\/video_upload\/post\/\d+\/[a-f0-9-]+\/\d+\/transcription\.json\?[^"\\]*/
    );
    if (!cdnMatch) {
      console.log('    ⚠️  No transcript URL found on page');
      return null;
    }

    // Extract speaker map from embedded JSON
    // In the HTML, JSON is escaped with backslash: \"speaker_map\":{\"SPEAKER_0\":\"Name\"}
    const speakerMapMatch = html.match(
      /\\"speaker_map\\":\s*(\{[^}]+\})/
    );
    let speakerMap = {};
    if (speakerMapMatch) {
      try {
        // The JSON in the page has escaped quotes like \"
        speakerMap = JSON.parse(speakerMapMatch[1].replace(/\\"/g, '"'));
      } catch { /* ignore parse errors */ }
    }

    // Fetch the transcription JSON
    const transcriptUrl = cdnMatch[0].replace(/\\/g, '');
    console.log(`    🎤 Fetching transcript...`);
    const tRes = await fetchProxy(transcriptUrl);
    if (!tRes.ok) return null;
    const segments = await tRes.json();

    if (!Array.isArray(segments) || segments.length === 0) {
      return null;
    }

    // Format as readable text with speaker labels
    let transcript = '\n\n## Transcript\n\n';
    let lastSpeaker = '';
    let paragraph = '';

    for (const seg of segments) {
      const speakerId = seg.speaker || '';
      const speakerName = speakerMap[speakerId] || speakerId;
      const text = (seg.text || '').trim();

      if (!text) continue;

      if (speakerName !== lastSpeaker) {
        // Flush previous paragraph
        if (paragraph) transcript += paragraph.trim() + '\n\n';
        transcript += `**${speakerName}**: `;
        lastSpeaker = speakerName;
        paragraph = text + ' ';
      } else {
        paragraph += text + ' ';
      }
    }
    // Flush last paragraph
    if (paragraph) transcript += paragraph.trim() + '\n';

    return transcript;
  } catch (err) {
    console.log(`    ⚠️  Transcript fetch error: ${err.message}`);
    return null;
  }
}

// ── Main fetcher ──

/**
 * Fetch Lenny's Newsletter with categorization and transcripts.
 * @param {string} feedURL - RSS feed URL
 * @param {boolean} dry
 * @returns {{ fetched: number }}
 */
export async function fetchLennysNewsletter(feedURL, dry = false) {
  const KEY = 'lenny';
  const PLATFORM = 'substack';

  console.log(`  📡 Fetching ${feedURL}`);

  const res = await fetchProxy(feedURL, {
    headers: { 'User-Agent': 'knowbase-fetcher/1.0' }
  });

  if (!res.ok) {
    if (res.status === 404) {
      console.log(`  ⚠️  Lenny's Newsletter: RSS feed not found (404)`);
      return { fetched: 0 };
    }
    throw new Error(`HTTP ${res.status} fetching ${feedURL}`);
  }

  const xml = await res.text();
  const items = parseRSSItems(xml);

  if (items.length === 0) {
    console.log(`  ℹ️  Lenny's Newsletter: no items in feed`);
    return { fetched: 0 };
  }

  // Categorize and check which are new
  const categorized = { articles: [], podcast: [], community: [] };
  for (const item of items) {
    const id = item.link || item.guid || slugFromURL(item.link);
    if (!id || isDuplicate(PLATFORM, KEY, id)) continue;

    const type = detectType(item);
    categorized[type].push({ ...item, _id: id, _type: type });
  }

  const totalNew = categorized.articles.length + categorized.podcast.length + categorized.community.length;

  if (dry) {
    console.log(`  🔍 Lenny's: ${items.length} total, ${totalNew} new (dry run)`);
    for (const type of ['articles', 'podcast', 'community']) {
      if (categorized[type].length > 0) {
        console.log(`     [${type}] ${categorized[type].length} items:`);
        for (const item of categorized[type].slice(0, 3)) {
          console.log(`       - ${item.title}`);
        }
      }
    }
    return { fetched: 0 };
  }

  // Save items by category
  let fetched = 0;
  const allIds = [];

  for (const type of ['articles', 'podcast', 'community']) {
    for (const item of categorized[type]) {
      const postSlug = slugFromURL(item.link);
      let body = item.content
        ? htmlToMarkdown(item.content)
        : htmlToMarkdown(item.description);

      // For podcasts: fetch transcript
      if (type === 'podcast' && item.link) {
        console.log(`    🎙️  Podcast: ${item.title}`);
        const transcript = await fetchTranscript(item.link);
        if (transcript) {
          body += transcript;
          console.log(`    ✅ Transcript appended (${transcript.length} chars)`);
        }
      }

      // Save with subfolder via the key parameter
      // storage.mjs saves to raw/social/{platform}/{key}/
      // We use key = "lenny/{type}" to get subdirectories
      saveRaw({
        platform: PLATFORM,
        key: `${KEY}/${type}`,
        id: postSlug,
        title: item.title,
        url: item.link,
        author: item.creator || KEY,
        sourceDate: parseRSSDate(item.pubDate),
        content: body || stripHTML(item.description),
        meta: {
          guid: item.guid,
          pub_date: item.pubDate,
          type: type,
        },
      });
      fetched++;
      allIds.push(item._id);
    }
  }

  // Update state
  if (allIds.length > 0) {
    markFetched(PLATFORM, KEY, allIds, allIds[0]);
  }

  console.log(`  ✅ Lenny's: ${items.length} total, ${fetched} new → saved`);
  console.log(`     articles: ${categorized.articles.length}, podcast: ${categorized.podcast.length}, community: ${categorized.community.length}`);
  return { fetched };
}
