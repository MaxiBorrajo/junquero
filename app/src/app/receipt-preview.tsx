import { useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SvgXml } from "react-native-svg";
import { Card } from "../components/Card";
import { Chip, Field, Labeled, Screen, Secondary, Title } from "../components/ui";
import { t } from "../i18n";
import { CARD_HEIGHT, CARD_WIDTH, receiptCardSvg, monthLabel } from "../receipts/cardSvg";
import { colors, fonts, radius, spacing, text } from "../theme";

const SAMPLE_COMMENT = "Excelente trabajo: llegó a horario, dejó todo prolijo y me explicó cómo cuidarlo. Lo vuelvo a contratar.";

// Vista previa del comprobante (NFT) con datos de ejemplo, para elegir el estilo mirándolo en la app real. Es temporal: se llega desde Ajustes.
export default function ReceiptPreview() {
  const { width } = useWindowDimensions();
  const [category, setCategory] = useState(0);
  const [rating, setRating] = useState(5);
  const [remote, setRemote] = useState(true);
  const [title, setTitle] = useState("Instalar un portón corredizo");
  const [named, setNamed] = useState(true);
  const [dark, setDark] = useState(true);
  const categories = t.publish.categories as readonly string[];
  const cardWidth = Math.min(width - spacing.md * 2, 420);
  const svg = receiptCardSvg(
    { orderId: 3, title, category, categoryName: categories[category] ?? "", remote, rating, month: 202611, payerName: named ? "Ana M." : null },
    dark ? "oscuro" : "minimal",
    { regular: fonts.regular, bold: fonts.bold },
  );

  return (
    <Screen>
      <Title>Comprobante: vista previa</Title>
      <Secondary>Datos de ejemplo para elegir el estilo. Cambiá lo que quieras y mirá cómo queda.</Secondary>

      <View style={styles.cardWrap}>
        <SvgXml xml={svg} width={cardWidth} height={(cardWidth * CARD_HEIGHT) / CARD_WIDTH} style={styles.card} />
      </View>

      <Labeled label="Fondo">
        <View style={styles.chips}>
          <Chip label="Oscuro (tono del rubro)" selected={dark} onPress={() => setDark(true)} />
          <Chip label="Claro (crema)" selected={!dark} onPress={() => setDark(false)} />
        </View>
      </Labeled>
      <Labeled label="Rubro">
        <View style={styles.chips}>
          {categories.map((name, index) => (
            <Chip key={name} label={name} selected={category === index} onPress={() => setCategory(index)} />
          ))}
        </View>
      </Labeled>
      <Labeled label="Nota">
        <View style={styles.chips}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Chip key={value} label={String(value)} selected={rating === value} onPress={() => setRating(value)} />
          ))}
        </View>
      </Labeled>
      <Labeled label="Otros">
        <View style={styles.chips}>
          <Chip label="A distancia" selected={remote} onPress={() => setRemote(true)} />
          <Chip label="Presencial" selected={!remote} onPress={() => setRemote(false)} />
          <Chip label="Con nombre" selected={named} onPress={() => setNamed(true)} />
          <Chip label="Anónimo" selected={!named} onPress={() => setNamed(false)} />
        </View>
      </Labeled>
      <Field label="Título de la changa (probá uno largo)" value={title} onChangeText={setTitle} maxLength={80} />

      <Text style={text.subtitle}>Así se vería el detalle</Text>
      <Card gap="sm">
        <Fact label="Rubro" value={categories[category] ?? ""} />
        <Fact label="Modalidad" value={remote ? "A distancia" : "Presencial"} />
        <Fact label="Mes" value={monthLabel(202611)} />
        <Fact label="Nota" value={`${rating} de 5`} />
        {named ? <Fact label="Calificó" value="Ana M." /> : null}
        <View style={styles.quote}>
          <Text style={text.label}>Comentario (público)</Text>
          <Text style={text.body}>{`“${SAMPLE_COMMENT}”`}</Text>
        </View>
        <Secondary>Intransferible: queda para siempre en la cuenta de quien hizo el trabajo.</Secondary>
      </Card>
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={text.secondary}>{label}</Text>
      <Text style={[text.body, { flexShrink: 1, textAlign: "right" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fact: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  cardWrap: { alignItems: "center", marginVertical: spacing.md },
  card: { borderRadius: radius.lg, overflow: "hidden" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  quote: { gap: spacing.xs, borderLeftWidth: 3, borderLeftColor: colors.brick, paddingLeft: spacing.md },
});
