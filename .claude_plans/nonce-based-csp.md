# Nonce-Based CSP — Hardening Plan

## Problem

The NGINX CSP header uses `script-src 'unsafe-inline' 'unsafe-eval'`, which largely defeats CSP's XSS mitigation. This is currently required because Next.js injects inline scripts for hydration, route transitions, and data serialization.

## Goal

Replace `'unsafe-inline'` with a per-request nonce so only scripts tagged with the correct nonce can execute. Remove `'unsafe-eval'` in production (keep in dev for HMR).

## Architecture Change

**Current flow:**
```
Client → NGINX (sets CSP header) → Next.js
```

**New flow:**
```
Client → NGINX (passes headers through, no CSP) → Next.js middleware (generates nonce, sets CSP)
```

CSP ownership moves from NGINX to Next.js middleware. NGINX remains a pure reverse proxy. This is the officially recommended Next.js approach.

---

## Implementation

### Phase 1: Next.js Middleware

**New file: `rollplay/middleware.js`**

- Generate a per-request nonce via `crypto.randomUUID()` → base64
- Build CSP header string with `'nonce-<value>'` replacing `'unsafe-inline'`
- Conditionally include `'unsafe-eval'` only in development (`process.env.NODE_ENV`)
- Set nonce on request headers (`x-nonce`) so server components can read it
- Set `Content-Security-Policy` on the response

```
Production script-src:  'self' 'nonce-{nonce}' 'strict-dynamic'
Development script-src: 'self' 'unsafe-eval' 'unsafe-inline'
```

All other CSP directives (`img-src`, `media-src`, `connect-src`, `font-src`, `style-src`, `frame-ancestors`) stay the same as current NGINX config.

### Phase 2: NGINX Config Changes

**Files: `docker/dev/nginx/nginx.conf`, `docker/prod/nginx/nginx.conf`**

- Remove the `Content-Security-Policy` `add_header` line from both configs
- Keep all other security headers (`X-Frame-Options`, `X-Content-Type-Options`, `HSTS`, etc.)
- NGINX just proxies the CSP header that Next.js sets — no duplication

### Phase 3: Verify Nonce Propagation

Next.js automatically applies the nonce to its own inline `<script>` tags when it detects a CSP header in the request. Verify:

- View page source → all `<script>` tags have `nonce="..."` attribute
- No CSP violations in browser console
- `style-src` may also need `'nonce-{nonce}'` if Headless UI or other libs inject inline styles

---

## Trade-offs

| Aspect | Impact |
|--------|--------|
| **Security** | Significant improvement — `unsafe-inline` removed, XSS mitigated |
| **Static rendering** | Nonce forces dynamic rendering on all pages (no static export / ISR) |
| **Performance** | Slightly slower initial loads due to dynamic rendering |
| **Dev experience** | `unsafe-eval` stays in dev only, no HMR breakage |
| **Complexity** | One new middleware file, simpler NGINX configs |

The static rendering trade-off is the main cost. If specific pages need static generation in the future, hash-based CSP (experimental in Next.js 13.5+) is an alternative that preserves static rendering.

## Verification

1. `npm run build && npm run start` — production mode, no `unsafe-eval`
2. Open browser DevTools → Console → no CSP violation errors
3. View page source → confirm `nonce` attributes on `<script>` tags
4. Test all pages: landing, auth, dashboard, game session, asset library
5. Confirm audio/image/font loading still works (non-script directives unchanged)
6. Run `curl -I https://localhost` → verify `Content-Security-Policy` header present with `nonce-` and no `unsafe-inline`
