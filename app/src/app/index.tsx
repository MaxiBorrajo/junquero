import { Redirect } from "expo-router";
import { useSession } from "../session/SessionProvider";

export default function Entry() {
  const { status, profile } = useSession();
  if (status === "anonymous") return <Redirect href="/welcome" />;
  if (!profile) return <Redirect href="/profile-setup" />;
  if (profile.selfieStatus === "none" || profile.selfieStatus === "rejected") return <Redirect href="/selfie" />;
  return <Redirect href="/map" />;
}
