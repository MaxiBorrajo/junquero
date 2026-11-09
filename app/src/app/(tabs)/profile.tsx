import { router } from "expo-router";
import { useAppKit } from "@reown/appkit-react-native";
import { Body, Button, Screen, Title } from "../../components/ui";
import { useSession } from "../../session/SessionProvider";

export default function Profile() {
  const { profile, address, signOut } = useSession();
  const { disconnect } = useAppKit();
  const leave = async () => {
    try {
      await disconnect();
    } catch {}
    await signOut();
    router.replace("/welcome");
  };
  return (
    <Screen footer={address ? <Button label="Cerrar sesión" variant="ghost" onPress={leave} /> : <Button label="Ingresar" onPress={() => router.push("/connect")} />}>
      <Title>{profile?.name ?? "Perfil"}</Title>
      <Body>{address ?? "Todavía no ingresaste."}</Body>
    </Screen>
  );
}
