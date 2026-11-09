import { useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ApiError } from "../../api/client";
import { Body, Button, ErrorText, Field, Screen, Title } from "../../components/ui";
import { t } from "../../i18n";
import { parseCounterOffer } from "../../lib/offer";
import { useSession } from "../../session/SessionProvider";

const MESSAGE_MAX = 500;

export default function Apply() {
  const { changaId, max, plan } = useLocalSearchParams<{ changaId: string; max?: string; plan?: string }>();
  const { api } = useSession();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const offer = parseCounterOffer(amount, max && /^\d+$/.test(max) ? BigInt(max) : undefined);
  const amountError = offer.ok ? null : t.apply.amountInvalid;

  const submit = async () => {
    if (!offer.ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.send("PUT", `/me/applications/${changaId}`, { message: message.trim(), ...(offer.value ? { amount: offer.value } : {}) });
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
      router.replace("/my-changas");
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 409 ? t.apply.conflict : t.common.genericError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button label={t.apply.send} onPress={submit} loading={busy} disabled={!offer.ok} />}>
      <Title>{t.apply.title}</Title>
      <Body>{t.apply.explanation}</Body>
      {plan === "1" ? null : <Field label={t.apply.amount} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={t.apply.amountPlaceholder} error={amountError} hint={t.apply.amountHint} />}
      <Field label={t.apply.message} value={message} onChangeText={setMessage} multiline maxLength={MESSAGE_MAX} hint={`${message.length}/${MESSAGE_MAX}`} />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}
