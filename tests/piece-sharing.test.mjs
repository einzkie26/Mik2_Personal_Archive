import assert from 'node:assert/strict';
import test from 'node:test';
import { pieceDescription, pieceImagePath, pieceNumberFromPath, piecePath, pieceShareUrl, pieceUrl } from '../src/lib/pieceLinks.ts';
import { createPieceShareHandler, piecePageHtml } from '../server/pieceSharing.ts';
import { renderPieceImage } from '../server/pieceImage.ts';
import { cardFonts } from '../src/lib/cardFonts.ts';

const shell = '<!doctype html><html><head><title>The archive</title><meta name="description" content="Generic"><meta property="og:image" content="/generic.png"><link rel="canonical" href="/"></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>';
const entry = {
  number: '01', title: 'The light we leave on', excerpt: 'At dusk, every window becomes a small promise—\nthe kind we make without words.',
  category: 'Poem', date: 'Nov 05, 2026', tone: 'blush', is_public: true, likes: 0, author: 'Mikhai',
  theme_background: '#bf593f', theme_ink: '#fff9ee', theme_accent: '#f4c7a1', font_family: 'cormorant',
  updated_at: '2026-11-05T09:00:00Z',
};
const png = Uint8Array.from([137, 80, 78, 71]).buffer;

function fixture(options = {}) {
  const calls = [], rendered = [];
  const handler = createPieceShareHandler({
    databaseUrl: 'https://archive.example.test', anonKey: 'public-anon-key', loadShell: async () => shell,
    renderImage: async entry => { rendered.push(entry); return png; },
    fetch: async (url, init) => {
      calls.push({ url: new URL(url), init });
      if (options.fail) throw new Error('Private database error');
      return Response.json(Object.hasOwn(options, 'rows') ? options.rows : [entry]);
    },
  });
  return {
    calls, rendered,
    run: (pathname = '/piece/01', init) => handler(new Request(`https://poems.example.test${pathname}`, init)),
  };
}

test('piece links support saved UUIDs, legacy numbers, encoded IDs and image versions', () => {
  for (const id of ['01', '536d2930-f5f8-4e09-a43c-fc232ff3e66d', 'poem one & two', 'tula-é']) {
    assert.equal(pieceNumberFromPath(piecePath(id)), id);
    assert.equal(pieceUrl(id, 'https://poems.example.test'), `https://poems.example.test${piecePath(id)}`);
  }
  assert.equal(pieceImagePath('01', entry.updated_at), '/piece/01/image.png?v=2.mw3belc0');
  assert.equal(pieceNumberFromPath('/piece/01/'), '01');
  for (const path of ['/', '/#poems', '/piece/', '/piece/%', '/piece/%00', '/piece/a%2Fb', `/piece/${'x'.repeat(65)}`]) assert.equal(pieceNumberFromPath(path), null);
});

test('sharing gets a fresh stable preview URL while reader URLs remain permanent', () => {
  assert.equal(pieceShareUrl('01', 'https://poems.example.test', entry.updated_at), 'https://poems.example.test/piece/01?share=2.mw3belc0');
  assert.equal(pieceShareUrl('01', 'https://poems.example.test'), 'https://poems.example.test/piece/01?share=2');
  assert.equal(pieceImagePath('01'), '/piece/01/image.png?v=2');
  assert.equal(pieceUrl('01', 'https://poems.example.test'), 'https://poems.example.test/piece/01');
  assert.notEqual(pieceShareUrl('01', 'https://poems.example.test', '2026-11-06T09:00:00Z'), pieceShareUrl('01', 'https://poems.example.test', entry.updated_at));
});

test('social descriptions preserve readable Unicode and bound unlimited writing', () => {
  assert.equal(pieceDescription('A line.\n\n Another line.'), 'A line. Another line.');
  const result = pieceDescription('🙂'.repeat(400));
  assert.equal(Array.from(result).length, 220);
  assert.ok(result.endsWith('…'));
  assert.ok(!result.includes('\ufffd'));
});

test('public link HTML includes server-rendered metadata and an absolute PNG thumbnail URL', async () => {
  const f = fixture(), response = await f.run('/piece/01?utm_source=facebook');
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(html, /property="og:title" content="The light we leave on"/);
  assert.match(html, /property="og:url" content="https:\/\/poems.example.test\/piece\/01\?share=2.mw3belc0"/);
  assert.match(html, /rel="canonical" href="https:\/\/poems.example.test\/piece\/01"/);
  assert.match(html, /property="og:image" content="https:\/\/poems.example.test\/piece\/01\/image.png\?v=/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /property="og:image:secure_url" content="https:\/\/poems.example.test\/piece\/01\/image.png\?v=2.mw3belc0"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /At dusk, every window/);
  assert.match(html, /<noscript>/);
  assert.match(html, /src="\/assets\/app.js"/);
  assert.equal((html.match(/property="og:image"/g) || []).length, 1);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.ok(!html.includes('/generic.png'));
  assert.equal(f.rendered.length, 0);
  assert.equal(f.calls[0].url.searchParams.get('is_public'), 'eq.true');
  assert.equal(f.calls[0].url.searchParams.get('number'), 'eq.01');
  assert.ok(!f.calls[0].url.searchParams.get('select').includes('image_url'), 'HTML metadata avoids downloading a large background image');
});

test('versioned Facebook links are crawlable and identify the same share URL and thumbnail', async () => {
  const f = fixture(), url = pieceShareUrl(entry.number, 'https://poems.example.test', entry.updated_at);
  const response = await f.run(new URL(url).pathname + new URL(url).search, { headers: { 'User-Agent': 'facebookexternalhit/1.1' } });
  assert.equal(response.status, 200);
  const html = await response.text();
  const ogUrl = html.match(/property="og:url" content="([^"]+)"/)[1];
  assert.equal(ogUrl, url);
  const image = new URL(html.match(/property="og:image" content="([^"]+)"/)[1]);
  assert.equal(image.searchParams.get('v'), new URL(url).searchParams.get('share'));
  assert.equal((await f.run(image.pathname + image.search)).headers.get('Content-Type'), 'image/png');
});

test('metadata and no-script writing escape HTML from saved titles, author and body', () => {
  const html = piecePageHtml(shell, { ...entry, title: '"><script>alert(1)</script>', author: 'A & B', excerpt: '</noscript><script>alert(2)</script>' }, 'https://poems.example.test');
  assert.ok(!html.includes('<script>alert('));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;/noscript&gt;'));
  assert.ok(html.includes('A &amp; B'));
});

test('a thumbnail endpoint returns a PNG for the same public piece', async () => {
  const f = fixture(), response = await f.run('/piece/01/image.png?v=old-version');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.arrayBuffer(), png);
  assert.equal(f.rendered[0].number, entry.number);
  assert.ok(f.calls[0].url.searchParams.get('select').includes('image_url'));
});

test('the Vercel rewrite query resolves the same page and image routes', async () => {
  const f = fixture();
  assert.equal((await f.run('/api/share?number=01')).status, 200);
  assert.equal((await f.run('/api/share?number=01&image=1')).headers.get('Content-Type'), 'image/png');
});

test('private, deleted and missing pieces never expose titles, writing or thumbnails', async () => {
  for (const rows of [[], [{ ...entry, is_public: false }], [{ ...entry, number: 'another-piece' }]]) {
    const f = fixture({ rows });
    for (const path of ['/piece/01', '/piece/01/image.png', '/api/share?number=01&image=1']) {
      const response = await f.run(path), body = await response.text();
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.ok(!body.includes(entry.title));
      assert.ok(!body.includes('At dusk'));
      assert.ok(!body.includes('og:image'));
    }
    assert.equal(f.rendered.length, 0);
  }
});

test('owner credentials and cookies are never used to fetch social previews', async () => {
  const f = fixture();
  await f.run('/piece/01', { headers: { Authorization: 'Bearer private-owner-token', Cookie: 'session=private-owner-session' } });
  assert.deepEqual(f.calls[0].init.headers, { apikey: 'public-anon-key', Authorization: 'Bearer public-anon-key' });
});

test('HEAD verifies visibility without rendering an image; unsupported methods cannot mutate data', async () => {
  const f = fixture();
  const head = await f.run('/piece/01/image.png', { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), ''); assert.equal(f.rendered.length, 0);
  assert.equal((await f.run('/piece/01', { method: 'POST' })).status, 405);
  assert.equal(f.calls.length, 1);
});

test('invalid IDs are rejected without a database request and query values cannot add filters', async () => {
  const f = fixture();
  assert.equal((await f.run('/api/share?number=' + 'x'.repeat(65))).status, 404);
  assert.equal(f.calls.length, 0);
  await f.run('/api/share?number=' + encodeURIComponent('01&is_public=eq.false'));
  assert.equal(f.calls[0].url.searchParams.get('is_public'), 'eq.true');
  assert.equal(f.calls[0].url.searchParams.getAll('is_public').length, 1);
});

test('upstream failures return a retryable response instead of caching a missing card', async () => {
  const f = fixture({ fail: true }), response = await f.run();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Retry-After'), '30');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.ok(!(await response.text()).includes('Private database error'));
});

test('every selectable font produces an actual 1200 by 630 PNG with bounded long writing', async () => {
  for (const font of cardFonts) {
    const image = Buffer.from(await renderPieceImage({ ...entry, font_family: font.id, excerpt: 'A long line. '.repeat(5000), shadow_overlay: 'window', poem_text_size: 150 }));
    assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(image.readUInt32BE(16), 1200);
    assert.equal(image.readUInt32BE(20), 630);
    assert.ok(image.length > 1000);
  }
});

test('damaged embedded artwork and external photo URLs still produce a readable card', async () => {
  const originalFetch = globalThis.fetch;
  let externalRequests = 0;
  globalThis.fetch = async () => { externalRequests++; throw new Error('No external network in this test'); };
  try {
    for (const source of ['data:image/png;base64,AAAA', 'http://127.0.0.1/private', 'https://external.example.test/image.png']) {
      const result = Buffer.from(await renderPieceImage({ ...entry, image_url: source }));
      assert.equal(result.readUInt32BE(16), 1200);
    }
    assert.equal(externalRequests, 0);
  } finally { globalThis.fetch = originalFetch; }
});
