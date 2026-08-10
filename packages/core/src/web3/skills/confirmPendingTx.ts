import { txManager } from '../../agent/transactionManager';
import { executeTransfer } from './transfer';
import { executeSwap } from './swapToken';
import { executeBridge } from './bridgeToken';
import { executeMintNft } from './mintNft';
import { executeCustomTx } from './customTx';
import { executeApprove, executeAaveSupply, executeVaultDeposit, executeUniv3Mint } from './executeDefi';
import { executeRevokeApproval } from './revokeApprovals';
import { checkRegistryStatus } from './checkRegistryStatus';
import { formatTransactionSuccess, formatTransactionError } from '../../utils/formatter';

export async function confirmPendingTx(action: "approve" | "reject"): Promise<string> {
  const pending = txManager.getPending();
  if (pending.length === 0) {
    return "There are no pending transactions to confirm.";
  }

  // Get the most recent pending transaction
  const tx = pending[pending.length - 1];
  const txId = tx.id;

  if (action === 'reject') {
    txManager.updateStatus(txId, 'rejected', "User rejected the transaction via conversational prompt.");
    return `Transaction ${txId} (${tx.type}) has been successfully cancelled and rejected.`;
  }

  try {
    // --- Arbitrum Registry Kill-Switch Interceptor ---
    const registryCheck = await checkRegistryStatus();
    if (!registryCheck.isActive) {
      txManager.updateStatus(txId, 'failed', registryCheck.reason);
      return `Transaction blocked by on-chain Kill-Switch: ${registryCheck.reason}`;
    }
    // ------------------------------------------------

    let result = '';
    if (tx.type === 'transfer') {
      result = await executeTransfer(tx.chainName as any, tx.details, true);
    } else if (tx.type === 'swap') {
      result = await executeSwap(tx.chainName as any, tx.details, true);
    } else if (tx.type === 'bridge') {
      result = await executeBridge(tx.chainName as any, tx.details, true);
    } else if (tx.type === 'mint') {
      result = await executeMintNft(tx.chainName as any, tx.details, true);
    } else if (tx.type === 'custom') {
      result = await executeCustomTx(tx.chainName as any, tx.details, true);
    } else if (tx.type === 'approve') {
      result = await executeApprove(tx.chainName as any, tx.details);
    } else if (tx.type === 'aaveSupply') {
      result = await executeAaveSupply(tx.chainName as any, tx.details);
    } else if (tx.type === 'vaultDeposit') {
      result = await executeVaultDeposit(tx.chainName as any, tx.details);
    } else if (tx.type === 'univ3Mint') {
      result = await executeUniv3Mint(tx.chainName as any, tx.details);
    } else if (tx.type === 'revokeApproval') {
      result = await executeRevokeApproval(tx.chainName as any, tx.details, true);

    } else if (tx.type === 'limit_order') {
      // Need dynamic import for logger to avoid circular dependency
      const { logger } = await import('../../agent/reasoning');
      const success = logger.activateLimitOrder(tx.details.orderId);
      if (success) {
        result = `Limit Order ${tx.details.orderId} is now ACTIVE. The Event-Driven Engine is monitoring the market.`;
      } else {
        throw new Error(`Failed to activate Limit Order. ID not found in database.`);
      }
    }
    
    txManager.updateStatus(txId, 'executed', result);
    return `Transaction ${txId} (${tx.type}) successfully executed on-chain. Result: ${result}`;

  } catch (error: any) {
    txManager.updateStatus(txId, 'failed', error.message);
    return `Failed to execute transaction ${txId}: ${error.message}`;
  }
}

export const confirmPendingTxToolDefinition = {
  type: "function",
  function: {
    name: "confirm_pending_tx",
    description: "Approve or reject a pending transaction. Use this tool when a transaction has been queued and the user replies with a confirmation (like 'Yes' or 'Ya') or a rejection (like 'No' or 'Tidak'). CRITICAL RULE: DO NOT call any other tool (like write_local_file) simultaneously with this one. Output ONLY this tool.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["approve", "reject"],
          description: "Whether to approve (execute) or reject (cancel) the transaction."
        }
      },
      required: ["action"]
    }
  }
};
