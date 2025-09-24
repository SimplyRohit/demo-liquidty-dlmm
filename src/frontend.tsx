import { createRoot } from 'react-dom/client';
import { useEffect, useState, useCallback } from 'react';
import { Transaction, Keypair } from '@solana/web3.js';
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
  generatedKeypairs?: {
    [key: string]: string;
  };
}

interface TransactionData {
  transactions: TransactionBundle[];
  totalTransactions: number;
  poolAddress: string;
  userId: string;
  chatId: string;
}

function TransactionSigner() {
  const { connection } = useConnection();
  const { connected, disconnect, publicKey, connecting, signTransaction } =
    useWallet();
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
      let simplifiedError = 'Transaction failed';

      if (result.errorMessage) {
        const lines = result.errorMessage.split('\n');
        const meaningfulLine = lines.find((line) =>
          /already in use|insufficient funds|node is behind|failed/i.test(line),
        );

        if (meaningfulLine) {
          simplifiedError = meaningfulLine
            .replace(/program log:\s*/i, '')
            .trim();
        }
      }

      const response = await fetch('/webhook/transaction-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...result, errorMessage: simplifiedError }),
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

        try {
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

            await sendResultToBot({
              status: true,
              txId: txHash,
              poolAddress: transactionData.poolAddress,
              userId: transactionData.userId,
              chatId: transactionData.chatId,
              transactionType: bundle!.type,
            });
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

            await sendResultToBot({
              status: true,
              txId: txHash,
              poolAddress: transactionData.poolAddress,
              userId: transactionData.userId,
              chatId: transactionData.chatId,
              transactionType: bundle!.type,
            });
          }
        } catch (err) {
          console.error('Transaction failed:', err);
          const errorMessage =
            (err as Error)?.message || 'Transaction processing failed';

          setStatus(`Transaction ${i + 1} failed: ${errorMessage}`);

          await sendResultToBot({
            status: false,
            errorMessage,
            poolAddress: transactionData.poolAddress,
            userId: transactionData.userId,
            chatId: transactionData.chatId,
            transactionType: bundle?.type,
          });

          break;
        }

        if (i < transactionData.transactions.length - 1) {
          currentBlockhash = await connection.getLatestBlockhash();
        }
      }

      setStatus(`Transaction processing complete.`);
    } catch (err) {
      console.error('Unexpected error:', err);
      setStatus('Unexpected processing error');
    }
  };

  return (
    <div className="w-screen min-h-screen overflow-hidden text-center text-white flex flex-col items-center justify-center bg-[#1F1F1F] p-4">
      <div className="w-full max-w-md break-words">
        <h1 className="text-2xl md:text-3xl text-white font-bold mb-4">
          Saros DLMM Transaction Signer
        </h1>

        {transactionData && (
          <>
            <p className="my-1 text-sm md:text-base">
              <span className="font-mono text-white">Pool:</span>{' '}
              <span className="break-all">{transactionData.poolAddress}</span>
            </p>
            <p className="my-1 text-sm md:text-base">
              <span className="font-mono text-white">Transactions:</span>{' '}
              {transactionData.transactions.length}
            </p>
          </>
        )}

        <p className="my-1 text-sm md:text-base">
          <span className="font-mono text-white">Status:</span> {status}
        </p>
      </div>

      <div className="flex flex-col gap-4 mt-5 items-center w-full max-w-xs">
        <button
          className={`bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded font-semibold w-full ${connecting ? 'opacity-50' : ''}`}
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
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-mono w-full transition-colors"
          >
            Sign {transactionData.transactions.length} Transaction
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
