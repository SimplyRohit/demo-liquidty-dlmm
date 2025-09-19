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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawTx = params.get("unsignedtransaction");

    if (rawTx) {
      try {
        let cleanTx = decodeURIComponent(rawTx.trim());
        cleanTx = cleanTx.replace(/ /g, "+");

        const txBytes = Buffer.from(cleanTx, "base64");
        const tx = Transaction.from(txBytes);
        setUnsignedTx(tx);
        setStatus("Unsigned transaction (base64) loaded.");
      } catch (e) {
        console.error("Error parsing transaction:", e);
        setStatus("❌ Failed to parse transaction.");
      }
    }
  }, []);

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
      const latest = await connection.getLatestBlockhash();
      unsignedTx.recentBlockhash = latest.blockhash;
      unsignedTx.feePayer = unsignedTx.feePayer || publicKey;

      const signedTx = await signTransaction(unsignedTx);

      const txid = await connection.sendRawTransaction(signedTx.serialize());
      setStatus(`✅ Transaction sent. TxID: ${txid}`);
    } catch (err) {
      console.error("Send failed", err);

      if (err.logs) {
        setStatus("❌ Failed. See logs in console.");
        console.error("Transaction logs:", err.logs);
      } else {
        try {
          const sim = await connection.simulateTransaction(unsignedTx!);
          setStatus("❌ Simulation failed. Check console logs.");
          console.error("Simulation result:", sim);
        } catch (simErr) {
          setStatus("❌ Both send and simulate failed.");
          console.error("Simulation also failed", simErr);
        }
      }
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Unsigned Transaction Signer</h1>
      <WalletMultiButton />
      <div className="mt-4">
        <button
          onClick={handleSignAndSend}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Sign & Send Transaction
        </button>
      </div>
      {status && <p className="mt-3">{status}</p>}
    </div>
  );
};

export default App;
