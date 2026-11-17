import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Alert, StyleSheet, Text, View } from "react-native";
import type { PublicProfile } from "../api/types";
import { Card } from "../components/Card";
import { HistoryCard } from "../components/HistoryCard";
import { ReceiptsCard } from "../components/ReceiptsCard";
import { useToast } from "../components/Toast";
import { Button, Screen, Secondary, Title } from "../components/ui";
import { formatMonthYear } from "../lib/format";
import { API_URL } from "../config";
import { t } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { colors, radius, spacing, text } from "../theme";

export default function PublicProfileScreen() {
  const { address } = useLocalSearchParams<{ address: string }>();
  const { api, address: me } = useSession();
  const profile = useQuery({ queryKey: ["profile", address], queryFn: async () => (await api.get<{ profile: PublicProfile }>(`/profiles/${address}`)).profile });

  const queryClient = useQueryClient();
  const toast = useToast();
  const blocks = useQuery({ queryKey: ["blocks"], queryFn: async () => (await api.get<{ blocks: { address: string }[] }>("/me/blocks")).blocks });
  const isBlocked = (blocks.data ?? []).some((entry) => entry.address.toLowerCase() === String(address).toLowerCase());
  const toggleBlock = async () => {
    try {
      if (isBlocked) await api.send("DELETE", `/me/blocks/${address}`);
      else await api.send("POST", "/me/blocks", { address: String(address) });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["blocks"] }), queryClient.invalidateQueries({ queryKey: ["applications"] }), queryClient.invalidateQueries({ queryKey: ["chats"] })]);
      toast({ text: isBlocked ? t.person.done.unblock : t.person.done.block, tone: "success" });
    } catch {
      toast({ text: t.person.failed, tone: "error" });
    }
  };
  const askBlock = () =>
    isBlocked
      ? void toggleBlock()
      : Alert.alert(t.person.blockTitle, t.person.blockBody, [{ text: t.common.cancel, style: "cancel" }, { text: t.person.confirm, style: "destructive", onPress: () => void toggleBlock() }]);

  if (!profile.data) {
    return (
      <Screen>
        <Secondary>{profile.isError ? t.detail.notFound : t.common.loading}</Secondary>
      </Screen>
    );
  }
  const data = profile.data;
  return (
    <Screen footer={
        me && me.toLowerCase() !== String(address).toLowerCase() ? (
          <>
            <Button label={isBlocked ? t.person.unblock : t.person.block} icon="block" variant="ghost" onPress={askBlock} />
            <Button label={t.report.user} icon="flag" variant="ghost" onPress={() => router.push({ pathname: "/report/[kind]", params: { kind: "user", target: String(address) } })} />
          </>
        ) : null
      }>
      <View style={styles.header}>
        {data.photo ? <Image source={{ uri: `${API_URL}${data.photo.url}` }} style={styles.photo} /> : <View style={[styles.photo, styles.empty]} />}
        <View style={{ flex: 1 }}>
          <Title>{data.name}</Title>
          <Text style={text.secondary}>{data.verified ? t.me.verified : t.me.notVerified}</Text>
        </View>
      </View>
      {data.createdAt ? <Secondary>{t.publicProfile.since.replace("{date}", formatMonthYear(data.createdAt))}</Secondary> : null}
      {data.stats ? <HistoryCard stats={data.stats} /> : null}
      <ReceiptsCard address={data.address} count={data.receiptsCount ?? 0} />
      {data.categories && data.categories.length > 0 ? (
        <Card gap="xs">
          <Text style={text.label}>{t.publicProfile.categories}</Text>
          <Text style={text.body}>{data.categories.map((category) => t.publish.categories[category]).filter(Boolean).join(" · ")}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stat: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  header: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  photo: { width: 72, height: 72, borderRadius: radius.pill },
  empty: { backgroundColor: colors.map },
});
