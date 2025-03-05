import * as analyzer from './analyze';
import * as p5process from './process';
import * as solGen from './sol.generator';
import { compress } from './compress';

export function generateP5(str: string): string {
  return p5process.process(str);
}

export function generateSolidityContract(
  code: string,
  templateSolidity: string
): string {
  const nftContractGenerator = new solGen.NFTContractGenerator();

  const analysis = analyzer.analyzeCode(code);
  const processedCode = p5process.process(code);
  const p5slot = compress(processedCode, 512);

  return templateSolidity
    .replace('%CONTRACT_NAME%', 'NFTCollection')
    .replace('%COLLECTION_CONTRACTS%', nftContractGenerator.generateCollectionAddresses(analysis.collections))
    .replace('%COLLECTION_CODE%', nftContractGenerator.generateCollectionIndexes(analysis.collections))
    .replace('%CHUNKS%', nftContractGenerator.generateP5Storage(p5slot))
    .replace('%COLLECTION_TRAITS%', nftContractGenerator.generateTraitRegistration(analysis.data))
    .replace('%ID_MAPPING%', nftContractGenerator.generateTokenIdMapping(analysis.collections))
    .replace('%REQUIRED_MINT_CODE%', nftContractGenerator.generateOwnershipChecks(analysis.collections))
    .replace('%METADATA_EXP%', nftContractGenerator.generateMetadataExtraction(analysis.traits))
    .replace('%TRAIT_JS%', nftContractGenerator.generateSolidityJsField(analysis.collections))
    .replace('%TRAIT_BASE64%', nftContractGenerator.generateSolidityBase64EncodedField(analysis.collections))
    .replace('%P5_LS%', nftContractGenerator.generateP5Ls(p5slot))
    .replace('%ATTRIBUTES%', nftContractGenerator.generateMetadataSettings(analysis.traits))
    .replace('%CEMENT_METADATA_CODE%', nftContractGenerator.generateMetadataCementing());
}