import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { useDraft } from "../publish/DraftProvider";
import { stepsTotal } from "../publish/draft";
import { colors, radius, spacing, text } from "../theme";
import { Button, Screen, Title } from "./ui";
import type { IconName } from "./Icon";

// El marco de un asistente por pasos: barra de avance, "Paso N de M", título y un botón abajo. Lo usan publicar y el reclamo.
export function StepFrame({
  step,
  total,
  title,
  children,
  onNext,
  nextLabel = t.common.next,
  nextIcon = "chevron",
  loading,
  disabled,
  onBack,
}: {
  step: number;
  total: number;
  title: string;
  children: ReactNode;
  onNext: () => void;
  nextLabel?: string;
  nextIcon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  onBack?: () => void;
}) {
  return (
    <Screen onBack={onBack} footer={<Button label={nextLabel} icon={nextIcon} onPress={onNext} loading={loading} disabled={disabled} />}>
      <View style={styles.bar}>
        <View style={[styles.fill, { width: `${(step / total) * 100}%` }]} />
      </View>
      <Text style={text.label}>{`${t.publish.step} ${step} ${t.publish.of} ${total}`}</Text>
      <Title>{title}</Title>
      {children}
    </Screen>
  );
}

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
