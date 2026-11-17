import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { encodeAbandon, encodeTerminateEarly } from "../../chain/milestones";
import { sendViaRelay } from "../../chain/orderActions";
import { readFeeRule, readParam } from "../../chain/reader";
import { fetchMilestones } from "../../chain/serverReads";
import { terminationPreview } from "../../chain/termination";
import { Body, Button, ErrorText, Field, Screen, Secondary, Title } from "../../components/ui";
import { useOrder } from "../../data/useOrder";
import { t } from "../../i18n";
import { formatUsdc } from "../../lib/money";
import { relayDepsFor } from "../../lib/relayHelpers";
import { useRunAction } from "../../lib/useRunAction";
import { useSession } from "../../session/SessionProvider";
import { text } from "../../theme";

// Terminar (quien publica) o dejar (quien trabaja) un trabajo por hitos: pantalla propia, con el motivo obligatorio.
export default function ExitScreen() {
  const { orderId: orderParam, kind: kindParam } = useLocalSearchParams<{ orderId: string; kind: string }>();
  const orderId = Number(orderParam);
  const terminating = kindParam === "terminated";
  const { api, address } = useSession();
  const { run, busy, error } = useRunAction();
  const [reason, setReason] = useState("");
  const order = useOrder(orderId);
  const board = useQuery({ queryKey: ["milestones", orderId], queryFn: () => fetchMilestones(api, orderId) });
  const preview = useQuery({
    queryKey: ["termination-preview", orderId, board.data?.next, board.data?.progressBps, order.data?.deposited?.toString()],
    enabled: terminating && Boolean(board.data && order.data),
    queryFn: async () => {
      const [compBps, payeeShareBps, fee] = await Promise.all([readParam("TERMINATION_COMP_BPS"), readParam("CANCEL_PAYEE_SHARE_BPS"), readFeeRule()]);
      const data = board.data!;
      return terminationPreview({ deposited: order.data!.deposited, currentAmount: data.milestones[data.next]!.amount, progressBps: data.progressBps, compBps, payeeShareBps, fee });
    },
  });
  if (!address) return <Screen><Secondary>{t.common.loading}</Secondary></Screen>;

  const reasonOk = reason.trim().length >= 10;
  const kind = terminating ? "terminated" : "abandoned";
  const confirm = () =>
    run(
      async () => {
        await api.send("POST", `/me/orders/${orderId}/exit-reason`, { kind, reason: reason.trim() });
        return sendViaRelay(relayDepsFor(api, address), terminating ? encodeTerminateEarly(BigInt(orderId)) : encodeAbandon(BigInt(orderId)));
      },
      { success: terminating ? t.milestonesBoard.terminated : t.milestonesBoard.abandoned, successIcon: "check", failure: t.milestonesBoard.failed, invalidate: [["milestones", orderId], ["order", orderId]] },
    ).then((ok) => { if (ok) router.dismissTo({ pathname: "/order/[orderId]", params: { orderId: String(orderId) } }); });

  return (
    <Screen
      footer={
        <>
          <Button label={terminating ? t.milestonesBoard.terminateConfirm : t.milestonesBoard.abandonConfirm} icon={terminating ? "check" : "logout"} variant="outline" onPress={confirm} loading={busy} disabled={!reasonOk} />
          <Button label={t.milestonesBoard.abandonCancel} icon="close" variant="ghost" onPress={() => router.back()} disabled={busy} />
        </>
      }
    >
      <Title>{terminating ? t.milestonesBoard.terminate : t.milestonesBoard.abandon}</Title>
      {terminating ? (
        <>
          <Secondary>{t.milestonesBoard.terminateNote}</Secondary>
          <Text style={text.subtitle}>{t.milestonesBoard.terminatePreviewTitle}</Text>
          {preview.data ? (
            <>
              <Body>{t.milestonesBoard.terminatePreviewPayee.replace("{amount}", formatUsdc(preview.data.toPayee.toString()))}</Body>
              <Body>{t.milestonesBoard.terminatePreviewRefund.replace("{amount}", formatUsdc(preview.data.refund.toString()))}</Body>
              <Secondary>{t.milestonesBoard.terminatePreviewNote}</Secondary>
            </>
          ) : <Secondary>{t.milestonesBoard.terminatePreviewLoading}</Secondary>}
        </>
      ) : (
        <>
          <Text style={text.subtitle}>{t.milestonesBoard.abandonConfirmTitle}</Text>
          <Secondary>{t.milestonesBoard.abandonConfirmBody}</Secondary>
        </>
      )}
      <Field label={t.milestonesBoard.reasonLabel} hint={t.milestonesBoard.reasonHint} placeholder={terminating ? t.milestonesBoard.reasonTerminatePlaceholder : t.milestonesBoard.reasonAbandonPlaceholder} value={reason} onChangeText={setReason} multiline maxLength={500} />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}
