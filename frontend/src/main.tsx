import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { WalletError } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";

createRoot(document.getElementById("root")!).render(
  <ConnectionProvider endpoint="https://api.devnet.solana.com">
    <WalletProvider
      wallets={[]}
      onError={(error: WalletError) => console.log(error)}
      autoConnect={true}
    >
      <WalletModalProvider>
        <App />
      </WalletModalProvider>
    </WalletProvider>
  </ConnectionProvider>
);
