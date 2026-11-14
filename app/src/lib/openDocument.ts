import { File, Paths } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy";
import { startActivityAsync } from "expo-intent-launcher";

const VIEW = "android.intent.action.VIEW";
const GRANT_READ_URI_PERMISSION = 1;

const safeName = (name: string): string => name.replace(/[^\w.\-]+/g, "_").slice(-80) || "archivo";

// Abre un documento con la app del sistema que lo muestre (PDF, planillas, etc.). Si está en la red, lo baja antes.
export async function openDocument(uri: string, mime: string, name: string): Promise<void> {
  let local = uri;
  if (/^https?:/i.test(uri)) {
    const downloaded = await File.downloadFileAsync(uri, new File(Paths.cache, safeName(name)), { idempotent: true });
    local = downloaded.uri;
  }
  const content = await getContentUriAsync(local);
  await startActivityAsync(VIEW, { data: content, flags: GRANT_READ_URI_PERMISSION, type: mime });
}
