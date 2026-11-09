import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Body, Button, ErrorText, Screen, Secondary, Title } from "../../components/ui";
import { API_URL } from "../../config";
import { useChangaBySpec } from "../../data/useChangas";
import { t } from "../../i18n";
import { applyBlock, type ApplyBlock } from "../../lib/apply";
import { formatDate, formatDuration } from "../../lib/format";
import { formatUsdc } from "../../lib/money";
import { useSession } from "../../session/SessionProvider";
import { colors, radius, spacing, text } from "../../theme";

const BLOCK_TEXT: Record<ApplyBlock, string | null> = {
  anonymous: t.detail.needAccount,
  "no-profile": t.detail.needAccount,
  selfie: t.detail.needSelfie,
  own: t.detail.ownChanga,
  closed: t.detail.notOpen,
};

export default function ChangaDetail() {
  const { specHash } = useLocalSearchParams<{ specHash: string }>();
  const { address, profile } = useSession();
  const query = useChangaBySpec(String(specHash));

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
  const block = applyBlock(changa, { address, hasProfile: Boolean(profile), selfieStatus: profile?.selfieStatus ?? null });
  const isOwner = block === "own";
  const isGroup = Boolean(spec.group);
  const groupButton =
    isGroup && changa.orderId !== null && (changa.status === "funding" || changa.status === "open") ? (
      <Button label={changa.status === "funding" ? t.publish.goToGroup : t.group.title} variant="secondary" onPress={() => router.push({ pathname: "/group/[orderId]", params: { orderId: String(changa.orderId), title: spec.title } })} />
    ) : null;
  const action = changa.status === "funding" ? groupButton :
    isOwner && changa.status === "open" ? (
      <Button label={t.mine.viewApplications} onPress={() => router.push({ pathname: "/applications/[changaId]", params: { changaId: String(changa.id) } })} />
    ) : block === null ? (
      <Button label={t.detail.apply} onPress={() => router.push({ pathname: "/apply/[changaId]", params: { changaId: String(changa.id), max: changa.amount ?? "", plan: spec.milestones ? "1" : "0", spec: changa.specHash } })} />
    ) : block === "anonymous" || block === "no-profile" ? (
      <Button label={t.welcome.needHand} onPress={() => router.push("/welcome")} />
    ) : null;

  return (
    <Screen footer={action}>
      <Title>{spec.title}</Title>
      <View style={styles.amountBox}>
        <Text style={text.label}>{t.detail.inEscrow}</Text>
        <Text style={text.amount}>{formatUsdc(changa.amount)}</Text>
      </View>
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
          <View style={styles.gallery}>
            {spec.attachments
              .filter((file) => file.mime.startsWith("image/"))
              .map((file) => (
                <Image key={file.hash} source={{ uri: `${API_URL}/files/${changa.owner}/${file.hash.replace(/^0x/, "")}` }} style={styles.thumb} contentFit="cover" />
              ))}
          </View>
          {spec.attachments
            .filter((file) => !file.mime.startsWith("image/"))
            .map((file) => (
              <Secondary key={file.hash}>{file.name}</Secondary>
            ))}
        </Section>
      ) : null}
      {groupButton && changa.status === "open" ? groupButton : null}
      {block !== "anonymous" && block !== "own" ? <Button label={t.report.changa} variant="ghost" onPress={() => router.push({ pathname: "/report/[kind]", params: { kind: "changa", target: String(changa.id) } })} /> : null}
      {block && BLOCK_TEXT[block] ? <Secondary>{BLOCK_TEXT[block]}</Secondary> : null}
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
  amountBox: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs, borderWidth: 1, borderColor: colors.line },
  section: { gap: spacing.xs },
  gallery: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  thumb: { width: 96, height: 96, borderRadius: radius.sm },
});
