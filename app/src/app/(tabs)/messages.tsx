import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ChatSummary, PublicProfile } from "../../api/types";
import { loadPreview } from "../../chat/preview";
import { secureKeyStorage } from "../../crypto/secureKeyStorage";
import { Button, Secondary, Title } from "../../components/ui";
import { PullRefreshControl } from "../../components/PullRefreshControl";
import { t } from "../../i18n";
import { useManualRefresh } from "../../lib/useManualRefresh";
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
  const { api, address } = useSession();
  const preview = useQuery({
    queryKey: ["preview", chat.applicationId, chat.lastSeq],
    enabled: Boolean(address) && chat.lastSeq > 0,
    staleTime: Infinity,
    queryFn: () => loadPreview(api, secureKeyStorage, address as string, chat),
  });
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
        {chat.lastSeq > 0 ? <Text style={text.secondary} numberOfLines={1}>{preview.data ?? (chat.unread ? t.chat.newMessage : "")}</Text> : null}
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

  const refresh = useManualRefresh([() => chats.refetch()]);

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
        refreshControl={<PullRefreshControl refresh={refresh} />}
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
