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

## What does the ZExecutor not do?

As of now, the ZExecutor does not support any of the following:
* **Dynamic execution fees** - The ZExecutor does not quote its fees based on transaction gas parameters, instead, a simple static gas cost is used.
* **Availability** - The ZExecutor does not support high availability, as it uses a single execution wallet and does not track execution state anywhere.
* **Resiliency** - The ZExecutor is not resilient. In case the process goes down, any queued and intermediary messages will be skipped.
* **Scalability** - The ZExecutor does not scale. It's a single wallet setup, which means that it's trivial to become congested in case there's a high message count.
* **Modularity** - The ZExecutor design is not modular. Instead, we opted for a minimal and simple to understand code layout. This is suboptimal for production as it makes the code less extendible and testable.
* **Recovery** - The ZExecutor can permanently crash pretty easily as there's no "looking back" at the start of the executor, nor is there transaction failure handling. As soon as a transaction failed to commit for one reason or another, the ZExecutor is likely to become permanently stuck. Things such as insufficient gas in the executor wallets will also not be gracefully monitored or handled.

However, it should be clear that all of these shortcomings can be trivially solved in a production environment. Integrating things such as multiple wallets and a database to keep track of messages and execution state would already address most of these. Having an algorithm to fetch historical events would solve recovery (though some RPCs do not support archival for events which are a long time ago). It should be clear by now that this repository focuses on the **business logic** of interpreting and executing LayerZero messages, and not on providing a production-ready environment.
