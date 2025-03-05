// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ContractMetadata } from "@forma-dev/sdk/contracts/metadata/ContractMetadata.sol";
import { ERC721Cementable } from "@forma-dev/sdk/contracts/token/ERC721/ERC721Cementable.sol";
import { Ownable, Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ERC721 as ERC721OpenZeppelin } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import { TokenMetadataReader } from "@forma-dev/sdk/contracts/metadata/TokenMetadataReader.sol";
import { TokenMetadataEditor } from "@forma-dev/sdk/contracts/metadata/TokenMetadataEditor.sol";
import { Strings } from "@forma-dev/sdk/contracts/utils/Strings.sol";
import { Base64 } from "@forma-dev/sdk/contracts/utils/Base64.sol";

contract %CONTRACT_NAME% is Ownable2Step, ContractMetadata, ERC721Cementable {

    uint256 private _nextTokenId;

    struct TraitRegistry {
        string jtype;
        string key;
    }

    using TokenMetadataReader for address;
    using TokenMetadataEditor for string;
    using Strings for string;

    %COLLECTION_CONTRACTS%

    %COLLECTION_CODE%

    %CHUNKS%

    mapping(uint256 => TraitRegistry[]) private _traitRegistry;
    mapping(uint256 => uint256) private _traitRegistrySize;

    constructor(
        string memory _name,
        string memory _symbol,
        address _initialOwner
    ) ERC721OpenZeppelin(_name, _symbol) Ownable(_initialOwner) {
        _transferOwnership(_initialOwner);

        %COLLECTION_TRAITS%
    }

    function mint(address _to, uint256[] memory _tokenIds) external {

        %ID_MAPPING%

        %REQUIRED_MINT_CODE%

        %METADATA_EXP%

        %TRAIT_JS%

        %TRAIT_BASE64%

        string memory canvasUnpacked = string(Base64.decode(_getP5Base()));
        string memory canvas = string(abi.encodePacked(allTraits, canvasUnpacked));

        string memory canvasBase64 = Base64.encode(bytes(canvas));


        %ATTRIBUTES%

        uint256 newTokenId = _nextTokenId;

        _setTokenMetadata(newTokenId, tokenMetadata);

        _cementTokenMetadata(newTokenId);

        _safeMint(_to, newTokenId);
        _nextTokenId++;
    }


    function _generateTrait(string memory collection, string[] memory types, string[] memory keys, string[] memory values) internal pure returns (string memory) {
        string memory code = string(abi.encodePacked("const ", collection, " = { traits: { "));
        for(uint i = 0; i < keys.length; i++) {
            code = string(abi.encodePacked(code, "\"", keys[i], "\": { ", types[i], "() { return ", values[i], "; } }", i < keys.length - 1 ? ", " : ""));
        }
        code = string(abi.encodePacked(code, " }, metadata(key) { return this.traits[key]; } };"));
        return code;
    }

    function generateCollectionTraitJS(string memory collectionName, address collectionAddress, uint256 collectionIndex, uint256 tokenId) public view returns (string memory) {
        (string[] memory types, string[] memory keys) = getTraitsFromRegistry(collectionIndex);

        string[] memory values = getTraitValuesFromContract(collectionAddress, tokenId, keys);

        return _generateTrait(collectionName, types, keys, values);
    }

    function getTraitValuesFromContract(address collectionAddress, uint256 tokenId, string[] memory keys) internal view returns (string[] memory) {
        string[] memory values = new string[](keys.length);

        for (uint i = 0; i < keys.length; i++) {
            values[i] = collectionAddress.getTokenMetadata(tokenId, keys[i]);
        }

        return values;
    }

    function getTraitsFromRegistry(uint256 collectionIndex) internal view returns (string[] memory, string[] memory) {
        uint256 size = _traitRegistrySize[collectionIndex];
        require(size > 0, "No traits found for this collection");

        string[] memory types = new string[](size);
        string[] memory keys = new string[](size);

        for (uint i = 0; i < size; i++) {
            types[i] = _traitRegistry[collectionIndex][i].jtype;
            keys[i] = _traitRegistry[collectionIndex][i].key;
        }

        return (types, keys);
    }

    function _getP5Base() internal pure returns (string memory) {
        return string(abi.encodePacked(%P5_LS%));
    }

    function name() public view override(ERC721OpenZeppelin, ContractMetadata) returns (string memory) {
        return ContractMetadata.name();
    }

    function _canSetContractMetadata() internal view override returns (bool) {
        return owner() == _msgSender();
    }

    function _canSetTokenMetadata(uint256) internal view override returns (bool) {
        return owner() == _msgSender();
    }
}
