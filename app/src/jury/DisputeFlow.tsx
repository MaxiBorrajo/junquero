import { useQuery } from "@tanstack/react-query";
import { Text } from "react-native";
import { readParam } from "../chain/reader";
import { Card } from "../components/Card";
import { Secondary } from "../components/ui";
import { t } from "../i18n";
import { spokenDuration } from "../lib/duration";
import { text } from "../theme";

// Cómo sigue un reclamo con jurado, con los plazos reales del registro. Se muestra antes de abrirlo; en un reclamo chico no hay jurado y no aplica.
export function DisputeFlow({ size }: { size: number }) {
  const params = useQuery({
    queryKey: ["dispute-flow-params", size],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const names = ["DISPUTE_RESPONSE_WINDOW", "JUROR_INVITE_WINDOW", "SEED_REVEAL_WINDOW", "VOTE_COMMIT_WINDOW", "VOTE_REVEAL_WINDOW", "APPEAL_WINDOW", "JUROR_REPLACEMENT_ROUNDS", size === 1 ? "JURY_SIZE_MEDIUM" : "JURY_SIZE_LARGE"];
      const values = await Promise.all(names.map((name) => readParam(name)));
      return Object.fromEntries(names.map((name, index) => [name, Number(values[index])])) as Record<string, number>;
    },
  });
  const p = params.data;
  if (!p) return null;
  const d = (name: string) => spokenDuration(p[name]);
  const jurors = String(p[size === 1 ? "JURY_SIZE_MEDIUM" : "JURY_SIZE_LARGE"]);

  const steps = [
    t.disputeFlow.response.replace("{time}", d("DISPUTE_RESPONSE_WINDOW")),
    t.disputeFlow.draw.replace("{jurors}", jurors).replace("{invite}", d("JUROR_INVITE_WINDOW")).replace("{reveal}", d("SEED_REVEAL_WINDOW")),
    t.disputeFlow.rounds.replace("{more}", String(p.JUROR_REPLACEMENT_ROUNDS)),
    t.disputeFlow.vote.replace("{commit}", d("VOTE_COMMIT_WINDOW")).replace("{reveal}", d("VOTE_REVEAL_WINDOW")),
    t.disputeFlow.appeal.replace("{time}", d("APPEAL_WINDOW")),
  ];

  return (
    <Card gap="xs">
      <Text style={text.subtitle}>{t.disputeFlow.title}</Text>
      {steps.map((line, index) => (
        <Secondary key={index}>{`${index + 1}. ${line}`}</Secondary>
      ))}
      <Secondary>{t.disputeFlow.frozen}</Secondary>
    </Card>
  );
}
