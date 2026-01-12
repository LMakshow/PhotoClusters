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
- **Places tab**: location-based clustering (no network calls; uses offline reverse geocoding).
- **People tab**: placeholder (“Coming soon”).

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
    - `src/app/(tabs)/moments/[clusterId].tsx` (hidden from tab bar)
    - `src/app/(tabs)/photo/[assetId].tsx` (hidden from tab bar)
    - `src/app/(tabs)/utilities.tsx`
    - `src/app/(tabs)/people.tsx` (placeholder)
    - `src/app/(tabs)/places.tsx`
    - `src/app/(tabs)/places/[placeId].tsx` (hidden from tab bar)

Tab bar icons:

- Tab icons are configured in `src/app/(tabs)/_layout.tsx` using the app's `Icon` component.
- Icon assets are registered in `src/components/Icon.tsx` (`moments`, `utilities`, `people`, `places`).

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
- `lat?: number` — optional latitude (enriched via `MediaLibrary.getAssetInfoAsync`)
- `lon?: number` — optional longitude (enriched via `MediaLibrary.getAssetInfoAsync`)

Note: at the moment `ts` is taken from `MediaLibrary.Asset.creationTime` (see below).

### `MomentCluster`

- `id: string` — currently derived from start/end/count: `${startTs}-${endTs}-${assetIds.length}`
- `startTs: number`
- `endTs: number`
- `coverAssetId: string` — currently middle photo of the cluster
- `assetIds: string[]`

### `PlaceCluster`

- `id: string` — currently derived from start/end/count: `${startTs}-${endTs}-${assetIds.length}`
- `startTs: number`
- `endTs: number`
- `coverAssetId: string` — currently middle photo of the cluster
- `assetIds: string[]`
- `lat: number` — cluster centroid latitude
- `lon: number` — cluster centroid longitude
- `name?: string` — human-readable place label (derived offline)

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
- `photoClusters.places.v1`
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

- `loadCachedPlacesState()`
  - returns cached `{ assetIndex, places, lastSyncTs }`.

- `refreshPlacesState(options?: { includeScreenshots?: boolean })`
  - requests permission
  - loads cached `assetIndex` (refreshes moments first if empty)
  - enriches the asset index with GPS location (bounded per-asset lookups via `MediaLibrary.getAssetInfoAsync`)
  - calls `clusterPlaces(enriched.assetIndex, { radiusKm, includeScreenshots })`
  - derives `PlaceCluster.name` locally using `offline-geocode-city` (`getNearestCity(lat, lon)`)
  - persists `places`, `lastSyncTs` (and persists updated `assetIndex` if GPS enrichment changed it)

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

## Clustering algorithm (Places)

Implemented in `src/services/photoClustering.ts`.

### Inputs

- `assets: AssetIndexItem[]` (only assets that have `lat` and `lon` participate)
- `options: { radiusKm: number; includeScreenshots: boolean }`

### Steps

1. Filter screenshots out unless `includeScreenshots` is true.
2. Filter to assets with valid GPS coordinates.
3. Sort ascending by `ts`.
4. Maintain a running cluster centroid.
5. Start a new cluster only when the next asset is further than `radiusKm` from the current centroid.
6. Convert each cluster into a `PlaceCluster`:
   - `startTs` / `endTs` from the first/last asset timestamps
   - `coverAssetId` = middle asset’s id
   - `lat` / `lon` = centroid

Notes:

- Places clustering is intentionally location-only; timestamps do not affect cluster boundaries.

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
- tap navigates to the Moment detail route: `/(tabs)/moments/[clusterId]`

### Moment detail screen

Implemented in `src/app/(tabs)/moments/[clusterId].tsx`.

- Displays a 3-column grid of the cluster's assets.
- Tapping an asset navigates to `/(tabs)/photo/[assetId]`.
- The header title uses the cluster date/time formatting rules.
- The back button uses `PressableIcon` and includes horizontal padding.
- The grid pads the last row with invisible placeholder items so when the last row has 2 items they appear left + center (empty on the right).

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
- The grid pads the last row with invisible placeholder items so when the last row has 2 items they appear left + center (empty on the right).
- Tapping an asset navigates to `/(tabs)/photo/[assetId]`.

---

## Photo viewer (single asset)

Implemented in `src/app/(tabs)/photo/[assetId].tsx`.

- Full-screen viewer with a black background and `resizeMode="contain"`.
- Loads the asset by `assetId` from the cached MMKV state (`loadCachedMomentsState()`).
- Handles missing assets gracefully (e.g. cache refreshed/cleared).
- Uses a transparent header with a white title and white back button.
- The bottom tab bar is hidden for this route via tab configuration.

System bars:

- `Screen` supports `systemBarStyle` and passes it through to `react-native-edge-to-edge` `SystemBars`.
- The photo viewer sets `systemBarStyle` to light when focused (and dark otherwise) to keep status bar content readable.

---

## Places UI

Implemented in:

- `src/app/(tabs)/places.tsx` (list)
- `src/app/(tabs)/places/[placeId].tsx` (detail grid)

### Data flow

- On initial render:
  - loads cached state (`loadCachedPlacesState()`)
- On mount:
  - calls `refreshPlacesState({ includeScreenshots: false })`
  - updates:
    - `clusters`
    - `assetUriById` map for rendering cover thumbnails

### List item rendering

- shows cover thumbnail from `assetUriById[coverAssetId]`
- shows title + photo count
- title format is location-first (derived `PlaceCluster.name`, with coordinates as fallback)
- tap navigates to the place detail route: `/(tabs)/places/[placeId]`

### Place detail screen

- Displays a 3-column grid of the cluster's assets.
- Tapping an asset navigates to `/(tabs)/photo/[assetId]`.
- Header title includes the location label first, then date/time range.
- The grid pads the last row with invisible placeholder items so when the last row has 2 items they appear left + center (empty on the right).

---

## People tab

- `src/app/(tabs)/people.tsx` — placeholder

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
- Photo viewer routing is implemented within the tab navigator; back behavior depends on the navigation stack state.
- No background refresh scheduling yet (currently refreshes on screen mount).
- No near-duplicate/burst stacking yet.
- Screenshot detection is best-effort; iOS primarily uses `mediaSubtypes: ["screenshot"]` with smart-album and filename fallbacks.
- Places location enrichment uses per-asset `getAssetInfoAsync` calls and is bounded for performance.

---

## Where to extend next (suggested)

- Improve photo viewer navigation UX (e.g. modal presentation, swipe-to-dismiss, deterministic return-to behavior).
- Add manual split/merge (high UX value).
