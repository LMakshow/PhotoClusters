import { Platform } from "react-native"
import * as MediaLibrary from "expo-media-library"

import { load, save } from "@/utils/storage"

import { AssetIndexItem, ClusterOptions, MomentCluster, clusterMoments } from "./photoClustering"

const STORAGE_KEYS = {
  assetIndex: "photoClusters.assetIndex.v1",
  moments: "photoClusters.moments.v1",
  lastSyncTs: "photoClusters.lastSyncTs.v1",
}

export type MomentsState = {
  assetIndex: AssetIndexItem[]
  moments: MomentCluster[]
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
