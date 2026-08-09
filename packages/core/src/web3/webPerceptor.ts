export interface DiscoveredEndpoint {
  url: string;
  method: string;
  purpose: 'auth' | 'task_list' | 'task_verify' | 'reward_claim' | 'unknown';
  payloadSample?: any;
}

export class WebPerceptor {
  private discoveredEndpoints: Map<string, DiscoveredEndpoint[]> = new Map();

  /**
   * Analyzes an array of intercepted network requests (from Playwright/Fetch logs)
   * to categorize quest platform API endpoints.
   */
  public analyzeNetworkTraffic(domain: string, requests: { url: string; method: string; postData?: string }[]): DiscoveredEndpoint[] {
    const endpoints: DiscoveredEndpoint[] = [];

    for (const req of requests) {
      const lowerUrl = req.url.toLowerCase();
      let purpose: DiscoveredEndpoint['purpose'] = 'unknown';

      if (lowerUrl.includes('auth') || lowerUrl.includes('login') || lowerUrl.includes('nonce') || lowerUrl.includes('siwe')) {
        purpose = 'auth';
      } else if (lowerUrl.includes('task') || lowerUrl.includes('quest') || lowerUrl.includes('campaign')) {
        if (req.method === 'POST' || lowerUrl.includes('verify') || lowerUrl.includes('check')) {
          purpose = 'task_verify';
        } else {
          purpose = 'task_list';
        }
      } else if (lowerUrl.includes('claim') || lowerUrl.includes('reward') || lowerUrl.includes('mint')) {
        purpose = 'reward_claim';
      }

      if (purpose !== 'unknown') {
        let payloadSample: any = undefined;
        if (req.postData) {
          try { payloadSample = JSON.parse(req.postData); } catch { payloadSample = req.postData; }
        }
        endpoints.push({ url: req.url, method: req.method, purpose, payloadSample });
      }
    }

    this.discoveredEndpoints.set(domain, endpoints);
    console.log(`🔍 [WebPerceptor] Analyzed ${requests.length} network requests for ${domain}. Found ${endpoints.length} quest endpoints.`);
    return endpoints;
  }

  public getDiscoveredEndpoints(domain: string): DiscoveredEndpoint[] {
    return this.discoveredEndpoints.get(domain) || [];
  }
}

export const webPerceptor = new WebPerceptor();
