import { useDisputedMilestones } from "../../data/useDisputedMilestones";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { ReleaseCode } from "../../components/ReleaseCode";
import { releaseCode } from "../../chain/releaseCode";
import { deployment } from "../../chain/deployment";
import { MilestoneStatus, encodeDeliverMilestone, encodeMilestoneQr, milestoneReleaseTypedData } from "../../chain/milestones";
import { RELEASE_VALIDITY_SECONDS, sendViaRelay } from "../../chain/orderActions";
import { approveRemotely, releaseCall, type RemoteRelease } from "../../chain/remoteRelease";
import { fetchMilestones } from "../../chain/serverReads";
import { Card } from "../../components/Card";
import { DetailActions } from "../../components/DetailActions";
import { Stars } from "../../components/Stars";
import { Body, Button, ErrorText, Screen, Secondary, Title } from "../../components/ui";
import { useChangaBySpec } from "../../data/useChangas";
import { EvidenceThumbnails, EvidenceUploader, useEvidence, useEvidenceByMilestone } from "../../evidence/EvidenceSection";
import { evidenceBundleHash } from "../../evidence/crypto";
import { t } from "../../i18n";
import { boardAction } from "../../lib/board";
import { formatUsdc } from "../../lib/money";
import { relayDepsFor } from "../../lib/relayHelpers";
import { useFocusedInterval } from "../../lib/useFocusedInterval";
import { useRunAction } from "../../lib/useRunAction";
import { useSession } from "../../session/SessionProvider";
import { signTyped } from "../../wallet/sign";
import { colors, radius, spacing, text } from "../../theme";

// Un hito por pantalla: qué se acordó, qué prueba se pide y lo que le toca hacer a cada persona (subir pruebas y entregar, o revisar y cobrar).
export default function MilestoneScreen() {
  const { orderId: orderParam, index: indexParam, spec, role: roleParam, counterpart, payee } = useLocalSearchParams<{ orderId: string; index: string; spec: string; role: string; counterpart: string; payee: string }>();
  const orderId = Number(orderParam);
  const index = Number(indexParam);
  const role = roleParam === "payer" || roleParam === "payee" ? roleParam : "viewer";
  const { api, address } = useSession();
  const queryClient = useQueryClient();
  const changa = useChangaBySpec(spec || "0x");
  const board = useQuery({ queryKey: ["milestones", orderId], queryFn: () => fetchMilestones(api, orderId) });
  const disputedBefore = useDisputedMilestones(orderId);
  const evidence = useEvidence(orderId);
  const forMilestone = useEvidenceByMilestone(evidence.data ?? []);
  const { run: runAction, busy, error } = useRunAction();
  const [rating, setRating] = useState(5);
  const [qr, setQr] = useState<{ text: string; code: string | null } | null>(null);
  const remote = useQuery({
    queryKey: ["release", orderId, address, "m"],
    enabled: Boolean(address),
    refetchInterval: useFocusedInterval(30_000),
    queryFn: async () => (await api.get<{ release: RemoteRelease | null }>(`/me/orders/${orderId}/release`)).release,
  });

  if (!board.data || !address) return <Screen><Secondary>{t.common.loading}</Secondary></Screen>;
  const state = board.data;
  const item = state.milestones[index];
  const info = changa.data?.spec.milestones?.[index];
  if (!item) return <Screen><Secondary>{t.common.loading}</Secondary></Screen>;
  const isCurrent = index === state.next;
  const frozen = state.disputing;
  const inDispute = frozen && index === state.disputedIndex;
  const action = isCurrent && !frozen ? boardAction({ next: state.next, count: state.count, milestones: state.milestones }, role) : "none";
  const items = forMilestone(index);
  const mine = items.filter((entry) => entry.uploader.toLowerCase() === address.toLowerCase());
  const deps = relayDepsFor(api, address);
  const refresh = [["milestones", orderId], ["order", orderId]] as const;
  const run = (work: () => Promise<string | void>, success: string, icon?: string) => runAction(work, { success, successIcon: icon, failure: t.milestonesBoard.failed, invalidate: refresh });
  const send = (data: `0x${string}`) => () => sendViaRelay(deps, data);

  const approve = () =>
    run(async () => {
      await approveRemotely({ api, deployment, orderId, payee: payee as `0x${string}`, index, amount: item.amount, rating, evidenceHash: item.evidenceHash, now: Math.floor(Date.now() / 1000), sign: signTyped });
      await queryClient.invalidateQueries({ queryKey: ["release", orderId] });
    }, t.order.approved, "check");

  const claim = () =>
    run(async () => {
      if (!remote.data) return;
      return sendViaRelay(deps, releaseCall(orderId, remote.data));
    }, t.milestonesBoard.paid, "wallet");

  const showQr = () =>
    run(async () => {
      const expiry = Math.floor(Date.now() / 1000) + RELEASE_VALIDITY_SECONDS;
      const data = { orderId: BigInt(orderId), index, amount: item.amount, rating, evidenceHash: item.evidenceHash, expiry };
      const signature = await signTyped(milestoneReleaseTypedData(deployment, data));
      // Se guarda la liberación firmada en el servidor: así quien cobra puede escribir el código corto si la cámara no anda.
      const code = await api
        .send("POST", `/me/orders/${orderId}/release`, { index, amount: item.amount.toString(), rating, evidenceHash: item.evidenceHash, expiry, signature })
        .then(() => releaseCode(signature))
        .catch(() => null);
      setQr({ text: encodeMilestoneQr(data, payee as `0x${string}`, signature), code });
    }, t.milestonesBoard.qrReady, "scan");

  const resolvedShare = disputedBefore.get(index);
  const statusNote =
    item.status === MilestoneStatus.Paid && resolvedShare !== undefined ? t.milestonesBoard.detail.disputedResolved.replace("{percent}", String(Math.round(resolvedShare / 100))) : item.status === MilestoneStatus.Paid ? t.milestonesBoard.detail.paid : inDispute || item.status === MilestoneStatus.Disputed ? t.milestonesBoard.detail.disputed : frozen ? t.milestonesBoard.detail.frozen : !isCurrent ? t.milestonesBoard.detail.notYet : action === "wait-delivery" ? t.milestonesBoard.detail.waitDelivery : null;

  return (
    <Screen>
      <Title>{`${index + 1}. ${info?.name ?? ""}`}</Title>
      <Card gap="xs">
        <Text style={text.label}>{t.milestonesBoard.detail.amount}</Text>
        <Text style={text.amount}>{formatUsdc(item.amount.toString())}</Text>
        <Text style={text.label}>{t.milestonesBoard.status[item.status] ?? ""}</Text>
      </Card>
      {info ? (
        <Card gap="xs">
          <Text style={text.label}>{t.milestonesBoard.criteria}</Text>
          <Body>{info.criteria}</Body>
          <Text style={[text.label, { marginTop: spacing.xs }]}>{t.milestonesBoard.detail.evidence}</Text>
          <Body>{info.evidence}</Body>
        </Card>
      ) : null}
      {statusNote ? <Secondary>{statusNote}</Secondary> : null}

      {action === "deliver" ? (
        <>
          <Secondary>{t.milestonesBoard.evidenceNeed}</Secondary>
          {mine.length > 0 ? (
            <>
              <Text style={text.subtitle}>{t.milestonesBoard.detail.uploaded.replace("{count}", String(mine.length))}</Text>
              <EvidenceThumbnails orderId={orderId} items={mine} />
            </>
          ) : null}
          <EvidenceUploader orderId={orderId} counterpart={counterpart ?? ""} milestone={index} />
          <Button
            label={t.milestonesBoard.deliver} icon="send"
            onPress={() => run(send(encodeDeliverMilestone(BigInt(orderId), index, evidenceBundleHash(mine.map((entry) => entry.hash)))), t.milestonesBoard.delivered, "send")}
            loading={busy}
            disabled={mine.length === 0}
          />
        </>
      ) : null}
      {action === "wait-review" ? (
        <>
          {mine.length > 0 ? (
            <>
              <Text style={text.subtitle}>{t.milestonesBoard.detail.uploaded.replace("{count}", String(mine.length))}</Text>
              <EvidenceThumbnails orderId={orderId} items={mine} />
            </>
          ) : null}
          <Secondary>{t.order.autoRelease}</Secondary>
          {remote.data && remote.data.index === index ? (
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
          <EvidenceThumbnails orderId={orderId} items={items} />
          {qr ? (
            <View style={styles.qr}>
              <Text style={text.subtitle}>{t.order.qrTitle}</Text>
              <QRCode value={qr.text} size={240} backgroundColor={colors.white} />
              {qr.code ? <ReleaseCode code={qr.code} /> : null}
              <Button label={t.common.retry} icon="refresh" variant="ghost" onPress={() => setQr(null)} />
            </View>
          ) : (
            <>
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
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  qr: { alignItems: "center", gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md },
});
