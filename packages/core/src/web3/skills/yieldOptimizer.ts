import { normalizeChainName } from '../utils/chains';
import { ChainName, SUPPORTED_CHAIN_NAMES } from '../config';

/**
 * Simulates fetching the highest yield (APY) across multiple lending protocols.
 */
export async function scanYieldFarmingOpportunities(
  chainName: ChainName,
  tokenSymbol: string
): Promise<string> {
  try {
    chainName = normalizeChainName(chainName);
    tokenSymbol = tokenSymbol.toUpperCase();

    // Simulated data
    const simulatedOpportunities = [
      { protocol: "Aave V3", apy: 4.5, risk: "Low", tvlUsd: "2.1B" },
      { protocol: "Compound V3", apy: 3.8, risk: "Low", tvlUsd: "1.5B" },
      { protocol: "Beefy Auto-Compounder", apy: 6.2, risk: "Medium", tvlUsd: "500M" }
    ];

    simulatedOpportunities.sort((a, b) => b.apy - a.apy);

    let result = `🚜 **Yield Farming Opportunities for ${tokenSymbol} on ${chainName.toUpperCase()}:**\n\n`;
    
    simulatedOpportunities.forEach((opp, i) => {
      result += `${i + 1}. **${opp.protocol}**\n`;
      result += `   - APY: ${opp.apy}%\n`;
      result += `   - Risk Level: ${opp.risk}\n`;
      result += `   - Protocol TVL: $${opp.tvlUsd}\n\n`;
    });

    result += `*Note: To deposit, use the standard DeFi vault or Aave supply tools.*`;

    return result;
  } catch (error: any) {
    return `Failed to scan yield opportunities: ${error.message}`;
  }
}

export const scanYieldToolDefinition = {
  type: "function",
  function: {
    name: "scan_yield_opportunities",
    description: "Scans for the best APY/Yield farming opportunities for a specific token.",
    parameters: {
      type: "object",
      properties: {
        chainName: { type: "string", enum: SUPPORTED_CHAIN_NAMES },
        tokenSymbol: { type: "string", description: "Symbol of the token (e.g. USDC, ETH)" }
      },
      required: ["chainName", "tokenSymbol"],
    },
  },
};
