import { useQuery } from "@tanstack/react-query";
import { useFocusedInterval } from "../../lib/useFocusedInterval";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { useChatKey } from "../../chat/ChatKeyProvider";
import { deployment } from "../../chain/deployment";
import { VOTE_PAYEE, VOTE_PAYER } from "../../chain/arbitrationAbi";
import { encodeCommitVote, encodeRevealVote, jurorAction, phaseView, randomHex32, voteCommitment } from "../../chain/jury";
import { sendViaRelay } from "../../chain/orderActions";
import { readJurorCase, readParam } from "../../chain/reader";
import { Body, Button, Chip, ErrorText, Labeled, Row, Screen, Secondary, Title } from "../../components/ui";
import { useCaseState, useJuryResults } from "../../data/useCases";
import { EvidenceThumbnails, useEvidence } from "../../evidence/EvidenceSection";
import { loadVote, saveVote } from "../../jury/secrets";
import { secureSecretStorage } from "../../jury/secureStorage";
import { t } from "../../i18n";
import { formatDate } from "../../lib/format";
import { formatUsdc } from "../../lib/money";
import { relayDepsFor } from "../../lib/relayHelpers";
import { useRunAction } from "../../lib/useRunAction";
import { useSession } from "../../session/SessionProvider";
import { spacing, text } from "../../theme";
import { deadlineText } from "../../jury/panels";
import { jurorStage } from "../../jury/seedAction";
import { Banner } from "../../components/Banner";
import { CaseEvidence } from "../../jury/CaseEvidence";
import { useNow } from "../../lib/useNow";

export default function JurorCase() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const id = Number(caseId);
  const { api, address } = useSession();
  const state = useCaseState(id);
  const orderId = state.data?.snapshot.orderId ?? 0;
  const evidence = useEvidence(orderId);
  const juror = address as `0x${string}`;
  const mine = useQuery({ queryKey: ["jurorCase", id, address], enabled: Boolean(address), refetchInterval: useFocusedInterval(30_000), queryFn: () => readJurorCase(id, juror) });
  const [choice, setChoice] = useState<number | null>(null);
  const { run, busy, error } = useRunAction();
  const tick = useNow();
  const { ensure } = useChatKey();
  useEffect(() => {
    void ensure().catch(() => {});
  }, [ensure]);

  if (!state.data || !mine.data || !address) {
    return (
      <Screen>
        <Title>{t.jury.title}</Title>
        <Secondary>{t.common.loading}</Secondary>
      </Screen>
    );
  }

  const { snapshot } = state.data;
  const now = Math.floor(Date.now() / 1000);
  const view = phaseView(snapshot, now);
  const action = jurorAction(view, mine.data, true);
  const stage = jurorStage(view, mine.data);

  const refresh = [["jurorCase", id], ["case", id]] as const;

  const commit = () =>
    run(
      async () => {
        if (choice === null) throw new Error("choice");
        const salt = randomHex32((n) => crypto.getRandomValues(new Uint8Array(n)));
        await saveVote(secureSecretStorage, juror, id, { vote: choice, salt });
        return sendViaRelay(relayDepsFor(api, address), encodeCommitVote(BigInt(id), voteCommitment(BigInt(id), juror, choice, salt)), 1_500_000n, deployment.arbitration);
      },
      { success: t.jury.voteSaved, successIcon: "lock", failure: t.jury.stepFailed, invalidate: refresh },
    );

  const reveal = () =>
    run(
      async () => {
        const saved = await loadVote(secureSecretStorage, juror, id);
        if (!saved) throw new Error("secret");
        return sendViaRelay(relayDepsFor(api, address), encodeRevealVote(BigInt(id), saved.vote, saved.salt), 1_500_000n, deployment.arbitration);
      },
      { success: t.jury.voteRevealed, successIcon: "check", failure: t.jury.stepFailed, invalidate: refresh },
    );

  if (!mine.data.selected) {
    return (
      <Screen>
        <Title>{t.jury.title}</Title>
        <Body>{t.jury.notDrawn}</Body>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Title>{`${t.caseScreen.title} #${id}`}</Title>
        {stage.tag === "missed" ? null : <Secondary>{stage.tag === "toVote" ? t.jury.sealedHint : t.jury.stageText[stage.tag]}</Secondary>}
        {stage.tag === "done" && (view.startsWith("verdict") || view === "resolved") ? (
          <>
            <Body>{t.jury.result.replace("{winner}", snapshot.verdictPayee ? t.jury.partyB : t.jury.partyA).replace("{b}", String(snapshot.payeeVotes)).replace("{a}", String(snapshot.payerVotes))}</Body>
            <CaseMoney caseId={id} />
            {mine.data.vote !== 0 ? (
              <Secondary>{(mine.data.vote === (snapshot.verdictPayee ? VOTE_PAYEE : VOTE_PAYER) ? t.jury.votedWithVerdict : t.jury.votedAgainstVerdict).replace("{mine}", mine.data.vote === VOTE_PAYEE ? t.jury.partyB : t.jury.partyA)}</Secondary>
            ) : null}
          </>
        ) : null}
        {stage.deadline === "commit" ? <Text style={text.label}>{deadlineText("commit", snapshot.commitEnd, tick)}</Text> : null}
        {stage.deadline === "reveal" || stage.deadline === "count" ? <Text style={text.label}>{deadlineText(stage.deadline, snapshot.revealEnd, tick)}</Text> : null}
      </View>
      {stage.tag === "missed" ? <Banner tone="warning" icon="alert">{t.jury.missedBanner}</Banner> : null}

      {(evidence.data ?? []).length === 0 ? (
        <>
          <Text style={text.subtitle}>{t.jury.statements}</Text>
          <Secondary>{t.jury.noEvidence}</Secondary>
        </>
      ) : (
        <CaseEvidence orderId={orderId} items={evidence.data ?? []} payer={snapshot.payer} payee={snapshot.payee} />
      )}

      {action === "commit-vote" ? (
        <>
          <Labeled label={t.jury.voteFor}>
            <Row>
              <Chip label={t.jury.partyA} selected={choice === VOTE_PAYER} onPress={() => setChoice(VOTE_PAYER)} />
              <Chip label={t.jury.partyB} selected={choice === VOTE_PAYEE} onPress={() => setChoice(VOTE_PAYEE)} />
            </Row>
          </Labeled>
          <Button label={t.jury.commitVote} icon="lock" onPress={commit} loading={busy} disabled={choice === null} />
        </>
      ) : null}
      {action === "reveal-vote" ? <Button label={t.jury.revealVote} icon="check" onPress={reveal} loading={busy} /> : null}
      {view === "vote-commit" && action === "wait" && mine.data.voteCommit !== `0x${"0".repeat(64)}` ? <Secondary>{t.jury.waitReveal}</Secondary> : null}
      {action === "done" ? <Secondary>{t.jury.voteRevealed}</Secondary> : null}
      {error && (action === "commit-vote" || action === "reveal-vote") ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}

// Cuánto perdió de garantía y cuánto ganó de recompensa el jurado en este caso (sale de los eventos del contrato).
function CaseMoney({ caseId }: { caseId: number }) {
  const results = useJuryResults();
  const required = useQuery({ queryKey: ["param", "JUROR_STAKE"], queryFn: () => readParam("JUROR_STAKE"), staleTime: 5 * 60_000 });
  const item = results.data?.cases[String(caseId)];
  const slashed = BigInt(item?.slashed ?? "0");
  const earned = BigInt(item?.earned ?? "0");
  return (
    <>
      {required.data !== undefined ? <Secondary>{t.jury.resultStake.replace("{stake}", formatUsdc(required.data.toString()))}</Secondary> : null}
      {slashed > 0n ? <Secondary>{t.jury.resultLost.replace("{amount}", formatUsdc(slashed.toString()))}</Secondary> : null}
      {earned > 0n ? <Secondary>{t.jury.resultEarned.replace("{amount}", formatUsdc(earned.toString()))}</Secondary> : null}
      {slashed === 0n && earned === 0n && results.data ? <Secondary>{t.jury.resultNone}</Secondary> : null}
    </>
  );
}
