import "@walletconnect/react-native-compat";
import { createAppKit } from "@reown/appkit-react-native";
import { WagmiAdapter } from "@reown/appkit-wagmi-react-native";
import { sepolia } from "wagmi/chains";
import { APP_SCHEME, REOWN_PROJECT_ID } from "../config";
import { walletStorage } from "./storage";

export const wagmiAdapter = new WagmiAdapter({ projectId: REOWN_PROJECT_ID, networks: [sepolia] });

export const appKit = createAppKit({
  projectId: REOWN_PROJECT_ID,
  networks: [sepolia],
  defaultNetwork: sepolia,
  adapters: [wagmiAdapter],
  storage: walletStorage,
  metadata: {
    name: "Junquero",
    description: "Changas con pago en garantía",
    url: "https://junquero.app",
    icons: ["https://junquero.app/icon.png"],
    redirect: { native: `${APP_SCHEME}://` },
  },
});
