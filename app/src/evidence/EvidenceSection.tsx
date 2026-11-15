import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusedInterval } from "../lib/useFocusedInterval";
import * as Location from "expo-location";
import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { signMessage } from "wagmi/actions";
import { fetchCounterpartKey } from "../crypto/keyManager";
import { useChatKey } from "../chat/ChatKeyProvider";
import { Card } from "../components/Card";
import { ChoiceSheet } from "../components/ChoiceSheet";
import { Icon } from "../components/Icon";
import { Button, ErrorText, Secondary } from "../components/ui";
import type { EvidenceItem } from "../data/useOrder";
import { t } from "../i18n";
import { readBytes, sha256Hex } from "../lib/files";
import { writeTempFile } from "../lib/openDocument";
import { pickDocuments, pickMedia, takeMedia, type PickedFile } from "../lib/pick";
import { useSession } from "../session/SessionProvider";
import { wagmiAdapter } from "../wallet/appkit";
import { isRejection } from "../wallet/sign";
import { colors, radius, spacing, text } from "../theme";
import { decryptFile, decryptMeta, unwrapKey, type EvidenceMeta } from "./crypto";
import { MAX_BATCH_ITEMS, uploadEvidenceBatch } from "./upload";

export function useEvidence(orderId: number) {
  const { api } = useSession();
  return useQuery({
    queryKey: ["evidence", orderId],
    refetchInterval: useFocusedInterval(60_000),
    queryFn: async () => (await api.get<{ role: string; evidence: EvidenceItem[] }>(`/me/orders/${orderId}/evidence`)).evidence,
  });
}

// Sube pruebas cifradas. Si se indica `requirement`, quedan asociadas a esa prueba pedida.
export function useEvidenceSend(orderId: number, counterpart: string) {
  const { api, address } = useSession();
  const { ensure } = useChatKey();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const send = async (picked: PickedFile[], requirement?: number) => {
    if (!address || picked.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const mine = await ensure();
      const where = await place();
      const files = [];
      for (const item of picked.slice(0, MAX_BATCH_ITEMS)) {
        files.push({ file: await readBytes(item.uri), meta: { capturedAt: Math.floor(Date.now() / 1000), name: item.name, mime: item.mime, ...where, ...(requirement === undefined ? {} : { requirement }) } as EvidenceMeta });
      }
      await uploadEvidenceBatch(
        { api, address, counterpart, mine, signMessage: (message) => signMessage(wagmiAdapter.wagmiConfig, { message }), hash: sha256Hex },
        orderId,
        files,
      );
      await queryClient.invalidateQueries({ queryKey: ["evidence", orderId] });
    } catch (failure) {
      const status = (failure as { status?: number }).status;
      setError((failure as Error).message === "counterpart_without_key" ? t.order.evidenceNoKey : status === 403 || status === 409 ? t.order.evidenceSyncing : isRejection(failure) ? t.order.evidenceCancelled : t.order.evidenceFailed);
    } finally {
      setBusy(false);
    }
  };

  return { send, busy, error };
}

export function EvidenceUploader({ orderId, counterpart }: { orderId: number; counterpart: string }) {
  const { send, busy, error } = useEvidenceSend(orderId, counterpart);
  const [sheet, setSheet] = useState(false);

  return (
    <View style={styles.box}>
      <Button label={t.order.addPhoto} icon="camera" variant="outline" onPress={() => setSheet(true)} loading={busy} />
      <Button label={t.order.addFile} icon="file" variant="ghost" onPress={async () => send(await pickDocuments())} disabled={busy} />
      <ChoiceSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        choices={[
          { key: "camera", label: t.publish.takeNow, icon: "camera", onPress: () => void takeMedia().then((picked) => send(picked)) },
          { key: "gallery", label: t.publish.fromGallery, icon: "image", onPress: () => void pickMedia(10).then((picked) => send(picked)) },
        ]}
      />
      {busy ? <Secondary>{t.order.evidenceUploading}</Secondary> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
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

// Una fila por cada prueba que pidió quien publicó, con su propio botón para subirla.
export function RequirementList({ orderId, counterpart, requirements, covered }: { orderId: number; counterpart: string; requirements: string[]; covered: Set<number> }) {
  const { send, busy, error } = useEvidenceSend(orderId, counterpart);
  const [target, setTarget] = useState<number | null>(null);
  return (
    <View style={styles.box}>
      {requirements.map((label, index) => {
        const done = covered.has(index);
        return (
          <Card key={`${index}-${label}`} gap="xs">
            <View style={styles.requirement}>
              <View style={[styles.mark, done && styles.markDone]}>
                {done ? <Icon name="check" size={14} color={colors.white} /> : <Text style={text.label}>{index + 1}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={text.body}>{label}</Text>
                <Text style={text.secondary}>{done ? t.order.requirementDone : t.order.requirementPending}</Text>
              </View>
            </View>
            <Button label={done ? t.order.requirementReplace : t.order.requirementUpload} icon={done ? "refresh" : "camera"} variant={done ? "ghost" : "outline"} onPress={() => setTarget(index)} disabled={busy} />
          </Card>
        );
      })}
      <ChoiceSheet
        visible={target !== null}
        onClose={() => setTarget(null)}
        choices={[
          { key: "camera", label: t.publish.takeNow, icon: "camera", onPress: () => void takeMedia().then((picked) => send(picked, target ?? undefined)) },
          { key: "gallery", label: t.publish.fromGallery, icon: "image", onPress: () => void pickMedia(1).then((picked) => send(picked, target ?? undefined)) },
          { key: "file", label: t.order.addFile, icon: "file", onPress: () => void pickDocuments().then((picked) => send(picked.slice(0, 1), target ?? undefined)) },
        ]}
      />
      {busy ? <Secondary>{t.order.evidenceUploading}</Secondary> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
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

// Una prueba descifrada. Se baja y se descifra una sola vez por archivo (la caché se guarda por hash, no por la lista que
// se vuelve a pedir), y la foto se muestra desde un archivo temporal en vez de un `data:` gigante en memoria.
function EvidenceCard({ orderId, item }: { orderId: number; item: EvidenceItem }) {
  const { api, address } = useSession();
  const { ensure } = useChatKey();
  const file = useQuery({
    queryKey: ["evidence-file", orderId, item.hash],
    enabled: Boolean(item.wrappedKey && address),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: 1,
    queryFn: async (): Promise<{ meta: EvidenceMeta | null; uri: string | null; body: string | null }> => {
      const mine = await ensure();
      const senderKey = item.uploader.toLowerCase() === (address as string).toLowerCase() ? mine.publicKey : await fetchCounterpartKey(api, item.uploader);
      if (!senderKey) return { meta: null, uri: null, body: null };
      const key = unwrapKey(item.wrappedKey as string, senderKey, mine);
      if (!key) return { meta: null, uri: null, body: null };
      const meta = decryptMeta(item.meta, key);
      if (!meta || (item.kind !== "photo" && !meta.mime.startsWith("text/"))) return { meta, uri: null, body: null };
      const plain = decryptFile(await api.bytes(`/me/orders/${orderId}/evidence/${item.hash}`), key);
      if (!plain) return { meta, uri: null, body: null };
      if (meta.mime.startsWith("text/")) return { meta, uri: null, body: new TextDecoder().decode(plain) };
      return { meta, uri: writeTempFile(plain, meta.name), body: null };
    },
  });
  const { meta, uri, body } = file.data ?? { meta: null, uri: null, body: null };

  return (
    <View style={styles.card}>
      {body !== null ? <Text style={text.body}>{body}</Text> : uri ? <Image source={{ uri }} style={styles.photo} contentFit="cover" /> : <View style={[styles.photo, styles.placeholder]} />}
      <Text style={text.secondary}>{meta ? meta.name : t.chat.unreadable}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  card: { gap: spacing.xs },
  photo: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.md },
  placeholder: { backgroundColor: colors.map },
  requirement: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  mark: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  markDone: { backgroundColor: colors.success, borderColor: colors.success },
});
