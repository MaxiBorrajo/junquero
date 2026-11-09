import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "./Icon";
import { t } from "../i18n";
import { lastPickableDay, startOfDay, withDay, withTime } from "../lib/datetime";
import { colors, radius, spacing, text } from "../theme";

const dayText = (date: Date): string => date.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
const timeText = (date: Date): string => date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });

export function DateTimeField({ value, onChange }: { value: number | null; onChange: (seconds: number) => void }) {
  const current = value === null ? null : new Date(value * 1000);

  const pickDay = () => {
    const now = new Date();
    DateTimePickerAndroid.open({
      value: current ?? now,
      mode: "date",
      minimumDate: startOfDay(now),
      maximumDate: lastPickableDay(now),
      onValueChange: (_event, date) => onChange(withDay(value, date)),
    });
  };

  const pickTime = () => {
    const now = new Date();
    DateTimePickerAndroid.open({
      value: current ?? now,
      mode: "time",
      is24Hour: true,
      onValueChange: (_event, date) => onChange(withTime(value, date, now)),
    });
  };

  return (
    <View style={styles.box}>
      <Cell icon="calendar" label={t.publish.day} value={current ? dayText(current) : t.publish.pickDay} filled={current !== null} onPress={pickDay} />
      <Cell icon="clock" label={t.publish.time} value={current ? timeText(current) : t.publish.pickTime} filled={current !== null} onPress={pickTime} />
    </View>
  );
}

function Cell({ icon, label, value, filled, onPress }: { icon: IconName; label: string; value: string; filled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.cell, pressed && styles.pressed]}>
      <Icon name={icon} size={22} color={colors.brick} />
      <View style={styles.cellText}>
        <Text style={text.secondary}>{label}</Text>
        <Text style={[text.body, !filled && styles.placeholder]}>{value}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  cell: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, minHeight: 64 },
  cellText: { flex: 1 },
  placeholder: { color: colors.muted },
  pressed: { opacity: 0.85 },
});
