import { PlaybookDAG, PlaybookStep } from './playbookParser';
import { socialAutomation } from './socialAutomation';
import { SIWEHandler } from './siweHandler';
import { antiSybilEngine } from './antiSybilEngine';

export interface StepExecutionResult {
  stepId: string;
  status: 'completed' | 'failed' | 'skipped';
  output?: string;
  error?: string;
}

export class PlaybookExecutor {
  /**
   * Executes a Playbook DAG sequentially with random jitter and progress callbacks.
   */
  public async executePlaybook(
    dag: PlaybookDAG,
    onProgress?: (stepId: string, status: string, message: string) => void
  ): Promise<StepExecutionResult[]> {
    console.log(`🚀 [PlaybookExecutor] Starting execution of Playbook: ${dag.name} (${dag.steps.length} steps)...`);
    const results: StepExecutionResult[] = [];

    for (const step of dag.steps) {
      console.log(`▶️ [PlaybookExecutor] Executing Step [${step.id}]: ${step.description}`);
      if (onProgress) onProgress(step.id, 'running', `Executing: ${step.description}`);

      // Apply Anti-Sybil random delay before execution (default short jitter for testnet/execution)
      await antiSybilEngine.delayJitter(2, 5);

      try {
        let output = '';
        if (step.type === 'social') {
          const res = await socialAutomation.executeSocialTask({
            platform: step.description.toLowerCase().includes('discord') ? 'discord' : 'twitter',
            action: step.description.toLowerCase().includes('retweet') ? 'retweet' : 'follow',
            target: step.params.target || 'project'
          });
          output = res.message;
        } else if (step.type === 'siwe_login') {
          const res = await SIWEHandler.signSiweChallenge({ domain: step.params.domain || 'dapp.xyz', uri: step.params.uri || 'https://dapp.xyz' });
          output = `Signed SIWE challenge successfully for ${res.address}`;
        } else {
          output = `Step ${step.id} (${step.type}) executed: ${step.description}`;
        }

        results.push({ stepId: step.id, status: 'completed', output });
        if (onProgress) onProgress(step.id, 'completed', output);
      } catch (e: any) {
        console.error(`❌ [PlaybookExecutor] Step ${step.id} failed: ${e.message}`);
        results.push({ stepId: step.id, status: 'failed', error: e.message });
        if (onProgress) onProgress(step.id, 'failed', `Error: ${e.message}`);
      }
    }

    console.log(`🏁 [PlaybookExecutor] Playbook execution completed. ${results.filter(r => r.status === 'completed').length}/${dag.steps.length} succeeded.`);
    return results;
  }
}

export const playbookExecutor = new PlaybookExecutor();
