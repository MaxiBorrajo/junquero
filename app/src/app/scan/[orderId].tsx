import { useQueryClient } from "@tanstack/react-query";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { deployment } from "../../chain/deployment";
import { encodeReleaseMilestone, parseMilestoneQr } from "../../chain/milestones";
import { encodeRelease, parseReleaseQr, sendViaRelay } from "../../chain/orderActions";
import { releaseCall, type RemoteRelease } from "../../chain/remoteRelease";
import { isShortCode, normalizeCode } from "../../chain/releaseCode";
import { readForwarderNonce } from "../../chain/reader";
import { Body, Button, ErrorText, Field, Screen, Title } from "../../components/ui";
import { t } from "../../i18n";
import { useSession } from "../../session/SessionProvider";
import { isRejection, signTyped } from "../../wallet/sign";
import { colors, radius } from "../../theme";

export default function Scan() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { api, address } = useSession();
  const queryClient = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);

  // Código corto: el servidor devuelve la liberación firmada que guardó quien publicó, y se envía igual que la del QR.
  const claimByCode = async (raw: string) => {
    if (handled.current || !address) return;
    setBusy(true);
    setError(null);
    try {
      const found = await api.get<{ orderId: number; release: RemoteRelease }>(`/me/release-codes/${normalizeCode(raw)}`).catch((failure: { status?: number }) => {
        throw failure?.status === 404 ? new Error("invalid") : failure;
      });
      if (String(found.orderId) !== String(orderId)) {
        setError(t.order.scanInvalid);
        return;
      }
      handled.current = true;
      const account = address as `0x${string}`;
      await sendViaRelay(
        { api, deployment, account, now: () => Math.floor(Date.now() / 1000), readForwarderNonce: () => readForwarderNonce(account), signTypedData: signTyped },
        releaseCall(found.orderId, found.release),
      );
      await queryClient.invalidateQueries({ queryKey: ["order", Number(orderId)] });
      if (found.release.index !== null) await queryClient.invalidateQueries({ queryKey: ["milestones", Number(orderId)] });
      setDone(true);
    } catch (failure) {
      handled.current = false;
      setError((failure as Error).message === "invalid" ? t.order.scanInvalid : isRejection(failure) ? t.order.signCancelled : t.order.releaseFailed);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (raw: string) => {
    if (handled.current || !address) return;
    if (isShortCode(raw)) return claimByCode(raw);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const milestone = raw.includes('"k":"m"') ? parseMilestoneQr(raw, nowSeconds) : null;
    if (milestone && milestone !== "invalid" && milestone !== "expired") {
      if (String(milestone.data.orderId) !== String(orderId) || milestone.payee.toLowerCase() !== address.toLowerCase()) {
        setError(t.order.scanInvalid);
        return;
      }
      handled.current = true;
      setBusy(true);
      setError(null);
      try {
        const account = address as `0x${string}`;
        await sendViaRelay(
          { api, deployment, account, now: () => Math.floor(Date.now() / 1000), readForwarderNonce: () => readForwarderNonce(account), signTypedData: signTyped },
          encodeReleaseMilestone(milestone.data, milestone.signature),
        );
        await queryClient.invalidateQueries({ queryKey: ["milestones", Number(orderId)] });
        await queryClient.invalidateQueries({ queryKey: ["order", Number(orderId)] });
        setDone(true);
      } catch (failure) {
        handled.current = false;
        setError(isRejection(failure) ? t.order.signCancelled : t.order.releaseFailed);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (milestone === "expired") {
      setError(t.order.scanExpired);
      return;
    }
    const parsed = parseReleaseQr(raw, nowSeconds);
    if (parsed === "invalid" || parsed === "expired") {
      setError(parsed === "expired" ? t.order.scanExpired : t.order.scanInvalid);
      return;
    }
    if (String(parsed.data.orderId) !== String(orderId) || parsed.data.payee.toLowerCase() !== address.toLowerCase()) {
      setError(t.order.scanInvalid);
      return;
    }
    handled.current = true;
    setBusy(true);
    setError(null);
    try {
      const account = address as `0x${string}`;
      await sendViaRelay(
        { api, deployment, account, now: () => Math.floor(Date.now() / 1000), readForwarderNonce: () => readForwarderNonce(account), signTypedData: signTyped },
        encodeRelease(parsed.data, parsed.signature),
      );
      await queryClient.invalidateQueries({ queryKey: ["order", Number(orderId)] });
      setDone(true);
    } catch (failure) {
      handled.current = false;
      setError(isRejection(failure) ? t.order.signCancelled : t.order.releaseFailed);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen footer={<Button label={t.common.continue} icon="chevron" onPress={() => router.replace("/my-changas")} />}>
        <Title>{t.order.released}</Title>
      </Screen>
    );
  }

  if (!permission) return <Screen>{null}</Screen>;
  if (!permission.granted || showManual) {
    return (
      <Screen
        footer={
          <>
            {showManual ? <Button label={t.order.claimPayment} icon="check" onPress={() => submit(manual.trim())} loading={busy} disabled={manual.trim().length === 0} /> : <Button label={t.selfie.take} icon="camera" onPress={() => void requestPermission()} />}
            <Button label={showManual ? t.common.back : t.order.manualCode} icon={showManual ? "back" : "edit"} variant="ghost" onPress={() => setShowManual(!showManual)} />
          </>
        }
      >
        <Title>{t.order.scanTitle}</Title>
        {showManual ? <Field label={t.order.codeLabel} value={manual} onChangeText={setManual} placeholder="ABCD-1234" autoCapitalize="characters" autoCorrect={false} maxLength={12} /> : <Body>{t.selfie.cameraDenied}</Body>}
        {error ? <ErrorText>{error}</ErrorText> : null}
      </Screen>
    );
  }

  return (
    <Screen
      footer={<Button label={t.order.manualCode} icon="edit" variant="ghost" onPress={() => setShowManual(true)} />}
    >
      <Title>{t.order.scanTitle}</Title>
      <View style={styles.frame}>
        <CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={busy ? undefined : (result) => void submit(result.data)} />
      </View>
      {busy ? <Body>{t.order.releasing}</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 1, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.ink },
  camera: { flex: 1 },
});
