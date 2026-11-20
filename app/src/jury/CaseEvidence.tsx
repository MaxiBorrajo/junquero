import { useState } from "react";
import { Text, View } from "react-native";
import { EvidenceThumbnails, useEvidenceNames } from "../evidence/EvidenceSection";
import type { EvidenceItem } from "../data/useOrder";
import { Button, Secondary } from "../components/ui";
import { t } from "../i18n";
import { spacing, text } from "../theme";
import { groupEvidence } from "./evidenceGroups";

// Cuántos archivos se ven de entrada en cada bloque (dos renglones de miniaturas); el resto se despliega con un botón. El relato se ve siempre.
export const VISIBLE_FILES = 6;
const STATEMENT = "relato.txt";

// Las pruebas de un reclamo ordenadas por origen: las del trabajo, lo que cuenta la Parte A (quien publicó) y lo que cuenta la Parte B (quien
// hizo el trabajo). Nunca se muestran identidades. Se usa en la pantalla del jurado y en la de las partes.
export function CaseEvidence({ orderId, items, payer, payee }: { orderId: number; items: EvidenceItem[]; payer: string; payee: string }) {
  const names = useEvidenceNames(orderId, items);
  const groups = groupEvidence(items, names, payer, payee);
  return (
    <View style={{ gap: spacing.xl, marginTop: spacing.md, marginBottom: spacing.md }}>
      <Section title={t.jury.evidence.job} items={groups.job} names={names} orderId={orderId} empty={t.jury.evidence.jobNone} />
      <Section title={t.jury.evidence.payer} items={groups.payer} names={names} orderId={orderId} empty={t.jury.evidence.waiting} />
      <Section title={t.jury.evidence.payee} items={groups.payee} names={names} orderId={orderId} empty={t.jury.evidence.waiting} />
    </View>
  );
}

function Section({ title, items, names, orderId, empty }: { title: string; items: EvidenceItem[]; names: Record<string, string | undefined>; orderId: number; empty: string }) {
  const [all, setAll] = useState(false);
  const statements = items.filter((item) => names[item.hash] === STATEMENT);
  const files = items.filter((item) => names[item.hash] !== STATEMENT);
  const shown = all ? files : files.slice(0, VISIBLE_FILES);
  const hidden = files.length - shown.length;
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={text.subtitle}>{files.length > 0 ? `${title} (${files.length})` : title}</Text>
      {items.length === 0 ? <Secondary>{empty}</Secondary> : null}
      {statements.length > 0 ? <EvidenceThumbnails orderId={orderId} items={statements} /> : null}
      {shown.length > 0 ? <EvidenceThumbnails orderId={orderId} items={shown} /> : null}
      {hidden > 0 ? <Button label={t.jury.evidence.showAll.replace("{n}", String(files.length))} icon="chevron" variant="outline" onPress={() => setAll(true)} /> : null}
      {all && files.length > VISIBLE_FILES ? <Button label={t.jury.evidence.showLess} variant="ghost" onPress={() => setAll(false)} /> : null}
    </View>
  );
}
