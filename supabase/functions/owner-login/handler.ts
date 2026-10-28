import { archiveRecaptchaAction, archiveRecaptchaProjectId, archiveRecaptchaSiteKey } from "../_shared/recaptchaConfig.ts";

type Dependencies = {
  env: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => number;
};

type CaptchaAssessment = {
  tokenProperties?: { valid?: boolean; action?: string; hostname?: string; createTime?: string };
  riskAnalysis?: { score?: number };
};
type LoginResult = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: { id?: string; app_metadata?: { archive_owner?: boolean | string } };
};

const securityError = "The security check could not be completed. Please try again.";
const loginError = "Unable to sign in. Check your email and password.";
const unavailableError = "Owner sign-in is temporarily unavailable. Please try again later.";
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function createOwnerLoginHandler({ env, fetch: send = fetch, now = Date.now }: Dependencies) {
  const origins = (env.ARCHIVE_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  const hostnames = (env.RECAPTCHA_ALLOWED_HOSTNAMES || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  const minimumScore = Number(env.RECAPTCHA_MIN_SCORE ?? "0.5");
  const siteKey = env.RECAPTCHA_SITE_KEY?.trim() || archiveRecaptchaSiteKey;
  const googleProjectId = env.RECAPTCHA_PROJECT_ID?.trim() || archiveRecaptchaProjectId;
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/$/, "");
  const configured = Boolean(supabaseUrl && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY && env.RECAPTCHA_ENTERPRISE_API_KEY
    && googleProjectId && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(googleProjectId)
    && siteKey && /^[a-zA-Z0-9_-]+$/.test(siteKey)
    && origins.length && !origins.includes("*") && hostnames.length && !hostnames.includes("*")
    && Number.isFinite(minimumScore) && minimumScore > 0 && minimumScore <= 1);

  const backend = (path: string, body: unknown, service = true) => send(`${supabaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: (service ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY)!,
      Authorization: `Bearer ${service ? env.SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });

  const record = async (event: string, outcome: "failure" | "blocked", summary: string, actorId?: string) => {
    const result = await backend("/rest/v1/archive_activity_logs", { event, outcome, summary, actor_id: actorId ?? null });
    if (!result.ok) throw new Error("Activity recording failed");
  };

  const hashKey = async (kind: string, value: string) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${env.SUPABASE_SERVICE_ROLE_KEY}:${kind}:${value}`));
    return `${kind}:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
  };

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = origins.includes(origin);
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
      ...(allowedOrigin ? { "Access-Control-Allow-Origin": origin } : {}),
    };
    const respond = (status: number, error: string, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify({ error }), { status, headers: { ...headers, ...extra } });

    if (!allowedOrigin) return respond(403, "This website is not allowed to request owner sign-in.");
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: { ...headers, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Max-Age": "600" },
    });
    if (request.method !== "POST") return respond(405, "Use POST to sign in.", { Allow: "POST, OPTIONS" });
    if (!configured) return respond(503, unavailableError);
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return respond(415, "A JSON sign-in request is required.");

    try {
      // Read a bounded body even when Content-Length is missing or untrusted.
      const reader = request.body?.getReader();
      if (!reader) return respond(400, "A sign-in request is required.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192) { await reader.cancel(); return respond(413, "The sign-in request is too large."); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(new TextDecoder().decode(bytes));
        if (!input || typeof input !== "object" || Array.isArray(input)) return respond(400, "Invalid sign-in request.");
      } catch { return respond(400, "Invalid sign-in request."); }
      const { email, password, captchaToken } = input;
      if (typeof email !== "string" || !email.trim() || email.length > 254 || typeof password !== "string" || !password || password.length > 1024) {
        return respond(400, loginError);
      }
      if (typeof captchaToken !== "string" || !captchaToken || captchaToken.length > 4096) return respond(400, securityError);

      const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
      const keys = await Promise.all([hashKey("ip", ip), hashKey("email", email.trim().toLowerCase())]);
      const enforceLimit = async (key: string) => {
        const limitResponse = await backend("/rest/v1/rpc/archive_reserve_login_attempt", { p_keys: [key] });
        if (!limitResponse.ok) return respond(503, unavailableError);
        const limit = await limitResponse.json();
        if (limit.allowed === true) return null;
        if (limit.should_log === true) await record("login_rate_limited", "blocked", "Sign-in attempts temporarily limited after repeated requests.");
        return respond(429, "Too many sign-in attempts. Please wait a few minutes before trying again.", { "Retry-After": String(limit.retry_after || 600) });
      };
      const ipLimit = await enforceLimit(keys[0]);
      if (ipLimit) return ipLimit;

      const captchaResponse = await send(`https://recaptchaenterprise.googleapis.com/v1/projects/${googleProjectId}/assessments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": env.RECAPTCHA_ENTERPRISE_API_KEY! },
        body: JSON.stringify({ event: { token: captchaToken, siteKey, expectedAction: archiveRecaptchaAction } }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!captchaResponse.ok) return respond(503, securityError);
      const assessment: CaptchaAssessment | null = await captchaResponse.json();
      const captcha = assessment?.tokenProperties;
      const score = assessment?.riskAnalysis?.score;
      const challengeTime = Date.parse(captcha?.createTime || "");
      const age = now() - challengeTime;
      if (captcha?.valid !== true || typeof score !== "number" || !Number.isFinite(score)
        || score < minimumScore || score > 1 || captcha.action !== archiveRecaptchaAction
        || !hostnames.includes((captcha.hostname || "").toLowerCase()) || !Number.isFinite(age) || age < -10_000 || age > 120_000) {
        await record("captcha_rejected", "blocked", "Sign-in blocked because the security check was not accepted.");
        return respond(403, securityError);
      }

      // An invalid CAPTCHA cannot consume the owner's email-based allowance.
      const accountLimit = await enforceLimit(keys[1]);
      if (accountLimit) return accountLimit;

      const authResponse = await backend("/auth/v1/token?grant_type=password", { email: email.trim(), password }, false);
      if (!authResponse.ok) {
        if (authResponse.status >= 500) return respond(503, unavailableError);
        await record("sign_in_failed", "failure", "Sign-in failed. Credentials were not accepted.");
        return respond(authResponse.status === 429 ? 429 : 401, loginError);
      }
      const session: LoginResult = await authResponse.json();
      const ownerFlag = session.user?.app_metadata?.archive_owner;
      if (!session.access_token || !session.refresh_token || !session.user?.id) return respond(503, unavailableError);
      const revokeSession = async () => {
        // Revoke refresh access for a session that will never be sent to the browser.
        await send(`${supabaseUrl}/auth/v1/logout?scope=local`, {
          method: "POST",
          headers: { apikey: env.SUPABASE_ANON_KEY!, Authorization: `Bearer ${session.access_token}` },
          signal: AbortSignal.timeout(10_000),
        });
      };
      if (ownerFlag !== true && ownerFlag !== "true") {
        await revokeSession();
        await record("owner_access_denied", "blocked", "Sign-in blocked for an account without owner access.", session.user.id);
        return respond(401, loginError);
      }

      // This JWT comes from Supabase Auth over HTTPS, never from the caller.
      let sessionId = "";
      try {
        const payload = session.access_token.split(".")[1];
        sessionId = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).session_id;
      } catch { /* Invalid Auth response: fail closed. */ }
      if (typeof sessionId !== "string" || !uuidPattern.test(sessionId)) {
        await revokeSession();
        return respond(503, unavailableError);
      }
      const authorization = await backend("/rest/v1/rpc/archive_complete_owner_login", { p_session_id: sessionId, p_user_id: session.user.id });
      if (!authorization.ok) {
        await revokeSession();
        return respond(503, unavailableError);
      }
      return new Response(JSON.stringify({
        access_token: session.access_token, refresh_token: session.refresh_token,
        expires_in: session.expires_in, token_type: session.token_type || "bearer",
      }), { status: 200, headers });
    } catch {
      // Never echo upstream errors, credentials, tokens, or secret values.
      return respond(503, unavailableError);
    }
  };
}

