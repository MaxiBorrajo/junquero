import type { ColorValue } from "react-native";
import { Tabs } from "expo-router";
import { Icon, type IconName } from "../../components/Icon";
import { Logo } from "../../components/Logo";
import { useEffect } from "react";
import { useSummary } from "../../data/useSummary";
import { useMyCases } from "../../data/useCases";
import { loadViewMode, useViewMode } from "../../session/viewMode";
import { t } from "../../i18n";
import { colors, fonts } from "../../theme";

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color }: { color: ColorValue }) => <Icon name={icon} size={24} color={color} />,
});

export default function TabsLayout() {
  const unreadChats = useSummary().data?.unreadChats ?? 0;
  const mode = useViewMode();
  const openForJury = useMyCases().data?.openForJury.length ?? 0;
  useEffect(() => {
    void loadViewMode();
  }, []);
  // Una sola barra con las pestañas de las dos vistas: las de la vista que no se usa quedan ocultas (href: null).
  const hide = (visible: boolean) => (visible ? {} : { href: null });
  const asJury = mode === "jury";
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
      <Tabs.Screen name="map" options={{ ...tab(t.tabs.map, "map"), ...hide(!asJury) }} />
      <Tabs.Screen name="my-changas" options={{ ...tab(t.tabs.myChangas, "briefcase"), ...hide(!asJury) }} />
      <Tabs.Screen
        name="messages"
        options={{ ...tab(t.tabs.messages, "message"), ...hide(!asJury), tabBarBadge: unreadChats > 0 ? unreadChats : undefined, tabBarBadgeStyle: { backgroundColor: colors.brick, color: colors.white, fontFamily: fonts.bold } }}
      />
      <Tabs.Screen
        name="jury-open"
        options={{ ...tab(t.tabs.juryOpen, "scale"), ...hide(asJury), tabBarBadge: openForJury > 0 ? openForJury : undefined, tabBarBadgeStyle: { backgroundColor: colors.brick, color: colors.white, fontFamily: fonts.bold } }}
      />
      <Tabs.Screen name="jury-mine" options={{ ...tab(t.tabs.juryMine, "briefcase"), ...hide(asJury) }} />
      <Tabs.Screen name="jury-stake" options={{ ...tab(t.tabs.juryStake, "wallet"), ...hide(asJury) }} />
      <Tabs.Screen name="profile" options={{ title: t.tabs.profile, tabBarIcon: ({ focused }) => <Logo size={30} outline={!focused} color={focused ? colors.brick : colors.muted} /> }} />
    </Tabs>
  );
}
