import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { useDraft } from "../publish/DraftProvider";
import { stepsTotal } from "../publish/draft";
import { colors, radius, spacing, text } from "../theme";
import { Button, Screen, Title } from "./ui";

export function WizardStep({
  step,
  total,
  title,
  children,
  onNext,
  nextLabel = t.common.next,
  loading,
}: {
  step: number;
  total?: number;
  title: string;
  children: ReactNode;
  onNext: () => void;
  nextLabel?: string;
  loading?: boolean;
}) {
  const { draft } = useDraft();
  const steps = total ?? stepsTotal(draft);
  return (
    <Screen footer={<Button label={nextLabel} icon="chevron" onPress={onNext} loading={loading} />}>
      <View style={styles.bar}>
        <View style={[styles.fill, { width: `${(step / steps) * 100}%` }]} />
      </View>
      <Text style={text.label}>{`${t.publish.step} ${step} ${t.publish.of} ${steps}`}</Text>
      <Title>{title}</Title>
      {children}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.line, overflow: "hidden", marginBottom: spacing.xs },
  fill: { height: 6, backgroundColor: colors.brick },
});
