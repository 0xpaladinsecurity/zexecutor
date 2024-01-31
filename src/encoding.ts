// The encoder presently types according to ethereum addresses, this is to make it clear that zexecutor presently only supports the EVM.
// A production deployment would likely want to support other address types as well.

import { pad, slice, keccak256, encodePacked } from "viem";

const PACKET_VERSION_OFFSET = 0;
const NONCE_OFFSET = 1;
//    path
const SRC_CHAIN_OFFSET = 9;
const SRC_ADDRESS_OFFSET = 13;
const DST_CHAIN_OFFSET = 45;
const DST_ADDRESS_OFFSET = 49;
// payload (guid + message)
const GUID_OFFSET = 81; // keccak256(nonce + path)
const MESSAGE_OFFSET = 113;

export type PacketPath = {
  srcEid: number;
  sender: `0x${string}`;
  dstEid: number;
  receiver: `0x${string}`;
};

export type PacketHeader = {
  version: number;
  nonce: bigint;
} & PacketPath;

export type Packet = PacketHeader & {
  guid: `0x${string}`;
  message: `0x${string}`;
  payload: `0x${string}`; // payload = guid + message
};

export type MessageOrigin = {
  srcEid: number;
  sender: `0x${string}`;
  nonce: bigint;
};

export class PacketSerializer {
  static serialize(packet: Packet): `0x${string}` {
    return PacketV1Codec.encode(packet);
  }

  static deserialize(bytesLike: Uint8Array | `0x${string}`): Packet {
    let codec: PacketV1Codec;
    if (bytesLike instanceof Uint8Array) {
      codec = PacketV1Codec.fromBytes(bytesLike);
    } else {
      codec = PacketV1Codec.from(bytesLike);
    }
    return codec.toPacket();
  }

  static getHeader(bytesLike: Uint8Array | `0x${string}`): `0x${string}` {
    let codec: PacketV1Codec;
    if (bytesLike instanceof Uint8Array) {
      codec = PacketV1Codec.fromBytes(bytesLike);
    } else {
      codec = PacketV1Codec.from(bytesLike);
    }
    return codec.header();
  }

  static getPayloadHash(bytesLike: Uint8Array | `0x${string}`): `0x${string}` {
    let codec: PacketV1Codec;
    if (bytesLike instanceof Uint8Array) {
      codec = PacketV1Codec.fromBytes(bytesLike);
    } else {
      codec = PacketV1Codec.from(bytesLike);
    }
    return codec.payloadHash();
  }
}

export function packetToMessageOrigin(packet: Packet): MessageOrigin {
  return {
    srcEid: packet.srcEid,
    sender: packet.sender,
    nonce: packet.nonce,
  };
}

export class PacketV1Codec {
  buffer: Buffer;

  static from(payloadEncoded: string): PacketV1Codec {
    return new PacketV1Codec(payloadEncoded);
  }

  static fromBytes(payload: Uint8Array): PacketV1Codec {
    return new PacketV1Codec("0x" + Buffer.from(payload).toString("hex"));
  }

  protected constructor(payloadEncoded: string) {
    this.buffer = Buffer.from(trim0x(payloadEncoded), "hex");
  }

  /**
   * encode packet to hex string
   */
  static encode(packet: Packet): `0x${string}` {
    const message = trim0x(packet.message);
    const buffer = Buffer.alloc(MESSAGE_OFFSET + message.length / 2);
    buffer.writeUInt8(packet.version, PACKET_VERSION_OFFSET);
    buffer.writeBigUInt64BE(BigInt(packet.nonce), NONCE_OFFSET);
    buffer.writeUInt32BE(packet.srcEid, SRC_CHAIN_OFFSET);
    buffer.write(trim0x(pad(packet.sender)), SRC_ADDRESS_OFFSET, 32, "hex");
    buffer.writeUInt32BE(packet.dstEid, DST_CHAIN_OFFSET);
    buffer.write(trim0x(pad(packet.receiver)), DST_ADDRESS_OFFSET, 32, "hex");
    buffer.write(trim0x(packet.guid), GUID_OFFSET, 32, "hex");
    buffer.write(message, MESSAGE_OFFSET, message.length / 2, "hex");
    return ("0x" + buffer.toString("hex")) as `0x${string}`;
  }

  version(): number {
    return this.buffer.readUInt8(PACKET_VERSION_OFFSET);
  }

  nonce(): bigint {
    return this.buffer.readBigUint64BE(NONCE_OFFSET);
  }

  srcEid(): number {
    return this.buffer.readUint32BE(SRC_CHAIN_OFFSET);
  }

  sender(): `0x${string}` {
    return ("0x" +
      this.buffer
        .slice(SRC_ADDRESS_OFFSET, DST_CHAIN_OFFSET)
        .toString("hex")) as `0x${string}`;
  }

  senderAddressB20(): `0x${string}` {
    return bytes32ToEthAddress(this.sender());
  }

  dstEid(): number {
    return this.buffer.readUint32BE(DST_CHAIN_OFFSET);
  }

  receiver(): `0x${string}` {
    return ("0x" +
      this.buffer
        .slice(DST_ADDRESS_OFFSET, GUID_OFFSET)
        .toString("hex")) as `0x${string}`;
  }

  receiverAddressB20(): `0x${string}` {
    return bytes32ToEthAddress(this.receiver());
  }

  guid(): `0x${string}` {
    return ("0x" +
      this.buffer
        .slice(GUID_OFFSET, MESSAGE_OFFSET)
        .toString("hex")) as `0x${string}`;
  }

  message(): `0x${string}` {
    return ("0x" +
      this.buffer.slice(MESSAGE_OFFSET).toString("hex")) as `0x${string}`;
  }

  payloadHash(): `0x${string}` {
    return keccak256(this.payload());
  }

  payload(): `0x${string}` {
    return ("0x" +
      this.buffer.slice(GUID_OFFSET).toString("hex")) as `0x${string}`;
  }

  header(): `0x${string}` {
    return ("0x" +
      this.buffer.slice(0, GUID_OFFSET).toString("hex")) as `0x${string}`;
  }

  headerHash(): string {
    return keccak256(this.header());
  }

  toPacket(): Packet {
    return {
      version: this.version(),
      nonce: this.nonce(),
      srcEid: this.srcEid(),
      sender: this.senderAddressB20(),
      dstEid: this.dstEid(),
      receiver: this.receiverAddressB20(),
      guid: this.guid(),
      message: this.message(),
      // derived
      payload: this.payload(),
    };
  }
}

export function calculateGuid(packetHead: PacketHeader): string {
  return keccak256(
    encodePacked(
      ["uint64", "uint32", "bytes32", "uint32", "bytes32"],
      [
        packetHead.nonce,
        packetHead.srcEid,
        pad(packetHead.sender),
        packetHead.dstEid,
        pad(packetHead.receiver),
      ],
    ),
  );
}

function bytes32ToEthAddress(addr: `0x${string}`): `0x${string}` {
  const result = slice(addr, 12, 32);
  if (pad(result) !== addr) {
    throw new Error(`Dirty bytes in address: ${addr}, is this an evm address?`);
  }
  return result;
}

export function trim0x(str: string): string {
  return str.replace(/^0x/, "");
}
