// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OApp, Origin, MessagingFee} from "@layerzerolabs/lz-evm-oapp-v2/contracts/oapp/OApp.sol";
import {UlnConfig, ExecutorConfig} from "@layerzerolabs/lz-evm-messagelib-v2/contracts/uln/uln302/SendUln302.sol";
import {ILayerZeroEndpointV2} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {SetConfigParam} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/IMessageLibManager.sol";

import {EndpointV2View} from "@layerzerolabs/lz-evm-protocol-v2/contracts/EndpointV2View.sol";

contract TestApp is OApp {
    struct MessageDetails {
        Origin origin;
        bytes32 guid;
        bytes message;
        address executor;
        bytes extraData;
    }

    MessageDetails[] public messages;

    address public immutable dvn; // this would never be immutable in a real app
    address public immutable executor; // this would never be immutable in a real app

    constructor(
        address endpoint,
        address _executor,
        address _dvn
    ) OApp(endpoint, msg.sender) {
        executor = _executor;
        dvn = _dvn;
    }

    function setPeer(uint32 _eid, bytes32 _peer) public override onlyOwner {
        // @note onlyOwner redundant here but kept for explicitness
        // dvn + executor config would never be fixed like this in a real app.
        (address receiveLib, ) = endpoint.getReceiveLibrary(
            address(this),
            _eid
        );
        address sendLib = endpoint.getSendLibrary(address(this), _eid);

        address[] memory requiredDVNs = new address[](1);
        requiredDVNs[0] = dvn;

        UlnConfig memory ulnConfig = UlnConfig({
            confirmations: 1,
            requiredDVNCount: 1,
            optionalDVNCount: 0,
            optionalDVNThreshold: 0,
            requiredDVNs: requiredDVNs,
            optionalDVNs: new address[](0)
        });

        ExecutorConfig memory executorConfig = ExecutorConfig({
            maxMessageSize: 1024, // Not important for this example
            executor: executor
        });

        SetConfigParam[] memory sendConfigs = new SetConfigParam[](2);
        sendConfigs[0] = SetConfigParam({
            eid: _eid,
            configType: 2, // CONFIG_TYPE_ULN
            config: abi.encode(ulnConfig)
        });
        sendConfigs[1] = SetConfigParam({
            eid: _eid,
            configType: 1, // CONFIG_TYPE_EXECUTOR
            config: abi.encode(executorConfig)
        });

        SetConfigParam[] memory receiveConfigs = new SetConfigParam[](1);
        receiveConfigs[0] = sendConfigs[0];

        endpoint.setConfig(address(this), receiveLib, receiveConfigs);
        endpoint.setConfig(address(this), sendLib, sendConfigs);

        super.setPeer(_eid, _peer);
    }

    function send(
        uint32 _dstEid,
        bytes calldata _message,
        bytes calldata _options
    ) external payable {
        _lzSend(
            _dstEid,
            _message,
            _options,
            MessagingFee(msg.value, 0),
            msg.sender
        );
    }

    function quote(
        uint32 _dstEid,
        bytes memory _message,
        bytes memory _options
    ) external view returns (uint256) {
        return super._quote(_dstEid, _message, _options, false).nativeFee;
    }

    function _lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) internal override {
        messages.push(
            MessageDetails(_origin, _guid, _message, _executor, _extraData)
        );
    }

    function messageLength() external view returns (uint256) {
        return messages.length;
    }
}
