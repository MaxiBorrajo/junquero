import { useQueryClient } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { useChangaBySpec } from "../../data/useChangas";
import { formatUsdc, toMicro } from "../../lib/money";
import { milestoneTotal, suggestMilestones } from "../../chain/terms";
import { colors, text } from "../../theme";
import { Chip, Labeled, Row } from "../../components/ui";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ApiError } from "../../api/client";
import { Body, Button, ErrorText, Field, Screen, Secondary, Title } from "../../components/ui";
import { t } from "../../i18n";
import { parseCounterOffer } from "../../lib/offer";
import { useChatKey } from "../../chat/ChatKeyProvider";
import { useToast } from "../../components/Toast";
import { useSession } from "../../session/SessionProvider";

const MESSAGE_MAX = 500;

export default function Apply() {
  const { changaId, max, plan, spec } = useLocalSearchParams<{ changaId: string; max?: string; plan?: string; spec?: string }>();
  const { api } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { ensure: ensureChatKey } = useChatKey();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const changa = useChangaBySpec(spec ?? "0x");
  const original = changa.data?.spec.milestones ?? [];
  const [change, setChange] = useState(false);
  const [draftPlan, setDraftPlan] = useState<{ name: string; amount: string; criteria: string; evidence: string }[] | null>(null);
  const editable = draftPlan ?? original.map((item) => ({ name: item.name, amount: String(Number(item.amount) / 1_000_000), criteria: item.criteria, evidence: item.evidence }));
  const total = editable.reduce((sum, item) => sum + (/^\d+([.,]\d{1,6})?$/.test(item.amount.trim()) ? toMicro(item.amount.trim()) : 0n), 0n);
  const expected = original.length > 0 ? milestoneTotal(original) : 0n;
  const planValid = !change || (total === expected && editable.every((item) => item.name.trim().length >= 2 && item.criteria.trim().length >= 3 && item.evidence.trim().length >= 3));
  const [error, setError] = useState<string | null>(null);

  const offer = parseCounterOffer(amount);
  const amountError = offer.ok ? null : t.apply.amountInvalid;
  const published = max && /^\d+$/.test(max) ? BigInt(max) : null;
  const extra = offer.ok && offer.value && published !== null && BigInt(offer.value) > published ? BigInt(offer.value) - published : null;

  const submit = async () => {
    if (!offer.ok) return;
    setBusy(true);
    setError(null);
    try {
      const planBody = change && original.length > 0 ? { plan: { milestones: editable.map((item) => ({ name: item.name.trim(), amount: toMicro(item.amount.trim()).toString(), criteria: item.criteria.trim(), evidence: item.evidence.trim() })) } } : {};
      await api.send("PUT", `/me/applications/${changaId}`, { message: message.trim(), ...(offer.value ? { amount: offer.value } : {}), ...planBody });
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
      // El chat se activa al postularse, así quien publica ya puede escribirle. Si cancela la firma, se activa después.
      await ensureChatKey().catch(() => {});
      toast({ text: t.apply.sent, tone: "success", icon: "send" });
      router.replace("/my-changas");
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 409 ? t.apply.conflict : t.common.genericError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button label={t.apply.send} onPress={submit} loading={busy} disabled={!offer.ok || !planValid} />}>
      <Title>{t.apply.title}</Title>
      <Body>{t.apply.explanation}</Body>
      {plan !== "1" && changa.data && suggestMilestones(max && /^\d+$/.test(max) ? BigInt(max) : null, (changa.data.spec.deadline ? changa.data.spec.deadline - Math.floor(Date.now() / 1000) : 0)) ? <Secondary>{t.apply.singlePaymentLong}</Secondary> : null}
      {plan === "1" ? null : <Field label={t.apply.amount} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={t.apply.amountPlaceholder} error={amountError} hint={extra !== null ? t.apply.amountHigher.replace("{extra}", formatUsdc(extra.toString())) : t.apply.amountHint} />}
      <Secondary>{t.apply.chatNote}</Secondary>
      <Field label={t.apply.message} value={message} onChangeText={setMessage} multiline maxLength={MESSAGE_MAX} hint={`${message.length}/${MESSAGE_MAX}`} />
      {plan === "1" && original.length > 0 ? (
        <>
          <Labeled label={t.planChange.toggle}>
            <Row>
              <Chip label={t.publish.yes} selected={change} onPress={() => setChange(true)} />
              <Chip label={t.publish.no} selected={!change} onPress={() => setChange(false)} />
            </Row>
          </Labeled>
          {change ? (
            <>
              <Secondary>{t.planChange.note}</Secondary>
              {editable.map((item, index) => (
                <View key={index} style={{ gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, backgroundColor: colors.white }}>
                  <Field label={t.publish.milestoneName} value={item.name} onChangeText={(value) => setDraftPlan(editable.map((m, i) => (i === index ? { ...m, name: value } : m)))} maxLength={60} />
                  <Field label={t.publish.milestoneAmount} value={item.amount} onChangeText={(value) => setDraftPlan(editable.map((m, i) => (i === index ? { ...m, amount: value } : m)))} keyboardType="decimal-pad" />
                  <Field label={t.publish.milestoneCriteria} value={item.criteria} onChangeText={(value) => setDraftPlan(editable.map((m, i) => (i === index ? { ...m, criteria: value } : m)))} maxLength={200} multiline />
                  <Field label={t.publish.milestoneEvidence} value={item.evidence} onChangeText={(value) => setDraftPlan(editable.map((m, i) => (i === index ? { ...m, evidence: value } : m)))} maxLength={100} />
                </View>
              ))}
              {total !== expected ? <ErrorText>{t.planChange.totalMismatch.replace("{total}", formatUsdc(expected.toString()).replace(" USDC", ""))}</ErrorText> : null}
            </>
          ) : null}
        </>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}
