import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Chip, Row } from "./ui";
import { t } from "../i18n";
import { atTime, dayOptions } from "../publish/draft";
import { spacing, text } from "../theme";

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);
const MINUTES = [0, 15, 30, 45];

const dayLabel = (day: Date): string => day.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });

export function DateTimeField({ value, onChange, dayCount = 21 }: { value: number | null; onChange: (seconds: number) => void; dayCount?: number }) {
  const days = useMemo(() => dayOptions(new Date(), dayCount), [dayCount]);
  const current = value === null ? null : new Date(value * 1000);
  const selectedDay = current ? days.find((day) => day.toDateString() === current.toDateString()) ?? null : null;
  const hour = current?.getHours() ?? 9;
  const minute = current?.getMinutes() ?? 0;

  return (
    <View style={styles.box}>
      <Text style={text.label}>{t.publish.day}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {days.map((day) => (
          <Chip key={day.toISOString()} label={dayLabel(day)} selected={selectedDay?.toDateString() === day.toDateString()} onPress={() => onChange(atTime(day, hour, minute))} />
        ))}
      </ScrollView>
      <Text style={text.label}>{t.publish.time}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {HOURS.map((h) => (
          <Chip key={h} label={`${String(h).padStart(2, "0")} h`} selected={current !== null && hour === h} onPress={() => onChange(atTime(selectedDay ?? days[0]!, h, minute))} />
        ))}
      </ScrollView>
      <Row>
        {MINUTES.map((m) => (
          <Chip key={m} label={`:${String(m).padStart(2, "0")}`} selected={current !== null && minute === m} onPress={() => onChange(atTime(selectedDay ?? days[0]!, hour, m))} />
        ))}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  scroll: { gap: spacing.sm },
});
