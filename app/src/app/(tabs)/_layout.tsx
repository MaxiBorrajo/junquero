import type { ColorValue } from "react-native";
import { Tabs } from "expo-router";
import { Icon, type IconName } from "../../components/Icon";
import { Logo } from "../../components/Logo";
import { useQueries } from "@tanstack/react-query";
import { useEffect } from "react";
import { phaseView } from "../../chain/jury";
import { readJurorCase } from "../../chain/reader";
import { fetchCase } from "../../chain/serverReads";
import { seedNeedsAction, voteNeedsAction } from "../../jury/seedAction";
import { seedQueryOptions } from "../../jury/seedState";
import { useSession } from "../../session/SessionProvider";
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
  const { api, address } = useSession();
  const openCases = useMyCases().data?.openForJury ?? [];
  // El número de Reclamos cuenta solo los que hay algo para hacer ahora (anotarse o revelar), no todos los que siguen sin sorteo.
  const seeds = useQueries({
    queries: openCases.map((item) => ({ ...seedQueryOptions(api, address as `0x${string}`, item.caseId), enabled: Boolean(address), staleTime: 30_000 })),
  });
  const now = Math.floor(Date.now() / 1000);
  // El número de Mis casos cuenta los casos donde me sortearon y me toca votar o mostrar mi voto ahora.
  const mine = useQueries({
    queries: (useMyCases().data?.asJuror ?? []).map((item) => ({
      queryKey: ["jury-todo", item.caseId, address] as const,
      enabled: Boolean(address),
      staleTime: 30_000,
      refetchInterval: 60_000,
      queryFn: async () => {
        const { snapshot } = await fetchCase(api, item.caseId);
        const juror = await readJurorCase(item.caseId, address as `0x${string}`);
        return voteNeedsAction(phaseView(snapshot, Math.floor(Date.now() / 1000)), juror);
      },
    })),
  });
  const myCasesTodo = mine.filter((query) => query.data === true).length;
  const openForJury = seeds.filter((query) => seedNeedsAction(query.data, now)).length;
  useEffect(() => {
    void loadViewMode(address);
  }, [address]);
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
      <Tabs.Screen
        name="jury-mine"
        options={{ ...tab(t.tabs.juryMine, "briefcase"), ...hide(asJury), tabBarBadge: myCasesTodo > 0 ? myCasesTodo : undefined, tabBarBadgeStyle: { backgroundColor: colors.brick, color: colors.white, fontFamily: fonts.bold } }}
      />
      <Tabs.Screen name="jury-stake" options={{ ...tab(t.tabs.juryStake, "wallet"), ...hide(asJury) }} />
      <Tabs.Screen name="profile" options={{ title: t.tabs.profile, tabBarIcon: ({ focused }) => <Logo size={30} outline={!focused} color={focused ? colors.brick : colors.muted} /> }} />
    </Tabs>
  );
}
