import { useQuery } from "@tanstack/react-query";
import { useFocusedInterval } from "../../lib/useFocusedInterval";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { ClosingSection } from "../../components/ClosingSection";
import { ReleaseCode } from "../../components/ReleaseCode";
import { releaseCode } from "../../chain/releaseCode";
import { deployment } from "../../chain/deployment";
import { approveRemotely, releaseCall, type RemoteRelease } from "../../chain/remoteRelease";
import { encodeCheckIn, encodeDeliver, encodeReleaseQr, releaseTypedData, sendViaRelay, RELEASE_VALIDITY_SECONDS } from "../../chain/orderActions";
import { readContributionOf, readForwarderNonce, readJurorFee, readParam, readTokenBalance, readTokenNonce } from "../../chain/reader";
import { PERMIT_VALIDITY_SECONDS, permitTypedData } from "../../chain/createOrder";
import { encodeObject } from "../../chain/group";
import { disputeCost, reasonHash } from "../../chain/jury";
import { payeeCurrent, payeeSteps, payerCurrent, payerSteps } from "../../lib/journey";
import { Banner } from "../../components/Banner";
import { StatusChip } from "../../components/StatusChip";
import { ExitReasons } from "../../components/ExitReasons";
import { OwnerTag } from "../../components/OwnerTag";
import { useGroup } from "../../data/useGroup";
import { PersonCard } from "../../components/PersonCard";
import { Journey, type JourneyStep } from "../../components/Journey";
import { Card } from "../../components/Card";
import { ChangaInfo } from "../../components/ChangaInfo";
import { ApproxZone } from "../../components/ApproxZone";
import { DetailActions } from "../../components/DetailActions";
import { Body, Button, ErrorText, Field, Screen, Secondary, Title } from "../../components/ui";
import { Stars } from "../../components/Stars";
import { MilestoneBoard } from "../../components/MilestoneBoard";
import { useChangaBySpec } from "../../data/useChangas";
import { useMyCases } from "../../data/useCases";
import { useClosing } from "../../data/useClosing";
import { useOrder } from "../../data/useOrder";
import { disputeOutcomeText } from "../../lib/disputeOutcome";
import { OrderStatus } from "../../chain/orderAbi";
import { ChangeRequest } from "../../evidence/ChangeRequest";
import { EvidenceThumbnails, EvidenceUploader, RequirementList, useCoveredRequirements, useEvidence } from "../../evidence/EvidenceSection";
import { evidenceBundleHash } from "../../evidence/crypto";
import { t } from "../../i18n";
import { canFinish, extendedRole, roleOf, viewFor } from "../../lib/actions";
import { formatDate } from "../../lib/format";
import { formatUsdc } from "../../lib/money";
import { useRunAction } from "../../lib/useRunAction";
import { useSession } from "../../session/SessionProvider";
import { signTyped } from "../../wallet/sign";
import { colors, radius, spacing, text } from "../../theme";

export default function OrderScreen() {
  const { orderId, title } = useLocalSearchParams<{ orderId: string; title?: string }>();
  const id = Number(orderId);
  const { api, address } = useSession();
  const order = useOrder(id);
  const evidence = useEvidence(id);
  const myCases = useMyCases();
  const changaForOrder = useChangaBySpec(order.data?.specHash ?? "0x");
  // Los avisos abren esta pantalla sin el título: si no llega, se toma el de la changa.
  const heading = title ?? changaForOrder.data?.spec.title ?? t.order.title;
  const requirements = changaForOrder.data?.spec.evidence ?? [];
  const covered = useCoveredRequirements(evidence.data ?? [], requirements.length);
  const myCase = (myCases.data?.asParty ?? []).find((item) => item.orderId === id);
  const { run: runAction, busy, error: failed } = useRunAction();
  const [rating, setRating] = useState(5);
  const [qr, setQr] = useState<{ text: string; expiry: number; code: string | null } | null>(null);

  const contribution = useQuery({
    queryKey: ["contribution", id, address],
    enabled: Boolean(order.data?.isGroup && address),
    queryFn: () => readContributionOf(id, address as `0x${string}`),
  });
  const groupInfo = useGroup(id, Boolean(order.data?.isGroup));
  const [objection, setObjection] = useState("");
  const maxChanges = useQuery({ queryKey: ["param", "REQUEST_CHANGES_MAX"], staleTime: 5 * 60_000, queryFn: () => readParam("REQUEST_CHANGES_MAX") });
  const remote = useQuery({
    queryKey: ["release", id, address],
    enabled: Boolean(address && order.data && !order.data.hasMilestones && order.data.status === 4),
    refetchInterval: useFocusedInterval(30_000),
    queryFn: async () => (await api.get<{ release: RemoteRelease | null }>(`/me/orders/${id}/release`)).release,
  });

  // Cómo se cerró el trabajo (resultado de un reclamo, comprobante): va antes de los `return` para no cambiar la cantidad de hooks.
  const closing = useClosing(id, order.data?.status === OrderStatus.Settled);

  if (order.isLoading || !order.data || !address) {
    return (
      <Screen>
        <Title>{heading}</Title>
        {order.isError ? <ErrorText>{t.order.loadError}</ErrorText> : <Secondary>{t.common.loading}</Secondary>}
      </Screen>
    );
  }

  const state = order.data;
  const role = roleOf(state, address);
  const view = viewFor(state.status, role);
  // Si quien trabajaba dejó el trabajo, el contrato lo reabre sin precio ni prestador: se muestra lo que quedó en garantía.
  if (state.status === OrderStatus.Open) {
    const isOwner = state.payer.toLowerCase() === address.toLowerCase();
    return (
      <Screen
        footer={
          isOwner && changaForOrder.data ? (
            <Button label={t.order.reopenedSeeApplications} icon="users" onPress={() => router.push({ pathname: "/applications/[changaId]", params: { changaId: String(changaForOrder.data!.id) } })} />
          ) : changaForOrder.data ? (
            <Button label={t.order.reopenedSeeChanga} icon="briefcase" onPress={() => router.push({ pathname: "/changa/[specHash]", params: { specHash: changaForOrder.data!.specHash } })} />
          ) : null
        }
      >
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Title>{heading}</Title>
          </View>
          <StatusChip label={t.order.reopenedChip} warn />
        </View>
        <Card gap="xs">
          <Text style={text.label}>{t.order.reopenedAmount}</Text>
          <Text style={text.amount}>{formatUsdc(state.deposited.toString())}</Text>
        </Card>
        <Body>{isOwner ? t.order.reopenedOwner : t.order.reopenedOther}</Body>
        <ExitReasons orderId={id} />
      </Screen>
    );
  }
  const items = evidence.data ?? [];
  const counterpart = role === "payer" ? state.payee : state.payer;
  const contributor = extendedRole(role, state.isGroup, contribution.data ?? 0n) === "contributor";
  const account = address as `0x${string}`;
  const relayDeps = { api, deployment, account, now: () => Math.floor(Date.now() / 1000), readForwarderNonce: () => readForwarderNonce(account), signTypedData: signTyped };

  // Pedir cambios: solo en changas a distancia con pago en garantía, hasta el máximo que fija el contrato.
  const changesLeft = Math.max(0, Number(maxChanges.data ?? 0n) - state.changeRequests);
  const canAskChanges = state.modality !== 0 && !state.cash && changesLeft > 0;

  const refresh = [["order", id]] as const;
  const run = (action: () => Promise<string | void>, failure: string, success: string, icon: string) =>
    runAction(action, { success, successIcon: icon, failure, invalidate: refresh });

  const finish = () =>
    run(async () => {
      const hash = evidenceBundleHash(items.filter((item) => item.uploader.toLowerCase() === address.toLowerCase()).map((item) => item.hash));
      return sendViaRelay(relayDeps, encodeDeliver(BigInt(id), hash));
    }, t.order.finishFailed, t.order.deliveredDone, "check");

  const object = () =>
    run(async () => {
      const text = objection.trim();
      if (text.length < 10) throw new Error("reason");
      const account = address as `0x${string}`;
      const [fee, jurors] = await Promise.all([readJurorFee(), readParam(state.sizeClass === 1 ? "JURY_SIZE_MEDIUM" : "JURY_SIZE_LARGE")]);
      const cost = disputeCost(state.sizeClass, fee, Number(jurors));
      let auth = { method: 0, nonce: 0n, deadline: 0n, signature: "0x" as `0x${string}` };
      if (cost > 0n) {
        if ((await readTokenBalance(account)) < cost) throw new Error("balance");
        const deadline = BigInt(Math.floor(Date.now() / 1000) + PERMIT_VALIDITY_SECONDS);
        auth = { method: 0, nonce: 0n, deadline, signature: await signTyped(permitTypedData(deployment, account, cost, await readTokenNonce(account), deadline)) };
      }
      const hash = await sendViaRelay(relayDeps, encodeObject(BigInt(id), reasonHash(text), auth));
      setObjection("");
      return hash;
    }, t.group.objectionFailed, t.group.objectionDone, "flag");

  const approve = () =>
    run(async () => {
      await approveRemotely({ api, deployment, orderId: id, payee: state.payee, index: null, amount: state.price, rating, evidenceHash: state.evidenceHash, now: Math.floor(Date.now() / 1000), sign: signTyped });
    }, t.order.releaseFailed, t.order.approved, "check");

  const claim = () =>
    run(async () => {
      if (!remote.data) return;
      return sendViaRelay(relayDeps, releaseCall(id, remote.data));
    }, t.order.releaseFailed, t.order.claimedDone, "wallet");

  const arrive = () => run(() => sendViaRelay(relayDeps, encodeCheckIn(BigInt(id))), t.order.finishFailed, t.order.arrivedDone, "pin");

  const showCode = () =>
    run(async () => {
      const expiry = Math.floor(Date.now() / 1000) + RELEASE_VALIDITY_SECONDS;
      const data = { orderId: BigInt(id), payee: state.payee, amount: state.price, rating, evidenceHash: state.evidenceHash, expiry };
      const signature = await signTyped(releaseTypedData(deployment, data));
      // Se guarda la liberación firmada en el servidor: así quien cobra puede escribir el código corto si la cámara no anda.
      const code = await api
        .send("POST", `/me/orders/${id}/release`, { amount: data.amount.toString(), rating, evidenceHash: data.evidenceHash, expiry, signature })
        .then(() => releaseCode(signature))
        .catch(() => null);
      setQr({ text: encodeReleaseQr(data, signature), expiry, code });
    }, t.order.releaseFailed, t.order.codeReady, "scan");

  const j = t.journey;
  const labelOf = { arrive: j.payee.arrive, work: j.payee.work, finish: j.payee.finish, review: j.payee.review } as const;
  const payeeList: JourneyStep[] = payeeSteps(state.modality === 0).map((key) => ({ key, ...labelOf[key] }));
  const payerList: JourneyStep[] = payerSteps().map((key) => ({ key, ...j.payer[key] }));
  const settled = view === "settled";
  // Tras un pedido de cambios no se puede volver a terminar hasta subir algo nuevo: debe haber una prueba de quien trabaja posterior a lo último que subió quien publicó.
  const lastAsk = state.changeRequests > 0 ? Math.max(0, ...items.filter((item) => item.uploader.toLowerCase() === state.payer.toLowerCase()).map((item) => item.createdAt)) : 0;
  const hasNewWork = state.changeRequests === 0 || items.some((item) => item.uploader.toLowerCase() === state.payee.toLowerCase() && item.createdAt > lastAsk);
  const ready = (requirements.length > 0 ? covered.size >= requirements.length : items.length > 0) && hasNewWork;
  const arrivedOrRemote = state.modality !== 0 || state.checkedInAt > 0;
  const chip: { label: string; warn?: boolean } | null =
    view === "worker-working" || view === "payer-waiting-work" ? { label: t.order.statusAgreed }
    : view === "worker-waiting-review" || view === "payer-reviewing" ? { label: t.order.statusDelivered }
    : settled ? { label: t.mine.status.settled }
    : view === "disputed" ? { label: t.order.statusDisputed, warn: true }
    : view === "cancelled" ? { label: t.order.statusCancelled, warn: true }
    : null;
  let journey: { steps: JourneyStep[]; current: number } | null = null;
  if (!state.hasMilestones && !contributor) {
    if (role === "payee" && (view === "worker-working" || view === "worker-waiting-review" || settled)) {
      journey = { steps: payeeList, current: payeeCurrent({ view, presencial: state.modality === 0, arrived: arrivedOrRemote, ready }) };
    } else if (role === "payer" && (view === "payer-waiting-work" || view === "payer-reviewing" || settled)) {
      journey = { steps: payerList, current: payerCurrent(view) };
    }
  }

  return (
    <Screen
      footer={
        state.hasMilestones ? null : view === "worker-working" ? (
          !arrivedOrRemote ? <Button label={t.order.arrived} icon="pin" onPress={arrive} loading={busy} /> : arrivedOrRemote && ready ? <Button label={t.order.finish} icon="check" onPress={finish} loading={busy} disabled={!canFinish(items.length, state.hasMilestones, state.isGroup)} /> : null
        ) : view === "worker-waiting-review" ? (
          <Button label={t.order.scanQr} icon="scan" onPress={() => router.push({ pathname: "/scan/[orderId]", params: { orderId: String(id) } })} />
        ) : view === "payer-reviewing" ? (
          qr ? null : <Button label={t.order.showQr} icon="scan" onPress={showCode} loading={busy} />
        ) : null
      }
    >
      {role === "payer" || role === "payee" ? <OwnerTag label={role === "payer" ? t.order.role.payer : t.order.role.payee} /> : null}
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Title>{heading}</Title>
        </View>
        {chip ? <StatusChip label={chip.label} warn={chip.warn} /> : null}
      </View>
      <Card gap="xs">
        <Text style={text.label}>{t.order.amount}</Text>
        <Text style={text.amount}>{formatUsdc(state.price.toString())}</Text>
      </Card>
      {changaForOrder.data?.spec.modality === "onsite" && (role === "payer" || role === "payee") ? (
        changaForOrder.data.spec.area ? <ApproxZone zone={changaForOrder.data.spec.area} /> : <Secondary>{t.order.approxAddress}</Secondary>
      ) : null}

      {role === "payer" || role === "payee" ? (
        <PersonCard
          address={counterpart}
          label={role === "payer" ? t.order.whoWorks : t.order.whoChose}
          note={role === "payee" ? t.order.youWereChosen : undefined}
        />
      ) : contributor && state.payee ? (
        <PersonCard address={state.payee} label={t.order.whoWorks} />
      ) : null}

      {view === "cancelled" ? <ExitReasons orderId={id} /> : null}

      {changaForOrder.data && (role === "payer" || role === "payee") ? <ChangaInfo changa={changaForOrder.data} inOrder /> : null}

      {journey ? <Journey title={role === "payer" ? t.journey.payerTitle : t.journey.payeeTitle} steps={journey.steps} current={journey.current} /> : null}

      {settled && (role === "payer" || role === "payee") ? <ClosingSection orderId={id} role={role} items={items} /> : null}

      {state.hasMilestones && view !== "settled" && view !== "cancelled" ? (
        <MilestoneBoard orderId={id} role={role} counterpart={counterpart} changa={changaForOrder.data ?? null} payee={state.payee} deadline={state.deadline} disputed={view === "disputed"} />
      ) : null}

      {role === "payer" && view === "payer-waiting-work" && !state.hasMilestones && !state.isGroup && changaForOrder.data ? (
        <DetailActions actions={[{ key: "cancel", label: t.detail.cancelChanga, icon: "close", danger: true, onPress: () => router.push({ pathname: "/cancel/[specHash]", params: { specHash: changaForOrder.data!.specHash } }) }]} />
      ) : null}

      {!state.hasMilestones && view === "worker-working" ? (
        <>
          {role === "payee" && state.changeRequests > 0 ? <ChangeRequest orderId={id} items={items} payer={state.payer} /> : null}
          {arrivedOrRemote && requirements.length > 0 ? (
            <>
              <Text style={text.subtitle}>{t.order.requirementsTitle}</Text>
              <Secondary>{t.order.requirementsHint}</Secondary>
              <RequirementList orderId={id} counterpart={counterpart} requirements={requirements} covered={covered} />
            </>
          ) : null}
          {arrivedOrRemote && requirements.length === 0 ? (
            <>
              <Text style={text.subtitle}>{t.order.evidenceTitle}</Text>
              <Secondary>{t.order.evidenceHint}</Secondary>
              <EvidenceUploader orderId={id} counterpart={counterpart} />
            </>
          ) : null}
          {role === "payee" && changaForOrder.data ? (
            <DetailActions actions={[{ key: "cancel", label: t.cancelScreen.workerCancel, icon: "close", danger: true, hint: t.cancelScreen.workerCancelNote, onPress: () => router.push({ pathname: "/cancel/[specHash]", params: { specHash: changaForOrder.data!.specHash } }) }]} />
          ) : null}
        </>
      ) : null}

      {!state.hasMilestones && view === "worker-waiting-review" ? (
        <>
          <Secondary>{t.order.autoRelease}</Secondary>
          {remote.data ? (
            <>
              <Body>{t.order.readyToClaim}</Body>
              <Button label={t.order.claim} icon="wallet" onPress={claim} loading={busy} />
            </>
          ) : null}
        </>
      ) : null}


      {!state.hasMilestones && view === "payer-reviewing" ? (
        <>
          <Body>{t.order.reviewTitle}</Body>
          <EvidenceThumbnails orderId={id} items={items} />
          <Secondary>{`${t.order.autoRelease}`}</Secondary>
          {qr ? (
            <View style={styles.qr}>
              <Text style={text.subtitle}>{t.order.qrTitle}</Text>
              <QRCode value={qr.text} size={240} backgroundColor={colors.white} />
              <Secondary>{`${t.agreement.expires}: ${formatDate(qr.expiry)}`}</Secondary>
              {qr.code ? <ReleaseCode code={qr.code} /> : null}
              <Button label={t.common.retry} icon="refresh" variant="ghost" onPress={() => setQr(null)} />
            </View>
          ) : (
            <>
              <Stars value={rating} onChange={setRating} />
              <DetailActions
                actions={[
                  { key: "approve", label: t.order.approveRemote, icon: "check", hint: t.order.approveRemoteNote, onPress: () => void approve() },
                  ...(canAskChanges ? [{ key: "changes", label: t.order.requestChanges, icon: "refresh" as const, hint: t.order.requestChangesLeft.replace("{n}", String(changesLeft)), onPress: () => router.push({ pathname: "/changes/[orderId]", params: { orderId: String(id) } }) }] : []),
                  { key: "problem", label: t.order.problem, icon: "flag", danger: true, onPress: () => router.push({ pathname: "/dispute/[orderId]", params: { orderId: String(id) } }) },
                ]}
              />
            </>
          )}
        </>
      ) : null}

      {contributor && state.status === 4 ? (
        <>
          <Body>{t.group.reviewTitle}</Body>
          <EvidenceThumbnails orderId={id} items={items} />
          {groupInfo.data ? (
            <Secondary>{`${t.group.objectionProgress}: ${groupInfo.data.target > 0n ? Number((groupInfo.data.objectionMoney * 10000n) / groupInfo.data.target) / 100 : 0}% ${t.group.objectionMoney} · ${groupInfo.data.objectionCount} ${t.group.objectionPeople}`}</Secondary>
          ) : null}
          <Secondary>{t.group.thanks}</Secondary>
          <Text style={text.subtitle}>{t.group.objection}</Text>
          <Secondary>{t.group.objectionNote}</Secondary>
          <Field label={t.group.objectionReason} value={objection} onChangeText={setObjection} multiline maxLength={1500} />
          <Button label={t.group.objection} icon="flag" variant="outline" onPress={object} loading={busy} disabled={objection.trim().length < 10} />
        </>
      ) : null}
      {view === "disputed" ? (
        <>
          {myCase ? <Button label={t.order.openCase} icon="scale" onPress={() => router.push({ pathname: "/case/[caseId]", params: { caseId: String(myCase.caseId) } })} /> : null}
        </>
      ) : null}
      {settled ? (
        closing.data?.dispute && (role === "payer" || role === "payee") ? (
          <Banner tone={(closing.data.dispute.payeeShareBps <= 0) === (role === "payer") ? "success" : "warning"} icon="scale">{disputeOutcomeText(closing.data.dispute, role, t.order.disputeOutcome)}</Banner>
        ) : (
          <Banner tone="success" icon="check">{t.order.released}</Banner>
        )
      ) : null}
      {failed ? <ErrorText>{failed}</ErrorText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  qr: { alignItems: "center", gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md },
});
