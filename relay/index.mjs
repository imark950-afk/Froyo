// Froyo on the go: sign-in relay for auth.froyoonthego.com
//
// Passes the app's sign-in requests to Neon Auth so the session cookie belongs
// to froyoonthego.com. Browsers (including Safari) then treat it as the app's
// own cookie rather than a third-party one.
//
// Locked down: only the app's address may call it, only the sign-in routes the
// app uses are forwarded, request bodies are size-limited, and code requests
// are rate-limited per visitor. It stores nothing.

const UPSTREAM = "https://ep-red-paper-za2pjniz.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth";
const APP_ORIGIN = "https://app.froyoonthego.com";
const ROUTES = new Map([
  ["/ok", ["GET"]],
  ["/get-session", ["GET"]],
  ["/token", ["GET"]],
  ["/token/anonymous", ["GET"]],
  ["/email-otp/send-verification-otp", ["POST"]],
  ["/sign-in/email-otp", ["POST"]],
  ["/sign-out", ["POST"]],
]);
const MAX_BODY = 2048;

// Simple per-visitor limits (per isolate) on top of Neon's own limits.
const LIMITS = { "/email-otp/send-verification-otp": [5, 10 * 60e3], "/sign-in/email-otp": [20, 10 * 60e3] };
const hits = new Map();
function limited(ip, path) {
  const rule = LIMITS[path]; if (!rule || !ip) return false;
  const [max, win] = rule, k = path + "|" + ip, now = Date.now();
  const list = (hits.get(k) || []).filter(t => now - t < win);
  list.push(now); hits.set(k, list);
  if (hits.size > 5000) for (const [key, v] of hits) if (!v.length || now - v[v.length - 1] > win) hits.delete(key);
  return list.length > max;
}

function baseHeaders(origin) {
  const h = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Vary": "Origin",
  });
  if (origin === APP_ORIGIN) {
    h.set("Access-Control-Allow-Origin", APP_ORIGIN);
    h.set("Access-Control-Allow-Credentials", "true");
    h.set("Access-Control-Expose-Headers", "set-auth-jwt");
  }
  return h;
}
function reply(status, text, origin) {
  const h = baseHeaders(origin); h.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ message: text }), { status, headers: h });
}

// Make the upstream cookie belong to this host: drop any Domain, use Path=/, keep it Secure + HttpOnly,
// and tighten SameSite to Lax now that the app and sign-in share a site.
function rewriteCookie(c) {
  const parts = c.split(";").map(s => s.trim()).filter(Boolean);
  const out = [parts[0]];
  for (const p of parts.slice(1)) {
    const k = p.split("=")[0].toLowerCase();
    if (k === "domain" || k === "path" || k === "samesite" || k === "secure" || k === "httponly" || k === "partitioned") continue;
    out.push(p);
  }
  out.push("Path=/", "Secure", "HttpOnly", "SameSite=Lax");
  return out.join("; ");
}

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const origin = req.headers.get("origin");

    // Only the app may call the relay from a browser.
    if (origin && origin !== APP_ORIGIN) return reply(403, "Forbidden", null);

    if (req.method === "OPTIONS") {
      const h = baseHeaders(origin);
      h.set("Access-Control-Allow-Methods", "GET, POST");
      h.set("Access-Control-Allow-Headers", "content-type");
      h.set("Access-Control-Max-Age", "600");
      return new Response(null, { status: origin === APP_ORIGIN ? 204 : 403, headers: h });
    }

    const methods = ROUTES.get(path);
    if (!methods) return reply(404, "Not found", origin);
    if (!methods.includes(req.method)) return reply(405, "Method not allowed", origin);
    // State-changing calls must come from the app page (blocks cross-site form posts).
    if (req.method === "POST" && origin !== APP_ORIGIN) return reply(403, "Forbidden", origin);

    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    if (limited(ip, path)) return reply(429, "Too many attempts. Please wait a few minutes and try again.", origin);

    let body;
    if (req.method === "POST") {
      const ct = (req.headers.get("content-type") || "").toLowerCase();
      if (!ct.startsWith("application/json")) return reply(415, "Unsupported content type", origin);
      body = await req.text();
      if (body.length > MAX_BODY) return reply(413, "Request too large", origin);
    }

    const fwd = new Headers();
    for (const name of ["content-type", "cookie", "user-agent", "accept", "accept-language"]) {
      const v = req.headers.get(name); if (v) fwd.set(name, v);
    }
    fwd.set("origin", APP_ORIGIN);
    if (ip) fwd.set("x-forwarded-for", ip);

    let up;
    try {
      up = await fetch(UPSTREAM + path, { method: req.method, headers: fwd, body, redirect: "manual" });
    } catch (e) {
      return reply(502, "Sign-in is unavailable right now. Please try again.", origin);
    }

    const h = baseHeaders(origin);
    const ct = up.headers.get("content-type"); if (ct) h.set("Content-Type", ct);
    const jwt = up.headers.get("set-auth-jwt"); if (jwt) h.set("set-auth-jwt", jwt);
    for (const c of up.headers.getSetCookie()) h.append("Set-Cookie", rewriteCookie(c));
    return new Response(up.status === 204 ? null : await up.arrayBuffer(), { status: up.status >= 300 && up.status < 400 ? 502 : up.status, headers: h });
  },
};
