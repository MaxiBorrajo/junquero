import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { PERMIT_VALIDITY_SECONDS, permitTypedData } from "../../chain/createOrder";
import { deployment } from "../../chain/deployment";
import { checkContribution, contributionLimits, encodeContribute, encodeRefundFunding, encodeVetoProvider, encodeWithdrawContribution, fundingProgress, percentOf, vetoOpen } from "../../chain/group";
import { OrderStatus } from "../../chain/orderAbi";
import { sendViaRelay } from "../../chain/orderActions";
import { readContributionRule, readGroup, readTokenBalance, readTokenNonce } from "../../chain/reader";
import { Body, Button, ErrorText, Field, Screen, Secondary, Title } from "../../components/ui";
import { useOrder } from "../../data/useOrder";
import { t } from "../../i18n";
import { formatDate, shortAddress } from "../../lib/format";
import { formatAmount, formatUsdc, toMicro } from "../../lib/money";
import { relayDepsFor } from "../../lib/relayHelpers";
import { useSession } from "../../session/SessionProvider";
import { isRejection, signTyped } from "../../wallet/sign";
import { colors, radius, spacing, text } from "../../theme";

export default function GroupScreen() {
  const { orderId, title } = useLocalSearchParams<{ orderId: string; title?: string }>();
  const id = Number(orderId);
  const { api, address } = useSession();
  const queryClient = useQueryClient();
  const order = useOrder(id);
  const group = useQuery({ queryKey: ["group", id], refetchInterval: 15_000, queryFn: () => readGroup(id) });
  const rule = useQuery({ queryKey: ["contributionRule"], queryFn: readContributionRule, staleTime: 10 * 60_000 });
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const run = async (action: () => Promise<void>, success: string, failure: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      setAmount("");
      await queryClient.invalidateQueries({ queryKey: ["group", id] });
      await queryClient.invalidateQueries({ queryKey: ["order", id] });
    } catch (caught) {
      const text = String((caught as Error)?.message ?? "");
      setError(isRejection(caught) ? t.order.signCancelled : text.startsWith("balance:") ? t.group.insufficient.replace("{amount}", formatAmount(text.split(":")[1] ?? "0")) : failure);
    } finally {
      setBusy(false);
    }
  };

  const contribute = () =>
    run(async () => {
      if (!check.ok) {
        if (check.reason === "range") throw new Error("range");
        throw new Error(check.reason);
      }
      const account = address as `0x${string}`;
      const balance = await readTokenBalance(account);
      if (balance < parsed) throw new Error(`balance:${parsed - balance}`);
      const deadline = BigInt(now + PERMIT_VALIDITY_SECONDS);
      const signature = await signTyped(permitTypedData(deployment, account, parsed, await readTokenNonce(account), deadline));
      await sendViaRelay(relayDepsFor(api, address), encodeContribute(BigInt(id), parsed, { method: 0, nonce: 0n, deadline, signature }));
    }, t.group.done, t.group.failed);

  const send = (data: `0x${string}`, success: string) => run(async () => void (await sendViaRelay(relayDepsFor(api, address), data)), success, t.group.failed);

  const hint = !amount.trim()
    ? null
    : check.ok
      ? null
      : check.reason === "range"
        ? t.group.range.replace("{min}", formatAmount(limits.min.toString())).replace("{max}", formatAmount(limits.max.toString()))
        : check.reason === "exceeds"
          ? t.group.exceeds.replace("{remaining}", formatAmount((check.remaining ?? 0n).toString()))
          : null;

  return (
    <Screen>
      <Title>{title ?? t.group.title}</Title>
      <Body>{funding ? t.group.funding : open ? t.group.funded : ""}</Body>
      <View style={styles.box}>
        <Text style={text.label}>{t.group.raised}</Text>
        <Text style={text.amount}>{formatUsdc(info.totalContributed.toString())}</Text>
        <View style={styles.bar}>
          <View style={[styles.fill, { width: `${Math.min(100, fundingProgress(info.totalContributed, info.target))}%` }]} />
        </View>
        <Secondary>{`${t.group.goal}: ${formatUsdc(info.target.toString())} · ${t.group.deadline}: ${formatDate(info.fundingDeadline)}`}</Secondary>
      </View>

      <Text style={text.subtitle}>{t.group.contributors}</Text>
      {info.contributors.map((item) => (
        <View key={item.address} style={styles.row}>
          <Text style={text.body}>{item.address.toLowerCase() === me ? t.group.mine : shortAddress(item.address)}</Text>
          <Text style={text.body}>{`${formatUsdc(item.amount.toString())} · ${percentOf(item.amount, info.target)}% ${t.group.percent}`}</Text>
        </View>
      ))}

      {funding ? (
        <>
          <Field label={t.group.amountLabel} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={hint} />
          <Button label={t.group.contribute} onPress={contribute} loading={busy} disabled={!check.ok} />
        </>
      ) : null}
      {mine > 0n && (funding || open) ? <Button label={t.group.withdraw} variant="ghost" onPress={() => send(encodeWithdrawContribution(BigInt(id)), t.group.done)} disabled={busy} /> : null}
      {funding && now > info.fundingDeadline ? <Button label={t.group.refund} variant="secondary" onPress={() => send(encodeRefundFunding(BigInt(id)), t.group.done)} disabled={busy} /> : null}
      {open && hasProposal ? (
        <View style={styles.box}>
          <Body>{t.group.proposed}</Body>
          {vetoOpen(info.proposedAt, rule.data.vetoWindow, now) && mine > 0n ? (
            <>
              <Secondary>{t.group.vetoNote}</Secondary>
              <Button label={t.group.veto} variant="secondary" onPress={() => send(encodeVetoProvider(BigInt(id)), t.group.vetoDone)} disabled={busy} />
            </>
          ) : null}
        </View>
      ) : null}
      <Button label={t.group.share} variant="ghost" onPress={() => void Share.share({ message: `${title ?? ""} · junquero://group/${id}` })} />
      {message ? <Secondary>{message}</Secondary> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.line },
  bar: { height: 10, borderRadius: radius.pill, backgroundColor: colors.line, overflow: "hidden" },
  fill: { height: 10, backgroundColor: colors.brick },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
});
