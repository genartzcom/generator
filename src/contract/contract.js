const solc = require('solc');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

function createImportResolver(basePath, nodeModulesMap = {}, recursionDepth = 0) {
  const MAX_RECURSION = 10;
  if (recursionDepth > MAX_RECURSION) {
    throw new Error(`Maximum import recursion depth exceeded (${MAX_RECURSION})`);
  }

  return function (importPath) {
    console.log(`Resolving import: ${importPath}`);

    try {
      let resolvedPath;

      if (importPath.startsWith('@')) {
        const parts = importPath.split('/');
        const packageName = parts.slice(0, 2).join('/');
        const packagePath = nodeModulesMap[packageName];

        if (packagePath) {
          const relPath = parts.slice(2).join('/');
          resolvedPath = path.join(packagePath, relPath);
          console.log(`  Package import resolved to: ${resolvedPath}`);
        } else {
          return { error: `Package not found in nodeModulesMap: ${packageName}` };
        }
      } else if (path.isAbsolute(importPath)) {
        resolvedPath = importPath;
        console.log(`  Absolute path: ${resolvedPath}`);
      } else {
        const contextDir = path.dirname(basePath);
        resolvedPath = path.resolve(contextDir, importPath);
        console.log(`  Relative import resolved to: ${resolvedPath}`);

        if (!fs.existsSync(resolvedPath) && nodeModulesMap['@forma-dev/sdk']) {
          const formaPath = path.join(nodeModulesMap['@forma-dev/sdk'], 'contracts');

          if (importPath.startsWith('./')) {
            const purePath = importPath.substring(2);
            resolvedPath = path.join(formaPath, purePath);
          } else if (importPath.startsWith('../')) {
            const currentPathParts = basePath.split('/');
            const currentDirName = currentPathParts[currentPathParts.length - 2];

            const knownDirs = ['utils', 'metadata', 'token', 'interfaces', 'common', 'precompile'];

            if (knownDirs.includes(currentDirName)) {
              const sdkBasePath = path.dirname(formaPath);
              resolvedPath = path.join(sdkBasePath, importPath.substring(3));
            }
          }

          console.log(`  Trying Forma SDK path: ${resolvedPath}`);
        }

        if (!fs.existsSync(resolvedPath) && nodeModulesMap['@openzeppelin/contracts']) {
          if (importPath.includes('../../')) {
            const ozPath = nodeModulesMap['@openzeppelin/contracts'];
            const relativePath = importPath.replace(/^(\.\.\/)+/, '');
            resolvedPath = path.join(ozPath, relativePath);
            console.log(`  Trying OpenZeppelin path: ${resolvedPath}`);
          }
        }
      }

      if (fs.existsSync(resolvedPath)) {
        const content = fs.readFileSync(resolvedPath, 'utf8');
        return { contents: content };
      } else {
        const fileName = path.basename(importPath);

        for (const [pkgName, pkgPath] of Object.entries(nodeModulesMap)) {
          const foundFiles = findFilesByNameInDir(pkgPath, fileName);

          if (foundFiles.length > 0) {
            const foundPath = foundFiles[0];
            console.log(`  Found by filename search: ${foundPath}`);
            const content = fs.readFileSync(foundPath, 'utf8');
            return { contents: content };
          }
        }

        return { error: `File not found: ${resolvedPath}` };
      }
    } catch (error) {
      return { error: `Error resolving import ${importPath}: ${error.message}` };
    }
  };
}

function findFilesByNameInDir(dir, fileName) {
  const results = [];

  try {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);

      if (fs.statSync(fullPath).isDirectory()) {
        results.push(...findFilesByNameInDir(fullPath, fileName));
      } else if (file === fileName) {
        results.push(fullPath);
      }
    }
  } catch (error) {
    console.warn(`Error searching directory ${dir}: ${error.message}`);
  }

  return results;
}

function buildPackageMap(packagePath) {
  const fileMap = {};

  function processDirectory(dir, basePath) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);
      const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');

      if (fs.statSync(fullPath).isDirectory()) {
        processDirectory(fullPath, basePath);
      } else if (file.endsWith('.sol')) {
        fileMap[relativePath] = fs.readFileSync(fullPath, 'utf8');
      }
    }
  }

  processDirectory(packagePath, packagePath);
  return fileMap;
}

function compile(sourceCodeOrPath, contractName, options = {}) {
  let isFile = false;
  let sourceCode = sourceCodeOrPath;
  let sourcePath = 'contract.sol';

  try {
    if (fs.existsSync(sourceCodeOrPath) && fs.statSync(sourceCodeOrPath).isFile()) {
      isFile = true;
      sourceCode = fs.readFileSync(sourceCodeOrPath, 'utf8');
      sourcePath = sourceCodeOrPath;
    }
  } catch (error) {
    isFile = false;
  }

  const nodeModulesMap = options.nodeModules || {};
  const cwd = process.cwd();

  if (!nodeModulesMap['@openzeppelin/contracts']) {
    const defaultPath = path.join(cwd, 'node_modules', '@openzeppelin', 'contracts');
    if (fs.existsSync(defaultPath)) {
      nodeModulesMap['@openzeppelin/contracts'] = defaultPath;
    }
  }

  if (!nodeModulesMap['@forma-dev/sdk']) {
    const defaultPath = path.join(cwd, 'node_modules', '@forma-dev', 'sdk');
    if (fs.existsSync(defaultPath)) {
      nodeModulesMap['@forma-dev/sdk'] = defaultPath;
    }
  }

  console.log(`Compiling contract: ${contractName}`);
  console.log(`Using source ${isFile ? 'file' : 'code'}: ${isFile ? sourcePath : 'inline code'}`);
  console.log('Node modules paths:');
  Object.entries(nodeModulesMap).forEach(([pkg, path]) => {
    console.log(`  ${pkg}: ${path}`);
  });

  const importResolver = createImportResolver(sourcePath, nodeModulesMap);

  const sources = {
    [sourcePath]: { content: sourceCode },
  };

  if (options.includeLibraries) {
    if (nodeModulesMap['@openzeppelin/contracts']) {
      const ozFiles = buildPackageMap(nodeModulesMap['@openzeppelin/contracts']);
      for (const [filePath, content] of Object.entries(ozFiles)) {
        sources[`@openzeppelin/contracts/${filePath}`] = { content };
      }
    }

    if (nodeModulesMap['@forma-dev/sdk']) {
      const formaFiles = buildPackageMap(path.join(nodeModulesMap['@forma-dev/sdk'], 'contracts'));
      for (const [filePath, content] of Object.entries(formaFiles)) {
        sources[`@forma-dev/sdk/contracts/${filePath}`] = { content };
      }
    }
  }

  const input = {
    language: 'Solidity',
    sources,
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'metadata'],
        },
      },
      viaIR: true,
      optimizer: {
        enabled: options.optimize || false,
        runs: options.optimizerRuns || 900,
      },
      evmVersion: options.evmVersion || 'paris',
      remappings: options.remappings || [],
      ...options.compilerSettings,
    },
  };

  const inputJSON = JSON.stringify(input);

  console.log('Starting compilation...');
  const output = JSON.parse(solc.compile(inputJSON, { import: importResolver }));

  if (output.errors) {
    const warnings = output.errors.filter((e) => e.severity === 'warning');
    const errors = output.errors.filter((e) => e.severity === 'error');

    if (warnings.length > 0) {
      console.warn(`Compilation warnings: ${warnings.length}`);
      warnings.forEach((w) => console.warn(w.formattedMessage));
    }

    if (errors.length > 0) {
      throw new Error(`Compilation errors: ${JSON.stringify(errors, null, 2)}`);
    }
  }

  let contract = null;

  for (const file in output.contracts) {
    if (output.contracts[file][contractName]) {
      contract = output.contracts[file][contractName];
      break;
    }
  }

  if (!contract) {
    throw new Error(
      `Contract ${contractName} not found in compilation output. Available contracts: ${Object.keys(output.contracts)
        .map((file) => Object.keys(output.contracts[file]).join(', '))
        .join(', ')}`,
    );
  }

  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
    deployedBytecode: contract.evm.deployedBytecode.object,
    metadata: contract.metadata,
  };
}

async function deploy(compiledContract, constructorArgs = [], deployOptions = {}) {
  const { abi, bytecode } = compiledContract;

  if (!bytecode) {
    throw new Error('No bytecode provided for deployment');
  }

  if (!abi) {
    throw new Error('No ABI provided for deployment');
  }

  let provider;
  if (deployOptions.provider) {
    provider = deployOptions.provider;
  } else if (deployOptions.providerUrl) {
    provider = new ethers.JsonRpcProvider(deployOptions.providerUrl);
  } else {
    throw new Error('No provider or providerUrl specified for deployment');
  }

  let signer;
  if (deployOptions.signer) {
    signer = deployOptions.signer;
  } else if (deployOptions.privateKey) {
    signer = new ethers.Wallet(deployOptions.privateKey, provider);
  } else {
    throw new Error('No signer or privateKey specified for deployment');
  }

  try {
    const factory = new ethers.ContractFactory(abi, bytecode, signer);

    const overrides = {};

    if (deployOptions.gasLimit !== undefined) overrides.gasLimit = deployOptions.gasLimit;
    if (deployOptions.gasPrice !== undefined) overrides.gasPrice = deployOptions.gasPrice;
    if (deployOptions.value !== undefined) overrides.value = deployOptions.value;
    if (deployOptions.nonce !== undefined) overrides.nonce = deployOptions.nonce;

    console.log('Deploy options:', JSON.stringify(overrides));
    console.log('Constructor args:', constructorArgs);

    let contract;

    if (constructorArgs.length === 0) {
      contract = await factory.deploy(overrides);
    } else {
      contract = await factory.deploy(...constructorArgs, overrides);
    }

    console.log('Waiting for deployment transaction to be mined...');
    const receipt = await contract.deploymentTransaction().wait();

    return {
      contract,
      receipt,
      address: contract.target,
      deployTransaction: contract.deploymentTransaction(),
    };
  } catch (error) {
    console.error('Deploy error:', error);
    if (error.code === 'INVALID_ARGUMENT') {
      console.error('Argument error details:', {
        argument: error.argument,
        value: error.value,
        shortMessage: error.shortMessage,
      });
    }
    throw error;
  }
}

module.exports = {
  compile,
  deploy,
};

exports.compile = compile;
exports.deploy = deploy;
