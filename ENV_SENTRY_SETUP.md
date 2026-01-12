# Sentry Environment Variables Setup

## Summary

Your Docker Compose setup already uses `env_file: - .env` for all services, which means **all variables are automatically injected**. You just need to add the Sentry variables to your root `.env` file!

---

## Add to Your Root `.env` File

Add these lines to `/var/home/matt/code/rollplay/.env`:

```bash
# ===================================
# Sentry Configuration
# ===================================

# Sentry DSN (shared across all services)
# Get this from: https://sentry.io → Your Project → Settings → Client Keys (DSN)
SENTRY_DSN=https://your-dsn@sentry.io/your-project-id

# Sentry Organization & Project
# Get these from your Sentry project settings
SENTRY_ORG=your-organization-slug
SENTRY_PROJECT=rollplay

# Environment (used for filtering in Sentry dashboard)
ENVIRONMENT=production  # or 'development' for dev environment

# Optional: Auth token for uploading source maps during build
# Get this from: https://sentry.io → Settings → Auth Tokens
# Requires 'project:releases' scope
# SENTRY_AUTH_TOKEN=your-auth-token-here
```

---

## How It Works

### All Services Get These Variables Automatically:

```yaml
# Already in docker-compose.yml
services:
  app:
    env_file:
      - .env  # ✅ Gets SENTRY_DSN, SENTRY_ORG, etc.

  api-site:
    env_file:
      - .env  # ✅ Gets SENTRY_DSN automatically

  api-game:
    env_file:
      - .env  # ✅ Gets SENTRY_DSN automatically

  api-auth:
    env_file:
      - .env  # ✅ Gets SENTRY_DSN automatically
```

### Next.js Special Handling:

Next.js needs `NEXT_PUBLIC_*` variables at **build time**, so we:
1. Pass as **build args** in docker-compose.yml (already done ✅)
2. Accept as **ARG** in Dockerfile (already done ✅)
3. Set as **environment variable** at runtime (already done ✅)

---

## Variable Usage by Service

| Service | Variable Used | Purpose |
|---------|---------------|---------|
| Next.js (app) | `NEXT_PUBLIC_SENTRY_DSN` | Browser-exposed DSN |
| Next.js (app) | `SENTRY_ORG` | For source map uploads |
| Next.js (app) | `SENTRY_PROJECT` | For source map uploads |
| Next.js (app) | `SENTRY_AUTH_TOKEN` | Optional: source map auth |
| api-site | `SENTRY_DSN` | Server-side error tracking |
| api-site | `ENVIRONMENT` | Environment tagging |
| api-game | `SENTRY_DSN` | Server-side error tracking |
| api-game | `ENVIRONMENT` | Environment tagging |
| api-auth | `SENTRY_DSN` | Server-side error tracking |
| api-auth | `ENVIRONMENT` | Environment tagging |

---

## Getting Your Sentry Configuration

### 1. Create Sentry Account & Project

1. Go to [sentry.io](https://sentry.io)
2. Sign up or log in
3. Create a new project:
   - **Platform:** Python (works for all services)
   - **Project name:** `rollplay` or `tabletop-tavern`
   - **Team:** Default or create new

### 2. Get Your DSN

1. Go to **Settings** → **Projects** → `rollplay`
2. Click **Client Keys (DSN)**
3. Copy the DSN (looks like: `https://abc123@o123456.ingest.sentry.io/456789`)

### 3. Get Organization Slug

1. Go to **Settings** → **Organization Settings**
2. Your org slug is in the URL or under "Organization Slug"

### 4. Get Project Name

1. This is the name you chose when creating the project
2. Or go to **Settings** → **Projects** and see the project name

### 5. (Optional) Generate Auth Token

Only needed if you want source map uploads:

1. Go to **Settings** → **Auth Tokens**
2. Click **Create New Token**
3. **Scopes:** Select `project:releases` and `project:write`
4. **Name:** `docker-build-token`
5. Copy the token and add to `.env`

---

## Example `.env` Entry

```bash
# Sentry Configuration (add to your existing .env)
SENTRY_DSN=https://abc123def456@o789123.ingest.sentry.io/456789
SENTRY_ORG=my-organization
SENTRY_PROJECT=rollplay
ENVIRONMENT=production

# Optional: Uncomment when you have an auth token
# SENTRY_AUTH_TOKEN=sntrys_abc123def456ghi789
```

---

## Verification

### Check Variables Are Set:

```bash
# Check in containers
docker exec api-site-dev printenv | grep SENTRY
docker exec api-game-dev printenv | grep SENTRY
docker exec rollplay-dev printenv | grep SENTRY
```

### Expected Output:

```
SENTRY_DSN=https://...
SENTRY_ORG=my-organization
SENTRY_PROJECT=rollplay
ENVIRONMENT=development
```

---

## Deployment Steps

### 1. Update `.env` File

Add Sentry variables as shown above.

### 2. Rebuild All Services

```bash
# Stop containers
docker-compose -f docker-compose.yml down

# Rebuild with updated environment
docker-compose -f docker-compose.yml build --no-cache

# Start containers
docker-compose -f docker-compose.yml up -d
```

### 3. Verify Sentry is Working

Check logs for initialization messages:

```bash
# Check Next.js
docker logs rollplay | grep -i sentry

# Check api-site
docker logs api-site | grep -i sentry
# Expected: "Sentry initialized for api-site"

# Check api-game
docker logs api-game | grep -i sentry
# Expected: "Sentry initialized for api-game"

# Check api-auth
docker logs api-auth | grep -i sentry
# Expected: "Sentry initialized for api-auth"
```

### 4. Test with Error

Throw a test error to verify Sentry captures it:

```bash
# Visit your app and check browser console
# Or make a test API call that triggers an error
```

Check Sentry dashboard - should see the error within 30 seconds!

---

## Troubleshooting

### Sentry Not Initializing:

**Check:**
1. `.env` file has correct DSN (no typos)
2. Docker Compose includes `env_file: - .env`
3. Containers were rebuilt after adding variables

**Fix:**
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Variables Not Appearing in Container:

**Check:**
```bash
# Verify .env file location (should be at repo root)
ls -la /var/home/matt/code/rollplay/.env

# Check docker-compose reads .env
docker-compose config | grep SENTRY
```

### Next.js Build Fails:

**Check:**
1. `NEXT_PUBLIC_SENTRY_DSN` is in `.env`
2. Build args are in docker-compose.yml (already added ✅)
3. ARG declarations are in Dockerfile (already added ✅)

**Debug:**
```bash
docker-compose logs app | grep -i sentry
```

---

## Security Notes

### Safe to Commit:

- ❌ `.env` file (contains secrets)
- ✅ `.env.example` (template without values)
- ✅ Sentry config files (no secrets)

### Safe to Expose:

- ✅ `NEXT_PUBLIC_SENTRY_DSN` (browser-exposed by design)
- ✅ `SENTRY_ORG` (public info)
- ✅ `SENTRY_PROJECT` (public info)

### Keep Secret:

- ❌ `SENTRY_AUTH_TOKEN` (gives write access)
- ❌ Other API keys in `.env`

---

## Next Steps

1. ✅ Add Sentry variables to `.env`
2. ✅ Get DSN from sentry.io
3. ✅ Rebuild containers
4. ✅ Verify initialization in logs
5. ✅ Test with a thrown error
6. ✅ Set up Slack alerts in Sentry dashboard

All the Docker configuration is already done! Just add the variables to `.env` and rebuild.
