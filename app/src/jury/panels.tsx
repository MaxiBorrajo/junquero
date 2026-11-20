import * as Notifications from "expo-notifications";
import { useQueries, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { PERMIT_VALIDITY_SECONDS, permitTypedData, splitSignature } from "../chain/createOrder";
import { deployment } from "../chain/deployment";
import { CasePhase } from "../chain/arbitrationAbi";
import { encodeCommitSeed, encodeRevealSeed, encodeStakeWithPermit, encodeUnstake, encodeWithdrawReward, phaseView, randomHex32, seedCommitment, stakeNeeded, type CaseView } from "../chain/jury";
import { sendViaRelay } from "../chain/orderActions";
import { fetchCase } from "../chain/serverReads";
import { readCommitters, readIsEligible, readJurorAccount, readParam, readReward, readRevealers, readTokenBalance, readTokenNonce } from "../chain/reader";
import { Card } from "../components/Card";
import { DetailActions, type DetailAction } from "../components/DetailActions";
import { Icon, type IconName } from "../components/Icon";
import { StatusChip } from "../components/StatusChip";
import { Body, Button, Chip, ErrorText, Field, Row as ChipRow, Secondary, Title } from "../components/ui";
import { useCaseState, useMyCases, type CaseRef } from "../data/useCases";
import { useSummary } from "../data/useSummary";
import { t } from "../i18n";
import { formatDate } from "../lib/format";
import { formatAmount, toMicro } from "../lib/money";
import { relayDepsFor } from "../lib/relayHelpers";
import { useFocusedInterval } from "../lib/useFocusedInterval";
import { useRunAction } from "../lib/useRunAction";
import { useSession } from "../session/SessionProvider";
import { colors, spacing, text } from "../theme";
import { signTyped } from "../wallet/sign";
import { CaseAmount, CaseSummary } from "./CaseSummary";
import { loadSeed, saveSeed } from "./secrets";
import { seedGroups, type SeedFilter } from "./seedAction";
import { seedQueryOptions } from "./seedState";
import { secureSecretStorage } from "./secureStorage";

// Título de cada pestaña de la vista de jurado, con la campanita: las notificaciones son las mismas que en la vista de Junquero.
export function JuryHeader({ title }: { title: string }) {
  const unread = useSummary().data?.unreadNotifications ?? 0;
  return (
    <View style={styles.header}>
      <Title>{title}</Title>
      <Pressable accessibilityRole="button" accessibilityLabel={t.notifications.title} onPress={() => router.push("/notifications")} style={styles.bell}>
        <Icon name="bell" size={22} color={colors.brick} />
        {unread > 0 ? (
          <View style={styles.dot}>
            <Text style={styles.dotText}>{unread > 9 ? "9+" : String(unread)}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

function useJurorAccount() {
  const { address } = useSession();
  const juror = address as `0x${string}`;
  const account = useQuery({ queryKey: ["juror", address], enabled: Boolean(address), refetchInterval: useFocusedInterval(60_000), queryFn: () => readJurorAccount(juror) });
  const required = useQuery({ queryKey: ["param", "JUROR_STAKE"], queryFn: () => readParam("JUROR_STAKE"), staleTime: 5 * 60_000 });
  const free = account.data ? account.data.staked - account.data.locked : 0n;
  const missing = required.data !== undefined && account.data ? stakeNeeded(required.data, free) : 0n;
  return { account, required, free, missing };
}

// Pestaña "Garantía": cuánto hay depositado, depositar, retirar y cobrar recompensas.
export function StakePanel() {
  const { api, address } = useSession();
  const [amount, setAmount] = useState("");
  const { run: runAction, busy, error } = useRunAction();
  const juror = address as `0x${string}`;
  const { account, required, free, missing: minDeposit } = useJurorAccount();
  const reward = useQuery({ queryKey: ["reward", address], enabled: Boolean(address), queryFn: () => readReward(juror) });
  const [minError, setMinError] = useState(false);
  const [touched, setTouched] = useState(false);
  // Monto en camino: el depósito sigue en segundo plano y la pantalla queda libre.
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    if (!touched && pending === null && minDeposit > 0n) setAmount(formatMicroPlain(minDeposit));
  }, [minDeposit, touched, pending]);

  if (!address) return <Secondary>{t.mine.needAccount}</Secondary>;

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

  const withdraw = () => run(() => sendViaRelay(relayDepsFor(api, address), encodeUnstake(free), 1_500_000n, deployment.arbitration), t.jury.withdrawn, "logout");
  const claim = () => run(() => sendViaRelay(relayDepsFor(api, address), encodeWithdrawReward(deployment.token), 1_500_000n, deployment.arbitration), t.jury.claimed, "check");

  return (
    <>
      <Secondary>{t.jury.explanation}</Secondary>
      <Card>
        <Row label={t.jury.stake} value={account.data ? formatAmount(account.data.staked.toString()) : "-"} />
        <Row label={t.jury.locked} value={account.data ? formatAmount(account.data.locked.toString()) : "-"} />
        <Row label={t.jury.active} value={account.data ? String(account.data.active) : "-"} />
        <Row label={t.jury.required} value={required.data !== undefined ? formatAmount(required.data.toString()) : "-"} />
        {minDeposit > 0n ? <Secondary>{t.jury.needStake.replace("{amount}", formatAmount(minDeposit.toString()))}</Secondary> : <Secondary>{t.jury.stakeOk}</Secondary>}
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
      <Card>
        <Text style={text.subtitle}>{t.jury.howTitle}</Text>
        {t.jury.how.map((line) => (
          <Secondary key={line}>{`•  ${line}`}</Secondary>
        ))}
      </Card>
    </>
  );
}

// Pestaña "Reclamos": los que buscan jurados, con el estado de cada uno para esta persona.
export function OpenCasesPanel() {
  const { api, address } = useSession();
  const cases = useMyCases();
  const { missing } = useJurorAccount();
  const [filter, setFilter] = useState<SeedFilter>("all");
  const open = cases.data?.openForJury ?? [];
  // Las mismas consultas que usa cada tarjeta: sirven para clasificar los reclamos sin pedir nada de más.
  const seeds = useQueries({
    queries: open.map((item) => ({ ...seedQueryOptions(api, address as `0x${string}`, item.caseId), enabled: Boolean(address), staleTime: 30_000 })),
  });
  if (!address) return <Secondary>{t.mine.needAccount}</Secondary>;
  const juror = address as `0x${string}`;
  const now = Math.floor(Date.now() / 1000);
  const visible = open.filter((_item, index) => filter === "all" || seedGroups(seeds[index]?.data, now).includes(filter));
  const options: SeedFilter[] = ["all", "toJoin", "toReveal", "joined", "notJoined"];
  const countOf = (option: SeedFilter) => (option === "all" ? open.length : open.filter((_item, index) => seedGroups(seeds[index]?.data, now).includes(option)).length);
  return (
    <>
      <Secondary>{t.jury.openIntro}</Secondary>
      {missing > 0n ? (
        <Card gap="sm">
          <Body>{t.jury.needStakeFirst.replace("{amount}", formatAmount(missing.toString()))}</Body>
          <Button label={t.jury.goToStake} icon="wallet" variant="outline" onPress={() => router.navigate("/jury-stake")} />
        </Card>
      ) : null}
      {open.length > 0 ? (
        <ChipRow>
          {options.map((option) => (
            <Chip
              key={option}
              icon={FILTER_ICON[option]}
              label={t.jury.filter[option]}
              badge={option === "toJoin" || option === "toReveal" ? countOf(option) : undefined}
              selected={filter === option}
              onPress={() => setFilter(option)}
            />
          ))}
        </ChipRow>
      ) : null}
      {open.length === 0 ? <Secondary>{t.jury.noOpen}</Secondary> : null}
      {open.length > 0 && visible.length === 0 ? <Secondary>{t.jury.filter.empty}</Secondary> : null}
      {visible.map((item) => (
        <SeedCard key={item.caseId} item={item} juror={juror} />
      ))}
    </>
  );
}

const FILTER_ICON: Record<SeedFilter, IconName> = { all: "list", toJoin: "send", toReveal: "clock", joined: "check", notJoined: "close" };

const PHASE_KEY: Record<CaseView, keyof typeof t.jury.phase> = {
  "waiting-response": "waiting",
  "seed-commit": "seed",
  "seed-reveal": "seed",
  "seed-draw": "seed",
  "vote-commit": "vote",
  "vote-reveal": "reveal",
  "vote-wait": "wait",
  "verdict-appealable": "done",
  "verdict-final": "done",
  emergency: "emergency",
  resolved: "done",
};

// Pestaña "Mis casos": los casos en los que me sortearon, con en qué etapa están y qué me toca hacer.
export function MyCasesPanel() {
  const { address } = useSession();
  const cases = useMyCases();
  if (!address) return <Secondary>{t.mine.needAccount}</Secondary>;
  const mine = cases.data?.asJuror ?? [];
  return (
    <>
      <Secondary>{t.jury.mineIntro}</Secondary>
      {mine.length === 0 ? <Secondary>{t.jury.noMine}</Secondary> : null}
      {mine.map((item) => (
        <MyCaseCard key={item.caseId} item={item} />
      ))}
    </>
  );
}

function MyCaseCard({ item }: { item: CaseRef }) {
  const state = useCaseState(item.caseId);
  const view = state.data ? phaseView(state.data.snapshot, Math.floor(Date.now() / 1000)) : null;
  const key = view ? PHASE_KEY[view] : null;
  return (
    <Card onPress={() => router.push({ pathname: "/jury/[caseId]", params: { caseId: String(item.caseId) } })} gap="sm">
      <View style={styles.titleRow}>
        <Text style={[text.subtitle, { flex: 1 }]}>{`${t.jury.caseLabel} #${item.caseId}`}</Text>
        {state.data ? <CaseAmount orderId={state.data.snapshot.orderId} /> : null}
      </View>
      <View style={styles.tagRow}>
        {key ? <StatusChip label={t.jury.phaseTag[key]} warn={key === "vote" || key === "reveal"} /> : null}
      </View>
      <Secondary>{key ? t.jury.phase[key] : t.common.loading}</Secondary>
    </Card>
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
  const state = useQuery({ ...seedQueryOptions(api, juror, item.caseId), refetchInterval: useFocusedInterval(60_000) });

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

  // Un solo estado claro por reclamo: qué pasó con mi anotación y qué me toca ahora.
  const end = formatDate(snapshot.revealEnd);
  const status =
    revealed ? t.jury.statusRevealed.replace("{end}", end)
    : committed && view === "seed-reveal" ? (hasSecret ? t.jury.statusRevealNow.replace("{end}", end) : t.jury.lostSecret)
    : committed ? t.jury.statusJoined.replace("{date}", formatDate(snapshot.commitEnd)).replace("{end}", end)
    : !eligible ? t.jury.notEligible
    : view === "seed-commit" ? t.jury.statusCanJoin.replace("{date}", formatDate(snapshot.commitEnd))
    : t.jury.statusClosed;

  // La misma forma que las tarjetas de Mis trabajos: título y monto, y el estado en pastillas.
  const canJoin = eligible && !committed && view === "seed-commit";
  const mustReveal = committed && !revealed && view === "seed-reveal" && hasSecret;
  const tag = revealed ? t.jury.tag.revealed : committed ? (mustReveal ? t.jury.tag.toReveal : t.jury.tag.joined) : !eligible ? t.jury.tag.notEligible : canJoin ? t.jury.tag.toJoin : t.jury.tag.closed;

  return (
    <Card gap="sm">
      <View style={styles.titleRow}>
        <Text style={[text.subtitle, { flex: 1 }]}>{`${t.jury.caseLabel} #${item.caseId}`}</Text>
        <CaseAmount orderId={snapshot.orderId} />
      </View>
      <View style={styles.tagRow}>
        <StatusChip label={tag} warn={canJoin || mustReveal} />
        <StatusChip label={`${snapshot.jurors} ${t.caseScreen.jurors}`} />
      </View>
      <Secondary>{status}</Secondary>
      <CaseSummary orderId={snapshot.orderId} />
      {canJoin ? <Button label={t.jury.join} icon="check" onPress={join} loading={busy} /> : null}
      {mustReveal ? <Button label={t.jury.reveal} icon="check" onPress={reveal} loading={busy} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between" },
  titleRow: { flexDirection: "row", gap: spacing.sm },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight: 56 },
  bell: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 2, right: 0, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.brick, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  dotText: { color: colors.white, fontSize: 11, fontWeight: "700" },
});
