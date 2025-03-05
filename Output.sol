// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ContractMetadata} from "@forma-dev/sdk/contracts/metadata/ContractMetadata.sol";
import {ERC721Cementable} from "@forma-dev/sdk/contracts/token/ERC721/ERC721Cementable.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ERC721 as ERC721OpenZeppelin} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {TokenMetadataReader} from "@forma-dev/sdk/contracts/metadata/TokenMetadataReader.sol";
import {TokenMetadataEditor} from "@forma-dev/sdk/contracts/metadata/TokenMetadataEditor.sol";
import {Strings} from "@forma-dev/sdk/contracts/utils/Strings.sol";
import {Base64} from "@forma-dev/sdk/contracts/utils/Base64.sol";

contract NFTCollection is Ownable2Step, ContractMetadata, ERC721Cementable {

    struct TraitRegistry {
        string jtype;
        string key;
    }

    using TokenMetadataReader for address;
    using TokenMetadataEditor for string;
    using Strings for string;

    address private constant MAMMOTHS = 0xC737D98ce1DDdd49295C1507a015600f8ae1D18C;
    address private constant OTHER = 0xC737D98ce1DDdd49295C1507a015600f8ae1D18C;

    uint256 private constant MAMMOTHS_INDEX = 0;
    uint256 private constant OTHER_INDEX = 1;

    string private constant CHUNK_0 = "Y2xhc3MgQU1ldGFkYXRhQXR0cmlidXRlIHsKICBjb25zdHJ1Y3RvcihrZXksIHR5cGUsIHZhbHVlKSB7CiAgICB0aGlzLmtleSA9IGtleTsKICAgIHRoaXMudHlwZSA9IHR5cGU7CiAgICB0aGlzLnZhbHVlID0gdmFsdWU7CiAgfQoKICBhc1N0cmluZygpIHt9CgogIGFzSW50KCkge30KCiAgYXNGbG9hdCgpIHt9Cn0KCmNsYXNzIEFGb3JtYUNvbGxlY3Rpb24gewogIGNvbnN0cnVjdG9yKGFkZHJlc3MpIHsKICAgIHRoaXMuYWRkcmVzcyA9IGFkZHJlc3M7CiAgICB0aGlzLnJlcXVpcmUgPSBmYWxzZTsKICAgIHRoaXMubWV0YWRhdGFzID0ge307CiAgfQoKICBtZXRhZGF0YShrZXkpIHsKICAgIHJldHVybiBuZXcgQU1ldGFkYXRhQXR0cmlidXRlKGtleSwgJ3ZhbHVlJywgJ3Rl";
    string private constant CHUNK_1 = "c3QnKTsKICB9CgogIGV4aXN0cygpIHsKICAgIHJldHVybiB0cnVlOwogIH0KCiAgcmVxdWlyZSgpIHsKICAgIHRoaXMucmVxdWlyZSA9IHRydWU7CiAgfQp9CgpmdW5jdGlvbiBGb3JtYUNvbGxlY3Rpb24oYWRkcmVzcykgewogIHJldHVybiBuZXcgQUZvcm1hQ29sbGVjdGlvbihhZGRyZXNzKTsKfQoKCi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0KCgoKCgoKCgovLyAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioq";
    string private constant CHUNK_2 = "KioqCgpmdW5jdGlvbiBzZXR1cCgpIHsKCn0KCmZ1bmN0aW9uIGRyYXcoKSB7CiAgYmFja2dyb3VuZCgyNTUpOwoKICBsZXQgdiA9IDA7CiAgaWYgKE1BTU1PVEhTLmV4aXN0cygpKSB7CiAgICBsZXQgdSA9IE1BTU1PVEhTLm1ldGFkYXRhKCJhbmFuIikuYXNTdHJpbmcoKTsKICB9IGVsc2UgewogICAgbGV0IGwgPSBPVEhFUi5tZXRhZGF0YSgiYmFiYW4iKS5hc0ludCgpOwogIH0KCiAgbGV0IGNhcCA9IE1BTU1PVEhTLm1ldGFkYXRhKCJjYXAiKS5hc1N0cmluZygpOwoKICBub0xvb3AoKTsKfQoKCmZ1bmN0aW9uIGF0dHJpYnV0ZXMoKSB7CiAgcmV0dXJuIFsKICAgIHsKICAgICAgInRyYWl0X3R5cGUiOiAidGVzdCIsCiAgICAgICJ2YWx1ZSI6ICJ0ZXN0IgogICAgfQogIF0K";
    string private constant CHUNK_3 = "fQ==";

    uint256 private constant CHUNK_COUNT = 4;

    mapping(uint256 => TraitRegistry[]) private _traitRegistry;
    mapping(uint256 => uint256) private _traitRegistrySize;

    uint256 private _nextTokenId;

    constructor(
        string memory _name,
        string memory _symbol,
        address _initialOwner
    ) ERC721OpenZeppelin(_name, _symbol) Ownable(_initialOwner) {
        _transferOwnership(_initialOwner);

        _traitRegistry[MAMMOTHS_INDEX].push(TraitRegistry("asString", "anan"));
        _traitRegistry[MAMMOTHS_INDEX].push(TraitRegistry("asString", "cap"));
        _traitRegistry[OTHER_INDEX].push(TraitRegistry("asInt", "baban"));
        _traitRegistrySize[MAMMOTHS_INDEX] = 2;
        _traitRegistrySize[OTHER_INDEX] = 1;
    }

    function mint(address _to, uint256[] memory _tokenIds) external {
        uint256 tokenId_Mammoths = _tokenIds[MAMMOTHS_INDEX];
        uint256 tokenId_Other = _tokenIds[OTHER_INDEX];

        require(IERC721(MAMMOTHS).ownerOf(tokenId_Mammoths) == _msgSender(), "Not the owner of required Mammoths");
        require(IERC721(OTHER).ownerOf(tokenId_Other) == _msgSender(), "Not the owner of required Other");

        string memory trait_Anan_MAMMOTHS = MAMMOTHS.getTokenAttribute(tokenId_Mammoths, "anan");
        string memory trait_Baban_OTHER = OTHER.getTokenAttribute(tokenId_Other, "baban");
        string memory trait_Cap_MAMMOTHS = MAMMOTHS.getTokenAttribute(tokenId_Mammoths, "cap");

        string memory MAMMOTHS_jsField = generateCollectionTraitJS("MAMMOTHS", MAMMOTHS, MAMMOTHS_INDEX, tokenId_Mammoths);
        string memory OTHER_jsField = generateCollectionTraitJS("OTHER", OTHER, OTHER_INDEX, tokenId_Other);

        string memory allTraits = string(abi.encodePacked(MAMMOTHS_jsField, OTHER_jsField));

        string memory canvasUnpacked = string(Base64.decode(_getP5Base()));
        string memory canvas = string(abi.encodePacked(allTraits, canvasUnpacked));

        string memory canvasBase64 = Base64.encode(bytes(canvas));

        string memory tokenMetadata = "{}";
        tokenMetadata = tokenMetadata
            .setTokenAttribute("anan", trait_Anan_MAMMOTHS)
            .setTokenAttribute("baban", trait_Baban_OTHER)
            .setTokenAttribute("cap", trait_Cap_MAMMOTHS)
            .setTokenAttribute("canvas", canvasBase64);


        uint256 newTokenId = _nextTokenId;

        _setTokenMetadata(newTokenId, tokenMetadata);

        _cementTokenMetadata(newTokenId);

        _safeMint(_to, newTokenId);

        _nextTokenId++;
    }

    function _generateTrait(string memory collection, string[] memory types, string[] memory keys, string[] memory values) internal pure returns (string memory) {
        string memory code = string(abi.encodePacked("const ", collection, " = { traits: { "));
        for (uint i = 0; i < keys.length; i++) {
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

    function _getP5Base() internal view returns (string memory) {
        return string(abi.encodePacked(CHUNK_0, CHUNK_1, CHUNK_2, CHUNK_3));
    }

    /**
     * @dev Sets the royalty information that all ids in this contract will default to.
     *
     * Requirements:
     *
     * - `receiver` cannot be the zero address.
     * - `feeNumerator` is the number of basis points (1/10000).
     */
    function setDefaultRoyalty(address _receiver, uint96 _feeNumerator) external onlyOwner {
        _setDefaultRoyalty(_receiver, _feeNumerator);
    }

    function setTokenRoyalty(uint256 _tokenId, address _receiver, uint96 _feeNumerator) external onlyOwner {
        _setTokenRoyalty(_tokenId, _receiver, _feeNumerator);
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