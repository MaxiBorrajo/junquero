import { StyleSheet, Text, View } from "react-native";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { colors, fonts, radius, spacing, text } from "../theme";

export interface JourneyStep {
  key: string;
  label: string;
  // Qué hacer ahora, solo se muestra en el paso actual.
  hint?: string;
}

// El camino feliz de una pantalla: qué pasos hay, cuál ya está hecho y cuál toca ahora.
export function Journey({ title, steps, current }: { title: string; steps: JourneyStep[]; current: number }) {
  return (
    <Card gap="sm">
      <Text style={text.label}>{title}</Text>
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <View key={step.key} style={styles.row}>
            <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
              {done ? <Icon name="check" size={14} color={colors.white} /> : <Text style={[text.label, active && { color: colors.white }]}>{index + 1}</Text>}
            </View>
            <View style={styles.body}>
              <Text style={[text.body, !active && !done && { color: colors.muted }, active && styles.activeLabel]}>{step.label}</Text>
              {active && step.hint ? <Text style={text.secondary}>{step.hint}</Text> : null}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  dot: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, alignItems: "center", justifyContent: "center", marginTop: 1 },
  dotDone: { backgroundColor: colors.success, borderColor: colors.success },
  dotActive: { backgroundColor: colors.brick, borderColor: colors.brick },
  body: { flex: 1, gap: 2 },
  activeLabel: { fontFamily: fonts.bold },
});
