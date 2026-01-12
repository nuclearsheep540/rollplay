# Sentry Multi-Service Setup

## Architecture: Single Project with Service Tags

All services (Next.js, api-site, api-game, api-auth) use **one Sentry project** and differentiate themselves with service tags.

### Benefits:
- ✅ Single DSN shared across all services
- ✅ Unified error dashboard
- ✅ Filter by service: `service:api-site`
- ✅ See cross-service issues together
- ✅ Simpler configuration

---

## Environment Variables

Add to your **root `.env` file**:

```bash
# Sentry Configuration (shared across all services)
SENTRY_DSN=https://your-dsn@sentry.io/project-id
SENTRY_ORG=your-org-name
SENTRY_PROJECT=rollplay
ENVIRONMENT=production  # or development

# For Next.js (browser-exposed)
NEXT_PUBLIC_SENTRY_DSN=${SENTRY_DSN}

# Optional: For source map uploads
# SENTRY_AUTH_TOKEN=your-auth-token
```

---

## Docker Compose Configuration

### Production (`docker-compose.yml`):

```yaml
services:
  app:
    environment:
      - NEXT_PUBLIC_SENTRY_DSN=${SENTRY_DSN}
      - SENTRY_ORG=${SENTRY_ORG}
      - SENTRY_PROJECT=${SENTRY_PROJECT}

  api-site:
    environment:
      - SENTRY_DSN=${SENTRY_DSN}
      - ENVIRONMENT=${ENVIRONMENT}

  api-game:
    environment:
      - SENTRY_DSN=${SENTRY_DSN}
      - ENVIRONMENT=${ENVIRONMENT}

  api-auth:
    environment:
      - SENTRY_DSN=${SENTRY_DSN}
      - ENVIRONMENT=${ENVIRONMENT}
```

### Development (`docker-compose.dev.yml`):

Same environment variables, but `ENVIRONMENT=development`

---

## Service Tags

Each service automatically tags errors with:

### Next.js Frontend
```javascript
{
  service: 'nextjs-frontend',
  layer: 'presentation'
}
```

### api-site (Business Logic)
```python
{
  service: 'api-site',
  layer: 'business-logic',
  component: 'fastapi'
}
```

### api-game (Game Sessions)
```python
{
  service: 'api-game',
  layer: 'game-sessions',
  component: 'websocket'
}
```

### api-auth (Authentication)
```python
{
  service: 'api-auth',
  layer: 'authentication',
  component: 'jwt'
}
```

---

## Python Requirements

Add to your Python `requirements.txt` files:

### api-site/requirements.txt:
```
sentry-sdk[fastapi]==1.45.0
```

### api-game/requirements.txt:
```
sentry-sdk[fastapi]==1.45.0
```

### api-auth/requirements.txt:
```
sentry-sdk[fastapi]==1.45.0
```

---

## Installation Steps

### 1. Install Python Dependencies

```bash
# api-site
cd api-site
pip install sentry-sdk[fastapi]

# api-game
cd api-game
pip install sentry-sdk[fastapi]

# api-auth
cd api-auth
pip install sentry-sdk[fastapi]

# Next.js (already done)
cd rollplay
npm install  # @sentry/nextjs already in package.json
```

### 2. Configure Sentry Project

1. Go to [sentry.io](https://sentry.io)
2. Create ONE project (name it "rollplay" or "tabletop-tavern")
3. Platform: **Python** (works for all)
4. Copy DSN from Project Settings

### 3. Update Environment Variables

Add to your `.env`:
```bash
SENTRY_DSN=https://your-actual-dsn@sentry.io/project-id
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=rollplay
ENVIRONMENT=production
```

### 4. Update Docker Compose

Add environment variables to all services in `docker-compose.yml`:

```yaml
app:
  environment:
    - NEXT_PUBLIC_SENTRY_DSN=${SENTRY_DSN}

api-site:
  environment:
    - SENTRY_DSN=${SENTRY_DSN}

api-game:
  environment:
    - SENTRY_DSN=${SENTRY_DSN}

api-auth:
  environment:
    - SENTRY_DSN=${SENTRY_DSN}
```

### 5. Rebuild & Deploy

```bash
# Rebuild all services
docker-compose -f docker-compose.yml build --no-cache

# Deploy
docker-compose -f docker-compose.yml up -d
```

---

## Filtering Errors in Sentry Dashboard

### View Errors by Service:

```
service:nextjs-frontend    # Frontend only
service:api-site           # Business logic only
service:api-game          # Game sessions only
service:api-auth          # Auth service only
```

### View Security Incidents:

```
security_incident:potential_rce
level:fatal
alert_security_team:true
```

### View by Layer:

```
layer:presentation         # Frontend
layer:business-logic       # api-site
layer:game-sessions        # api-game
layer:authentication       # api-auth
```

### Compound Filters:

```
service:api-site level:error                    # api-site errors only
service:api-game security_incident:potential_rce # api-game security alerts
layer:business-logic environment:production      # Production api-site
```

---

## Setting Up Alerts

### Security Alert (All Services):

1. **Alerts** → **Create Alert**
2. **Conditions:**
   - When event is tagged `security_incident:potential_rce`
   - OR when event level is `fatal`
3. **Actions:**
   - Send to **#security-alerts** Slack channel
   - Send email to security team
   - (Optional) Create PagerDuty incident

### Service-Specific Alerts:

**Frontend Errors:**
```
Condition: service:nextjs-frontend AND level:error
Action: Send to #frontend-alerts
```

**API Errors:**
```
Condition: service:api-site AND level:error
Action: Send to #backend-alerts
```

**Game Session Errors:**
```
Condition: service:api-game AND level:error
Action: Send to #game-alerts
```

---

## Testing

### Test Frontend:
```javascript
// Add to any Next.js page temporarily
throw new Error('Sentry frontend test');
```

### Test api-site:
```bash
curl -X POST https://tabletop-tavern.uk/api/test-error
```

### Test api-game:
```python
# Add to api-game endpoint
raise Exception("Sentry game service test")
```

### Test Security Alert:
```bash
# Should trigger security alert across all services
curl -X POST https://tabletop-tavern.uk/api/test \
  -d '{"test": "wget malicious command"}'
```

Check Sentry dashboard - should see:
- Error tagged with `security_incident`
- Service tag (`api-site`, etc.)
- Fatal level

---

## Monitoring Dashboard

### Key Metrics:

1. **Error Rate by Service:**
   - Track spikes in specific services
   - Compare frontend vs backend error rates

2. **Security Incidents:**
   - Filter: `security_incident:potential_rce`
   - Should be near zero (only on attacks)

3. **Performance:**
   - Track slow endpoints
   - Identify bottlenecks by service

4. **User Impact:**
   - Affected users per service
   - Error distribution

---

## Cost Optimization

**Free Tier:** 5,000 errors/month

**If you hit limits:**

1. **Reduce sampling:**
   ```python
   traces_sample_rate=0.1  # 10% instead of 100%
   ```

2. **Filter out noise:**
   ```python
   def before_send(event, hint):
       # Ignore non-critical errors
       if event.get('level') == 'info':
           return None
       return event
   ```

3. **Upgrade to paid plan** (recommended if you hit free tier limit)

---

## Troubleshooting

### Errors Not Appearing:

**Check:**
1. DSN is set: `docker exec api-site printenv | grep SENTRY`
2. Sentry initialized: Check container logs for "Sentry initialized"
3. Service restarted after adding DSN

### Wrong Service Tags:

**Check:**
- Each service has unique `sentry_config.py`
- Service name matches in tags
- No copy-paste errors between services

### Security Alerts Not Firing:

**Check:**
- Alert rule exists in Sentry
- Alert conditions match tags
- Notification channels configured
- Test with known suspicious pattern: `wget`

---

## Next Steps

1. ✅ Install Python dependencies (`sentry-sdk[fastapi]`)
2. ✅ Configure `.env` with Sentry DSN
3. ✅ Update docker-compose.yml with environment variables
4. ✅ Rebuild and deploy containers
5. ✅ Test each service with a thrown error
6. ✅ Set up Slack alerts for fatal errors
7. ✅ Monitor dashboard for first 48 hours

---

**Questions?** Check [SENTRY_SETUP.md](rollplay/SENTRY_SETUP.md) for Next.js-specific configuration.
