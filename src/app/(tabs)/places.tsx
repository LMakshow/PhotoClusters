import { ViewStyle } from "react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"

export default function PlacesRoute() {
  return (
    <Screen preset="fixed" contentContainerStyle={$container}>
      <Text preset="heading" text="Places" />
      <Text text="Coming soon" />
    </Screen>
  )
}

const $container: ViewStyle = { flex: 1, paddingHorizontal: 16, paddingTop: 12 }
