# Cleanup Scripts

This directory contains background maintenance scripts for the Rollplay application.

## cleanup_orphaned_sessions.py

**Purpose**: Hourly cleanup of orphaned MongoDB sessions that weren't properly deleted.

**What it does**:
- Finds games marked `INACTIVE` in PostgreSQL but still have `session_id` set
- Only processes games stopped more than 1 hour ago (avoids interfering with active cleanup)
- Deletes the MongoDB session via api-game DELETE endpoint
- Clears the `session_id` reference in PostgreSQL

**When to use**:
This is a safety net for edge cases where the background cleanup task failed due to:
- Network issues between api-site and api-game
- api-game being temporarily down
- Any other transient failures

## Setup Instructions

### 1. Install Dependencies

```bash
cd /home/matt/rollplay/scripts
pip install -r requirements.txt
```

### 2. Set Environment Variables

The script needs PostgreSQL connection details:

```bash
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=your_password
export POSTGRES_HOST=postgres  # or localhost if running outside Docker
export POSTGRES_PORT=5432
export POSTGRES_DB=rollplay
export API_GAME_URL=http://api-game:8081  # or http://localhost:8081
```

### 3. Test the Script Manually

```bash
cd /home/matt/rollplay
python3 scripts/cleanup_orphaned_sessions.py
```

You should see output like:
```
============================================================
Starting orphaned session cleanup
============================================================
Connected to PostgreSQL at postgres:5432/rollplay
Found 0 orphaned sessions
No orphaned sessions found - all clean!
```

### 4. Setup Cron Job

**Option A: User Crontab (Recommended for WSL/Development)**

```bash
# Edit your crontab
crontab -e

# Add this line to run every hour at minute 0
0 * * * * cd /home/matt/rollplay && /usr/bin/python3 scripts/cleanup_orphaned_sessions.py >> /tmp/rollplay-cleanup.log 2>&1
```

**Option B: System Cron (Production)**

Create `/etc/cron.d/rollplay-cleanup`:

```bash
# Run cleanup every hour
0 * * * * yourusername cd /home/matt/rollplay && /usr/bin/python3 scripts/cleanup_orphaned_sessions.py >> /var/log/rollplay/cleanup.log 2>&1
```

**Option C: Docker Container with Cron (Advanced)**

Add to `docker-compose.yml`:

```yaml
services:
  cleanup-cron:
    build:
      context: ./scripts
      dockerfile: Dockerfile.cleanup
    container_name: cleanup-cron
    env_file: .env
    depends_on:
      - postgres
      - api-game
    networks:
      - default
    restart: unless-stopped
```

Create `scripts/Dockerfile.cleanup`:

```dockerfile
FROM python:3.9-slim

WORKDIR /app

# Install cron and dependencies
RUN apt-get update && apt-get install -y cron && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY cleanup_orphaned_sessions.py .

# Add cron job
RUN echo "0 * * * * cd /app && /usr/local/bin/python cleanup_orphaned_sessions.py >> /var/log/cron.log 2>&1" | crontab -

CMD ["cron", "-f"]
```

### 5. Verify Cron is Running

```bash
# Check crontab
crontab -l

# Monitor the log file
tail -f /tmp/rollplay-cleanup.log

# Or for system cron
sudo tail -f /var/log/rollplay/cleanup.log
```

## Troubleshooting

### Script fails with "POSTGRES_PASSWORD not set"
Set the environment variables in your crontab:
```bash
0 * * * * export POSTGRES_PASSWORD=yourpass && cd /home/matt/rollplay && python3 scripts/cleanup_orphaned_sessions.py
```

### Script can't connect to api-game
- If running outside Docker, use `http://localhost:8081` instead of `http://api-game:8081`
- Check that api-game container is running: `docker ps | grep api-game`

### How to test without waiting for cron
Run manually: `python3 scripts/cleanup_orphaned_sessions.py`

## Monitoring

Check logs regularly to ensure cleanup is working:

```bash
# Recent cleanup runs
grep "Starting orphaned session cleanup" /tmp/rollplay-cleanup.log | tail -10

# Any errors
grep "ERROR" /tmp/rollplay-cleanup.log

# Success rate
grep "Cleanup complete" /tmp/rollplay-cleanup.log | tail -10
```
