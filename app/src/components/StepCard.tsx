import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { encodeCheckIn, sendViaRelay } from "../chain/orderActions";
import { useChangaBySpec } from "../data/useChangas";
import { useOrder } from "../data/useOrder";
import { EvidenceItem } from "../data/useOrder";
import { useCoveredRequirements, useEvidence } from "../evidence/EvidenceSection";
import { t } from "../i18n";
import { roleOf, viewFor } from "../lib/actions";
import { payeeCurrent, payeeSteps, payerCurrent, payerSteps } from "../lib/journey";
import { relayDepsFor } from "../lib/relayHelpers";
import { useRunAction } from "../lib/useRunAction";
import { useSession } from "../session/SessionProvider";
import { Button } from "./ui";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { colors, spacing, text } from "../theme";

// El paso en el que está el trabajo, dentro del chat, con un acceso rápido para avanzar sin cambiar de pantalla.
// Usa la misma cuenta que el detalle del trabajo, así que los dos siempre marcan el mismo paso.
export function StepCard({ orderId, applicant }: { orderId: number; applicant: string }) {
  const { api, address } = useSession();
  const order = useOrder(orderId);
  const evidence = useEvidence(orderId);
  const changa = useChangaBySpec(order.data?.specHash ?? "0x");
  const requirements = changa.data?.spec.evidence ?? [];
  const covered = useCoveredRequirements((evidence.data ?? []) as EvidenceItem[], requirements.length);
  const { run, busy } = useRunAction();
  const state = order.data;
  if (!state || !address || state.payee.toLowerCase() !== applicant.toLowerCase()) return null;

  const role = roleOf(state, address);
  const view = viewFor(state.status, role);
  const open = () => router.push({ pathname: "/order/[orderId]", params: { orderId: String(orderId) } });
  const j = t.journey;
  const presencial = state.modality === 0;
  const arrived = !presencial || state.checkedInAt > 0;
  const ready = requirements.length > 0 ? covered.size >= requirements.length : (evidence.data ?? []).length > 0;
  const arrive = () => run(() => sendViaRelay(relayDepsFor(api, address), encodeCheckIn(BigInt(orderId))), { success: t.order.arrivedDone, successIcon: "pin", failure: t.order.finishFailed, invalidate: [["order", orderId]] });

  let label = "";
  let hint = "";
  let position = "";
  let action: { label: string; icon: "pin" | "camera" | "check" | "briefcase"; onPress: () => void; primary: boolean } | null = null;

  if (state.hasMilestones || state.isGroup) {
    label = t.chat.stepOpenJob;
    action = { label: t.mine.openOrder, icon: "briefcase", onPress: open, primary: true };
  } else if (role === "payee" && (view === "worker-working" || view === "worker-waiting-review" || view === "settled")) {
    const steps = payeeSteps(presencial);
    const current = payeeCurrent({ view, presencial, arrived, ready });
    const key = steps[current];
    position = key ? `${current + 1}/${steps.length}` : "";
    if (!key) label = j.payee.review.label;
    else {
      label = j.payee[key].label;
      hint = j.payee[key].hint;
    }
    if (key === "arrive") action = { label: t.order.arrived, icon: "pin", onPress: () => void arrive(), primary: true };
    else if (key === "work") action = { label: t.chat.stepGoEvidence, icon: "camera", onPress: open, primary: true };
    else if (key === "finish") action = { label: t.chat.stepGoFinish, icon: "check", onPress: open, primary: true };
    else action = { label: t.mine.openOrder, icon: "briefcase", onPress: open, primary: false };
    if (view === "settled") {
      label = t.order.released;
      hint = "";
      position = "";
      action = null;
    }
  } else if (role === "payer" && (view === "payer-waiting-work" || view === "payer-reviewing" || view === "settled")) {
    const steps = payerSteps();
    const current = payerCurrent(view);
    const key = steps[current];
    position = key ? `${current + 1}/${steps.length}` : "";
    if (view === "settled") label = t.order.released;
    else if (key) {
      label = j.payer[key].label;
      hint = j.payer[key].hint;
    }
    action = view === "payer-reviewing" ? { label: t.chat.stepReview, icon: "check", onPress: open, primary: true } : view === "payer-waiting-work" ? { label: t.mine.openOrder, icon: "briefcase", onPress: open, primary: false } : null;
  } else {
    return null;
  }

  return (
    <Card gap="sm">
      <View style={styles.head}>
        <Icon name="check" size={20} color={colors.brick} />
        <Text style={text.label}>{position ? `${t.chat.stepNow} · ${t.chat.stepOf.replace("{n}", position)}` : t.chat.stepNow}</Text>
      </View>
      <Text style={text.subtitle}>{label}</Text>
      {hint ? <Text style={text.secondary}>{hint}</Text> : null}
      {action ? <Button label={action.label} icon={action.icon} variant={action.primary ? "primary" : "ghost"} onPress={action.onPress} loading={busy && action.icon === "pin"} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
});
