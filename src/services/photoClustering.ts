export type AssetIndexItem = {
  id: string
  ts: number
  uri: string
  w: number
  h: number
  isScreenshot?: boolean
}

export type MomentCluster = {
  id: string
  startTs: number
  endTs: number
  coverAssetId: string
  assetIds: string[]
}

export type ClusterOptions = {
  sessionGapMinutes: number
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
