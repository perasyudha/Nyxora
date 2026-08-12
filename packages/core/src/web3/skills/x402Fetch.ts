import { parseX402Response, executeX402Payment } from '../x402Handler';

export async function fetchWithX402(url: string, method: string = 'GET', headers: Record<string, string> = {}, body?: string): Promise<string> {
    try {
        const init: RequestInit = {
            method,
            headers,
            ...(body ? { body } : {})
        };

        let response = await fetch(url, init);

        if (response.status === 402) {
            // Attempt to parse x402 payment requirements
            const responseBody = await response.clone().json().catch(() => null);
            const responseHeaders = Object.fromEntries(response.headers.entries());
            
            const paymentReq = parseX402Response(responseHeaders, responseBody);
            
            if (!paymentReq) {
                return `Error: Endpoint returned 402 Payment Required, but no valid x402 payment instructions were found in the headers or JSON body.`;
            }

            console.log(`[x402] Detected payment requirement: ${paymentReq.amountStr} ${paymentReq.currency} on ${paymentReq.chainName}`);

            // Submit the payment to the Policy Engine (vault client)
            const txResult = await executeX402Payment(paymentReq, false); // Rely on policy.yaml for autoApprove rules

            if (txResult.startsWith('Pending')) {
                return `**x402 Payment Pending Approval**\n\nThe API at \`${url}\` requires a payment of **${paymentReq.amountStr} ${paymentReq.currency}** on **${paymentReq.chainName}**.\n\nI have routed this transaction through the Policy Engine and it is waiting in the queue (${txResult}).\n\nPlease approve it via the Dashboard Security/Wallet menu. Once approved, you can ask me to fetch the data again.`;
            }

            // If we have a hash, the payment succeeded autonomously
            console.log(`[x402] Payment successful. TxHash: ${txResult}. Retrying request...`);

            // Retry the original request with the proof of payment
            // Standard x402 usually expects the tx hash in an Authorization or X-Payment-Receipt header
            const retryHeaders = {
                ...headers,
                'X-Payment-Receipt': txResult,
                'Authorization': `x402 ${txResult}`
            };

            response = await fetch(url, { ...init, headers: retryHeaders });
            
            if (!response.ok) {
                return `Error: Payment succeeded (${txResult}) but retried API request still failed with status ${response.status}.`;
            }
        } else if (!response.ok) {
             return `Error: API request failed with status ${response.status} ${response.statusText}`;
        }

        // Successfully fetched data
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await response.json();
            return JSON.stringify(data, null, 2);
        } else {
            return await response.text();
        }

    } catch (error: any) {
        return `Failed to fetch: ${error.message}`;
    }
}

export const fetchWithX402Definition = {
    type: "function",
    function: {
        name: "fetch_with_x402",
        description: "Fetch data from an external Web3 API or Agentic Service. If the service requires payment (HTTP 402), this tool will automatically negotiate, execute the crypto payment (e.g. USDC on Base) via the Policy Engine, and retry the request to fetch the unlocked data.",
        parameters: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description: "The URL of the API or resource to fetch."
                },
                method: {
                    type: "string",
                    enum: ["GET", "POST"],
                    description: "HTTP method (defaults to GET)."
                },
                headers: {
                    type: "object",
                    description: "Optional HTTP headers as a key-value object.",
                    additionalProperties: { type: "string" }
                },
                body: {
                    type: "string",
                    description: "Optional stringified JSON body for POST requests."
                }
            },
            required: ["url"]
        }
    }
};
