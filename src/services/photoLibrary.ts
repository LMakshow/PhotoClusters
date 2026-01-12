import { Platform } from "react-native"
import * as MediaLibrary from "expo-media-library"
import { getNearestCity } from "offline-geocode-city"

import { load, save } from "@/utils/storage"

import {
  AssetIndexItem,
  ClusterOptions,
  MomentCluster,
  PlaceCluster,
  clusterMoments,
  clusterPlaces,
} from "./photoClustering"

const STORAGE_KEYS = {
  assetIndex: "photoClusters.assetIndex.v1",
  moments: "photoClusters.moments.v1",
  places: "photoClusters.places.v1",
  lastSyncTs: "photoClusters.lastSyncTs.v1",
}

export type MomentsState = {
  assetIndex: AssetIndexItem[]
  moments: MomentCluster[]
  lastSyncTs: number | null
}

export type PlacesState = {
  assetIndex: AssetIndexItem[]
  places: PlaceCluster[]
  lastSyncTs: number | null
}

export async function requestPhotoPermission(): Promise<{
  granted: boolean
  canAskAgain: boolean
}> {
  const existing = await MediaLibrary.getPermissionsAsync()
  if (existing.granted) return { granted: true, canAskAgain: existing.canAskAgain }

  const req = await MediaLibrary.requestPermissionsAsync()
  return { granted: req.granted, canAskAgain: req.canAskAgain }
}

export function loadCachedMomentsState(): MomentsState {
  return {
    assetIndex: load<AssetIndexItem[]>(STORAGE_KEYS.assetIndex) ?? [],
    moments: load<MomentCluster[]>(STORAGE_KEYS.moments) ?? [],
    lastSyncTs: load<number>(STORAGE_KEYS.lastSyncTs),
  }
}

export function loadCachedPlacesState(): PlacesState {
  const { assetIndex, lastSyncTs } = loadCachedMomentsState()
  return {
    assetIndex,
    places: load<PlaceCluster[]>(STORAGE_KEYS.places) ?? [],
    lastSyncTs,
  }
}

export async function refreshMomentsState(
  options?: Partial<ClusterOptions>,
): Promise<MomentsState> {
  const permission = await requestPhotoPermission()
  if (!permission.granted) {
    return loadCachedMomentsState()
  }

  const { assetIndex, screenshotsSet } = await buildAssetIndex()

  const indexed: AssetIndexItem[] = assetIndex.map((a) => ({
    ...a,
    isScreenshot: screenshotsSet.has(a.id) || a.isScreenshot,
  }))

  const clusterOptions: ClusterOptions = {
    sessionGapMinutes: options?.sessionGapMinutes ?? 60,
    includeScreenshots: options?.includeScreenshots ?? false,
  }

  const moments = clusterMoments(indexed, clusterOptions)
  const lastSyncTs = Date.now()

  save(STORAGE_KEYS.assetIndex, indexed)
  save(STORAGE_KEYS.moments, moments)
  save(STORAGE_KEYS.lastSyncTs, lastSyncTs)

  return {
    assetIndex: indexed,
    moments,
    lastSyncTs,
  }
}

export async function refreshPlacesState(options?: {
  includeScreenshots?: boolean
}): Promise<PlacesState> {
  const permission = await requestPhotoPermission()
  if (!permission.granted) {
    return loadCachedPlacesState()
  }

  const cached = loadCachedMomentsState()
  let assetIndex = cached.assetIndex

  if (assetIndex.length === 0) {
    const refreshed = await refreshMomentsState({ includeScreenshots: true })
    assetIndex = refreshed.assetIndex
  }

  const enriched = await enrichAssetIndexWithLocation(assetIndex)
  if (enriched.didChange) {
    save(STORAGE_KEYS.assetIndex, enriched.assetIndex)
  }

  const places = clusterPlaces(enriched.assetIndex, {
    radiusKm: 0.5,
    includeScreenshots: options?.includeScreenshots ?? false,
  })

  const placesWithNames: PlaceCluster[] = places.map((p) => {
    try {
      const nearest = getNearestCity(p.lat, p.lon)
      const city = nearest?.cityName
      const country = nearest?.countryName

      const name = city && country ? `${city}, ${country}` : city || country
      return name ? { ...p, name } : p
    } catch {
      return p
    }
  })

  const lastSyncTs = Date.now()
  save(STORAGE_KEYS.places, placesWithNames)
  save(STORAGE_KEYS.lastSyncTs, lastSyncTs)

  return {
    assetIndex: enriched.assetIndex,
    places: placesWithNames,
    lastSyncTs,
  }
}

async function buildAssetIndex(): Promise<{
  assetIndex: AssetIndexItem[]
  screenshotsSet: Set<string>
}> {
  const screenshotsSet = await findScreenshotAssetIds()

  const out: AssetIndexItem[] = []

  let after: string | undefined
  let hasNextPage = true

  while (hasNextPage) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: "photo",
      first: 200,
      after,
      sortBy: [MediaLibrary.SortBy.creationTime],
    })

    for (const a of page.assets) {
      out.push({
        id: a.id,
        ts: a.creationTime ?? 0,
        uri: a.uri,
        w: a.width ?? 0,
        h: a.height ?? 0,
        isScreenshot:
          (a.mediaSubtypes?.includes("screenshot") ?? false) ||
          (a.filename?.toLowerCase().includes("screenshot") ?? false),
      })
    }

    hasNextPage = page.hasNextPage
    after = page.endCursor ?? undefined

    if (out.length >= 2000) break
  }

  return { assetIndex: out, screenshotsSet }
}

async function enrichAssetIndexWithLocation(
  assetIndex: AssetIndexItem[],
): Promise<{ assetIndex: AssetIndexItem[]; didChange: boolean }> {
  // Location is available only via AssetInfo, which requires per-asset calls.
  // Keep this bounded so Places doesn't significantly slow down the app.
  const MAX_LOOKUPS = 250

  let didChange = false
  let lookups = 0

  // Prefer newest assets first.
  const updated = [...assetIndex].sort((a, b) => b.ts - a.ts)

  for (let i = 0; i < updated.length; i++) {
    if (lookups >= MAX_LOOKUPS) break

    const item = updated[i]
    if (typeof item.lat === "number" && typeof item.lon === "number") continue

    try {
      const info = await MediaLibrary.getAssetInfoAsync(item.id, {
        shouldDownloadFromNetwork: false,
      })
      lookups++

      const loc = info.location
      if (
        loc &&
        typeof Number(loc.latitude) === "number" &&
        typeof Number(loc.longitude) === "number"
      ) {
        item.lat = Number(loc.latitude)
        item.lon = Number(loc.longitude)
        didChange = true
      }
    } catch {
      lookups++
    }
  }

  // Restore original ordering (ascending by time).
  updated.sort((a, b) => a.ts - b.ts)

  return { assetIndex: updated, didChange }
}

async function findScreenshotAssetIds(): Promise<Set<string>> {
  try {
    // Most reliable on iOS: query PHAssetMediaSubtype.screenshot via mediaSubtypes.
    if (Platform.OS === "ios") {
      const ids = new Set<string>()

      let after: string | undefined
      let hasNextPage = true

      while (hasNextPage) {
        const page = await MediaLibrary.getAssetsAsync({
          mediaType: "photo",
          mediaSubtypes: ["screenshot"],
          first: 200,
          after,
          sortBy: [MediaLibrary.SortBy.creationTime],
        })

        for (const a of page.assets) ids.add(a.id)

        hasNextPage = page.hasNextPage
        after = page.endCursor ?? undefined

        if (ids.size >= 2000) break
      }

      if (ids.size > 0) return ids
    }

    // Fallback: try to find a smart album that represents screenshots.
    const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true })
    const screenshotsAlbum = albums.find((a) => a.title.toLowerCase().includes("screenshot"))

    if (!screenshotsAlbum) return new Set<string>()

    const ids = new Set<string>()

    let after: string | undefined
    let hasNextPage = true

    while (hasNextPage) {
      const page = await MediaLibrary.getAssetsAsync({
        album: screenshotsAlbum,
        first: 200,
        after,
        sortBy: [MediaLibrary.SortBy.creationTime],
      })

      for (const a of page.assets) ids.add(a.id)

      hasNextPage = page.hasNextPage
      after = page.endCursor ?? undefined

      if (ids.size >= 2000) break
    }

    return ids
  } catch {
    return new Set<string>()
  }
}
