export type PlaybookStepType = 'bridge' | 'swap' | 'mint' | 'social' | 'siwe_login' | 'custom_contract' | 'claim';

export interface PlaybookStep {
  id: string;
  type: PlaybookStepType;
  description: string;
  params: Record<string, any>;
  dependsOn?: string[];
}

export interface PlaybookDAG {
  id: string;
  name: string;
  targetChain?: string;
  steps: PlaybookStep[];
}

export class AirdropPlaybookParser {
  /**
   * Parses a natural language guide or markdown text into an executable Playbook DAG.
   */
  public static parseGuideToDAG(guideText: string, defaultChain: string = 'base'): PlaybookDAG {
    const lines = guideText.split('\n').map(l => l.trim()).filter(Boolean);
    const steps: PlaybookStep[] = [];
    let stepCount = 0;

    for (const line of lines) {
      const lower = line.toLowerCase();
      stepCount++;
      const id = `step_${stepCount}`;

      if (lower.includes('bridge')) {
        steps.push({
          id,
          type: 'bridge',
          description: line,
          params: { action: 'bridge', guideLine: line }
        });
      } else if (lower.includes('swap')) {
        steps.push({
          id,
          type: 'swap',
          description: line,
          params: { action: 'swap', guideLine: line }
        });
      } else if (lower.includes('mint')) {
        steps.push({
          id,
          type: 'mint',
          description: line,
          params: { action: 'mint', guideLine: line }
        });
      } else if (lower.includes('follow') || lower.includes('retweet') || lower.includes('join')) {
        steps.push({
          id,
          type: 'social',
          description: line,
          params: { action: 'social', guideLine: line }
        });
      } else if (lower.includes('claim') || lower.includes('reward')) {
        steps.push({
          id,
          type: 'claim',
          description: line,
          params: { action: 'claim', guideLine: line }
        });
      } else {
        steps.push({
          id,
          type: 'custom_contract',
          description: line,
          params: { action: 'execute', guideLine: line }
        });
      }
    }

    return {
      id: `playbook_${Date.now()}`,
      name: `Airdrop Quest Playbook`,
      targetChain: defaultChain,
      steps
    };
  }
}
