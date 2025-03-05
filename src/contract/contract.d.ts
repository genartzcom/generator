export interface CompilationOptions {
  optimize?: boolean;

  optimizerRuns?: number;

  evmVersion?: string;

  compilerSettings?: Record<string, any>;

  remappings?: string[];

  nodeModules?: Record<string, string>;

  includeLibraries?: boolean;
}

export interface CompiledContract {
  abi: any[];

  bytecode: string;

  deployedBytecode: string;

  metadata: string;
}

export interface DeployOptions {
  provider?: any;

  providerUrl?: string;

  signer?: any;

  privateKey?: string;

  gasLimit?: number | string;

  gasPrice?: number | string;

  value?: number | string;

  nonce?: number;
}

export interface DeploymentResult {
  contract: any;

  receipt: any;

  address: string;

  deployTransaction: any;
}

export function createImportResolver(
  basePath: string,
  nodeModulesMap?: Record<string, string>,
  recursionDepth?: number,
): (importPath: string) => { contents: string } | { error: string };

export async function findFilesByNameInDir(dir: string, fileName: string): string[];

export async function buildPackageMap(packagePath: string): Record<string, string>;

export async function compile(sourceCodeOrPath: string, contractName: string, options?: CompilationOptions): CompiledContract;

export async function deploy(compiledContract: CompiledContract, constructorArgs?: any[], deployOptions?: DeployOptions): Promise<DeploymentResult>;
