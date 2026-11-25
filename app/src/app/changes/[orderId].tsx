import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useActivity } from "../../components/Activity";
import { reasonHash } from "../../chain/jury";
import { encodeRequestChanges, sendViaRelay } from "../../chain/orderActions";
import { Body, Button, ErrorText, Field, Screen, Secondary, Title } from "../../components/ui";
import { useChatKey } from "../../chat/ChatKeyProvider";
import { useOrder } from "../../data/useOrder";
import { EvidencePicker } from "../../evidence/EvidencePicker";
import { uploadStatement } from "../../evidence/statement";
import { t } from "../../i18n";
import type { PickedFile } from "../../lib/pick";
import { relayDepsFor } from "../../lib/relayHelpers";
import { useSession } from "../../session/SessionProvider";
import { isRejection } from "../../wallet/sign";

const MIN_REASON = 10;

// Pedir cambios en una changa a distancia: el texto y los archivos le llegan cifrados a quien hizo el trabajo;
// en la cadena queda solo la huella del texto.
export default function RequestChanges() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = Number(orderId);
  const { api, address } = useSession();
  const { ensure } = useChatKey();
  const queryClient = useQueryClient();
  const track = useActivity();
  const order = useOrder(id);
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!order.data || !address) {
    return (
      <Screen>
        <Title>{t.order.requestChanges}</Title>
        <Secondary>{t.common.loading}</Secondary>
      </Screen>
    );
  }
  const state = order.data;
  const valid = reason.trim().length >= MIN_REASON;

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setError(null);
    setBusy(true);
    try {
      await track(t.order.requestChangesStepSave, async (activity) => {
        await uploadStatement(api, address, state.payee, await ensure(), id, reason.trim(), files);
        activity.update(t.order.requestChangesStepSign);
        await sendViaRelay(relayDepsFor(api, address), encodeRequestChanges(BigInt(id), reasonHash(reason)));
        await queryClient.invalidateQueries({ queryKey: ["order", id] });
        router.replace({ pathname: "/order/[orderId]", params: { orderId: String(id) } });
      });
    } catch (failure) {
      if (isRejection(failure)) setError(t.order.signCancelled);
      else if ((failure as Error).message === "counterpart_without_key") setError(t.dispute.noKey);
      else setError(t.order.requestChangesFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={<Button label={t.order.requestChangesSend} icon="refresh" onPress={() => void submit()} loading={busy} />}
    >
      <Title>{t.order.requestChanges}</Title>
      <Body>{t.order.requestChangesNote}</Body>
      <Field label={t.order.requestChangesReason} value={reason} onChangeText={setReason} multiline maxLength={1500} hint={t.order.requestChangesHint} error={touched && !valid ? t.dispute.reasonError : null} />
      <EvidencePicker files={files} onChange={setFiles} showTitle={false} />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}
