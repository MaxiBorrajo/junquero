import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { PERMIT_VALIDITY_SECONDS, permitTypedData } from "../../chain/createOrder";
import { deployment } from "../../chain/deployment";
import { checkContribution, contributionLimits, encodeContribute, encodeSupportCoordinator, encodeRefundFunding, encodeVetoProvider, encodeWithdrawContribution, fundingProgress, percentOf, vetoOpen } from "../../chain/group";
import { OrderStatus } from "../../chain/orderAbi";
import { sendViaRelay } from "../../chain/orderActions";
import { readContributionRule, readGroup, readTokenBalance, readTokenNonce } from "../../chain/reader";
import { Banner } from "../../components/Banner";
import { Card } from "../../components/Card";
import { DetailActions, type DetailAction } from "../../components/DetailActions";
import { Body, Button, ErrorText, Field, Screen, Secondary, Title } from "../../components/ui";
import { useOrder } from "../../data/useOrder";
import { t } from "../../i18n";
import { formatDate, shortAddress } from "../../lib/format";
import { formatAmount, formatUsdc, toMicro } from "../../lib/money";
import { relayDepsFor } from "../../lib/relayHelpers";
import { useRunAction } from "../../lib/useRunAction";
import { useSession } from "../../session/SessionProvider";
import { signTyped } from "../../wallet/sign";
import { colors, radius, spacing, text } from "../../theme";

export default function GroupScreen() {
  const { orderId, title } = useLocalSearchParams<{ orderId: string; title?: string }>();
  const id = Number(orderId);
  const { api, address } = useSession();
  const order = useOrder(id);
  const group = useQuery({ queryKey: ["group", id], refetchInterval: 15_000, queryFn: () => readGroup(id) });
  const rule = useQuery({ queryKey: ["contributionRule"], queryFn: readContributionRule, staleTime: 10 * 60_000 });
  const [amount, setAmount] = useState("");
  const { run, busy, error } = useRunAction();

  if (!group.data || !rule.data || !order.data || !address) {
    return (
      <Screen>
        <Title>{title ?? t.group.title}</Title>
        <Secondary>{t.common.loading}</Secondary>
      </Screen>
    );
  }

  const info = group.data;
  const me = address.toLowerCase();
  const mine = info.contributors.find((item) => item.address.toLowerCase() === me)?.amount ?? 0n;
  const limits = contributionLimits(info.target, rule.data.minBps, rule.data.maxBps);
  const now = Math.floor(Date.now() / 1000);
  const funding = order.data.status === OrderStatus.Funding;
  const open = order.data.status === OrderStatus.Open;
  const parsed = amount.trim() ? toMicro(amount.trim()) : 0n;
  const check = checkContribution(parsed, mine, info.target, info.totalContributed, limits);
  const hasProposal = info.proposedPayee !== "0x0000000000000000000000000000000000000000";
  const refresh = [["group", id], ["order", id]] as const;
  const mapError = (caught: unknown) => {
    const message = String((caught as Error)?.message ?? "");
    return message.startsWith("balance:") ? t.group.insufficient.replace("{amount}", formatAmount(message.split(":")[1] ?? "0")) : null;
  };

  const contribute = () =>
    run(
      async () => {
        if (!check.ok) throw new Error(check.reason);
        const account = address as `0x${string}`;
        const balance = await readTokenBalance(account);
        if (balance < parsed) throw new Error(`balance:${parsed - balance}`);
        const deadline = BigInt(now + PERMIT_VALIDITY_SECONDS);
        const signature = await signTyped(permitTypedData(deployment, account, parsed, await readTokenNonce(account), deadline));
        return sendViaRelay(relayDepsFor(api, address), encodeContribute(BigInt(id), parsed, { method: 0, nonce: 0n, deadline, signature }));
      },
      { success: t.group.contributed, successIcon: "wallet", failure: t.group.failed, mapError, invalidate: refresh, onSuccess: () => setAmount("") },
    );

  const send = (data: `0x${string}`, success: string, icon?: string) =>
    run(() => sendViaRelay(relayDepsFor(api, address), data), { success, successIcon: icon, failure: t.group.failed, invalidate: refresh });

  const hint = !amount.trim()
    ? null
    : check.ok
      ? null
      : check.reason === "range"
        ? t.group.range.replace("{min}", formatAmount(limits.min.toString())).replace("{max}", formatAmount(limits.max.toString()))
        : check.reason === "exceeds"
          ? t.group.exceeds.replace("{remaining}", formatAmount((check.remaining ?? 0n).toString()))
          : null;

  const actions: DetailAction[] = [
    { key: "share", label: t.group.share, icon: "share", onPress: () => void Share.share({ message: `${title ?? ""} · junquero://group/${id}` }) },
    ...(mine > 0n && (funding || open) ? [{ key: "withdraw", label: t.group.withdraw, icon: "logout" as const, danger: true, onPress: () => void send(encodeWithdrawContribution(BigInt(id)), t.group.withdrawn, "check") }] : []),
    ...(funding && now > info.fundingDeadline ? [{ key: "refund", label: t.group.refund, icon: "refresh" as const, danger: true, onPress: () => void send(encodeRefundFunding(BigInt(id)), t.group.refunded, "check") }] : []),
  ];

  return (
    <Screen footer={funding ? <Button label={t.group.contribute} icon="wallet" onPress={contribute} loading={busy} disabled={!check.ok} /> : null}>
      <Title>{title ?? t.group.title}</Title>
      <Body>{funding ? t.group.funding : open ? t.group.funded : ""}</Body>
      <Card>
        <Text style={text.label}>{t.group.raised}</Text>
        <Text style={text.amount}>{formatUsdc(info.totalContributed.toString())}</Text>
        <View style={styles.bar}>
          <View style={[styles.fill, { width: `${Math.min(100, fundingProgress(info.totalContributed, info.target))}%` }]} />
        </View>
        <Secondary>{`${t.group.goal}: ${formatUsdc(info.target.toString())} · ${t.group.deadline}: ${formatDate(info.fundingDeadline)}`}</Secondary>
      </Card>

      <Text style={text.subtitle}>{t.group.contributors}</Text>
      {info.contributors.map((item) => (
        <View key={item.address} style={{ gap: spacing.xs }}>
          <View style={styles.row}>
            <Text style={text.body}>{item.address.toLowerCase() === me ? t.group.mine : shortAddress(item.address)}</Text>
            <Text style={text.body}>{`${formatUsdc(item.amount.toString())} · ${percentOf(item.amount, info.target)}% ${t.group.percent}`}</Text>
          </View>
          {mine > 0n && item.address.toLowerCase() !== me && open ? (
            <Button label={t.group.supportCoordinator} icon="users" variant="ghost" onPress={() => void send(encodeSupportCoordinator(BigInt(id), item.address), t.group.supportDone, "users")} disabled={busy} />
          ) : null}
        </View>
      ))}

      {funding && order.data.payer.toLowerCase() === me && mine === 0n ? <Banner icon="wallet">{t.group.inviteCreator}</Banner> : null}
      {funding ? <Field label={t.group.amountLabel} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={hint} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {open && hasProposal ? (
        <Card>
          <Body>{t.group.proposed}</Body>
          {vetoOpen(info.proposedAt, rule.data.vetoWindow, now) && mine > 0n ? (
            <>
              <Secondary>{t.group.vetoNote}</Secondary>
              <DetailActions actions={[{ key: "veto", label: t.group.veto, icon: "block", danger: true, onPress: () => void send(encodeVetoProvider(BigInt(id)), t.group.vetoDone, "block") }]} />
            </>
          ) : null}
        </Card>
      ) : null}
      <DetailActions actions={actions} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { height: 10, borderRadius: radius.pill, backgroundColor: colors.line, overflow: "hidden" },
  fill: { height: 10, backgroundColor: colors.brick },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
});
