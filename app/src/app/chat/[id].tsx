import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useChatRoom } from "../../chat/useChatRoom";
import { Body, Button, ErrorText, Secondary } from "../../components/ui";
import { t } from "../../i18n";
import { colors, radius, spacing, text } from "../../theme";

export default function ChatScreen() {
  const { id, counterpart, title } = useLocalSearchParams<{ id: string; counterpart: string; title?: string }>();
  const room = useChatRoom(Number(id), String(counterpart));
  const [draft, setDraft] = useState("");
  const list = useRef<FlatList>(null);

  const submit = () => {
    room.send(draft);
    setDraft("");
  };

  if (room.status !== "ready") {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          {room.status === "loading" ? <Body>{t.chat.activating}</Body> : null}
          {room.status === "key-denied" ? <ErrorText>{t.chat.keyDenied}</ErrorText> : null}
          {room.status === "no-counterpart-key" ? <ErrorText>{t.chat.noCounterpartKey}</ErrorText> : null}
          {room.status === "error" ? <ErrorText>{t.chat.error}</ErrorText> : null}
          {room.status !== "loading" ? <Button label={room.status === "key-denied" ? t.chat.activate : t.common.retry} onPress={room.reload} /> : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Text style={text.subtitle} numberOfLines={1}>
            {title ?? ""}
          </Text>
          <Secondary>{t.chat.privacy}</Secondary>
        </View>
        <FlatList
          ref={list}
          contentContainerStyle={styles.messages}
          data={room.view}
          keyExtractor={(item) => item.key}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.mine ? styles.mine : styles.theirs]}>
              <Text style={[text.body, item.mine && styles.mineText]}>{item.text ?? t.chat.unreadable}</Text>
              {item.status === "sending" ? <Text style={[text.label, item.mine && styles.mineText]}>{t.chat.sending}</Text> : null}
              {item.status === "failed" ? (
                <View style={styles.failedRow}>
                  <Text style={[text.label, styles.mineText]}>{t.chat.failed}</Text>
                  <Pressable onPress={() => room.retry(item)}>
                    <Text style={[text.label, styles.mineText, styles.link]}>{t.chat.retry}</Text>
                  </Pressable>
                  <Pressable onPress={() => room.discard(item)}>
                    <Text style={[text.label, styles.mineText, styles.link]}>{t.chat.discard}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
        />
        {room.writable ? (
          <View style={styles.composer}>
            <TextInput style={styles.input} value={draft} onChangeText={setDraft} placeholder={t.chat.placeholder} placeholderTextColor={colors.muted} multiline maxLength={2000} />
            <Button label={t.chat.send} onPress={submit} disabled={draft.trim().length === 0} />
          </View>
        ) : (
          <View style={styles.composer}>
            <Secondary>{t.chat.readOnly}</Secondary>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, padding: spacing.md, gap: spacing.md, justifyContent: "center" },
  header: { padding: spacing.md, gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.line },
  messages: { padding: spacing.md, gap: spacing.sm },
  bubble: { maxWidth: "80%", borderRadius: radius.md, padding: spacing.sm + 2, gap: 2 },
  mine: { alignSelf: "flex-end", backgroundColor: colors.brick },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  mineText: { color: colors.white },
  failedRow: { flexDirection: "row", gap: spacing.sm },
  link: { textDecorationLine: "underline" },
  composer: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, alignItems: "flex-end", borderTopWidth: 1, borderTopColor: colors.line },
  input: { ...text.body, flex: 1, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxHeight: 120 },
});
