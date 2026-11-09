import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { router } from "expo-router";
import type { Changa } from "../api/types";
import { deployment } from "../chain/deployment";
import { MilestoneStatus, encodeAbandon, encodeClaimAdvance, encodeDeclareAbandoned, encodeDeliverMilestone, encodeMilestoneQr, encodeTerminateEarly, milestoneReleaseTypedData } from "../chain/milestones";
import { RELEASE_VALIDITY_SECONDS, sendViaRelay } from "../chain/orderActions";
import { readMilestones } from "../chain/reader";
import { useEvidence, EvidenceGallery, EvidenceUploader } from "../evidence/EvidenceSection";
import { evidenceBundleHash } from "../evidence/crypto";
import { t } from "../i18n";
import { allPaid, boardAction } from "../lib/board";
import { formatDate } from "../lib/format";
import { formatUsdc } from "../lib/money";
import { relayDepsFor } from "../lib/relayHelpers";
import { useSession } from "../session/SessionProvider";
import { isRejection, signTyped } from "../wallet/sign";
import { colors, radius, spacing, text } from "../theme";
import { Body, Button, ErrorText, Secondary } from "./ui";
import { Stars } from "./Stars";

export function MilestoneBoard({ orderId, role, counterpart, changa, payee, deadline }: { orderId: number; role: "payer" | "payee" | "viewer"; counterpart: string; changa: Changa | null; payee: string; deadline: number }) {
  const { api, address } = useSession();
  const queryClient = useQueryClient();
  const board = useQuery({ queryKey: ["milestones", orderId], refetchInterval: 15_000, queryFn: () => readMilestones(orderId) });
  const evidence = useEvidence(orderId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [qr, setQr] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  if (!board.data || !address) return <Secondary>{t.common.loading}</Secondary>;
  const state = board.data;
  const action = boardAction({ next: state.next, count: state.count, firstIsAdvance: state.firstIsAdvance, milestones: state.milestones }, role);
  const current = state.milestones[state.next];
  const items = evidence.data ?? [];
  const mine = items.filter((item) => item.uploader.toLowerCase() === address.toLowerCase());
  const deps = relayDepsFor(api, address);

  const run = async (work: () => Promise<void>, success: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await work();
      setMessage(success);
      await queryClient.invalidateQueries({ queryKey: ["milestones", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    } catch (caught) {
      setError(isRejection(caught) ? t.order.signCancelled : t.milestonesBoard.failed);
    } finally {
      setBusy(false);
    }
  };

  const send = (data: `0x${string}`) => async () => void (await sendViaRelay(deps, data));

  const showQr = () =>
    run(async () => {
      if (!current) return;
      const expiry = Math.floor(Date.now() / 1000) + RELEASE_VALIDITY_SECONDS;
      const data = { orderId: BigInt(orderId), index: state.next, amount: current.amount, rating, evidenceHash: current.evidenceHash, expiry };
      const signature = await signTyped(milestoneReleaseTypedData(deployment, data));
      setQr(encodeMilestoneQr(data, payee as `0x${string}`, signature));
    }, t.milestonesBoard.done);

  return (
    <View style={styles.box}>
      <Text style={text.subtitle}>{t.milestonesBoard.title}</Text>
      {state.milestones.map((item, index) => {
        const info = changa?.spec.milestones?.[index];
        return (
          <View key={index} style={[styles.item, index === state.next && styles.currentItem]}>
            <Body>{`${index + 1}. ${info?.name ?? ""} · ${formatUsdc(item.amount.toString())}`}</Body>
            <Text style={text.label}>{t.milestonesBoard.status[item.status] ?? ""}</Text>
            {info && index === state.next && action !== "none" ? <Secondary>{`${t.milestonesBoard.criteria}: ${info.criteria}`}</Secondary> : null}
          </View>
        );
      })}
      {allPaid(state.milestones) ? <Body>{t.milestonesBoard.allPaid}</Body> : null}

      {action === "claim-advance" ? <Button label={t.milestonesBoard.claimAdvance} onPress={() => run(send(encodeClaimAdvance(BigInt(orderId))), t.milestonesBoard.done)} loading={busy} /> : null}
      {action === "deliver" ? (
        <>
          <Secondary>{t.milestonesBoard.evidenceNeed}</Secondary>
          <EvidenceUploader orderId={orderId} counterpart={counterpart} />
          <Button
            label={t.milestonesBoard.deliver}
            onPress={() => run(send(encodeDeliverMilestone(BigInt(orderId), state.next, evidenceBundleHash(mine.map((item) => item.hash)))), t.milestonesBoard.done)}
            loading={busy}
            disabled={mine.length === 0}
          />
        </>
      ) : null}
      {action === "wait-review" ? (
        <>
          <Secondary>{t.order.autoRelease}</Secondary>
          <Button label={t.order.scanQr} onPress={() => router.push({ pathname: "/scan/[orderId]", params: { orderId: String(orderId) } })} />
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
              <Button label={t.common.retry} variant="ghost" onPress={() => setQr(null)} />
            </View>
          ) : (
            <>
              <Text style={text.subtitle}>{t.order.rating}</Text>
              <Stars value={rating} onChange={setRating} />
              <Button label={t.milestonesBoard.showQr} onPress={showQr} loading={busy} />
            </>
          )}
        </>
      ) : null}

      {role === "payer" && state.next < state.count && current?.status !== MilestoneStatus.Delivered ? (
        confirmEnd ? (
          <>
            <Secondary>{t.milestonesBoard.terminateNote}</Secondary>
            <Button label={t.milestonesBoard.terminateConfirm} variant="secondary" onPress={() => run(send(encodeTerminateEarly(BigInt(orderId))), t.milestonesBoard.done)} loading={busy} />
          </>
        ) : (
          <Button label={t.milestonesBoard.terminate} variant="ghost" onPress={() => setConfirmEnd(true)} />
        )
      ) : null}
      {role === "payer" && deadline > 0 && Math.floor(Date.now() / 1000) > deadline && current?.status === MilestoneStatus.Pending ? (
        <Button label={`${t.milestonesBoard.declareAbandoned} (${formatDate(deadline)})`} variant="ghost" onPress={() => run(send(encodeDeclareAbandoned(BigInt(orderId))), t.milestonesBoard.done)} disabled={busy} />
      ) : null}
      {role === "payee" && state.next < state.count ? (
        <>
          <Secondary>{t.milestonesBoard.abandonNote}</Secondary>
          <Button label={t.milestonesBoard.abandon} variant="ghost" onPress={() => run(send(encodeAbandon(BigInt(orderId))), t.milestonesBoard.done)} disabled={busy} />
        </>
      ) : null}
      {message ? <Secondary>{message}</Secondary> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  item: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: 2, borderWidth: 1, borderColor: colors.line },
  currentItem: { borderColor: colors.brick },
  qr: { alignItems: "center", gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md },
});
