import { useMemo } from "react"
import { FlatList, Image, ImageStyle, Pressable, View, ViewStyle } from "react-native"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { format, isSameDay } from "date-fns"

import { PressableIcon } from "@/components/Icon"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { AssetIndexItem, MomentCluster } from "@/services/photoClustering"
import { loadCachedMomentsState } from "@/services/photoLibrary"

export default function MomentDetailRoute() {
  const { clusterId } = useLocalSearchParams<{ clusterId: string }>()
  const router = useRouter()

  const { cluster, assets } = useMemo(() => {
    const cached = loadCachedMomentsState()

    const foundCluster = cached.moments.find((c) => c.id === clusterId) ?? null

    if (!foundCluster) {
      return { cluster: null as MomentCluster | null, assets: [] as AssetIndexItem[] }
    }

    const byId: Record<string, AssetIndexItem> = {}
    for (const a of cached.assetIndex) byId[a.id] = a

    const clusterAssets = foundCluster.assetIds.map((id) => byId[id]).filter(Boolean)

    return { cluster: foundCluster, assets: clusterAssets }
  }, [clusterId])

  const headerTitle = useMemo(() => {
    if (!cluster) return "Moment"
    return formatMomentHeaderTitle(cluster)
  }, [cluster])

  const gridData = useMemo(() => {
    const numColumns = 3
    const remainder = assets.length % numColumns
    if (remainder === 0) return assets as MomentGridItem[]

    const padded = [...assets] as MomentGridItem[]
    const toAdd = numColumns - remainder
    for (let i = 0; i < toAdd; i++) {
      padded.push({ id: `__empty__-${assets.length + i}`, __empty: true })
    }
    return padded
  }, [assets])

  if (!cluster) {
    return (
      <>
        <Stack.Screen
          options={{
            title: headerTitle,
            headerLeft: () => (
              <PressableIcon
                icon="back"
                onPress={() => router.back()}
                containerStyle={$backButton}
              />
            ),
          }}
        />

        <Screen preset="fixed" contentContainerStyle={$container}>
          <Text text="This moment is not available (cache was refreshed or cleared)." />
        </Screen>
      </>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: headerTitle,
          headerLeft: () => (
            <PressableIcon icon="back" onPress={() => router.back()} containerStyle={$backButton} />
          ),
        }}
      />

      <Screen preset="fixed" contentContainerStyle={$container}>
        <Text text={`${assets.length} photos`} />

        <FlatList
          data={gridData}
          keyExtractor={(a) => a.id}
          numColumns={3}
          contentContainerStyle={$grid}
          columnWrapperStyle={$row}
          renderItem={({ item }) => {
            if ("__empty" in item) {
              return <View style={[$cell, $invisible]} />
            }

            return (
              <Pressable
                style={$cell}
                onPress={() => {
                  router.push(`/(tabs)/photo/${encodeURIComponent(item.id)}`)
                }}
              >
                <Image source={{ uri: item.uri }} style={$img} />
              </Pressable>
            )
          }}
        />
      </Screen>
    </>
  )
}

function formatMomentHeaderTitle(cluster: MomentCluster): string {
  const start = new Date(cluster.startTs)
  const end = new Date(cluster.endTs)

  const baseDate = format(start, "MMM d, yyyy")

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

const $grid: ViewStyle = { paddingTop: 12, paddingBottom: 24 }

const $row: ViewStyle = { justifyContent: "space-between" }

const $cell: ViewStyle = {
  width: "32%",
  aspectRatio: 1,
  marginBottom: 8,
  borderRadius: 10,
  overflow: "hidden",
}

const $img: ImageStyle = { width: "100%", height: "100%" }

const $invisible: ViewStyle = { opacity: 0 }

type MomentGridItem = AssetIndexItem | { id: string; __empty: true }

const $backButton: ViewStyle = {
  paddingHorizontal: 12,
}
