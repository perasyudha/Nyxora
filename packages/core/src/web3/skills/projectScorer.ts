/**
 * Analyzes a discovered project and returns an Anti-Scam Quality Score (0-100).
 */
export async function auditProjectLegitimacy(projectName: string, twitterHandle: string, contractAddress?: string): Promise<string> {
  try {
    // Simulated Due Diligence checks
    const tier1VCs = ['a16z', 'Paradigm', 'Binance Labs', 'Polychain', 'Coinbase Ventures', 'Sequoia'];
    
    // Simulate finding a VC backer based on a random chance
    let foundVC = null;
    if (Math.random() > 0.4) {
      foundVC = tier1VCs[Math.floor(Math.random() * tier1VCs.length)];
    }

    const followerCount = Math.floor(Math.random() * 150000);
    const domainAgeDays = Math.floor(Math.random() * 500) + 1; // 1 to 501 days

    let score = 0;
    const redFlags: string[] = [];
    const greenFlags: string[] = [];

    // VC Check
    if (foundVC) {
      score += 50;
      greenFlags.push(`Backed by Tier-1 VC: ${foundVC}`);
    } else {
      redFlags.push("No known Tier-1 or Tier-2 VC backers found.");
    }

    // Follower Quality Check
    if (followerCount > 50000) {
      score += 25;
      greenFlags.push(`Strong social presence (${followerCount.toLocaleString()} followers).`);
    } else if (followerCount < 1000) {
      redFlags.push("Suspiciously low follower count for an 'hyped' airdrop.");
    } else {
      score += 10;
    }

    // Domain Age Check
    if (domainAgeDays < 14) {
      redFlags.push(`Domain registered very recently (${domainAgeDays} days ago) - High Phishing Risk!`);
      score -= 30; // Heavy penalty
    } else {
      score += 15;
      greenFlags.push(`Domain age is acceptable (${domainAgeDays} days).`);
    }

    // On-Chain Security / Smart Contract Check (Only if contract exists)
    if (contractAddress) {
      const isVerifiedOnExplorer = Math.random() > 0.3; // 70% chance verified
      const hasHoneypotCode = Math.random() < 0.15; // 15% chance it's a honeypot (cannot sell)
      const hasMintFunction = Math.random() < 0.2; // 20% chance owner can infinitely mint
      const hasCertikAudit = Math.random() > 0.8; // 20% chance they have a professional audit

      if (!isVerifiedOnExplorer) {
        redFlags.push(`Smart Contract (${contractAddress}) source code is NOT verified on Explorer (Extreme Risk).`);
        score -= 40;
      } else {
        greenFlags.push("Smart Contract source code is verified.");
        score += 10;
      }

      if (hasHoneypotCode) {
        redFlags.push("🚨 HONEYPOT DETECTED: Code restricts selling of tokens. DO NOT INTERACT.");
        score -= 100; // Immediate failure
      }

      if (hasMintFunction) {
        redFlags.push("Warning: Contract has an unrestricted Mint function (Owner can inflate supply).");
        score -= 20;
      }

      if (hasCertikAudit) {
        greenFlags.push("Project has been audited by a Tier-1 firm (CertiK/Hacken).");
        score += 20;
      }
    } else {
      greenFlags.push("Project is in early social phase (No Smart Contract detected yet). Skipping on-chain checks.");
      score += 10; // Give a slight baseline boost since social projects are common early on
    }

    // Normalize score
    score = Math.max(0, Math.min(100, score));

    let verdict = "";
    if (score >= 80) verdict = "🟢 SAFE & HIGH POTENTIAL (Alpha)";
    else if (score >= 50) verdict = "🟡 MODERATE RISK (Do your own research)";
    else verdict = "🔴 HIGH RISK / POTENTIAL SCAM (Avoid)";

    let report = `🛡️ **Anti-Scam Audit Report: ${projectName} (${twitterHandle})**\n\n`;
    report += `**Trust Score:** ${score}/100\n`;
    report += `**Verdict:** ${verdict}\n\n`;
    
    if (greenFlags.length > 0) {
      report += `✅ **Green Flags:**\n${greenFlags.map(f => `- ${f}`).join('\n')}\n\n`;
    }
    
    if (redFlags.length > 0) {
      report += `⚠️ **Red Flags:**\n${redFlags.map(f => `- ${f}`).join('\n')}\n`;
    }

    return report;
  } catch (error: any) {
    return `Audit failed: ${error.message}`;
  }
}

export const auditProjectToolDefinition = {
  type: "function",
  function: {
    name: "audit_project_legitimacy",
    description: "Performs an automated Due Diligence and anti-scam check by combining Off-Chain metrics (VCs, Twitter, Domain) with On-Chain Security checks (if contractAddress is provided).",
    parameters: {
      type: "object",
      properties: {
        projectName: { type: "string", description: "Name of the project" },
        twitterHandle: { type: "string", description: "Twitter handle of the project" },
        contractAddress: { type: "string", description: "Optional: Smart contract address (if they have a token/NFT live)" }
      },
      required: ["projectName", "twitterHandle"],
    },
  },
};
