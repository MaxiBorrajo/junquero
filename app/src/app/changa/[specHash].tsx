import { PersonCard } from "../../components/PersonCard";
import { Card } from "../../components/Card";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ChangaInfo } from "../../components/ChangaInfo";
import { DetailActions } from "../../components/DetailActions";
import { ExitReasons } from "../../components/ExitReasons";
import { OwnerTag } from "../../components/OwnerTag";
import { ActivityIndicator, Share, Text, View } from "react-native";
import { Body, Button, ErrorText, Screen, Secondary, Title } from "../../components/ui";
import { useChangaBySpec } from "../../data/useChangas";
import { t } from "../../i18n";
import { useMyApplications, useReceivedApplications } from "../../data/useMine";
import { applyBlock, type ApplyBlock } from "../../lib/apply";
import { formatUsdc } from "../../lib/money";
import { effectiveStatus, useCancelling } from "../../data/cancelling";
import { colors, text } from "../../theme";
import { useSession } from "../../session/SessionProvider";

const BLOCK_TEXT: Record<ApplyBlock, string | null> = {
  anonymous: t.detail.needAccount,
  "no-profile": t.detail.needAccount,
  selfie: t.detail.needSelfie,
  own: t.detail.ownChanga,
  closed: t.detail.notOpen,
  applied: t.detail.alreadyApplied,
  left: t.detail.youLeft,
};

export default function ChangaDetail() {
  const { specHash } = useLocalSearchParams<{ specHash: string }>();
  const { address, profile, api } = useSession();
  const cancelling = useCancelling();
  const mine = useMyApplications();
  const query = useChangaBySpec(String(specHash));
  const ownerView = Boolean(query.data) && query.data!.owner.toLowerCase() === (address ?? "").toLowerCase() && !["open", "draft", "funding"].includes(query.data!.status);
  const received = useReceivedApplications(query.data?.id ?? 0, ownerView);
  const iAmChosen = (mine.data ?? []).some((item) => item.changa.specHash === (query.data?.specHash ?? "") && item.status === "chosen");
  const chosen = (received.data ?? []).find((item) => item.status === "chosen") ?? null;

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
  // Quien ya trabaja en esta changa (o la publicó y ya tiene acuerdo) ve todo en una sola pantalla: la del trabajo.
  const inProgress = changa.orderId !== null && ["agreed", "delivered", "settled", "disputed"].includes(changa.status);
  const isPartyOfOrder = inProgress && (iAmChosen || changa.owner.toLowerCase() === (address ?? "").toLowerCase());
  if (isPartyOfOrder) return <Redirect href={{ pathname: "/order/[orderId]", params: { orderId: String(changa.orderId), title: spec.title } }} />;
  const applied = (mine.data ?? []).some((item) => item.changa.specHash === changa.specHash && (item.status === "active" || item.status === "chosen"));
  const myPlan = (mine.data ?? []).find((item) => item.changa.specHash === changa.specHash && (item.status === "active" || item.status === "chosen"))?.plan ?? null;
  const left = (mine.data ?? []).some((item) => item.changa.specHash === changa.specHash && item.status === "abandoned");
  const block = applyBlock(changa, { address, hasProfile: Boolean(profile), selfieStatus: profile?.selfieStatus ?? null, applied, left });
  const isOwner = block === "own";
  const isCancelling = effectiveStatus(changa, cancelling) === "cancelling";
  const isGroup = Boolean(spec.group);
  const groupButton =
    !isCancelling && isGroup && changa.orderId !== null && (changa.status === "funding" || changa.status === "open") ? (
      <Button label={changa.status === "funding" ? t.publish.goToGroup : t.group.title} icon="users" onPress={() => router.push({ pathname: "/group/[orderId]", params: { orderId: String(changa.orderId), title: spec.title } })} />
    ) : null;
  const hasOrder = changa.orderId !== null && ["agreed", "delivered", "settled", "disputed"].includes(changa.status);
  const action = isCancelling ? null : isOwner && hasOrder ? (
    <Button label={t.mine.openOrder} icon="briefcase" onPress={() => router.push({ pathname: "/order/[orderId]", params: { orderId: String(changa.orderId), title: spec.title } })} />
  ) : changa.status === "funding" ? groupButton :
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
      {spec.doneMilestones && spec.doneMilestones.length > 0 ? (
        <Card gap="xs">
          <Text style={text.label}>{t.exitReasons.doneTitle}</Text>
          {spec.doneMilestones.map((item, index) => (
            <Body key={`done-${index}`}>{`✓ ${item.name} · ${formatUsdc(item.amount)}`}</Body>
          ))}
          <Secondary>{t.exitReasons.doneNote}</Secondary>
          {spec.milestones && spec.milestones.length > 0 ? (
            <>
              <Text style={[text.label, { marginTop: 8 }]}>{t.exitReasons.leftTitle}</Text>
              {spec.milestones.map((item, index) => (
                <Body key={`left-${index}`}>{`${index + 1}. ${item.name} · ${formatUsdc(item.amount)}`}</Body>
              ))}
            </>
          ) : (
            <Secondary>{t.exitReasons.leftSingle}</Secondary>
          )}
        </Card>
      ) : null}
      {changa.orderId !== null && (isOwner || applied || left) ? <ExitReasons orderId={changa.orderId} /> : null}
      {isOwner && chosen ? <PersonCard address={chosen.applicant} label={t.detail.whoWorks} /> : null}
      {!isOwner ? <PersonCard address={changa.owner} label={t.detail.publishedBy} note={iAmChosen ? t.detail.chosenYou : undefined} /> : null}
      <ChangaInfo changa={changa} />
      {!isOwner && myPlan ? (
        <Card gap="xs">
          <Text style={text.label}>{t.planChange.yours}</Text>
          {myPlan.milestones.map((item, index) => (
            <View key={index} style={{ gap: 2, marginBottom: 8 }}>
              <Body>{`${index + 1}. ${item.name} · ${formatUsdc(item.amount)}`}</Body>
              <Secondary>{item.criteria}</Secondary>
              <Secondary>{item.evidence}</Secondary>
            </View>
          ))}
          <Secondary>{t.planChange.yoursTotal.replace("{total}", formatUsdc(myPlan.milestones.reduce((sum, item) => sum + BigInt(item.amount), 0n).toString()))}</Secondary>
        </Card>
      ) : null}
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
