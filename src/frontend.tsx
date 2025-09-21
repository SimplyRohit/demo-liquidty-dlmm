import { createRoot } from "react-dom/client";
import { useEffect, useState, useCallback } from "react";
import { Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import {
  WalletModalProvider,
  useWalletModal,
} from "@solana/wallet-adapter-react-ui";

function TransactionSigner() {
  const { connection } = useConnection();
  const {
    connected,
    disconnect,
    publicKey,
    connecting,
    signTransaction,
  } = useWallet();
  const { setVisible } = useWalletModal();

  const [unsignedTx, setUnsignedTx] = useState<Transaction | null>(null);
  const [status, setStatus] = useState("");
  const [poolAddress, setPoolAddress] = useState("");
  const [userId, setUserId] = useState("");
  const [chatId, setChatId] = useState("");

  const handleClick = useCallback(async () => {
    if (connected) {
      await disconnect();
    } else {
      await setVisible(true);
    }
  }, [connected, disconnect, setVisible]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawTx = params.get("tx");
    const pool = params.get("pool");
    const user = params.get("userId");
    const chat = params.get("chatId");

    if (pool) setPoolAddress(pool);
    if (user) setUserId(user);
    if (chat) setChatId(chat);

    if (rawTx) {
      try {
        let cleanTx = decodeURIComponent(rawTx.trim()).replace(/ /g, "+");
        const txBytes = Buffer.from(cleanTx, "base64");
        const tx = Transaction.from(txBytes);
        setUnsignedTx(tx);
        setStatus("Unsigned transaction loaded. Ready to sign.");
      } catch (e) {
        console.error("Error parsing transaction:", e);
        setStatus("❌ Failed to parse transaction.");
        sendResultToBot({
          status: false,
          errorMessage: "Failed to parse transaction",
          poolAddress: pool || "",
          userId: user || "",
          chatId: chat || "",
        });
      }
    }
  }, []);

  const sendResultToBot = async (result: {
    status: boolean;
    txId?: string;
    errorMessage?: string;
    poolAddress: string;
    userId: string;
    chatId: string;
  }) => {
    try {
      const response = await fetch("/webhook/transaction-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!response.ok)
        console.error("Failed to notify bot:", await response.text());
    } catch (err) {
      console.error("Error sending result to bot:", err);
    }
  };

  const handleSignAndSend = async () => {
    if (!publicKey || !signTransaction) {
      setStatus("❌ Connect wallet first.");
      return;
    }
    if (!unsignedTx) {
      setStatus("❌ No transaction found in URL.");
      return;
    }

    try {
      setStatus("⏳ Signing transaction...");
      const latest = await connection.getLatestBlockhash();
      unsignedTx.recentBlockhash = latest.blockhash;
      unsignedTx.feePayer = unsignedTx.feePayer || publicKey;
      const signedTx = await signTransaction(unsignedTx);
      setStatus("⏳ Sending transaction to network...");
      const txid = await connection.sendRawTransaction(signedTx.serialize());
      setStatus(`⏳ Transaction sent. Confirming... TxID: ${txid}`);
      const confirmation = await connection.confirmTransaction(
        txid,
        "confirmed"
      );
      if (confirmation.value.err)
        throw new Error(JSON.stringify(confirmation.value.err));
      setStatus(`✅ Transaction confirmed! TxID: ${txid}`);
      await sendResultToBot({
        status: true,
        txId: txid,
        poolAddress,
        userId,
        chatId,
      });
    } catch (err) {
      console.error("Transaction failed:", err);
      let errorMessage = err?.message || "Transaction failed";
      setStatus(`❌ ${errorMessage}`);
      await sendResultToBot({
        status: false,
        errorMessage,
        poolAddress,
        userId,
        chatId,
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#212121] text-white flex flex-col justify-center items-center p-6 gap-6">
      <div className="bg-white/10 rounded-lg p-6 w-full max-w-md text-center">
        <h1 className="text-3xl font-bold mb-4">
          Saros DLMM Transaction Signer
        </h1>

        {poolAddress && (
          <p className="mb-2">
            <span className="font-semibold text-gray-300">Pool:</span>{" "}
            {poolAddress}
          </p>
        )}
        <p>
          <span className="font-semibold text-gray-300">Status:</span> {status}
        </p>
      </div>

      <div className="flex flex-col gap-4 items-center">
        <button
          className={`bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded font-semibold ${
            connecting ? "opacity-50" : ""
          }`}
          onClick={handleClick}
          disabled={connecting}
        >
          {connected && publicKey
            ? `${publicKey
                .toBase58()
                .slice(0, 4)}..${publicKey.toBase58().slice(-4)} (Disconnect)`
            : connecting
            ? "Connecting..."
            : "Connect Wallet"}
        </button>

        {publicKey && unsignedTx && (
          <button
            onClick={handleSignAndSend}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Sign & Send Transaction
          </button>
        )}
      </div>
    </div>
  );
}

function start() {
  const root = createRoot(document.getElementById("root")!);
  root.render(
    <ConnectionProvider endpoint="https://api.devnet.solana.com">
      <WalletProvider wallets={[]} autoConnect onError={(e) => console.log(e)}>
        <WalletModalProvider className="fixed inset-0 z-20 flex items-center justify-center bg-black text-white">
          <TransactionSigner />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
