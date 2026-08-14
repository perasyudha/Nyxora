import { normalizeChainName } from '../utils/chains';
import { parseUnits } from 'viem';
import { getPublicClient, getAddress, ChainName, SUPPORTED_CHAIN_NAMES } from '../config';
import { txManager } from '../../agent/transactionManager';
import { resolveToken, ERC20_ABI, getTokenMetadata } from '../utils/tokens';

// Uniswap V3 NonfungiblePositionManager ABI (Minting LP)
const UNIV3_POSITION_MANAGER_ABI = [
  {
    "inputs": [
      {
        "components": [
          { "internalType": "address", "name": "token0", "type": "address" },
          { "internalType": "address", "name": "token1", "type": "address" },
          { "internalType": "uint24", "name": "fee", "type": "uint24" },
          { "internalType": "int24", "name": "tickLower", "type": "int24" },
          { "internalType": "int24", "name": "tickUpper", "type": "int24" },
          { "internalType": "uint256", "name": "amount0Desired", "type": "uint256" },
          { "internalType": "uint256", "name": "amount1Desired", "type": "uint256" },
          { "internalType": "uint256", "name": "amount0Min", "type": "uint256" },
          { "internalType": "uint256", "name": "amount1Min", "type": "uint256" },
          { "internalType": "address", "name": "recipient", "type": "address" },
          { "internalType": "uint256", "name": "deadline", "type": "uint256" }
        ],
        "internalType": "struct INonfungiblePositionManager.MintParams",
        "name": "params",
        "type": "tuple"
      }
    ],
    "name": "mint",
    "outputs": [
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "uint128", "name": "liquidity", "type": "uint128" },
      { "internalType": "uint256", "name": "amount0", "type": "uint256" },
      { "internalType": "uint256", "name": "amount1", "type": "uint256" }
    ],
    "stateMutability": "payable",
    "type": "function"
  }
];

// Mappings for NonfungiblePositionManager
const POSITION_MANAGERS: Record<string, `0x${string}`> = {
  ethereum: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  arbitrum: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  optimism: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  base: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
  polygon: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  bsc: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364" // PancakeSwap V3 Position Manager
};

import { loadConfig } from '../../config/parser';
import { logger } from '../../memory/logger';

export async function prepareProvideLiquidity(
    chainName: ChainName, 
    token0AddressOrSymbol: string, 
    token1AddressOrSymbol: string, 
    amount0Str: string,
    amount1Str: string,
    feeTier: number,
    tickLower?: number,
    tickUpper?: number,
    slippagePercent?: number | "auto"
): Promise<string> {
  try {
    chainName = normalizeChainName(chainName);
    if (!chainName || !token0AddressOrSymbol || !token1AddressOrSymbol || !amount0Str || !amount1Str) throw new Error("Missing protocol/chain/token parameters for DeFi operation.");
    // Front-to-Back Slippage Architecture
    const userProfile = logger.getUserProfile();
    const maxSlippage = userProfile?.max_slippage || 1.0;
    const config = loadConfig();
    const cfgSlippage = (config.agent as any)?.default_slippage;
    
    let finalSlippage = slippagePercent;
    if (finalSlippage === undefined || finalSlippage === null || finalSlippage === "auto") {
        finalSlippage = (cfgSlippage === "auto" || !cfgSlippage) ? 0.5 : parseFloat(cfgSlippage as string);
    }
    
    if (typeof finalSlippage !== 'number' || isNaN(finalSlippage)) finalSlippage = 0.5;
    if (finalSlippage > maxSlippage) finalSlippage = maxSlippage;
    let actualSlippage = finalSlippage;

    // If ticks are not provided, default to Full Range based on tickSpacing
    let tLower = tickLower;
    let tUpper = tickUpper;

    if (tLower === undefined || tUpper === undefined) {
        const MIN_TICK = -887272;
        const MAX_TICK = 887272;
        const tickSpacing = feeTier === 100 ? 1 : feeTier === 500 ? 10 : feeTier === 3000 ? 60 : 200;
        tLower = Math.ceil(MIN_TICK / tickSpacing) * tickSpacing;
        tUpper = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;
    }

    const publicClient = getPublicClient(chainName);
    const userAddress = await getAddress();
    const account = userAddress as `0x${string}`;
    
    const positionManagerAddress = POSITION_MANAGERS[chainName];
    if (!positionManagerAddress) {
        return `Error: Uniswap V3 Position Manager is not mapped for ${chainName}.`;
    }

    let token0Addr = resolveToken(token0AddressOrSymbol, chainName) as `0x${string}`;
    let token1Addr = resolveToken(token1AddressOrSymbol, chainName) as `0x${string}`;
    
    if (token0Addr === "0x0000000000000000000000000000000000000000" || token0Addr === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" || token1Addr === "0x0000000000000000000000000000000000000000" || token1Addr === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
        return "Error: Cannot provide native ETH directly to V3. Must wrap to WETH first.";
    }

    // Uniswap requires token0 to be lexicographically smaller than token1
    let token0: `0x${string}`;
    let token1: `0x${string}`;
    let amount0: string;
    let amount1: string;

    if (String(token0Addr || "").toLowerCase() < String(token1Addr || "").toLowerCase()) {
        token0 = token0Addr;
        token1 = token1Addr;
        amount0 = amount0Str;
        amount1 = amount1Str;
    } else {
        token0 = token1Addr;
        token1 = token0Addr;
        amount0 = amount1Str;
        amount1 = amount0Str;
    }

    const meta0 = await getTokenMetadata(publicClient, token0);
    const meta1 = await getTokenMetadata(publicClient, token1);

    const amount0Wei = parseUnits(amount0, meta0.decimals);
    const amount1Wei = parseUnits(amount1, meta1.decimals);

    // --- Pre-flight Balance Check ---
    const { validateTransactionBalances } = await import('../utils/balanceChecker');
    const balanceCheck0 = await validateTransactionBalances(chainName, userAddress, token0, amount0Wei.toString());
    if (!balanceCheck0.isValid) throw new Error(balanceCheck0.message);
    
    const balanceCheck1 = await validateTransactionBalances(chainName, userAddress, token1, amount1Wei.toString());
    if (!balanceCheck1.isValid) throw new Error(balanceCheck1.message);
    // --------------------------------

    // 1. Check Allowances for BOTH tokens
    const allowance0 = await publicClient.readContract({
        address: token0, abi: ERC20_ABI, functionName: 'allowance', args: [account, positionManagerAddress]
    } as any) as bigint;

    const allowance1 = await publicClient.readContract({
        address: token1, abi: ERC20_ABI, functionName: 'allowance', args: [account, positionManagerAddress]
    } as any) as bigint;

    if (allowance0 < amount0Wei) {
        const tx = txManager.createPendingTransaction('approve', chainName, { spenderAddress: positionManagerAddress, tokenAddress: token0, amountStr: amount0, symbol: meta0.symbol, gasEstimate: "60000" });
        return `⏳ **Approve queued:** ${meta0.symbol} | For: Uniswap V3 | ${chainName.toUpperCase()} | Please reply with 'Yes' to execute, or 'No' to cancel.`;
    }

    if (allowance1 < amount1Wei) {
        const tx = txManager.createPendingTransaction('approve', chainName, { spenderAddress: positionManagerAddress, tokenAddress: token1, amountStr: amount1, symbol: meta1.symbol, gasEstimate: "60000" });
        return `⏳ **Approve queued:** ${meta1.symbol} | For: Uniswap V3 | ${chainName.toUpperCase()} | Please reply with 'Yes' to execute, or 'No' to cancel.`;
    }

    // 2. Simulate Mint
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 mins
    
    // Calculate MEV-protected minimums based on dynamic slippage
    const slippageFactor = BigInt(Math.floor(actualSlippage * 100)); // e.g. 0.5% -> 50
    const amount0Min = (amount0Wei * (10000n - slippageFactor)) / 10000n;
    const amount1Min = (amount1Wei * (10000n - slippageFactor)) / 10000n;

    const mintParams = {
        token0, token1, fee: feeTier, tickLower: tLower, tickUpper: tUpper,
        amount0Desired: amount0Wei, amount1Desired: amount1Wei,
        amount0Min, amount1Min,
        recipient: account, deadline
    };

    let gasEstimate: bigint = 0n;
    try {
        const { request } = await publicClient.simulateContract({
            account,
            address: positionManagerAddress,
            abi: UNIV3_POSITION_MANAGER_ABI,
            functionName: 'mint',
            args: [mintParams],
        });
        // @ts-ignore
        gasEstimate = request.gas || 700000n;
    } catch (simError: any) {
        return `Simulation failed! Cannot mint liquidity position. Check if ticks are valid for fee tier. Error: ${simError.message}`;
    }

    const tx = txManager.createPendingTransaction('univ3Mint', chainName, { 
      positionManagerAddress,
      token0, token1,
      fee: feeTier,
      tickLower: tLower, tickUpper: tUpper,
      amount0Desired: amount0Wei.toString(),
      amount1Desired: amount1Wei.toString(),
      amount0Min: amount0Min.toString(),
      amount1Min: amount1Min.toString(),
      deadline: deadline.toString(),
      recipient: account,
      gasEstimate: gasEstimate.toString()
    });

    return `⏳ **Add Liquidity queued:** ${amount0} ${meta0.symbol} & ${amount1} ${meta1.symbol} | ${chainName.toUpperCase()} | Please reply with 'Yes' to execute, or 'No' to cancel.`;
  } catch (error: any) {
    return `Failed to prepare liquidity provision: ${error.message}`;
  }
}

export const provideLiquidityToolDefinition = {
  type: "function",
  function: {
    name: "provide_liquidity_v3",
    description: "Provide liquidity to Uniswap V3 (or PancakeSwap V3 on BSC). The AI MUST NOT guess tickLower and tickUpper; it must ask the user for them if missing.",
    parameters: {
      type: "object",
      properties: {
        chainName: { type: "string", enum: SUPPORTED_CHAIN_NAMES },
        token0AddressOrSymbol: { type: "string" },
        token1AddressOrSymbol: { type: "string" },
        amount0Str: { type: "string" },
        amount1Str: { type: "string" },
        feeTier: { type: "number", description: "Uniswap fee tier (e.g. 500 for 0.05%, 3000 for 0.3%, 10000 for 1%)" },
        tickLower: { type: "number", description: "Optional. Leave empty for Full Range." },
        tickUpper: { type: "number", description: "Optional. Leave empty for Full Range." }
      },
      required: ["chainName", "token0AddressOrSymbol", "token1AddressOrSymbol", "amount0Str", "amount1Str", "feeTier"]
    }
  }
};
