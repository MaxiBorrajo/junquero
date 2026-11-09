import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { deployment } from "../../chain/deployment";
import { approveRemotely, releaseCall, type RemoteRelease } from "../../chain/remoteRelease";
import { encodeCheckIn, encodeDeliver, encodeReleaseQr, releaseTypedData, sendViaRelay, RELEASE_VALIDITY_SECONDS } from "../../chain/orderActions";
import { readContributionOf, readForwarderNonce, readGroup, readJurorFee, readParam, readTokenBalance, readTokenNonce } from "../../chain/reader";
import { PERMIT_VALIDITY_SECONDS, permitTypedData } from "../../chain/createOrder";
import { encodeObject } from "../../chain/group";
import { disputeCost, reasonHash } from "../../chain/jury";
import { formatAmount } from "../../lib/money";
import { Body, Button, ErrorText, Field, Screen, Secondary, Title } from "../../components/ui";
import { Stars } from "../../components/Stars";
import { MilestoneBoard } from "../../components/MilestoneBoard";
import { useChangaBySpec } from "../../data/useChangas";
import { useMyCases } from "../../data/useCases";
import { useOrder } from "../../data/useOrder";
import { EvidenceGallery, EvidenceUploader, useEvidence } from "../../evidence/EvidenceSection";
import { evidenceBundleHash } from "../../evidence/crypto";
import { t } from "../../i18n";
import { canFinish, extendedRole, roleOf, viewFor } from "../../lib/actions";
import { formatDate } from "../../lib/format";
import { formatUsdc } from "../../lib/money";
import { useSession } from "../../session/SessionProvider";
import { isRejection, signTyped } from "../../wallet/sign";
import { colors, radius, spacing, text } from "../../theme";

export default function OrderScreen() {
  const { orderId, title } = useLocalSearchParams<{ orderId: string; title?: string }>();
  const id = Number(orderId);
  const { api, address } = useSession();
  const queryClient = useQueryClient();
  const order = useOrder(id);
  const evidence = useEvidence(id);
  const myCases = useMyCases();
  const changaForOrder = useChangaBySpec(order.data?.specHash ?? "0x");
  const myCase = (myCases.data?.asParty ?? []).find((item) => item.orderId === id);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [qr, setQr] = useState<{ text: string; expiry: number } | null>(null);

  const contribution = useQuery({
    queryKey: ["contribution", id, address],
    enabled: Boolean(order.data?.isGroup && address),
    queryFn: () => readContributionOf(id, address as `0x${string}`),
  });
  const groupInfo = useQuery({ queryKey: ["group", id], enabled: Boolean(order.data?.isGroup), refetchInterval: 20_000, queryFn: () => readGroup(id) });
  const [objection, setObjection] = useState("");
  const remote = useQuery({
    queryKey: ["release", id, address],
    enabled: Boolean(address && order.data && !order.data.hasMilestones && order.data.status === 4),
    refetchInterval: 15_000,
    queryFn: async () => (await api.get<{ release: RemoteRelease | null }>(`/me/orders/${id}/release`)).release,
  });

  if (order.isLoading || !order.data || !address) {
    return (
      <Screen>
        <Title>{title ?? t.order.title}</Title>
        {order.isError ? <ErrorText>{t.order.loadError}</ErrorText> : <Secondary>{t.common.loading}</Secondary>}
      </Screen>
    );
  }

  const state = order.data;
  const role = roleOf(state, address);
  const view = viewFor(state.status, role);
  const items = evidence.data ?? [];
  const counterpart = role === "payer" ? state.payee : state.payer;
  const contributor = extendedRole(role, state.isGroup, contribution.data ?? 0n) === "contributor";
  const account = address as `0x${string}`;
  const relayDeps = { api, deployment, account, now: () => Math.floor(Date.now() / 1000), readForwarderNonce: () => readForwarderNonce(account), signTypedData: signTyped };

  const run = async (action: () => Promise<void>, errorText: string) => {
    setBusy(true);
    setMessage(null);
    setFailed(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["order", id] });
    } catch (error) {
      if (isRejection(error)) setMessage(t.order.signCancelled);
      else setFailed(errorText);
    } finally {
      setBusy(false);
    }
  };

  const finish = () =>
    run(async () => {
      const hash = evidenceBundleHash(items.filter((item) => item.uploader.toLowerCase() === address.toLowerCase()).map((item) => item.hash));
      await sendViaRelay(relayDeps, encodeDeliver(BigInt(id), hash));
    }, t.order.finishFailed);

  const object = () =>
    run(async () => {
      const text = objection.trim();
      if (text.length < 10) throw new Error("reason");
      const account = address as `0x${string}`;
      const [fee, jurors] = await Promise.all([readJurorFee(), readParam(state.sizeClass === 1 ? "JURY_SIZE_MEDIUM" : "JURY_SIZE_LARGE")]);
      const cost = disputeCost(state.sizeClass, fee, Number(jurors));
      let auth = { method: 0, nonce: 0n, deadline: 0n, signature: "0x" as `0x${string}` };
      if (cost > 0n) {
        if ((await readTokenBalance(account)) < cost) throw new Error("balance");
        const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS);
        auth = { method: 0, nonce: 0n, deadline, signature: await signTyped(permitTypedData(deployment, account, cost, await readTokenNonce(account), deadline)) };
      }
      await sendViaRelay(relayDeps, encodeObject(BigInt(id), reasonHash(text), auth));
      setObjection("");
    }, t.group.objectionFailed);

  const approve = () =>
    run(async () => {
      await approveRemotely({ api, deployment, orderId: id, payee: state.payee, index: null, amount: state.price, rating, evidenceHash: state.evidenceHash, now: Math.floor(Date.now() / 1000), sign: signTyped });
      setMessage(t.order.approved);
      await queryClient.invalidateQueries({ queryKey: ["release", id] });
    }, t.order.releaseFailed);

  const claim = () =>
    run(async () => {
      if (!remote.data) return;
      await sendViaRelay(relayDeps, releaseCall(id, remote.data));
    }, t.order.releaseFailed);

  const arrive = () => run(async () => void (await sendViaRelay(relayDeps, encodeCheckIn(BigInt(id)))), t.order.finishFailed);

  const showCode = () =>
    run(async () => {
      const expiry = Math.floor(Date.now() / 1000) + RELEASE_VALIDITY_SECONDS;
      const data = { orderId: BigInt(id), payee: state.payee, amount: state.price, rating, evidenceHash: state.evidenceHash, expiry };
      const signature = await signTyped(releaseTypedData(deployment, data));
      setQr({ text: encodeReleaseQr(data, signature), expiry });
    }, t.order.releaseFailed);

  return (
    <Screen
      footer={
        state.hasMilestones ? null : view === "worker-working" ? (
          <Button label={t.order.finish} onPress={finish} loading={busy} disabled={!canFinish(items.length, state.hasMilestones, state.isGroup)} />
        ) : view === "worker-waiting-review" ? (
          <Button label={t.order.scanQr} onPress={() => router.push({ pathname: "/scan/[orderId]", params: { orderId: String(id) } })} />
        ) : view === "payer-reviewing" ? (
          qr ? null : <Button label={t.order.showQr} onPress={showCode} loading={busy} />
        ) : null
      }
    >
      <Title>{title ?? t.order.title}</Title>
      <Secondary>{role === "payer" ? t.order.role.payer : role === "payee" ? t.order.role.payee : ""}</Secondary>
      <View style={styles.box}>
        <Text style={text.label}>{t.order.amount}</Text>
        <Text style={text.amount}>{formatUsdc(state.price.toString())}</Text>
      </View>

      {state.hasMilestones && view !== "settled" && view !== "cancelled" && view !== "disputed" ? (
        <MilestoneBoard orderId={id} role={role} counterpart={counterpart} changa={changaForOrder.data ?? null} payee={state.payee} deadline={state.deadline} />
      ) : null}

      {!state.hasMilestones && view === "worker-working" ? (
        <>
          <Body>{t.order.statusAgreed}</Body>
          {state.modality === 0 && state.checkedInAt === 0 ? <Button label={t.order.arrived} variant="secondary" onPress={arrive} loading={busy} /> : null}
          {state.checkedInAt > 0 ? <Secondary>{t.order.arrivedDone}</Secondary> : null}
          <Text style={text.subtitle}>{t.order.evidenceTitle}</Text>
          <Secondary>{t.order.evidenceHint}</Secondary>
          <Secondary>{`${items.length} ${t.order.evidenceCount}`}</Secondary>
          <EvidenceUploader orderId={id} counterpart={counterpart} />
          {items.length === 0 ? <Secondary>{t.order.evidenceNeedMore}</Secondary> : null}
        </>
      ) : null}

      {!state.hasMilestones && view === "worker-waiting-review" ? (
        <>
          <Body>{t.order.statusDelivered}</Body>
          <Secondary>{t.order.autoRelease}</Secondary>
          {remote.data ? (
            <>
              <Body>{t.order.readyToClaim}</Body>
              <Button label={t.order.claim} onPress={claim} loading={busy} />
            </>
          ) : null}
        </>
      ) : null}

      {!state.hasMilestones && view === "payer-waiting-work" ? <Body>{t.order.statusAgreed}</Body> : null}

      {!state.hasMilestones && view === "payer-reviewing" ? (
        <>
          <Body>{t.order.reviewTitle}</Body>
          <EvidenceGallery orderId={id} items={items} />
          <Secondary>{`${t.order.autoRelease}`}</Secondary>
          {qr ? (
            <View style={styles.qr}>
              <Text style={text.subtitle}>{t.order.qrTitle}</Text>
              <QRCode value={qr.text} size={240} backgroundColor={colors.white} />
              <Secondary>{`${t.agreement.expires}: ${formatDate(qr.expiry)}`}</Secondary>
              <Button label={t.common.retry} variant="ghost" onPress={() => setQr(null)} />
            </View>
          ) : (
            <>
              <Text style={text.subtitle}>{t.order.rating}</Text>
              <Stars value={rating} onChange={setRating} />
              <Secondary>{t.order.approveRemoteNote}</Secondary>
              <Button label={t.order.approveRemote} variant="secondary" onPress={approve} loading={busy} />
              <Button label={t.order.problem} variant="ghost" onPress={() => router.push({ pathname: "/dispute/[orderId]", params: { orderId: String(id) } })} />
            </>
          )}
        </>
      ) : null}

      {contributor && view === "payer-waiting-work" ? <Body>{t.order.statusAgreed}</Body> : null}
      {contributor && state.status === 4 ? (
        <>
          <Body>{t.group.reviewTitle}</Body>
          <EvidenceGallery orderId={id} items={items} />
          {groupInfo.data ? (
            <Secondary>{`${t.group.objectionProgress}: ${groupInfo.data.target > 0n ? Number((groupInfo.data.objectionMoney * 10000n) / groupInfo.data.target) / 100 : 0}% ${t.group.objectionMoney} · ${groupInfo.data.objectionCount} ${t.group.objectionPeople}`}</Secondary>
          ) : null}
          <Secondary>{t.group.thanks}</Secondary>
          <Text style={text.subtitle}>{t.group.objection}</Text>
          <Secondary>{t.group.objectionNote}</Secondary>
          <Field label={t.group.objectionReason} value={objection} onChangeText={setObjection} multiline maxLength={1500} />
          <Button label={t.group.objection} variant="secondary" onPress={object} loading={busy} disabled={objection.trim().length < 10} />
        </>
      ) : null}
      {view === "disputed" ? (
        <>
          <Body>{t.order.statusDisputed}</Body>
          {myCase ? <Button label={t.order.openCase} onPress={() => router.push({ pathname: "/case/[caseId]", params: { caseId: String(myCase.caseId) } })} /> : null}
        </>
      ) : null}
      {view === "settled" ? <Body>{t.order.released}</Body> : null}
      {view === "cancelled" ? <Body>{t.order.statusCancelled}</Body> : null}
      {message ? <Secondary>{message}</Secondary> : null}
      {failed ? <ErrorText>{failed}</ErrorText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs, borderWidth: 1, borderColor: colors.line },
  qr: { alignItems: "center", gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md },
});
