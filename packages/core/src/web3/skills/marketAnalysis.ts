import { normalizeChainName } from '../utils/chains';
import { ChainName, SUPPORTED_CHAIN_NAMES } from '../config';
import { safeFetchJson } from '../../utils/httpClient';
import { generateMarketHealthReport, MarketHealthResult } from '../utils/riskIntelligence';
import { fetchTokenSecurityData, formatSecurityReport, CHAIN_IDS } from './checkSecurity';
import { ML_BASE_URL } from '../../config/constants';

export async function analyzeMarket(chainName: ChainName, tokenAddressOrSymbol: string): Promise<string> {
  try {
    chainName = normalizeChainName(chainName);
    if (!tokenAddressOrSymbol) throw new Error("Token symbol is invalid.");
    
    // ==========================================
    // PHASE 1: DATA ROUTING (PROXY TO PYTHON ML ENGINE)
    // ==========================================
    console.log(`[Market Intelligence] Delegating analysis for ${tokenAddressOrSymbol} to Python ML Engine...`);
    
    let mlData;
    try {
        mlData = await safeFetchJson<any>(`${ML_BASE_URL}/web3/analyze?query=${tokenAddressOrSymbol}&chain=${chainName}`, { timeoutMs: 35000, retries: 1 });
    } catch (error: any) {
        return `[System Error] Failed to reach Python ML Engine. Make sure the daemon is running (Error: ${error.message})`;
    }
    
    if (!mlData || mlData.detail) {
        return `[Market Intelligence] Failed to find data for ${tokenAddressOrSymbol} on DEX or CEX.`;
    }
    
    const {
        officialSymbol,
        contractAddress,
        network,
        currentPrice,
        mcapUsd,
        liquidityUsd,
        volume24h,
        priceChange24h,
        rsi,
        ma50,
        ema20,
        macdHistogram,
        bollingerBandwidth,
        atr14,
        obvTrend,
        trendClassification,
        trendConfidence,
        narrative,
        isCexAsset,
        poolCreatedAt,
        txns24h
    } = mlData;

    // ==========================================
    // PHASE 2: HEALTH & RISK SCORING (NODE.JS)
    // ==========================================
    let poolAgeText = 'Unknown';
    if (poolCreatedAt) {
        const days = Math.floor((Date.now() - poolCreatedAt) / (1000 * 60 * 60 * 24));
        const dateStr = new Date(poolCreatedAt).toISOString().split('T')[0];
        poolAgeText = `${days} days (created ${dateStr})`;
        if (days <= 7) poolAgeText += ' - Note: Very New';
    }

    // Dummy TVL for now, Python can augment this later
    let tvlChange7d: number | null = null;
    let top10HoldersPercent: number | null = null;
    let securityData: any = null;

    if (contractAddress && CHAIN_IDS[chainName] && chainName !== 'sepolia') {
        try {
            securityData = await fetchTokenSecurityData(chainName, contractAddress);
            if (securityData && securityData.holders && Array.isArray(securityData.holders)) {
                let sumPercent = 0;
                const holdersList = securityData.holders.slice(0, 10);
                for (const h of holdersList) {
                    sumPercent += parseFloat(h.percent || "0");
                }
                if (sumPercent > 0) {
                    top10HoldersPercent = parseFloat((sumPercent * 100).toFixed(2));
                }
            }
        } catch (e) {
            console.warn(`[Market Intelligence] Failed to fetch GoPlus holders data`);
        }
    }

    let healthResult: MarketHealthResult = { 
        liquidityScore: 5.0, smartMoneyScore: 5.0, concentrationScore: 5.0, momentumScore: 5.0, overallScore: 5.0 
    };

    try {
        healthResult = generateMarketHealthReport(
            liquidityUsd, mcapUsd, tvlChange7d, volume24h, priceChange24h, top10HoldersPercent, rsi, currentPrice, ma50, trendClassification
        );
    } catch (e: any) {
        console.warn(`[Market Intelligence] Failed to generate deep risk report: ${e.message}`);
    }

    // ==========================================
    // PHASE 3: CONTEXT ASSEMBLY FOR LLM
    // ==========================================
    let report = `📊 **Market Intelligence Report: ${officialSymbol}**\n`;
    report += `CA: \`${contractAddress || 'N/A'}\` | Network: ${network}\n\n`;
    
    report += `**⭐ Overall Market Health Score:** ${healthResult.overallScore} / 10\n\n`;
    
    report += `**1. Trend Analysis:** ${trendClassification || 'N/A'} (Confidence: ${trendConfidence ? trendConfidence.toFixed(0) + '%' : 'N/A'})\n`;
    report += `- Narrative: ${narrative || 'N/A'}\n\n`;
    
    report += `**2. Liquidity & Flow:** ${healthResult.liquidityScore !== null ? healthResult.liquidityScore + '/10' : '[ N/A ]'}\n`;
    report += `- Liquidity: $${liquidityUsd.toLocaleString()} vs FDV: $${mcapUsd.toLocaleString()}\n`;
    report += `- 24h Volume: $${volume24h.toLocaleString()} | OBV Trend: ${obvTrend || 'N/A'}\n`;
    if (txns24h !== undefined && txns24h !== null) {
        report += `- 24h Transactions: ${txns24h.toLocaleString()} txns\n`;
    }
    if (poolCreatedAt) {
        report += `- Pool Age: ${poolAgeText}\n`;
    }
    report += `\n`;
    
    report += `**3. Holder Concentration:** ${healthResult.concentrationScore !== null ? healthResult.concentrationScore + '/10' : '[ N/A - RPC Pending ]'}\n`;
    report += `- Top 10 Holders: ${top10HoldersPercent !== null ? top10HoldersPercent + '%' : 'N/A'}\n\n`;
    
    report += `**4. Technical Indicators (Daily):** ${healthResult.momentumScore !== null ? healthResult.momentumScore + '/10' : '[ N/A - DEX Only Coin ]'}\n`;
    report += `- Price: $${currentPrice}\n`;
    report += `- RSI (14): ${rsi ? rsi.toFixed(2) : 'N/A'}\n`;
    report += `- MACD Histogram: ${macdHistogram ? macdHistogram.toFixed(4) : 'N/A'}\n`;
    report += `- MA-50: ${ma50 ? '$'+ma50.toFixed(4) : 'N/A'} | EMA-20: ${ema20 ? '$'+ema20.toFixed(4) : 'N/A'}\n`;
    report += `- Bollinger Bandwidth: ${bollingerBandwidth ? bollingerBandwidth.toFixed(2)+'%' : 'N/A'}\n`;
    report += `- ATR (14): ${atr14 ? '$'+atr14.toFixed(4) : 'N/A'}\n\n`;

    if (securityData) {
        report += formatSecurityReport(securityData) + '\n';
    }

    report += `*System Note for LLM: You are a sharp, expert crypto financial advisor (Penasihat Keuangan Kripto). Use this exact data to provide a comprehensive "Market & Security Summary" in the user's native language. You MUST explicitly state the Token's Market Cap, Liquidity, 24h Volume, 24h Transactions, Pool Age, Holder Concentration, and Security/Honeypot status.\n\nCRITICAL FORMATTING RULE: You MUST use standard ASCII Hindu-Arabic numerals (0, 1, 2, 3, 4, 5, 6, 7, 8, 9) for ALL prices, percentages, and metrics. NEVER use Arabic-Indic numerals (۰, ۱, ۲...), Bengali numerals (০, ১, ২...), or any non-Latin script digits. DO NOT generate ASCII art, pseudo-graphics, or visual progress bars inside markdown table cells.\n\nCRITICAL TASK: Based on the combined technical indicators, liquidity risks, holder concentration, and smart contract security, you MUST provide a clear, strategic, and actionable recommendation on what the user should do with this token. Use terms like 'Quick Flip / Scalp', 'Hold for mid-term', 'Avoid at all costs (High Risk)', or 'DCA cautiously'. Justify your perspective logically using the provided data and the ML engine's narrative.\n\nIMPORTANT: Always include a clear disclaimer at the end (translated into the user's native language) stating that this analysis is NOT financial advice (NFA).*`;

    return report;

  } catch (error: any) {
    return `[Market Intelligence] Failed to aggregate data: ${error.message}`;
  }
}

export const marketAnalysisToolDefinition = {
  type: "function",
  function: {
    name: "analyze_market",
    description: "MUST be used whenever the user asks for 'analisis', 'analysis', 'market intelligence', or a deep dive into ANY crypto token. SUPPORTS ALL ASSETS: Native assets (BTC, SOL, XRP, DOGE) as well as DEX tokens and EVM Contract Addresses. For native non-EVM coins (e.g. BTC, SOL, XRP), pass 'ethereum' or 'unknown' as chainName and the exact token symbol (e.g. 'BTC') as tokenAddressOrSymbol. DO NOT substitute native coins with wrapped tokens (e.g. DO NOT analyze WBTC when user asked for BTC). DO NOT claim native assets are unsupported. DO NOT use this tool for simple price/fiat math (use 'get_price' instead).",
    parameters: {
      type: "object",
      properties: {
        chainName: {
          type: "string",
          enum: SUPPORTED_CHAIN_NAMES,
          description: "The blockchain network. For native non-EVM coins (BTC, SOL, XRP), pass 'ethereum' or 'unknown'.",
        },
        tokenAddressOrSymbol: {
          type: "string",
          description: "The exact token symbol (e.g. BTC, ETH, SOL, PEPE) or exact Contract Address (0x...) to analyze.",
        }
      },
      required: ["tokenAddressOrSymbol"],
    },
  },
};
