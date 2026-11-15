import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ChatSummary } from "../../api/types";
import { PREVIEW_LABELS, loadPreview, previewFromSealed } from "../../chat/preview";
import { pairFromSecretHex } from "../../crypto/chat";
import { fetchCounterpartKey } from "../../crypto/keyManager";
import { useChats } from "../../data/useChats";
import { formatChatTime } from "../../lib/format";
import { secureKeyStorage } from "../../crypto/secureKeyStorage";
import { Button, Secondary, Title } from "../../components/ui";
import { PullSpinner } from "../../components/PullSpinner";
import { t } from "../../i18n";
import { usePullGesture } from "../../lib/usePullGesture";
import { useManualRefresh } from "../../lib/useManualRefresh";
import { useSession } from "../../session/SessionProvider";
import { colors, fonts, radius, spacing, text } from "../../theme";

function ChatRow({ chat }: { chat: ChatSummary }) {
  const { api, address } = useSession();
  const preview = useQuery({
    queryKey: ["preview", chat.applicationId, chat.lastSeq],
    enabled: Boolean(address) && chat.lastSeq > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const secret = await secureKeyStorage.getSecret((address as string).toLowerCase());
      if (!secret) return null;
      const theirs = await fetchCounterpartKey(api, chat.counterpart);
      if (!theirs) return null;
      const sealed = previewFromSealed(chat, pairFromSecretHex(secret), theirs, PREVIEW_LABELS);
      // Si el servidor no guardó el mensaje (era muy largo), se pide aparte.
      return sealed ?? (chat.lastBody ? null : await loadPreview(api, secureKeyStorage, address as string, chat));
    },
  });
  const name = chat.counterpartName ?? t.chat.unknownUser;
  const unread = chat.unreadCount > 0;
  const mine = chat.lastSender !== null && address !== null && chat.lastSender.toLowerCase() === address.toLowerCase();
  const line = chat.lastSeq === 0
    ? chat.waitingForOwner
      ? t.chat.waitingShort
      : chat.role === "owner"
        ? t.chat.noMessagesYet
        : ""
    : preview.data
      ? `${mine ? t.chat.you : ""}${preview.data}`
      : unread
        ? t.chat.newMessage
        : "";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/chat/[id]", params: { id: String(chat.applicationId), counterpart: chat.counterpart, title: chat.title } })}
      style={styles.row}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{name.trim().charAt(0).toUpperCase() || "?"}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.line}>
          <Text style={[styles.name, unread && styles.strong]} numberOfLines={1}>
            {name}
          </Text>
          {chat.lastAt ? <Text style={[text.label, unread && { color: colors.brick }]}>{formatChatTime(chat.lastAt)}</Text> : null}
        </View>
        <Text style={text.label} numberOfLines={1}>
          {t.chat.aboutJob} {chat.title}
        </Text>
        <View style={styles.line}>
          <Text style={[styles.preview, unread && styles.strong]} numberOfLines={1}>
            {line}
          </Text>
          {unread ? (
            <View style={styles.badge} accessibilityLabel={t.chat.unread}>
              <Text style={styles.badgeText}>{chat.unreadCount > 99 ? "99+" : chat.unreadCount}</Text>
            </View>
          ) : null}
        </View>
        {!chat.writable ? <Text style={text.label}>{t.chat.readOnly}</Text> : null}
      </View>
    </Pressable>
  );
}

export default function Messages() {
  const { address } = useSession();
  const chats = useChats();

  const refresh = useManualRefresh([() => chats.refetch()]);
  const pull = usePullGesture(refresh);

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
        {...pull}
          ListHeaderComponent={<PullSpinner active={refresh.refreshing} />}
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
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sand, alignItems: "center", justifyContent: "center", marginRight: spacing.md },
  avatarText: { fontFamily: fonts.bold, fontSize: 18, color: colors.brick },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  preview: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  strong: { fontFamily: fonts.bold, color: colors.ink },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.brick, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, color: colors.white },
});
