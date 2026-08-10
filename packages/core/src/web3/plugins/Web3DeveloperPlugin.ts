import { Plugin } from '../../plugin/types';
import { 
  compileSmartContractToolDefinition, 
  compileSmartContract,
  deploySmartContractToolDefinition,
  prepareDeploySmartContract
} from '../skills/smartContractSkills';

export class Web3DeveloperPlugin implements Plugin {
  public name = 'Web3DeveloperPlugin';
  public description = 'Smart contract development operations including Solidity compilation and deployment.';
  public version = '1.0.0';

  public tools = [
    compileSmartContractToolDefinition,
    deploySmartContractToolDefinition
  ];

  public handlers = {
    [compileSmartContractToolDefinition.function.name]: async (args: any) => {
      return await compileSmartContract(args.sourceCode, args.contractName);
    },
    [deploySmartContractToolDefinition.function.name]: async (args: any) => {
      return await prepareDeploySmartContract(
        args.chainName,
        args.abiStr,
        args.bytecode,
        args.argsStr,
        args.description
      );
    }
  };
}
