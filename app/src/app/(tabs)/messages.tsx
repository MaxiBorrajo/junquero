import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ChatSummary, PublicProfile } from "../../api/types";
import { Button, Secondary, Title } from "../../components/ui";
import { t } from "../../i18n";
import { useSession } from "../../session/SessionProvider";
import { colors, radius, spacing, text } from "../../theme";

function useCounterpartName(address: string) {
  const { api } = useSession();
  return useQuery({
    queryKey: ["profile", address],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      try {
        return await api.get<PublicProfile>(`/profiles/${address}`);
      } catch {
        return null;
      }
    },
  });
}

function ChatRow({ chat }: { chat: ChatSummary }) {
  const name = useCounterpartName(chat.counterpart);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/chat/[id]", params: { id: String(chat.applicationId), counterpart: chat.counterpart, title: chat.title } })}
      style={styles.row}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={text.subtitle} numberOfLines={1}>
          {chat.title}
        </Text>
        <Secondary>{name.data?.name ?? t.chat.unknownUser}</Secondary>
        {!chat.writable ? <Text style={text.label}>{t.chat.readOnly}</Text> : null}
      </View>
      {chat.unread ? <View style={styles.dot} accessibilityLabel={t.chat.unread} /> : null}
    </Pressable>
  );
}

export default function Messages() {
  const { api, address } = useSession();
  const chats = useQuery({
    queryKey: ["chats", address],
    enabled: Boolean(address),
    refetchInterval: 20_000,
    queryFn: async () => (await api.get<{ chats: ChatSummary[] }>("/me/chats")).chats,
  });

  if (!address) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.pad}>
          <Title>{t.tabs.messages}</Title>
          <Secondary>{t.chat.needAccount}</Secondary>
          <Button label={t.mine.enter} onPress={() => router.push("/welcome")} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.pad}>
        <Title>{t.tabs.messages}</Title>
      </View>
      <FlatList
        contentContainerStyle={styles.list}
        data={chats.data ?? []}
        keyExtractor={(item) => String(item.applicationId)}
        ListEmptyComponent={<Secondary>{t.chat.empty}</Secondary>}
        renderItem={({ item }) => <ChatRow chat={item} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pad: { padding: spacing.md, gap: spacing.md },
  list: { padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.line },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brick },
});
