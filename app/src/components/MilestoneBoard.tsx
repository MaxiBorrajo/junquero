import { useRunAction } from "../lib/useRunAction";
import { useFocusedInterval } from "../lib/useFocusedInterval";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { Changa } from "../api/types";
import { MilestoneStatus, encodeDeclareAbandoned } from "../chain/milestones";
import { sendViaRelay } from "../chain/orderActions";
import { fetchMilestones } from "../chain/serverReads";
import { useDisputedMilestones } from "../data/useDisputedMilestones";
import { useEvidence, useEvidenceByMilestone } from "../evidence/EvidenceSection";
import { t } from "../i18n";
import { allPaid, boardAction } from "../lib/board";
import { formatDate } from "../lib/format";
import { formatUsdc } from "../lib/money";
import { relayDepsFor } from "../lib/relayHelpers";
import { useSession } from "../session/SessionProvider";
import { colors, fonts, radius, spacing, text } from "../theme";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { Journey } from "./Journey";
import { Body, Button, ErrorText, Secondary } from "./ui";

export function MilestoneBoard({ orderId, role, counterpart, changa, payee, deadline, disputed = false }: { orderId: number; role: "payer" | "payee" | "viewer"; counterpart: string; changa: Changa | null; payee: string; deadline: number; disputed?: boolean }) {
  const { api, address } = useSession();
  const board = useQuery({ queryKey: ["milestones", orderId], refetchInterval: useFocusedInterval(30_000), queryFn: () => fetchMilestones(api, orderId) });
  const evidence = useEvidence(orderId);
  const forMilestone = useEvidenceByMilestone(evidence.data ?? []);
  const { run: runAction, busy, error } = useRunAction();
  const disputedBefore = useDisputedMilestones(orderId);
  const goExit = (kind: "terminated" | "abandoned") => router.push({ pathname: "/exit/[orderId]", params: { orderId: String(orderId), kind } });
  if (!board.data || !address) return <Secondary>{t.common.loading}</Secondary>;
  const state = board.data;
  // Con un reclamo abierto en un hito el trabajo queda en pausa (lo decide el contrato): se ve cuál hito está en reclamo y no hay acciones.
  const frozen = state.disputing || disputed;
  const action = frozen ? "none" : boardAction({ next: state.next, count: state.count, milestones: state.milestones }, role);
  const current = state.milestones[state.next];
  const items = forMilestone(state.next);
  const mine = items.filter((item) => item.uploader.toLowerCase() === address.toLowerCase());
  const deps = relayDepsFor(api, address);

  // Los datos del tablero se refrescan solos cuando la red confirma la acción.
  const refresh = [["milestones", orderId], ["order", orderId]] as const;
  const run = (work: () => Promise<string | void>, success: string, icon?: string) =>
    runAction(work, { success, successIcon: icon, failure: t.milestonesBoard.failed, invalidate: refresh });

  const send = (data: `0x${string}`) => () => sendViaRelay(deps, data);
  return (
    <View style={styles.box}>
      <Text style={text.subtitle}>{t.milestonesBoard.title}</Text>
      {frozen ? <Secondary>{t.milestonesBoard.frozenNote.replace("{n}", String(state.disputedIndex + 1))}</Secondary> : null}
      {role !== "viewer" && !allPaid(state.milestones) && !frozen ? (
        <Journey
          title={t.journeyMilestone.title}
          steps={role === "payee" ? [{ key: "work", ...t.journeyMilestone.payee.work }, { key: "deliver", ...t.journeyMilestone.payee.deliver }, { key: "review", ...t.journeyMilestone.payee.review }] : [{ key: "wait", ...t.journeyMilestone.payer.wait }, { key: "review", ...t.journeyMilestone.payer.review }, { key: "approve", ...t.journeyMilestone.payer.approve }]}
          current={role === "payee" ? (action === "wait-review" ? 2 : mine.length === 0 ? 0 : 1) : action === "review" ? 1 : 0}
        />
      ) : null}
      {state.milestones.map((item, index) => {
        const info = changa?.spec.milestones?.[index];
        const isCurrent = index === state.next && !allPaid(state.milestones);
        const chip = chipFor((frozen && index === state.disputedIndex) || (item.status === MilestoneStatus.Paid && disputedBefore.has(index)) ? MilestoneStatus.Disputed : item.status, isCurrent);
        return (
          <Card
            key={index}
            gap="xs"
            style={isCurrent && styles.currentItem}
            onPress={() => router.push({ pathname: "/milestone/[orderId]", params: { orderId: String(orderId), index: String(index), spec: changa?.specHash ?? "", role, counterpart, payee } })}
          >
            <View style={styles.cardHead}>
              <Body style={{ flex: 1 }}>{`${index + 1}. ${info?.name ?? ""}`}</Body>
              <View style={[styles.chip, { backgroundColor: chip.background }]}>
                <Text style={[styles.chipLabel, { color: chip.color }]}>{chip.label}</Text>
              </View>
            </View>
            <View style={styles.cardHead}>
              <Text style={[text.secondary, { flex: 1 }]}>{formatUsdc(item.amount.toString())}</Text>
              <Icon name="chevron" size={18} color={colors.muted} />
            </View>
          </Card>
        );
      })}
      {allPaid(state.milestones) ? <Body>{t.milestonesBoard.allPaid}</Body> : null}

      {!frozen && role === "payer" && state.next < state.count && current?.status !== MilestoneStatus.Delivered ? (
        <>
          {/* Si todavía no se pagó ningún hito se puede cancelar como un trabajo común (más barato que terminar). */}
          {!state.started && changa ? (
            <>
              <Secondary>{t.milestonesBoard.cancelNote}</Secondary>
              <Button label={t.detail.cancelChanga} icon="close" variant="outline" onPress={() => router.push({ pathname: "/cancel/[specHash]", params: { specHash: changa.specHash } })} />
            </>
          ) : null}
          <Button label={t.milestonesBoard.terminate} icon="close" variant="ghost" onPress={() => goExit("terminated")} />
        </>
      ) : null}
      {!frozen && role === "payer" && deadline > 0 && Math.floor(Date.now() / 1000) > deadline && current?.status === MilestoneStatus.Pending ? (
        <Button label={`${t.milestonesBoard.declareAbandoned} (${formatDate(deadline)})`} icon="info" variant="ghost" onPress={() => run(send(encodeDeclareAbandoned(BigInt(orderId))), t.milestonesBoard.abandonedDeclared, "check")} disabled={busy} />
      ) : null}
      {!frozen && role === "payee" && state.next < state.count ? (
        <>
          <Secondary>{t.milestonesBoard.abandonNote}</Secondary>
          <Button label={t.milestonesBoard.abandon} icon="logout" variant="ghost" onPress={() => goExit("abandoned")} />
        </>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

// El estado de cada hito, como una etiqueta: el que toca ahora se marca como actual.
function chipFor(status: number, isCurrent: boolean): { label: string; background: string; color: string } {
  if (status === MilestoneStatus.Paid) return { label: t.milestonesBoard.chip.paid, background: colors.success, color: colors.white };
  if (status === MilestoneStatus.Disputed) return { label: t.milestonesBoard.chip.disputed, background: colors.error, color: colors.white };
  if (status === MilestoneStatus.Delivered) return { label: t.milestonesBoard.chip.delivered, background: colors.sand, color: colors.brick };
  if (isCurrent) return { label: t.milestonesBoard.chip.current, background: colors.brick, color: colors.white };
  return { label: t.milestonesBoard.chip.pending, background: colors.sand, color: colors.muted };
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chip: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  chipLabel: { fontFamily: fonts.medium, fontSize: 12 },
  box: { gap: spacing.sm },
  currentItem: { borderColor: colors.brick },
  qr: { alignItems: "center", gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md },
});
