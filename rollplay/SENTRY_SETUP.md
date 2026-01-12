# Sentry Setup Guide

## Overview
Sentry has been configured to monitor your Next.js application with **special security monitoring** to detect potential RCE attacks and malicious command execution.

## Files Created

1. **`sentry.client.config.js`** - Client-side Sentry configuration with security monitoring
2. **`sentry.server.config.js`** - Server-side Sentry configuration with security monitoring
3. **`sentry.edge.config.js`** - Edge runtime Sentry configuration
4. **`instrumentation.js`** - Initializes Sentry on server startup
5. **`.env.example`** - Template for required environment variables
6. **`next.config.js`** - Updated to integrate Sentry webpack plugin

## Installation Steps

### 1. Install Dependencies
```bash
cd /var/home/matt/code/rollplay/rollplay
npm install
```

This will install `@sentry/nextjs@^8.45.0`.

### 2. Set Up Sentry Project

1. Go to [sentry.io](https://sentry.io) and create an account (or log in)
2. Create a new project:
   - Platform: **Next.js**
   - Set alert rules for "fatal" level errors
3. Copy your DSN from Project Settings → Client Keys (DSN)

### 3. Configure Environment Variables

Add these to your `.env` file (root of project, not in rollplay/):

```bash
# Sentry Configuration
NEXT_PUBLIC_SENTRY_DSN=https://your-actual-dsn@sentry.io/project-id
SENTRY_ORG=your-organization-slug
SENTRY_PROJECT=your-project-name

# Optional: For uploading source maps
SENTRY_AUTH_TOKEN=your-auth-token
```

**Important:**
- `NEXT_PUBLIC_SENTRY_DSN` is public and can be exposed to the browser
- `SENTRY_AUTH_TOKEN` should be kept secret (used during build only)

### 4. Update Docker Environment

Add to your `docker-compose.yml` for the `app` service:

```yaml
app:
  environment:
    - NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
    - SENTRY_ORG=${SENTRY_ORG}
    - SENTRY_PROJECT=${SENTRY_PROJECT}
```

## Security Monitoring Features

### Suspicious Pattern Detection

The Sentry configuration automatically monitors for these security indicators:

**Command Execution Patterns:**
- `wget`, `curl` - Downloading files
- `pkill` - Killing processes
- `exec`, `spawn`, `child_process` - Executing commands
- `bash`, `sh -c` - Shell execution

**Known Malware Indicators:**
- `xmrig` - Monero cryptominer
- `javae`, `javat`, `sYsTeMd`, `runnv` - Disguised processes
- `watcher.js` - Persistence mechanism
- `csf.php` - PHP backdoor
- `.write_test` - Filesystem enumeration

### Alert Behavior

When suspicious activity is detected:

1. **Automatic tagging:**
   - `security_incident: potential_rce`
   - `severity: critical`
   - `alert_security_team: true`

2. **Error level:** Set to `fatal` (highest priority)

3. **Grouped incidents:** Uses fingerprint `security-rce-attempt`

4. **Console logging:** Server logs will show `[SECURITY ALERT]` messages

### Setting Up Alerts

In your Sentry project:

1. Go to **Alerts** → **Create Alert**
2. Choose "Issues" alert type
3. Set conditions:
   - When an event is tagged `security_incident:potential_rce`
   - OR when an event level is `fatal`
4. Set actions:
   - Send to **email**
   - Send to **Slack** (recommended)
   - Send to **PagerDuty** (for immediate response)

## Testing Sentry Integration

### 1. Test Basic Error Tracking
```javascript
// Add this to any page temporarily
throw new Error('Sentry test error');
```

### 2. Test Security Monitoring
```javascript
// This should trigger a security alert
console.error('Test security alert: wget detected');
```

Check your Sentry dashboard - you should see:
- Error tagged with `security_incident`
- Level set to `fatal`
- Alert sent to configured channels

## Production Deployment

### Build with Sentry
```bash
# Sentry will automatically upload source maps during build
npm run build
```

### Docker Build
The Dockerfile already supports Sentry:
- Environment variables are passed through
- Source maps are uploaded during build (if `SENTRY_AUTH_TOKEN` is set)
- No additional configuration needed

## Monitoring Dashboard

### Key Metrics to Watch:

1. **Error Rate:** Sudden spikes may indicate attacks
2. **Fatal Errors:** Security alerts will show here
3. **Tags:** Filter by `security_incident:potential_rce`
4. **Performance:** Slow API responses might indicate cryptominer activity

### Recommended Filters:

**Security Incidents Only:**
```
security_incident:potential_rce
```

**Server-side Issues:**
```
server_side:true level:fatal
```

## Integration with Other Tools

### Slack Integration
1. Go to Sentry → Settings → Integrations
2. Add Slack
3. Create a `#security-alerts` channel
4. Route `fatal` level errors to this channel

### Email Alerts
1. Go to Sentry → Settings → Notifications
2. Add your email
3. Enable alerts for `fatal` level errors

## Troubleshooting

### Sentry Not Capturing Errors

**Check:**
1. DSN is correctly set in `.env`
2. Environment variable is passed to Docker container
3. `npm install` was run after adding `@sentry/nextjs`
4. Application was rebuilt (`npm run build`)

**Verify:**
```bash
# Check if Sentry is initialized
docker exec rollplay node -e "console.log(process.env.NEXT_PUBLIC_SENTRY_DSN)"
```

### Source Maps Not Uploading

**Check:**
1. `SENTRY_AUTH_TOKEN` is set
2. `SENTRY_ORG` and `SENTRY_PROJECT` match your Sentry project
3. Auth token has `project:releases` scope

**Generate token:**
1. Sentry → Settings → Auth Tokens
2. Create new token with `project:releases` scope

## Disabling Sentry (Development)

To disable Sentry temporarily:

```bash
# Leave NEXT_PUBLIC_SENTRY_DSN empty or unset
unset NEXT_PUBLIC_SENTRY_DSN
```

Sentry will automatically disable if DSN is not set.

## Cost Considerations

- **Free tier:** 5,000 errors/month
- **Security alerts:** Low volume (only triggers on suspicious activity)
- **Replay sessions:** Configured at 10% sampling (can disable to save quota)

To reduce costs:
- Adjust `tracesSampleRate` (currently 1.0 = 100%)
- Adjust `replaysSessionSampleRate` (currently 0.1 = 10%)
- Filter out non-critical errors in `beforeSend`

## Next Steps

1. **Install dependencies:** `npm install`
2. **Configure Sentry project** on sentry.io
3. **Add environment variables** to `.env`
4. **Test locally** with a thrown error
5. **Deploy to production**
6. **Set up Slack alerts** for fatal errors
7. **Monitor security dashboard** regularly

---

**Security Note:** Sentry will help you detect attacks in real-time, but it's not a replacement for proper security practices. Always keep dependencies updated and follow security best practices.
