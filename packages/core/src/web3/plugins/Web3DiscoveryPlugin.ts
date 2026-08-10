import { Plugin } from '../../plugin/types';
import { 
  discoverEarlyProjectsToolDefinition, 
  discoverEarlyProjects 
} from '../skills/discoveryEngine';
import { 
  auditProjectToolDefinition, 
  auditProjectLegitimacy 
} from '../skills/projectScorer';

export class Web3DiscoveryPlugin implements Plugin {
  public name = 'Web3DiscoveryPlugin';
  public description = 'Airdrop Discovery Engine to scan Crypto Twitter (CT) timelines for early projects and perform automated anti-scam audits.';
  public version = '1.0.0';

  public tools = [
    discoverEarlyProjectsToolDefinition,
    auditProjectToolDefinition
  ];

  public handlers = {
    [discoverEarlyProjectsToolDefinition.function.name]: async (args: any) => {
      return await discoverEarlyProjects(args.maxDaysOld);
    },
    [auditProjectToolDefinition.function.name]: async (args: any) => {
      return await auditProjectLegitimacy(args.projectName, args.twitterHandle, args.contractAddress);
    }
  };
}
