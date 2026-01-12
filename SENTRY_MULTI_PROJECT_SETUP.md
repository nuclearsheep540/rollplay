# Sentry Multi-Project Setup (4 Separate Projects)

## Configuration Complete ✅

You're using **4 separate Sentry projects**, one for each service.

---

## Environment Variables in `.env`

Your `.env` file already has the correct configuration:

```bash
# Line 1: Environment detection
ENVIRONMENT=development  # ✅ Updated (was lowercase 'environment')

# Lines 71-87: Sentry Configuration
SENTRY_ORG=javascript-nextjs

# Next.js Frontend Project
SENTRY_DSN_NEXTJS=https://942a25fde881ed26f462d173f6ccbda6@o4510697388769280.ingest.de.sentry.io/4510697399124048
SENTRY_PROJECT_NEXTJS=rollplay-app

# API Site Project (Business Logic)
SENTRY_DSN_API_SITE=https://35e8fc55834a089ef0f41fd318bde9e1@o4510697388769280.ingest.de.sentry.io/4510697495724112
SENTRY_PROJECT_API_SITE=rollplay-api-site

# API Game Project (Game Sessions)
SENTRY_DSN_API_GAME=https://7419e87ec07c09ea6d4da6eedaa8ee1b@o4510697388769280.ingest.de.sentry.io/4510697502408784
SENTRY_PROJECT_API_GAME=rollplay-api-game

# API Auth Project (Authentication)
SENTRY_DSN_API_AUTH=https://cdd2883c9ba5f4e28b21cd2a9adebbb9@o4510697388769280.ingest.de.sentry.io/4510697503850576
SENTRY_PROJECT_API_AUTH=rollplay-api-auth
```

**Note:** All of these are already in your `.env` file! ✅

---

## What Was Changed

### **1. Python Service Configs Updated**
- ✅ [api-site/sentry_config.py](api-site/sentry_config.py) - Uses `SENTRY_DSN_API_SITE`
- ✅ [api-game/sentry_config.py](api-game/sentry_config.py) - Uses `SENTRY_DSN_API_GAME`
- ✅ [api-auth/sentry_config.py](api-auth/sentry_config.py) - Uses `SENTRY_DSN_API_AUTH`

### **2. Docker Compose Updated**
- ✅ [docker-compose.yml](docker-compose.yml) - Production uses `SENTRY_DSN_NEXTJS`
- ✅ [docker-compose.dev.yml](docker-compose.dev.yml) - Development uses `SENTRY_DSN_NEXTJS`

### **3. Next.js Config**
- ✅ Already configured to use `NEXT_PUBLIC_SENTRY_DSN`

---

## How the DSNs Are Passed

### **Next.js (app service):**
```yaml
environment:
  - NEXT_PUBLIC_SENTRY_DSN=${SENTRY_DSN_NEXTJS}
```

### **Python Services (api-site, api-game, api-auth):**
```yaml
env_file:
  - .env  # Automatically includes SENTRY_DSN_API_SITE, etc.
```

---

## Sentry Dashboard Organization

### **4 Separate Projects:**

1. **rollplay-app** (Next.js frontend)
   - Dashboard: https://sentry.io/organizations/javascript-nextjs/projects/rollplay-app/
   - Captures: Frontend errors, client-side security alerts

2. **rollplay-api-site** (Business logic)
   - Dashboard: https://sentry.io/organizations/javascript-nextjs/projects/rollplay-api-site/
   - Captures: User/campaign/game logic errors, PostgreSQL issues

3. **rollplay-api-game** (Game sessions)
   - Dashboard: https://sentry.io/organizations/javascript-nextjs/projects/rollplay-api-game/
   - Captures: WebSocket errors, MongoDB issues, real-time game errors

4. **rollplay-api-auth** (Authentication)
   - Dashboard: https://sentry.io/organizations/javascript-nextjs/projects/rollplay-api-auth/
   - Captures: JWT errors, magic link issues, Redis problems

---

## Deployment Steps

### **1. Verify `.env` File**

Check that line 1 is uppercase:
```bash
ENVIRONMENT=development  # ✅ Correct (not 'environment')
```

### **2. Install Python Dependencies**

```bash
# Add to each service's requirements.txt
echo "sentry-sdk[fastapi]==1.45.0" >> api-site/requirements.txt
echo "sentry-sdk[fastapi]==1.45.0" >> api-game/requirements.txt
echo "sentry-sdk[fastapi]==1.45.0" >> api-auth/requirements.txt
```

### **3. Install Next.js Dependencies**

```bash
cd rollplay
npm install  # Installs @sentry/nextjs from package.json
```

### **4. Rebuild & Deploy**

```bash
# Rebuild all services
docker-compose -f docker-compose.yml build --no-cache

# Deploy
docker-compose -f docker-compose.yml up -d

# Check logs for "Sentry initialized"
docker logs api-site | grep -i sentry
docker logs api-game | grep -i sentry
docker logs api-auth | grep -i sentry
docker logs rollplay | grep -i sentry
```

---

## Verification

### **Check Environment Variables in Containers:**

```bash
# Next.js
docker exec rollplay printenv | grep SENTRY
# Expected: NEXT_PUBLIC_SENTRY_DSN=https://942a25...

# api-site
docker exec api-site printenv | grep SENTRY
# Expected: SENTRY_DSN_API_SITE=https://35e8fc...

# api-game
docker exec api-game printenv | grep SENTRY
# Expected: SENTRY_DSN_API_GAME=https://7419e8...

# api-auth
docker exec api-auth printenv | grep SENTRY
# Expected: SENTRY_DSN_API_AUTH=https://cdd288...
```

### **Test Each Project:**

**1. Test Next.js (rollplay-app):**
```javascript
// Add to any page temporarily
throw new Error('Sentry frontend test - rollplay-app');
```
Check: https://sentry.io/organizations/javascript-nextjs/projects/rollplay-app/

**2. Test api-site (rollplay-api-site):**
```python
# Add to any endpoint temporarily
raise Exception("Sentry test - rollplay-api-site")
```
Check: https://sentry.io/organizations/javascript-nextjs/projects/rollplay-api-site/

**3. Test api-game (rollplay-api-game):**
```python
# Add to any endpoint temporarily
raise Exception("Sentry test - rollplay-api-game")
```
Check: https://sentry.io/organizations/javascript-nextjs/projects/rollplay-api-game/

**4. Test api-auth (rollplay-api-auth):**
```python
# Add to any endpoint temporarily
raise Exception("Sentry test - rollplay-api-auth")
```
Check: https://sentry.io/organizations/javascript-nextjs/projects/rollplay-api-auth/

---

## Pros & Cons of Multi-Project Setup

### **Pros:**
✅ **Isolated dashboards** - Each service has its own error dashboard
✅ **Separate alerts** - Configure different alerts per service
✅ **Team ownership** - Different teams can own different projects
✅ **Fine-grained permissions** - Control who sees what

### **Cons:**
❌ **No cross-service view** - Can't see frontend + backend errors together
❌ **More complex** - Need to check 4 dashboards instead of 1
❌ **Harder to debug** - Can't easily trace errors across services
❌ **More expensive** - Each project counts toward quota separately

---

## Setting Up Alerts

Set up alerts **per project**:

### **1. rollplay-app (Frontend):**
```
Condition: level:fatal OR security_incident:potential_rce
Action: Email + Slack #frontend-alerts
```

### **2. rollplay-api-site (Backend):**
```
Condition: level:error OR security_incident:potential_rce
Action: Email + Slack #backend-alerts
```

### **3. rollplay-api-game (Game):**
```
Condition: level:error
Action: Email + Slack #game-alerts
```

### **4. rollplay-api-auth (Auth):**
```
Condition: level:fatal OR security_incident:potential_rce
Action: Email + PagerDuty (critical auth failures)
```

---

## Security Monitoring

All services still have **security monitoring** enabled:

**Detects:**
- Command execution: `wget`, `curl`, `exec`, `spawn`
- Cryptominers: `xmrig`, malware processes
- Backdoors: `csf.php`, `watcher.js`
- Filesystem recon: `touch`, `.write_test`

**When detected:**
- Tagged with `security_incident:potential_rce`
- Level set to `fatal`
- Console logs `[SECURITY ALERT]`

---

## Next Steps

1. ✅ `.env` file is already configured correctly
2. ✅ Python configs updated to use service-specific DSNs
3. ✅ Docker compose files updated
4. ⏳ Install Python dependencies (`sentry-sdk[fastapi]`)
5. ⏳ Install Next.js dependencies (`npm install`)
6. ⏳ Rebuild containers
7. ⏳ Verify each project receives errors
8. ⏳ Set up alerts per project

---

**Your configuration is now ready for 4 separate Sentry projects!**
