/**
 * Generate hand-drawn SourceFetch banner as PNG.
 * Pure SVG with displacement filter — no DOM needed.
 *
 * Usage:
 *   node scripts/generate-banner.mjs
 */

import sharp from 'sharp';
import { writeFileSync } from 'fs';

const W = 1000;
const H = 420;
const BG = '#fafafa';
const FONT = 'Comic Sans MS, Caveat, Segoe Print, cursive, sans-serif';

// Hand-drawn SVG filter
const FILTER = `
  <filter id="rough" x="-2%" y="-2%" width="104%" height="104%">
    <feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="3" result="noise" seed="42"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="rough-line" x="-2%" y="-2%" width="104%" height="104%">
    <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="2" result="noise" seed="7"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
`;

function box(id, x, y, w, h, stroke, fill) {
  return `<g filter="url(#rough-line)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" ry="6"
      fill="${fill}" stroke="${stroke}" stroke-width="2"/>
  </g>`;
}

function line(id, x1, y1, x2, y2, stroke = '#555') {
  return `<g filter="url(#rough-line)">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>
  </g>`;
}

function arrowHead(id, x, y, dir, stroke = '#555') {
  if (dir === 'right') {
    return `<polygon points="${x-6},${y-5} ${x},${y} ${x-6},${y+5}" fill="${stroke}" filter="url(#rough)"/>`;
  }
  return '';
}

function text(x, y, content, size, color = '#1e1e1e', opts = {}) {
  const { bold, opacity } = opts;
  const weight = bold ? 'font-weight="bold"' : '';
  const alpha = opacity ? `opacity="${opacity}"` : '';
  const esc = content.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<text x="${x}" y="${y}" font-size="${size}" font-family="${FONT}" fill="${color}" ${weight} ${alpha}>${esc}</text>`;
}

const elements = [
  // ── Title ──
  text(80, 55, '📡 SourceFetch', 46, '#1e1e1e', { bold: true }),
  // Underline
  line('ul', 80, 70, 280, 70, '#e8590c'),
  // Subtitle
  text(80, 110, 'Fetch high-quality AI blogs &amp; podcasts into your local Markdown knowledge base.', 18, '#555'),

  // ── Box: sources.yaml ──
  box('src', 50, 160, 160, 62, '#1971c2', '#a5d8ff'),
  text(68, 188, '📄 sources.yaml', 17, '#1971c2'),

  // ── Arrow 1 ──
  line('a1', 215, 191, 260, 191),
  arrowHead('ah1', 268, 191, 'right'),

  // ── Box: fetch.mjs ──
  box('fetch', 270, 146, 144, 88, '#e8590c', '#ffe8cc'),
  text(293, 176, '⚙️ fetch.mjs', 17, '#e8590c'),
  text(293, 206, 'dispatcher', 13, '#e8590c', { opacity: 0.7 }),

  // ── Fan arrows ──
  line('a2', 418, 176, 454, 148),
  arrowHead('ah2', 460, 148, 'right'),
  line('a3', 418, 190, 454, 190),
  arrowHead('ah3', 460, 190, 'right'),
  line('a4', 418, 204, 454, 232),
  arrowHead('ah4', 460, 232, 'right'),

  // ── Platform boxes ──
  box('p1', 460, 128, 148, 48, '#2f9e44', '#b2f2bb'),
  text(474, 150, 'Substack RSS', 15, '#2f9e44'),

  box('p2', 460, 178, 148, 48, '#6741d9', '#d0bfff'),
  text(480, 200, 'Blog RSS', 15, '#6741d9'),

  box('p3', 460, 228, 148, 48, '#c92a2a', '#ffc9c9'),
  text(468, 250, '小宇宙 FM', 15, '#c92a2a'),

  // ── Arrow 3 ──
  line('a5', 612, 190, 656, 190),
  arrowHead('ah5', 664, 190, 'right'),

  // ── Output box ──
  box('out', 670, 146, 160, 88, '#e8590c', '#fff3bf'),
  text(692, 174, '📝 Markdown', 16, '#e8590c'),
  text(692, 200, '简介 + 时间轴', 12, '#e8590c', { opacity: 0.7 }),
  text(692, 217, '+ 逐字稿', 12, '#e8590c', { opacity: 0.7 }),

  // ── Feature tags ──
  box('t1', 55, 310, 175, 34, '#bbb', '#f5f5f5'),
  text(68, 330, '🔄 Incremental dedup', 13, '#888'),
  box('t2', 238, 310, 160, 34, '#bbb', '#f5f5f5'),
  text(250, 330, '🌐 Proxy support', 13, '#888'),
  box('t3', 406, 310, 190, 34, '#bbb', '#f5f5f5'),
  text(418, 330, '🎙️ Official transcripts', 13, '#888'),
  box('t4', 604, 310, 165, 34, '#bbb', '#f5f5f5'),
  text(618, 330, '⚡ Bun + Node.js', 13, '#888'),
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>${FILTER}</defs>
  <rect width="${W}" height="${H}" fill="${BG}" rx="12"/>
  <g filter="url(#rough)">${elements.join('\n    ')}</g>
</svg>`;

writeFileSync('banner.svg', svg);
console.log('✅ banner.svg generated');

await sharp(Buffer.from(svg)).png().toFile('banner.png');
console.log('✅ banner.png generated');
console.log('   Ready to use in README!');
