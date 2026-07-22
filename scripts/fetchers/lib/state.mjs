/**
 * State management for source fetchers.
 * Tracks last fetch position per source per platform to avoid duplicates.
 * State file: ./.aisignals-state.json (in current working directory)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

// State file lives in the user's project directory (cwd)
const STATE_PATH = resolve(process.cwd(), '.aisignals-state.json');

function load() {
  if (!existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function save(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function getCursor(platform, key) {
  const state = load();
  return state[platform]?.[key] || { lastFetch: null, lastUrls: [] };
}

export function setCursor(platform, key, cursor) {
  const state = load();
  state[platform] ??= {};
  state[platform][key] = { ...state[platform][key], ...cursor };
  save(state);
}

export function isDuplicate(platform, key, id) {
  const cursor = getCursor(platform, key);
  return (cursor.lastUrls || []).includes(id);
}

export function markFetched(platform, key, newUrls, newestId) {
  const cursor = getCursor(platform, key);
  const existing = new Set(cursor.lastUrls || []);
  for (const url of newUrls) existing.add(url);
  const urls = [...existing].slice(-500);
  setCursor(platform, key, {
    lastFetch: new Date().toISOString(),
    lastId: newestId || cursor.lastId,
    lastUrls: urls,
  });
}
