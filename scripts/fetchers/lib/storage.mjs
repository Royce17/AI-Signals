/**
 * Unified storage for raw social content.
 * Writes markdown files with YAML frontmatter to ./raw/social/{platform}/{key}/
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';

// Output goes to ./raw/social/ in current working directory
// Override with AISIGNALS_OUTPUT env var
const RAW_DIR = process.env.AISIGNALS_OUTPUT
  ? resolve(process.env.AISIGNALS_OUTPUT)
  : resolve(process.cwd(), 'raw', 'social');

export function saveRaw(opts) {
  const { platform, key, id, title, url, author, sourceDate, content, meta = {}, filename: customFilename } = opts;

  const dir = resolve(RAW_DIR, platform, sanitize(key));
  mkdirSync(dir, { recursive: true });

  const dateStr = sourceDate ? sourceDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const filename = customFilename || `${dateStr}-${sanitize(id)}.md`;
  const filepath = resolve(dir, filename);

  const fm = {
    title,
    source: url,
    author,
    source_date: sourceDate,
    date: new Date().toISOString().slice(0, 10),
    platform,
    ...meta,
  };

  const body = `---\n${yaml.dump(fm, { lineWidth: -1 })}---\n\n# ${title}\n\n${content}\n`;
  writeFileSync(filepath, body, 'utf-8');
  return filepath;
}

export function exists(platform, key, id) {
  const dir = resolve(RAW_DIR, platform, sanitize(key));
  if (!existsSync(dir)) return false;
  try {
    const files = readdirSync(dir);
    return files.some(f => f.includes(sanitize(id)));
  } catch {
    return false;
  }
}

function sanitize(s) {
  return s.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, '-').slice(0, 100);
}

export function sanitizeFilename(s) {
  return s
    .replace(/[<>:"/\\|?*\n\r]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}
