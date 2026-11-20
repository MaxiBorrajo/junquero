import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useActivity } from "../../components/Activity";
import { DisputeFlow } from "../../jury/DisputeFlow";
import { EvidencePicker } from "../../evidence/EvidencePicker";
import type { PickedFile } from "../../lib/pick";
import { PERMIT_VALIDITY_SECONDS, permitTypedData } from "../../chain/createOrder";
import { deployment } from "../../chain/deployment";
import { disputeCost, reasonHash } from "../../chain/jury";
import { NO_AUTH, encodeOpenDispute, sendViaRelay } from "../../chain/orderActions";
import { readJurorFee, readParam, readSizeForAmount, readSmallDisputeQuota, readTokenBalance, readTokenNonce } from "../../chain/reader";
import { fetchMilestones } from "../../chain/serverReads";
import { Card } from "../../components/Card";
import { StepFrame } from "../../components/Wizard";
import { StagedFiles } from "../../evidence/StagedFiles";
import { Body, ErrorText, Field, Screen, Secondary, Title } from "../../components/ui";
import { Text } from "react-native";
import { text } from "../../theme";
import { useChatKey } from "../../chat/ChatKeyProvider";
import { useOrder } from "../../data/useOrder";
import { uploadStatement } from "../../evidence/statement";
import { t } from "../../i18n";
import { formatAmount } from "../../lib/money";
import { relayDepsFor } from "../../lib/relayHelpers";
import { useSession } from "../../session/SessionProvider";
import { isRejection, signTyped } from "../../wallet/sign";

const MIN_REASON = 10;
type Step = keyof typeof t.dispute.steps;

export default function OpenDispute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = Number(orderId);
  const { api, address } = useSession();
  const { ensure } = useChatKey();
  const queryClient = useQueryClient();
  const track = useActivity();
  const order = useOrder(id);
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  // El reclamo se arma en pasos: cómo sigue, qué pasó, pruebas y resumen.
  const [page, setPage] = useState(1);
  const [touched, setTouched] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Qué se disputa: la changa entera o, si tiene hitos, el hito que está en revisión. El contrato clasifica por ese monto.
  const scope = useQuery({
    queryKey: ["disputeScope", id, order.data?.hasMilestones, order.data?.sizeClass],
    enabled: order.data !== undefined,
    queryFn: async () => {
      const state = order.data!;
      if (!state.hasMilestones) return { size: state.sizeClass, amount: state.price };
      const board = await fetchMilestones(api, id);
      const amount = board.milestones[board.next]?.amount ?? state.price;
      return { size: await readSizeForAmount(amount), amount };
    },
  });
  const size = scope.data?.size;

  const cost = useQuery({
    queryKey: ["disputeCost", size],
    enabled: size !== undefined,
    queryFn: async () => {
      if (size === 0) return 0n;
      const [fee, jurors] = await Promise.all([readJurorFee(), readParam(size === 1 ? "JURY_SIZE_MEDIUM" : "JURY_SIZE_LARGE")]);
      return disputeCost(size!, fee, Number(jurors));
    },
  });

  const quota = useQuery({
    queryKey: ["smallDisputeQuota", address],
    enabled: Boolean(address) && size === 0,
    queryFn: () => readSmallDisputeQuota(address as `0x${string}`),
  });

  if (!order.data || !address || !scope.data || cost.data === undefined) {
    return (
      <Screen>
        <Title>{t.dispute.title}</Title>
        <Secondary>{t.common.loading}</Secondary>
      </Screen>
    );
  }

  const state = order.data;
  const counterpart = state.payer.toLowerCase() === address.toLowerCase() ? state.payee : state.payer;
  const small = scope.data.size === 0;
  const valid = reason.trim().length >= MIN_REASON;
  const capReached = small && quota.data !== undefined && quota.data.used >= quota.data.max;

  const submit = async () => {
    setTouched(true);
    if (!valid || capReached) return;
    setError(null);
    const account = address as `0x${string}`;
    try {
      await track(t.dispute.steps.statement, async (activity) => {
        const go = (next: Step) => {
          setStep(next);
          activity.update(t.dispute.steps[next]);
        };
        go("statement");
        await uploadStatement(api, address, counterpart, await ensure(), id, reason.trim(), files);

        let auth = NO_AUTH;
        if (cost.data! > 0n) {
          go("balance");
          const balance = await readTokenBalance(account);
          if (balance < cost.data!) {
            setStep(null);
            setError(t.dispute.insufficient.replace("{amount}", formatAmount((cost.data! - balance).toString())));
            return;
          }
          go("permit");
          const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS);
          const signature = await signTyped(permitTypedData(deployment, account, cost.data!, await readTokenNonce(account), deadline));
          auth = { method: 0, nonce: 0n, deadline, signature };
        }
        go("forward");
        await sendViaRelay(relayDepsFor(api, address), encodeOpenDispute(BigInt(id), reasonHash(reason), auth));
        go("relay");
        await queryClient.invalidateQueries({ queryKey: ["order", id] });
        await queryClient.invalidateQueries({ queryKey: ["cases"] });
        router.replace({ pathname: "/order/[orderId]", params: { orderId: String(id) } });
      });
    } catch (failure) {
      setStep(null);
      if (isRejection(failure)) setError(t.order.signCancelled);
      else if (/DisputeCapReached/.test(String((failure as Error).message))) setError(t.dispute.capReached);
      else if ((failure as Error).message === "counterpart_without_key") setError(t.dispute.noKey);
      else setError(t.dispute.failed);
    }
  };

  const next = () => {
    if (page === 1) return capReached ? undefined : setPage(2);
    if (page === 2) {
      setTouched(true);
      return valid ? setPage(3) : undefined;
    }
    if (page === 3) return setPage(4);
    return void submit();
  };
  const amountText = (state.hasMilestones ? t.dispute.explanationSmallAmountsMilestone : t.dispute.explanationSmallAmounts).replace("{amount}", formatAmount(scope.data.amount.toString())).replace(/\{half\}/g, formatAmount((scope.data.amount / 2n).toString()));
  const consequence = small ? amountText : t.dispute.explanationJury.replace("{amount}", formatAmount(cost.data.toString()));
  const titles = [t.dispute.stepFlow, t.dispute.reasonLabel, t.dispute.stepEvidence, t.dispute.stepSummary];

  return (
    <StepFrame
      step={page}
      total={4}
      title={titles[page - 1]}
      onNext={next}
      onBack={page > 1 ? () => setPage(page - 1) : undefined}
      nextLabel={page === 4 ? t.dispute.open : page === 3 && files.length === 0 ? t.dispute.skipEvidence : t.common.next}
      nextIcon={page === 4 ? "scale" : "chevron"}
      loading={step !== null}
      disabled={page === 1 && capReached}
    >
      {page === 1 ? (
        <>
          {capReached ? <ErrorText>{t.dispute.capReached}</ErrorText> : null}
          {small ? <Body>{t.dispute.explanationSmall}</Body> : <DisputeFlow size={scope.data.size} />}
          <Body>{consequence}</Body>
          {small && quota.data ? <Secondary>{t.dispute.smallQuota.replace(/\{max\}/g, String(quota.data.max)).replace("{used}", String(quota.data.used))}</Secondary> : null}
          <Secondary>{t.dispute.window}</Secondary>
        </>
      ) : null}
      {page === 2 ? (
        <Field label={t.dispute.reasonLabel} value={reason} onChangeText={setReason} multiline maxLength={1500} hint={small ? t.dispute.reasonHintSmall : t.dispute.reasonHint} error={touched && !valid ? t.dispute.reasonError : null} />
      ) : null}
      {page === 3 ? <EvidencePicker files={files} onChange={setFiles} showTitle={false} /> : null}
      {page === 4 ? (
        <>
          <Card gap="xs">
            <Text style={text.label}>{t.dispute.summaryStory}</Text>
            <Body>{reason.trim()}</Body>
          </Card>
          <Card gap="sm">
            <Text style={text.label}>{files.length === 0 ? t.dispute.summaryNoFiles : t.dispute.summaryFiles.replace("{n}", String(files.length))}</Text>
            <StagedFiles files={files} />
          </Card>
          <Card gap="xs">
            <Text style={text.label}>{t.dispute.summaryWhat}</Text>
            <Secondary>{consequence}</Secondary>
          </Card>
        </>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </StepFrame>
  );
}
