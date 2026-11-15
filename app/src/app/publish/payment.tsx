import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Chip, Labeled, Row, Secondary } from "../../components/ui";
import { WizardStep } from "../../components/Wizard";
import { t } from "../../i18n";
import { formatUsdc } from "../../lib/money";
import { FUNDING_DAYS, MAX_MILESTONES, MIN_MILESTONES, emptyMilestone, milestonesSum, parseAmount, validateMilestones, validatePayment } from "../../publish/draft";
import { useDraft } from "../../publish/DraftProvider";
import { colors, fonts, text } from "../../theme";

// Paso "Cómo se paga": todo al finalizar o por hitos y, en las changas grupales, el plazo para juntar los aportes.
export default function PublishPayment() {
  const { draft, update } = useDraft();
  const [touched, setTouched] = useState(false);
  const useMilestones = draft.useMilestones;
  const errors = touched ? validatePayment(draft) : {};
  const sum = milestonesSum(draft);
  const incomplete = Object.keys(validateMilestones({ ...draft, useMilestones: true })).length > 0;

  const next = () => {
    setTouched(true);
    if (Object.keys(validatePayment(draft)).length === 0) router.push("/publish/price");
  };

  const toggleMilestones = (on: boolean) => update((d) => ({ ...d, useMilestones: on, milestones: on && d.milestones.length < 2 ? [emptyMilestone(), emptyMilestone()] : d.milestones }));
  const openMilestone = (index: number) => router.push({ pathname: "/publish/milestones", params: { index: String(index) } });

  return (
    <WizardStep step={4} title={t.publish.paymentTitle} onNext={next}>
      <Labeled label={t.publish.milestonesLabel}>
        <Row>
          <Chip
            label={t.publish.yes}
            selected={useMilestones}
            onPress={() => {
              const was = useMilestones;
              toggleMilestones(true);
              if (!was) router.push("/publish/milestones");
            }}
          />
          <Chip label={t.publish.no} selected={!useMilestones} onPress={() => toggleMilestones(false)} />
        </Row>
      </Labeled>
      <Secondary>{useMilestones ? t.publish.milestonesOptional : t.publish.paymentSingleHint}</Secondary>
      {useMilestones ? (
        <>
          {draft.milestones.map((item, index) => {
            const missing = Object.keys(validateMilestones({ ...draft, useMilestones: true })).some((key) => key.startsWith(`m${index}.`));
            const value = parseAmount(item.amount);
            return (
              <Pressable
                key={index}
                accessibilityRole="button"
                onPress={() => openMilestone(index)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: missing && touched ? colors.error : colors.line, borderRadius: 12, padding: 12, backgroundColor: colors.white }}
              >
                <Text style={text.subtitle}>{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={text.body} numberOfLines={1}>
                    {item.name.trim() || t.publish.milestoneNoName}
                  </Text>
                  {missing ? <Secondary style={touched ? { color: colors.error } : undefined}>{t.publish.milestoneMissing}</Secondary> : null}
                </View>
                <Text style={text.body}>{value !== null ? formatUsdc(value.toString()) : "—"}</Text>
              </Pressable>
            );
          })}
          {draft.milestones.length < MIN_MILESTONES || incomplete ? <Button label={t.publish.milestonesLoad} icon="list" variant="secondary" onPress={() => router.push("/publish/milestones")} /> : null}
          {draft.milestones.length >= MIN_MILESTONES && draft.milestones.length < MAX_MILESTONES ? (
            <Button
              label={t.publish.addMilestone}
              icon="plus"
              variant="secondary"
              onPress={() => {
                update((d) => ({ ...d, milestones: [...d.milestones, emptyMilestone()] }));
                openMilestone(draft.milestones.length);
              }}
            />
          ) : null}
          {sum !== null ? <Text style={text.body}>{`${t.publish.milestonesTotal}: ${formatUsdc(sum.toString())}`}</Text> : null}
          <Labeled label={t.publish.materialsLabel}>
            <Row>
              <Chip label={t.publish.materialsPayer} selected={draft.materials === "payer"} onPress={() => update({ materials: "payer" })} />
              <Chip label={t.publish.materialsWorker} selected={draft.materials === "worker"} onPress={() => update({ materials: "worker" })} />
            </Row>
          </Labeled>
          {errors.milestones ? <Text style={[text.secondary, { color: colors.error }]}>{t.publish.milestonesError}</Text> : null}
        </>
      ) : null}

      {draft.kind === "group" ? (
        <Labeled label={t.publish.fundingLabel}>
          <Row>
            {FUNDING_DAYS.map((days) => (
              <Chip key={days} label={`${days} ${t.publish.fundingDays}`} selected={draft.fundingDays === days} onPress={() => update({ fundingDays: days })} />
            ))}
          </Row>
        </Labeled>
      ) : null}
    </WizardStep>
  );
}
