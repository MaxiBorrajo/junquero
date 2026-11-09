import type { ColorValue } from "react-native";
import { Tabs } from "expo-router";
import { Icon, type IconName } from "../../components/Icon";
import { t } from "../../i18n";
import { colors, fonts } from "../../theme";

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color }: { color: ColorValue }) => <Icon name={icon} size={24} color={color} />,
});

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
      <Tabs.Screen name="map" options={tab(t.tabs.map, "map")} />
      <Tabs.Screen name="my-changas" options={tab(t.tabs.myChangas, "briefcase")} />
      <Tabs.Screen name="messages" options={tab(t.tabs.messages, "message")} />
      <Tabs.Screen name="profile" options={tab(t.tabs.profile, "bird")} />
    </Tabs>
  );
}
