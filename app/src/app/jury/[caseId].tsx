import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { deployment } from "../../chain/deployment";
import { VOTE_PAYEE, VOTE_PAYER } from "../../chain/arbitrationAbi";
import { encodeCommitVote, encodeRevealVote, jurorAction, phaseView, randomHex32, voteCommitment } from "../../chain/jury";
import { sendViaRelay } from "../../chain/orderActions";
import { readJurorCase } from "../../chain/reader";
import { Body, Button, Chip, ErrorText, Labeled, Row, Screen, Secondary, Title } from "../../components/ui";
import { useCaseState } from "../../data/useCases";
import { EvidenceGallery, useEvidence } from "../../evidence/EvidenceSection";
import { loadVote, saveVote } from "../../jury/secrets";
import { secureSecretStorage } from "../../jury/secureStorage";
import { t } from "../../i18n";
import { formatDate } from "../../lib/format";
import { relayDepsFor } from "../../lib/relayHelpers";
import { useSession } from "../../session/SessionProvider";
import { isRejection } from "../../wallet/sign";
import { text } from "../../theme";

export default function JurorCase() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const id = Number(caseId);
  const { api, address } = useSession();
  const queryClient = useQueryClient();
  const state = useCaseState(id);
  const orderId = state.data?.snapshot.orderId ?? 0;
  const evidence = useEvidence(orderId);
  const juror = address as `0x${string}`;
  const mine = useQuery({ queryKey: ["jurorCase", id, address], enabled: Boolean(address), refetchInterval: 15_000, queryFn: () => readJurorCase(id, juror) });
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const run = async (work: () => Promise<void>, success: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await work();
      setMessage(success);
      await mine.refetch();
      await queryClient.invalidateQueries({ queryKey: ["case", id] });
    } catch (caught) {
      setError(isRejection(caught) ? t.order.signCancelled : t.jury.stepFailed);
    } finally {
      setBusy(false);
    }
  };

  const commit = () =>
    run(async () => {
      if (choice === null) throw new Error("choice");
      const salt = randomHex32((n) => crypto.getRandomValues(new Uint8Array(n)));
      await saveVote(secureSecretStorage, juror, id, { vote: choice, salt });
      await sendViaRelay(relayDepsFor(api, address), encodeCommitVote(BigInt(id), voteCommitment(BigInt(id), juror, choice, salt)), 1_500_000n, deployment.arbitration);
    }, t.jury.voteSaved);

  const reveal = () =>
    run(async () => {
      const saved = await loadVote(secureSecretStorage, juror, id);
      if (!saved) throw new Error("secret");
      await sendViaRelay(relayDepsFor(api, address), encodeRevealVote(BigInt(id), saved.vote, saved.salt), 1_500_000n, deployment.arbitration);
    }, t.jury.voteRevealed);

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
      <Title>{`${t.caseScreen.title} #${id}`}</Title>
      <Secondary>{t.jury.sealedHint}</Secondary>
      {view === "vote-commit" ? <Secondary>{`${t.jury.windowCommit}: ${formatDate(snapshot.commitEnd)}`}</Secondary> : null}
      {view === "vote-reveal" ? <Secondary>{`${t.jury.windowReveal}: ${formatDate(snapshot.revealEnd)}`}</Secondary> : null}

      <Text style={text.subtitle}>{t.jury.statements}</Text>
      {(evidence.data ?? []).length === 0 ? <Secondary>{t.jury.noEvidence}</Secondary> : <EvidenceGallery orderId={orderId} items={evidence.data ?? []} />}

      {action === "commit-vote" ? (
        <>
          <Labeled label={t.jury.voteFor}>
            <Row>
              <Chip label={t.jury.partyA} selected={choice === VOTE_PAYER} onPress={() => setChoice(VOTE_PAYER)} />
              <Chip label={t.jury.partyB} selected={choice === VOTE_PAYEE} onPress={() => setChoice(VOTE_PAYEE)} />
            </Row>
          </Labeled>
          <Button label={t.jury.commitVote} onPress={commit} loading={busy} disabled={choice === null} />
        </>
      ) : null}
      {action === "reveal-vote" ? <Button label={t.jury.revealVote} onPress={reveal} loading={busy} /> : null}
      {view === "vote-commit" && action === "wait" && mine.data.voteCommit !== `0x${"0".repeat(64)}` ? <Secondary>{t.jury.waitReveal}</Secondary> : null}
      {action === "done" ? <Secondary>{t.jury.voteRevealed}</Secondary> : null}
      {message ? <Secondary>{message}</Secondary> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}
