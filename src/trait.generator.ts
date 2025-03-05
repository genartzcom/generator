import { ethers } from "ethers";
import { TokenIndex, Trait, TraitData } from "./v2/p5.analyzer";
import axios from "axios";

/**
 * Configuration for blockchain connection
 */
const CONFIG = {
  RPC_URL: "https://rpc.forma.art",
  CHAIN_ID: 984122,
  // Enhanced ABI to support multiple metadata retrieval methods
  CONTRACT_ABI: [
    // Basic ERC721 functions
    "function balanceOf(address owner) external view returns (uint256)",
    "function name() external view returns (string)",
    "function symbol() external view returns (string)",

    // Forma-specific metadata function
    "function getTokenMetadata(uint256 _tokenId) external view returns (string memory)",

    // Standard ERC721 metadata function
    "function tokenURI(uint256 _tokenId) external view returns (string memory)",

    // ERC721Enumerable functions
    "function totalSupply() external view returns (uint256)",
    "function tokenByIndex(uint256 _index) external view returns (uint256)",

    // OpenSea-style metadata (some collections use this)
    "function uri(uint256 _tokenId) external view returns (string memory)",
  ]
};

/**
 * Possible metadata retrieval methods
 */
export type MetadataSourceType =
  | 'forma'       // Retrieved using Forma's getTokenMetadata
  | 'erc721'      // Retrieved using standard tokenURI
  | 'opensea'     // Retrieved using OpenSea's uri method
  | 'unknown';    // For fallback cases or when source is unclear

/**
 * Structure to represent the result of a metadata retrieval operation
 */
export interface MetadataResult {
  // The actual metadata for the token
  metadata: any;

  // Which method was successfully used to retrieve the metadata
  sourceType: MetadataSourceType;

  // The original URI or source from which the metadata was retrieved (if applicable)
  source?: string;

  // Success status
  success: boolean;

  // Error message in case of failure
  error?: string;
}

/**
 * Trait value with its original and formatted values
 */
export interface TraitValue {
  original: any;        // The original value from the metadata
  formatted: any;       // The value formatted according to the trait type
  traitType: string;    // The trait type (asString, asInt, asFloat)
}

/**
 * Result of the code generation for a single collection
 */
export interface CollectionCodeResult {
  collectionName: string;              // Name of the collection
  address: string | null;              // Contract address
  code: string;                        // Generated JavaScript code
  metadataSource: MetadataSourceType;  // Source of the metadata
  traitValues: Record<string, TraitValue>; // Values for each trait
  metadata: any;                       // Raw metadata if retrieved
  tokenId: number;                     // Token ID that was used
  success: boolean;                    // Whether generation was successful
  error?: string;                      // Error message if unsuccessful
}

/**
 * Result of generating code for multiple collections
 */
export interface CollectionsCodeResult {
  collections: CollectionCodeResult[];  // Results for each collection
  combinedCode: string;                 // All collection codes combined
  successCount: number;                 // Number of successful generations
  failureCount: number;                 // Number of failed generations
}

/**
 * Class responsible for handling NFT metadata retrieval and code generation
 */
export class NFTMetadataHandler {
  private provider: ethers.JsonRpcProvider;

  constructor(rpcUrl: string = CONFIG.RPC_URL, chainId: number = CONFIG.CHAIN_ID) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
  }

  /**
   * Generate code for all collections
   */
  public async generateFormaCollectionCodes(
    collections: TraitData[],
  ): Promise<CollectionsCodeResult> {
    const results: CollectionCodeResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Process each collection
    for (let i = 0; i < collections.length; i++) {
      const result = await this.generateFormaCollectionCode(collections[i]);
      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    // Combine all the codes
    const combinedCode = results.map(result => result.code).join('\n');

    return {
      collections: results,
      combinedCode,
      successCount,
      failureCount
    };
  }

  /**
   * Generate code for a single collection
   */
  public async generateFormaCollectionCode(
    collection: TraitData,
  ): Promise<CollectionCodeResult> {
    // Determine which token ID to use
    const tokenId = collection.tokenIndexes && collection.tokenIndexes.length > 0
      ? collection.tokenIndexes[0]
      : 1;

    const traitValues: Record<string, TraitValue> = {};
    let rawMetadata: any = null;
    let metadataSource: MetadataSourceType = 'unknown';
    let error: string | undefined;

    try {
      if (collection.address) {
        const contract = new ethers.Contract(
          collection.address,
          CONFIG.CONTRACT_ABI,
          this.provider,
        );

        // Try to fetch metadata
        const result = await this.fetchTokenMetadata(contract, tokenId);

        if (result.success && result.metadata) {
          metadataSource = result.sourceType;
          rawMetadata = result.metadata;

          // Extract values from the metadata
          const extractedValues = this.extractTraitValues(result.metadata);

          // Format values according to trait types
          const traits = collection.traits || [];
          for (const trait of traits) {
            const key = trait.key || '';
            const extractedValue = extractedValues[key];

            let formattedValue;
            if (extractedValue === undefined) {
              // Use default values if the trait wasn't found in the metadata
              formattedValue = this.getDefaultValue(trait.type);
            } else {
              // Format according to trait type
              formattedValue = this.formatValue(extractedValue, trait.type);
            }

            traitValues[key] = {
              original: extractedValues[key],
              formatted: formattedValue,
              traitType: trait.type
            };
          }

          console.log(`Successfully retrieved metadata using ${result.sourceType} method`);
        } else {
          error = result.error || 'Unknown error retrieving metadata';
          console.error(`Failed to retrieve metadata: ${error}`);
        }
      } else {
        error = 'Collection has no address';
      }
    } catch (err: any) {
      error = `Error generating collection code: ${err.message}`;
      console.error(error);
    }

    // Generate the code with the retrieved values
    const code = this.generateCode(
      collection.collection,
      collection.traits || [],
      traitValues,
      metadataSource
    );

    return {
      collectionName: collection.collection,
      address: collection.address || null,
      code,
      metadataSource,
      traitValues,
      metadata: rawMetadata,
      tokenId,
      success: !error,
      error
    };
  }

  /**
   * Generate JavaScript code for a collection
   */
  private generateCode(
    collectionName: string,
    traits: Trait[],
    traitValues: Record<string, TraitValue>,
    metadataSource: MetadataSourceType
  ): string {
    let code = `const ${collectionName} = {\n`;
    code += `  // Metadata source: ${metadataSource}\n`;
    code += `  traits: {\n`;

    // Generate code for each trait
    for (let i = 0; i < traits.length; i++) {
      const trait = traits[i];
      const traitKey = trait.key || '';
      const value = traitValues[traitKey]?.formatted ?? this.getDefaultValue(trait.type);

      let formattedValue: string;
      if (trait.type === 'asString') {
        formattedValue = typeof value === 'string'
          ? `'${value.replace(/'/g, "\\'")}'`
          : `'${String(value).replace(/'/g, "\\'")}'`;
      } else {
        formattedValue = String(value);
      }

      code += `    "${traitKey}": {\n`;
      code += `      ${trait.type}() {\n`;
      code += `        return ${formattedValue};\n`;
      code += `      }\n`;
      code += `    },\n`;
    }

    code += `  },\n`;
    code += `  metadata(key) {\n`;
    code += `    return this.traits[key];\n`;
    code += `  },\n`;

    // Add the useToken method for compatibility
    code += `  useToken(tokenId) {\n`;
    code += `    console.log('Using token', tokenId);\n`;
    code += `    return this;\n`;
    code += `  }\n`;

    code += `};\n`;

    return code;
  }

  /**
   * Get default value for a trait type
   */
  private getDefaultValue(traitType: string): any {
    const defaults: Record<string, any> = {
      asString: '',
      asInt: 0,
      asFloat: 0.0,
    };

    return defaults[traitType] ?? '';
  }

  /**
   * Format a value according to a trait type
   */
  private formatValue(value: any, traitType: string): any {
    switch (traitType) {
      case 'asString':
        return String(value);
      case 'asInt':
        return parseInt(value) || 0;
      case 'asFloat':
        return parseFloat(value) || 0.0;
      default:
        return value;
    }
  }

  /**
   * Function to fetch metadata from a contract
   */
  public async fetchTokenMetadata(
    contract: ethers.Contract,
    tokenId: number
  ): Promise<MetadataResult> {
    try {
      // Method 1: Try Forma's getTokenMetadata function
      try {
        const tokenMetadata = await contract.getTokenMetadata(tokenId);

        // If it's already JSON, parse it
        if (typeof tokenMetadata === 'string' && tokenMetadata.startsWith('{')) {
          return {
            metadata: JSON.parse(tokenMetadata),
            sourceType: 'forma',
            source: 'getTokenMetadata',
            success: true
          };
        }

        // If it's a base64 encoded JSON
        if (typeof tokenMetadata === 'string' && tokenMetadata.includes('base64')) {
          const parsedMetadata = this.parseBase64Metadata(tokenMetadata);
          if (parsedMetadata) {
            return {
              metadata: parsedMetadata,
              sourceType: 'forma',
              source: 'getTokenMetadata (base64)',
              success: true
            };
          }
        }
      } catch (error) {
        console.log("getTokenMetadata failed, trying alternative methods...");
      }

      // Method 2: Try standard ERC721 tokenURI function
      try {
        const tokenURI = await contract.tokenURI(tokenId);
        const metadata = await this.fetchMetadataFromURI(tokenURI);

        if (metadata) {
          return {
            metadata,
            sourceType: 'erc721',
            source: tokenURI,
            success: true
          };
        }
      } catch (error) {
        console.log("tokenURI method failed, trying next method...");
      }

      // Method 3: Try OpenSea-style uri function
      try {
        const uri = await contract.uri(tokenId);
        const metadata = await this.fetchMetadataFromURI(uri);

        if (metadata) {
          return {
            metadata,
            sourceType: 'opensea',
            source: uri,
            success: true
          };
        }
      } catch (error) {
        console.log("uri method failed, no more methods to try");
      }

      // If we got here, all methods failed
      return {
        metadata: null,
        sourceType: 'unknown',
        success: false,
        error: "Failed to retrieve metadata using all available methods"
      };
    } catch (error: any) {
      console.error("Error fetching token metadata:", error);
      return {
        metadata: null,
        sourceType: 'unknown',
        success: false,
        error: `Unexpected error: ${error.message}`
      };
    }
  }

  /**
   * Parse base64 encoded metadata
   */
  private parseBase64Metadata(data: string): any {
    try {
      // Extract the base64 part
      const base64Match = data.match(/^data:\w+\/\w+;base64,(.+)$/);
      if (base64Match) {
        const base64Data = base64Match[1];
        const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
        return JSON.parse(decodedData);
      }
      return null;
    } catch (error) {
      console.error("Error parsing base64 metadata:", error);
      return null;
    }
  }

  /**
   * Fetch metadata from a URI
   */
  private async fetchMetadataFromURI(uri: string): Promise<any> {
    try {
      // Handle IPFS URIs
      if (uri.startsWith('ipfs://')) {
        const ipfsHash = uri.replace('ipfs://', '');
        uri = `https://ipfs.io/ipfs/${ipfsHash}`;
      }

      // Handle HTTP URIs
      if (uri.startsWith('http')) {
        const response = await axios.get(uri);
        return response.data;
      }

      // Handle base64 encoded JSON
      if (uri.startsWith('data:application/json;base64,')) {
        return this.parseBase64Metadata(uri);
      }

      throw new Error(`Unsupported URI format: ${uri}`);
    } catch (error) {
      console.error("Error fetching metadata from URI:", error);
      return null;
    }
  }

  /**
   * Extract trait values from metadata based on common formats
   */
  private extractTraitValues(metadata: any): Record<string, any> {
    const values: Record<string, any> = {};

    if (!metadata) return values;

    // Handle array of attributes (OpenSea standard format)
    // [{trait_type: "Background", value: "Blue"}, ...]
    const attributes = metadata.attributes || metadata.traits || [];
    if (Array.isArray(attributes)) {
      attributes.forEach((attribute: any) => {
        const traitType = attribute.trait_type || attribute.name;
        if (traitType) {
          values[traitType] = attribute.value;
        }
      });
    }
    // Handle object format {Background: "Blue", Eyes: "Green", ...}
    else if (typeof attributes === 'object') {
      Object.entries(attributes).forEach(([key, value]) => {
        values[key] = value;
      });
    }

    // If there are no attributes but there are properties at the top level,
    // use those as traits (some NFTs structure metadata this way)
    if (Object.keys(values).length === 0) {
      Object.entries(metadata).forEach(([key, value]) => {
        // Skip common non-trait metadata fields
        if (!['name', 'description', 'image', 'external_url', 'animation_url'].includes(key)) {
          values[key] = value;
        }
      });
    }

    return values;
  }
}

// Export convenience functions that use the default handler
const defaultHandler = new NFTMetadataHandler();

export const generateFormaCollectionCode = async (collection: TraitData): Promise<CollectionCodeResult> => {
  return defaultHandler.generateFormaCollectionCode(collection);
};

export const generateFormaCollectionCodes = async (collections: TraitData[]): Promise<CollectionsCodeResult> => {
  return defaultHandler.generateFormaCollectionCodes(collections);
};

export const fetchTokenMetadata = async (contract: ethers.Contract, tokenId: number): Promise<MetadataResult> => {
  return defaultHandler.fetchTokenMetadata(contract, tokenId);
};