import { StyleSheet, Text, View } from "react-native";
import type { PublicProfile } from "../api/types";
import { t } from "../i18n";
import { text } from "../theme";
import { Card } from "./Card";
import { Secondary } from "./ui";

// El historial de una persona: calificación, trabajos cerrados y reclamos. Lo ve ella en su perfil y los demás en el suyo.
export function HistoryCard({ stats, title }: { stats: NonNullable<PublicProfile["stats"]>; title?: string }) {
  return (
    <Card gap="sm">
      <Text style={text.label}>{title ?? t.publicProfile.history}</Text>
      <View style={styles.stat}>
        <Text style={text.body}>{t.publicProfile.rating}</Text>
        <Text style={text.subtitle}>{stats.rating !== null ? `★ ${stats.rating.toFixed(1)}` : "-"}</Text>
      </View>
      <Secondary>{stats.rating !== null ? t.publicProfile.ratingCount.replace("{count}", String(stats.ratings)) : t.publicProfile.ratingNone}</Secondary>
      <View style={styles.stat}>
        <Text style={text.body}>{t.publicProfile.doneAsPayee}</Text>
        <Text style={text.subtitle}>{stats.doneAsPayee}</Text>
      </View>
      <View style={styles.stat}>
        <Text style={text.body}>{t.publicProfile.doneAsPayer}</Text>
        <Text style={text.subtitle}>{stats.doneAsPayer}</Text>
      </View>
      <View style={styles.stat}>
        <Text style={text.body}>{t.publicProfile.disputed}</Text>
        <Text style={text.subtitle}>{stats.disputed}</Text>
      </View>
      {stats.doneAsPayee + stats.doneAsPayer === 0 ? <Secondary>{t.publicProfile.newcomer}</Secondary> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  stat: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
