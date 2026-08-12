import { parseUnits, encodeFunctionData, parseEther } from 'viem';
import { ChainName, normalizeChainName } from './config';
import { resolveToken, ERC20_ABI, getTokenMetadata } from './utils/tokens';
import { submitTransaction } from './utils/vaultClient';
import { txManager } from '../agent/transactionManager';
import { getPublicClient } from './config';

export interface X402PaymentRequest {
    receiverAddress: `0x${string}`;
    amountStr: string;
    currency: string;
    chainId?: string;
    chainName?: string;
}

/**
 * Extracts x402 payment details from a 402 response object (headers or JSON).
 * In a real-world scenario, standard x402 HTTP headers like X-Payment-Required 
 * or a JSON body containing payment info are expected.
 */
export function parseX402Response(responseHeaders: any, responseBody: any): X402PaymentRequest | null {
    // Attempt to parse from JSON body first (common for agentic APIs)
    if (responseBody && responseBody.payment_required) {
        const payment = responseBody.payment_required;
        return {
            receiverAddress: payment.receiver,
            amountStr: payment.amount?.toString(),
            currency: payment.currency || 'USDC',
            chainName: payment.chain || 'base'
        };
    }

    // Attempt to parse from Headers
    const x402Header = responseHeaders['x-payment-required'] || responseHeaders['x402-payment-request'];
    if (x402Header) {
        try {
            // E.g., "receiver=0x123...; amount=0.5; currency=USDC; chain=base"
            const parts = x402Header.split(';').map((p: string) => p.trim());
            let receiver = '';
            let amount = '';
            let currency = 'USDC';
            let chainName = 'base';

            parts.forEach((part: string) => {
                const [key, val] = part.split('=');
                if (key.toLowerCase() === 'receiver') receiver = val;
                if (key.toLowerCase() === 'amount') amount = val;
                if (key.toLowerCase() === 'currency') currency = val;
                if (key.toLowerCase() === 'chain') chainName = val;
            });

            if (receiver && amount) {
                return { receiverAddress: receiver as `0x${string}`, amountStr: amount, currency, chainName };
            }
        } catch (e) {
            console.warn("Failed to parse x402 header:", e);
        }
    }
    return null;
}

/**
 * Constructs and submits the payment transaction to the Policy Engine.
 */
export async function executeX402Payment(paymentReq: X402PaymentRequest, autoApprove: boolean = false): Promise<string> {
    const chainName = normalizeChainName((paymentReq.chainName || 'base') as ChainName);
    if (!chainName) throw new Error("Invalid chain name in x402 request.");
    
    const publicClient = getPublicClient(chainName);
    const tokenAddress = resolveToken(paymentReq.currency, chainName);
    const isNative = tokenAddress === "0x0000000000000000000000000000000000000000" || tokenAddress === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    
    let decimals = 18;
    let amountWei = '0';
    let txRequest: any = {};
    let gasEstimate = 50000n; // Default fallback

    if (isNative) {
        amountWei = parseEther(paymentReq.amountStr).toString();
        txRequest = {
            to: paymentReq.receiverAddress,
            value: amountWei,
            data: "0x"
        };
        // Simple native gas estimation
        gasEstimate = 21000n;
    } else {
        const metadata = await getTokenMetadata(publicClient, tokenAddress as `0x${string}`);
        decimals = metadata.decimals;
        amountWei = parseUnits(paymentReq.amountStr, decimals).toString();

        txRequest = {
            to: tokenAddress,
            value: "0",
            data: encodeFunctionData({
                abi: ERC20_ABI,
                functionName: 'transfer',
                args: [paymentReq.receiverAddress, BigInt(amountWei)]
            })
        };
    }

    // Register pending transaction in transactionManager
    const tx = txManager.createPendingTransaction('transfer', chainName, {
        toAddress: paymentReq.receiverAddress,
        amountStr: paymentReq.amountStr,
        tokenAddress,
        isNative,
        decimals,
        gasEstimate: gasEstimate.toString()
    });

    const payload = {
        type: 'transfer',
        chainName,
        autoApprove,
        details: { 
            toAddress: paymentReq.receiverAddress,
            amountStr: paymentReq.amountStr,
            tokenAddress,
            isNative,
            decimals,
            amountWei, // Inject amountWei for Policy Engine validation
            txRequest 
        }
    };

    // Submit to vault client (Policy Engine)
    const result = await submitTransaction(payload);
    
    // Update local txManager state based on Policy Engine result
    if (result.startsWith('Pending')) {
        txManager.updateStatus(tx.id, 'pending', 'Awaiting User Approval');
    } else {
        txManager.updateStatus(tx.id, 'executed', result);
    }

    return result;
}
