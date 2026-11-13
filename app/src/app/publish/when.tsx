import { router } from "expo-router";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { Chip, Button, Labeled, Row, Secondary } from "../../components/ui";
import { DateTimeField } from "../../components/DateTimeField";
import { WizardStep } from "../../components/Wizard";
import { ZonePicker } from "../../components/ZonePicker";
import { DEFAULT_CENTER } from "../../config";
import { t } from "../../i18n";
import { formatDuration } from "../../lib/format";
import { validateWhen, withApproximateZone } from "../../publish/draft";
import { useDraft } from "../../publish/DraftProvider";
import { useSession } from "../../session/SessionProvider";
import { colors, text } from "../../theme";

export default function PublishWhen() {
  const { draft, update } = useDraft();
  const { profile } = useSession();
  const [touched, setTouched] = useState(false);
  const errors = touched ? validateWhen(draft, Math.floor(Date.now() / 1000)) : {};
  const fallback = profile ? { lat: profile.work.lat, lng: profile.work.lng } : DEFAULT_CENTER;
  const onsite = draft.modality === "onsite";

  const setPoint = (point: { lat: number; lng: number }) => update((d) => withApproximateZone(d, point, Math.random));

  useEffect(() => {
    if (onsite && !draft.point) setPoint(fallback);
  }, []);

  const useMyLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return;
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPoint({ lat: position.coords.latitude, lng: position.coords.longitude });
    } catch {}
  };

  const next = () => {
    setTouched(true);
    if (Object.keys(validateWhen(draft, Math.floor(Date.now() / 1000))).length === 0) router.push("/publish/files");
  };

  return (
    <WizardStep step={2} title={t.publish.whenTitle} onNext={next}>
      {onsite ? (
        <>
          <Labeled label={t.publish.wherePoint}>
            <ZonePicker center={draft.point ?? fallback} radiusM={0} onChange={setPoint} />
          </Labeled>
          <Secondary>{t.publish.wherePrivacy}</Secondary>
          <Button label={t.profile.useMyLocation} variant="ghost" onPress={useMyLocation} />
          {errors.point ? <Text style={[text.secondary, { color: colors.error }]}>{t.publish.pointError}</Text> : null}
          <DateTimeField value={draft.startsAt} onChange={(startsAt) => update({ startsAt })} />
          {errors.startsAt ? <Text style={[text.secondary, { color: colors.error }]}>{t.publish.dateError}</Text> : null}
        </>
      ) : (
        <>
          <Labeled label={t.publish.deadlineLabel}>
            <DateTimeField value={draft.deadline} onChange={(deadline) => update({ deadline })} />
          </Labeled>
          {errors.deadline ? <Text style={[text.secondary, { color: colors.error }]}>{t.publish.dateError}</Text> : null}
        </>
      )}
      <Labeled label={t.publish.durationLabel} hint={t.publish.durationHint}>
        <Row>
          {t.publish.durations.map((minutes) => (
            <Chip key={minutes} label={formatDuration(minutes)} selected={draft.durationMin === minutes} onPress={() => update({ durationMin: draft.durationMin === minutes ? null : minutes })} />
          ))}
        </Row>
      </Labeled>
    </WizardStep>
  );
}
