import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { ApiError } from "../../api/client";
import { InsufficientBalance, publishChanga, type PublishStep } from "../../chain/publish";
import { deployment } from "../../chain/deployment";
import { readForwarderNonce, readTokenBalance, readTokenNonce } from "../../chain/reader";
import { Body, Button, ErrorText, Screen, Secondary, Title } from "../../components/ui";
import { t } from "../../i18n";
import { formatDate, formatDuration } from "../../lib/format";
import { formatAmount, formatUsdc } from "../../lib/money";
import { totalAmount, validateAll } from "../../publish/draft";
import { useDraft } from "../../publish/DraftProvider";
import { useSession } from "../../session/SessionProvider";
import { isRejection, signTyped } from "../../wallet/sign";
import { text } from "../../theme";

const STEP_TEXT: Record<PublishStep, string> = {
  spec: t.publish.stepSpec,
  balance: t.publish.stepBalance,
  permit: t.publish.stepPermit,
  forward: t.publish.stepForward,
  relay: t.publish.stepRelay,
  confirming: t.publish.stepConfirming,
};

export default function PublishReview() {
  const { draft, reset } = useDraft();
  const { api, address } = useSession();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<PublishStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const amount = totalAmount(draft);
  const invalid = amount === null || Object.keys(validateAll(draft, Math.floor(Date.now() / 1000))).length > 0;

  const publish = async () => {
    if (invalid || !address || amount === null) return;
    setError(null);
    const account = address as `0x${string}`;
    try {
      const result = await publishChanga(
        {
          api,
          deployment,
          account,
          now: () => Math.floor(Date.now() / 1000),
          nonce: () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""),
          readBalance: () => readTokenBalance(account),
          readTokenNonce: () => readTokenNonce(account),
          readForwarderNonce: () => readForwarderNonce(account),
          signTypedData: signTyped,
          onStep: setStep,
        },
        draft,
        amount,
      );
      void queryClient.invalidateQueries({ queryKey: ["changas"] });
      const group = draft.kind === "group";
      reset();
      router.replace({ pathname: "/publish/done", params: { confirmed: "0", group: group ? "1" : "0", spec: result.specHash } });
    } catch (failure) {
      setStep(null);
      if (failure instanceof InsufficientBalance) setError(t.publish.insufficient.replace("{amount}", formatAmount(failure.missing.toString())));
      else if (isRejection(failure)) setError(t.publish.rejected);
      else if (failure instanceof ApiError) setError(t.publish.failed);
      else setError(t.publish.failed);
    }
  };

  return (
    <Screen footer={<Button label={step ? STEP_TEXT[step] : t.publish.publishAction} onPress={publish} loading={step !== null} disabled={invalid} />}>
      <Title>{t.publish.reviewTitle}</Title>
      <Text style={text.subtitle}>{draft.title}</Text>
      <Text style={text.amount}>{amount !== null ? formatUsdc(amount.toString()) : "-"}</Text>
      {draft.description ? <Body>{draft.description}</Body> : null}
      <View style={{ gap: 4 }}>
        <Secondary>{draft.modality === "remote" ? t.publish.remote : t.publish.onsite}</Secondary>
        {draft.modality === "onsite" && draft.startsAt ? <Secondary>{formatDate(draft.startsAt)}</Secondary> : null}
        {draft.modality === "remote" && draft.deadline ? <Secondary>{`${t.publish.deadlineLabel} ${formatDate(draft.deadline)}`}</Secondary> : null}
        {draft.durationMin ? <Secondary>{formatDuration(draft.durationMin)}</Secondary> : null}
        {draft.attachments.length > 0 ? <Secondary>{`${draft.attachments.length} ${t.detail.attachments.toLowerCase()}`}</Secondary> : null}
      </View>
      <Secondary>{t.publish.reviewNote}</Secondary>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}
