import path from 'path';
import fs from 'fs';
import { compile } from './contract/contract';

export async function compileContract(contractCode: string, contractName: string) {
  try {
    console.log('Compiling the contract...');

    const nodeModulesDir = path.resolve(process.cwd(), 'node_modules');
    const nodeModules = {
      '@openzeppelin/contracts': path.join(nodeModulesDir, '@openzeppelin', 'contracts'),
      '@forma-dev/sdk': path.join(nodeModulesDir, '@forma-dev', 'sdk'),
    };

    const remappings = [
      '@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/',
      '@forma-dev/sdk/contracts/=node_modules/@forma-dev/sdk/contracts/',
    ];

    for (const [pkg, pkgPath] of Object.entries(nodeModules)) {
      if (!fs.existsSync(pkgPath)) {
        console.warn(`Warning: Path not found for ${pkg}: ${pkgPath}`);
      } else {
        console.log(`${pkg} path verified: ${pkgPath}`);
      }
    }

    const compiledContract = await compile(contractCode, contractName, {
      optimize: true,
      nodeModules,
      remappings,
      evmVersion: 'paris',
      optimizerRuns: 900,
      compilerSettings: {
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'metadata', 'storageLayout'],
          },
        },
      },
    });

    console.log('Contract compiled successfully.');
    console.log('ABI Length:', compiledContract.abi.length);
    console.log('Bytecode Length:', compiledContract.bytecode.length);

    return compiledContract;
  } catch (error) {
    console.error('An error occurred during compilation:');
    console.error(error);
    throw error;
  }
}
