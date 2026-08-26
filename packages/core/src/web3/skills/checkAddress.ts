import { normalizeChainName } from '../utils/chains';
import { isAddress } from 'viem';
import { getPublicClient, ChainName, SUPPORTED_CHAIN_NAMES, getAddress } from '../config';

export async function checkAddress(chainName: ChainName, address: string): Promise<string> {
  try {
    // If no address provided, return the agent's own address directly
    if (!address || !address.trim()) {
      const myAddress = await getAddress();
      if (!myAddress) return "Error: Could not retrieve agent's wallet address from keystore.";
      return `Agent Wallet Address: ${myAddress}`;
    }

    chainName = normalizeChainName(chainName);
    if (!isAddress(address)) {
      return `Address validation failed: '${address}' is not a valid Web3 address format.`;
    }

    const client = getPublicClient(chainName);
    
    // Check if the address has bytecode (which means it's a Smart Contract)
    const bytecode = await client.getBytecode({ address: address as `0x${string}` });
    
    // Also get the balance just for additional info
    const balanceWei = await client.getBalance({ address: address as `0x${string}` });
    
    let result = `Address: ${address}\n`;
    result += `Status: Valid Format\n`;
    
    if (bytecode && bytecode !== '0x') {
      result += `Type: Smart Contract\n`;
    } else {
      result += `Type: EOA (Externally Owned Account / Standard Wallet)\n`;
    }
    
    return result;
  } catch (error: any) {
    return `Failed to check address: ${error.message}`;
  }
}

export const checkAddressToolDefinition = {
  type: "function",
  function: {
    name: "check_address",
    description: "Validate a Web3 address and determine if it is an EOA (standard wallet) or a Smart Contract. If no address is provided, returns the agent's own wallet address.",
    parameters: {
      type: "object",
      properties: {
        chainName: {
          type: "string",
          enum: SUPPORTED_CHAIN_NAMES,
          description: "The name of the blockchain to check the address on. Defaults to ethereum if not specified."
        },
        address: {
          type: "string",
          description: "The 0x... address to check. If omitted, returns the agent's own wallet address."
        }
      },
      required: []
    }
  }
};
