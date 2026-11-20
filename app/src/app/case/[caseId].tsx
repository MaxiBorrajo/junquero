import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StatusChip } from "../../components/StatusChip";
import { PERMIT_VALIDITY_SECONDS, permitTypedData, splitSignature } from "../../chain/createOrder";
import { deployment } from "../../chain/deployment";
import { appealCost, canAppeal, canRespond, encodeAppealWithPermit, encodeRespond, partyRole, phaseView, reasonHash } from "../../chain/jury";
import { sendViaRelay } from "../../chain/orderActions";
import { readJurorFee, readTokenBalance, readTokenNonce } from "../../chain/reader";
import { Card } from "../../components/Card";
import { Body, Button, ErrorText, Field, Screen, Secondary, Title } from "../../components/ui";
import { useChatKey } from "../../chat/ChatKeyProvider";
import { DrawProgress } from "../../jury/DrawProgress";
import { CaseEvidence } from "../../jury/CaseEvidence";
import { EvidencePicker } from "../../evidence/EvidencePicker";
import type { PickedFile } from "../../lib/pick";
import { useNow } from "../../lib/useNow";
import { useCaseState } from "../../data/useCases";
import { EvidenceThumbnails, useEvidence } from "../../evidence/EvidenceSection";
import { shareWithJurors } from "../../evidence/share";
import { uploadStatement } from "../../evidence/statement";
import { t } from "../../i18n";
import { formatDate } from "../../lib/format";
import { formatAmount, formatUsdc } from "../../lib/money";
import { relayDepsFor } from "../../lib/relayHelpers";
import { useRunAction } from "../../lib/useRunAction";
import { useSession } from "../../session/SessionProvider";
import { signTyped } from "../../wallet/sign";
import { spacing, text } from "../../theme";

// La transacción tarda unos segundos en entrar: si queda menos que esto, el plazo se da por vencido.
const RESPOND_MARGIN_SECONDS = 15;

export default function CaseScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const id = Number(caseId);
  const { api, address } = useSession();
  const { ensure } = useChatKey();
  const state = useCaseState(id);
  const orderId = state.data?.snapshot.orderId ?? 0;
  const evidence = useEvidence(orderId);
  const [response, setResponse] = useState("");
  const [responseFiles, setResponseFiles] = useState<PickedFile[]>([]);
  const { run: runAction, busy, error } = useRunAction();
  // Las pruebas se comparten solas con los jurados apenas hay sorteo (y de nuevo si se suben más): la persona no tiene que acordarse.
  const sharedKey = useRef("");
  // Si a algún jurado todavía le falta su clave, se vuelve a intentar cada tanto mientras la pantalla está abierta.
  const retry = useNow(30_000);
  useEffect(() => {
    const data = state.data;
    if (!data || !address || !evidence.data) return;
    const lower = address.toLowerCase();
    const isPartyHere = data.snapshot.payer.toLowerCase() === lower || data.snapshot.payee.toLowerCase() === lower;
    const own = evidence.data.filter((item) => item.uploader.toLowerCase() === lower && item.wrappedKey);
    if (!isPartyHere || data.jurors.length === 0 || own.length === 0) return;
    const key = `${data.jurors.length}:${own.map((item) => item.hash).join(",")}`;
    if (sharedKey.current === key) return;
    void (async () => {
      try {
        const mine = await ensure();
        const sent = await shareWithJurors({ api, address, mine, orderId: data.snapshot.orderId, items: evidence.data!, jurors: data.jurors.map((j) => j.toLowerCase()) });
        // Si algún jurado todavía no tiene su clave publicada no se da por hecho: se vuelve a intentar en la próxima lectura.
        if (sent >= own.length * data.jurors.length) sharedKey.current = key;
      } catch {}
    })();
  }, [state.data, evidence.data, address, api, ensure, retry]);

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

  const refresh = [["case", id], ["evidence", orderId]] as const;
  const run = (action: () => Promise<string | void>, failure: string, success: string, icon: string, mapError?: (error: unknown) => string | null) =>
    runAction(action, { success, successIcon: icon, failure, invalidate: refresh, mapError });

  const respond = () =>
    run(async () => {
      // El plazo corre en la cadena: se mira con la hora de ahora y no con la de cuando se abrió la pantalla, así no se sube un relato fuera de tiempo.
      if (Math.floor(Date.now() / 1000) > snapshot.commitEnd - RESPOND_MARGIN_SECONDS) throw new Error("respond_late");
      const text = response.trim();
      await uploadStatement(api, address, counterpart, await ensure(), orderId, text, responseFiles);
      return sendViaRelay(relayDepsFor(api, address), encodeRespond(BigInt(id), reasonHash(text)), 1_500_000n, deployment.arbitration);
    }, t.dispute.failed, t.caseScreen.respondDone, "send", (failure) => ((failure as Error).message === "respond_late" ? t.caseScreen.respondLate : null));

  const appeal = () =>
    run(async () => {
      const account = address as `0x${string}`;
      const cost = appealCost(fee.data ?? 0n, snapshot.jurors);
      const balance = await readTokenBalance(account);
      if (balance < cost) throw new Error("balance");
      const deadline = BigInt(now + PERMIT_VALIDITY_SECONDS);
      const signature = await signTyped(permitTypedData(deployment, account, cost, await readTokenNonce(account), deadline, deployment.arbitration));
      const { v, r, s } = splitSignature(signature);
      return sendViaRelay(relayDepsFor(api, address), encodeAppealWithPermit(BigInt(id), deadline, v, r, s), 1_500_000n, deployment.arbitration);
    }, t.dispute.failed, t.caseScreen.appealDone, "scale");

  const phaseText =
    view === "waiting-response" ? t.caseScreen.phase.response : view.startsWith("seed") ? t.caseScreen.phase.seed : view.startsWith("vote") ? t.caseScreen.phase.vote : view.startsWith("verdict") ? t.caseScreen.phase.decided : view === "emergency" ? t.caseScreen.phase.emergency : t.caseScreen.phase.resolved;

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Title>{t.caseScreen.title}</Title>
        <StatusChip label={phaseText} warn={view === "emergency"} />
      </View>
      <Card gap="xs">
        <Text style={text.label}>{t.order.amount}</Text>
        <Text style={text.subtitle}>{formatUsdc(snapshot.fee.toString())}</Text>
        <Secondary>{`${snapshot.jurors} ${t.caseScreen.jurors}`}</Secondary>
      </Card>

      {isParty ? <DrawProgress caseId={id} snapshot={snapshot} /> : null}

      {view === "waiting-response" ? (
        <Secondary>{`${t.caseScreen.responseDeadline}: ${formatDate(snapshot.commitEnd)}`}</Secondary>
      ) : null}
      {canRespond(snapshot, address, now) ? (
        <>
          <Field label={t.caseScreen.responseLabel} value={response} onChangeText={setResponse} multiline maxLength={1500} />
          <EvidencePicker files={responseFiles} onChange={setResponseFiles} />
          <Button label={t.caseScreen.respond} icon="send" onPress={respond} loading={busy} disabled={response.trim().length < 10} />
        </>
      ) : null}
      {view === "waiting-response" && role === "claimant" ? <Secondary>{t.caseScreen.responseNoReply}</Secondary> : null}

      {view.startsWith("verdict") || view === "resolved" ? (
        <Body>{`${t.caseScreen.verdictFor} ${snapshot.verdictPayee ? t.caseScreen.forPayee : t.caseScreen.forPayer}.`}</Body>
      ) : null}
      {view === "verdict-appealable" ? <Secondary>{`${t.caseScreen.appealUntil} ${formatDate(snapshot.appealEnd)}`}</Secondary> : null}
      {canAppeal(snapshot, address, now) && view === "verdict-appealable" ? (
        <>
          <Secondary>{t.caseScreen.appealCost.replace("{amount}", formatAmount(appealCost(fee.data ?? 0n, snapshot.jurors).toString()))}</Secondary>
          <Button label={t.caseScreen.appeal} icon="scale" onPress={appeal} loading={busy} />
        </>
      ) : null}

      {isParty && items.length > 0 ? <CaseEvidence orderId={orderId} items={items} payer={snapshot.payer} payee={snapshot.payee} /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}
