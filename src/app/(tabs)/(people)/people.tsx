import { View, ViewStyle } from "react-native"
import { Stack } from "expo-router"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"

export default function PeopleRoute() {
  return (
    <Screen preset="fixed" contentContainerStyle={$container}>
      <Stack.Screen options={{ title: "People" }} />

      <Text text="Coming soon" />
      <View style={$flex} />
    </Screen>
  )
}

const $container: ViewStyle = { flex: 1, paddingHorizontal: 16, paddingTop: 12 }
const $flex: ViewStyle = { flex: 1 }
