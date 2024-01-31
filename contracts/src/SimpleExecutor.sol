// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ILayerZeroExecutor} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/interfaces/ILayerZeroExecutor.sol";
import {ISendLib} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ISendLib.sol";
import {ILayerZeroEndpointV2, Origin} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract SimpleExecutor is Ownable, ILayerZeroExecutor {
    event Withdraw(ISendLib indexed lib, address to, uint256 amount);
    event MessageFeeSet(uint32 indexed dstEid, uint256 messageFee);

    mapping(uint32 => uint256) public messageFees;

    ILayerZeroEndpointV2 public immutable endpoint;

    constructor(
        ILayerZeroEndpointV2 _endpoint,
        uint32[] memory dstEids,
        uint256[] memory _messageFees
    ) {
        endpoint = _endpoint;

        require(
            dstEids.length == _messageFees.length,
            "SimpleExecutor: invalid input"
        );
        for (uint256 i = 0; i < dstEids.length; i++) {
            messageFees[dstEids[i]] = _messageFees[i];
        }
    }

    // @notice query price and assign jobs at the same time
    // @param dstEid - the destination endpoint identifier
    // @param sender - the source sending contract address. executors may apply price discrimination to senders
    // @param calldataSize - dynamic data size of message + caller params
    // @param options - optional parameters for extra service plugins, e.g. sending dust tokens at the destination chain
    function assignJob(
        uint32 dstEid,
        address sender,
        uint256 calldataSize,
        bytes calldata options
    ) external view override returns (uint256 price) {
        return getFee(dstEid, sender, calldataSize, options);
    }

    // @notice query the executor price for relaying the payload and its proof to the destination chain
    // @param dstEid - the destination endpoint identifier
    // @param sender - the source sending contract address. executors may apply price discrimination to senders
    // @param calldataSize - dynamic data size of message + caller params
    // @param options - optional parameters for extra service plugins, e.g. sending dust tokens at the destination chain
    function getFee(
        uint32 dstEid,
        address /*sender*/,
        uint256 /*calldataSize*/,
        bytes calldata /*options*/
    ) public view override returns (uint256 price) {
        price = messageFees[dstEid];
        require(price > 0, "SimpleExecutor: invalid destination");
    }

    function setMessageFee(
        uint32 dstEid,
        uint256 messageFee
    ) external onlyOwner {
        messageFees[dstEid] = messageFee;
        emit MessageFeeSet(dstEid, messageFee);
    }

    function withdrawFee(
        ISendLib lib,
        address to,
        uint256 amount
    ) external onlyOwner {
        lib.withdrawFee(to, amount);
        emit Withdraw(lib, to, amount);
    }
}
