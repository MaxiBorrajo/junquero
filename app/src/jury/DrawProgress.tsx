import { useQuery } from "@tanstack/react-query";
import { Text } from "react-native";
import { phaseView, type CaseSnapshot } from "../chain/jury";
import { readCommitters, readParam, readRevealers } from "../chain/reader";
import { Card } from "../components/Card";
import { Secondary } from "../components/ui";
import { t } from "../i18n";
import { formatDate } from "../lib/format";
import { useFocusedInterval } from "../lib/useFocusedInterval";
import { text } from "../theme";

// El avance del sorteo de jurados de un reclamo, para las partes: cuántos se anotaron y revelaron, los plazos y qué pasa si no alcanzan.
// Solo cuentas, nunca quiénes son: las partes no conocen a los jurados.
export function DrawProgress({ caseId, snapshot }: { caseId: number; snapshot: CaseSnapshot }) {
  const view = phaseView(snapshot, Math.floor(Date.now() / 1000));
  const live = view === "seed-commit" || view === "seed-reveal" || view === "seed-draw";
  const counts = useQuery({
    queryKey: ["draw-progress", caseId, snapshot.round],
    enabled: live,
    refetchInterval: useFocusedInterval(20_000),
    queryFn: async () => {
      const [committers, revealers] = await Promise.all([readCommitters(caseId, snapshot.round), readRevealers(caseId, snapshot.round)]);
      return { committed: committers.length, revealed: revealers.length };
    },
  });
  const replacements = useQuery({ queryKey: ["param", "JUROR_REPLACEMENT_ROUNDS"], queryFn: () => readParam("JUROR_REPLACEMENT_ROUNDS"), staleTime: 5 * 60_000 });
  if (!live) return null;

  const needed = snapshot.jurors;
  const maxMore = Number(replacements.data ?? 3n);
  const used = snapshot.round - (snapshot.roundBase ?? 0);
  const phase = view === "seed-commit" ? t.draw.phaseCommit : view === "seed-reveal" ? t.draw.phaseReveal : t.draw.phaseDraw;

  return (
    <Card gap="xs">
      <Text style={text.subtitle}>{t.draw.title.replace("{round}", String(used + 1)).replace("{max}", String(maxMore + 1))}</Text>
      <Secondary>{phase.replace("{commitEnd}", formatDate(snapshot.commitEnd)).replace("{revealEnd}", formatDate(snapshot.revealEnd))}</Secondary>
      <Text style={text.body}>{t.draw.joined.replace("{n}", String(counts.data?.committed ?? "-")).replace("{needed}", String(needed))}</Text>
      <Text style={text.body}>{t.draw.revealed.replace("{n}", String(counts.data?.revealed ?? "-")).replace("{needed}", String(needed))}</Text>
      <Secondary>{t.draw.rule.replace("{needed}", String(needed)).replace("{more}", String(Math.max(0, maxMore - used)))}</Secondary>
    </Card>
  );
}
