import { router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { Button, Chip, ErrorText, Field, Labeled, Row, Screen, Title } from "../components/ui";
import { getFilters, setFilters } from "../data/filterStore";
import { t } from "../i18n";
import { noFilters, validateFilters, type Filters } from "../lib/filters";
import { text } from "../theme";

export default function FiltersScreen() {
  const [draft, setDraft] = useState<Filters>(getFilters());
  const [touched, setTouched] = useState(false);
  const valid = validateFilters(draft);

  const apply = () => {
    setTouched(true);
    if (!valid) return;
    setFilters(draft);
    router.back();
  };

  return (
    <Screen
      footer={
        <>
          <Button label={t.filters.apply} onPress={apply} />
          <Button
            label={t.filters.clear}
            variant="ghost"
            onPress={() => {
              setFilters(noFilters());
              router.back();
            }}
          />
        </>
      }
    >
      <Title>{t.filters.title}</Title>
      <Labeled label={t.filters.category}>
        <Row>
          <Chip label={t.filters.all} selected={draft.category === null} onPress={() => setDraft({ ...draft, category: null })} />
          {t.publish.categories.map((name, index) => (
            <Chip key={name} label={name} selected={draft.category === index} onPress={() => setDraft({ ...draft, category: index })} />
          ))}
        </Row>
      </Labeled>
      <Labeled label={t.filters.amount}>
      <Field label={t.filters.min} value={draft.minAmount} onChangeText={(minAmount) => setDraft({ ...draft, minAmount })} keyboardType="decimal-pad" />
      <Field label={t.filters.max} value={draft.maxAmount} onChangeText={(maxAmount) => setDraft({ ...draft, maxAmount })} keyboardType="decimal-pad" />
      </Labeled>
      {touched && !valid ? <ErrorText>{t.filters.invalid}</ErrorText> : null}
    </Screen>
  );
}
