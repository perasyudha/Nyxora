import { getPublicClient, ChainName, normalizeChainName, getAddress } from "../config";
import { txManager } from "../../agent/transactionManager";
import { loadMarketKeys } from "../../config/marketConfigManager";
import { submitTransaction } from "../utils/vaultClient";

function getOpenSeaChain(chainName: string): string {
    switch (chainName) {
        case "ethereum": return "ethereum";
        case "polygon": return "matic";
        case "arbitrum": return "arbitrum";
        case "base": return "base";
        case "optimism": return "optimism";
        case "bsc": return "bsc";
        case "sepolia": return "sepolia";
        case "base_sepolia": return "base_sepolia";
        default: throw new Error(`Chain ${chainName} is not supported by OpenSea.`);
    }
}

export async function prepareSellNft(
    chainName: ChainName,
    contractAddress: string,
    tokenId: string
): Promise<string> {
    try {
        chainName = normalizeChainName(chainName);
        const keys = loadMarketKeys();
        if (!keys.opensea) throw new Error("OpenSea API Key is missing. Please configure it in the Dashboard -> Market Oracles.");
        const osChain = getOpenSeaChain(chainName);

        // Fetch active offers (bids) for this NFT
        const url = `https://api.opensea.io/api/v2/orders/${osChain}/seaport/offers?asset_contract_address=${contractAddress}&token_ids=${tokenId}&order_by=eth_price&order_direction=desc&limit=1`;
        const res = await fetch(url, { headers: { 'X-API-KEY': keys.opensea, 'accept': 'application/json' } });
        const data = await res.json();
        
        if (!res.ok || !data.orders || data.orders.length === 0) {
            throw new Error(`No active offers (bids) found for NFT ${contractAddress} #${tokenId} on ${chainName}. Instant selling requires an active buyer offer.`);
        }

        const bestOrder = data.orders[0];
        const priceWei = bestOrder.current_price;
        const priceEth = (Number(priceWei) / 1e18).toString();

        const userAddress = await getAddress();

        // Prepare fulfillment data via OpenSea API
        const fulfillUrl = `https://api.opensea.io/api/v2/offers/fulfillment_data`;
        const fulfillRes = await fetch(fulfillUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-KEY': keys.opensea },
            body: JSON.stringify({
                offer: {
                    hash: bestOrder.order_hash,
                    chain: osChain,
                    protocol_address: bestOrder.protocol_address
                },
                fulfiller: {
                    address: userAddress
                }
            })
        });
        
        const fulfillData = await fulfillRes.json();
        if (!fulfillRes.ok) {
            throw new Error(`Failed to generate fulfillment data: ${fulfillData.errors?.[0] || 'Unknown error'}`);
        }

        const txRequest = fulfillData.fulfillment_data.transaction;

        const tx = txManager.createPendingTransaction('nftList', chainName, {
            contractAddress,
            tokenId,
            orderHash: bestOrder.order_hash,
            priceWei,
            priceEth,
            txRequest, // { to, value, input_data }
            gasEstimate: "250000"
        });

        return `🤝 **Sell NFT quote ready! (Accepting Highest Offer)** 
        - **Asset:** ${contractAddress} #${tokenId}
        - **Offer Price:** ${priceEth} ETH / Native Token
        - **Chain:** ${chainName.toUpperCase()}
        ⚠️ Please reply with 'Yes' to execute this sale and accept the offer, or 'No' to cancel.`;

    } catch (error: any) {
        return `Failed to prepare OpenSea NFT sell order: ${error.message}`;
    }
}

export async function executeSellNft(chainName: ChainName, params: any, autoApprove: boolean = false): Promise<string> {
    try {
        chainName = normalizeChainName(chainName);
        const { contractAddress, tokenId, txRequest } = params;
        
        const payload: any = {
            type: 'contract_call',
            chainName,
            autoApprove,
            details: {
                contractAddress: txRequest.to,
                valueWei: txRequest.value.toString(),
                amountWei: txRequest.value.toString(),
                dataHex: txRequest.input_data,
                txRequest: {
                    to: txRequest.to,
                    value: txRequest.value.toString(),
                    data: txRequest.input_data
                }
            }
        };

        const txHash = await submitTransaction(payload);

        return `✅ **NFT Sold Successfully!**
        - **Asset:** ${contractAddress} #${tokenId}
        - **Transaction Hash:** ${txHash}`;

    } catch (error: any) {
        return `Failed to execute NFT sale: ${error.message}`;
    }
}

export const sellNftToolDefinition = {
    type: "function",
    function: {
        name: "sell_nft",
        description: "Sell an NFT instantly by accepting the highest available offer (bid) on OpenSea.",
        parameters: {
            type: "object",
            properties: {
                chainName: { type: "string", description: "Blockchain network" },
                contractAddress: { type: "string", description: "NFT Contract Address" },
                tokenId: { type: "string", description: "NFT Token ID" }
            },
            required: ["chainName", "contractAddress", "tokenId"]
        }
    }
};
