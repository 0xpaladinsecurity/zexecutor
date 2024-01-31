# zexecutor
The most basic LayerZero V2 executor example, period.

## Getting started
The ZExecutor requires an executor to be deployed on every configured chain. Once you update the configuration, you can run the following command.

```
npm run dev -- -c "./executor.config.json"
```

Note that a `PRIVATE_KEY` environment variable needs to be set.

We've provided a simple example in `contracts/src/SimpleExecutor`. A deployment script to deploy this executor on a few chains alongside with a test app is provided in `script/deploy`.

## Why did we build this?

**The Zexecutor is not a production executor**, instead, it's a minimal example of how to build an executor yourself. It contains the core business logic for processing, verifying and executing cross-chain messages.

The code within this repository can serve as a useful reference to anyone building a real executor, and illustrates that anyone *can* build such an executor.

## Design specification
Though the ZEXecutor aims to be simple, there are still a few files in the repository. We'll guide you through them here:

The ZExecutor splits the executor's responsibility in two roles:
- Event provisioning (listening for events on source chains)
- Event execution (executing them on the destination chains)

This division of responsibility makes so much sense that within a production environment, you would almost certainly decide to split these roles into their own applications, which only communicate via a database or messaging bus.

We've implemented each of these roles with [Viem](https://viem.sh/) as the web3 library, however, using ethers or web3.js would work just as well. The [ViemProvider](./src/providers/viemprovider.ts) is therefore responsible for monitoring a source chain continuously for `PacketSent` events, which are emitted whenever a message gets sent through an endpoint. Whenever such a message is sent, the provider will validate that our executor actually got paid (as its possible that this message was for another executor). This validation has to be done with extreme care as a transaction may contain multiple messages and bad validation logic would allow multiple messages in a transaction to get executed while only one of them paid the executor. The `processLog` function within the [ViemProvider](./src/providers/viemprovider.ts) is therefore a great function for you to look at if you want to learn how to actually validate that your executor got paid. The algorithm boils down to looking back at any logs preceding `PacketSent`, looking for an `ExecutorPaid` event, and giving up as soon as a previous `PacketSent` is reached. The executor payment needs to be carefully validated as well, as to avoid a fake event being detected.

Once an event is validated by the provider, it will forward it to the [ZExecutor](./src/zexecutor.ts) sorting function, which simply adds it to the execution queue of the [ViemExecutor](./src/executors/viemexecutor.ts) of the destination chain.

Each [ViemExecutor](./src/executors/viemexecutor.ts) has an execution queue that it continuously processes. New messages get put at the back of this queue while the executor processes them in a FIFO manner. Once a message has enough DVN attestations, the executor will commit the verification of that message on the destination chain. Afterwards, it will actually execute the message.

To verify these two separate states (commitable and executable), view function contracts deployed by LayerZero are used. These utility contracts provide a useful view function that returns the current state of any message on the destination chains.

Once a message is fully executed, it's popped from the execution queue. However, whenever further processing is required, that message gets pushed back to the end of the queue for re-trial.

## What does the ZExecutor not do?

As of now, the ZExecutor does not support any of the following:
* **Dynamic execution fees** - The ZExecutor does not quote its fees based on transaction gas parameters, instead, a simple static gas cost is used.
* **Availability** - The ZExecutor does not support high availability, as it uses a single execution wallet and does not track execution state anywhere.
* **Resiliency** - The ZExecutor is not resilient. In case the process goes down, any queued and intermediary messages will be skipped.
* **Scalability** - The ZExecutor does not scale. It's a single wallet setup, which means that it's trivial to become congested in case there's a high message count.
* **Modularity** - The ZExecutor design is not modular. Instead, we opted for a minimal and simple to understand code layout. This is suboptimal for production as it makes the code less extendible and testable.
* **Recovery** - The ZExecutor can permanently crash pretty easily as there's no "looking back" at the start of the executor, nor is there transaction failure handling. As soon as a transaction failed to commit for one reason or another, the ZExecutor is likely to become permanently stuck. Things such as insufficient gas in the executor wallets will also not be gracefully monitored or handled.

However, it should be clear that all of these shortcomings can be trivially solved in a production environment. Integrating things such as multiple wallets and a database to keep track of messages and execution state would already address most of these. Having an algorithm to fetch historical events would solve recovery (though some RPCs do not support archival for events which are a long time ago). It should be clear by now that this repository focuses on the **business logic** of interpreting and executing LayerZero messages, and not on providing a production-ready environment.

## Testing

The ZExecutor was not written with testability in mind, as it would make the codebase more verbose given that testability requires abstraction. However, there are a few basic unit tests for the stuff that can be tested and there's a single large integration test that runs on mainnet and sends messages between three real chains. The latter takes a few minutes to complete as it needs to deploy the executors and an example app on each chain.

Unit tests:

```
yarn test
```

Integration tests (requires the private key to have $1 in gas on Core, Celo and Gnosis):

```
export PRIVATE_KEY="0x..."
yarn integration
```

Note that the integration test will re-use previous deployments. In case the previous deployment of the apps is bricked (eg. due to a commit not having been forwarded), you simply delete `contracts/cache/integration`, which stores the contract addresses.