import { useQueryClient } from "@tanstack/react-query";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { deployment } from "../../chain/deployment";
import { encodeRelease, parseReleaseQr, sendViaRelay } from "../../chain/orderActions";
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

  const submit = async (raw: string) => {
    if (handled.current || !address) return;
    const parsed = parseReleaseQr(raw, Math.floor(Date.now() / 1000));
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
      <Screen footer={<Button label={t.common.continue} onPress={() => router.replace("/my-changas")} />}>
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
            {showManual ? <Button label={t.order.claimPayment} onPress={() => submit(manual.trim())} loading={busy} disabled={manual.trim().length === 0} /> : <Button label={t.selfie.take} onPress={() => void requestPermission()} />}
            <Button label={showManual ? t.common.back : t.order.manualCode} variant="ghost" onPress={() => setShowManual(!showManual)} />
          </>
        }
      >
        <Title>{t.order.scanTitle}</Title>
        {showManual ? <Field label={t.order.manualCode} value={manual} onChangeText={setManual} multiline autoCapitalize="none" /> : <Body>{t.selfie.cameraDenied}</Body>}
        {error ? <ErrorText>{error}</ErrorText> : null}
      </Screen>
    );
  }

  return (
    <Screen
      footer={<Button label={t.order.manualCode} variant="ghost" onPress={() => setShowManual(true)} />}
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
