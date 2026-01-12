import { useEffect, useMemo, useState } from "react"
import { FlatList, Image, ImageStyle, Pressable, View, ViewStyle } from "react-native"
import { useRouter } from "expo-router"
import { format, isSameDay } from "date-fns"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { PlaceCluster } from "@/services/photoClustering"
import { loadCachedPlacesState, refreshPlacesState } from "@/services/photoLibrary"
import { useAppTheme } from "@/theme/context"

export default function PlacesRoute() {
  const { themed, theme } = useAppTheme()
  const router = useRouter()

  const [clusters, setClusters] = useState<PlaceCluster[]>(() => loadCachedPlacesState().places)
  const [assetUriById, setAssetUriById] = useState<Record<string, string>>(() => {
    const { assetIndex } = loadCachedPlacesState()
    const map: Record<string, string> = {}
    for (const a of assetIndex) map[a.id] = a.uri
    return map
  })
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")

  useEffect(() => {
    let cancelled = false

    setStatus("loading")
    refreshPlacesState({ includeScreenshots: false })
      .then((s) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        for (const a of s.assetIndex) map[a.id] = a.uri
        setAssetUriById(map)
        setClusters(s.places)
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
        return "Places (loading…)"
      case "error":
        return "Places (error)"
      default:
        return "Places"
    }
  }, [status])

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
                router.push(`/(tabs)/places/${encodeURIComponent(item.id)}`)
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
                <Text preset="bold" text={formatPlaceTitle(item)} />
                <Text text={`${item.assetIds.length} photos`} />
              </View>
            </Pressable>
          )
        }}
      />
    </Screen>
  )
}

function formatPlaceTitle(cluster: PlaceCluster): string {
  const start = new Date(cluster.startTs)
  const end = new Date(cluster.endTs)

  const baseDate = format(start, "MMM d, yyyy")

  const coords = `${cluster.lat.toFixed(3)}, ${cluster.lon.toFixed(3)}`

  if (isSameDay(start, end)) {
    return `${baseDate} • ${format(start, "HH:mm")}–${format(end, "HH:mm")} • ${coords}`
  }

  return `${baseDate} • ${format(start, "HH:mm")}–${format(end, "MMM d, HH:mm")} • ${coords}`
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
