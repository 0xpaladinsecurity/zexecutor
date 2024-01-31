// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console2} from "forge-std/Script.sol";

import {TestApp} from "../src/TestApp.sol";
import {SimpleExecutor} from "../src/SimpleExecutor.sol";

import {ILayerZeroEndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {OptionsBuilder} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/libs/OptionsBuilder.sol";

contract SendMessage is Script {
    // As all three chains are at the same endpoint address, we only define it once for simplicity.
    ILayerZeroEndpointV2 public constant ENDPOINT =
        ILayerZeroEndpointV2(0x1a44076050125825900e736c501f859c50fE728c);

    function setUp() public {}

    function run(
        TestApp oapp,
        uint32 dstEid,
        bytes calldata message,
        uint256 value
    ) public {
        uint256 deployer = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployer);
        oapp.send{value: value}(dstEid, message, OptionsBuilder.newOptions());
        vm.stopBroadcast();
    }
}
