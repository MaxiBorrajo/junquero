import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Field, Secondary } from "../../components/ui";
import { WizardStep } from "../../components/Wizard";
import { protocolFee } from "../../chain/fee";
import { readFeeRule } from "../../chain/reader";
import { t } from "../../i18n";
import { formatAmount, formatUsdc } from "../../lib/money";
import { groupContributionRange, totalAmount, validatePrice } from "../../publish/draft";
import { useDraft } from "../../publish/DraftProvider";
import { text } from "../../theme";

export default function PublishPrice() {
  const { draft, update } = useDraft();
  const [touched, setTouched] = useState(false);
  const amount = totalAmount(draft);
  const fee = useQuery({ queryKey: ["feeRule"], queryFn: readFeeRule, staleTime: 5 * 60_000 });
  const feeAmount = amount !== null && fee.data ? protocolFee(amount, fee.data.bps, fee.data.floor, fee.data.cap) : null;
  const errors = touched ? validatePrice(draft) : {};

  const next = () => {
    setTouched(true);
    if (Object.keys(validatePrice(draft)).length === 0) router.push("/publish/payment");
  };

  const range = amount !== null ? groupContributionRange(amount) : null;
  const ownRange = { min: range ? formatAmount(range.min.toString()) : "–", max: range ? formatAmount(range.max.toString()) : "–" };

  return (
    <WizardStep step={4} title={t.publish.priceTitle} onNext={next}>
      <Field
        label={draft.kind === "group" ? t.publish.targetLabel : t.publish.amountLabel}
        value={draft.amount}
        onChangeText={(value) => update({ amount: value })}
        keyboardType="decimal-pad"
        error={errors.amount ? (errors.amount === "amountMin" ? t.publish.amountMinError : t.publish.amountError) : null}
      />

      {draft.kind === "group" ? (
        <Field
          label={t.publish.ownContributionLabel}
          value={draft.ownContribution}
          onChangeText={(value) => update({ ownContribution: value })}
          keyboardType="decimal-pad"
          error={errors.ownContribution ? (errors.ownContribution === "range" ? t.publish.ownContributionRange.replace("{min}", ownRange.min).replace("{max}", ownRange.max) : t.publish.ownContributionAmount) : null}
          hint={t.publish.ownContributionHint.replace("{min}", ownRange.min).replace("{max}", ownRange.max)}
        />
      ) : null}

      {amount !== null ? (
        <View style={{ gap: 4 }}>
          <Line label={t.publish.breakdownAmount} value={formatUsdc(amount.toString())} />
          {feeAmount !== null ? <Line label={t.publish.breakdownFee} value={formatUsdc(feeAmount.toString())} /> : null}
          <Secondary>{t.publish.breakdownFeeNote}</Secondary>
          <View style={{ marginTop: 10 }}>
            <Line label={draft.kind === "group" ? t.publish.targetLabel : t.publish.breakdownTotal} value={formatUsdc(amount.toString())} strong />
          </View>
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
