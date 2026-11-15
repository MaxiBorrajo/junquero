import { useRunAction } from "../lib/useRunAction";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { router } from "expo-router";
import type { Changa } from "../api/types";
import { deployment } from "../chain/deployment";
import { MilestoneStatus, PROGRESS_STEPS, encodeReportProgress, encodeAbandon, encodeDeclareAbandoned, encodeDeliverMilestone, encodeMilestoneQr, encodeTerminateEarly, milestoneReleaseTypedData } from "../chain/milestones";
import { RELEASE_VALIDITY_SECONDS, sendViaRelay } from "../chain/orderActions";
import { readMilestones } from "../chain/reader";
import { useEvidence, EvidenceGallery, EvidenceUploader } from "../evidence/EvidenceSection";
import { evidenceBundleHash } from "../evidence/crypto";
import { t } from "../i18n";
import { approveRemotely, releaseCall, type RemoteRelease } from "../chain/remoteRelease";
import { allPaid, boardAction } from "../lib/board";
import { formatDate } from "../lib/format";
import { formatUsdc } from "../lib/money";
import { relayDepsFor } from "../lib/relayHelpers";
import { useSession } from "../session/SessionProvider";
import { signTyped } from "../wallet/sign";
import { colors, radius, spacing, text } from "../theme";
import { Card } from "./Card";
import { DetailActions } from "./DetailActions";
import { Body, Button, Chip, ErrorText, Row, Secondary } from "./ui";
import { Stars } from "./Stars";

export function MilestoneBoard({ orderId, role, counterpart, changa, payee, deadline }: { orderId: number; role: "payer" | "payee" | "viewer"; counterpart: string; changa: Changa | null; payee: string; deadline: number }) {
  const { api, address } = useSession();
  const queryClient = useQueryClient();
  const board = useQuery({ queryKey: ["milestones", orderId], refetchInterval: 15_000, queryFn: () => readMilestones(orderId) });
  const evidence = useEvidence(orderId);
  const { run: runAction, busy, error } = useRunAction();
  const [rating, setRating] = useState(5);
  const [qr, setQr] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [progress, setProgress] = useState<number>(PROGRESS_STEPS[1]);
  const remote = useQuery({
    queryKey: ["release", orderId, address, "m"],
    enabled: Boolean(address),
    refetchInterval: 15_000,
    queryFn: async () => (await api.get<{ release: RemoteRelease | null }>(`/me/orders/${orderId}/release`)).release,
  });

  if (!board.data || !address) return <Secondary>{t.common.loading}</Secondary>;
  const state = board.data;
  const action = boardAction({ next: state.next, count: state.count, milestones: state.milestones }, role);
  const current = state.milestones[state.next];
  const items = evidence.data ?? [];
  const mine = items.filter((item) => item.uploader.toLowerCase() === address.toLowerCase());
  const deps = relayDepsFor(api, address);

  // Los datos del tablero se refrescan solos cuando la red confirma la acción.
  const refresh = [["milestones", orderId], ["order", orderId]] as const;
  const run = (work: () => Promise<string | void>, success: string, icon?: string) =>
    runAction(work, { success, successIcon: icon, failure: t.milestonesBoard.failed, invalidate: refresh });

  const send = (data: `0x${string}`) => () => sendViaRelay(deps, data);

  const approve = () =>
    run(async () => {
      if (!current) return;
      await approveRemotely({ api, deployment, orderId, payee: payee as `0x${string}`, index: state.next, amount: current.amount, rating, evidenceHash: current.evidenceHash, now: Math.floor(Date.now() / 1000), sign: signTyped });
      await queryClient.invalidateQueries({ queryKey: ["release", orderId] });
    }, t.order.approved, "check");

  const claim = () =>
    run(async () => {
      if (!remote.data) return;
      return sendViaRelay(deps, releaseCall(orderId, remote.data));
    }, t.milestonesBoard.paid, "wallet");

  const showQr = () =>
    run(async () => {
      if (!current) return;
      const expiry = Math.floor(Date.now() / 1000) + RELEASE_VALIDITY_SECONDS;
      const data = { orderId: BigInt(orderId), index: state.next, amount: current.amount, rating, evidenceHash: current.evidenceHash, expiry };
      const signature = await signTyped(milestoneReleaseTypedData(deployment, data));
      setQr(encodeMilestoneQr(data, payee as `0x${string}`, signature));
    }, t.milestonesBoard.qrReady, "scan");

  return (
    <View style={styles.box}>
      <Text style={text.subtitle}>{t.milestonesBoard.title}</Text>
      {state.milestones.map((item, index) => {
        const info = changa?.spec.milestones?.[index];
        return (
          <Card key={index} gap="xs" style={index === state.next && styles.currentItem}>
            <Body>{`${index + 1}. ${info?.name ?? ""} · ${formatUsdc(item.amount.toString())}`}</Body>
            <Text style={text.label}>{t.milestonesBoard.status[item.status] ?? ""}</Text>
            {info && index === state.next && action !== "none" ? <Secondary>{`${t.milestonesBoard.criteria}: ${info.criteria}`}</Secondary> : null}
          </Card>
        );
      })}
      {allPaid(state.milestones) ? <Body>{t.milestonesBoard.allPaid}</Body> : null}

      {action === "deliver" ? (
        <>
          <Secondary>{t.milestonesBoard.evidenceNeed}</Secondary>
          <EvidenceUploader orderId={orderId} counterpart={counterpart} />
          <Button
            label={t.milestonesBoard.deliver} icon="send"
            onPress={() => run(send(encodeDeliverMilestone(BigInt(orderId), state.next, evidenceBundleHash(mine.map((item) => item.hash)))), t.milestonesBoard.delivered, "send")}
            loading={busy}
            disabled={mine.length === 0}
          />
        </>
      ) : null}
      {action === "deliver" ? (
        <>
          <Text style={text.subtitle}>{t.progress.title}</Text>
          <Secondary>{t.progress.hint}</Secondary>
          <Row>
            {PROGRESS_STEPS.map((step) => (
              <Chip key={step} label={`${step / 100}%`} selected={progress === step} onPress={() => setProgress(step)} />
            ))}
          </Row>
          <Button label={t.progress.report} icon="edit" variant="outline" onPress={() => run(send(encodeReportProgress(BigInt(orderId), progress, evidenceBundleHash(mine.map((item) => item.hash)))), t.progress.done, "check")} loading={busy} disabled={mine.length === 0} />
        </>
      ) : null}
      {action === "wait-review" ? (
        <>
          <Secondary>{t.order.autoRelease}</Secondary>
          {remote.data && remote.data.index === state.next ? (
            <>
              <Body>{t.order.readyToClaim}</Body>
              <Button label={t.order.claim} icon="wallet" onPress={claim} loading={busy} />
            </>
          ) : null}
          <Button label={t.order.scanQr} icon="scan" onPress={() => router.push({ pathname: "/scan/[orderId]", params: { orderId: String(orderId) } })} />
        </>
      ) : null}
      {action === "review" ? (
        <>
          <Body>{t.milestonesBoard.review}</Body>
          <EvidenceGallery orderId={orderId} items={items} />
          {qr ? (
            <View style={styles.qr}>
              <Text style={text.subtitle}>{t.order.qrTitle}</Text>
              <QRCode value={qr} size={240} backgroundColor={colors.white} />
              <Button label={t.common.retry} icon="refresh" variant="ghost" onPress={() => setQr(null)} />
            </View>
          ) : (
            <>
              <Text style={text.subtitle}>{t.order.rating}</Text>
              <Stars value={rating} onChange={setRating} />
              <Button label={t.milestonesBoard.showQr} icon="scan" onPress={showQr} loading={busy} />
              <DetailActions
                actions={[
                  { key: "approve", label: t.order.approveRemote, icon: "check", onPress: () => void approve() },
                  { key: "problem", label: t.order.problem, icon: "flag", danger: true, onPress: () => router.push({ pathname: "/dispute/[orderId]", params: { orderId: String(orderId) } }) },
                ]}
              />
            </>
          )}
        </>
      ) : null}

      {role === "payer" && state.next < state.count && current?.status !== MilestoneStatus.Delivered ? (
        confirmEnd ? (
          <>
            <Secondary>{t.milestonesBoard.terminateNote}</Secondary>
            <Button label={t.milestonesBoard.terminateConfirm} icon="check" variant="outline" onPress={() => run(send(encodeTerminateEarly(BigInt(orderId))), t.milestonesBoard.terminated, "check")} loading={busy} />
          </>
        ) : (
          <Button label={t.milestonesBoard.terminate} icon="close" variant="ghost" onPress={() => setConfirmEnd(true)} />
        )
      ) : null}
      {role === "payer" && deadline > 0 && Math.floor(Date.now() / 1000) > deadline && current?.status === MilestoneStatus.Pending ? (
        <Button label={`${t.milestonesBoard.declareAbandoned} (${formatDate(deadline)})`} icon="info" variant="ghost" onPress={() => run(send(encodeDeclareAbandoned(BigInt(orderId))), t.milestonesBoard.abandonedDeclared, "check")} disabled={busy} />
      ) : null}
      {role === "payee" && state.next < state.count ? (
        <>
          <Secondary>{t.milestonesBoard.abandonNote}</Secondary>
          <Button label={t.milestonesBoard.abandon} icon="logout" variant="ghost" onPress={() => run(send(encodeAbandon(BigInt(orderId))), t.milestonesBoard.abandoned, "check")} disabled={busy} />
        </>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  currentItem: { borderColor: colors.brick },
  qr: { alignItems: "center", gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md },
});
