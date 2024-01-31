// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console2} from "forge-std/Script.sol";

import {TestApp} from "../src/TestApp.sol";
import {SimpleExecutor} from "../src/SimpleExecutor.sol";

import {ILayerZeroEndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

contract Deploy is Script {
    // As all three chains are at the same endpoint address, we only define it once for simplicity.
    ILayerZeroEndpointV2 public constant ENDPOINT =
        ILayerZeroEndpointV2(0x1a44076050125825900e736c501f859c50fE728c);
    uint32 public constant EID_CORE = 30153;
    uint32 public constant EID_CELO = 30125;
    uint32 public constant EID_GNOSIS = 30145;

    TestApp public coreApp;
    TestApp public celoApp;
    TestApp public gnosisApp;

    SimpleExecutor public coreExecutor;
    SimpleExecutor public celoExecutor;
    SimpleExecutor public gnosisExecutor;

    uint256 public constant CORE_EXECUTION_FEE = 0.01 * 1e18;
    uint256 public constant CELO_EXECUTION_FEE = 0.01 * 1e18;
    uint256 public constant GNOSIS_EXECUTION_FEE = 0.01 * 1e18;

    function setUp() public {}

    function run() public {
        uint256 deployer = vm.envUint("PRIVATE_KEY");

        uint256 coreFork = vm.createSelectFork(vm.rpcUrl("core"));
        (uint32[] memory coreFeeEids, uint256[] memory coreFees) = _getFees(
            EID_CORE
        );
        vm.startBroadcast(deployer);
        // create and select for optimism
        coreExecutor = new SimpleExecutor(ENDPOINT, coreFeeEids, coreFees);
        coreApp = new TestApp(
            address(ENDPOINT),
            address(coreExecutor),
            0x3C5575898f59c097681d1Fc239c2c6Ad36B7b41c
        );
        vm.stopBroadcast();

        uint256 celoFork = vm.createSelectFork(vm.rpcUrl("celo"));
        (uint32[] memory celoFeeEids, uint256[] memory celoFees) = _getFees(
            EID_CELO
        );
        vm.startBroadcast(deployer);
        celoExecutor = new SimpleExecutor(ENDPOINT, celoFeeEids, celoFees);
        celoApp = new TestApp(
            address(ENDPOINT),
            address(celoExecutor),
            0x75b073994560A5c03Cd970414d9170be0C6e5c36
        );
        vm.stopBroadcast();

        uint256 gnosisFork = vm.createSelectFork(vm.rpcUrl("gnosis"));
        (uint32[] memory gnosisFeeEids, uint256[] memory gnosisFees) = _getFees(
            EID_GNOSIS
        );
        vm.startBroadcast(deployer);
        gnosisExecutor = new SimpleExecutor(
            ENDPOINT,
            gnosisFeeEids,
            gnosisFees
        );
        gnosisApp = new TestApp(
            address(ENDPOINT),
            address(gnosisExecutor),
            0x11bb2991882a86Dc3E38858d922559A385d506bA
        );
        vm.stopBroadcast();

        console2.log("Linking Core...");
        vm.selectFork(coreFork);
        vm.startBroadcast(deployer);
        coreApp.setPeer(EID_CELO, bytes32(uint256(uint160(address(celoApp)))));
        coreApp.setPeer(
            EID_GNOSIS,
            bytes32(uint256(uint160(address(gnosisApp))))
        );
        vm.stopBroadcast();

        console2.log("Linking Celo...");
        vm.selectFork(celoFork);
        vm.startBroadcast(deployer);
        celoApp.setPeer(EID_CORE, bytes32(uint256(uint160(address(coreApp)))));
        celoApp.setPeer(
            EID_GNOSIS,
            bytes32(uint256(uint160(address(gnosisApp))))
        );
        vm.stopBroadcast();

        console2.log("Linking Gnosis...");
        vm.selectFork(gnosisFork);
        vm.startBroadcast(deployer);
        gnosisApp.setPeer(
            EID_CELO,
            bytes32(uint256(uint160(address(celoApp))))
        );
        gnosisApp.setPeer(
            EID_CORE,
            bytes32(uint256(uint160(address(coreApp))))
        );
        vm.stopBroadcast();

        console2.log("APP_CORE:", address(coreApp));
        console2.log("APP_CELO:", address(celoApp));
        console2.log("APP_GNOSIS:", address(gnosisApp));
        console2.log("EXECUTOR_CORE:", address(coreExecutor));
        console2.log("EXECUTOR_CELO:", address(celoExecutor));
        console2.log("EXECUTOR_GNOSIS:", address(gnosisExecutor));
    }

    function _getFees(
        uint32 eid
    ) internal pure returns (uint32[] memory dstEids, uint256[] memory fees) {
        dstEids = new uint32[](2);
        fees = new uint256[](2);

        uint256 index = 0;
        if (eid != EID_CORE) {
            dstEids[index] = EID_CORE;
            fees[index] = CORE_EXECUTION_FEE;
            index++;
        }
        if (eid != EID_CELO) {
            dstEids[index] = EID_CELO;
            fees[index] = CELO_EXECUTION_FEE;
            index++;
        }
        if (eid != EID_GNOSIS) {
            dstEids[index] = EID_GNOSIS;
            fees[index] = GNOSIS_EXECUTION_FEE;
            index++;
        }
    }
}
