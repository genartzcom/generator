import { Collection, Trait, TraitData, TraitType } from './p5.analyzer';

interface MintFunctionCode {
  parameters: string;
  tokenMapping: string;
  ownershipChecks: string;
  metadataExtraction: string;
}

export class NFTContractGenerator {
  private static templates = {
    collectionAddress: 'address private constant %COLLECTION% = %ADDRESS%;',
    collectionIndex: 'uint256 private constant %COLLECTION%_INDEX = %INDEX%;',
    p5CodeChunk: 'string private constant CHUNK_%INDEX% = "%DATA%";',
    metadataExtractor: 'string memory %VARIABLE_NAME% = %COLLECTION%.getTokenMetadata(%TOKEN_ID%);',
    tokenIdMapping: 'uint256 %TOKEN_ID% = _tokenIds[%COLLECTION%_INDEX];',
    functionParameter: 'uint256 %TOKEN_ID%',
    ownershipCheck: 'require(IERC721(%COLLECTION%).ownerOf(%TOKEN_ID%) == _msgSender(), "Not the owner of required %COLLECTION_NAME%");',
    traitRegistration: '_traitRegistry[%COLLECTION%_INDEX].push(TraitRegistry("%TYPE%", "%KEY%"));',
    traitSizeSet: '_traitRegistrySize[%COLLECTION%_INDEX] = %SIZE%;',
  };

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

  public generateCollectionAddresses(collections: Collection[]): string {
    return this._filterValidCollections(collections)
      .map((collection) =>
        NFTContractGenerator.templates.collectionAddress.replace('%COLLECTION%', collection.name).replace('%ADDRESS%', collection.address as string),
      )
      .join('\n');
  }

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

  // Method to extract complete metadata from collections
  public generateMetadataExtraction(collections: Collection[]): string {
    return this._filterValidCollections(collections)
      .map((collection) => {
        const variableName = `metadata_${this._formatName(collection.name)}`;
        const tokenId = `tokenId_${this._formatName(collection.name)}`;

        return `string memory ${variableName} = ${collection.name}.getTokenMetadata(${tokenId});`;
      })
      .join('\n');
  }

// Method to set metadata using the complete metadata object
  public generateFullMetadataSettings(traitData: TraitData[]): string {
    let code = 'string memory tokenMetadata = "{}";';
    code += '\ntokenMetadata = tokenMetadata';

    // Add each collection's metadata as a metadata attribute
    traitData.forEach(data => {
      const collectionName = data.collection;
      code += `\n    .setTokenAttribute("${collectionName.toLowerCase()}_metadata", metadata_${this._formatName(collectionName)})`;
    });

    code += `\n    .setTokenAttribute("canvas", canvasBase64)`;
    code += ';';
    return code;
  }

  private _uniqueCollections(traits: Trait[]): string[] {
    const collections = new Set<string>();
    traits.forEach(trait => {
      if (trait.collection) {
        collections.add(trait.collection);
      }
    });
    return Array.from(collections);
  }

  public generateTokenIdMapping(collections: Collection[]): string {
    return this._filterValidCollections(collections)
      .map((collection) => {
        const tokenId = `tokenId_${this._formatName(collection.name)}`;

        return NFTContractGenerator.templates.tokenIdMapping.replace('%TOKEN_ID%', tokenId).replace('%COLLECTION%', collection.name);
      })
      .join('\n');
  }

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

  public generateTraitRegistration(traitData: TraitData[]): string {
    const registrationCode: string[] = [];
    const sizeSetCode: string[] = [];

    traitData.forEach((data) => {
      data.traits.forEach((trait) => {
        registrationCode.push(
          NFTContractGenerator.templates.traitRegistration
            .replace('%COLLECTION%', data.collection)
            .replace('%TYPE%', this._mapTraitTypeToSolidity(trait.type))
            .replace('%KEY%', trait.key || ''),
        );
      });

      sizeSetCode.push(
        NFTContractGenerator.templates.traitSizeSet.replace('%COLLECTION%', data.collection).replace('%SIZE%', data.traits.length.toString()),
      );
    });

    return [...registrationCode, ...sizeSetCode].join('\n');
  }

  public generateMintFunction(collections: Collection[]): MintFunctionCode {
    return {
      parameters: this.generateFunctionParameters(collections),
      tokenMapping: this.generateTokenIdMapping(collections),
      ownershipChecks: this.generateOwnershipChecks(collections),
      metadataExtraction: this.generateMetadataExtraction(collections),
    };
  }

  public generateMetadataSettings(traits: Trait[]): string {
    let code = 'string memory tokenMetadata = "{}";';
    code += '\ntokenMetadata = tokenMetadata';

    this._uniqueCollections(traits).forEach(collection => {
      code += `\n    .setTokenJson("${collection.toLowerCase()}", metadata_${this._formatName(collection)})`;
    });

    code += `\n    .setTokenAttribute("canvas", canvasBase64)`;
    code += ';';
    return code;
  }

  public generateSolidityBase64EncodedField(collections: Collection[]): string {
    const jsFields = collections.map((collection) => `${collection.name}_jsField`).join(', ');

    return `
        string memory allTraits = string(abi.encodePacked(${jsFields}));
    `;
  }

  public generateMetadataCementing(): string {
    return '_cementTokenMetadata(newTokenId);';
  }

  private _mapTraitTypeToSolidity(type: TraitType): string {
    switch (type) {
      case 'asInt':
        return 'asInt';
      case 'asString':
        return 'asString';
      case 'asFloat':
        return 'asFloat';
      default:
        return 'asString';
    }
  }

  private _filterValidCollections(collections: Collection[]): Collection[] {
    return collections.filter((collection) => collection.address);
  }

  private _formatName(name: string): string {
    return this._capitalize(name.trim().toLowerCase().replace(/\s+/g, '_'));
  }

  private _capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  private _escapeString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}