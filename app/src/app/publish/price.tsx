import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Chip, Field, Row, Secondary } from "../../components/ui";
import { WizardStep } from "../../components/Wizard";
import { protocolFee } from "../../chain/fee";
import { milestonesRequired } from "../../chain/terms";
import { readFeeRule, readMilestoneRule } from "../../chain/reader";
import { t } from "../../i18n";
import { formatUsdc } from "../../lib/money";
import { EVIDENCE_MAX, FUNDING_DAYS, MAX_MILESTONES, emptyMilestone, parseAmount, totalAmount, validatePrice, type MilestoneDraft } from "../../publish/draft";
import { useDraft } from "../../publish/DraftProvider";
import { colors, text } from "../../theme";

export default function PublishPrice() {
  const { draft, update } = useDraft();
  const [touched, setTouched] = useState(false);
  const amount = totalAmount(draft);
  const fee = useQuery({ queryKey: ["feeRule"], queryFn: readFeeRule, staleTime: 5 * 60_000 });
  const rule = useQuery({ queryKey: ["milestoneRule"], queryFn: readMilestoneRule, staleTime: 5 * 60_000 });
  const feeAmount = amount !== null && fee.data ? protocolFee(amount, fee.data.bps, fee.data.floor, fee.data.cap) : null;

  const span = draft.deadline && (draft.startsAt ?? Math.floor(Date.now() / 1000)) ? draft.deadline - Math.floor(Date.now() / 1000) : 0;
  const required = amount !== null && rule.data ? milestonesRequired(amount, rule.data.threshold, span, Number(rule.data.minDuration)) : false;
  const useMilestones = draft.useMilestones || required;
  const errors = touched ? validatePrice(required && !draft.useMilestones ? { ...draft, useMilestones: true } : draft) : {};

  const next = () => {
    setTouched(true);
    const current = required && !draft.useMilestones ? { ...draft, useMilestones: true } : draft;
    if (Object.keys(validatePrice(current)).length === 0) router.push("/publish/review");
  };

  const setEvidence = (index: number, value: string) => update((d) => ({ ...d, evidence: d.evidence.length === 0 ? [value] : d.evidence.map((item, i) => (i === index ? value : item)) }));
  const setMilestone = (index: number, patch: Partial<MilestoneDraft>) => update((d) => ({ ...d, milestones: d.milestones.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  const toggleMilestones = (on: boolean) => update((d) => ({ ...d, useMilestones: on, milestones: on && d.milestones.length < 2 ? [emptyMilestone(), emptyMilestone()] : d.milestones }));

  return (
    <WizardStep step={4} title={t.publish.priceTitle} onNext={next}>
      {!useMilestones ? (
        <Field
          label={draft.kind === "group" ? t.publish.targetLabel : t.publish.amountLabel}
          value={draft.amount}
          onChangeText={(value) => update({ amount: value })}
          keyboardType="decimal-pad"
          error={errors.amount ? (errors.amount === "amountMin" ? t.publish.amountMinError : t.publish.amountError) : null}
        />
      ) : null}

      <Text style={text.label}>{t.publish.milestonesLabel}</Text>
      <Row>
        <Chip label={t.publish.yes} selected={useMilestones} onPress={() => toggleMilestones(true)} />
        <Chip label={t.publish.no} selected={!useMilestones} onPress={() => !required && toggleMilestones(false)} />
      </Row>
      <Secondary>{required ? t.publish.milestonesRequired : t.publish.milestonesOptional}</Secondary>

      {useMilestones ? (
        <>
          {(draft.milestones.length >= 2 ? draft.milestones : [emptyMilestone(), emptyMilestone()]).map((item, index) => (
            <View key={index} style={{ gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, backgroundColor: colors.white }}>
              <Text style={text.subtitle}>{`${t.milestonesBoard.title} ${index + 1}`}</Text>
              <Field label={t.publish.milestoneName} value={item.name} onChangeText={(name) => setMilestone(index, { name })} maxLength={60} error={errors[`m${index}.name`] ? t.publish.milestonesError : null} />
              <Field label={t.publish.milestoneAmount} value={item.amount} onChangeText={(value) => setMilestone(index, { amount: value })} keyboardType="decimal-pad" error={errors[`m${index}.amount`] ? t.publish.amountError : null} />
              <Field label={t.publish.milestoneCriteria} value={item.criteria} onChangeText={(criteria) => setMilestone(index, { criteria })} maxLength={200} multiline hint={t.publish.milestoneCriteriaHint} error={errors[`m${index}.criteria`] ? t.publish.milestonesError : null} />
              <Field label={t.publish.milestoneEvidence} value={item.evidence} onChangeText={(evidence) => setMilestone(index, { evidence })} maxLength={100} error={errors[`m${index}.evidence`] ? t.publish.milestonesError : null} />
              {draft.milestones.length > 2 ? <Button label={t.publish.removeMilestone} variant="ghost" onPress={() => update((d) => ({ ...d, milestones: d.milestones.filter((_, i) => i !== index) }))} /> : null}
            </View>
          ))}
          {draft.milestones.length < MAX_MILESTONES ? <Button label={t.publish.addMilestone} variant="secondary" onPress={() => update((d) => ({ ...d, milestones: [...(d.milestones.length >= 2 ? d.milestones : [emptyMilestone(), emptyMilestone()]), emptyMilestone()] }))} /> : null}
          <Text style={text.label}>{t.publish.materialsLabel}</Text>
          <Row>
            <Chip label={t.publish.materialsPayer} selected={draft.materials === "payer"} onPress={() => update({ materials: "payer" })} />
            <Chip label={t.publish.materialsWorker} selected={draft.materials === "worker"} onPress={() => update({ materials: "worker" })} />
          </Row>
          {errors.milestones ? <Text style={[text.secondary, { color: colors.error }]}>{t.publish.milestonesError}</Text> : null}
          {errors.amount === "amountMin" ? <Text style={[text.secondary, { color: colors.error }]}>{t.publish.amountMinError}</Text> : null}
        </>
      ) : null}

      {draft.kind === "group" ? (
        <>
          <Text style={text.label}>{t.publish.fundingLabel}</Text>
          <Row>
            {FUNDING_DAYS.map((days) => (
              <Chip key={days} label={`${days} ${t.publish.fundingDays}`} selected={draft.fundingDays === days} onPress={() => update({ fundingDays: days })} />
            ))}
          </Row>
        </>
      ) : null}

      <Text style={text.label}>{t.publish.evidenceLabel}</Text>
      {(draft.evidence.length > 0 ? draft.evidence : [""]).map((item, index) => (
        <Field key={index} label="" value={item} onChangeText={(value) => setEvidence(index, value)} maxLength={120} placeholder={t.publish.evidencePlaceholder} error={index === 0 && errors.evidence === "required" ? t.publish.evidenceRequired : null} />
      ))}
      {draft.evidence.length < EVIDENCE_MAX ? <Button label={t.publish.evidenceAdd} variant="ghost" onPress={() => update((d) => ({ ...d, evidence: [...d.evidence, ""] }))} /> : null}

      {amount !== null ? (
        <View style={{ gap: 4 }}>
          <Line label={useMilestones ? t.publish.milestonesTotal : t.publish.breakdownAmount} value={formatUsdc(amount.toString())} />
          {feeAmount !== null ? <Line label={t.publish.breakdownFee} value={formatUsdc(feeAmount.toString())} /> : null}
          <Secondary>{t.publish.breakdownFeeNote}</Secondary>
          <Line label={draft.kind === "group" ? t.publish.targetLabel : t.publish.breakdownTotal} value={formatUsdc(amount.toString())} strong />
        </View>
      ) : parseAmount(draft.amount) === null && !useMilestones ? null : null}
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
