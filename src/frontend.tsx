import { createRoot } from 'react-dom/client';
import { useEffect, useState, useCallback } from 'react';
import { Transaction, PublicKey, Keypair } from '@solana/web3.js';
import { Buffer } from 'buffer';
import bs58 from 'bs58';
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from '@solana/wallet-adapter-react';
import {
  WalletModalProvider,
  useWalletModal,
} from '@solana/wallet-adapter-react-ui';

interface TransactionBundle {
  transaction: string;
  type: 'initial' | 'createPosition' | 'addLiquidity';
  requiredSigners?: string[];
}

interface TransactionData {
  transactions: TransactionBundle[];
  generatedKeypairs: { [key: string]: string };
  poolAddress: string;
  userId: string;
  chatId: string;
  metadata: {
    baseAmount: number;
    quoteAmount: number;
    binRange: [number, number];
    activeBin: number;
    totalTransactions: number;
    hasExistingPosition: boolean;
  };
}

function TransactionSigner() {
  const { connection } = useConnection();
  const {
    connected,
    disconnect,
    publicKey,
    connecting,
    signTransaction,
    signAllTransactions,
  } = useWallet();
  const { setVisible } = useWalletModal();

  const [transactionData, setTransactionData] =
    useState<TransactionData | null>(null);
  const [status, setStatus] = useState('');
  const [currentTxIndex, setCurrentTxIndex] = useState(0);

  const handleClick = useCallback(async () => {
    if (connected) {
      await disconnect();
    } else {
      await setVisible(true);
    }
  }, [connected, disconnect, setVisible]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const rawTx = params.get('tx');
    if (rawTx) {
      handleSingleTransaction(rawTx, params);
      return;
    }

    const encodedData = params.get('data');
    if (encodedData) {
      try {
        const decodedData = JSON.parse(
          Buffer.from(encodedData, 'base64').toString(),
        ) as TransactionData;
        setTransactionData(decodedData);
        setStatus(
          `Ready to process ${decodedData.transactions.length} transaction${decodedData.transactions.length > 1 ? 's' : ''}`,
        );
      } catch (e) {
        console.error('Error parsing transaction data:', e);
        setStatus('Failed to parse transaction data');
        sendResultToBot({
          status: false,
          errorMessage: 'Failed to parse transaction data',
          poolAddress: '',
          userId: '',
          chatId: '',
        });
      }
    }
  }, []);

  const handleSingleTransaction = (rawTx: string, params: URLSearchParams) => {
    const pool = params.get('pool') || '';
    const user = params.get('userId') || '';
    const chat = params.get('chatId') || '';

    try {
      let cleanTx = decodeURIComponent(rawTx.trim()).replace(/ /g, '+');
      const txBytes = Buffer.from(cleanTx, 'base64');
      const tx = Transaction.from(txBytes);

      setTransactionData({
        transactions: [
          {
            transaction: cleanTx,
            type: 'addLiquidity',
          },
        ],
        generatedKeypairs: {},
        poolAddress: pool,
        userId: user,
        chatId: chat,
        metadata: {
          baseAmount: 0,
          quoteAmount: 0,
          binRange: [0, 0],
          activeBin: 0,
          totalTransactions: 1,
          hasExistingPosition: true,
        },
      });

      setStatus('Single transaction loaded. Ready to sign.');
    } catch (e) {
      console.error('Error parsing transaction:', e);
      setStatus('Failed to parse transaction');
      sendResultToBot({
        status: false,
        errorMessage: 'Failed to parse transaction',
        poolAddress: pool,
        userId: user,
        chatId: chat,
      });
    }
  };

  const sendResultToBot = async (result: {
    status: boolean;
    txId?: string;
    errorMessage?: string;
    poolAddress: string;
    userId: string;
    chatId: string;
    allTransactionHashes?: string[];
    transactionType?: string;
  }) => {
    try {
      const response = await fetch('/webhook/transaction-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      if (!response.ok) {
        console.error('Failed to notify bot:', await response.text());
      }
    } catch (err) {
      console.error('Error sending result to bot:', err);
    }
  };

  const processTransactions = async () => {
    if (!publicKey || !signTransaction || !transactionData) {
      setStatus('Connect wallet first or no transactions found');
      return;
    }

    const results: string[] = [];
    let currentBlockhash = await connection.getLatestBlockhash();

    try {
      for (let i = 0; i < transactionData.transactions.length; i++) {
        const bundle = transactionData.transactions[i];
        setCurrentTxIndex(i + 1);

        setStatus(
          `Processing transaction ${i + 1}/${transactionData.transactions.length} (${bundle!.type})...`,
        );

        const tx = Transaction.from(Buffer.from(bundle!.transaction, 'base64'));

        tx.recentBlockhash = currentBlockhash.blockhash;
        tx.feePayer = tx.feePayer || publicKey;

        if (
          bundle!.type === 'createPosition' &&
          bundle!.requiredSigners &&
          bundle!.requiredSigners.length > 0
        ) {
          setStatus(`Signing position creation transaction ${i + 1}...`);

          const signedTx = await signTransaction(tx);

          for (const signerPrivateKey of bundle!.requiredSigners) {
            const positionKeypair = Keypair.fromSecretKey(
              bs58.decode(signerPrivateKey),
            );
            signedTx.partialSign(positionKeypair);
          }

          setStatus(`Sending position creation transaction ${i + 1}...`);
          const txHash = await connection.sendRawTransaction(
            signedTx.serialize(),
            {
              skipPreflight: false,
              preflightCommitment: 'confirmed',
            },
          );

          setStatus(`Confirming transaction ${i + 1}...`);
          await connection.confirmTransaction(
            {
              signature: txHash,
              blockhash: currentBlockhash.blockhash,
              lastValidBlockHeight: currentBlockhash.lastValidBlockHeight,
            },
            'confirmed',
          );

          results.push(txHash);
        } else {
          setStatus(`Signing transaction ${i + 1}...`);
          const signedTx = await signTransaction(tx);

          setStatus(`Sending transaction ${i + 1}...`);
          const txHash = await connection.sendRawTransaction(
            signedTx.serialize(),
            {
              skipPreflight: false,
              preflightCommitment: 'confirmed',
            },
          );

          setStatus(`Confirming transaction ${i + 1}...`);
          await connection.confirmTransaction(
            {
              signature: txHash,
              blockhash: currentBlockhash.blockhash,
              lastValidBlockHeight: currentBlockhash.lastValidBlockHeight,
            },
            'confirmed',
          );

          results.push(txHash);
        }

        if (i < transactionData.transactions.length - 1) {
          currentBlockhash = await connection.getLatestBlockhash();
        }
      }

      setStatus(`All ${results.length} transactions completed successfully!`);

      await sendResultToBot({
        status: true,
        txId: results[results.length - 1],
        allTransactionHashes: results,
        poolAddress: transactionData.poolAddress,
        userId: transactionData.userId,
        chatId: transactionData.chatId,
        transactionType: 'add_liquidity',
      });
    } catch (err) {
      console.error('Transaction failed:', err);
      const errorMessage =
        (err as Error)?.message || 'Transaction processing failed';
      setStatus(`Transaction ${currentTxIndex} failed: ${errorMessage}`);

      await sendResultToBot({
        status: false,
        errorMessage,
        poolAddress: transactionData.poolAddress,
        userId: transactionData.userId,
        chatId: transactionData.chatId,
        transactionType: 'add_liquidity',
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#212121] text-white flex flex-col justify-center items-center p-6 gap-6">
      <div className="bg-white/10 rounded-lg p-6 w-full max-w-md text-center">
        <h1 className="text-3xl font-bold mb-4">
          Saros DLMM Transaction Signer
        </h1>

        {transactionData && (
          <>
            <p className="mb-2">
              <span className="font-semibold text-gray-300">Pool:</span>{' '}
              {transactionData.poolAddress}
            </p>
            {transactionData.metadata.hasExistingPosition ? (
              <p className="mb-2 text-green-400">Adding to existing position</p>
            ) : (
              <p className="mb-2 text-blue-400">Creating new position</p>
            )}
            <p className="mb-2">
              <span className="font-semibold text-gray-300">Transactions:</span>{' '}
              {transactionData.transactions.length}
            </p>
            <p className="mb-2">
              <span className="font-semibold text-gray-300">Range:</span> [
              {transactionData.metadata.binRange[0]},{' '}
              {transactionData.metadata.binRange[1]}]
            </p>
          </>
        )}

        <p className="mt-4">
          <span className="font-semibold text-gray-300">Status:</span> {status}
        </p>
      </div>

      <div className="flex flex-col gap-4 items-center">
        <button
          className={`bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded font-semibold ${connecting ? 'opacity-50' : ''}`}
          onClick={handleClick}
          disabled={connecting}
        >
          {connected && publicKey
            ? `${publicKey.toBase58().slice(0, 4)}..${publicKey.toBase58().slice(-4)} (Disconnect)`
            : connecting
              ? 'Connecting...'
              : 'Connect Wallet'}
        </button>

        {publicKey && transactionData && (
          <button
            onClick={processTransactions}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Sign & Execute {transactionData.transactions.length} Transaction
            {transactionData.transactions.length > 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  );
}

function start() {
  const root = createRoot(document.getElementById('root')!);
  root.render(
    <ConnectionProvider endpoint="https://api.devnet.solana.com">
      <WalletProvider wallets={[]} autoConnect onError={(e) => console.log(e)}>
        <WalletModalProvider className="fixed inset-0 z-20 flex items-center justify-center bg-black text-white">
          <TransactionSigner />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>,
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
