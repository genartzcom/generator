import { Collection, Trait, TraitData, TraitType } from './analyze';

/**
 * Return type for the mint function generator
 */
interface MintFunctionCode {
  /** Function parameter declarations */
  parameters: string;
  /** Token ID mapping code */
  tokenMapping: string;
  /** Ownership verification code */
  ownershipChecks: string;
  /** Metadata extraction code */
  metadataExtraction: string;
}

/**
 * NFT Contract Generator
 * Generates Solidity code for NFT contracts that leverage traits from existing NFTs.
 */
export class NFTContractGenerator {
  // Template strings for Solidity code generation
  private static templates = {
    // Contract structure templates
    collectionAddress: 'address private constant %COLLECTION% = %ADDRESS%;',
    collectionIndex: 'uint256 private constant %COLLECTION%_INDEX = %INDEX%;',
    p5CodeChunk: 'string private constant CHUNK_%INDEX% = "%DATA%";',

    // Metadata access templates
    metadataExtractor: 'string memory %VARIABLE_NAME% = %COLLECTION%.getTokenAttribute(%TOKEN_ID%, "%TRAIT_NAME%");',

    // Token mapping and validation templates
    tokenIdMapping: 'uint256 %TOKEN_ID% = _tokenIds[%COLLECTION%_INDEX];',
    functionParameter: 'uint256 %TOKEN_ID%',
    ownershipCheck: 'require(IERC721(%COLLECTION%).ownerOf(%TOKEN_ID%) == _msgSender(), "Not the owner of required %COLLECTION_NAME%");',

    // Trait registration templates
    traitRegistration: '_traitRegistry[%COLLECTION%_INDEX].push(TraitRegistry("%TYPE%", "%KEY%"));',
    traitSizeSet: '_traitRegistrySize[%COLLECTION%_INDEX] = %SIZE%;',
  };

  public generateSolidityTraitJSField(collection: Collection): string {
    return `string memory ${collection.name}_jsField = generateCollectionTraitJS(${collection.name}, ${collection.name}_INDEX, %);`;
  }

  /**
   * Creates Solidity code for storing p5.js chunks on-chain
   *
   * @param chunks - Array of p5.js code fragments to store on-chain
   * @returns Solidity code declaring constant strings
   */
  public generateP5Storage(chunks: string[]): string {
    let code = chunks
      .map((chunk, index) =>
        NFTContractGenerator.templates.p5CodeChunk.replace('%INDEX%', index.toString()).replace('%DATA%', this._escapeString(chunk)),
      )
      .join('\n');

    code += '\n\nuint256 private constant CHUNK_COUNT = %COUNT%;'.replace('%COUNT%', chunks.length.toString());
    return code;
  }

  public generateP5Ls(chunks: string[]): string {
    let code = '';

    for (let i = 0; i < chunks.length; i++) {
      code += `CHUNK_${i}` + (i === chunks.length - 1 ? '' : ', ');
    }
    return code;
  }

  /**
   * Creates Solidity code for collection address constants
   *
   * @param collections - Array of NFT collections
   * @returns Solidity code defining collection address constants
   */
  public generateCollectionAddresses(collections: Collection[]): string {
    return this._filterValidCollections(collections)
      .map((collection) =>
        NFTContractGenerator.templates.collectionAddress.replace('%COLLECTION%', collection.name).replace('%ADDRESS%', collection.address as string),
      )
      .join('\n');
  }

  /**
   * Creates Solidity code for collection index constants
   *
   * @param collections - Array of NFT collections
   * @returns Solidity code defining collection index constants
   */
  public generateCollectionIndexes(collections: Collection[]): string {
    return this._filterValidCollections(collections)
      .map((collection, index) =>
        NFTContractGenerator.templates.collectionIndex.replace('%COLLECTION%', collection.name).replace('%INDEX%', index.toString()),
      )
      .join('\n');
  }

  public generateSolidityJsField(collections: Collection[]): string {
    return collections
      .map((collection, index) => {
        return `string memory ${collection.name}_jsField = generateCollectionTraitJS("${collection.name}", ${collection.name}, ${collection.name}_INDEX, tokenId_${this._formatName(collection.name)});`;
      })
      .join('\n');
  }

  /**
   * Creates code that extracts metadata from source NFTs
   *
   * @param traits - Array of traits to extract
   * @returns Solidity code for extracting metadata from NFTs
   */
  public generateMetadataExtraction(traits: Trait[]): string {
    return traits
      .filter((trait) => trait.collection && trait.key)
      .map((trait) => {
        const variableName = `trait_${this._formatName(trait.key as string)}_${trait.collection}`;
        const tokenId = `tokenId_${this._formatName(trait.collection)}`;

        return NFTContractGenerator.templates.metadataExtractor
          .replace('%VARIABLE_NAME%', variableName)
          .replace('%COLLECTION%', trait.collection)
          .replace('%TOKEN_ID%', tokenId)
          .replace('%TRAIT_NAME%', trait.key as string);
      })
      .join('\n');
  }

  /**
   * Creates code for mapping token IDs from input parameters
   *
   * @param collections - Array of NFT collections
   * @returns Solidity code for token ID mapping
   */
  public generateTokenIdMapping(collections: Collection[]): string {
    return this._filterValidCollections(collections)
      .map((collection) => {
        const tokenId = `tokenId_${this._formatName(collection.name)}`;

        return NFTContractGenerator.templates.tokenIdMapping.replace('%TOKEN_ID%', tokenId).replace('%COLLECTION%', collection.name);
      })
      .join('\n');
  }

  /**
   * Creates ownership verification checks
   *
   * @param collections - Array of NFT collections
   * @returns Solidity code for ownership verification
   */
  public generateOwnershipChecks(collections: Collection[]): string {
    return this._filterValidCollections(collections)
      .map((collection) => {
        const tokenId = `tokenId_${this._formatName(collection.name)}`;
        const displayName = this._formatName(collection.name);

        return NFTContractGenerator.templates.ownershipCheck
          .replace('%COLLECTION%', collection.name)
          .replace('%TOKEN_ID%', tokenId)
          .replace('%COLLECTION_NAME%', displayName);
      })
      .join('\n');
  }

  /**
   * Creates function parameter list for the mint function
   *
   * @param collections - Array of NFT collections
   * @returns Solidity code for function parameters
   */
  public generateFunctionParameters(collections: Collection[]): string {
    const validCollections = this._filterValidCollections(collections);

    return validCollections
      .map((collection, index) => {
        const tokenId = `tokenId_${this._formatName(collection.name)}`;
        const isLast = index === validCollections.length - 1;

        return NFTContractGenerator.templates.functionParameter.replace('%TOKEN_ID%', tokenId) + (isLast ? '' : ', ');
      })
      .join('');
  }

  /**
   * Creates trait registration code for the constructor
   *
   * @param traitData - Array of trait data objects
   * @returns Solidity code for trait registration
   */
  public generateTraitRegistration(traitData: TraitData[]): string {
    const registrationCode: string[] = [];
    const sizeSetCode: string[] = [];

    traitData.forEach((data) => {
      // Register each trait
      data.traits.forEach((trait) => {
        registrationCode.push(
          NFTContractGenerator.templates.traitRegistration
            .replace('%COLLECTION%', data.collection)
            .replace('%TYPE%', this._mapTraitTypeToSolidity(trait.type))
            .replace('%KEY%', trait.key || ''),
        );
      });

      // Set the size counter
      sizeSetCode.push(
        NFTContractGenerator.templates.traitSizeSet.replace('%COLLECTION%', data.collection).replace('%SIZE%', data.traits.length.toString()),
      );
    });

    return [...registrationCode, ...sizeSetCode].join('\n');
  }

  /**
   * Generates the complete mint function code
   *
   * @param collections - Array of NFT collections
   * @param traits - Array of traits to extract
   * @returns Object containing different sections of the mint function
   */
  public generateMintFunction(collections: Collection[], traits: Trait[]): MintFunctionCode {
    return {
      parameters: this.generateFunctionParameters(collections),
      tokenMapping: this.generateTokenIdMapping(collections),
      ownershipChecks: this.generateOwnershipChecks(collections),
      metadataExtraction: this.generateMetadataExtraction(traits),
    };
  }

  /**
   * Generates code for setting metadata on the new token
   *
   * @param traits - Array of traits to use in metadata
   * @returns Solidity code for setting token metadata
   */
  public generateMetadataSettings(traits: Trait[]): string {
    let code = 'string memory tokenMetadata = "{}";';

    code += '\ntokenMetadata = tokenMetadata';

    const validTraits = traits.filter((trait) => trait.collection && trait.key);

    validTraits.forEach((trait) => {
      const variableName = `trait_${this._formatName(trait.key as string)}_${trait.collection}`;
      const traitName = trait.key as string;

      code += `\n    .setTokenAttribute("${traitName}", ${variableName})`;
    });

    code += `\n   .setTokenAttribute("canvas", canvasBase64)`;

    code += ';';
    return code;
  }

  public generateSolidityBase64EncodedField(collections: Collection[]): string {
    const jsFields = collections.map((collection) => `${collection.name}_jsField`).join(', ');

    return `
        string memory allTraits = string(abi.encodePacked(${jsFields}));
    `;
  }

  /**
   * Generates code for cementing metadata for the new token
   *
   * @returns Solidity code for cementing token metadata
   */
  public generateMetadataCementing(): string {
    return '_cementTokenMetadata(newTokenId);';
  }

  /**
   * Generates complete Solidity contract with all necessary sections
   *
   * @param templateCode - Base template contract code
   * @param result - Analysis result from NFTCodeAnalyzer
   * @param p5Chunks - Array of p5.js code chunks
   * @returns Complete Solidity contract code
   */
  public generateCompleteContract(
    templateCode: string,
    result: {
      collections: Collection[];
      traits: Trait[];
      data: TraitData[];
    },
    p5Chunks: string[],
  ): string {
    const mintFunction = this.generateMintFunction(result.collections, result.traits);

    return templateCode
      .replace('%COLLECTION_CONTRACTS%', this.generateCollectionAddresses(result.collections))
      .replace('%COLLECTION_CODEB%', this.generateCollectionIndexes(result.collections))
      .replace('%COLLECTION_TRAITS%', this.generateTraitRegistration(result.data))
      .replace('%REQUIRED_MINT_CODE%', mintFunction.ownershipChecks)
      .replace('%FETCH_METADATA_CODE%', mintFunction.metadataExtraction)
      .replace('%GENERATE_TOKEN_IMAGE_CODE%', '// Token image generation code here')
      .replace('%SET_METADATA_CODE%', this.generateMetadataSettings(result.traits))
      .replace('%CEMENT_METADATA_CODE%', this.generateMetadataCementing());
  }

  // ===== Private Helper Methods =====

  /**
   * Maps TraitType to Solidity string representation
   *
   * @param type - TraitType to map
   * @returns String representation for Solidity code
   */
  private _mapTraitTypeToSolidity(type: TraitType): string {
    switch (type) {
      case 'asInt':
        return 'asInt';
      case 'asString':
        return 'asString';
      case 'asFloat':
        return 'asFloat';
      default:
        return 'asString'; // Default to string if unknown
    }
  }

  /**
   * Filters out collections with null addresses
   *
   * @param collections - Array of NFT collections
   * @returns Filtered array of valid collections
   */
  private _filterValidCollections(collections: Collection[]): Collection[] {
    return collections.filter((collection) => collection.address);
  }

  /**
   * Formats a name for use in Solidity code
   *
   * @param name - Raw name string
   * @returns Formatted name
   */
  private _formatName(name: string): string {
    return this._capitalize(name.trim().toLowerCase().replace(/\s+/g, '_'));
  }

  /**
   * Capitalizes the first letter of a string
   *
   * @param text - Input string
   * @returns String with first letter capitalized
   */
  private _capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * Escapes special characters in strings for Solidity
   *
   * @param str - Raw string
   * @returns Escaped string
   */
  private _escapeString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}
