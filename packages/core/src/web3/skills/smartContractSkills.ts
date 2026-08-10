import { normalizeChainName } from '../utils/chains';
import { ChainName, SUPPORTED_CHAIN_NAMES } from '../config';
import { txManager } from '../../agent/transactionManager';
import { encodeDeployData, parseAbi } from 'viem';
import solc from 'solc';

/**
 * Compiles a Solidity smart contract using solc.
 */
export async function compileSmartContract(sourceCode: string, contractName: string): Promise<string> {
  try {
    const input = {
      language: 'Solidity',
      sources: {
        'Contract.sol': {
          content: sourceCode
        }
      },
      settings: {
        outputSelection: {
          '*': {
            '*': ['*']
          }
        }
      }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));

    if (output.errors) {
      const errors = output.errors.filter((e: any) => e.severity === 'error');
      if (errors.length > 0) {
        return `Compilation failed:\n${errors.map((e: any) => e.formattedMessage).join('\n')}`;
      }
    }

    const contract = output.contracts['Contract.sol'][contractName];
    if (!contract) {
      return `Contract '${contractName}' not found in the compiled source. Available contracts: ${Object.keys(output.contracts['Contract.sol']).join(', ')}`;
    }

    const abi = contract.abi;
    const bytecode = contract.evm.bytecode.object;

    return JSON.stringify({
      status: 'success',
      abi,
      bytecode: `0x${bytecode}`
    }, null, 2);
  } catch (error: any) {
    return `Compilation error: ${error.message}`;
  }
}

export const compileSmartContractToolDefinition = {
  type: "function",
  function: {
    name: "compile_smart_contract",
    description: "Compiles Solidity source code and returns the ABI and Bytecode.",
    parameters: {
      type: "object",
      properties: {
        sourceCode: { type: "string", description: "The Solidity source code" },
        contractName: { type: "string", description: "The name of the contract to compile" }
      },
      required: ["sourceCode", "contractName"],
    },
  },
};

/**
 * Prepares a transaction to deploy a smart contract.
 */
export async function prepareDeploySmartContract(
  chainName: ChainName,
  abiStr: string,
  bytecode: string,
  argsStr: string = "[]",
  description: string = "Deploy Smart Contract"
): Promise<string> {
  try {
    chainName = normalizeChainName(chainName);
    
    let args: any[];
    try {
      args = JSON.parse(argsStr);
    } catch (e) {
      return "Error: argsStr must be a valid JSON array.";
    }

    let abi: any;
    try {
      abi = JSON.parse(abiStr);
    } catch (e) {
      return "Error: abiStr must be valid JSON.";
    }

    if (!bytecode.startsWith("0x")) {
      bytecode = "0x" + bytecode;
    }

    let data: string;
    try {
      data = encodeDeployData({
        abi,
        bytecode: bytecode as any,
        args
      });
    } catch (e: any) {
      return `Failed to encode deploy data: ${e.message}`;
    }

    // Deploying a contract is basically a custom tx with NO toAddress.
    // The transaction manager / signer must handle null or empty toAddress for deployment.
    // We will set toAddress to empty string to denote deployment.
    const tx = txManager.createPendingTransaction('custom', chainName, {
      toAddress: "", // Empty means contract deployment
      data,
      valueWei: "0",
      description
    });

    return `⏳ **Contract Deployment queued:** ${description} | ${chainName.toUpperCase()} | Please reply with 'Yes' to execute, or 'No' to cancel.`;
  } catch (error: any) {
    return `Failed to prepare deploy tx: ${error.message}`;
  }
}

export const deploySmartContractToolDefinition = {
  type: "function",
  function: {
    name: "deploy_smart_contract",
    description: "Deploy a smart contract using its ABI and Bytecode.",
    parameters: {
      type: "object",
      properties: {
        chainName: { type: "string", enum: SUPPORTED_CHAIN_NAMES },
        abiStr: { type: "string", description: "JSON stringified ABI" },
        bytecode: { type: "string", description: "Hex encoded bytecode (0x...)" },
        argsStr: { type: "string", description: "JSON array of constructor arguments (e.g. '[\"Token\", \"TKN\"]')" },
        description: { type: "string", description: "Description for the deployment" }
      },
      required: ["chainName", "abiStr", "bytecode"],
    },
  },
};
