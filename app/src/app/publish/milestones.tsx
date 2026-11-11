import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button, Field, Screen, Title } from "../../components/ui";
import { t } from "../../i18n";
import { MAX_MILESTONES, MIN_MILESTONES, emptyMilestone, validateMilestones, type MilestoneDraft } from "../../publish/draft";
import { useDraft } from "../../publish/DraftProvider";
import { colors, radius, spacing, text } from "../../theme";

// Carga de hitos: sin `index` los pide de a uno (1, 2, ...) y vuelve al paso de precio al completar los obligatorios.
// Con `index` edita ese hito y vuelve.
export default function PublishMilestones() {
  const { draft, update } = useDraft();
  const params = useLocalSearchParams<{ index?: string }>();
  const single = params.index !== undefined;
  const [step, setStep] = useState(single ? Math.max(0, Number(params.index) || 0) : 0);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    update((d) => ({
      ...d,
      useMilestones: true,
      milestones: d.milestones.length >= MIN_MILESTONES ? d.milestones : [...d.milestones, ...Array.from({ length: MIN_MILESTONES - d.milestones.length }, emptyMilestone)],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = Math.max(MIN_MILESTONES, draft.milestones.length);
  const item: MilestoneDraft = draft.milestones[step] ?? emptyMilestone();
  const errors = touched ? validateMilestones({ ...draft, useMilestones: true }) : {};
  const set = (patch: Partial<MilestoneDraft>) =>
    update((d) => {
      const list = d.milestones.length > step ? d.milestones : [...d.milestones, ...Array.from({ length: step + 1 - d.milestones.length }, emptyMilestone)];
      return { ...d, milestones: list.map((m, i) => (i === step ? { ...m, ...patch } : m)) };
    });

  const complete = () => Object.keys(validateMilestones({ ...draft, useMilestones: true })).every((key) => !key.startsWith(`m${step}.`));
  const last = single || step >= MIN_MILESTONES - 1;

  const next = () => {
    setTouched(true);
    if (!complete()) return;
    if (last) router.back();
    else {
      setTouched(false);
      setStep(step + 1);
    }
  };

  const remove = () => {
    update((d) => ({ ...d, milestones: d.milestones.filter((_, i) => i !== step) }));
    router.back();
  };

  return (
    <Screen footer={<Button label={last ? t.publish.milestoneDone : t.publish.milestoneNext} onPress={next} />}>
      <Text style={text.label}>{`${t.milestonesBoard.title} ${step + 1} ${t.publish.milestoneOf} ${total}`}</Text>
      <Title>{`${t.milestonesBoard.title} ${step + 1}`}</Title>
      <Field label={t.publish.milestoneName} value={item.name} onChangeText={(name) => set({ name })} maxLength={60} error={errors[`m${step}.name`] ? t.publish.milestonesError : null} />
      <Field label={t.publish.milestoneAmount} value={item.amount} onChangeText={(amount) => set({ amount })} keyboardType="decimal-pad" error={errors[`m${step}.amount`] ? t.publish.amountError : null} />
      <Field label={t.publish.milestoneCriteria} value={item.criteria} onChangeText={(criteria) => set({ criteria })} maxLength={200} multiline hint={t.publish.milestoneCriteriaHint} error={errors[`m${step}.criteria`] ? t.publish.milestonesError : null} />
      <Field label={t.publish.milestoneEvidence} value={item.evidence} onChangeText={(evidence) => set({ evidence })} maxLength={100} error={errors[`m${step}.evidence`] ? t.publish.milestonesError : null} />
      {single && draft.milestones.length > MIN_MILESTONES ? <Button label={t.publish.removeMilestone} variant="ghost" onPress={remove} /> : null}
      <View style={{ height: spacing.md }} />
    </Screen>
  );
}
