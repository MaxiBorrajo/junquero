import { useQuery } from "@tanstack/react-query";
import { useFocusedInterval } from "../../lib/useFocusedInterval";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { PERMIT_VALIDITY_SECONDS, permitTypedData, splitSignature } from "../../chain/createOrder";
import { deployment } from "../../chain/deployment";
import { CasePhase } from "../../chain/arbitrationAbi";
import { encodeCommitSeed, encodeRevealSeed, encodeStakeWithPermit, encodeUnstake, encodeWithdrawReward, phaseView, randomHex32, seedCommitment, stakeNeeded } from "../../chain/jury";
import { sendViaRelay } from "../../chain/orderActions";
import { fetchCase } from "../../chain/serverReads";
import { readCommitters, readIsEligible, readJurorAccount, readParam, readReward, readRevealers, readTokenBalance, readTokenNonce } from "../../chain/reader";
import { Card } from "../../components/Card";
import { DetailActions, type DetailAction } from "../../components/DetailActions";
import { Body, Button, ErrorText, Field, Screen, Secondary, Title } from "../../components/ui";
import { useMyCases, type CaseRef } from "../../data/useCases";
import { loadSeed, saveSeed } from "../../jury/secrets";
import { secureSecretStorage } from "../../jury/secureStorage";
import { t } from "../../i18n";
import { formatAmount, toMicro } from "../../lib/money";
import { relayDepsFor } from "../../lib/relayHelpers";
import { useSession } from "../../session/SessionProvider";
import { useRunAction } from "../../lib/useRunAction";
import { signTyped } from "../../wallet/sign";
import { text } from "../../theme";

export default function JuryHub() {
  const { api, address } = useSession();
  const cases = useMyCases();
  const [amount, setAmount] = useState("");
  const { run: runAction, busy, error } = useRunAction();

  const juror = address as `0x${string}`;
  const account = useQuery({ queryKey: ["juror", address], enabled: Boolean(address), refetchInterval: useFocusedInterval(60_000), queryFn: () => readJurorAccount(juror) });
  const required = useQuery({ queryKey: ["param", "JUROR_STAKE"], queryFn: () => readParam("JUROR_STAKE"), staleTime: 5 * 60_000 });
  const reward = useQuery({ queryKey: ["reward", address], enabled: Boolean(address), queryFn: () => readReward(juror) });
  const [minError, setMinError] = useState(false);
  const [touched, setTouched] = useState(false);
  // Monto en camino: el depósito sigue en segundo plano y la pantalla queda libre.
  const [pending, setPending] = useState<string | null>(null);
  const freeNow = account.data ? account.data.staked - account.data.locked : 0n;
  const minDeposit = required.data !== undefined && account.data ? stakeNeeded(required.data, freeNow) : 0n;
  useEffect(() => {
    if (!touched && pending === null && minDeposit > 0n) setAmount(formatMicroPlain(minDeposit));
  }, [minDeposit, touched, pending]);

  if (!address) return <Screen><Secondary>{t.mine.needAccount}</Secondary></Screen>;

  const refresh = [["juror", address], ["reward", address], ["cases", address]] as const;
  const run = (action: () => Promise<string | void>, success: string, icon: string) =>
    runAction(action, { success, successIcon: icon, failure: t.jury.stepFailed, invalidate: refresh });

  const deposit = () => {
    if (toMicro(amount || "0") < minDeposit) {
      setMinError(true);
      return;
    }
    setMinError(false);
    const sent = amount.trim();
    setPending(sent);
    setTouched(false);
    setAmount("");
    void runAction(async () => {
      const value = toMicro(sent || "0");
      if (value <= 0n || (await readTokenBalance(juror)) < value) throw new Error("amount");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS);
      const signature = await signTyped(permitTypedData(deployment, juror, value, await readTokenNonce(juror), deadline, deployment.arbitration));
      const { v, r, s } = splitSignature(signature);
      return sendViaRelay(relayDepsFor(api, address), encodeStakeWithPermit(value, deadline, v, r, s), 1_500_000n, deployment.arbitration);
    }, {
      success: t.jury.stakeReady.replace("{amount}", sent),
      successIcon: "wallet",
      failure: t.jury.stepFailed,
      invalidate: refresh,
      onSuccess: () => {
        // Si la persona salió de la app, el aviso llega como notificación del teléfono.
        if (AppState.currentState !== "active") {
          void Notifications.scheduleNotificationAsync({ content: { title: t.jury.stakeReadyTitle, body: t.jury.stakeReady.replace("{amount}", sent), data: { kind: "jury_stake_ready", ref: "" } }, trigger: null }).catch(() => {});
        }
      },
    }).then((ok) => {
      setPending(null);
      if (!ok) setAmount(sent);
    });
  };

  const free = account.data ? account.data.staked - account.data.locked : 0n;
  const withdraw = () => run(() => sendViaRelay(relayDepsFor(api, address), encodeUnstake(free), 1_500_000n, deployment.arbitration), t.jury.withdrawn, "logout");
  const claim = () => run(() => sendViaRelay(relayDepsFor(api, address), encodeWithdrawReward(deployment.token), 1_500_000n, deployment.arbitration), t.jury.claimed, "check");

  return (
    <Screen>
      <Title>{t.jury.title}</Title>
      <Secondary>{t.jury.explanation}</Secondary>
      <Card>
        <Text style={text.subtitle}>{t.jury.howTitle}</Text>
        {t.jury.how.map((line) => (
          <Secondary key={line}>{`•  ${line}`}</Secondary>
        ))}
      </Card>
      <Card>
        <Row label={t.jury.stake} value={account.data ? formatAmount(account.data.staked.toString()) : "-"} />
        <Row label={t.jury.locked} value={account.data ? formatAmount(account.data.locked.toString()) : "-"} />
        <Row label={t.jury.active} value={account.data ? String(account.data.active) : "-"} />
        <Row label={t.jury.required} value={required.data !== undefined ? formatAmount(required.data.toString()) : "-"} />
        {required.data !== undefined && account.data && stakeNeeded(required.data, free) > 0n ? <Secondary>{t.jury.needStake.replace("{amount}", formatAmount(stakeNeeded(required.data, free).toString()))}</Secondary> : null}
      </Card>
      <Field label={t.jury.amountLabel} value={amount} onChangeText={(v) => { setTouched(true); setMinError(false); setAmount(v); }} keyboardType="decimal-pad" />
      {minDeposit > 0n && !minError ? <Secondary>{t.jury.minHint.replace("{amount}", formatAmount(minDeposit.toString()))}</Secondary> : null}
      {minError ? <ErrorText>{t.jury.belowMin.replace("{amount}", formatAmount(minDeposit.toString()))}</ErrorText> : null}
      <Button label={t.jury.deposit} icon="wallet" onPress={deposit} disabled={amount.trim() === "" || pending !== null} />
      {pending !== null ? <Secondary>{t.jury.depositing.replace("{amount}", pending)}</Secondary> : null}
      <DetailActions
        actions={([
          ...(reward.data && reward.data > 0n ? [{ key: "claim", label: `${t.jury.claimRewards} (${formatAmount(reward.data.toString())} USDC)`, icon: "check", onPress: () => void claim() }] : []),
          ...(free > 0n && !busy ? [{ key: "withdraw", label: t.jury.withdraw, icon: "logout", danger: true, onPress: () => void withdraw() }] : []),
        ] as DetailAction[])}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Text style={text.subtitle}>{t.jury.myCases}</Text>
      {(cases.data?.asJuror ?? []).length === 0 ? <Secondary>{t.jury.noMine}</Secondary> : null}
      {(cases.data?.asJuror ?? []).map((item) => (
        <Card key={item.caseId} onPress={() => router.push({ pathname: "/jury/[caseId]", params: { caseId: String(item.caseId) } })}>
          <Body>{`#${item.caseId}`}</Body>
          <Secondary>{t.jury.openCase}</Secondary>
        </Card>
      ))}

      <Text style={text.subtitle}>{t.jury.openCases}</Text>
      {(cases.data?.openForJury ?? []).length === 0 ? <Secondary>{t.jury.noOpen}</Secondary> : null}
      {(cases.data?.openForJury ?? []).map((item) => (
        <SeedCard key={item.caseId} item={item} juror={juror} />
      ))}
    </Screen>
  );
}

function formatMicroPlain(value: bigint): string {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole},${fraction}` : whole.toString();
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={text.body}>{label}</Text>
      <Text style={text.subtitle}>{value}</Text>
    </View>
  );
}

function SeedCard({ item, juror }: { item: CaseRef; juror: `0x${string}` }) {
  const { api } = useSession();
  const { run, busy, error } = useRunAction();
  const state = useQuery({
    queryKey: ["seed", item.caseId, juror],
    refetchInterval: useFocusedInterval(60_000),
    queryFn: async () => {
      const { snapshot } = await fetchCase(api, item.caseId);
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

  const refresh = [["seed", item.caseId], ["juror", juror], ["cases", juror]] as const;
  const act = (action: () => Promise<string | void>, success: string) =>
    run(action, { success, successIcon: "check", failure: t.jury.stepFailed, invalidate: refresh });

  const join = () =>
    act(async () => {
      const secret = randomHex32((n) => crypto.getRandomValues(new Uint8Array(n)));
      await saveSeed(secureSecretStorage, juror, item.caseId, snapshot.round, secret);
      return sendViaRelay(relayDepsFor(api, juror), encodeCommitSeed(BigInt(item.caseId), seedCommitment(BigInt(item.caseId), juror, secret)), 1_500_000n, deployment.arbitration);
    }, t.jury.joinedDone);

  const reveal = () =>
    act(async () => {
      const secret = await loadSeed(secureSecretStorage, juror, item.caseId, snapshot.round);
      if (!secret) throw new Error("secret");
      return sendViaRelay(relayDepsFor(api, juror), encodeRevealSeed(BigInt(item.caseId), secret), 1_500_000n, deployment.arbitration);
    }, t.jury.revealedDone);

  return (
    <Card>
      <Body>{`#${item.caseId} · ${snapshot.jurors} ${t.caseScreen.jurors}`}</Body>
      {!eligible && !committed ? <Secondary>{t.jury.notEligible}</Secondary> : null}
      {eligible && !committed && view === "seed-commit" ? <Button label={t.jury.join} icon="check" onPress={join} loading={busy} /> : null}
      {committed && !revealed && view === "seed-commit" ? <Secondary>{t.jury.joined}</Secondary> : null}
      {committed && !revealed && view === "seed-reveal" ? (hasSecret ? <Button label={t.jury.reveal} icon="check" onPress={reveal} loading={busy} /> : <ErrorText>{t.jury.lostSecret}</ErrorText>) : null}
      {revealed ? <Secondary>{t.jury.joined}</Secondary> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between" },
});
