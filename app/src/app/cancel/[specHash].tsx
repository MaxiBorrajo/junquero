import { useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/Card";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { deployment } from "../../chain/deployment";
import { encodeCancel, sendViaRelay } from "../../chain/orderActions";
import { readForwarderNonce } from "../../chain/reader";
import { Icon, type IconName } from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { Button, ErrorText, Screen, Secondary, Title } from "../../components/ui";
import { markCancelling } from "../../data/cancelling";
import { useChangaBySpec } from "../../data/useChangas";
import { t } from "../../i18n";
import { formatUsdc } from "../../lib/money";
import { useSession } from "../../session/SessionProvider";
import { useSwitchAccount } from "../../session/useSwitchAccount";
import { isRejection, isStaleWalletSession, signTyped } from "../../wallet/sign";
import { colors, spacing, text } from "../../theme";

function Point({ icon, children }: { icon: IconName; children: string }) {
  return (
    <View style={styles.point}>
      <Icon name={icon} size={20} color={colors.brick} />
      <Text style={[text.body, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

// Pantalla aparte para cancelar un trabajo: explica qué pasa con la plata y pide la confirmación.
export default function CancelChanga() {
  const { specHash } = useLocalSearchParams<{ specHash: string }>();
  const { address, api } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const switchAccount = useSwitchAccount();
  const query = useChangaBySpec(String(specHash));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [stale, setStale] = useState(false);

  if (query.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.brick} />
      </Screen>
    );
  }
  const changa = query.data;
  if (!changa || changa.orderId === null) {
    return (
      <Screen>
        <ErrorText>{t.detail.notFound}</ErrorText>
      </Screen>
    );
  }
  const isGroup = Boolean(changa.spec.group);
  const orderId = changa.orderId;

  const cancel = async () => {
    if (!address) return;
    const account = address as `0x${string}`;
    setBusy(true);
    setFailed(false);
    setStale(false);
    try {
      await sendViaRelay({ api, deployment, account, now: () => Math.floor(Date.now() / 1000), readForwarderNonce: () => readForwarderNonce(account), signTypedData: signTyped }, encodeCancel(BigInt(orderId)));
      markCancelling(changa.id);
      toast({ text: t.detail.cancelDone, tone: "success", icon: "check" });
      await queryClient.invalidateQueries();
      router.replace("/my-changas");
    } catch (error) {
      if (isRejection(error)) toast({ text: t.detail.cancelSigned, tone: "info" });
      else if (isStaleWalletSession(error)) setStale(true);
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button label={t.detail.cancelYes} icon="check" onPress={() => void cancel()} loading={busy} />
          <Button label={t.detail.cancelNo} icon="back" variant="ghost" onPress={() => router.back()} disabled={busy} />
        </View>
      }
    >
      <Title>{t.detail.cancelChanga}</Title>
      <Card gap="xs">
        <Text style={text.subtitle} numberOfLines={2}>
          {changa.spec.title}
        </Text>
        <Secondary>{`${isGroup ? t.cancelScreen.groupAmount : t.cancelScreen.amount}: ${formatUsdc(changa.amount)}`}</Secondary>
      </Card>
      <Text style={text.label}>{t.cancelScreen.whatHappens}</Text>
      <Point icon="wallet">{isGroup ? t.cancelScreen.returnGroup : t.cancelScreen.returnSolo}</Point>
      <Point icon="check">{t.cancelScreen.freeIfNone}</Point>
      <Point icon="info">{isGroup ? t.cancelScreen.feeGroup : t.cancelScreen.feeSolo}</Point>
      {failed ? <ErrorText>{t.detail.cancelFailed}</ErrorText> : null}
      {stale ? (
        <>
          <ErrorText>{t.common.walletStale}</ErrorText>
          <Button label={t.common.walletReconnect} icon="wallet" variant="outline" onPress={() => void switchAccount("/connect")} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  point: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm + 4 },
});
