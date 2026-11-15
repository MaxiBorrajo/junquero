import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "../../components/Icon";
import { Body, Button, Field, Labeled } from "../../components/ui";
import { WizardStep } from "../../components/Wizard";
import { t } from "../../i18n";
import { EVIDENCE_MAX, validateEvidence } from "../../publish/draft";
import { useDraft } from "../../publish/DraftProvider";
import { colors } from "../../theme";

export default function PublishEvidence() {
  const { draft, update } = useDraft();
  const [touched, setTouched] = useState(false);
  const errors = touched ? validateEvidence(draft) : {};

  const next = () => {
    setTouched(true);
    if (Object.keys(validateEvidence(draft)).length === 0) router.push("/publish/review");
  };

  const setEvidence = (index: number, value: string) =>
    update((d) => ({ ...d, evidence: d.evidence.length === 0 ? [value] : d.evidence.map((item, i) => (i === index ? value : item)) }));

  return (
    <WizardStep step={6} title={t.publish.evidenceTitle} onNext={next}>
      <Body>{t.publish.evidenceIntro}</Body>
      <Labeled label={t.publish.evidenceLabel}>
        {(draft.evidence.length > 0 ? draft.evidence : [""]).map((item, index, list) => (
          <View key={index} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field label="" value={item} onChangeText={(value) => setEvidence(index, value)} maxLength={120} placeholder={t.publish.evidencePlaceholder} error={index === 0 && errors.evidence === "required" ? t.publish.evidenceRequired : null} />
            </View>
            {list.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.publish.evidenceRemove}
                onPress={() => update((d) => ({ ...d, evidence: d.evidence.filter((_, i) => i !== index) }))}
                style={{ width: 52, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: colors.brick, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="trash" size={20} color={colors.brick} />
              </Pressable>
            ) : null}
          </View>
        ))}
      </Labeled>
      {draft.evidence.length < EVIDENCE_MAX ? (
        <Button label={t.publish.evidenceAdd} variant="outline" icon="plus" onPress={() => update((d) => ({ ...d, evidence: [...d.evidence, ""] }))} />
      ) : null}
    </WizardStep>
  );
}
