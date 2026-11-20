import { JuryHeader, StakePanel } from "../../jury/panels";
import { Screen } from "../../components/ui";
import { t } from "../../i18n";

export default function JuryStake() {
  return (
    <Screen back={false}>
      <JuryHeader title={t.tabs.juryStake} />
      <StakePanel />
    </Screen>
  );
}
