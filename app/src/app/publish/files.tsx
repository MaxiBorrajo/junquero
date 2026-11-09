import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { Attachment } from "../../api/types";
import { AttachmentTile } from "../../components/AttachmentTile";
import { Body, Button, ErrorText, Secondary } from "../../components/ui";
import { WizardStep } from "../../components/Wizard";
import { t } from "../../i18n";
import { readBytes, uploadBytes } from "../../lib/files";
import { pickDocuments, pickMedia, takeMedia, type PickedFile } from "../../lib/pick";
import { ATTACHMENTS_MAX } from "../../publish/draft";
import { useDraft } from "../../publish/DraftProvider";
import { previewFor, rememberPreview } from "../../publish/previews";
import { useSession } from "../../session/SessionProvider";
import { spacing } from "../../theme";

export default function PublishFiles() {
  const { draft, update } = useDraft();
  const { api } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const room = ATTACHMENTS_MAX - draft.attachments.length;

  const upload = async (files: PickedFile[]) => {
    setBusy(true);
    setError(null);
    try {
      const added: Attachment[] = [];
      for (const file of files.slice(0, room)) {
        const bytes = await readBytes(file.uri);
        const uploaded = await uploadBytes(api, "/me/files", bytes, file.mime);
        rememberPreview(`0x${uploaded.hash}`, file.uri);
        added.push({ hash: `0x${uploaded.hash}`, name: file.name, mime: file.mime, size: bytes.byteLength });
      }
      update((d) => ({ ...d, attachments: [...d.attachments, ...added] }));
    } catch {
      setError(t.publish.uploadFailed);
    } finally {
      setBusy(false);
    }
  };

  const fromCamera = async () => upload(await takeMedia());
  const fromGallery = async () => upload(await pickMedia(room));
  const fromDocuments = async () => upload(await pickDocuments());

  const remove = (hash: string) => update((d) => ({ ...d, attachments: d.attachments.filter((item) => item.hash !== hash) }));

  return (
    <WizardStep step={3} title={t.publish.filesTitle} onNext={() => router.push("/publish/price")}>
      <Body>{t.publish.filesWarning}</Body>
      <View style={styles.grid}>
        {draft.attachments.map((file) => (
          <AttachmentTile key={file.hash} name={file.name} mime={file.mime} uri={previewFor(file.hash)} onRemove={() => remove(file.hash)} />
        ))}
      </View>
      {room <= 0 ? <Secondary>{t.publish.maxFiles}</Secondary> : null}
      <Button label={t.publish.takePhoto} variant="secondary" onPress={fromCamera} loading={busy} disabled={room <= 0} />
      <Button label={t.publish.addPhotos} variant="secondary" onPress={fromGallery} disabled={busy || room <= 0} />
      <Button label={t.publish.addDocument} variant="secondary" onPress={fromDocuments} disabled={busy || room <= 0} />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </WizardStep>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
