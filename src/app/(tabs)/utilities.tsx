import { useEffect, useMemo, useState } from "react"
import { FlatList, Image, ImageStyle, Pressable, View, ViewStyle } from "react-native"
import { useRouter } from "expo-router"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { AssetIndexItem } from "@/services/photoClustering"
import { loadCachedMomentsState, refreshMomentsState } from "@/services/photoLibrary"
import { useAppTheme } from "@/theme/context"

export default function UtilitiesRoute() {
  const { themed, theme } = useAppTheme()
  const router = useRouter()

  const [assets, setAssets] = useState<AssetIndexItem[]>(() => {
    const { assetIndex } = loadCachedMomentsState()
    return assetIndex.filter((a) => !!a.isScreenshot).sort((a, b) => b.ts - a.ts)
  })
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")

  useEffect(() => {
    let cancelled = false

    setStatus("loading")
    refreshMomentsState({ includeScreenshots: true })
      .then((s) => {
        if (cancelled) return
        setAssets(s.assetIndex.filter((a) => !!a.isScreenshot).sort((a, b) => b.ts - a.ts))
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

  const title = useMemo(() => {
    if (status === "loading") return "Utilities (loading…)"
    if (status === "error") return "Utilities (error)"
    return "Utilities"
  }, [status])

  const gridData = useMemo(() => {
    const numColumns = 3
    const remainder = assets.length % numColumns
    if (remainder === 0) return assets as UtilitiesGridItem[]

    const padded = [...assets] as UtilitiesGridItem[]
    const toAdd = numColumns - remainder
    for (let i = 0; i < toAdd; i++) {
      padded.push({ id: `__empty__-${assets.length + i}`, __empty: true })
    }
    return padded
  }, [assets])

  return (
    <Screen preset="fixed" contentContainerStyle={themed($container)}>
      <Text preset="heading" text={title} />
      <Text text={`Screenshots: ${assets.length}`} />

      <FlatList
        data={gridData}
        keyExtractor={(a) => a.id}
        numColumns={3}
        contentContainerStyle={themed($grid)}
        columnWrapperStyle={themed($row)}
        renderItem={({ item }) => {
          if ("__empty" in item) {
            return <View style={themed([$cell, $invisible])} />
          }

          return (
            <Pressable
              style={themed($cell)}
              onPress={() => {
                router.push(`/(tabs)/photo/${encodeURIComponent(item.id)}`)
              }}
            >
              <Image source={{ uri: item.uri }} style={themed($img)} />
            </Pressable>
          )
        }}
      />

      {assets.length === 0 ? (
        <Text
          text="No screenshots found yet. If you just granted permission, wait a moment for indexing."
          style={{ color: theme.colors.textDim }}
        />
      ) : null}
    </Screen>
  )
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

type UtilitiesGridItem = AssetIndexItem | { id: string; __empty: true }
