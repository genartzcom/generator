import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

export interface Collection {
  name: string;
  address: string | null;
  sourceLocation?: SourceLocation;
}

export interface Trait {
  collection: string;
  key: string | null;
  type: TraitType;
  sourceLocation?: SourceLocation;
}

export interface TraitData {
  collection: string;
  address?: string | null;
  traits: Trait[];
  tokenIndexes: number[];
}

export interface SourceLocation {
  line: number;
  column: number;
  source?: string;
}

export interface AnalysisResult {
  collections: Collection[];
  traits: Trait[];
  data: TraitData[];
  issues: AnalysisIssue[];
  tokenIndexes: TokenIndex[]; // Added tokenIndexes to the result
}

export interface AnalysisIssue {
  type: 'warning' | 'error';
  message: string;
  location?: SourceLocation;
}

export interface TokenIndex {
  collection: string;
  tokenId: number;
}

export type TraitType = 'asInt' | 'asString' | 'asFloat';
export type NodeVisitor = (node: acorn.Node) => void;

export class NFTCodeAnalyzer {
  private collections: Collection[] = [];
  private traits: Trait[] = [];
  private issues: AnalysisIssue[] = [];
  private tokenIndexes: TokenIndex[] = [];

  public analyze(code: string): AnalysisResult {
    try {
      this.reset();
      const ast = this.parseCode(code);
      this.extractCollections(ast);
      this.extractTraits(ast);
      this.extractTokenUsages(ast); // New method to extract token usages
      this.validateData();

      return {
        collections: this.collections,
        traits: this.traits,
        data: this.groupTraitsByCollection(),
        issues: this.issues,
        tokenIndexes: this.tokenIndexes // Include token indexes in the result
      };
    } catch (error) {
      this.addIssue({
        type: 'error',
        message: `Analysis failed: ${(error as Error).message}`
      });

      return {
        collections: this.collections,
        traits: this.traits,
        data: this.groupTraitsByCollection(),
        issues: this.issues,
        tokenIndexes: this.tokenIndexes // Include token indexes even in case of error
      };
    }
  }

  private reset(): void {
    this.collections = [];
    this.traits = [];
    this.issues = [];
    this.tokenIndexes = [];
  }

  private parseCode(code: string): acorn.Node {
    try {
      return acorn.parse(code, {
        ecmaVersion: 2020,
        sourceType: 'module',
        locations: true
      }) as acorn.Node;
    } catch (error) {
      throw new Error(`Failed to parse code: ${(error as Error).message}`);
    }
  }

  private extractCollections(ast: acorn.Node): void {
    walk.simple(ast, {
      VariableDeclarator: (node: any) => {
        if (this.isFormaCollectionCall(node)) {
          this.collections.push(this.createCollection(node));
        }
      }
    });
  }

  private extractTraits(ast: acorn.Node): void {
    walk.simple(ast, {
      CallExpression: (node: any) => {
        const trait = this.extractTrait(node);
        if (trait && !this.isDuplicateTrait(trait)) {
          this.traits.push(trait);
        }
      }
    });
  }

  // New method to extract token usages
  private extractTokenUsages(ast: acorn.Node): void {
    // First, find the setup function
    let setupFunction: any = null;

    walk.simple(ast, {
      FunctionDeclaration: (node: any) => {
        if (node.id && node.id.name === 'setup') {
          setupFunction = node;
        }
      }
    });

    // If we found a setup function, look for collection.useToken() calls within it
    if (setupFunction) {
      walk.simple(setupFunction, {
        CallExpression: (node: any) => {
          if (this.isUseTokenCall(node)) {
            const tokenIndex = this.extractTokenIndex(node);
            if (tokenIndex) {
              this.tokenIndexes.push(tokenIndex);
            }
          }
        }
      });
    }
  }

  // Helper method to determine if a node is a useToken call
  private isUseTokenCall(node: any): boolean {
    return node.callee?.type === 'MemberExpression' &&
      node.callee.property.name === 'useToken' &&
      node.arguments.length > 0;
  }

  // Helper method to extract collection name and token ID from useToken call
  private extractTokenIndex(node: any): TokenIndex | null {
    try {
      const collection = node.callee.object.name;
      const tokenId = this.extractTokenId(node.arguments[0]);

      // Verify that the collection exists
      const collectionExists = this.collections.some(c => c.name === collection);
      if (!collectionExists) {
        this.addIssue({
          type: 'warning',
          message: `useToken references non-existent collection '${collection}'`,
          location: node.loc ? {
            line: node.loc.start.line,
            column: node.loc.start.column
          } : undefined
        });
      }

      // Verify that tokenId is a number
      if (typeof tokenId !== 'number') {
        this.addIssue({
          type: 'warning',
          message: `useToken for collection '${collection}' has non-numeric token ID`,
          location: node.loc ? {
            line: node.loc.start.line,
            column: node.loc.start.column
          } : undefined
        });
        return null;
      }

      return { collection, tokenId };
    } catch (error) {
      this.addIssue({
        type: 'warning',
        message: `Failed to extract token index: ${(error as Error).message}`,
        location: node.loc ? {
          line: node.loc.start.line,
          column: node.loc.start.column
        } : undefined
      });
      return null;
    }
  }

  // Helper method to extract the token ID value from an AST node
  private extractTokenId(node: any): number | null {
    // Direct numeric literal
    if (node.type === 'Literal' && typeof node.value === 'number') {
      return node.value;
    }

    // TODO: Handle more complex cases like variables or expressions
    // This is a simplified implementation

    return null;
  }

  private isFormaCollectionCall(node: any): boolean {
    return node.init &&
      node.init.type === 'CallExpression' &&
      node.init.callee.name === 'FormaCollection';
  }

  private createCollection(node: any): Collection {
    const name = node.id.name;
    const firstArg = node.init.arguments[0];
    const address = firstArg && firstArg.type === 'Literal' ? firstArg.value : null;

    const sourceLocation = node.loc ? {
      line: node.loc.start.line,
      column: node.loc.start.column
    } : undefined;

    if (address === null) {
      this.addIssue({
        type: 'warning',
        message: `Collection '${name}' is missing an address`,
        location: sourceLocation
      });
    }

    return { name, address, sourceLocation };
  }

  private extractTrait(node: any): Trait | null {
    if (!this.isTraitTypeCall(node)) {
      return null;
    }

    const traitType = node.callee.property.name as TraitType;
    const innerNode = node.callee.object;

    if (!this.isMetadataCall(innerNode)) {
      return null;
    }

    const collectionName = innerNode.callee.object.name;
    const keyArg = innerNode.arguments[0];
    const key = keyArg && keyArg.type === 'Literal' ? keyArg.value : null;

    const sourceLocation = node.loc ? {
      line: node.loc.start.line,
      column: node.loc.start.column
    } : undefined;

    if (key === null) {
      this.addIssue({
        type: 'warning',
        message: `Trait in collection '${collectionName}' is missing a key`,
        location: sourceLocation
      });
    }

    return {
      collection: collectionName,
      key,
      type: traitType,
      sourceLocation
    };
  }

  private isTraitTypeCall(node: any): boolean {
    return node.callee?.type === 'MemberExpression' &&
      ['asInt', 'asString', 'asFloat'].includes(node.callee.property.name);
  }

  private isMetadataCall(node: any): boolean {
    return node?.type === 'CallExpression' &&
      node.callee?.type === 'MemberExpression' &&
      node.callee.property.name === 'metadata';
  }

  private isDuplicateTrait(trait: Trait): boolean {
    return this.traits.some(t =>
      t.collection === trait.collection &&
      t.key === trait.key &&
      t.type === trait.type
    );
  }

  private groupTraitsByCollection(): TraitData[] {
    const traitDataMap = new Map<string, TraitData>();

    // First, create entries for all collections with traits
    this.traits.forEach(trait => {
      if (!traitDataMap.has(trait.collection)) {
        traitDataMap.set(trait.collection, {
          collection: trait.collection,
          address: this.collections.find(c => c.name === trait.collection)?.address || null,
          traits: [],
          tokenIndexes: []
        });
      }

      traitDataMap.get(trait.collection)!.traits.push(trait);
    });

    // Then add collections that might only have token usages but no traits
    this.tokenIndexes.forEach(tokenIndex => {
      if (!traitDataMap.has(tokenIndex.collection)) {
        traitDataMap.set(tokenIndex.collection, {
          collection: tokenIndex.collection,
          address: this.collections.find(c => c.name === tokenIndex.collection)?.address || null,
          traits: [],
          tokenIndexes: []
        });
      }

      // Add the token ID to the collection's tokenIndexes array if it's not already there
      const tokenIndexes = traitDataMap.get(tokenIndex.collection)!.tokenIndexes;
      if (!tokenIndexes.includes(tokenIndex.tokenId)) {
        tokenIndexes.push(tokenIndex.tokenId);
      }
    });

    return Array.from(traitDataMap.values());
  }

  private validateData(): void {
    this.traits.forEach(trait => {
      const collectionExists = this.collections.some(c => c.name === trait.collection);
      if (!collectionExists) {
        this.addIssue({
          type: 'warning',
          message: `Trait references non-existent collection '${trait.collection}'`,
          location: trait.sourceLocation
        });
      }
    });

    // Validate token indexes
    this.tokenIndexes.forEach(tokenIndex => {
      const collectionExists = this.collections.some(c => c.name === tokenIndex.collection);
      if (!collectionExists) {
        this.addIssue({
          type: 'warning',
          message: `Token usage references non-existent collection '${tokenIndex.collection}'`
        });
      }
    });
  }

  private addIssue(issue: AnalysisIssue): void {
    this.issues.push(issue);
  }
}

export function analyzeCode(code: string): AnalysisResult {
  const analyzer = new NFTCodeAnalyzer();
  return analyzer.analyze(code);
}