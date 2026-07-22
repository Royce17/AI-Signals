/**
 * 小宇宙 (Xiaoyuzhou FM) podcast fetcher.
 *
 * Two modes:
 *   DEFAULT (no auth): Scrapes podcast web page → ~15 recent episodes. Zero setup.
 *   --full (needs auth): Uses API with pagination → ALL episodes.
 *
 * Auth setup (one-time):
 *   1. bun run scripts/fetchers/xiaoyuzhou.mjs --login
 *   2. Enter phone number, receive SMS code, enter code
 *   3. Token auto-saved to .env
 *
 * Usage:
 *   bun run scripts/fetchers/xiaoyuzhou.mjs --pid <pid>           # default: recent 15
 *   bun run scripts/fetchers/xiaoyuzhou.mjs --pid <pid> --full    # ALL episodes
 *   bun run scripts/fetchers/xiaoyuzhou.mjs --login               # setup auth
 */

import { parseArgs } from 'util';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { getCursor, isDuplicate, markFetched } from './lib/state.mjs';
import { saveRaw, sanitizeFilename } from './lib/storage.mjs';

const API_BASE = 'https://api.xiaoyuzhoufm.com';
const PODCASTER_BASE = 'https://podcaster-api.xiaoyuzhoufm.com';
const WEB_BASE = 'https://www.xiaoyuzhoufm.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ── Auth ──

function loadAuth() {
  // Read from .env file directly (bun --env-file is not always used)
  const envPath = resolve(process.cwd(), '.env');
  const envVars = {};
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)/);
      if (m) envVars[m[1]] = m[2].trim();
    }
  }
  // Merge with process.env (process.env takes priority)
  const token = process.env.XIAOYUZHOU_ACCESS_TOKEN || envVars.XIAOYUZHOU_ACCESS_TOKEN;
  const deviceId = process.env.XIAOYUZHOU_DEVICE_ID || envVars.XIAOYUZHOU_DEVICE_ID;
  const refreshToken = process.env.XIAOYUZHOU_REFRESH_TOKEN || envVars.XIAOYUZHOU_REFRESH_TOKEN;
  if (token && deviceId) return { token, deviceId, refreshToken };
  return null;
}

/** Try to refresh the access token. Returns new auth on success, null on failure. */
async function tryRefreshToken(auth) {
  if (!auth.refreshToken) return null;
  try {
    const headers = {
      'Host': 'api.xiaoyuzhoufm.com',
      'os': 'android', 'os-version': '28',
      'manufacturer': 'Xiaomi', 'model': 'MI 6',
      'resolution': '1080x1920', 'market': 'xiaomi',
      'applicationid': 'app.podcast.cosmos',
      'app-version': '2.99.1', 'app-buildno': '1362',
      'User-Agent': 'Xiaoyuzhou/2.99.1(android 28)',
      'x-jike-device-id': auth.deviceId,
      'x-jike-refresh-token': auth.refreshToken,
    };
    const res = await fetch(`${API_BASE}/app_auth_tokens.refresh`, {
      method: 'POST', headers,
    });
    if (!res.ok) return null;
    const newAccess = res.headers.get('x-jike-access-token');
    const newRefresh = res.headers.get('x-jike-refresh-token');
    if (!newAccess) return null;
    // Update .env with new tokens
    const envPath = resolve(process.cwd(), '.env');
    if (existsSync(envPath)) {
      let content = readFileSync(envPath, 'utf-8');
      content = content.replace(/^XIAOYUZHOU_ACCESS_TOKEN=.*/m, `XIAOYUZHOU_ACCESS_TOKEN=${newAccess}`);
      if (newRefresh) content = content.replace(/^XIAOYUZHOU_REFRESH_TOKEN=.*/m, `XIAOYUZHOU_REFRESH_TOKEN=${newRefresh}`);
      writeFileSync(envPath, content, 'utf-8');
    }
    return { token: newAccess, deviceId: auth.deviceId, refreshToken: newRefresh || auth.refreshToken };
  } catch {
    return null;
  }
}

function apiHeaders(auth) {
  return {
    'Host': 'api.xiaoyuzhoufm.com',
    'os': 'android', 'os-version': '28',
    'manufacturer': 'Xiaomi', 'model': 'MI 6',
    'resolution': '1080x1920', 'market': 'xiaomi',
    'applicationid': 'app.podcast.cosmos',
    'app-version': '2.99.1', 'app-buildno': '1362',
    'webviewversion': '138.0.7204.179',
    'User-Agent': 'Xiaoyuzhou/2.99.1(android 28)',
    'app-permissions': '100100', 'wificonnected': 'false',
    'timezone': 'Asia/Shanghai',
    'local-time': new Date().toISOString().replace('Z', '+0800'),
    'content-type': 'application/json;charset=utf-8',
    'Accept-Encoding': 'gzip',
    'x-jike-access-token': auth.token,
    'x-jike-device-id': auth.deviceId,
  };
}

// ── SMS Login ──

const WEB_HEADERS = {
  'accept': 'application/json, text/plain, */*',
  'content-type': 'application/json;charset=UTF-8',
  'origin': 'https://podcaster.xiaoyuzhoufm.com',
  'referer': 'https://podcaster.xiaoyuzhoufm.com/',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
};

async function sendSMSCode(phone) {
  const res = await fetch(`${PODCASTER_BASE}/v1/auth/send-code`, {
    method: 'POST',
    headers: WEB_HEADERS,
    body: JSON.stringify({ mobilePhoneNumber: phone, areaCode: '+86' }),
  });
  const text = await res.text();
  console.log(`  SMS API (${res.status}):`, text.substring(0, 200));
  if (!res.ok) throw new Error(`SMS send failed: ${res.status}`);
  console.log('  ✅ 验证码已发送');
}

async function loginWithCode(phone, code) {
  const res = await fetch(`${PODCASTER_BASE}/v1/auth/login-with-sms`, {
    method: 'POST',
    headers: WEB_HEADERS,
    body: JSON.stringify({ mobilePhoneNumber: phone, areaCode: '+86', verifyCode: code }),
  });
  // Token is in response HEADERS, not body
  const accessToken = res.headers.get('x-jike-access-token');
  const refreshToken = res.headers.get('x-jike-refresh-token');
  console.log(`  Login API (${res.status}): accessToken=${accessToken ? 'YES' : 'NO'}, refreshToken=${refreshToken ? 'YES' : 'NO'}`);
  if (!res.ok || !accessToken) {
    const text = await res.text();
    throw new Error(`Login failed(${res.status}): ${text.substring(0, 200)}`);
  }
  // Generate a device ID (UUID v4)
  const deviceId = crypto.randomUUID();
  return { token: accessToken, refreshToken, deviceId };
}

async function interactiveLogin() {
  const readline = (await import('readline')).default;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  console.log('🔐 小宇宙登录\n');
  const phone = await ask('手机号 (+86): ');
  await sendSMSCode(phone);
  const code = await ask('验证码: ');
  const auth = await loginWithCode(phone, code);
  rl.close();

  // Save to .env
  const fs = await import('fs');
  const envPath = resolve(process.cwd(), '.env');
  let envContent = '';
  if (existsSync(envPath)) envContent = fs.readFileSync(envPath, 'utf-8');

  const lines = envContent.split('\n').filter(l =>
    !l.startsWith('XIAOYUZHOU_ACCESS_TOKEN=') &&
    !l.startsWith('XIAOYUZHOU_DEVICE_ID=') &&
    !l.startsWith('XIAOYUZHOU_REFRESH_TOKEN=')
  );
  lines.push(`XIAOYUZHOU_ACCESS_TOKEN=${auth.token}`);
  lines.push(`XIAOYUZHOU_REFRESH_TOKEN=${refreshToken}`);
  lines.push(`XIAOYUZHOU_DEVICE_ID=${auth.deviceId}`);

  fs.writeFileSync(envPath, lines.filter(Boolean).join('\n') + '\n', 'utf-8');
  console.log(`  ✅ Token 已保存到 .env\n`);
  return auth;
}

// ── API-based episode fetching (paginated) ──

async function fetchEpisodesAPI(pid, auth, maxPages = 10) {
  const allEpisodes = [];
  let loadMoreKey = null;

  for (let page = 0; page < maxPages; page++) {
    const body = { pid, limit: '25', order: 'desc' };
    if (loadMoreKey) body.loadMoreKey = loadMoreKey;

    const res = await fetch(`${API_BASE}/v1/episode/list`, {
      method: 'POST',
      headers: apiHeaders(auth),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`  ⚠️  API page ${page + 1}: HTTP ${res.status}`);
      break;
    }
    const data = await res.json();
    const episodes = data.data || [];
    if (episodes.length === 0) break;

    allEpisodes.push(...episodes.filter(e => e?.eid));
    if (data.loadMoreKey) {
      loadMoreKey = data.loadMoreKey;
    } else {
      break;
    }
  }
  return allEpisodes;
}

// ── Web scraping (no auth, ~15 eps) ──

async function fetchPodcastPage(pid) {
  const url = `${WEB_BASE}/podcast/${pid}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!match) throw new Error('No __NEXT_DATA__ in page');
  return JSON.parse(match[1])?.props?.pageProps?.podcast;
}

// ── Shared helpers ──

/** Fetch full episode detail with shownotes from API. */
async function fetchEpisodeDetail(eid, auth) {
  const res = await fetch(`${API_BASE}/v1/episode/get?eid=${eid}`, {
    headers: apiHeaders(auth),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.data || data;
}

/** Fetch transcript text for an episode. Returns null if unavailable. */
async function fetchTranscript(eid, mediaId, auth) {
  try {
    // Step 1: get signed transcript URL
    const res1 = await fetch(`${API_BASE}/v1/episode-transcript/get`, {
      method: 'POST',
      headers: apiHeaders(auth),
      body: JSON.stringify({ eid, mediaId }),
    });
    if (!res1.ok) return null;
    const d1 = await res1.json();
    const url = d1?.data?.transcriptUrl || d1?.data?.data?.transcriptUrl;
    if (!url) return null;

    // Step 2: download transcript JSON
    const res2 = await fetch(url, {
      headers: { 'User-Agent': 'Xiaoyuzhou/2.99.1(android 28)' },
    });
    if (!res2.ok) return null;
    const segments = await res2.json();
    if (!Array.isArray(segments) || segments.length === 0) return null;

    // Convert segments → timestamped text
    return segments.map(s => {
      const mins = Math.floor(s.startMs / 60000);
      const secs = Math.floor((s.startMs % 60000) / 1000);
      const ts = `[${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}]`;
      return `${ts} ${s.text}`;
    }).join('\n');
  } catch {
    return null;
  }
}

/** Convert shownotes HTML to markdown, preserving timestamps. */
function shownotesToMarkdown(html) {
  if (!html) return '';
  // Step 1: timestamp links → **00:02:03**
  let md = html.replace(/<a class="timestamp"[^>]*>(.*?)<\/a>/gi, '**$1** ');
  // Step 2: regular links → [text](url)
  md = md.replace(/<a href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  // Step 3: basic formatting
  md = md
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n').replace(/<p[^>]*>/gi, '')
    .replace(/<strong>/gi, '**').replace(/<\/strong>/gi, '**')
    .replace(/<b>/gi, '**').replace(/<\/b>/gi, '**')
    .replace(/<em>/gi, '*').replace(/<\/em>/gi, '*')
    .replace(/<blockquote>/gi, '\n> ').replace(/<\/blockquote>/gi, '\n')
    .replace(/<li>/gi, '\n- ').replace(/<\/li>/gi, '')
    .replace(/<\/?ul>/gi, '').replace(/<\/?ol>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n**$1**\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
  return md;
}

function stripHTML(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

// ── Main ──

export async function fetchXiaoyuzhou(pid, opts = {}) {
  const { dry = false } = opts;
  const auth = loadAuth(); // try auth first

  let podcast, episodes;

  if (auth) {
    console.log(`  📡 API mode: fetching episodes for PID: ${pid}`);

    // Helper: make API call with auto-refresh on failure
    const apiCall = async (fn) => {
      try {
        const result = await fn(auth);
        // Check if response is HTML (token expired)
        if (result && typeof result.json === 'function') {
          const text = await result.clone().text();
          if (text.startsWith('<html')) throw new Error('token_expired');
        }
        return result;
      } catch (e) {
        if (e.message === 'token_expired') {
          const newAuth = await tryRefreshToken(auth);
          if (newAuth) {
            console.log('     🔄 Token refreshed, retrying...');
            // Update auth reference for subsequent calls
            auth.token = newAuth.token;
            auth.refreshToken = newAuth.refreshToken;
            return fn(auth);
          }
        }
        throw e;
      }
    };

    const podcastRes = await apiCall(a => fetch(`${API_BASE}/v1/podcast/get?pid=${pid}`, { headers: apiHeaders(a) }));
    const podcastData = await podcastRes.json();
    podcast = podcastData.data || podcastData;
    episodes = await fetchEpisodesAPI(pid, auth, 10);
    console.log(`     ${podcast.title}: got ${episodes.length} episodes via API`);
  } else {
    console.log(`  📡 Web mode: fetching recent episodes for PID: ${pid}`);
    podcast = await fetchPodcastPage(pid);
    episodes = podcast?.episodes || [];
    console.log(`     ${podcast?.title}: ${podcast?.episodeCount || '?'} total, got ${episodes.length} from page`);
  }

  const podcastName = podcast?.title || pid;
  // Use podcast name as folder key (readable), not PID
  const folderKey = podcastName;

  if (!episodes?.length) {
    console.log(`  ℹ️  ${podcastName}: no episodes found`);
    return { fetched: 0, items: [] };
  }

  // Filter new
  const newEpisodes = episodes.filter(ep => ep?.eid && !isDuplicate('xiaoyuzhou', folderKey, ep.eid));

  if (dry) {
    console.log(`  🔍 ${podcastName}: ${newEpisodes.length} new (dry run)`);
    for (const ep of newEpisodes.slice(0, 5)) {
      console.log(`     - [${ep.pubDate?.slice(0, 10) || '?'}] ${ep.title}`);
    }
    return { fetched: 0, items: newEpisodes };
  }

  // Save (with full shownotes + transcript from episode detail API)
  for (const ep of newEpisodes) {
    let shownotesMd = '';
    let transcriptText = '';
    if (auth) {
      try {
        const detail = await fetchEpisodeDetail(ep.eid, auth);
        shownotesMd = shownotesToMarkdown(detail?.shownotes || '');
        const mediaId = detail?.transcript?.mediaId || ep.transcript?.mediaId;
        if (mediaId) {
          transcriptText = await fetchTranscript(ep.eid, mediaId, auth) || '';
        }
      } catch { /* non-essential */ }
    }

    const body = [
      ep.description ? `## 简介\n\n${stripHTML(ep.description)}` : '',
      shownotesMd ? `## 时间轴\n\n${shownotesMd}` : '',
      transcriptText ? `## 逐字稿\n\n${transcriptText}` : '',
      `\n\n> 时长: ${Math.round((ep.duration || 0) / 60)} 分钟 · 播放: ${ep.playCount || 0}`,
      `\n\n[在小宇宙收听](https://www.xiaoyuzhoufm.com/episode/${ep.eid})`,
    ].filter(Boolean).join('\n');

    saveRaw({
      platform: 'xiaoyuzhou',
      key: folderKey,
      id: ep.eid,
      title: ep.title || 'Untitled',
      url: `https://www.xiaoyuzhoufm.com/episode/${ep.eid}`,
      author: podcastName,
      sourceDate: ep.pubDate || new Date().toISOString(),
      content: body,
      filename: `${ep.pubDate?.slice(0, 10) || 'unknown'}-${sanitizeFilename(ep.title || 'untitled')}.md`,
      meta: {
        episode_id: ep.eid,
        podcast_title: podcastName,
        duration: ep.duration,
        play_count: ep.playCount,
        comment_count: ep.commentCount,
        pub_date: ep.pubDate,
      },
    });
  }

  if (newEpisodes.length > 0) {
    markFetched('xiaoyuzhou', folderKey, newEpisodes.map(e => e.eid), newEpisodes[0]?.eid);
  }

  console.log(`  ✅ ${podcastName}: ${newEpisodes.length} new → saved`);
  return { fetched: newEpisodes.length, items: newEpisodes };
}

// ── CLI ──

async function main() {
  const { values } = parseArgs({
    options: {
      pid: { type: 'string', short: 'p' },
      dry: { type: 'boolean', default: false },
      full: { type: 'boolean', default: false },
      login: { type: 'boolean', default: false },
    },
  });

  if (values.login) {
    await interactiveLogin();
    return;
  }

  if (!values.pid) {
    console.error('Usage:');
    console.error('  bun run scripts/fetchers/xiaoyuzhou.mjs --pid <pid>');
    console.error('  bun run scripts/fetchers/xiaoyuzhou.mjs --pid <pid> --full');
    console.error('  bun run scripts/fetchers/xiaoyuzhou.mjs --login');
    process.exit(1);
  }

  await fetchXiaoyuzhou(values.pid, { dry: values.dry, full: values.full });
}

if (import.meta.main) {
  main().catch(err => {
    console.error('Xiaoyuzhou fetcher error:', err);
    process.exit(1);
  });
}
