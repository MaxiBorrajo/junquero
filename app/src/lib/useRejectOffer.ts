import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useActivity } from "../components/Activity";
import { useToast } from "../components/Toast";
import { t } from "../i18n";
import { useSession } from "../session/SessionProvider";

// Quien publica descarta solo la propuesta de una persona postulada: ella sigue postulada con las condiciones publicadas.
export function useRejectOffer() {
  const { api } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const track = useActivity();

  const send = async (applicationId: number) => {
    try {
      await track(t.common.working, async () => {
        await api.send("POST", `/me/applications/${applicationId}/reject-offer`, {});
        await Promise.all([queryClient.invalidateQueries({ queryKey: ["applications"] }), queryClient.invalidateQueries({ queryKey: ["chat-events"] })]);
      });
      toast({ text: t.offer.rejected, icon: "close", tone: "info" });
    } catch {
      toast({ text: t.offer.rejectFailed, tone: "error" });
    }
  };

  const reject = (applicationId: number, name: string) =>
    Alert.alert(t.offer.rejectTitle, t.offer.rejectBody.replace("{name}", name), [
      { text: t.common.cancel, style: "cancel" },
      { text: t.offer.rejectConfirm, style: "destructive", onPress: () => void send(applicationId) },
    ]);

  return { reject };
}
