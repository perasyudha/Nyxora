import { normalizeChainName } from '../utils/chains';
import { loadConfig } from '../../config/parser';
import { getAddress, ChainName } from '../config';
import { formatUnits } from 'viem';
import { safeFetchJson } from '../../utils/httpClient';

const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  bsc: 56,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  sepolia: 11155111,
  base_sepolia: 84532,
  arbitrum_sepolia: 421614,
  optimism_sepolia: 11155420,
  robinhood: 4663,
  robinhood_testnet: 46630
};
const BLOCKSCOUT_URLS: Record<string, string> = {
  ethereum: 'https://eth.blockscout.com/api',
  base: 'https://base.blockscout.com/api',
  optimism: 'https://optimism.blockscout.com/api',
  arbitrum: 'https://arbitrum.blockscout.com/api',
  polygon: 'https://polygon.blockscout.com/api',
  sepolia: 'https://eth-sepolia.blockscout.com/api',
  base_sepolia: 'https://base-sepolia.blockscout.com/api',
  optimism_sepolia: 'https://optimism-sepolia.blockscout.com/api',
  arbitrum_sepolia: 'https://arbitrum-sepolia.blockscout.com/api',
  bsc: 'https://bsc.blockscout.com/api',
  robinhood: 'https://robinhoodchain.blockscout.com/api'
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));


export async function getTxHistory(chainName: ChainName, address?: string, days: number = 30): Promise<string> {
  try {
    chainName = normalizeChainName(chainName);
    const targetAddress = address || await getAddress();
    const chainId = CHAIN_IDS[chainName];
    if (!chainId) {
      return `Error: No chain ID configured for chain ${chainName}.`;
    }
    const config = loadConfig();
    const apiKey = config.web3?.explorer_api_key || ''; 
    
    let apiUrl = '';
    let isV2 = false;
    let isBlockscout = false;
    
    // Attempt Etherscan V2 if API Key is available
    if (apiKey) {
      apiUrl = `https://api.etherscan.io/v2/api?chainid=${chainId}&apikey=${apiKey}`;
      isV2 = true;
    } else {
      // Fallback to Blockscout
      const baseUrl = BLOCKSCOUT_URLS[chainName];
      if (!baseUrl) {
        return `Error: No Blockscout API URL configured for chain ${chainName}, and no Etherscan API Key provided.`;
      }
      apiUrl = `${baseUrl}?`;
      isBlockscout = true;
    }

    const startTimestamp = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
    const getUrl = (url: string, action: string) => `${url}&module=account&action=${action}&address=${targetAddress}&startblock=0&endblock=99999999&page=1&offset=10000&sort=desc`;

    // Fetch Native Txs
    let nativeData = await safeFetchJson<any>(getUrl(apiUrl, 'txlist'));
    
    // Handle Etherscan Free Tier paywall rejection
    if (isV2 && nativeData.message === 'NOTOK' && nativeData.result.includes('Free API access is not supported')) {
      // V2 rejected due to lack of PRO key for non-ETH chain? Fallback to Blockscout!
      const baseUrl = BLOCKSCOUT_URLS[chainName];
      if (baseUrl) {
        apiUrl = `${baseUrl}?`; 
        isV2 = false;
        isBlockscout = true;
        nativeData = await safeFetchJson<any>(getUrl(apiUrl, 'txlist'));
      } else {
        return `Error: Etherscan V2 requires PRO plan for ${chainName}, and Blockscout fallback is not available for this chain.`;
      }
    } 
    
    if (nativeData.message === 'NOTOK') {
      throw new Error(`Explorer API Error: ${nativeData.result}`);
    }

    // Adaptive Rate-Limit: 250ms for V2 (API Key), no strict delay needed for Blockscout but 250ms is safe
    const delayTime = 250;
    await delay(delayTime);

    // Fetch ERC20 Txs
    const tokenData = await safeFetchJson<any>(getUrl(apiUrl, 'tokentx'));

    let history: any[] = [];

    if (nativeData.status === '1' && Array.isArray(nativeData.result)) {
      nativeData.result.forEach((tx: any) => {
        if (parseInt(tx.timeStamp) >= startTimestamp && tx.value !== '0') {
          const isReceive = String(tx.to || "").toLowerCase() === String(targetAddress || "").toLowerCase();
          history.push({
            Date: new Date(parseInt(tx.timeStamp) * 1000).toISOString().split('T')[0],
            Type: isReceive ? 'Receive' : 'Send',
            Token: chainName === 'bsc' ? 'BNB' : chainName === 'polygon' ? 'MATIC' : chainName.startsWith('robinhood') ? 'ETH' : 'ETH',
            Amount: formatUnits(BigInt(tx.value), 18),
            From: tx.from,
            To: tx.to,
            Hash: tx.hash,
            Fee_Native: isReceive ? '0' : formatUnits(BigInt(tx.gasUsed) * BigInt(tx.gasPrice), 18),
            timestamp: parseInt(tx.timeStamp)
          });
        }
      });
    }

    if (tokenData.status === '1' && Array.isArray(tokenData.result)) {
      tokenData.result.forEach((tx: any) => {
        if (parseInt(tx.timeStamp) >= startTimestamp) {
          const isReceive = String(tx.to || "").toLowerCase() === String(targetAddress || "").toLowerCase();
          history.push({
            Date: new Date(parseInt(tx.timeStamp) * 1000).toISOString().split('T')[0],
            Type: isReceive ? 'Receive' : 'Send',
            Token: tx.tokenSymbol || 'Unknown',
            Amount: formatUnits(BigInt(tx.value), parseInt(tx.tokenDecimal || '18')),
            From: tx.from,
            To: tx.to,
            Hash: tx.hash,
            Fee_Native: isReceive ? '0' : formatUnits(BigInt(tx.gasUsed) * BigInt(tx.gasPrice), 18),
            timestamp: parseInt(tx.timeStamp)
          });
        }
      });
    }

    // Sort by timestamp desc
    history.sort((a, b) => b.timestamp - a.timestamp);

    // Remove timestamp property before returning
    history = history.map(({ timestamp, ...rest }) => rest);

    if (history.length === 0) {
      return `No transactions found for ${targetAddress} on ${chainName} in the last ${days} days.`;
    }

    return JSON.stringify(history);
  } catch (err: any) {
    return `Error fetching transaction history: ${err.message}`;
  }
}

export const getTxHistoryToolDefinition = {
  type: "function",
  function: {
    name: "get_tx_history",
    description: "Fetches the transaction history (Native and ERC-20 transfers) for an address on a specific chain over the last N days. Do NOT automatically generate an Excel file or download link from this data unless the user explicitly asks for a file or report.",
    parameters: {
      type: "object",
      properties: {
        chainName: {
          type: "string",
          description: "The name of the blockchain (e.g., base, ethereum, bsc, arbitrum).",
        },
        address: {
          type: "string",
          description: "Optional. The wallet address. If omitted, uses the agent's own wallet.",
        },
        days: {
          type: "number",
          description: "Optional. Number of days to look back. Default is 30.",
        }
      },
      required: ["chainName"],
    },
  },
};
