import { File } from "expo-file-system";
import { Card } from "../../components/Card";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ATTACHMENTS_PER_MESSAGE, ATTACHMENT_MAX_BYTES, formatSize, type ChatFile } from "../../chat/envelope";
import { useChatRoom } from "../../chat/useChatRoom";
import { ChoiceSheet } from "../../components/ChoiceSheet";
import { Icon } from "../../components/Icon";
import { PersonMenu } from "../../components/PersonMenu";
import { useToast } from "../../components/Toast";
import { useAttachmentViewer } from "../../components/useAttachmentViewer";
import { BackButton, Body, Button, ErrorText, Secondary } from "../../components/ui";
import { t } from "../../i18n";
import { detectContact, type ContactKind } from "../../lib/contactGuard";
import { writeTempFile } from "../../lib/openDocument";
import { pickDocuments, pickPhotos, takePhoto, type PickedFile } from "../../lib/pick";
import { colors, fonts, radius, spacing, text } from "../../theme";

// La tarjeta de pago protegido se recuerda plegada mientras dura la sesión.
let protectedCollapsed = false;

function ProtectedCard() {
  const [collapsed, setCollapsed] = useState(protectedCollapsed);
  const toggle = () => {
    protectedCollapsed = !collapsed;
    setCollapsed(!collapsed);
  };
  return (
    <Card gap="xs" onPress={toggle}>
      <View style={styles.protectedHead}>
        <Icon name="shield" size={18} color={colors.success} />
        <Text style={styles.protectedTitle}>{t.chat.protectedTitle}</Text>
        <Text style={styles.protectedToggle}>{collapsed ? t.chat.protectedShow : t.chat.protectedHide}</Text>
      </View>
      {collapsed ? null : <Text style={styles.protectedBody}>{t.chat.protectedBody}</Text>}
    </Card>
  );
}

export default function ChatScreen() {
  const { id, counterpart, title } = useLocalSearchParams<{ id: string; counterpart: string; title?: string }>();
  const room = useChatRoom(Number(id), String(counterpart));
  const toast = useToast();
  const attachmentViewer = useAttachmentViewer();
  const [draft, setDraft] = useState("");
  const [picks, setPicks] = useState<PickedFile[]>([]);
  const [sheet, setSheet] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<ContactKind | null>(null);
  const list = useRef<FlatList>(null);

  const canSubmit = draft.trim().length > 0 || picks.length > 0;

  const submit = () => {
    const kind = room.access.contactsAllowed ? null : detectContact(draft);
    if (kind) {
      setBlocked(kind);
      return;
    }
    setBlocked(null);
    setAttachError(null);
    room.send(draft, picks);
    setDraft("");
    setPicks([]);
  };

  const addPicks = (incoming: PickedFile[]) => {
    const room_ = ATTACHMENTS_PER_MESSAGE - picks.length;
    if (incoming.length === 0) return;
    if (room_ <= 0) {
      setAttachError(t.chat.attachFull.replace("{max}", String(ATTACHMENTS_PER_MESSAGE)));
      return;
    }
    const accepted: PickedFile[] = [];
    let tooBig = false;
    for (const pick of incoming.slice(0, room_)) {
      try {
        if (new File(pick.uri).size > ATTACHMENT_MAX_BYTES) tooBig = true;
        else accepted.push(pick);
      } catch {
        accepted.push(pick);
      }
    }
    setAttachError(tooBig ? t.chat.attachTooBig : incoming.length > room_ ? t.chat.attachFull.replace("{max}", String(ATTACHMENTS_PER_MESSAGE)) : null);
    setPicks((current) => [...current, ...accepted]);
  };

  const openAttachment = async (file: ChatFile) => {
    try {
      const bytes = await room.fetchAttachment(file);
      if (!bytes) throw new Error("no se pudo descifrar");
      attachmentViewer.open({ uri: writeTempFile(bytes, file.name), mime: file.mime, name: file.name });
    } catch {
      toast({ text: t.chat.attachOpenFailed, tone: "error" });
    }
  };

  if (room.status === "needs-activation") {
    return (
      <SafeAreaView style={styles.screen}>
        <BackButton />
        <View style={styles.center}>
          <Text style={text.title}>{t.chat.activateTitle}</Text>
          <Body>{t.chat.activateBody}</Body>
          <Button label={t.chat.activateButton} icon="lock" onPress={room.activate} />
        </View>
      </SafeAreaView>
    );
  }

  if (room.status !== "ready") {
    return (
      <SafeAreaView style={styles.screen}>
        <BackButton />
        <View style={styles.center}>
          {room.status === "loading" ? <Body>{t.chat.activating}</Body> : null}
          {room.status === "key-denied" ? <ErrorText>{t.chat.keyDenied}</ErrorText> : null}
          {room.status === "no-counterpart-key" ? <ErrorText>{t.chat.noCounterpartKey}</ErrorText> : null}
          {room.status === "error" ? <ErrorText>{t.chat.error}</ErrorText> : null}
          {room.status !== "loading" ? <Button label={room.status === "key-denied" ? t.chat.activate : t.common.retry} icon={room.status === "key-denied" ? "lock" : "refresh"} onPress={room.reload} /> : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.screen} behavior="padding">
        <BackButton />
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={text.subtitle} numberOfLines={1}>
              {title ?? ""}
            </Text>
            <Secondary>{t.chat.privacy}</Secondary>
          </View>
          {room.access.specHash ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.chat.viewJob}
              hitSlop={10}
              onPress={() => router.push({ pathname: "/changa/[specHash]", params: { specHash: room.access.specHash } })}
              style={styles.iconButton}
            >
              <Icon name="briefcase" size={22} color={colors.ink} />
            </Pressable>
          ) : null}
          <PersonMenu role={room.access.role} applicationId={Number(id)} changaId={room.access.changaId} counterpart={String(counterpart)} active={room.writable} onDone={() => router.back()} />
        </View>
        <FlatList
          ref={list}
          contentContainerStyle={styles.messages}
          data={room.view}
          keyExtractor={(item) => item.key}
          ListHeaderComponent={
            <View style={{ gap: spacing.sm }}>
              <ProtectedCard />
              <View style={styles.applicationCard}>
                <Text style={text.label}>{room.access.role === "applicant" ? t.chat.applicationCardMine : t.chat.applicationCardTheirs}</Text>
                <Text style={text.body}>{room.access.applicationMessage || t.chat.applicationCardEmpty}</Text>
              </View>
            </View>
          }
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.mine ? styles.mine : styles.theirs]}>
              {item.text === null ? <Text style={[text.body, item.mine && styles.mineText]}>{t.chat.unreadable}</Text> : null}
              {item.text ? <Text style={[text.body, item.mine && styles.mineText]}>{item.text}</Text> : null}
              {item.files.map((file: ChatFile, index: number) => (
                <Pressable
                  key={`${file.hash}-${index}`}
                  accessibilityRole="button"
                  disabled={!file.hash}
                  onPress={() => void openAttachment(file)}
                  style={[styles.fileRow, item.mine ? styles.fileMine : styles.fileTheirs]}
                >
                  <Icon name={file.mime.startsWith("image/") ? "image" : "file"} size={20} color={item.mine ? colors.white : colors.brick} />
                  <View style={{ flex: 1 }}>
                    <Text style={[text.secondary, { color: colors.ink }, item.mine && styles.mineText]} numberOfLines={1}>
                      {file.name}
                    </Text>
                    {file.size > 0 ? <Text style={[text.label, item.mine && styles.mineText]}>{formatSize(file.size)}</Text> : null}
                  </View>
                </Pressable>
              ))}
              {item.status === "sending" ? <Text style={[text.label, item.mine && styles.mineText]}>{item.files.length > 0 ? t.chat.attachSending : t.chat.sending}</Text> : null}
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
        {attachmentViewer.viewer}
        <ChoiceSheet
          visible={sheet}
          onClose={() => setSheet(false)}
          choices={[
            { key: "camera", label: t.chat.attachPhoto, icon: "camera", onPress: () => void takePhoto().then(addPicks) },
            { key: "gallery", label: t.chat.attachGallery, icon: "image", onPress: () => void pickPhotos(ATTACHMENTS_PER_MESSAGE - picks.length).then(addPicks) },
            { key: "file", label: t.chat.attachPdf, icon: "file", onPress: () => void pickDocuments().then(addPicks) },
          ]}
        />
        {room.writable && room.access.waitingForOwner ? (
          <View style={styles.notice}>
            <Secondary>{t.chat.waitingForOwner}</Secondary>
          </View>
        ) : room.writable ? (
          <View>
            {blocked ? (
              <View style={styles.blocked}>
                <Text style={styles.blockedTitle}>{t.chat.contactBlockedTitle}</Text>
                <Secondary>{`${t.chat.contactBlocked[blocked]} ${t.chat.contactBlockedBody}`}</Secondary>
              </View>
            ) : null}
            {!room.access.contactsAllowed && !blocked ? <Secondary style={styles.hint}>{t.chat.contactHint}</Secondary> : null}
            {room.access.role === "owner" && room.view.length === 0 ? <Secondary style={styles.hint}>{t.chat.ownerFirstHint}</Secondary> : null}
            {attachError ? <ErrorText>{attachError}</ErrorText> : null}
            {picks.length > 0 ? (
              <View style={styles.tray}>
                {picks.map((pick, index) => (
                  <View key={`${pick.uri}-${index}`} style={styles.chip}>
                    <Icon name={pick.mime.startsWith("image/") ? "image" : "file"} size={16} color={colors.brick} />
                    <Text style={styles.chipText} numberOfLines={1}>
                      {pick.name}
                    </Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={t.common.close} hitSlop={8} onPress={() => setPicks((current) => current.filter((_, i) => i !== index))}>
                      <Icon name="close" size={16} color={colors.muted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.composer}>
              <Pressable accessibilityRole="button" accessibilityLabel={t.chat.attach} onPress={() => setSheet(true)} style={styles.roundButton}>
                <Icon name="paperclip" size={22} color={colors.brick} />
              </Pressable>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={(value) => {
                  setDraft(value);
                  if (blocked) setBlocked(null);
                }}
                placeholder={t.chat.placeholder}
                placeholderTextColor={colors.muted}
                multiline
                maxLength={2000}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t.chat.sendLabel}
                disabled={!canSubmit}
                onPress={submit}
                style={[styles.sendButton, !canSubmit && styles.sendDisabled]}
              >
                <Icon name="send" size={20} color={colors.white} />
              </Pressable>
            </View>
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
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  headerText: { flex: 1, gap: spacing.xs },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  messages: { padding: spacing.md, gap: spacing.sm },
  protectedHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  protectedTitle: { flex: 1, ...text.secondary, fontFamily: fonts.semibold, color: colors.success },
  protectedToggle: { ...text.label },
  protectedBody: { ...text.secondary, color: colors.ink },
  applicationCard: { backgroundColor: colors.sand, borderRadius: radius.md, padding: spacing.sm + 4, gap: 2, marginBottom: spacing.sm },
  bubble: { maxWidth: "80%", borderRadius: radius.md, padding: spacing.sm + 2, gap: spacing.xs },
  mine: { alignSelf: "flex-end", backgroundColor: colors.brick },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  mineText: { color: colors.white },
  fileRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.sm, paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.sm },
  fileMine: { backgroundColor: colors.glassSoft },
  fileTheirs: { backgroundColor: colors.background },
  failedRow: { flexDirection: "row", gap: spacing.sm },
  link: { textDecorationLine: "underline" },
  notice: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.line },
  hint: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  blocked: { marginHorizontal: spacing.md, marginTop: spacing.sm, padding: spacing.sm + 4, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, backgroundColor: colors.white, gap: 2 },
  blockedTitle: { ...text.body, color: colors.error, fontFamily: fonts.semibold },
  tray: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: spacing.xs, maxWidth: 200, backgroundColor: colors.white, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, paddingVertical: 4, paddingHorizontal: spacing.sm },
  chipText: { flexShrink: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.ink },
  composer: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, alignItems: "flex-end", borderTopWidth: 1, borderTopColor: colors.line },
  roundButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.brick },
  sendDisabled: { opacity: 0.4 },
  input: { ...text.body, flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxHeight: 120 },
});
