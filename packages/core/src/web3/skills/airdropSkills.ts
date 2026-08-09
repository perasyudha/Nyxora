import { chainRegistry } from '../chainRegistry';
import { SIWEHandler } from '../siweHandler';
import { socialAutomation } from '../socialAutomation';
import { AirdropPlaybookParser } from '../playbookParser';
import { playbookExecutor } from '../playbookExecutor';

export const registerCustomChainDefinition = {
  type: 'function',
  function: {
    name: 'register_custom_chain',
    description: 'Registers a new custom blockchain or testnet manually with RPC URL, Chain ID, Native Symbol, and Explorer.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Chain name (e.g. monad_testnet, berachain_artio)' },
        chainId: { type: 'number', description: 'Numeric chain ID' },
        rpcUrl: { type: 'string', description: 'RPC HTTP endpoint URL' },
        explorerUrl: { type: 'string', description: 'Optional Block Explorer URL' },
        nativeSymbol: { type: 'string', description: 'Optional Native Token Symbol (default ETH)' }
      },
      required: ['name', 'chainId', 'rpcUrl']
    }
  }
};

export const signSiweChallengeDefinition = {
  type: 'function',
  function: {
    name: 'sign_siwe_challenge',
    description: 'Autonomously signs an EIP-4361 Sign-In with Ethereum (SIWE) challenge for dApp or quest login.',
    parameters: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain requesting SIWE login (e.g. quest.dapp.xyz)' },
        uri: { type: 'string', description: 'Full URI requesting login' },
        verifyApiUrl: { type: 'string', description: 'Optional verification API endpoint to POST signature' }
      },
      required: ['domain', 'uri']
    }
  }
};

export const executeSocialQuestDefinition = {
  type: 'function',
  function: {
    name: 'execute_social_quest',
    description: 'Executes a social task (X/Twitter follow/retweet, Discord join, Telegram join) via API or Headless Session.',
    parameters: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['twitter', 'discord', 'telegram'], description: 'Social media platform' },
        action: { type: 'string', enum: ['follow', 'like', 'retweet', 'join_server', 'join_channel'], description: 'Action to perform' },
        target: { type: 'string', description: 'Target handle, link, or server invite' },
        mode: { type: 'string', enum: ['api', 'headless'], description: 'Execution mode (API or Headless Browser)' }
      },
      required: ['platform', 'action', 'target']
    }
  }
};

export const executeAirdropPlaybookDefinition = {
  type: 'function',
  function: {
    name: 'execute_airdrop_playbook',
    description: 'Converts an airdrop guide or quest instructions into a Playbook DAG and executes all tasks automatically.',
    parameters: {
      type: 'object',
      properties: {
        guideText: { type: 'string', description: 'Text or markdown of the airdrop guide/steps' },
        defaultChain: { type: 'string', description: 'Default blockchain for operations' }
      },
      required: ['guideText']
    }
  }
};

export async function executeRegisterCustomChain(args: any): Promise<string> {
  const chain = chainRegistry.registerCustomChain({
    name: args.name,
    chainId: args.chainId,
    rpcUrl: args.rpcUrl,
    explorerUrl: args.explorerUrl,
    nativeSymbol: args.nativeSymbol
  });
  return `Successfully registered custom chain '${chain.name}' (ID: ${chain.id}) with RPC ${args.rpcUrl}.`;
}

export async function executeSignSiweChallenge(args: any): Promise<string> {
  const res = await SIWEHandler.signSiweChallenge(
    { domain: args.domain, uri: args.uri },
    args.verifyApiUrl
  );
  return `SIWE Challenge signed successfully.\nAddress: ${res.address}\nSignature: ${res.signature}${res.token ? `\nAuth Token: ${res.token}` : ''}`;
}

export async function executeSocialQuest(args: any): Promise<string> {
  const res = await socialAutomation.executeSocialTask({
    platform: args.platform,
    action: args.action,
    target: args.target,
    mode: args.mode
  });
  return res.message;
}

export async function executeAirdropPlaybook(args: any): Promise<string> {
  const dag = AirdropPlaybookParser.parseGuideToDAG(args.guideText, args.defaultChain || 'base');
  const results = await playbookExecutor.executePlaybook(dag);
  const summary = results.map(r => `- Step ${r.stepId} (${r.status}): ${r.output || r.error}`).join('\n');
  return `Completed Airdrop Playbook '${dag.name}':\n${summary}`;
}
