import { getPublicClient } from '../config';
import { getAddress } from '../config';

const REGISTRY_ADDRESS = '0x19F00Ac093B6b0a6Ae2f669dF698384ba79E37Be';
const BLOCKSCOUT_LINK = `https://base-sepolia.blockscout.com/address/${REGISTRY_ADDRESS}?tab=write_contract`;

const REGISTRY_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "registeredAgents",
    "outputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "address",
        "name": "controllerWallet",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "isActive",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "registeredAt",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

/**
 * Checks the on-chain registry status of the AI agent on Base Sepolia.
 *
 * Kill-Switch semantics:
 * - NOT registered (registeredAt === 0): Agent is allowed to operate. The registry
 *   is opt-in — only agents that have explicitly registered can be kill-switched.
 * - Registered + isActive === true: Allowed.
 * - Registered + isActive === false: BLOCKED. This is the intentional kill-switch case.
 * - Network error: Fail-open with a warning. A transient RPC error should not
 *   permanently block all user transactions.
 */
export async function checkRegistryStatus(): Promise<{ isActive: boolean; reason?: string; registrationGuide?: string }> {
  try {
    const userAddress = await getAddress();
    
    // Always use base_sepolia for the registry check
    const publicClient = getPublicClient('base_sepolia');
    
    const result = await publicClient.readContract({
      address: REGISTRY_ADDRESS,
      abi: REGISTRY_ABI,
      functionName: 'registeredAgents',
      args: [userAddress as `0x${string}`]
    } as any) as [string, string, boolean, bigint];

    const [name, controllerWallet, isActive, registeredAt] = result;

    // Agent has never registered — kill-switch is opt-in, transactions are allowed.
    if (registeredAt === 0n) {
      return {
        isActive: true,
        reason: 'Agent is not yet registered on the Kill Switch Registry (this is optional — transactions proceed normally).',
        registrationGuide: [
          `To register the Kill Switch for agent wallet ${userAddress}:`,
          `1. Open the registry contract on Blockscout: ${BLOCKSCOUT_LINK}`,
          `2. Connect your controller wallet (e.g. MetaMask) on Base Sepolia network`,
          `3. Find the "registerAgent" function and enter any name (e.g. "MyNyxoraAgent")`,
          `4. Click "Write" and confirm the transaction — gas is minimal (~$0.01 on Base Sepolia)`,
          `5. Once confirmed, your agent is registered. You can then deactivate it anytime via "toggleAgentStatus(false)"`,
          `Registry contract: ${REGISTRY_ADDRESS} (Base Sepolia)`
        ].join('\n')
      };
    }

    // Agent is registered but explicitly deactivated — this is the kill-switch trigger.
    if (!isActive) {
      return {
        isActive: false,
        reason: `Agent "${name}" has been deactivated by controller wallet (${controllerWallet}) on Base Sepolia Registry. All transactions are blocked.`,
        registrationGuide: [
          `To re-activate the agent:`,
          `1. Open: ${BLOCKSCOUT_LINK}`,
          `2. Connect the controller wallet: ${controllerWallet}`,
          `3. Call "toggleAgentStatus(true)" and confirm the transaction`,
          `Registry contract: ${REGISTRY_ADDRESS} (Base Sepolia)`
        ].join('\n')
      };
    }

    return {
      isActive: true,
      reason: `Agent "${name}" is active and verified on-chain. Controller: ${controllerWallet}`
    };
    
  } catch (error: any) {
    // Fail-open on network/RPC error: a transient error should not block user transactions.
    console.warn('[Registry] Kill-switch check failed (RPC error), allowing operation:', error?.message || error);
    return { isActive: true, reason: 'Registry check skipped due to network error — proceeding normally.' };
  }
}

export const checkRegistryStatusToolDefinition = {
  type: "function",
  function: {
    name: "check_registry_status",
    description: [
      "Checks the on-chain Kill Switch Registry status of this agent on Base Sepolia.",
      "IMPORTANT: Do NOT call this tool automatically before every transaction — the kill-switch check runs silently in the background.",
      "Only call this tool when the USER explicitly asks about: kill switch status, agent registration, how to register, how to deactivate, or why transactions are blocked.",
      "If the agent is not registered, the return value includes a step-by-step 'registrationGuide' — relay it to the user in full so they know exactly how to register.",
      "If the agent is deactivated, the return value explains who deactivated it and how to re-activate."
    ].join(' '),
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
};

