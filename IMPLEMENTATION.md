# PhotoClusters — Implementation Notes

This file is meant to preserve enough context about the current state of the app so that, if chat/agent context is cleared, a future contributor (or an AI assistant) can quickly understand:

- what the app does
- how it is structured
- what the current clustering logic is
- where to extend it next

## High-level product goal

PhotoClusters is a React Native (Expo) app that clusters a user’s local photo library into “Moments” (sessions) that feel like logical groupings.

Current MVP features:

- **Moments tab**: time-gap based session clustering (screenshots excluded by default).
- **Utilities tab**: screenshot collection.
- **People/Places tabs**: placeholders (“Coming soon”).

Primary hypothesis: quality of clustering is the key value; the grouping should feel intuitive.

---

## Tech stack

- **Expo SDK**: ~54
- **Navigation**: `expo-router`
- **Storage**: `react-native-mmkv` via `src/utils/storage`
- **Media access**: `expo-media-library`
- **Dates**: `date-fns`

Entry point:

- `package.json` sets `"main": "expo-router/entry"`

---

## App navigation / routes

The app uses `expo-router`.

- Root layout: `src/app/_layout.tsx`
  - Boots fonts + i18n
  - Wraps the app in `ThemeProvider`, `SafeAreaProvider`, `KeyboardProvider`
  - Renders `<Slot />`

- Root route: `src/app/index.tsx`
  - Redirects to `/(tabs)/moments`

- Tabs route group: `src/app/(tabs)/_layout.tsx`
  - Bottom tabs:
    - `src/app/(tabs)/moments.tsx`
    - `src/app/(tabs)/utilities.tsx`
    - `src/app/(tabs)/people.tsx` (placeholder)
    - `src/app/(tabs)/places.tsx` (placeholder)

---

## Core data model

Defined in `src/services/photoClustering.ts`.

### `AssetIndexItem`

A compact representation of a photo asset:

- `id: string`
- `ts: number` — timestamp used for sorting/clustering
- `uri: string`
- `w: number`
- `h: number`
- `isScreenshot?: boolean`

Note: at the moment `ts` is taken from `MediaLibrary.Asset.creationTime` (see below).

### `MomentCluster`

- `id: string` — currently derived from start/end/count: `${startTs}-${endTs}-${assetIds.length}`
- `startTs: number`
- `endTs: number`
- `coverAssetId: string` — currently middle photo of the cluster
- `assetIds: string[]`

---

## Media library indexing + caching

Implemented in `src/services/photoLibrary.ts`.

### Permission

- `requestPhotoPermission()` uses:
  - `MediaLibrary.getPermissionsAsync()`
  - `MediaLibrary.requestPermissionsAsync()`

### Cache keys (MMKV)

Stored as JSON via `src/utils/storage` helpers:

- `photoClusters.assetIndex.v1`
- `photoClusters.moments.v1`
- `photoClusters.lastSyncTs.v1`

### Public API

- `loadCachedMomentsState()`
  - returns cached `{ assetIndex, moments, lastSyncTs }`.

- `refreshMomentsState(options?: Partial<ClusterOptions>)`
  - requests permission
  - fetches assets from MediaLibrary (paged)
  - computes screenshot set (iOS `mediaSubtypes: ["screenshot"]` query + fallbacks)
  - builds `indexed: AssetIndexItem[]`
  - calls `clusterMoments(indexed, clusterOptions)`
  - persists `assetIndex`, `moments`, `lastSyncTs`

### Paged fetching (MVP constraints)

`buildAssetIndex()`:

- uses `MediaLibrary.getAssetsAsync({ mediaType: "photo", first: 200, after, sortBy: [creationTime] })`
- currently stops at **2000 assets** for speed during development.

Screenshot fetching:

- `findScreenshotAssetIds()`:
  - on iOS, first tries querying assets directly using:
    - `MediaLibrary.getAssetsAsync({ mediaSubtypes: ["screenshot"], mediaType: "photo", ... })`
  - if that yields nothing, falls back to smart albums:
    - `MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true })`
    - tries to find an album whose title includes `"screenshot"` (case-insensitive)
    - pages through that album to collect asset IDs
  - currently caps at **2000 screenshot IDs**

Additional screenshot heuristic:

- filename contains `"screenshot"` (case-insensitive)

During indexing (`buildAssetIndex()`), assets are also marked `isScreenshot` if their iOS `mediaSubtypes` includes `"screenshot"`.

---

## Clustering algorithm (Moments)

Implemented in `src/services/photoClustering.ts`.

### Inputs

- `assets: AssetIndexItem[]`
- `options: { sessionGapMinutes: number; includeScreenshots: boolean }`

### Steps

1. Filter screenshots out unless `includeScreenshots` is true.
2. Sort ascending by `ts`.
3. Start a new cluster if gap between consecutive photos exceeds:
   - `gapMs = sessionGapMinutes * 60 * 1000`
4. Convert each cluster into `MomentCluster`:
   - `startTs` = first asset ts
   - `endTs` = last asset ts
   - `coverAssetId` = middle asset’s id

Default gap used by the UI via `refreshMomentsState()`:

- `sessionGapMinutes = 60`

---

## Moments UI

Implemented in `src/app/(tabs)/moments.tsx`.

### Data flow

- On initial render:
  - loads cached state (`loadCachedMomentsState()`)
- On mount:
  - calls `refreshMomentsState({ includeScreenshots: false })`
  - updates:
    - `clusters`
    - `assetUriById` map for rendering cover thumbnails

### List item rendering

- shows cover thumbnail from `assetUriById[coverAssetId]`
- shows title + photo count

### Title formatting rules (current UX)

The title includes time only when it helps disambiguate.

Per-day cluster counting:

- Compute `clusterCountByDayKey` using the cluster `startTs` day (`yyyy-MM-dd`).

Formatting:

- If a day has **only 1** cluster:
  - show only date: `MMM d, yyyy`
- If a day has **2+** clusters:
  - show date + time info:
    - If duration `endTs - startTs <= 10 min`:
      - `MMM d, yyyy • HH:mm`
    - Else if start/end are same day:
      - `MMM d, yyyy • HH:mm–HH:mm`
    - Else (cross midnight):
      - `MMM d, yyyy • HH:mm–MMM d, HH:mm`

---

## Utilities UI

Implemented in `src/app/(tabs)/utilities.tsx`.

- On initial render:
  - uses cached `assetIndex` to display screenshots
- On mount:
  - calls `refreshMomentsState({ includeScreenshots: true })`
  - filters to assets where `isScreenshot === true`
- Renders a 3-column grid of screenshots.

---

## People / Places tabs

- `src/app/(tabs)/people.tsx` — placeholder
- `src/app/(tabs)/places.tsx` — placeholder

---

## Configuration notes

- `expo-media-library` added as a dependency.
- `app.json` contains an `expo-media-library` plugin config providing permission strings.

---

## Running / testing

### Typecheck

- `yarn compile`

### iOS device

This repo uses a dev-client workflow (`yarn start` runs `expo start --dev-client`).

Typical flow:

1. Build and install dev-client:
   - `yarn ios --device` (USB-connected iPhone)
2. Start Metro:
   - `yarn start`

If the app installs but won’t launch due to trust/signing:

- Enable iOS **Developer Mode** (Settings → Privacy & Security)
- Trust the developer certificate (Settings → General → VPN & Device Management)

---

## Known limitations / TODOs

- `photoLibrary.ts` currently caps indexing to 2000 assets.
- Timestamp source (`creationTime`) should be validated (seconds vs ms) and normalized to ms consistently.
- No dedicated “cluster detail” screen yet (tap does nothing).
- No background refresh scheduling yet (currently refreshes on screen mount).
- No near-duplicate/burst stacking yet.
- Screenshot detection is best-effort; iOS primarily uses `mediaSubtypes: ["screenshot"]` with smart-album and filename fallbacks.

---

## Where to extend next (suggested)

- Add a cluster detail route: tap a Moment → show grid of photos.
- Add virtualization / thumbnail generation strategies for large libraries.
- Improve screenshot detection using subtype APIs when available.
- Add location-based split refinement (optional) once location metadata is accessible.
- Add manual split/merge (high UX value).
