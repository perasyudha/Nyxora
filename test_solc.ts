import { compileSmartContract } from './packages/core/src/web3/skills/smartContractSkills';

async function test() {
  const code = `
    // SPDX-License-Identifier: MIT
    pragma solidity ^0.8.0;

    contract HelloWorld {
        string public greeting = "Hello, Web3!";

        function setGreeting(string memory _greeting) public {
            greeting = _greeting;
        }
    }
  `;

  console.log("Compiling HelloWorld...");
  const result = await compileSmartContract(code, "HelloWorld");
  if (result.includes('"status": "success"')) {
    console.log("Compilation Successful!");
    const parsed = JSON.parse(result);
    console.log("ABI length:", parsed.abi.length);
    console.log("Bytecode length:", parsed.bytecode.length);
  } else {
    console.log("Compilation Failed!");
    console.log(result);
  }
}

test();
