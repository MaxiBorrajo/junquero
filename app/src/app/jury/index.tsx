import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PERMIT_VALIDITY_SECONDS, permitTypedData, splitSignature } from "../../chain/createOrder";
import { deployment } from "../../chain/deployment";
import { CasePhase } from "../../chain/arbitrationAbi";
import { encodeCommitSeed, encodeRevealSeed, encodeStakeWithPermit, encodeUnstake, encodeWithdrawReward, phaseView, randomHex32, seedCommitment, stakeNeeded } from "../../chain/jury";
import { sendViaRelay } from "../../chain/orderActions";
import { readCase, readCommitters, readIsEligible, readJurorAccount, readParam, readReward, readRevealers, readTokenBalance, readTokenNonce } from "../../chain/reader";
import { Body, Button, ErrorText, Field, Screen, Secondary, Title } from "../../components/ui";
import { useMyCases, type CaseRef } from "../../data/useCases";
import { loadSeed, saveSeed } from "../../jury/secrets";
import { secureSecretStorage } from "../../jury/secureStorage";
import { t } from "../../i18n";
import { formatAmount, toMicro } from "../../lib/money";
import { relayDepsFor } from "../../lib/relayHelpers";
import { useSession } from "../../session/SessionProvider";
import { isRejection, signTyped } from "../../wallet/sign";
import { colors, radius, spacing, text } from "../../theme";

export default function JuryHub() {
  const { api, address } = useSession();
  const queryClient = useQueryClient();
  const cases = useMyCases();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const juror = address as `0x${string}`;
  const account = useQuery({ queryKey: ["juror", address], enabled: Boolean(address), refetchInterval: 20_000, queryFn: () => readJurorAccount(juror) });
  const required = useQuery({ queryKey: ["param", "JUROR_STAKE"], queryFn: () => readParam("JUROR_STAKE"), staleTime: 5 * 60_000 });
  const reward = useQuery({ queryKey: ["reward", address], enabled: Boolean(address), queryFn: () => readReward(juror) });

  if (!address) return <Screen><Secondary>{t.mine.needAccount}</Secondary></Screen>;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["juror", address] });
    await queryClient.invalidateQueries({ queryKey: ["reward", address] });
    await queryClient.invalidateQueries({ queryKey: ["cases", address] });
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (caught) {
      setError(isRejection(caught) ? t.order.signCancelled : t.jury.stepFailed);
    } finally {
      setBusy(false);
    }
  };

  const deposit = () =>
    run(async () => {
      const value = toMicro(amount || "0");
      if (value <= 0n || (await readTokenBalance(juror)) < value) throw new Error("amount");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS);
      const signature = await signTyped(permitTypedData(deployment, juror, value, await readTokenNonce(juror), deadline, deployment.arbitration));
      const { v, r, s } = splitSignature(signature);
      await sendViaRelay(relayDepsFor(api, address), encodeStakeWithPermit(value, deadline, v, r, s), 1_500_000n, deployment.arbitration);
      setAmount("");
    });

  const free = account.data ? account.data.staked - account.data.locked : 0n;
  const withdraw = () => run(async () => void (await sendViaRelay(relayDepsFor(api, address), encodeUnstake(free), 1_500_000n, deployment.arbitration)));
  const claim = () => run(async () => void (await sendViaRelay(relayDepsFor(api, address), encodeWithdrawReward(deployment.token), 1_500_000n, deployment.arbitration)));

  return (
    <Screen>
      <Title>{t.jury.title}</Title>
      <Secondary>{t.jury.explanation}</Secondary>
      <View style={styles.box}>
        <Row label={t.jury.stake} value={account.data ? formatAmount(account.data.staked.toString()) : "-"} />
        <Row label={t.jury.locked} value={account.data ? formatAmount(account.data.locked.toString()) : "-"} />
        <Row label={t.jury.active} value={account.data ? String(account.data.active) : "-"} />
        <Row label={t.jury.required} value={required.data !== undefined ? formatAmount(required.data.toString()) : "-"} />
        {required.data !== undefined && account.data && stakeNeeded(required.data, free) > 0n ? <Secondary>{t.jury.needStake.replace("{amount}", formatAmount(stakeNeeded(required.data, free).toString()))}</Secondary> : null}
      </View>
      <Field label={t.jury.amountLabel} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <Button label={t.jury.deposit} onPress={deposit} loading={busy} disabled={amount.trim() === ""} />
      <Button label={t.jury.withdraw} variant="ghost" onPress={withdraw} disabled={busy || free === 0n} />
      {reward.data && reward.data > 0n ? <Button label={`${t.jury.claimRewards} (${formatAmount(reward.data.toString())} USDC)`} variant="secondary" onPress={claim} disabled={busy} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Text style={text.subtitle}>{t.jury.myCases}</Text>
      {(cases.data?.asJuror ?? []).length === 0 ? <Secondary>{t.jury.noMine}</Secondary> : null}
      {(cases.data?.asJuror ?? []).map((item) => (
        <View key={item.caseId} style={styles.box}>
          <Body>{`#${item.caseId}`}</Body>
          <Button label={t.jury.openCase} variant="secondary" onPress={() => router.push({ pathname: "/jury/[caseId]", params: { caseId: String(item.caseId) } })} />
        </View>
      ))}

      <Text style={text.subtitle}>{t.jury.openCases}</Text>
      {(cases.data?.openForJury ?? []).length === 0 ? <Secondary>{t.jury.noOpen}</Secondary> : null}
      {(cases.data?.openForJury ?? []).map((item) => (
        <SeedCard key={item.caseId} item={item} juror={juror} onDone={refresh} />
      ))}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={text.body}>{label}</Text>
      <Text style={text.subtitle}>{value}</Text>
    </View>
  );
}

function SeedCard({ item, juror, onDone }: { item: CaseRef; juror: `0x${string}`; onDone: () => Promise<void> }) {
  const { api } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = useQuery({
    queryKey: ["seed", item.caseId, juror],
    refetchInterval: 20_000,
    queryFn: async () => {
      const snapshot = await readCase(item.caseId);
      if (snapshot.phase !== CasePhase.Seed) return null;
      const [eligible, committers, revealers, secret] = await Promise.all([
        readIsEligible(item.caseId, juror),
        readCommitters(item.caseId, snapshot.round),
        readRevealers(item.caseId, snapshot.round),
        loadSeed(secureSecretStorage, juror, item.caseId, snapshot.round),
      ]);
      const lower = (list: readonly string[]) => list.map((a) => a.toLowerCase());
      return { snapshot, eligible, committed: lower(committers).includes(juror.toLowerCase()), revealed: lower(revealers).includes(juror.toLowerCase()), hasSecret: secret !== null };
    },
  });

  if (!state.data) return null;
  const { snapshot, eligible, committed, revealed, hasSecret } = state.data;
  const view = phaseView(snapshot, Math.floor(Date.now() / 1000));

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await state.refetch();
      await onDone();
    } catch (caught) {
      setError(isRejection(caught) ? t.order.signCancelled : t.jury.stepFailed);
    } finally {
      setBusy(false);
    }
  };

  const join = () =>
    act(async () => {
      const secret = randomHex32((n) => crypto.getRandomValues(new Uint8Array(n)));
      await saveSeed(secureSecretStorage, juror, item.caseId, snapshot.round, secret);
      await sendViaRelay(relayDepsFor(api, juror), encodeCommitSeed(BigInt(item.caseId), seedCommitment(BigInt(item.caseId), juror, secret)), 1_500_000n, deployment.arbitration);
    });

  const reveal = () =>
    act(async () => {
      const secret = await loadSeed(secureSecretStorage, juror, item.caseId, snapshot.round);
      if (!secret) throw new Error("secret");
      await sendViaRelay(relayDepsFor(api, juror), encodeRevealSeed(BigInt(item.caseId), secret), 1_500_000n, deployment.arbitration);
    });

  return (
    <View style={styles.box}>
      <Body>{`#${item.caseId} · ${snapshot.jurors} ${t.caseScreen.jurors}`}</Body>
      {!eligible && !committed ? <Secondary>{t.jury.notEligible}</Secondary> : null}
      {eligible && !committed && view === "seed-commit" ? <Button label={t.jury.join} onPress={join} loading={busy} /> : null}
      {committed && !revealed && view === "seed-commit" ? <Secondary>{t.jury.joined}</Secondary> : null}
      {committed && !revealed && view === "seed-reveal" ? (hasSecret ? <Button label={t.jury.reveal} onPress={reveal} loading={busy} /> : <ErrorText>{t.jury.lostSecret}</ErrorText>) : null}
      {revealed ? <Secondary>{t.jury.joined}</Secondary> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: "row", justifyContent: "space-between" },
});
