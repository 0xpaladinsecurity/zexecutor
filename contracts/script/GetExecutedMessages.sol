// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console2} from "forge-std/Script.sol";

import {TestApp} from "../src/TestApp.sol";

contract GetExecutedMessages is Script {
    function setUp() public {}

    function run(TestApp oapp) public {
        uint256 len = oapp.messageLength();
        console2.log("EXECUTION_LENGTH:", len);
        for (uint256 i = 0; i < len; i++) {
            (, , bytes memory message, , ) = oapp.messages(i);
            console2.log("EXECUTION_", i, ": ", string(message));
        }
    }
}
