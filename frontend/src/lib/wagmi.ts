import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arbitrumSepolia } from "wagmi/chains";
import { http } from "wagmi";
import { RPC_URL } from "./contracts";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
  // RainbowKit refuses to build without a project id; this placeholder lets
  // the dev server boot, but real wallets will require a real one.
  "00000000000000000000000000000000";

export const wagmiConfig = getDefaultConfig({
  appName: "Confidential AI Yield Fortress",
  projectId,
  chains: [arbitrumSepolia],
  transports: {
    [arbitrumSepolia.id]: http(RPC_URL),
  },
  ssr: true,
});
