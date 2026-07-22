#!/usr/bin/env bun
/**
 * Login helper for Xiaoyuzhou FM.
 * Saves tokens to ./.env for use by the xiaoyuzhou fetcher.
 *
 * Usage:
 *   bun run scripts/login-xiaoyuzhou.mjs
 *   node scripts/login-xiaoyuzhou.mjs
 */

import { resolve } from 'path';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const PODCASTER_BASE = 'https://podcaster-api.xiaoyuzhoufm.com';

const WEB_HEADERS = {
  'accept': 'application/json, text/plain, */*',
  'content-type': 'application/json;charset=UTF-8',
  'origin': 'https://podcaster.xiaoyuzhoufm.com',
  'referer': 'https://podcaster.xiaoyuzhoufm.com/',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
};

async function main() {
  const readline = (await import('readline')).default;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(r => rl.question(q, r));

  console.log('🔐 小宇宙登录\n');
  const phone = await ask('手机号 (+86): ');

  // Send SMS
  const smsRes = await fetch(`${PODCASTER_BASE}/v1/auth/send-code`, {
    method: 'POST',
    headers: WEB_HEADERS,
    body: JSON.stringify({ mobilePhoneNumber: phone, areaCode: '+86' }),
  });
  if (!smsRes.ok) {
    console.error(`  ❌ 验证码发送失败: HTTP ${smsRes.status}`);
    process.exit(1);
  }
  console.log('  ✅ 验证码已发送');

  const code = await ask('验证码: ');

  // Login
  const loginRes = await fetch(`${PODCASTER_BASE}/v1/auth/login-with-sms`, {
    method: 'POST',
    headers: WEB_HEADERS,
    body: JSON.stringify({ mobilePhoneNumber: phone, areaCode: '+86', verifyCode: code }),
  });
  const accessToken = loginRes.headers.get('x-jike-access-token');
  const refreshToken = loginRes.headers.get('x-jike-refresh-token');
  if (!loginRes.ok || !accessToken) {
    const text = await loginRes.text();
    console.error(`  ❌ 登录失败: ${text.substring(0, 200)}`);
    process.exit(1);
  }
  console.log('  ✅ 登录成功');

  // Save to .env
  const deviceId = crypto.randomUUID();
  const envPath = resolve(process.cwd(), '.env');
  let content = '';
  if (existsSync(envPath)) content = readFileSync(envPath, 'utf-8');
  const lines = content.split('\n').filter(l =>
    !l.startsWith('XIAOYUZHOU_ACCESS_TOKEN=') &&
    !l.startsWith('XIAOYUZHOU_DEVICE_ID=') &&
    !l.startsWith('XIAOYUZHOU_REFRESH_TOKEN=')
  );
  lines.push(`XIAOYUZHOU_ACCESS_TOKEN=${accessToken}`);
  lines.push(`XIAOYUZHOU_REFRESH_TOKEN=${refreshToken}`);
  lines.push(`XIAOYUZHOU_DEVICE_ID=${deviceId}`);
  writeFileSync(envPath, lines.filter(Boolean).join('\n') + '\n', 'utf-8');
  console.log('  ✅ Token 已保存到 .env\n');
  rl.close();
}

main().catch(err => { console.error('Login error:', err); process.exit(1); });
