import { Redirect, Stack } from "expo-router";
import { DraftProvider } from "../../publish/DraftProvider";
import { useSession } from "../../session/SessionProvider";

export default function PublishLayout() {
  const { status, profile } = useSession();
  if (status === "anonymous") return <Redirect href="/welcome" />;
  if (!profile) return <Redirect href="/profile-setup" />;
  return (
    <DraftProvider>
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />
    </DraftProvider>
  );
}
