import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { deployment } from "../../chain/deployment";
import { encodeCheckIn, encodeDeliver, encodeReleaseQr, releaseTypedData, sendViaRelay, RELEASE_VALIDITY_SECONDS } from "../../chain/orderActions";
import { readForwarderNonce } from "../../chain/reader";
import { Body, Button, ErrorText, Screen, Secondary, Title } from "../../components/ui";
import { Stars } from "../../components/Stars";
import { useOrder } from "../../data/useOrder";
import { EvidenceGallery, EvidenceUploader, useEvidence } from "../../evidence/EvidenceSection";
import { evidenceBundleHash } from "../../evidence/crypto";
import { t } from "../../i18n";
import { canFinish, roleOf, viewFor } from "../../lib/actions";
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [qr, setQr] = useState<{ text: string; expiry: number } | null>(null);

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
        view === "worker-working" ? (
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

      {view === "worker-working" ? (
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

      {view === "worker-waiting-review" ? (
        <>
          <Body>{t.order.statusDelivered}</Body>
          <Secondary>{t.order.autoRelease}</Secondary>
        </>
      ) : null}

      {view === "payer-waiting-work" ? <Body>{t.order.statusAgreed}</Body> : null}

      {view === "payer-reviewing" ? (
        <>
          <Body>{t.order.reviewTitle}</Body>
          <EvidenceGallery orderId={id} items={items} counterpart={counterpart} />
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
              <Button label={t.order.problem} variant="ghost" onPress={() => setMessage(t.order.problemSoon)} />
            </>
          )}
        </>
      ) : null}

      {view === "disputed" ? <Body>{t.order.statusDisputed}</Body> : null}
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
