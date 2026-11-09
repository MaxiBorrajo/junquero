import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import type { PublicProfile } from "../api/types";
import { Button, Screen, Secondary, Title } from "../components/ui";
import { API_URL } from "../config";
import { t } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { colors, radius, spacing, text } from "../theme";

export default function PublicProfileScreen() {
  const { address } = useLocalSearchParams<{ address: string }>();
  const { api, address: me } = useSession();
  const profile = useQuery({ queryKey: ["profile", address], queryFn: () => api.get<PublicProfile>(`/profiles/${address}`) });

  if (!profile.data) {
    return (
      <Screen>
        <Secondary>{profile.isError ? t.detail.notFound : t.common.loading}</Secondary>
      </Screen>
    );
  }
  const data = profile.data;
  return (
    <Screen footer={me && me.toLowerCase() !== String(address).toLowerCase() ? <Button label={t.report.user} variant="ghost" onPress={() => router.push({ pathname: "/report/[kind]", params: { kind: "user", target: String(address) } })} /> : null}>
      <View style={styles.header}>
        {data.photo ? <Image source={{ uri: `${API_URL}${data.photo.url}` }} style={styles.photo} /> : <View style={[styles.photo, styles.empty]} />}
        <View style={{ flex: 1 }}>
          <Title>{data.name}</Title>
          <Text style={text.secondary}>{data.verified ? t.me.verified : t.me.notVerified}</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  photo: { width: 72, height: 72, borderRadius: radius.pill },
  empty: { backgroundColor: colors.map },
});
