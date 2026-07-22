/**
 * Proxy-aware fetch wrapper. Uses HTTP CONNECT tunnel for HTTPS requests
 * through a proxy. Zero dependencies — only Node built-ins.
 *
 * Reads proxy from: HTTPS_PROXY, HTTP_PROXY, or https_proxy env vars.
 * Falls back to global fetch() if no proxy is set.
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

function getProxyUrl() {
  return process.env.HTTPS_PROXY || process.env.https_proxy ||
         process.env.HTTP_PROXY  || process.env.http_proxy  || null;
}

function tunnelRequest(targetUrl, proxyHost, proxyPort, options) {
  return new Promise((resolve, reject) => {
    const target = new URL(targetUrl);
    const isHTTPS = target.protocol === 'https:';

    const req = http.request({
      host: proxyHost,
      port: proxyPort,
      method: 'CONNECT',
      path: `${target.hostname}:${target.port || (isHTTPS ? 443 : 80)}`,
      headers: { 'User-Agent': options.headers?.['User-Agent'] || '' },
    });

    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Proxy CONNECT failed: ${res.statusCode}`));
        return;
      }
      const agent = new https.Agent({ socket });
      const fetchOptions = {
        method: options.method || 'GET',
        headers: { ...options.headers, Host: target.hostname },
        agent,
      };

      const client = https.request(targetUrl, fetchOptions, (response) => {
        const chunks = [];
        response.on('data', c => chunks.push(c));
        response.on('end', () => resolve({
          status: response.statusCode,
          statusText: response.statusMessage,
          headers: response.headers,
          text: () => Promise.resolve(Buffer.concat(chunks).toString('utf-8')),
          json: () => Promise.resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))),
          ok: response.statusCode >= 200 && response.statusCode < 300,
        }));
      });

      client.on('error', reject);
      client.end();
    });

    req.on('error', reject);
    req.end();
  });
}

export async function fetchProxy(url, options = {}, _redirectCount = 0) {
  if (_redirectCount > 5) throw new Error('Too many redirects');

  const proxyUrl = getProxyUrl();
  if (!proxyUrl) return fetch(url, { ...options, redirect: 'follow' });

  try {
    const proxy = new URL(proxyUrl);
    const res = await tunnelRequest(url, proxy.hostname, proxy.port || 7897, options);

    if ([301, 302, 307, 308].includes(res.status) && res.headers?.location) {
      const redirectUrl = new URL(res.headers.location, url).href;
      return fetchProxy(redirectUrl, options, _redirectCount + 1);
    }

    return res;
  } catch {
    return fetch(url, { ...options, redirect: 'follow' });
  }
}
