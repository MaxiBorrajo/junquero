import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Changa } from "../api/types";
import { API_URL } from "../config";
import { t } from "../i18n";
import { formatDate, formatDuration } from "../lib/format";
import { formatUsdc } from "../lib/money";
import { colors, radius, spacing, text } from "../theme";
import { Icon } from "./Icon";
import { useAttachmentViewer } from "./useAttachmentViewer";
import { Body, Secondary } from "./ui";

const fileUrl = (owner: string, hash: string): string => `${API_URL}/files/${owner}/${hash.replace(/^0x/, "")}`;

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={text.label}>{label}</Text>
      {children}
    </View>
  );
}

// Los datos de la changa tal como se publicaron. Es el mismo bloque para quien mira el aviso y para quien ya trabaja en él;
// en la pantalla del trabajo (`inOrder`) se omiten las partes que esa pantalla ya muestra por su cuenta (zona, hitos, pruebas).
export function ChangaInfo({ changa, inOrder = false }: { changa: Changa; inOrder?: boolean }) {
  const { spec } = changa;
  const attachmentViewer = useAttachmentViewer();
  return (
    <>
      {spec.description ? <Body>{spec.description}</Body> : null}
      {!inOrder ? (
        <Section label={t.detail.where}>
          <Body>{spec.modality === "remote" ? t.detail.remoteWhere : ["open", "draft", "funding"].includes(changa.status) ? t.detail.approxZone : t.detail.approxZoneAgreed}</Body>
        </Section>
      ) : null}
      {spec.modality === "onsite" && spec.startsAt ? (
        <Section label={t.detail.when}>
          <Body>{formatDate(spec.startsAt)}</Body>
        </Section>
      ) : null}
      {spec.modality === "remote" && spec.deadline ? (
        <Section label={t.detail.deadline}>
          <Body>{formatDate(spec.deadline)}</Body>
        </Section>
      ) : null}
      {spec.durationMin ? (
        <Section label={t.detail.duration}>
          <Body>{formatDuration(spec.durationMin)}</Body>
        </Section>
      ) : null}
      {!inOrder && spec.milestones && spec.milestones.length > 0 ? (
        <Section label={t.milestonesBoard.title}>
          {spec.materials ? <Secondary>{t.publish.materials[spec.materials]}</Secondary> : null}
          {spec.milestones.map((item, index) => (
            <View key={index} style={{ gap: 2, marginBottom: 8 }}>
              <Body>{`${index + 1}. ${item.name} · ${formatUsdc(item.amount)}`}</Body>
              <Secondary>{item.criteria}</Secondary>
              <Secondary>{item.evidence}</Secondary>
            </View>
          ))}
        </Section>
      ) : null}
      {!inOrder && spec.evidence.length > 0 ? (
        <Section label={t.detail.evidence}>
          {spec.evidence.map((item) => (
            <Body key={item}>{`• ${item}`}</Body>
          ))}
        </Section>
      ) : null}
      {spec.attachments.length > 0 ? (
        <Section label={t.detail.attachments}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
            {spec.attachments.map((file) => {
              const uri = fileUrl(changa.owner, file.hash);
              return (
                <Pressable key={file.hash} accessibilityRole="button" onPress={() => attachmentViewer.open({ uri, mime: file.mime, name: file.name })} style={file.mime.startsWith("image/") ? undefined : [styles.thumb, styles.fileTile]}>
                  {file.mime.startsWith("image/") ? (
                    <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
                  ) : (
                    <>
                      <Icon name={file.mime.startsWith("video/") ? "play" : "file"} size={28} color={colors.brick} />
                      <Text style={[text.secondary, styles.fileName]} numberOfLines={2}>
                        {file.name}
                      </Text>
                    </>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </Section>
      ) : null}
      {attachmentViewer.viewer}
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  gallery: { gap: spacing.sm },
  fileTile: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", gap: spacing.xs, padding: spacing.sm },
  fileName: { textAlign: "center", color: colors.brick, fontSize: 12 },
  thumb: { width: 120, height: 120, borderRadius: radius.md },
});
