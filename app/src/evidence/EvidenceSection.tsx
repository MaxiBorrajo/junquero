import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { signMessage } from "wagmi/actions";
import { toBase64 } from "../crypto/base64";
import { fetchCounterpartKey } from "../crypto/keyManager";
import { useChatKey } from "../chat/ChatKeyProvider";
import { Button, ErrorText, Secondary } from "../components/ui";
import type { EvidenceItem } from "../data/useOrder";
import { t } from "../i18n";
import { readBytes, sha256Hex } from "../lib/files";
import { useSession } from "../session/SessionProvider";
import { wagmiAdapter } from "../wallet/appkit";
import { colors, radius, spacing, text } from "../theme";
import { decryptFile, decryptMeta, unwrapKey, type EvidenceMeta } from "./crypto";
import { uploadEvidence } from "./upload";

export function useEvidence(orderId: number) {
  const { api } = useSession();
  return useQuery({
    queryKey: ["evidence", orderId],
    refetchInterval: 20_000,
    queryFn: async () => (await api.get<{ role: string; evidence: EvidenceItem[] }>(`/me/orders/${orderId}/evidence`)).evidence,
  });
}

export function EvidenceUploader({ orderId, counterpart }: { orderId: number; counterpart: string }) {
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

  const send = async (uri: string, name: string, mime: string) => {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const mine = await ensure();
      const bytes = await readBytes(uri);
      const meta: EvidenceMeta = { capturedAt: Math.floor(Date.now() / 1000), name, mime, ...(await place()) };
      await uploadEvidence(
        { api, address, counterpart, mine, signMessage: (message) => signMessage(wagmiAdapter.wagmiConfig, { message }), hash: sha256Hex },
        orderId,
        bytes,
        meta,
      );
      await queryClient.invalidateQueries({ queryKey: ["evidence", orderId] });
    } catch (failure) {
      setError((failure as Error).message === "counterpart_without_key" ? t.order.evidenceNoKey : t.order.evidenceFailed);
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) await send(asset.uri, asset.fileName ?? "foto.jpg", asset.mimeType ?? "image/jpeg");
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) await send(asset.uri, asset.name, asset.mimeType ?? "application/octet-stream");
  };

  return (
    <View style={styles.box}>
      <Button label={t.order.addPhoto} variant="secondary" onPress={takePhoto} loading={busy} />
      <Button label={t.order.addFile} variant="ghost" onPress={pickFile} disabled={busy} />
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

function EvidenceCard({ orderId, item }: { orderId: number; item: EvidenceItem }) {
  const { api, address } = useSession();
  const { ensure } = useChatKey();
  const [uri, setUri] = useState<string | null>(null);
  const [meta, setMeta] = useState<EvidenceMeta | null>(null);
  const [body, setBody] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!item.wrappedKey || !address) return;
      try {
        const mine = await ensure();
        const senderKey = item.uploader.toLowerCase() === address.toLowerCase() ? mine.publicKey : await fetchCounterpartKey(api, item.uploader);
        if (!senderKey) return;
        const key = unwrapKey(item.wrappedKey, senderKey, mine);
        if (!key) return;
        const decodedMeta = decryptMeta(item.meta, key);
        if (alive) setMeta(decodedMeta);
        if (!decodedMeta || (item.kind !== "photo" && !decodedMeta.mime.startsWith("text/"))) return;
        const plain = decryptFile(await api.bytes(`/me/orders/${orderId}/evidence/${item.hash}`), key);
        if (!plain || !alive) return;
        if (decodedMeta.mime.startsWith("text/")) setBody(new TextDecoder().decode(plain));
        else setUri(`data:${decodedMeta.mime};base64,${toBase64(plain)}`);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [api, address, ensure, item, orderId]);

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
});
