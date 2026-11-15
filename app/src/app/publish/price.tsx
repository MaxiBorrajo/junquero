import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Field, Secondary } from "../../components/ui";
import { WizardStep } from "../../components/Wizard";
import { protocolFee } from "../../chain/fee";
import { readFeeRule } from "../../chain/reader";
import { t } from "../../i18n";
import { formatAmount, formatUsdc } from "../../lib/money";
import { groupContributionRange, totalAmount, validatePrice } from "../../publish/draft";
import { useDraft } from "../../publish/DraftProvider";
import { colors, fonts, spacing, text } from "../../theme";
import { suggestMilestones } from "../../chain/terms";

export default function PublishPrice() {
  const { draft, update } = useDraft();
  const [touched, setTouched] = useState(false);
  const amount = totalAmount(draft);
  const fee = useQuery({ queryKey: ["feeRule"], queryFn: readFeeRule, staleTime: 5 * 60_000 });
  const feeAmount = amount !== null && fee.data ? protocolFee(amount, fee.data.bps, fee.data.floor, fee.data.cap) : null;
  const errors = touched ? validatePrice(draft) : {};
  const span = draft.deadline && (draft.startsAt ?? Math.floor(Date.now() / 1000)) ? draft.deadline - Math.floor(Date.now() / 1000) : 0;
  const suggest = suggestMilestones(amount, span);

  const next = () => {
    setTouched(true);
    if (Object.keys(validatePrice(draft)).length === 0) router.push(draft.useMilestones ? "/publish/review" : "/publish/evidence");
  };

  const range = amount !== null ? groupContributionRange(amount) : null;
  const ownRange = { min: range ? formatAmount(range.min.toString()) : "–", max: range ? formatAmount(range.max.toString()) : "–" };

  return (
    <WizardStep step={5} title={t.publish.priceTitle} onNext={next}>
      {draft.useMilestones ? (
        <View style={{ gap: 4 }}>
          <Text style={text.label}>{draft.kind === "group" ? t.publish.targetLabel : t.publish.amountLabel}</Text>
          <View style={{ backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: errors.amount ? colors.error : colors.line, padding: 14, gap: 2 }}>
            <Text style={text.amount}>{amount !== null ? formatUsdc(amount.toString()) : "-"}</Text>
            <Secondary>{t.publish.totalFromMilestones}</Secondary>
          </View>
          {errors.amount ? <Text style={[text.secondary, { color: colors.error }]}>{errors.amount === "amountMin" ? t.publish.amountMinError : t.publish.amountError}</Text> : null}
          <Button label={t.publish.editMilestones} icon="edit" variant="ghost" onPress={() => router.back()} />
        </View>
      ) : (
        <Field
          label={draft.kind === "group" ? t.publish.targetLabel : t.publish.amountLabel}
          value={draft.amount}
          onChangeText={(value) => update({ amount: value })}
          keyboardType="decimal-pad"
          error={errors.amount ? (errors.amount === "amountMin" ? t.publish.amountMinError : t.publish.amountError) : null}
        />
      )}
      {!draft.useMilestones && suggest ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={[text.secondary, { color: colors.error }]}>
            <Text style={{ fontFamily: fonts.semibold }}>{t.publish.milestonesSuggestTitle} </Text>
            {t.publish.milestonesSuggest}
          </Text>
          <Button label={t.publish.splitMilestones} icon="back" variant="ghost" onPress={() => router.back()} />
        </View>
      ) : null}

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
