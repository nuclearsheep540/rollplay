# Security Hardening - Rollplay/Tabletop Tavern

## Recent Security Incident - CVE-2025-55182

**Date:** January 2026
**Vulnerability:** Next.js RCE via React Server Components deserialization
**Attack Vector:** Unauthenticated remote code execution
**Impact:** Cryptominer deployment attempt (XMRig), PHP backdoor installation

### Timeline of Attack:
1. Attacker exploited CVE-2025-55182 in Next.js 15.2.4
2. Gained shell access to rollplay container
3. Downloaded XMRig cryptominer and PHP backdoor (`csf.php`)
4. Attempted filesystem recon (`touch` tests)
5. Tried to kill competing malware (`pkill xmrig`, etc.)
6. Attack partially mitigated by container timeouts and lack of persistence

### Remediation Actions Taken:

#### 1. Patched Vulnerability
- **Updated Next.js:** 15.2.4 → 15.2.6 (patches CVE-2025-55182)
- **File:** `rollplay/package.json`

#### 2. Added Security Headers (nginx)
- **X-Frame-Options:** Prevents clickjacking
- **X-Content-Type-Options:** Prevents MIME sniffing
- **X-XSS-Protection:** Browser XSS protection
- **Content-Security-Policy:** Restricts resource loading
- **Strict-Transport-Security (HSTS):** Forces HTTPS (prod only)
- **Files:** `docker/dev/nginx/nginx.conf`, `docker/prod/nginx/nginx.conf`

#### 3. Container Hardening
- **Non-root user:** Application runs as `nextjs:nodejs` (UID 1001)
- **Standalone mode:** Minimal production image (no npm, no shell utilities)
- **dumb-init:** Proper signal handling for graceful shutdowns
- **Minimal permissions:** Read-only filesystem where possible
- **File:** `docker/prod/rollplay/Dockerfile`

#### 4. Build Optimization
- **Added .dockerignore:** Reduces attack surface in build context
- **Standalone output:** Next.js self-contained binary (smaller image)
---

## Security Best Practices Implemented

### Container Security
- Non-root user execution
- Minimal base image (Alpine Linux)
- Multi-stage builds (separate build/runtime)
- No unnecessary packages in runtime
- Proper signal handling (dumb-init)

### Network Security
- TLS 1.2+ enforced (nginx)
- Security headers configured
- HSTS enabled (production)
- CSP allows only necessary connections

### Application Security
- Dependencies regularly audited (`npm audit`)
- Production mode enforced
- Environment variables properly scoped
- No secrets in Docker images

---

## Deployment Checklist

### Before Deploying Container Updates:

```bash
# 1. Update dependencies
cd rollplay
npm install

# 2. Rebuild with --no-cache
cd ..
docker-compose -f docker-compose.yml build --no-cache app

# 3. Test locally first
docker-compose -f docker-compose.dev.yml up app

# 4. Verify security headers
curl -I https://localhost | grep -E "X-Frame-Options|CSP"

# 5. Check container runs as non-root
docker exec rollplay whoami  # Should output: nextjs

# 6. Deploy to production
docker-compose -f docker-compose.yml up -d app
```

---

## Incident Response Plan

### If Compromise Detected:

1. **Immediate Actions:**
   - Stop all affected containers: `docker-compose down`
   - Rotate all secrets (JWT, database passwords, API keys)
   - Check logs for extent of compromise

2. **Forensics:**
   - Export container logs: `docker logs rollplay > incident.log`
   - Check nginx access logs for attack patterns
   - Search for indicators of compromise (IoCs)

3. **Remediation:**
   - Rebuild images from scratch (no cache)
   - Update all dependencies
   - Deploy patched version
   - Monitor for 48 hours post-deployment

4. **Post-Incident:**
   - Document attack vector and timeline
   - Update security measures
   - Implement additional monitoring

---

## Known IoCs (Indicators of Compromise)

### Malicious Domains:
- `ghostbin.axel.org`
- `gitlab.com/acumalaka21/star` (XMRig miner repo)

### Malicious Files:
- `csf.php` (PHP backdoor)
- `xmrig` (Monero cryptominer)
- `xmrig-auto.tar.gz`
- `watcher.js` (persistence mechanism)

### Suspicious Processes:
- `xmrig`, `javae`, `javat`, `sYsTeMd`, `runnv`

### Suspicious Commands:
- `wget https://ghostbin.axel.org/`
- `pkill -9 xmrig`
- `touch /home/nextjs/.write_test_*`

---

## References

- [CVE-2025-55182 Analysis](https://www.wiz.io/blog/critical-vulnerability-in-react-cve-2025-55182)
- [Next.js Security Best Practices](https://nextjs.org/docs/advanced-features/security-headers)
- [Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

**Last Updated:** January 12, 2026
**Security Contact:** [Add your security contact email]
