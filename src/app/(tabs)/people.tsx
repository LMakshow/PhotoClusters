import { View, ViewStyle } from "react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"

export default function PeopleRoute() {
  return (
    <Screen preset="fixed" contentContainerStyle={$container}>
      <Text preset="heading" text="People" />
      <Text text="Coming soon" />
      <View style={$flex} />
    </Screen>
  )
}

const $container: ViewStyle = { flex: 1, paddingHorizontal: 16, paddingTop: 12 }
const $flex: ViewStyle = { flex: 1 }
