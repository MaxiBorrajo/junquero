import { router } from "expo-router";
import { useEffect } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PullSpinner } from "../components/PullSpinner";
import { BackButton, Secondary, Title } from "../components/ui";
import { useLastSeen, useMarkSeen, useNotifications, type NotificationItem } from "../data/useNotifications";
import { t } from "../i18n";
import { notificationText } from "../lib/notificationText";
import { formatDate } from "../lib/format";
import { usePullGesture } from "../lib/usePullGesture";
import { useManualRefresh } from "../lib/useManualRefresh";
import { routeForNotification } from "../push/routes";
import { colors, radius, spacing, text } from "../theme";

export default function Notifications() {
  const list = useNotifications();
  const seen = useLastSeen();
  const mark = useMarkSeen();
  const refresh = useManualRefresh([() => list.refetch()]);
  const pull = usePullGesture(refresh);
  const items = list.data ?? [];
  const newest = items[0]?.createdAt ?? 0;
  const lastSeen = seen.data ?? 0;

  useEffect(() => {
    if (newest > lastSeen && seen.isSuccess) mark.mutate(newest);
  }, [newest, seen.isSuccess]);

  return (
    <SafeAreaView style={styles.screen}>
      <BackButton />
      <View style={styles.header}>
        <Title>{t.notifications.title}</Title>
      </View>
      <FlatList
        contentContainerStyle={styles.list}
        {...pull}
          ListHeaderComponent={<PullSpinner active={refresh.refreshing} />}
        data={items}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={<Secondary>{list.isLoading ? t.common.loading : t.notifications.empty}</Secondary>}
        renderItem={({ item }) => <Row item={item} isNew={item.createdAt > lastSeen} />}
      />
    </SafeAreaView>
  );
}

function Row({ item, isNew }: { item: NotificationItem; isNew: boolean }) {
  const copy = notificationText(item.kind);
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(routeForNotification(item.kind, item.ref) as never)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {isNew ? <View style={styles.dot} /> : <View style={styles.dotSpace} />}
      <View style={styles.body}>
        <Text style={text.subtitle}>{copy.title}</Text>
        <Text style={text.body}>{copy.body}</Text>
        <Secondary>{formatDate(item.createdAt)}</Secondary>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.md },
  list: { padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  pressed: { opacity: 0.85 },
  body: { flex: 1, gap: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brick, marginTop: 6 },
  dotSpace: { width: 10 },
});
