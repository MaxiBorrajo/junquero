import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet } from "react-native";
import { ChoiceSheet, type Choice } from "./ChoiceSheet";
import { Icon } from "./Icon";
import { useToast } from "./Toast";
import { t } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { colors } from "../theme";

interface Props {
  role: "owner" | "applicant";
  applicationId: number;
  changaId: number;
  counterpart: string;
  // La postulación sigue activa: se puede descartar o retirar.
  active: boolean;
  // Se llama después de descartar, retirar o bloquear.
  onDone?: () => void;
  // Si se pasa, el dueño puede elegir a esta persona desde el menú.
  onChoose?: () => void;
}

// Acciones sobre la otra persona de una postulación: descartar o bajarse, bloquear y reportar.
export function PersonMenu({ role, applicationId, changaId, counterpart, active, onDone, onChoose }: Props) {
  const { api } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const refresh = async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["applications"] }), queryClient.invalidateQueries({ queryKey: ["chats"] })]);
  };

  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      await refresh();
      toast({ text: message, tone: "success" });
      onDone?.();
    } catch {
      toast({ text: t.person.failed, tone: "error" });
    }
  };

  const confirm = (title: string, body: string, action: () => void) =>
    Alert.alert(title, body, [
      { text: t.common.cancel, style: "cancel" },
      { text: t.person.confirm, style: "destructive", onPress: action },
    ]);

  const choices: Choice[] = [];
  if (role === "owner" && active) {
    if (onChoose) choices.push({ key: "choose", label: t.received.choose, icon: "check", onPress: onChoose });
    choices.push({
      key: "dismiss",
      label: t.person.dismiss,
      icon: "close",
      onPress: () => confirm(t.person.dismissTitle, t.person.dismissBody, () => void run(() => api.send("POST", `/me/applications/${applicationId}/dismiss`, {}), t.person.done.dismiss)),
    });
    choices.push({
      key: "dismissAndBlock",
      label: t.person.dismissAndBlock,
      icon: "block",
      onPress: () => confirm(t.person.blockTitle, t.person.blockBody, () => void run(() => api.send("POST", `/me/applications/${applicationId}/dismiss`, { block: true }), t.person.done.block)),
    });
  } else {
    if (role === "applicant" && active) {
      choices.push({
        key: "leave",
        label: t.person.leave,
        icon: "logout",
        onPress: () => confirm(t.person.leaveTitle, t.person.leaveBody, () => void run(() => api.send("DELETE", `/me/applications/${changaId}`), t.person.done.leave)),
      });
    }
    choices.push({
      key: "block",
      label: t.person.block,
      icon: "block",
      onPress: () => confirm(t.person.blockTitle, t.person.blockBody, () => void run(() => api.send("POST", "/me/blocks", { address: counterpart }), t.person.done.block)),
    });
  }
  choices.unshift({ key: "profile", label: t.received.viewProfile, icon: "user", onPress: () => router.push({ pathname: "/profile-public", params: { address: counterpart } }) });
  choices.push({ key: "report", label: t.person.report, icon: "flag", onPress: () => router.push({ pathname: "/report/[kind]", params: { kind: "user", target: counterpart } }) });

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={t.person.menu} hitSlop={10} onPress={() => setOpen(true)} style={styles.button}>
        <Icon name="more" size={22} color={colors.ink} />
      </Pressable>
      <ChoiceSheet visible={open} choices={choices} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  button: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
