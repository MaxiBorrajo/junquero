import { router } from "expo-router";
import { useState } from "react";
import { Chip, Field, Labeled, Row, Secondary } from "../../components/ui";
import { WizardStep } from "../../components/Wizard";
import { t } from "../../i18n";
import { setModality, validateBasics } from "../../publish/draft";
import { useDraft } from "../../publish/DraftProvider";
import { Text } from "react-native";
import { text } from "../../theme";

export default function PublishBasics() {
  const { draft, update } = useDraft();
  const [touched, setTouched] = useState(false);
  const errors = touched ? validateBasics(draft) : {};

  const next = () => {
    setTouched(true);
    if (Object.keys(validateBasics(draft)).length === 0) router.push("/publish/when");
  };

  return (
    <WizardStep step={1} title={t.publish.basicsTitle} onNext={next}>
      <Field label={t.publish.titleLabel} value={draft.title} onChangeText={(title) => update({ title })} maxLength={80} hint={t.publish.titleHint} error={errors.title ? t.publish.titleError : null} />
      <Labeled label={t.publish.typeLabel}>
        <Row>
          <Chip icon="pin" label={t.publish.onsite} selected={draft.modality === "onsite"} onPress={() => update((d) => setModality(d, "onsite"))} />
          <Chip icon="globe" label={t.publish.remote} selected={draft.modality === "remote"} onPress={() => update((d) => setModality(d, "remote"))} />
        </Row>
      </Labeled>
      <Labeled label={t.publish.kindLabel}>
        <Row>
          <Chip icon="wallet" label={t.publish.individual} selected={draft.kind === "individual"} onPress={() => update({ kind: "individual" })} />
          <Chip icon="users" label={t.publish.group} selected={draft.kind === "group"} onPress={() => update({ kind: "group" })} />
        </Row>
      </Labeled>
      {draft.kind === "group" ? <Secondary>{t.publish.groupNote}</Secondary> : null}
      <Labeled label={t.publish.categoryLabel}>
        <Row>
          {t.publish.categories.map((name, index) => (
            <Chip key={name} label={name} selected={draft.category === index} onPress={() => update({ category: index })} />
          ))}
        </Row>
      </Labeled>
      {errors.category ? <Text style={[text.secondary, { color: "#A3174E" }]}>{t.publish.categoryError}</Text> : null}
      <Field label={t.publish.descriptionLabel} value={draft.description} onChangeText={(description) => update({ description })} multiline maxLength={2000} />
    </WizardStep>
  );
}
