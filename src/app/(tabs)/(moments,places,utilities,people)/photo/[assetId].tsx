import { useMemo } from "react"
import { Image, ImageStyle, TextStyle, View, ViewStyle } from "react-native"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { useIsFocused } from "@react-navigation/native"

import { PressableIcon } from "@/components/Icon"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { loadCachedMomentsState } from "@/services/photoLibrary"

export default function PhotoRoute() {
  const { assetId } = useLocalSearchParams<{ assetId: string }>()
  const router = useRouter()
  const isFocused = useIsFocused()

  const asset = useMemo(() => {
    const cached = loadCachedMomentsState()
    return cached.assetIndex.find((a) => a.id === assetId) ?? null
  }, [assetId])

  return (
    <>
      <Stack.Screen
        options={{
          title: "Photo",
          headerTransparent: true,
          headerTitleStyle: { color: "white" },
          headerTintColor: "white",
          headerLeft: () => (
            <PressableIcon
              icon="back"
              onPress={() => router.back()}
              containerStyle={$backButton}
              color="white"
            />
          ),
        }}
      />

      <Screen
        preset="fixed"
        contentContainerStyle={$container}
        systemBarStyle={isFocused ? "light" : "dark"}
      >
        {!asset ? (
          <Text text="Photo is not available (cache was refreshed or cleared)." style={$text} />
        ) : (
          <View style={$imageWrap}>
            <Image source={{ uri: asset.uri }} style={$image} resizeMode="contain" />
          </View>
        )}
      </Screen>
    </>
  )
}

const $container: ViewStyle = { flex: 1, backgroundColor: "black" }

const $imageWrap: ViewStyle = { flex: 1 }

const $image: ImageStyle = { width: "100%", height: "100%" }

const $text: TextStyle = { paddingHorizontal: 16, paddingTop: 80 }

const $backButton: ViewStyle = {
  paddingHorizontal: 12,
}
