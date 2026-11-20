import { JuryHeader, MyCasesPanel } from "../../jury/panels";
import { Screen } from "../../components/ui";
import { t } from "../../i18n";

export default function JuryMine() {
  return (
    <Screen back={false}>
      <JuryHeader title={t.tabs.juryMine} />
      <MyCasesPanel />
    </Screen>
  );
}
