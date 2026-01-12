import { Tabs } from "expo-router"

import { Icon } from "@/components/Icon"
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
      <Tabs.Screen
        name="moments"
        options={{
          title: "Moments",
          tabBarIcon: ({ color, size }) => <Icon icon="moments" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="moments/[clusterId]" options={{ href: null, title: "Moment" }} />
      <Tabs.Screen
        name="photo/[assetId]"
        options={{
          href: null,
          title: "Photo",
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="utilities"
        options={{
          title: "Utilities",
          tabBarIcon: ({ color, size }) => <Icon icon="utilities" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: "People",
          tabBarIcon: ({ color, size }) => <Icon icon="people" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="places"
        options={{
          title: "Places",
          tabBarIcon: ({ color, size }) => <Icon icon="places" color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
