import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Field, Secondary } from "../../components/ui";
import { WizardStep } from "../../components/Wizard";
import { protocolFee } from "../../chain/fee";
import { readFeeRule } from "../../chain/reader";
import { t } from "../../i18n";
import { formatUsdc } from "../../lib/money";
import { EVIDENCE_MAX, parseAmount, validatePrice } from "../../publish/draft";
import { useDraft } from "../../publish/DraftProvider";
import { text } from "../../theme";

export default function PublishPrice() {
  const { draft, update } = useDraft();
  const [touched, setTouched] = useState(false);
  const errors = touched ? validatePrice(draft) : {};
  const amount = parseAmount(draft.amount);
  const fee = useQuery({ queryKey: ["feeRule"], queryFn: readFeeRule, staleTime: 5 * 60_000 });
  const feeAmount = amount !== null && fee.data ? protocolFee(amount, fee.data.bps, fee.data.floor, fee.data.cap) : null;

  const next = () => {
    setTouched(true);
    if (Object.keys(validatePrice(draft)).length === 0) router.push("/publish/review");
  };

  const setEvidence = (index: number, value: string) => update((d) => ({ ...d, evidence: d.evidence.map((item, i) => (i === index ? value : item)) }));

  return (
    <WizardStep step={4} title={t.publish.priceTitle} onNext={next}>
      <Field
        label={t.publish.amountLabel}
        value={draft.amount}
        onChangeText={(value) => update({ amount: value })}
        keyboardType="decimal-pad"
        error={errors.amount ? (errors.amount === "amountMin" ? t.publish.amountMinError : t.publish.amountError) : null}
      />
      <Text style={text.label}>{t.publish.evidenceLabel}</Text>
      {draft.evidence.map((item, index) => (
        <Field key={index} label="" value={item} onChangeText={(value) => setEvidence(index, value)} maxLength={120} placeholder={t.publish.evidencePlaceholder} />
      ))}
      {draft.evidence.length < EVIDENCE_MAX ? <Button label={t.publish.evidenceAdd} variant="ghost" onPress={() => update((d) => ({ ...d, evidence: [...d.evidence, ""] }))} /> : null}
      {amount !== null ? (
        <View style={{ gap: 4 }}>
          <Line label={t.publish.breakdownAmount} value={formatUsdc(amount.toString())} />
          {feeAmount !== null ? <Line label={t.publish.breakdownFee} value={formatUsdc(feeAmount.toString())} /> : null}
          <Secondary>{t.publish.breakdownFeeNote}</Secondary>
          <Line label={t.publish.breakdownTotal} value={formatUsdc(amount.toString())} strong />
        </View>
      ) : null}
    </WizardStep>
  );
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={strong ? text.subtitle : text.body}>{label}</Text>
      <Text style={strong ? text.subtitle : text.body}>{value}</Text>
    </View>
  );
}
