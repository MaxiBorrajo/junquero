import { StyleSheet, Text, View } from "react-native";
import type { AgreementRecord } from "../api/types";
import { t } from "../i18n";
import { formatDate } from "../lib/format";
import { formatUsdc } from "../lib/money";
import { useAgreementActions } from "../lib/useAgreementActions";
import { Button } from "./ui";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { colors, spacing, text } from "../theme";

// La propuesta de acuerdo, dentro del chat. Quien fue elegido la acepta o la rechaza acá; quien la mandó ve que está esperando y puede cancelarla.
export function AgreementCard({ agreement, role, title, counterpartName }: { agreement: AgreementRecord; role: "owner" | "applicant"; title: string; counterpartName: string }) {
  const actions = useAgreementActions();
  const card = t.agreement.card;
  const sending = agreement.status === "sending";
  return (
    <Card gap="sm" style={styles.card}>
      <View style={styles.head}>
        <Icon name={sending ? "clock" : "check"} size={20} color={colors.brick} />
        <Text style={text.label}>{role === "applicant" ? card.title : card.sent}</Text>
      </View>
      <Text style={text.subtitle}>{`${title} · ${formatUsdc(agreement.price)}`}</Text>
      {sending ? (
        <Text style={text.secondary}>{card.confirming}</Text>
      ) : role === "applicant" ? (
        <>
          <Text style={text.secondary}>{`${t.agreement.summary} ${card.expires.replace("{date}", formatDate(agreement.expiry))}.`}</Text>
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button label={card.reject} icon="close" variant="outline" onPress={() => void actions.reject(agreement)} disabled={actions.busy} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={card.accept} icon="check" onPress={() => void actions.accept(agreement)} loading={actions.busy} />
            </View>
          </View>
        </>
      ) : (
        <>
          <Text style={text.secondary}>{card.waiting.replace("{name}", counterpartName)}</Text>
          <Button label={card.cancel} icon="close" variant="ghost" onPress={() => void actions.cancel(agreement)} disabled={actions.busy} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.sand, borderColor: colors.sand },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm },
});
