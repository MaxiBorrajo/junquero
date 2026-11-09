import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PERMIT_VALIDITY_SECONDS, permitTypedData } from "../../chain/createOrder";
import { deployment } from "../../chain/deployment";
import { disputeCost, reasonHash } from "../../chain/jury";
import { NO_AUTH, encodeOpenDispute, sendViaRelay } from "../../chain/orderActions";
import { readJurorFee, readParam, readTokenBalance, readTokenNonce } from "../../chain/reader";
import { Body, Button, ErrorText, Field, Screen, Secondary, Title } from "../../components/ui";
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
  const order = useOrder(id);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cost = useQuery({
    queryKey: ["disputeCost", order.data?.sizeClass],
    enabled: order.data !== undefined,
    queryFn: async () => {
      const size = order.data!.sizeClass;
      if (size === 0) return 0n;
      const [fee, jurors] = await Promise.all([readJurorFee(), readParam(size === 1 ? "JURY_SIZE_MEDIUM" : "JURY_SIZE_LARGE")]);
      return disputeCost(size, fee, Number(jurors));
    },
  });

  if (!order.data || !address || cost.data === undefined) {
    return (
      <Screen>
        <Title>{t.dispute.title}</Title>
        <Secondary>{t.common.loading}</Secondary>
      </Screen>
    );
  }

  const state = order.data;
  const counterpart = state.payer.toLowerCase() === address.toLowerCase() ? state.payee : state.payer;
  const small = state.sizeClass === 0;
  const valid = reason.trim().length >= MIN_REASON;

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setError(null);
    const account = address as `0x${string}`;
    try {
      setStep("statement");
      await uploadStatement(api, address, counterpart, await ensure(), id, reason.trim());

      let auth = NO_AUTH;
      if (cost.data! > 0n) {
        setStep("balance");
        const balance = await readTokenBalance(account);
        if (balance < cost.data!) {
          setStep(null);
          setError(t.dispute.insufficient.replace("{amount}", formatAmount((cost.data! - balance).toString())));
          return;
        }
        setStep("permit");
        const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS);
        const signature = await signTyped(permitTypedData(deployment, account, cost.data!, await readTokenNonce(account), deadline));
        auth = { method: 0, nonce: 0n, deadline, signature };
      }
      setStep("forward");
      await sendViaRelay(relayDepsFor(api, address), encodeOpenDispute(BigInt(id), reasonHash(reason), auth));
      setStep("relay");
      await queryClient.invalidateQueries({ queryKey: ["order", id] });
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      router.replace({ pathname: "/order/[orderId]", params: { orderId: String(id) } });
    } catch (failure) {
      setStep(null);
      if (isRejection(failure)) setError(t.order.signCancelled);
      else if ((failure as Error).message === "counterpart_without_key") setError(t.dispute.noKey);
      else setError(t.dispute.failed);
    }
  };

  return (
    <Screen footer={<Button label={t.dispute.open} onPress={submit} loading={step !== null} />}>
      <Title>{t.dispute.title}</Title>
      <Body>{small ? t.dispute.explanationSmall : t.dispute.explanationJury.replace("{amount}", formatAmount(cost.data.toString()))}</Body>
      <Secondary>{t.dispute.window}</Secondary>
      <Field label={t.dispute.reasonLabel} value={reason} onChangeText={setReason} multiline maxLength={1500} hint={t.dispute.reasonHint} error={touched && !valid ? t.dispute.reasonError : null} />
      {step ? <Body>{t.dispute.steps[step]}</Body> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}
