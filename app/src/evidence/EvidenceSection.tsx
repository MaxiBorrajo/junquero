import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusedInterval } from "../lib/useFocusedInterval";
import * as Location from "expo-location";
import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fetchCounterpartKey } from "../crypto/keyManager";
import { useChatKey } from "../chat/ChatKeyProvider";
import { Card } from "../components/Card";
import { ChoiceSheet } from "../components/ChoiceSheet";
import { Icon } from "../components/Icon";
import { useActivity, type ActivityHandle } from "../components/Activity";
import { useToast } from "../components/Toast";
import { Button } from "../components/ui";
import type { EvidenceItem } from "../data/useOrder";
import { t } from "../i18n";
import { readBytes, sha256Hex } from "../lib/files";
import { writeTempFile } from "../lib/openDocument";
import { pickDocuments, pickMedia, takeMedia, type PickedFile } from "../lib/pick";
import { useSession } from "../session/SessionProvider";
import { isRejection, signText } from "../wallet/sign";
import { colors, radius, spacing, text } from "../theme";
import { AttachmentTile } from "../components/AttachmentTile";
import { useAttachmentViewer, type Viewable } from "../components/useAttachmentViewer";
import { decryptFile, decryptMeta, unwrapKey, type EvidenceMeta } from "./crypto";
import { MAX_BATCH_ITEMS, uploadEvidenceBatch, type EvidenceFile } from "./upload";
import { addStaged, clearStaged, flattenStaged, roomLeft, stagedCount, type Staged } from "./staging";

export function useEvidence(orderId: number) {
  const { api } = useSession();
  return useQuery({
    queryKey: ["evidence", orderId],
    refetchInterval: useFocusedInterval(30_000),
    queryFn: async () => (await api.get<{ role: string; evidence: EvidenceItem[] }>(`/me/orders/${orderId}/evidence`)).evidence,
  });
}

type UploadEntry = { file: PickedFile; requirement?: number };

// Las subidas van de a una y siguen aunque se cierre la pantalla: así no se pisan las firmas de la billetera y quien sube
// puede seguir cargando otras pruebas mientras tanto. El avance se cuenta con toasts, no con texto en la pantalla.
let uploadQueue: Promise<unknown> = Promise.resolve();

// Sube pruebas cifradas en segundo plano. Si se indica `requirement`, quedan asociadas a esa prueba pedida.
export function useEvidenceSend(orderId: number, counterpart: string) {
  const { api, address } = useSession();
  const { ensure } = useChatKey();
  const queryClient = useQueryClient();
  const toast = useToast();
  const track = useActivity();

  const place = async (): Promise<{ lat?: number; lng?: number }> => {
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) return {};
      const position = await Location.getLastKnownPositionAsync();
      return position ? { lat: position.coords.latitude, lng: position.coords.longitude } : {};
    } catch {
      return {};
    }
  };

  const upload = async (entries: UploadEntry[], activity: ActivityHandle, milestone?: number) => {
    if (!address) return;
    try {
      const mine = await ensure();
      const where = await place();
      const files: EvidenceFile[] = [];
      for (const { file: item, requirement } of entries.slice(0, MAX_BATCH_ITEMS)) {
        files.push({ file: await readBytes(item.uri), meta: { capturedAt: Math.floor(Date.now() / 1000), name: item.name, mime: item.mime, ...where, ...(requirement === undefined ? {} : { requirement }), ...(milestone === undefined ? {} : { milestone }) } as EvidenceMeta });
      }
      const stages = { upload: t.order.evidenceStageUpload, sign: t.order.evidenceStageSign, share: t.order.evidenceStageShare } as const;
      await uploadEvidenceBatch({ api, address, counterpart, mine, signMessage: signText, hash: sha256Hex, onStage: (stage) => activity.update(stages[stage]) }, orderId, files);
      activity.update(t.order.evidenceStageRefresh);
      for (const key of ["evidence", "order"]) await queryClient.invalidateQueries({ queryKey: [key] });
      toast({ text: t.order.evidenceDone, tone: "success", icon: "check" });
    } catch (failure) {
      const status = (failure as { status?: number }).status;
      if (isRejection(failure)) return void toast({ text: t.order.evidenceCancelled, tone: "info", icon: "info" });
      const text = (failure as Error).message === "counterpart_without_key" ? t.order.evidenceNoKey : status === 403 || status === 409 ? t.order.evidenceSyncing : t.order.evidenceFailed;
      toast({ text, tone: "error", icon: "alert" });
    }
  };

  // Todo lo que se pasa junto se sube con una sola firma (hasta MAX_BATCH_ITEMS archivos), cada archivo con su prueba pedida.
  const sendMany = (entries: UploadEntry[], milestone?: number) => {
    if (!address || entries.length === 0) return;
    toast({ text: t.order.evidenceUploading, tone: "info", icon: "clock", durationMs: 5000 });
    uploadQueue = uploadQueue.then(() => track(t.order.evidenceStageUpload, (activity) => upload(entries, activity, milestone)));
  };

  const send = (picked: PickedFile[], requirement?: number, milestone?: number) => sendMany(picked.map((file) => ({ file, requirement })), milestone);

  return { send, sendMany };
}

// Se eligen todas las pruebas que haga falta y recién después se suben juntas, con una sola firma (como en las pruebas pedidas).
export function EvidenceUploader({ orderId, counterpart, milestone }: { orderId: number; counterpart: string; milestone?: number }) {
  const { send: sendAny } = useEvidenceSend(orderId, counterpart);
  const [sheet, setSheet] = useState(false);
  const [staged, setStaged] = useState<PickedFile[]>([]);
  const room = Math.max(0, MAX_BATCH_ITEMS - staged.length);
  const stage = (picked: PickedFile[]) => setStaged((current) => [...current, ...picked].slice(0, MAX_BATCH_ITEMS));
  const upload = () => {
    sendAny(staged, undefined, milestone);
    setStaged([]);
  };

  return (
    <View style={styles.box}>
      <Button label={t.order.addPhoto} icon="camera" variant="outline" onPress={() => setSheet(true)} disabled={room === 0} />
      <Button label={t.order.addFile} icon="file" variant="ghost" onPress={async () => stage((await pickDocuments()).slice(0, room))} disabled={room === 0} />
      {staged.length > 0 ? (
        <>
          <Text style={text.secondary}>{staged.length === 1 ? t.order.requirementStagedOne : t.order.requirementStagedMany.replace("{n}", String(staged.length))}</Text>
          <Button label={(staged.length === 1 ? t.order.uploadStagedOne : t.order.uploadStagedMany).replace("{n}", String(staged.length))} icon="send" onPress={upload} />
          <Button label={t.order.requirementUnstage} icon="close" variant="ghost" onPress={() => setStaged([])} />
        </>
      ) : null}
      <ChoiceSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        choices={[
          { key: "camera", label: t.publish.takeNow, icon: "camera", onPress: () => void takeMedia().then((picked) => stage(picked.slice(0, room))) },
          { key: "gallery", label: t.publish.fromGallery, icon: "image", onPress: () => void pickMedia(Math.min(10, room)).then((picked) => stage(picked.slice(0, room))) },
        ]}
      />
    </View>
  );
}

// A qué hito pertenece cada prueba (va cifrada junto con el archivo). Las subidas antes de que existieran los hitos por prueba cuentan para el primero.
export function useEvidenceByMilestone(items: EvidenceItem[]) {
  const { api, address } = useSession();
  const { ensure } = useChatKey();
  const query = useQuery({
    queryKey: ["evidence-milestones", items.map((item) => item.hash).join(",")],
    enabled: items.length > 0 && Boolean(address),
    staleTime: Infinity,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const keys = await ensure();
      const byHash: Record<string, number> = {};
      for (const item of items) {
        if (!item.wrappedKey) continue;
        const senderKey = item.uploader.toLowerCase() === (address as string).toLowerCase() ? keys.publicKey : await fetchCounterpartKey(api, item.uploader);
        if (!senderKey) continue;
        const key = unwrapKey(item.wrappedKey, senderKey, keys);
        const meta = key ? decryptMeta(item.meta, key) : null;
        byHash[item.hash] = typeof meta?.milestone === "number" ? meta.milestone : 0;
      }
      return byHash;
    },
  });
  return (index: number) => items.filter((item) => query.data?.[item.hash] === index);
}

// Qué pruebas pedidas ya tienen un archivo. Las subidas antes de que existieran las asociaciones cubren las primeras que falten.
export function useCoveredRequirements(items: EvidenceItem[], total: number) {
  const { address } = useSession();
  const { ensure } = useChatKey();
  const mineItems = items.filter((item) => address && item.uploader.toLowerCase() === address.toLowerCase());
  const query = useQuery({
    queryKey: ["evidence-requirements", mineItems.map((item) => item.hash).join(",")],
    enabled: mineItems.length > 0 && total > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const keys = await ensure();
      const tagged = new Set<number>();
      let untagged = 0;
      for (const item of mineItems) {
        if (!item.wrappedKey) continue;
        const key = unwrapKey(item.wrappedKey, keys.publicKey, keys);
        const meta = key ? decryptMeta(item.meta, key) : null;
        if (meta && typeof meta.requirement === "number") tagged.add(meta.requirement);
        else untagged += 1;
      }
      for (let index = 0; index < total && untagged > 0; index += 1) {
        if (!tagged.has(index)) {
          tagged.add(index);
          untagged -= 1;
        }
      }
      return [...tagged].filter((index) => index < total);
    },
  });
  return new Set(query.data ?? []);
}

// Una fila por cada prueba que pidió quien publicó. Se eligen los archivos de todas las filas y se suben juntos con una sola firma.
export function RequirementList({ orderId, counterpart, requirements, covered }: { orderId: number; counterpart: string; requirements: string[]; covered: Set<number> }) {
  const { sendMany } = useEvidenceSend(orderId, counterpart);
  const [target, setTarget] = useState<number | null>(null);
  const [staged, setStaged] = useState<Staged>({});
  const total = stagedCount(staged);
  const room = roomLeft(staged);
  const stage = (picked: PickedFile[]) => {
    if (target !== null) setStaged((current) => addStaged(current, target, picked));
  };
  const upload = () => {
    sendMany(flattenStaged(staged));
    setStaged({});
  };
  return (
    <View style={styles.box}>
      {requirements.map((label, index) => {
        const done = covered.has(index);
        const ready = staged[index]?.length ?? 0;
        return (
          <Card key={`${index}-${label}`} gap="xs">
            <View style={styles.requirement}>
              <View style={[styles.mark, (done || ready > 0) && styles.markDone]}>
                {done || ready > 0 ? <Icon name="check" size={14} color={colors.white} /> : <Text style={text.label}>{index + 1}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={text.body}>{label}</Text>
                <Text style={text.secondary}>{ready > 0 ? (ready === 1 ? t.order.requirementStagedOne : t.order.requirementStagedMany.replace("{n}", String(ready))) : done ? t.order.requirementDone : t.order.requirementPending}</Text>
              </View>
            </View>
            <Button label={done || ready > 0 ? t.order.requirementReplace : t.order.requirementUpload} icon={done || ready > 0 ? "plus" : "camera"} variant={done || ready > 0 ? "ghost" : "outline"} onPress={() => setTarget(index)} disabled={room === 0} />
            {ready > 0 ? <Button label={t.order.requirementUnstage} icon="close" variant="ghost" onPress={() => setStaged((current) => clearStaged(current, index))} /> : null}
          </Card>
        );
      })}
      {total > 0 ? <Button label={(total === 1 ? t.order.uploadStagedOne : t.order.uploadStagedMany).replace("{n}", String(total))} icon="send" onPress={upload} /> : null}
      <ChoiceSheet
        visible={target !== null}
        onClose={() => setTarget(null)}
        choices={[
          { key: "camera", label: t.publish.takeNow, icon: "camera", onPress: () => void takeMedia().then(stage) },
          { key: "gallery", label: t.publish.fromGallery, icon: "image", onPress: () => void pickMedia(Math.min(10, room)).then(stage) },
          { key: "file", label: t.order.addFile, icon: "file", onPress: () => void pickDocuments().then((picked) => stage(picked.slice(0, room))) },
        ]}
      />
    </View>
  );
}

export function EvidenceGallery({ orderId, items }: { orderId: number; items: EvidenceItem[] }) {
  return (
    <View style={styles.box}>
      {items.map((item) => (
        <EvidenceCard key={item.hash} orderId={orderId} item={item} />
      ))}
    </View>
  );
}

type EvidenceRead = { meta: EvidenceMeta | null; uri: string | null; body: string | null };

// Baja y descifra una prueba. Por defecto solo las fotos y los textos se abren; con `force` cualquier archivo queda en un temporal para abrirlo.
function useEvidenceReader(orderId: number) {
  const { api, address } = useSession();
  const { ensure } = useChatKey();
  return async (item: EvidenceItem, force = false): Promise<EvidenceRead> => {
    const empty: EvidenceRead = { meta: null, uri: null, body: null };
    const mine = await ensure();
    const senderKey = item.uploader.toLowerCase() === (address as string).toLowerCase() ? mine.publicKey : await fetchCounterpartKey(api, item.uploader);
    if (!senderKey) return empty;
    const key = unwrapKey(item.wrappedKey as string, senderKey, mine);
    if (!key) return empty;
    const meta = decryptMeta(item.meta, key);
    if (!meta || (!force && item.kind !== "photo" && !meta.mime.startsWith("text/"))) return { meta, uri: null, body: null };
    const plain = decryptFile(await api.bytes(`/me/orders/${orderId}/evidence/${item.hash}`), key);
    if (!plain) return { meta, uri: null, body: null };
    if (meta.mime.startsWith("text/") && !force) return { meta, uri: null, body: new TextDecoder().decode(plain) };
    return { meta, uri: writeTempFile(plain, meta.name), body: null };
  };
}

// Una prueba descifrada. Se baja y se descifra una sola vez por archivo (la caché se guarda por hash, no por la lista que
// se vuelve a pedir), y la foto se muestra desde un archivo temporal en vez de un `data:` gigante en memoria.
function useEvidenceFile(orderId: number, item: EvidenceItem) {
  const { address } = useSession();
  const read = useEvidenceReader(orderId);
  return useQuery({
    queryKey: ["evidence-file", orderId, item.hash],
    enabled: Boolean(item.wrappedKey && address),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: 1,
    queryFn: () => read(item),
  });
}

function EvidenceCard({ orderId, item }: { orderId: number; item: EvidenceItem }) {
  const file = useEvidenceFile(orderId, item);
  const { meta, uri, body } = file.data ?? { meta: null, uri: null, body: null };

  return (
    <View style={styles.card}>
      {body !== null ? <Text style={text.body}>{body}</Text> : uri ? <Image source={{ uri }} style={styles.photo} contentFit="cover" /> : <View style={[styles.photo, styles.placeholder]} />}
      <Text style={text.secondary}>{meta ? meta.name : t.chat.unreadable}</Text>
    </View>
  );
}

// Las pruebas como miniaturas, igual que los demás adjuntos: al tocar una se abre grande (foto), con el reproductor (video) o con la app del teléfono (documento).
export function EvidenceThumbnails({ orderId, items }: { orderId: number; items: EvidenceItem[] }) {
  const viewer = useAttachmentViewer();
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <EvidenceTile key={item.hash} orderId={orderId} item={item} onOpen={viewer.open} />
      ))}
      {viewer.viewer}
    </View>
  );
}

function EvidenceTile({ orderId, item, onOpen }: { orderId: number; item: EvidenceItem; onOpen: (item: Viewable) => void }) {
  const file = useEvidenceFile(orderId, item);
  const read = useEvidenceReader(orderId);
  const meta = file.data?.meta;
  const open = async () => {
    const data = file.data?.uri ? file.data : await read(item, true).catch(() => null);
    if (data?.uri && data.meta) onOpen({ uri: data.uri, mime: data.meta.mime, name: data.meta.name });
  };
  return <AttachmentTile name={meta?.name ?? t.chat.unreadable} mime={meta?.mime ?? "application/octet-stream"} uri={file.data?.uri ?? undefined} onOpen={() => void open()} />;
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  card: { gap: spacing.xs },
  photo: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.md },
  placeholder: { backgroundColor: colors.map },
  requirement: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  mark: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  markDone: { backgroundColor: colors.success, borderColor: colors.success },
});
