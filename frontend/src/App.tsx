import React, { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";

const App: React.FC = () => {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [unsignedTx, setUnsignedTx] = useState<Transaction | null>(null);
  const [status, setStatus] = useState<string>("");
  const [poolAddress, setPoolAddress] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [chatId, setChatId] = useState<string>("");

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
        let cleanTx = decodeURIComponent(rawTx.trim());
        cleanTx = cleanTx.replace(/ /g, "+");
        const txBytes = Buffer.from(cleanTx, "base64");
        const tx = Transaction.from(txBytes);
        setUnsignedTx(tx);
        setStatus("Unsigned transaction loaded. Ready to sign.");
      } catch (e) {
        console.error("Error parsing transaction:", e);
        setStatus("❌ Failed to parse transaction.");
        sendResultToBot({
          success: false,
          error: "Failed to parse transaction",
          poolAddress: pool || "",
          userId: user || "",
          chatId: chat || "",
        });
      }
    }
  }, []);

  const sendResultToBot = async (result: {
    success: boolean;
    txId?: string;
    error?: string;
    poolAddress: string;
    userId: string;
    chatId: string;
  }) => {
    try {
      console.log("Sending result to bot:", result);

      const response = await fetch("http://localhost:3001/webhook/transaction-result", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(result),
      });

      if (!response.ok) {
        console.error("Failed to notify bot:", await response.text());
      }
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

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(txid, "confirmed");

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      setStatus(`✅ Transaction confirmed! TxID: ${txid}`);

      // Send success result to bot
      await sendResultToBot({
        success: true,
        txId: txid,
        poolAddress,
        userId,
        chatId,
      });

      // Optional: Auto-redirect back to Telegram after success
      setTimeout(() => {
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.close();
        } else {
          window.close();
        }
      }, 3000);

    } catch (err: any) {
      console.error("Transaction failed:", err);

      let errorMessage = "Transaction failed";
      if (err.logs) {
        console.error("Transaction logs:", err.logs);
        errorMessage = err.logs.join("\n").substring(0, 200);
      } else if (err.message) {
        errorMessage = err.message;
      }

      setStatus(`❌ ${errorMessage}`);

      // Try simulation for more details
      try {
        const sim = await connection.simulateTransaction(unsignedTx);
        console.error("Simulation result:", sim);
        if (sim.value.err) {
          errorMessage = JSON.stringify(sim.value.err);
        }
      } catch (simErr) {
        console.error("Simulation also failed:", simErr);
      }

      // Send error result to bot
      await sendResultToBot({
        success: false,
        error: errorMessage,
        poolAddress,
        userId,
        chatId,
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 to-blue-900 text-white p-6">
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">
          Saros DLMM Transaction Signer
        </h1>

        <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Transaction Details</h2>

          {poolAddress && (
            <div className="mb-3">
              <span className="text-gray-300">Pool:</span>
              <div className="font-mono text-sm break-all mt-1">
                {poolAddress}
              </div>
            </div>
          )}

          <div className="mb-4">
            <span className="text-gray-300">Status:</span>
            <div className="mt-1 font-medium">{status}</div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700" />

          {publicKey && unsignedTx && (
            <button
              onClick={handleSignAndSend}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              Sign & Send Transaction
            </button>
          )}
        </div>

        {publicKey && (
          <div className="mt-4 text-center text-sm text-gray-300">
            Connected: {publicKey.toString().slice(0, 8)}...
            {publicKey.toString().slice(-4)}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;