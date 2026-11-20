import { JuryHeader, OpenCasesPanel } from "../../jury/panels";
import { Screen } from "../../components/ui";
import { t } from "../../i18n";

export default function JuryOpen() {
  return (
    <Screen back={false}>
      <JuryHeader title={t.tabs.juryOpen} />
      <OpenCasesPanel />
    </Screen>
  );
}
