# LiveKit Live Streaming — Implementation Plan

## Context

This document was produced after researching live streaming options for a personal, zero-scale tool
to share a screen with a small number of viewers (2–3 people) outside of Google Meet or Discord.
It is intended as a handoff to a Claude agent to implement the feature.

The goal is sub-second latency, no self-hosted media infrastructure, and minimal cost.

---

## Decision Summary

### What was ruled out

- **Mux**: Managed RTMP + HLS. Excellent API but live streams cost ~$1.88/hr in encoding alone at
  1080p (plus quality required for live — free basic tier does not support live streaming).
  Reference: https://www.mux.com/docs/pricing/video

- **nginx-rtmp (self-hosted HLS)**: Free and simple to Docker-compose in, but HLS has a minimum
  latency floor of ~6 seconds even with aggressive fragment sizing. LL-HLS gets to ~1–2s.
  Neither meets the sub-second requirement.

- **Owncast**: Self-hosted, turnkey, also HLS-based — same latency floor as nginx-rtmp.

### What we chose: LiveKit Cloud

LiveKit is an open-source WebRTC SFU (Selective Forwarding Unit). It has a managed cloud offering
(LiveKit Cloud) with a global edge network, meaning all media traffic — OBS ingest and viewer
delivery — flows through LiveKit's infrastructure and never touches the EC2 box.

**Why LiveKit Cloud over self-hosting LiveKit on EC2:**
- No EC2 bandwidth consumed for video (only lightweight token API calls hit the box)
- Global edge reduces latency for geographically distributed viewers
- Free tier is sufficient for personal use at the expected scale

**Latency:** 50–200ms end-to-end (WebRTC). Compared to 6s+ for HLS.

**OBS compatibility:** OBS v30+ supports WHIP (WebRTC HTTP Ingest Protocol), which LiveKit Cloud
accepts natively. No RTMP middleman needed.

Reference: https://docs.livekit.io/

---

## Pricing Reality Check (LiveKit Cloud Free Tier)

Free tier includes **5,000 participant-minutes** and **50 GB downstream bandwidth** per month.
No credit card required. Reference: https://livekit.com/pricing

At 1080p / 5 Mbps with 2 viewers:
- Data per hour: `2 viewers × 5 Mbps × 3600s ÷ 8 = 4.5 GB/hr`
- Free bandwidth headroom: `50 GB ÷ 4.5 GB = ~11 hours/month`
- Free minutes headroom: `5,000 ÷ (3 participants × 60) = ~27 hours/month`
- **Binding constraint: bandwidth → ~11 hours/month free**

Overage if exceeded: ~$0.12/GB downstream = ~$0.54/hr. Still far cheaper than Mux.

Upstream bandwidth (OBS → LiveKit) is free and not metered.

---

## Existing Stack

| Layer | Technology |
|---|---|
| Backend | Python 3, FastAPI |
| Frontend | Next.js, Tailwind CSS |
| Infrastructure | AWS EC2, Docker Compose |
| Object storage | S3 with presigned URLs |

---

## Architecture

```
OBS (WHIP out)
     │
     ▼
LiveKit Cloud (global edge)
     │
     ├──▶ Viewer browser (WebRTC)
     └──▶ Viewer browser (WebRTC)

EC2 (FastAPI)
  └── POST /api/stream/publisher-token   ← called once to configure OBS
  └── GET  /api/stream/viewer-token      ← called by each viewer page load
```

EC2 is entirely out of the media path. It only issues short-lived JWT tokens to authenticate
participants with LiveKit Cloud.

---

## Implementation Steps

### 1. LiveKit Cloud account

- Sign up at https://livekit.io/cloud (free, no credit card)
- Create a project, note the **API Key**, **API Secret**, and **WebSocket URL**
  (format: `wss://your-project.livekit.cloud`)
- Set these as environment variables on EC2:
  ```
  LIVEKIT_API_KEY=...
  LIVEKIT_API_SECRET=...
  LIVEKIT_URL=wss://your-project.livekit.cloud
  ```

### 2. FastAPI — token endpoints

Install the SDK:
```bash
pip install livekit
```

Add two endpoints. The room name can be hardcoded (personal tool) or dynamic if you want
multiple concurrent streams later:

```python
from livekit import api
import os

LIVEKIT_API_KEY = os.environ["LIVEKIT_API_KEY"]
LIVEKIT_API_SECRET = os.environ["LIVEKIT_API_SECRET"]
ROOM_NAME = "main-stream"

@app.get("/api/stream/publisher-token")
async def publisher_token():
    """Called once — used as the OBS WHIP bearer token."""
    token = api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    token.with_grants(api.VideoGrants(
        room_join=True,
        room=ROOM_NAME,
        can_publish=True,
        can_subscribe=False,
    ))
    return {"token": token.to_jwt()}

@app.get("/api/stream/viewer-token")
async def viewer_token():
    """Called by the Next.js frontend on page load for each viewer."""
    token = api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    token.with_grants(api.VideoGrants(
        room_join=True,
        room=ROOM_NAME,
        can_publish=False,
        can_subscribe=True,
    ))
    return {"token": token.to_jwt()}
```

Note: `publisher-token` should be protected (e.g. require auth) so only you can retrieve it.
`viewer-token` can be public or similarly protected depending on how private the stream is.

### 3. OBS Configuration

- OBS 30+ required for WHIP support
- Settings → Stream:
  - Service: `WHIP`
  - Server: `https://your-project.livekit.cloud/whip`
  - Bearer Token: value from `GET /api/stream/publisher-token`
- Recommended output settings for 1080p:
  - Encoder: H.264
  - Bitrate: 5000–6000 kbps
  - Keyframe interval: 2s
  - Audio: AAC

Reference: https://www.mux.com/docs/guides/configure-broadcast-software (encoder settings
guidance applies generically regardless of ingest target)

### 4. Next.js frontend — viewer page

Install the LiveKit React SDK:
```bash
npm install @livekit/components-react livekit-client
```

Create a viewer page. The `LiveKitRoom` component handles WebRTC connection and reconnection
automatically:

```tsx
import { useEffect, useState } from 'react';
import { LiveKitRoom, VideoTrack, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';

function StreamViewer() {
  const tracks = useTracks([
    Track.Source.ScreenShare,
    Track.Source.Camera,
  ]);

  return (
    <div>
      {tracks.map(track => (
        <VideoTrack key={track.publication.sid} trackRef={track} />
      ))}
    </div>
  );
}

export default function WatchPage() {
  const [token, setToken] = useState<string | null>(null);
  const liveKitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL!;

  useEffect(() => {
    fetch('/api/stream/viewer-token')
      .then(r => r.json())
      .then(d => setToken(d.token));
  }, []);

  if (!token) return <div>Connecting...</div>;

  return (
    <LiveKitRoom
      serverUrl={liveKitUrl}
      token={token}
      connect={true}
    >
      <StreamViewer />
    </LiveKitRoom>
  );
}
```

Add to `.env.local`:
```
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
```

### 5. No Docker Compose changes needed

Because LiveKit Cloud is fully external, there are no new containers to add. The only infra
change is opening no additional ports — all viewer traffic is WebRTC via LiveKit's edge,
and the token endpoints are standard HTTPS on your existing FastAPI port.

If you later want to self-host LiveKit on EC2 (e.g. to eliminate the free tier bandwidth cap),
the only change is swapping `LIVEKIT_URL` to point at your own instance. Code is identical.
Reference: https://docs.livekit.io/deploy/

---

## CORS Notes

CORS is not a concern for the media path — WebRTC connections are not subject to browser CORS
restrictions. The only CORS surface is your FastAPI token endpoints, which should already be
covered by your existing FastAPI CORS middleware for the Next.js frontend origin.

---

## Quality Constraints Summary

| Setting | Value |
|---|---|
| Max resolution (live) | 1080p |
| Recommended bitrate (1080p) | 5000–6000 kbps |
| Framerate | 30fps (60fps possible but marginal over WebRTC) |
| Codec | H.264 (universal browser support) |
| Latency | 50–200ms glass-to-glass |
| Bitrate adaptation | WebRTC congestion control may downscale under poor network |

For screen share content (text, UI) the `detail` content hint should be set if publishing
via browser API. When publishing via OBS/WHIP, push a higher bitrate to compensate for the
absence of this hint.

---

## References

- LiveKit docs: https://docs.livekit.io/
- LiveKit Cloud pricing: https://livekit.com/pricing
- LiveKit Cloud WHIP ingest: https://docs.livekit.io/realtime/ingress/whip/
- LiveKit Python SDK: https://github.com/livekit/python-sdks
- LiveKit React components: https://docs.livekit.io/realtime/client/react-components/
- OBS WHIP setup: https://www.mux.com/docs/guides/configure-broadcast-software
- Why HLS can't do sub-second latency: segment-based protocol, minimum fragment = 2s floor
- Mux pricing (ruled out): https://www.mux.com/docs/pricing/video
