import { Tabs } from "expo-router";
import { t } from "../../i18n";
import { colors, fonts } from "../../theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brick,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
      }}
    >
      <Tabs.Screen name="map" options={{ title: t.tabs.map }} />
      <Tabs.Screen name="my-changas" options={{ title: t.tabs.myChangas }} />
      <Tabs.Screen name="messages" options={{ title: t.tabs.messages }} />
      <Tabs.Screen name="profile" options={{ title: t.tabs.profile }} />
    </Tabs>
  );
}
