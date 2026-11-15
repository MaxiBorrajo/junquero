import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import type { PublicProfile } from "../api/types";
import { Card } from "../components/Card";
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

  if (!profile.data) {
    return (
      <Screen>
        <Secondary>{profile.isError ? t.detail.notFound : t.common.loading}</Secondary>
      </Screen>
    );
  }
  const data = profile.data;
  return (
    <Screen footer={me && me.toLowerCase() !== String(address).toLowerCase() ? <Button label={t.report.user} icon="flag" variant="ghost" onPress={() => router.push({ pathname: "/report/[kind]", params: { kind: "user", target: String(address) } })} /> : null}>
      <View style={styles.header}>
        {data.photo ? <Image source={{ uri: `${API_URL}${data.photo.url}` }} style={styles.photo} /> : <View style={[styles.photo, styles.empty]} />}
        <View style={{ flex: 1 }}>
          <Title>{data.name}</Title>
          <Text style={text.secondary}>{data.verified ? t.me.verified : t.me.notVerified}</Text>
        </View>
      </View>
      {data.createdAt ? <Secondary>{t.publicProfile.since.replace("{date}", formatMonthYear(data.createdAt))}</Secondary> : null}
      {data.stats ? (
        <Card gap="sm">
          <Text style={text.label}>{t.publicProfile.history}</Text>
          <View style={styles.stat}>
            <Text style={text.body}>{t.publicProfile.rating}</Text>
            <Text style={text.subtitle}>{data.stats.rating !== null ? `★ ${data.stats.rating.toFixed(1)}` : "-"}</Text>
          </View>
          <Secondary>{data.stats.rating !== null ? t.publicProfile.ratingCount.replace("{count}", String(data.stats.ratings)) : t.publicProfile.ratingNone}</Secondary>
          <View style={styles.stat}>
            <Text style={text.body}>{t.publicProfile.doneAsPayee}</Text>
            <Text style={text.subtitle}>{data.stats.doneAsPayee}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={text.body}>{t.publicProfile.doneAsPayer}</Text>
            <Text style={text.subtitle}>{data.stats.doneAsPayer}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={text.body}>{t.publicProfile.disputed}</Text>
            <Text style={text.subtitle}>{data.stats.disputed}</Text>
          </View>
          {data.stats.doneAsPayee + data.stats.doneAsPayer === 0 ? <Secondary>{t.publicProfile.newcomer}</Secondary> : null}
        </Card>
      ) : null}
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
