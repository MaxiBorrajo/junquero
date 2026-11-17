import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";

// Solo lecturas y recibos. El RPC de WalletConnect que usa el adaptador por defecto rechaza la autenticación,
// así que las lecturas de la cadena van por un RPC público propio. La firma sigue usando wagmiAdapter.wagmiConfig.
export const SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

export const publicConfig = createConfig({
  chains: [sepolia],
  multiInjectedProviderDiscovery: false,
  transports: { [sepolia.id]: http(SEPOLIA_RPC_URL) },
});
