import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/Card";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { deployment } from "../../chain/deployment";
import { encodeCancel, sendViaRelay } from "../../chain/orderActions";
import { readCancelRules, readForwarderNonce } from "../../chain/reader";
import { OrderStatus } from "../../chain/orderAbi";
import { fetchOrder } from "../../chain/serverReads";
import { cancelAmounts, cancelCase } from "../../lib/cancelCost";
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
  const orderId = query.data?.orderId ?? null;
  const order = useQuery({ queryKey: ["order", orderId], enabled: orderId !== null, queryFn: () => fetchOrder(api, orderId!) });
  const rules = useQuery({ queryKey: ["cancel-rules"], queryFn: readCancelRules });

  if (query.isLoading || (orderId !== null && order.isLoading)) {
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
  const asWorker = order.data?.status === OrderStatus.Agreed && order.data.payee.toLowerCase() === (address ?? "").toLowerCase();

  // Con un acuerdo hecho el costo depende de cuánto falta para el comienzo (o de cuánto pasó desde el acuerdo).
  const agreed = order.data?.status === OrderStatus.Agreed;
  const kind = agreed && order.data && rules.data ? cancelCase(order.data, Math.floor(Date.now() / 1000), rules.data.noticeSeconds) : null;
  const amounts = kind && order.data && rules.data ? cancelAmounts(kind, order.data, rules.data) : null;
  const dated = (order.data?.startsAt ?? 0) !== 0;
  const agreedText = kind === "cash" ? t.cancelScreen.agreedCash : kind === "early" ? (dated ? t.cancelScreen.agreedEarly : t.cancelScreen.agreedEarlyNoDate) : kind === "late" ? (dated ? t.cancelScreen.agreedLate : t.cancelScreen.agreedLateNoDate) : t.common.loading;

  const cancel = async () => {
    if (!address) return;
    const account = address as `0x${string}`;
    setBusy(true);
    setFailed(false);
    setStale(false);
    try {
      await sendViaRelay({ api, deployment, account, now: () => Math.floor(Date.now() / 1000), readForwarderNonce: () => readForwarderNonce(account), signTypedData: signTyped }, encodeCancel(BigInt(changa.orderId!)));
      markCancelling(changa.id);
      // Que el servidor se ponga al día ya, sin esperar al reloj de cada minuto. Si falla no importa: el reloj lo recoge.
      void api.send("POST", "/me/sync").catch(() => {});
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
      <Title>{asWorker ? t.cancelScreen.workerCancel : t.detail.cancelChanga}</Title>
      <Card gap="xs">
        <Text style={text.subtitle} numberOfLines={2}>
          {changa.spec.title}
        </Text>
        <Secondary>{`${isGroup ? t.cancelScreen.groupAmount : t.cancelScreen.amount}: ${formatUsdc(changa.amount)}`}</Secondary>
      </Card>
      <Text style={text.label}>{t.cancelScreen.whatHappens}</Text>
      {asWorker ? (
        <>
          <Point icon="wallet">{t.cancelScreen.workerReturn}</Point>
          <Point icon="info">{t.cancelScreen.workerReputation}</Point>
        </>
      ) : agreed ? (
        <>
          <Point icon="wallet">{t.cancelScreen.agreedReturn}</Point>
          <Point icon={kind === "cash" ? "check" : "info"}>{agreedText}</Point>
          {amounts ? (
            <Card gap="xs">
              <Secondary>{`${t.cancelScreen.youPay}: ${formatUsdc((amounts.toPayee + amounts.toTreasury).toString())}`}</Secondary>
              {amounts.toPayee > 0n ? <Secondary>{`${t.cancelScreen.toWorker}: ${formatUsdc(amounts.toPayee.toString())}`}</Secondary> : null}
              {amounts.toTreasury > 0n ? <Secondary>{`${t.cancelScreen.toTreasury}: ${formatUsdc(amounts.toTreasury.toString())}`}</Secondary> : null}
              <Text style={text.subtitle}>{`${t.cancelScreen.youGetBack}: ${formatUsdc(amounts.refund.toString())}`}</Text>
            </Card>
          ) : null}
        </>
      ) : (
        <>
          <Point icon="wallet">{isGroup ? t.cancelScreen.returnGroup : t.cancelScreen.returnSolo}</Point>
          <Point icon="check">{t.cancelScreen.freeIfNone}</Point>
          <Point icon="info">{isGroup ? t.cancelScreen.feeGroup : t.cancelScreen.feeSolo}</Point>
        </>
      )}
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
