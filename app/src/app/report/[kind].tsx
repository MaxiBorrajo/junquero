import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Button, ErrorText, Field, Screen, Title } from "../../components/ui";
import { t } from "../../i18n";
import { useSession } from "../../session/SessionProvider";

export default function ReportScreen() {
  const { kind, target } = useLocalSearchParams<{ kind: string; target: string }>();
  const { api } = useSession();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const valid = reason.trim().length >= 3;

  const send = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.send("POST", "/me/reports", { kind, target, reason: reason.trim() });
      toast({ text: t.report.sent, icon: "flag" });
      router.back();
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 409 ? t.report.already : t.report.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button label={t.report.send} icon="send" onPress={send} loading={busy} />}>
      <Title>{kind === "user" ? t.report.user : t.report.changa}</Title>
      <Field label={t.report.reasonLabel} value={reason} onChangeText={setReason} multiline maxLength={300} error={touched && !valid ? t.report.reasonError : null} />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}
