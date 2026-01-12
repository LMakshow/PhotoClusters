import { useEffect, useMemo, useState } from "react"
import { FlatList, Image, ImageStyle, Pressable, View, ViewStyle } from "react-native"
import { useRouter } from "expo-router"
import { format, isSameDay } from "date-fns"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { MomentCluster } from "@/services/photoClustering"
import { loadCachedMomentsState, refreshMomentsState } from "@/services/photoLibrary"
import { useAppTheme } from "@/theme/context"

export default function MomentsRoute() {
  const { themed, theme } = useAppTheme()
  const router = useRouter()

  const [clusters, setClusters] = useState<MomentCluster[]>(() => loadCachedMomentsState().moments)
  const [assetUriById, setAssetUriById] = useState<Record<string, string>>(() => {
    const { assetIndex } = loadCachedMomentsState()
    const map: Record<string, string> = {}
    for (const a of assetIndex) map[a.id] = a.uri
    return map
  })
  const [status, setStatus] = useState<"idle" | "loading" | "denied" | "error">("idle")

  useEffect(() => {
    let cancelled = false

    setStatus("loading")
    refreshMomentsState({ includeScreenshots: false })
      .then((s) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        for (const a of s.assetIndex) map[a.id] = a.uri
        setAssetUriById(map)
        setClusters(s.moments)
        setStatus("idle")
      })
      .catch(() => {
        if (cancelled) return
        setStatus("error")
      })

    return () => {
      cancelled = true
    }
  }, [])

  const headerText = useMemo(() => {
    switch (status) {
      case "loading":
        return "Indexing your library…"
      case "error":
        return "Could not load your library"
      default:
        return "Moments"
    }
  }, [status])

  const clusterCountByDayKey = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of clusters) {
      const dayKey = format(new Date(c.startTs), "yyyy-MM-dd")
      counts[dayKey] = (counts[dayKey] ?? 0) + 1
    }
    return counts
  }, [clusters])

  return (
    <Screen preset="fixed" contentContainerStyle={themed($container)}>
      <Text preset="heading" text={headerText} />

      <FlatList
        data={clusters}
        keyExtractor={(c) => c.id}
        contentContainerStyle={themed($listContent)}
        renderItem={({ item }) => {
          const coverUri = assetUriById[item.coverAssetId]
          return (
            <Pressable
              style={themed($row)}
              onPress={() => {
                router.push(`/(tabs)/moments/${encodeURIComponent(item.id)}`)
              }}
            >
              <View style={themed($thumb)}>
                {coverUri ? (
                  <Image source={{ uri: coverUri }} style={themed($thumbImage)} />
                ) : (
                  <View style={[themed($thumbImage), { backgroundColor: theme.colors.border }]} />
                )}
              </View>

              <View style={themed($meta)}>
                <Text preset="bold" text={formatMomentTitle(item, clusterCountByDayKey)} />
                <Text text={`${item.assetIds.length} photos`} />
              </View>
            </Pressable>
          )
        }}
      />
    </Screen>
  )
}

function formatMomentTitle(
  cluster: MomentCluster,
  clusterCountByDayKey: Record<string, number>,
): string {
  const start = new Date(cluster.startTs)
  const end = new Date(cluster.endTs)

  const dayKey = format(start, "yyyy-MM-dd")
  const shouldShowTime = (clusterCountByDayKey[dayKey] ?? 0) >= 2
  const baseDate = format(start, "MMM d, yyyy")

  if (!shouldShowTime) return baseDate

  const durationMs = Math.max(0, end.getTime() - start.getTime())
  const shortDuration = durationMs <= 10 * 60 * 1000

  if (shortDuration) {
    return `${baseDate} • ${format(start, "HH:mm")}`
  }

  if (isSameDay(start, end)) {
    return `${baseDate} • ${format(start, "HH:mm")}–${format(end, "HH:mm")}`
  }

  return `${baseDate} • ${format(start, "HH:mm")}–${format(end, "MMM d, HH:mm")}`
}

const $container: ViewStyle = { flex: 1, paddingHorizontal: 16, paddingTop: 12 }

const $listContent: ViewStyle = { paddingTop: 12, paddingBottom: 24 }

const $row: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  paddingVertical: 10,
}

const $thumb: ViewStyle = {
  width: 56,
  height: 56,
  borderRadius: 12,
  overflow: "hidden",
  marginRight: 12,
}

const $thumbImage: ImageStyle = {
  width: "100%",
  height: "100%",
}

const $meta: ViewStyle = { flex: 1 }
