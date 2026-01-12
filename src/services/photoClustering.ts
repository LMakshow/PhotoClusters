export type AssetIndexItem = {
  id: string
  ts: number
  uri: string
  w: number
  h: number
  isScreenshot?: boolean
  lat?: number
  lon?: number
}

export type MomentCluster = {
  id: string
  startTs: number
  endTs: number
  coverAssetId: string
  assetIds: string[]
}

export type PlaceCluster = {
  id: string
  startTs: number
  endTs: number
  coverAssetId: string
  assetIds: string[]
  lat: number
  lon: number
}

export type ClusterOptions = {
  sessionGapMinutes: number
  includeScreenshots: boolean
}

export type PlaceClusterOptions = {
  radiusKm: number
  maxTravelTimeMinutes: number
  includeScreenshots: boolean
}

export function clusterMoments(assets: AssetIndexItem[], options: ClusterOptions): MomentCluster[] {
  const { sessionGapMinutes, includeScreenshots } = options

  const filtered = includeScreenshots ? assets : assets.filter((a) => !a.isScreenshot)

  const sorted = [...filtered].sort((a, b) => a.ts - b.ts)
  if (sorted.length === 0) return []

  const gapMs = sessionGapMinutes * 60 * 1000

  const clusters: MomentCluster[] = []

  let current: AssetIndexItem[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const next = sorted[i]

    if (next.ts - prev.ts > gapMs) {
      clusters.push(toCluster(current))
      current = [next]
    } else {
      current.push(next)
    }
  }

  if (current.length > 0) {
    clusters.push(toCluster(current))
  }

  return clusters.sort((a, b) => b.startTs - a.startTs)
}

export function clusterPlaces(
  assets: AssetIndexItem[],
  options: PlaceClusterOptions,
): PlaceCluster[] {
  const { radiusKm, maxTravelTimeMinutes, includeScreenshots } = options

  const filtered = (includeScreenshots ? assets : assets.filter((a) => !a.isScreenshot)).filter(
    (a) => typeof a.lat === "number" && typeof a.lon === "number",
  )

  const sorted = [...filtered].sort((a, b) => a.ts - b.ts)
  if (sorted.length === 0) return []

  const maxTravelMs = maxTravelTimeMinutes * 60 * 1000

  const clusters: PlaceCluster[] = []

  let current: AssetIndexItem[] = [sorted[0]]
  let centroid = { lat: sorted[0].lat as number, lon: sorted[0].lon as number }

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const next = sorted[i]

    const nextLat = next.lat as number
    const nextLon = next.lon as number

    const travelMs = next.ts - prev.ts
    const distKm = haversineKm(centroid.lat, centroid.lon, nextLat, nextLon)

    if (travelMs > maxTravelMs || distKm > radiusKm) {
      clusters.push(toPlaceCluster(current, centroid))
      current = [next]
      centroid = { lat: nextLat, lon: nextLon }
    } else {
      current.push(next)
      centroid = recomputeCentroid(current)
    }
  }

  if (current.length > 0) {
    clusters.push(toPlaceCluster(current, centroid))
  }

  return clusters.sort((a, b) => b.startTs - a.startTs)
}

function toCluster(items: AssetIndexItem[]): MomentCluster {
  const startTs = items[0].ts
  const endTs = items[items.length - 1].ts
  const assetIds = items.map((i) => i.id)
  const coverAssetId = items[Math.floor(items.length / 2)].id

  return {
    id: `${startTs}-${endTs}-${assetIds.length}`,
    startTs,
    endTs,
    coverAssetId,
    assetIds,
  }
}

function toPlaceCluster(
  items: AssetIndexItem[],
  centroid: { lat: number; lon: number },
): PlaceCluster {
  const startTs = items[0].ts
  const endTs = items[items.length - 1].ts
  const assetIds = items.map((i) => i.id)
  const coverAssetId = items[Math.floor(items.length / 2)].id

  return {
    id: `${startTs}-${endTs}-${assetIds.length}`,
    startTs,
    endTs,
    coverAssetId,
    assetIds,
    lat: centroid.lat,
    lon: centroid.lon,
  }
}

function recomputeCentroid(items: AssetIndexItem[]): { lat: number; lon: number } {
  let latSum = 0
  let lonSum = 0
  let count = 0

  for (const i of items) {
    if (typeof i.lat !== "number" || typeof i.lon !== "number") continue
    latSum += i.lat
    lonSum += i.lon
    count++
  }

  if (count === 0) {
    return { lat: 0, lon: 0 }
  }

  return { lat: latSum / count, lon: lonSum / count }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180

  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
