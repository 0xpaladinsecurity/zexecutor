// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console2} from "forge-std/Script.sol";

import {TestApp} from "../src/TestApp.sol";
import {SimpleExecutor} from "../src/SimpleExecutor.sol";

import {ILayerZeroEndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

contract GetMessageLib is Script {
    // As all three chains are at the same endpoint address, we only define it once for simplicity.
    ILayerZeroEndpointV2 public constant ENDPOINT =
        ILayerZeroEndpointV2(0x1a44076050125825900e736c501f859c50fE728c);

    function setUp() public {}

    function run(TestApp app) public {
        // uint256 deployer = vm.envUint("PRIVATE_KEY");
        (address lib, ) = ENDPOINT.getReceiveLibrary(address(app), 30125);
        console2.log("Send: ", ENDPOINT.getSendLibrary(address(app), 30125));
        console2.log("Receive: ", lib);
    }
}
