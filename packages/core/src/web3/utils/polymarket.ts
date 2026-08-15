import { safeFetchJson } from '../../utils/httpClient';

const GAMMA_BASE = "https://gamma-api.polymarket.com";

interface PolymarketEvent {
    markets: PolymarketMarket[];
}

interface PolymarketMarket {
    question: string;
    outcomes: string; // JSON string array
    outcomePrices: string; // JSON string array
    volumeNum: number;
    endDate: string;
    closed: boolean;
    oneWeekPriceChange?: number;
}

function parseJsonList(value: string | undefined): any[] {
    if (!value) return [];
    try {
        return JSON.parse(value);
    } catch (e) {
        return [];
    }
}

function isForwardLooking(market: PolymarketMarket, now: number): boolean {
    if (market.closed) return false;
    
    if (market.endDate) {
        const endDate = new Date(market.endDate).getTime();
        if (endDate < now) return false;
    }

    const prices = parseJsonList(market.outcomePrices);
    const outcomes = parseJsonList(market.outcomes);
    return prices.length > 0 && outcomes.length > 0;
}

export async function getPredictionMarkets(topic: string, limit: number = 6): Promise<string> {
    try {
        const url = `${GAMMA_BASE}/public-search?q=${encodeURIComponent(topic)}&limit_per_type=20`;
        const data = await safeFetchJson<any>(url, { timeoutMs: 15000, retries: 1 });
        
        if (!data || !data.events) {
            return `Polymarket data is currently unavailable (no events). Proceed without prediction-market signal for '${topic}'.`;
        }

        const now = Date.now();
        let candidates: PolymarketMarket[] = [];
        
        for (const event of data.events as PolymarketEvent[]) {
            if (event.markets && Array.isArray(event.markets)) {
                for (const m of event.markets) {
                    if (isForwardLooking(m, now)) {
                        candidates.push(m);
                    }
                }
            }
        }
        
        candidates.sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0));

        let header = `**Polymarket Prediction Markets: "${topic}"**\n`;
        header += `*Live, market-implied probabilities (higher traded volume = deeper, more reliable). A probability is the crowd's priced odds of the event.*\n\n`;

        if (candidates.length === 0) {
            return header + `No open prediction markets matched '${topic}'. Polymarket coverage is concentrated in macro, political, geopolitical, and crypto events.`;
        }

        const lines: string[] = [];
        for (const m of candidates.slice(0, limit)) {
            const prices = parseJsonList(m.outcomePrices);
            const outcomes = parseJsonList(m.outcomes);
            
            const probStr = prices[0];
            const prob = parseFloat(probStr);
            if (isNaN(prob)) continue;
            
            const label = outcomes.length > 0 ? outcomes[0] : "Yes";
            const volume = m.volumeNum || 0;
            const endDate = (m.endDate || "").substring(0, 10);
            const wk = m.oneWeekPriceChange;
            
            let wkStr = "";
            if (typeof wk === 'number' && wk !== 0) {
                wkStr = `, 1-week ${(wk * 100).toFixed(1)}pp`;
            }
            
            lines.push(`- **${m.question}** — ${label} ${(prob * 100).toFixed(0)}% ($${Math.floor(volume).toLocaleString()} volume, resolves ${endDate}${wkStr})`);
        }

        return header + lines.join('\n') + '\n';

    } catch (error: any) {
        console.warn(`[Polymarket] Search failed for '${topic}':`, error.message);
        return `Polymarket data is currently unavailable (network error). Proceed without prediction-market signal for '${topic}'.`;
    }
}
