import { router } from "expo-router";
import { FlatList, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChangaCard } from "../components/ChangaCard";
import { Secondary } from "../components/ui";
import { useFilters } from "../data/filterStore";
import { useRemoteChangas } from "../data/useChangas";
import { t } from "../i18n";
import { colors, spacing } from "../theme";

export default function RemoteList() {
  const { data } = useRemoteChangas(useFilters());
  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={data ?? []}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={<Secondary>{t.map.empty}</Secondary>}
        renderItem={({ item }) => <ChangaCard changa={item} onPress={() => router.push({ pathname: "/changa/[specHash]", params: { specHash: item.specHash } })} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm },
});
