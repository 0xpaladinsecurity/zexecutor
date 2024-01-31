import {
  Account,
  Chain,
  HttpTransport,
  WalletClient,
  createWalletClient,
  http,
} from "viem";

import * as chains from "viem/chains";

export type ChainId = number;

export type Config = {
  chains: Map<ChainId, ChainConfig>;
};

export type ChainConfig = {
  name: string;
  rpc?: string;
  endpoint: `0x${string}`;
  endpointView: `0x${string}`;
  trustedSendLib: `0x${string}`;
  trustedReceiveLib: `0x${string}`;
  trustedReceiveLibView: `0x${string}`;
  eid: number;
  executor: `0x${string}`;
};

/**
 * Gets the Viem chain for the provided chain id. If the chain has a custom rpc
 * endpoint, it is used. Alternatively, the default Viem rpc endpoint is used.
 */
export const getViemChain = (config: ChainConfig, chainId: ChainId): Chain => {
  if (config.rpc) {
    return {
      name: config.name,
      id: chainId,
      network: config.name,
      nativeCurrency: {
        decimals: 18,
        name: "Gas token",
        symbol: "UNKNOWN",
      },
      rpcUrls: {
        public: { http: [config.rpc] },
        default: { http: [config.rpc] },
      },
    } as const satisfies Chain;
  } else {
    let chain = Object.values(chains).find((c) => chainId === c.id);
    if (!chain) {
      throw new Error(`Chain ${chainId} not found in Viem`);
    }
    return chain;
  }
};

/**
 * Creates a Viem client for the provided chain and account.
 * Checks if the chain has a custom rpc endpoint, if not uses the default Viem rpc endpoint.
 */
export const getViemClient = (
  config: ChainConfig,
  chainId: ChainId,
  account: Account,
): WalletClient<HttpTransport, Chain, Account> => {
  let chain = getViemChain(config, chainId);

  return createWalletClient({
    chain: chain,
    transport: http(),
    account,
  });
};
