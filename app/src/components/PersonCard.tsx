import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { usePublicProfile } from "../data/useProfile";
import { t } from "../i18n";
import { Avatar } from "./Avatar";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { colors, spacing, text } from "../theme";

// Quién es la otra persona de un trabajo: foto, nombre y verificación. Al tocarla se abre su perfil con el historial.
export function PersonCard({ address, label, note }: { address: string; label: string; note?: string }) {
  const profile = usePublicProfile(address);
  const data = profile.data;
  return (
    <Card gap="xs" onPress={() => router.push({ pathname: "/profile-public", params: { address } })}>
      <Text style={text.label}>{label}</Text>
      <View style={styles.row}>
        <Avatar profile={data} />
        <View style={{ flex: 1 }}>
          <Text style={text.subtitle}>{data?.name ?? address.slice(0, 8)}</Text>
          <Text style={[text.secondary, { color: colors.brick }]}>{`${data?.verified ? t.received.verified : t.received.unverified} · ${t.received.viewProfile}`}</Text>
        </View>
        <Icon name="chevron" size={20} color={colors.muted} />
      </View>
      {note ? <Text style={[text.secondary, styles.note]}>{note}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  note: { marginTop: spacing.xs },
});
