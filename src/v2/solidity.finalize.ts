import * as analyzer from './p5.analyzer';
import * as solGen from './solidity.generator';
import { compress } from '../compress';
import { process } from '../process';

export function generateSolidityContract(code: string, templateSolidity: string): string {
  const nftContractGenerator = new solGen.NFTContractGenerator();

  const analysis = analyzer.analyzeCode(code);
  const processedCode = process(code);
  const p5slot = compress(processedCode, 512);

  return templateSolidity
    .replace('%CONTRACT_NAME%', 'NFTCollection')
    .replace('%COLLECTION_CONTRACTS%', nftContractGenerator.generateCollectionAddresses(analysis.collections))
    .replace('%COLLECTION_CODE%', nftContractGenerator.generateCollectionIndexes(analysis.collections))
    .replace('%CHUNKS%', nftContractGenerator.generateP5Storage(p5slot))
    .replace('%COLLECTION_TRAITS%', nftContractGenerator.generateTraitRegistration(analysis.data))
    .replace('%ID_MAPPING%', nftContractGenerator.generateTokenIdMapping(analysis.collections))
    .replace('%REQUIRED_MINT_CODE%', nftContractGenerator.generateOwnershipChecks(analysis.collections))
    .replace('%METADATA_EXP%', nftContractGenerator.generateMetadataExtraction(analysis.collections))
    .replace('%TRAIT_JS%', nftContractGenerator.generateSolidityJsField(analysis.collections))
    .replace('%TRAIT_BASE64%', nftContractGenerator.generateSolidityBase64EncodedField(analysis.collections))
    .replace('%P5_LS%', nftContractGenerator.generateP5Ls(p5slot))
    .replace('%ATTRIBUTES%', nftContractGenerator.generateFullMetadataSettings(analysis.data))
    .replace('%CEMENT_METADATA_CODE%', nftContractGenerator.generateMetadataCementing());
}
