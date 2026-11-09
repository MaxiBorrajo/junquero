import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PERMIT_VALIDITY_SECONDS, permitTypedData, splitSignature } from "../../chain/createOrder";
import { deployment } from "../../chain/deployment";
import { appealCost, canAppeal, canRespond, encodeAppealWithPermit, encodeRespond, partyRole, phaseView, reasonHash } from "../../chain/jury";
import { sendViaRelay } from "../../chain/orderActions";
import { readJurorFee, readTokenBalance, readTokenNonce } from "../../chain/reader";
import { Body, Button, ErrorText, Field, Screen, Secondary, Title } from "../../components/ui";
import { useChatKey } from "../../chat/ChatKeyProvider";
import { useCaseState } from "../../data/useCases";
import { EvidenceGallery, useEvidence } from "../../evidence/EvidenceSection";
import { shareWithJurors } from "../../evidence/share";
import { uploadStatement } from "../../evidence/statement";
import { t } from "../../i18n";
import { formatDate } from "../../lib/format";
import { formatAmount, formatUsdc } from "../../lib/money";
import { relayDepsFor } from "../../lib/relayHelpers";
import { useSession } from "../../session/SessionProvider";
import { isRejection, signTyped } from "../../wallet/sign";
import { colors, radius, spacing, text } from "../../theme";

export default function CaseScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const id = Number(caseId);
  const { api, address } = useSession();
  const { ensure } = useChatKey();
  const queryClient = useQueryClient();
  const state = useCaseState(id);
  const orderId = state.data?.snapshot.orderId ?? 0;
  const evidence = useEvidence(orderId);
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fee = useQuery({ queryKey: ["jurorFee"], queryFn: readJurorFee, staleTime: 5 * 60_000 });

  if (!state.data || !address) {
    return (
      <Screen>
        <Title>{t.caseScreen.title}</Title>
        <Secondary>{t.common.loading}</Secondary>
      </Screen>
    );
  }

  const { snapshot, jurors } = state.data;
  const now = Math.floor(Date.now() / 1000);
  const view = phaseView(snapshot, now);
  const role = partyRole(snapshot, address);
  const isParty = role !== "none";
  const counterpart = snapshot.payer.toLowerCase() === address.toLowerCase() ? snapshot.payee : snapshot.payer;
  const items = evidence.data ?? [];

  const run = async (action: () => Promise<void>, failure: string, success?: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      if (success) setMessage(success);
      await queryClient.invalidateQueries({ queryKey: ["case", id] });
      await queryClient.invalidateQueries({ queryKey: ["evidence", orderId] });
    } catch (caught) {
      setError(isRejection(caught) ? t.order.signCancelled : failure);
    } finally {
      setBusy(false);
    }
  };

  const respond = () =>
    run(async () => {
      const text = response.trim();
      await uploadStatement(api, address, counterpart, await ensure(), orderId, text);
      await sendViaRelay(relayDepsFor(api, address), encodeRespond(BigInt(id), reasonHash(text)), 1_500_000n, deployment.arbitration);
    }, t.dispute.failed, t.caseScreen.respondDone);

  const share = () =>
    run(async () => {
      const mine = await ensure();
      const sent = await shareWithJurors({ api, address, mine, orderId, items, jurors: jurors.map((j) => j.toLowerCase()) });
      if (sent === 0) throw new Error("nothing");
    }, t.caseScreen.shareFailed, t.caseScreen.shared);

  const appeal = () =>
    run(async () => {
      const account = address as `0x${string}`;
      const cost = appealCost(fee.data ?? 0n, snapshot.jurors);
      const balance = await readTokenBalance(account);
      if (balance < cost) throw new Error("balance");
      const deadline = BigInt(now + PERMIT_VALIDITY_SECONDS);
      const signature = await signTyped(permitTypedData(deployment, account, cost, await readTokenNonce(account), deadline, deployment.arbitration));
      const { v, r, s } = splitSignature(signature);
      await sendViaRelay(relayDepsFor(api, address), encodeAppealWithPermit(BigInt(id), deadline, v, r, s), 1_500_000n, deployment.arbitration);
    }, t.dispute.failed, t.caseScreen.appealDone);

  const phaseText =
    view === "waiting-response" ? t.caseScreen.phase.response : view.startsWith("seed") ? t.caseScreen.phase.seed : view.startsWith("vote") ? t.caseScreen.phase.vote : view.startsWith("verdict") ? t.caseScreen.phase.decided : view === "emergency" ? t.caseScreen.phase.emergency : t.caseScreen.phase.resolved;

  return (
    <Screen>
      <Title>{t.caseScreen.title}</Title>
      <Body>{phaseText}</Body>
      <View style={styles.box}>
        <Text style={text.label}>{t.order.amount}</Text>
        <Text style={text.subtitle}>{formatUsdc(snapshot.fee.toString())}</Text>
        <Secondary>{`${snapshot.jurors} ${t.caseScreen.jurors}`}</Secondary>
      </View>

      {view === "waiting-response" ? (
        <Secondary>{`${t.caseScreen.responseDeadline}: ${formatDate(snapshot.commitEnd)}`}</Secondary>
      ) : null}
      {canRespond(snapshot, address, now) ? (
        <>
          <Field label={t.caseScreen.responseLabel} value={response} onChangeText={setResponse} multiline maxLength={1500} />
          <Button label={t.caseScreen.respond} onPress={respond} loading={busy} disabled={response.trim().length < 10} />
        </>
      ) : null}
      {view === "waiting-response" && role === "claimant" ? <Secondary>{t.caseScreen.responseNoReply}</Secondary> : null}

      {isParty && (view.startsWith("vote") || view === "verdict-appealable" || view === "verdict-final") && jurors.length > 0 ? (
        <Button label={t.caseScreen.shareEvidence} variant="secondary" onPress={share} loading={busy} />
      ) : null}

      {view.startsWith("verdict") || view === "resolved" ? (
        <Body>{`${t.caseScreen.verdictFor} ${snapshot.verdictPayee ? t.caseScreen.forPayee : t.caseScreen.forPayer}.`}</Body>
      ) : null}
      {view === "verdict-appealable" ? <Secondary>{`${t.caseScreen.appealUntil} ${formatDate(snapshot.appealEnd)}`}</Secondary> : null}
      {canAppeal(snapshot, address, now) && view === "verdict-appealable" ? (
        <>
          <Secondary>{t.caseScreen.appealCost.replace("{amount}", formatAmount(appealCost(fee.data ?? 0n, snapshot.jurors).toString()))}</Secondary>
          <Button label={t.caseScreen.appeal} onPress={appeal} loading={busy} />
        </>
      ) : null}

      {isParty && items.length > 0 ? (
        <>
          <Text style={text.subtitle}>{t.caseScreen.evidence}</Text>
          <EvidenceGallery orderId={orderId} items={items} />
        </>
      ) : null}
      {message ? <Secondary>{message}</Secondary> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs, borderWidth: 1, borderColor: colors.line },
});
