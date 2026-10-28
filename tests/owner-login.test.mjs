import assert from 'node:assert/strict';
import test from 'node:test';
import { createOwnerLoginHandler } from '../supabase/functions/owner-login/handler.ts';

const now = Date.parse('2026-10-28T04:00:00Z');
const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const accessToken = `test.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString('base64url')}.signature`;
const secrets = {
  SUPABASE_URL: 'https://archive.example.test', SUPABASE_ANON_KEY: 'public-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'private-service-key', RECAPTCHA_ENTERPRISE_API_KEY: 'private-enterprise-api-key',
  RECAPTCHA_PROJECT_ID: 'archive-security-project', RECAPTCHA_SITE_KEY: 'public-enterprise-site-key',
  RECAPTCHA_ALLOWED_HOSTNAMES: 'archive.example.test,www.archive.example.test',
  ARCHIVE_ALLOWED_ORIGINS: 'https://archive.example.test', RECAPTCHA_MIN_SCORE: '0.5',
};
const credentials = { email: 'Owner@Example.test', password: 'private-password', captchaToken: 'private-captcha-token' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function fixture(options = {}) {
  const calls = [];
  const handler = createOwnerLoginHandler({ env: { ...secrets, ...options.env }, now: () => now, fetch: async (input, init) => {
    const url = new URL(input);
    const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : JSON.parse(init.body || '{}');
    const call = { url, body, headers: init.headers };
    calls.push(call);
    if (options.intercept) {
      const response = await options.intercept(call);
      if (response) return response;
    }
    if (url.pathname.endsWith('/archive_reserve_login_attempt')) return json({ allowed: true });
    if (url.hostname === 'recaptchaenterprise.googleapis.com') return json(Object.hasOwn(options, 'assessment') ? options.assessment : {
      tokenProperties: { valid: true, action: 'LOGIN', hostname: 'archive.example.test', createTime: new Date(now).toISOString(), ...options.tokenProperties },
      riskAnalysis: { score: 0.9, ...options.riskAnalysis },
    });
    if (url.pathname === '/auth/v1/token') return json({ access_token: accessToken, refresh_token: 'private-refresh-token', expires_in: 3600, user: { id: userId, app_metadata: { archive_owner: true } }, ...options.session });
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
    if (url.pathname.endsWith('/archive_complete_owner_login')) return new Response(null, { status: 204 });
    if (url.pathname.endsWith('/archive_activity_logs')) return new Response(null, { status: 201 });
    throw new Error(`Unexpected request: ${url}`);
  } });
  const request = (body = credentials, overrides = {}) => new Request('https://archive.example.test/functions/v1/owner-login', {
    method: 'POST', headers: { Origin: 'https://archive.example.test', 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.1' },
    body: JSON.stringify(body), ...overrides,
  });
  return { calls, handler, request, run: (body, overrides) => handler(request(body, overrides)) };
}

test('valid Enterprise assessment authorizes only the actual owner Auth session, then returns tokens', async () => {
  const f = fixture(), result = await f.run();
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), 'https://archive.example.test');
  assert.deepEqual(await result.json(), { access_token: accessToken, refresh_token: 'private-refresh-token', expires_in: 3600, token_type: 'bearer' });
  assert.deepEqual(f.calls.map(call => call.url.pathname), ['/rest/v1/rpc/archive_reserve_login_attempt', '/v1/projects/archive-security-project/assessments', '/rest/v1/rpc/archive_reserve_login_attempt', '/auth/v1/token', '/rest/v1/rpc/archive_complete_owner_login']);
  assert.match(f.calls[0].body.p_keys[0], /^ip:[a-f0-9]{64}$/);
  assert.match(f.calls[2].body.p_keys[0], /^email:[a-f0-9]{64}$/);
  assert.deepEqual(f.calls[4].body, { p_session_id: sessionId, p_user_id: userId });
  assert.equal(f.calls[3].headers.apikey, secrets.SUPABASE_ANON_KEY);
  assert.equal(f.calls[4].headers.apikey, secrets.SUPABASE_SERVICE_ROLE_KEY);
  assert.deepEqual(f.calls[1].body, { event: { token: credentials.captchaToken, siteKey: secrets.RECAPTCHA_SITE_KEY, expectedAction: 'LOGIN' } });
  assert.equal(f.calls[1].headers['X-Goog-Api-Key'], secrets.RECAPTCHA_ENTERPRISE_API_KEY);
  assert.equal(f.calls[1].url.search, '', 'Private API key is excluded from URLs');
  assert.equal(f.calls[1].headers.Authorization, undefined, 'Supabase credentials stay out of Google requests');
});

test('the provided project ID and site key are used by default without deployment overrides', async () => {
  const f = fixture({ env: { RECAPTCHA_PROJECT_ID: undefined, RECAPTCHA_SITE_KEY: undefined } });
  assert.equal((await f.run()).status, 200);
  assert.equal(f.calls[1].url.pathname, '/v1/projects/mikhaiarchive/assessments');
  assert.equal(f.calls[1].body.event.siteKey, '6LeGQwQuAAAAAECnTksKT8FGfz0CUPIrUs1UF9zW');
  assert.equal(f.calls[1].body.event.expectedAction, 'LOGIN');
});

for (const [name, options] of [
  ['rejected or replayed token', { tokenProperties: { valid: false } }], ['low score', { riskAnalysis: { score: 0.1 } }],
  ['missing score', { riskAnalysis: { score: undefined } }], ['invalid score', { riskAnalysis: { score: 1.1 } }],
  ['wrong action', { tokenProperties: { action: 'other_action' } }], ['unregistered hostname', { tokenProperties: { hostname: 'attacker.example.test' } }],
  ['missing hostname', { tokenProperties: { hostname: undefined } }], ['expired challenge', { tokenProperties: { createTime: new Date(now - 120001).toISOString() } }],
  ['future challenge', { tokenProperties: { createTime: new Date(now + 10001).toISOString() } }], ['invalid challenge date', { tokenProperties: { createTime: 'invalid' } }],
  ['missing token properties', { assessment: { riskAnalysis: { score: 0.9 } } }],
  ['missing risk analysis', { assessment: { tokenProperties: { valid: true, action: 'LOGIN', hostname: 'archive.example.test', createTime: new Date(now).toISOString() } } }],
  ['empty assessment', { assessment: null }],
  ['legacy response', { assessment: { success: true, score: 0.9, action: 'LOGIN', hostname: 'archive.example.test', challenge_ts: new Date(now).toISOString() } }],
]) test(`${name} is blocked before password authentication`, async () => {
  const f = fixture(options), result = await f.run();
  assert.equal(result.status, 403);
  assert.equal(f.calls.some(call => call.url.pathname === '/auth/v1/token'), false);
  assert.equal(f.calls.filter(call => call.url.pathname.endsWith('/archive_reserve_login_attempt')).length, 1, 'Invalid CAPTCHA never consumes the email allowance');
  const log = f.calls.find(call => call.url.pathname.endsWith('/archive_activity_logs'));
  assert.equal(log.body.event, 'captcha_rejected');
  for (const privateValue of [...Object.values(credentials), secrets.RECAPTCHA_ENTERPRISE_API_KEY, secrets.SUPABASE_SERVICE_ROLE_KEY, '192.0.2.1']) assert.equal(JSON.stringify(log.body).includes(privateValue), false);
});

test('score threshold and explicitly registered alternate hostname are honored', async () => {
  assert.equal((await fixture({ riskAnalysis: { score: 0.5 }, tokenProperties: { hostname: 'www.archive.example.test' } }).run()).status, 200);
  assert.equal((await fixture({ env: { RECAPTCHA_MIN_SCORE: '0.8' }, riskAnalysis: { score: 0.7 } }).run()).status, 403);
});

test('missing/malformed CAPTCHA and credentials never reach upstream services', async () => {
  for (const body of [{ ...credentials, captchaToken: '' }, { ...credentials, captchaToken: undefined }, { ...credentials, password: '' }, { ...credentials, email: 123 }, null, []]) {
    const f = fixture(), result = await f.run(body);
    assert.equal(result.status, 400);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  assert.equal((await f.run(credentials, { body: '{invalid' })).status, 400);
  assert.equal((await f.run(credentials, { body: 'x'.repeat(8193) })).status, 413);
  assert.equal(f.calls.length, 0);
});

test('untrusted origins, methods, and content types are rejected; preflight is supported', async () => {
  const f = fixture();
  const denied = await f.run(credentials, { headers: { Origin: 'https://attacker.example.test' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.has('Access-Control-Allow-Origin'), false);
  assert.equal((await f.run(credentials, { method: 'GET', body: undefined })).status, 405);
  assert.equal((await f.run(credentials, { headers: { Origin: 'https://archive.example.test', 'Content-Type': 'text/plain' } })).status, 415);
  const preflight = await f.run(credentials, { method: 'OPTIONS', body: undefined });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('Access-Control-Allow-Methods'), /POST/);
  assert.equal(f.calls.length, 0);
});

test('missing secrets or unsafe configuration fail closed', async () => {
  for (const env of [{ RECAPTCHA_ENTERPRISE_API_KEY: '' }, { RECAPTCHA_PROJECT_ID: '6LeGQwQuAAAAAECnTksKT8FGfz0CUPIrUs1UF9zW' }, { RECAPTCHA_PROJECT_ID: '../another-project' }, { SUPABASE_SERVICE_ROLE_KEY: '' }, { RECAPTCHA_ALLOWED_HOSTNAMES: '' }, { RECAPTCHA_ALLOWED_HOSTNAMES: '*' }, { ARCHIVE_ALLOWED_ORIGINS: '*,https://archive.example.test' }, { RECAPTCHA_MIN_SCORE: 'invalid' }, { RECAPTCHA_MIN_SCORE: '0' }]) {
    const f = fixture({ env });
    assert.equal((await f.run()).status, 503);
    assert.equal(f.calls.length, 0);
  }
});

test('IP rate limit blocks before CAPTCHA, logs once and supplies Retry-After', async () => {
  const f = fixture({ intercept: call => call.url.pathname.endsWith('/archive_reserve_login_attempt') ? json({ allowed: false, should_log: true, retry_after: 137 }) : null });
  const result = await f.run();
  assert.equal(result.status, 429);
  assert.equal(result.headers.get('Retry-After'), '137');
  assert.deepEqual(f.calls.map(call => call.url.pathname), ['/rest/v1/rpc/archive_reserve_login_attempt', '/rest/v1/archive_activity_logs']);
  assert.equal(f.calls[1].body.event, 'login_rate_limited');
});

test('email limit is checked only after a valid CAPTCHA and blocks before passwords', async () => {
  const f = fixture({ intercept: call => call.url.pathname.endsWith('/archive_reserve_login_attempt') && call.body.p_keys[0].startsWith('email:') ? json({ allowed: false, should_log: false, retry_after: 200 }) : null });
  assert.equal((await f.run()).status, 429);
  assert.equal(f.calls.some(call => call.url.hostname === 'recaptchaenterprise.googleapis.com'), true);
  assert.equal(f.calls.some(call => call.url.pathname === '/auth/v1/token'), false);
  assert.equal(f.calls.some(call => call.url.pathname.endsWith('/archive_activity_logs')), false);
});

test('bad credentials get a generic error and a server-recorded failure', async () => {
  const f = fixture({ intercept: call => call.url.pathname === '/auth/v1/token' ? json({ message: 'Sensitive upstream diagnostic' }, 400) : null });
  const result = await f.run();
  assert.equal(result.status, 401);
  assert.equal((await result.text()).includes('Sensitive'), false);
  assert.equal(f.calls.at(-1).body.event, 'sign_in_failed');
  assert.equal(f.calls.some(call => call.url.pathname.endsWith('/archive_complete_owner_login')), false);
});

test('a non-owner is signed out server-side and never receives tokens', async () => {
  const f = fixture({ session: { user: { id: userId, app_metadata: { archive_owner: false } } } });
  const result = await f.run(), body = await result.text();
  assert.equal(result.status, 401);
  assert.equal(body.includes(accessToken), false);
  assert.equal(f.calls.some(call => call.url.pathname === '/auth/v1/logout'), true);
  assert.equal(f.calls.at(-1).body.event, 'owner_access_denied');
});

test('malformed session IDs and failed session authorization never grant access', async () => {
  for (const options of [
    { session: { access_token: 'invalid.jwt' } },
    { session: { access_token: `a.${Buffer.from('{"session_id":"invalid"}').toString('base64url')}.b` } },
    { intercept: call => call.url.pathname.endsWith('/archive_complete_owner_login') ? json({ error: 'database unavailable' }, 500) : null },
  ]) {
    const f = fixture(options), result = await f.run();
    assert.equal(result.status, 503);
    assert.equal((await result.text()).includes('access_token'), false);
    assert.equal(f.calls.some(call => call.url.pathname === '/auth/v1/logout'), true);
  }
});

test('upstream outages and audit failures fail closed without leaking secrets', async () => {
  for (const intercept of [
    call => call.url.hostname === 'recaptchaenterprise.googleapis.com' ? json({}, 500) : null,
    call => { if (call.url.hostname === 'recaptchaenterprise.googleapis.com') throw new Error(secrets.RECAPTCHA_ENTERPRISE_API_KEY); },
    call => call.url.pathname.endsWith('/archive_reserve_login_attempt') ? json({}, 500) : null,
    call => call.url.pathname.endsWith('/archive_activity_logs') ? json({}, 500) : null,
  ]) {
    const f = fixture({ tokenProperties: { valid: false }, intercept }), result = await f.run();
    assert.equal(result.status, 503);
    assert.equal((await result.text()).includes(secrets.RECAPTCHA_ENTERPRISE_API_KEY), false);
    assert.equal(f.calls.some(call => call.url.pathname === '/auth/v1/token'), false);
  }
});
