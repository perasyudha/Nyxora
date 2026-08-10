import { Plugin } from '../../plugin/types';
import { 
  findBestBridgeRouteToolDefinition, 
  findBestBridgeRoute 
} from '../skills/bridgeOptimizer';
import { 
  scanYieldToolDefinition, 
  scanYieldFarmingOpportunities 
} from '../skills/yieldOptimizer';

export class Web3YieldPlugin implements Plugin {
  public name = 'Web3YieldPlugin';
  public description = 'Smart cross-chain route optimizer and auto-yield farming opportunities scanner.';
  public version = '1.0.0';

  public tools = [
    findBestBridgeRouteToolDefinition,
    scanYieldToolDefinition
  ];

  public handlers = {
    [findBestBridgeRouteToolDefinition.function.name]: async (args: any) => {
      return await findBestBridgeRoute(args.fromChain, args.toChain, args.tokenSymbol, args.amount);
    },
    [scanYieldToolDefinition.function.name]: async (args: any) => {
      return await scanYieldFarmingOpportunities(args.chainName, args.tokenSymbol);
    }
  };
}
