import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Chip, Field, Row, Secondary } from "../../components/ui";
import { WizardStep } from "../../components/Wizard";
import { protocolFee } from "../../chain/fee";
import { milestonesRequired } from "../../chain/terms";
import { readFeeRule, readMilestoneRule } from "../../chain/reader";
import { t } from "../../i18n";
import { formatUsdc } from "../../lib/money";
import { EVIDENCE_MAX, FUNDING_DAYS, MAX_MILESTONES, MIN_MILESTONES, emptyMilestone, parseAmount, totalAmount, validateMilestones, validatePrice } from "../../publish/draft";
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
  const toggleMilestones = (on: boolean) => update((d) => ({ ...d, useMilestones: on, milestones: on && d.milestones.length < 2 ? [emptyMilestone(), emptyMilestone()] : d.milestones }));
  const openMilestone = (index: number) => router.push({ pathname: "/publish/milestones", params: { index: String(index) } });
  const incomplete = Object.keys(validateMilestones({ ...draft, useMilestones: true })).length > 0;

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
        <Chip label={t.publish.yes} selected={useMilestones} onPress={() => { const was = useMilestones; toggleMilestones(true); if (!was) router.push("/publish/milestones"); }} />
        <Chip label={t.publish.no} selected={!useMilestones} onPress={() => !required && toggleMilestones(false)} />
      </Row>
      <Secondary>{required ? t.publish.milestonesRequired : t.publish.milestonesOptional}</Secondary>

      {useMilestones ? (
        <>
          {draft.milestones.map((item, index) => {
            const missing = Object.keys(validateMilestones({ ...draft, useMilestones: true })).some((key) => key.startsWith(`m${index}.`));
            const value = parseAmount(item.amount);
            return (
              <Pressable key={index} accessibilityRole="button" onPress={() => openMilestone(index)} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: missing && touched ? colors.error : colors.line, borderRadius: 12, padding: 12, backgroundColor: colors.white }}>
                <Text style={text.subtitle}>{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={text.body} numberOfLines={1}>{item.name.trim() || t.publish.milestoneNoName}</Text>
                  {missing ? <Secondary style={touched ? { color: colors.error } : undefined}>{t.publish.milestoneMissing}</Secondary> : null}
                </View>
                <Text style={text.body}>{value !== null ? formatUsdc(value.toString()) : "—"}</Text>
              </Pressable>
            );
          })}
          {draft.milestones.length < MIN_MILESTONES || incomplete ? <Button label={t.publish.milestonesLoad} variant="secondary" onPress={() => router.push("/publish/milestones")} /> : null}
          {draft.milestones.length >= MIN_MILESTONES && draft.milestones.length < MAX_MILESTONES ? <Button label={t.publish.addMilestone} variant="secondary" onPress={() => { update((d) => ({ ...d, milestones: [...d.milestones, emptyMilestone()] })); openMilestone(draft.milestones.length); }} /> : null}
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

      {!useMilestones ? (
        <>
      <Text style={text.label}>{t.publish.evidenceLabel}</Text>
      {(draft.evidence.length > 0 ? draft.evidence : [""]).map((item, index, list) => (
        <View key={index} style={{ gap: 4 }}>
          <Field label="" value={item} onChangeText={(value) => setEvidence(index, value)} maxLength={120} placeholder={t.publish.evidencePlaceholder} error={index === 0 && errors.evidence === "required" ? t.publish.evidenceRequired : null} />
          {list.length > 1 ? <Button label={t.publish.evidenceRemove} variant="ghost" onPress={() => update((d) => ({ ...d, evidence: d.evidence.filter((_, i) => i !== index) }))} /> : null}
        </View>
      ))}
      {draft.evidence.length < EVIDENCE_MAX ? <Button label={t.publish.evidenceAdd} variant="ghost" onPress={() => update((d) => ({ ...d, evidence: [...d.evidence, ""] }))} /> : null}
        </>
      ) : null}

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
