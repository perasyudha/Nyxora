import { normalizeChainName } from '../utils/chains';
import { ChainName, SUPPORTED_CHAIN_NAMES } from '../config';

/**
 * Simulates fetching the best bridge route across multiple liquidity networks
 * (e.g., Stargate, Across, Hop, Orbiter).
 */
export async function findBestBridgeRoute(
  fromChain: ChainName,
  toChain: ChainName,
  tokenSymbol: string,
  amount: string
): Promise<string> {
  try {
    fromChain = normalizeChainName(fromChain);
    toChain = normalizeChainName(toChain);
    tokenSymbol = tokenSymbol.toUpperCase();

    // In a real scenario, this would query Socket/Bungee or 1inch APIs.
    // For now, we simulate an optimization engine.
    const simulatedBridges = [
      { name: "Across", feeUsd: 1.5, timeMin: 2, slippage: 0.1 },
      { name: "Stargate", feeUsd: 2.1, timeMin: 5, slippage: 0.05 },
      { name: "Orbiter", feeUsd: 1.2, timeMin: 1, slippage: 0.3 }
    ];

    // Sort by a combination of fee and time (dummy logic)
    simulatedBridges.sort((a, b) => (a.feeUsd + a.timeMin) - (b.feeUsd + b.timeMin));

    const best = simulatedBridges[0];

    let result = `🌉 **Best Bridge Route Found:**\n`;
    result += `- **Route:** ${fromChain.toUpperCase()} ➡️ ${toChain.toUpperCase()}\n`;
    result += `- **Token:** ${amount} ${tokenSymbol}\n`;
    result += `- **Recommended Protocol:** ${best.name}\n`;
    result += `- **Estimated Fee:** ~$${best.feeUsd}\n`;
    result += `- **Estimated Time:** ~${best.timeMin} minutes\n`;
    result += `- **Slippage:** ${best.slippage}%\n\n`;
    result += `*Note: To execute this, use the standard bridge tool specifying '${best.name}' as the provider.*`;

    return result;
  } catch (error: any) {
    return `Failed to find bridge route: ${error.message}`;
  }
}

export const findBestBridgeRouteToolDefinition = {
  type: "function",
  function: {
    name: "find_best_bridge_route",
    description: "Finds the cheapest and fastest cross-chain bridge route.",
    parameters: {
      type: "object",
      properties: {
        fromChain: { type: "string", enum: SUPPORTED_CHAIN_NAMES },
        toChain: { type: "string", enum: SUPPORTED_CHAIN_NAMES },
        tokenSymbol: { type: "string", description: "Symbol of the token to bridge (e.g. ETH, USDC)" },
        amount: { type: "string", description: "Amount of token to bridge" }
      },
      required: ["fromChain", "toChain", "tokenSymbol", "amount"],
    },
  },
};
