# PhotoClusters MVP Implementation Plan (Ignite + React Native)

## Goal

Build an MVP that groups the user’s local photos into meaningful clusters with high perceived quality.

## Scope (MVP)

- Tabs:
  - Moments (done now)
  - Utilities (done now)
  - People (coming soon)
  - Places (coming soon)
- Clustering:
  - Moments: primarily time-based sessions, optionally refined by GPS discontinuity if metadata is available.
  - Utilities: screenshots (and optionally “documents”) separated from camera photos.
- Non-goals for MVP:
  - Face recognition / people clustering
  - Deep semantic clustering (objects/activities)
  - Cloud sync / multi-device

## Guiding UX Principles

- Default view should “just make sense” without configuration.
- Avoid false merges more than false splits (splits are less offensive than mixing unrelated photos).
- Make clusters easy to correct (manual split/merge later).

---

## Milestones

### Milestone 1: Library access + local cache

**Outcome**: app can list photo assets quickly and persist metadata locally.

- Add dependency:
  - `expo-media-library` (request permissions + read assets)
- Define a minimal local cache using `react-native-mmkv`:
  - Store last sync timestamp
  - Store a compact index of assets (IDs + minimal metadata)
  - Store computed clusters (cluster ID -> asset IDs)

**Acceptance criteria**

- On first run (after permission granted), show progress then display content.
- Subsequent opens load cached clusters instantly and refresh in background.

### Milestone 2: Moments tab (time sessions)

**Outcome**: “Moments” shows clusters that feel like “that evening / that walk”.

- Data extraction (per asset):
  - `id`
  - `creationTime` (or best available timestamp)
  - `uri` (for thumbnail rendering)
  - `width/height`
  - `filename` (optional)
  - `location` (if available)
- Session clustering algorithm (baseline):
  1. Sort assets by timestamp ascending.
  2. Start a new cluster if time gap between consecutive photos > `SESSION_GAP_MIN`.
  3. (Optional) if both have location and distance jump > `LOCATION_SPLIT_KM` within `MAX_TRAVEL_TIME_MIN`, start a new cluster.

**Suggested starting thresholds**

- `SESSION_GAP_MIN = 60`
- `LOCATION_SPLIT_KM = 5`
- `MAX_TRAVEL_TIME_MIN = 30`

**Cluster display**

- Cover: first photo or best-quality heuristic later.
- Title: date + count (e.g., “Jan 12, 42 photos”) and duration if available.

**Acceptance criteria**

- A day with multiple sessions appears as separate clusters.
- Scrolling is smooth for 5k+ assets (use thumbnails + virtualization).

### Milestone 3: Utilities tab (screenshots first)

**Outcome**: user can quickly find screenshots (and optionally other utility items).

- Utilities classification (MVP):
  - Screenshot detection via `MediaLibrary` subtype when available.
  - Fallback heuristics:
    - filename contains “screenshot” (case-insensitive)
    - extreme aspect ratios or common screenshot resolutions (optional)
- Present as:
  - “Screenshots” section (reverse chronological)
  - “All utilities” grid (optional)

**Acceptance criteria**

- Screenshots are excluded from Moments by default (configurable later).

### Milestone 4: Navigation + tab structure

**Outcome**: bottom tabs with clear information architecture.

- Tabs:
  - Moments
  - Utilities
  - People (Coming soon placeholder)
  - Places (Coming soon placeholder)

**Acceptance criteria**

- People/Places exist as discoverable tabs but do not break flows.

---

## Technical Plan Details

### Data model (suggested)

- `AssetIndexItem`
  - `id: string`
  - `ts: number` (ms)
  - `uri: string`
  - `w: number`
  - `h: number`
  - `isScreenshot?: boolean`
  - `lat?: number`
  - `lon?: number`
- `Cluster`
  - `id: string`
  - `startTs: number`
  - `endTs: number`
  - `coverAssetId: string`
  - `assetIds: string[]`
  - `kind: 'moment' | 'utility:screenshots' | 'comingSoon:people' | 'comingSoon:places'`

### Background refresh strategy

- On app start:
  - Render from MMKV cache immediately.
  - Kick off background sync:
    - fetch new assets since last sync
    - update index
    - recompute clusters for the affected range (don’t recompute everything each time)

### Performance considerations

- Avoid loading full-res images in lists.
- Use pagination when reading the media library (`first`/`after` cursor).
- Limit memory usage by storing compact metadata (avoid base64 in cache).

---

## Quality improvements (post-MVP, but low risk)

### Duplicate / burst grouping

**Goal**: inside a moment, group near-duplicates so browsing feels clean.

Options (in order of effort):

1. **Burst-only grouping**: photos within 2–5 seconds in the same moment.
2. **Heuristic duplicates**: same dimensions + similar file size + close timestamp.
3. **Perceptual hash (pHash/dHash/aHash)** computed on a small thumbnail.

### Better covers

- Prefer sharp images, faces centered, eyes open (later).
- In MVP: take the median timestamp photo as cover to avoid “first frame” artifacts.

### Manual corrections (high user value)

- “Split here” within a moment.
- “Merge with previous/next moment”.
- Persist manual overrides and treat them as constraints in recomputation.

---

## Coming soon: People tab

- Likely approach:
  - On-device face detection + embeddings (platform-specific, privacy-sensitive).
  - Group by identity, then sub-cluster by time/place.
- MVP placeholder:
  - Static screen explaining it’s coming soon.

## Coming soon: Places tab

- Likely approach:
  - Cluster by GPS density (DBSCAN/HDBSCAN-like) into “places”.
  - Overlay with time to create visits.
- MVP placeholder:
  - Static screen explaining it’s coming soon.

---

## Open questions (to decide early)

- Do we include videos in Moments MVP or photos only?
- Should screenshots appear in Moments (default off) or always excluded?
- iOS Live Photos: treat as photo or special utility?

## Suggested first implementation order

1. Request permission + list assets (paged)
2. Cache asset index in MMKV
3. Implement session clustering + Moments UI
4. Implement screenshot detection + Utilities UI
5. Add placeholders for People/Places
