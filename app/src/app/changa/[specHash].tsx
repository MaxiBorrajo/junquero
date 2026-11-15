import { Image } from "expo-image";
import { Card } from "../../components/Card";
import { router, useLocalSearchParams } from "expo-router";
import { DetailActions } from "../../components/DetailActions";
import { OwnerTag } from "../../components/OwnerTag";
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Icon } from "../../components/Icon";
import { useAttachmentViewer } from "../../components/useAttachmentViewer";
import { Body, Button, ErrorText, Screen, Secondary, Title } from "../../components/ui";
import { API_URL } from "../../config";
import { useChangaBySpec } from "../../data/useChangas";
import { t } from "../../i18n";
import { useMyApplications } from "../../data/useMine";
import { applyBlock, type ApplyBlock } from "../../lib/apply";
import { formatDate, formatDuration } from "../../lib/format";
import { formatUsdc } from "../../lib/money";
import { effectiveStatus, useCancelling } from "../../data/cancelling";
import { useSession } from "../../session/SessionProvider";
import { colors, radius, spacing, text } from "../../theme";

const fileUrl = (owner: string, hash: string): string => `${API_URL}/files/${owner}/${hash.replace(/^0x/, "")}`;

const BLOCK_TEXT: Record<ApplyBlock, string | null> = {
  anonymous: t.detail.needAccount,
  "no-profile": t.detail.needAccount,
  selfie: t.detail.needSelfie,
  own: t.detail.ownChanga,
  closed: t.detail.notOpen,
  applied: t.detail.alreadyApplied,
};

export default function ChangaDetail() {
  const { specHash } = useLocalSearchParams<{ specHash: string }>();
  const { address, profile, api } = useSession();
  const cancelling = useCancelling();
  const mine = useMyApplications();
  const query = useChangaBySpec(String(specHash));
  const attachmentViewer = useAttachmentViewer();

  if (query.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.brick} />
      </Screen>
    );
  }
  const changa = query.data;
  if (!changa) {
    return (
      <Screen>
        <ErrorText>{t.detail.notFound}</ErrorText>
      </Screen>
    );
  }

  const { spec } = changa;
  const applied = (mine.data ?? []).some((item) => item.changa.specHash === changa.specHash && (item.status === "active" || item.status === "chosen"));
  const block = applyBlock(changa, { address, hasProfile: Boolean(profile), selfieStatus: profile?.selfieStatus ?? null, applied });
  const isOwner = block === "own";
  const isCancelling = effectiveStatus(changa, cancelling) === "cancelling";
  const isGroup = Boolean(spec.group);
  const groupButton =
    !isCancelling && isGroup && changa.orderId !== null && (changa.status === "funding" || changa.status === "open") ? (
      <Button label={changa.status === "funding" ? t.publish.goToGroup : t.group.title} icon="users" onPress={() => router.push({ pathname: "/group/[orderId]", params: { orderId: String(changa.orderId), title: spec.title } })} />
    ) : null;
  const action = isCancelling ? null : changa.status === "funding" ? groupButton :
    isOwner && changa.status === "open" ? (
      <Button label={t.mine.viewApplications} icon="users" onPress={() => router.push({ pathname: "/applications/[changaId]", params: { changaId: String(changa.id) } })} />
    ) : block === null ? (
      <Button label={t.detail.apply} icon="send" onPress={() => router.push({ pathname: "/apply/[changaId]", params: { changaId: String(changa.id), max: changa.amount ?? "", plan: spec.milestones ? "1" : "0", spec: changa.specHash } })} />
    ) : block === "anonymous" || block === "no-profile" ? (
      <Button label={t.mine.enter} icon="wallet" onPress={() => router.push("/welcome")} />
    ) : null;

  return (
    <Screen footer={action}>
      {isOwner ? <OwnerTag label={t.detail.ownChangaTag} /> : null}
      <Title>{spec.title}</Title>
      <Card gap="xs">
        <Text style={text.label}>{t.detail.inEscrow}</Text>
        <Text style={text.amount}>{formatUsdc(changa.amount)}</Text>
        <Secondary>{spec.milestones && spec.milestones.length > 0 ? t.detail.paymentMilestones : t.detail.paymentSingle}</Secondary>
      </Card>
      {spec.description ? <Body>{spec.description}</Body> : null}
      <Section label={t.detail.where}>
        <Body>{spec.modality === "remote" ? t.detail.remoteWhere : t.detail.approxZone}</Body>
      </Section>
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
      {spec.milestones && spec.milestones.length > 0 ? (
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
      {spec.evidence.length > 0 ? (
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
      {groupButton && changa.status === "open" ? groupButton : null}
      <DetailActions
        actions={[
          ...(isGroup && changa.orderId !== null && (changa.status === "funding" || changa.status === "open") && !isCancelling
            ? [{ key: "share", label: t.group.share, icon: "share" as const, onPress: () => void Share.share({ message: `${spec.title} · junquero://group/${changa.orderId}` }) }]
            : []),
          ...(block !== "anonymous" && block !== "own"
            ? [{ key: "report", label: t.report.changa, icon: "flag" as const, onPress: () => router.push({ pathname: "/report/[kind]", params: { kind: "changa", target: String(changa.id) } }) }]
            : []),
          ...(isOwner && !isCancelling && (changa.status === "open" || (isGroup && changa.status === "funding")) && changa.orderId !== null
            ? [{ key: "cancel", label: t.detail.cancelChanga, icon: "close" as const, danger: true, onPress: () => router.push({ pathname: "/cancel/[specHash]", params: { specHash: changa.specHash } }) }]
            : []),
        ]}
      />
      {isCancelling ? <Secondary>{t.detail.cancelling}</Secondary> : null}
      {block && block !== "own" && BLOCK_TEXT[block] ? <Secondary>{BLOCK_TEXT[block]}</Secondary> : null}
    </Screen>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={text.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  gallery: { gap: spacing.sm },
  fileTile: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", gap: spacing.xs, padding: spacing.sm },
  fileName: { textAlign: "center", color: colors.brick, fontSize: 12 },
  thumb: { width: 120, height: 120, borderRadius: radius.md },
});
