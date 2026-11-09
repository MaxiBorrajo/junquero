import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import type { Attachment } from "../../api/types";
import { Body, Button, ErrorText, Secondary } from "../../components/ui";
import { WizardStep } from "../../components/Wizard";
import { t } from "../../i18n";
import { readBytes, uploadBytes } from "../../lib/files";
import { ATTACHMENTS_MAX } from "../../publish/draft";
import { useDraft } from "../../publish/DraftProvider";
import { useSession } from "../../session/SessionProvider";
import { text } from "../../theme";

interface Picked {
  uri: string;
  name: string;
  mime: string;
}

export default function PublishFiles() {
  const { draft, update } = useDraft();
  const { api } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const room = ATTACHMENTS_MAX - draft.attachments.length;

  const upload = async (files: Picked[]) => {
    setBusy(true);
    setError(null);
    try {
      const added: Attachment[] = [];
      for (const file of files.slice(0, room)) {
        const bytes = await readBytes(file.uri);
        const uploaded = await uploadBytes(api, "/me/files", bytes, file.mime);
        added.push({ hash: `0x${uploaded.hash}`, name: file.name, mime: file.mime, size: bytes.byteLength });
      }
      update((d) => ({ ...d, attachments: [...d.attachments, ...added] }));
    } catch {
      setError(t.publish.uploadFailed);
    } finally {
      setBusy(false);
    }
  };

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], allowsMultipleSelection: true, selectionLimit: room, quality: 0.7 });
    if (result.canceled) return;
    await upload(result.assets.map((asset, index) => ({ uri: asset.uri, name: asset.fileName ?? `archivo-${index + 1}`, mime: asset.mimeType ?? "image/jpeg" })));
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    await upload(result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, mime: asset.mimeType ?? "application/octet-stream" })));
  };

  const remove = (hash: string) => update((d) => ({ ...d, attachments: d.attachments.filter((item) => item.hash !== hash) }));

  return (
    <WizardStep step={3} title={t.publish.filesTitle} onNext={() => router.push("/publish/price")}>
      <Body>{t.publish.filesWarning}</Body>
      {draft.attachments.map((file) => (
        <View key={file.hash} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Text style={[text.body, { flex: 1 }]} numberOfLines={1}>
            {file.name}
          </Text>
          <Button label={t.publish.remove} variant="ghost" onPress={() => remove(file.hash)} />
        </View>
      ))}
      {room <= 0 ? <Secondary>{t.publish.maxFiles}</Secondary> : null}
      <Button label={t.publish.addPhotos} variant="secondary" onPress={pickMedia} loading={busy} disabled={room <= 0} />
      <Button label={t.publish.addDocument} variant="secondary" onPress={pickDocument} disabled={busy || room <= 0} />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </WizardStep>
  );
}
