import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { fetchMilestones } from "../chain/serverReads";
import { Secondary } from "../components/ui";
import { useChangaBySpec } from "../data/useChangas";
import { useOrder } from "../data/useOrder";
import { t } from "../i18n";
import { formatUsdc } from "../lib/money";
import { useSession } from "../session/SessionProvider";
import { colors, spacing, text } from "../theme";

// Lo mínimo que un jurado puede ver de un reclamo antes de anotarse: rubro, modalidad y los criterios que las partes
// acordaron antes del trabajo. No incluye el título, los relatos, las pruebas ni quiénes son las partes: eso solo lo ven los sorteados.
export function useCaseSummary(orderId: number) {
  const { api } = useSession();
  const order = useOrder(orderId);
  const changa = useChangaBySpec(order.data?.specHash ?? "0x");
  // En una changa con hitos lo que se disputa es el hito en revisión, no el total.
  const amount = useQuery({
    queryKey: ["case-summary-amount", orderId, order.data?.hasMilestones],
    enabled: order.data !== undefined,
    staleTime: 60_000,
    queryFn: async () => {
      const state = order.data!;
      if (!state.hasMilestones) return state.price;
      const board = await fetchMilestones(api, orderId);
      return board.milestones[board.next]?.amount ?? state.price;
    },
  });

  const spec = changa.data?.spec;
  if (!order.data || !spec) return null;
  const milestone = order.data.hasMilestones ? spec.milestones : undefined;
  const criteria = [...(spec.evidence ?? []), ...(milestone ?? []).map((m) => `${m.name}: ${m.criteria}`)].filter((line) => line.trim() !== "");
  return { spec, amount: amount.data, criteria };
}

// El monto en disputa, en el mismo estilo que el monto de las tarjetas de Mis trabajos (a la derecha del título).
export function CaseAmount({ orderId }: { orderId: number }) {
  const summary = useCaseSummary(orderId);
  if (!summary || summary.amount === undefined) return null;
  return <Text style={[text.subtitle, { color: colors.brick }]}>{formatUsdc(summary.amount.toString())}</Text>;
}

export function CaseSummary({ orderId }: { orderId: number }) {
  const summary = useCaseSummary(orderId);
  if (!summary) return null;
  const { spec, criteria } = summary;

  return (
    <View style={{ gap: spacing.xs }}>
      <Secondary>{`${t.jury.summary.category}: ${t.publish.categories[spec.category] ?? "-"} · ${spec.modality === "remote" ? t.publish.remote : t.publish.onsite}`}</Secondary>
      <Text style={text.label}>{t.jury.summary.criteria}</Text>
      {criteria.length === 0 ? <Secondary>{t.jury.summary.noCriteria}</Secondary> : criteria.map((line, index) => <Secondary key={index}>{`•  ${line}`}</Secondary>)}
      <Secondary>{t.jury.summary.hidden}</Secondary>
    </View>
  );
}
