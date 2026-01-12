import { Tabs } from "expo-router"

import { useAppTheme } from "@/theme/context"

export default function TabsLayout() {
  const { theme } = useAppTheme()

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: theme.colors.text,
      }}
    >
      <Tabs.Screen name="moments" options={{ title: "Moments" }} />
      <Tabs.Screen name="utilities" options={{ title: "Utilities" }} />
      <Tabs.Screen name="people" options={{ title: "People" }} />
      <Tabs.Screen name="places" options={{ title: "Places" }} />
    </Tabs>
  )
}
