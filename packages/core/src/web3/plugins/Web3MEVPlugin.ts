import { Plugin } from '../../plugin/types';
import { 
  scanArbitrageToolDefinition, 
  scanArbitrageOpportunities 
} from '../skills/arbitrageEngine';
import { 
  sendPrivateTxToolDefinition, 
  sendPrivateTxBundle 
} from '../skills/flashbots';

export class Web3MEVPlugin implements Plugin {
  public name = 'Web3MEVPlugin';
  public description = 'MEV utilities including Arbitrage scanning and Flashbots private transactions for front-running protection.';
  public version = '1.0.0';

  public tools = [
    scanArbitrageToolDefinition,
    sendPrivateTxToolDefinition
  ];

  public handlers = {
    [scanArbitrageToolDefinition.function.name]: async (args: any) => {
      return await scanArbitrageOpportunities(args.chainName, args.tokenSymbol);
    },
    [sendPrivateTxToolDefinition.function.name]: async (args: any) => {
      return await sendPrivateTxBundle(args.chainName, args.txDataHex, args.targetBlockNumber);
    }
  };
}
