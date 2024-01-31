import { execSync, exec } from "child_process";

import { ZExecutor } from "../src/zexecutor";

import { encodePacked } from "viem";

import fs from "fs";

import util from "util";
const execAsync = util.promisify(exec);

const CACHE_FILE = "./contracts/cache/integration.json";

// @todo The integration tests should be expanded with negative tests and validation tests, right now
// they are only testing the happy path, eg. that execution occurs.

// The integration test is done on the mainnet network as to test the actual deployment. This is possible
// as LayerZero integrates with an exceptional number of chains including very cheap and fast ones. The
// chosen chains to integration test on are:
// - Fantom
// - Kava
// - Fuse
// The metric used for us to chose these chains to test on is simply the fact that transactions are effectively
// free on these chains, which is ideal for testing.

let coreAppAddress: `0x${string}`;
let celoAppAddress: `0x${string}`;
let gnosisAppAddress: `0x${string}`;

let coreExecutorAddress: `0x${string}`;
let celoExecutorAddress: `0x${string}`;
let gnosisExecutorAddress: `0x${string}`;

const RPC_CORE = "https://rpc.ankr.com/core";
const RPC_CELO = "https://rpc.ankr.com/celo";
const RPC_GNOSIS = "https://rpc.ankr.com/gnosis";

const EID_CORE = 30153;
const EID_CELO = 30125;
const EID_GNOSIS = 30145;

let zexecutor: ZExecutor;

let stop: () => void;

const useCache = true;

describe("Integration tests", () => {
  beforeAll(() => {
    deployOrLoadContracts();
  });

  afterAll(() => {
    stop();
  });

  test(
    "Integration tests",
    async () => {
      const executedMessagesCelo = await getExecutedMessages(celoAppAddress);
      const executedMessagesCore = await getExecutedMessages(coreAppAddress);
      const executedMessagesGnosis =
        await getExecutedMessages(gnosisAppAddress);
      await sendMessage(
        coreAppAddress,
        (3n * 10n ** 18n) / 10n,
        EID_CELO,
        encodePacked(["string"], ["Hello, world."]),
      );
      await waitFor(celoAppAddress, executedMessagesCelo + 1);

      await sendMessage(
        coreAppAddress,
        (3n * 10n ** 18n) / 10n,
        EID_CELO,
        encodePacked(["string"], ["Test message 2."]),
      );
      await waitFor(celoAppAddress, executedMessagesCelo + 2);

      await sendMessage(
        celoAppAddress,
        (3n * 10n ** 18n) / 10n,
        EID_CORE,
        encodePacked(["string"], ["Test message 2."]),
      );
      await sendMessage(
        gnosisAppAddress,
        (3n * 10n ** 18n) / 10n,
        EID_CORE,
        encodePacked(["string"], ["Test message 2."]),
      );
      await waitFor(coreAppAddress, executedMessagesCore + 2);

      await sendMessage(
        celoAppAddress,
        (3n * 10n ** 18n) / 10n,
        EID_GNOSIS,
        encodePacked(["string"], ["Test message 2."]),
      );
      await sendMessage(
        coreAppAddress,
        (3n * 10n ** 18n) / 10n,
        EID_CELO,
        encodePacked(["string"], ["Test message 2."]),
      );
      await waitFor(celoAppAddress, executedMessagesCelo + 3);
      await waitFor(gnosisAppAddress, executedMessagesGnosis + 1);
    },
    10 * 60 * 1000,
  );

  async function sendMessage(
    oapp: `0x${string}`,
    gas: bigint,
    dstEid: number,
    message: `0x${string}`,
    extraData: `0x${string}` = "0x",
  ) {
    let rpcUrl = getRpc(oapp);

    console.log(
      `Sending message to ${dstEid} on ${rpcUrl} with message ${message}, to oapp ${oapp}`,
    );

    const output = await execAsync(
      `forge script SendMessage --sig 'run(address,uint32,bytes,uint256)' ${oapp} ${dstEid} ${message}  ${gas} --rpc-url '${rpcUrl}' --legacy --broadcast --root ./contracts`,
      { encoding: "utf-8" },
    );
    console.log(output);
  }
  async function waitFor(
    oapp: `0x${string}`,
    executionNumber: number,
  ): Promise<void> {
    console.log(`Waiting for ${executionNumber} executions for ${oapp}`);

    while (true) {
      const executedMessages = await getExecutedMessages(oapp);
      console.log(`Executed messages: ${executedMessages}`);
      if (executedMessages == executionNumber) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  async function getExecutedMessages(oapp: `0x${string}`): Promise<number> {
    let rpcUrl = getRpc(oapp);
    console.log(`Fetching executed messages for ${oapp}`);

    const { stdout, stderr } = await execAsync(
      `forge script GetExecutedMessages --sig 'run(address)' ${oapp} --rpc-url '${rpcUrl}' --legacy --root ./contracts`,
      { encoding: "utf-8" },
    );
    if (stderr) {
      console.error(stderr);
    }
    console.log(stdout);

    let number = 0;
    for (const line of stdout.split("\n")) {
      if (line.includes("EXECUTION_LENGTH:")) {
        number = parseInt(line.split(":")[1].trim());
      }
    }
    return number;
  }

  function getRpc(oapp: `0x${string}`): string {
    if (oapp === celoAppAddress) {
      return RPC_CELO;
    } else if (oapp === gnosisAppAddress) {
      return RPC_GNOSIS;
    } else if (oapp === coreAppAddress) {
      return RPC_CORE;
    } else {
      throw new Error(`Unknown oapp ${oapp}`);
    }
  }

  function deployOrLoadContracts() {
    console.log("Checking whether there are cached executors");

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey || !privateKey.startsWith("0x")) {
      throw new Error(
        "Missing PRIVATE_KEY env variable or invalid format (0x...)",
      );
    }

    let addresses: Record<string, string> = {};

    if (useCache && fs.existsSync(CACHE_FILE)) {
      console.log("Loading cached executors");
      let data = fs.readFileSync(CACHE_FILE);
      addresses = JSON.parse(data.toString());
    } else {
      console.log("Deploying executors");
      // 1. Deploy TestApp on the test networks, call `forge script Deploy` console command
      const output = execSync(
        "forge script Deploy --legacy --broadcast --root ./contracts",
        { encoding: "utf-8" },
      );
      console.log("EXECUTION DEPLOYMENT:");
      console.log(output);

      const keys = [
        "APP_CORE",
        "APP_CELO",
        "APP_GNOSIS",
        "EXECUTOR_CORE",
        "EXECUTOR_CELO",
        "EXECUTOR_GNOSIS",
      ];
      // Using an output file would be cleaner here, but we were lazy and used the command output.
      for (const line of output.split("\n")) {
        for (const key of keys) {
          if (line.includes(key)) {
            addresses[key] = line.split(":")[1].trim();
          }
        }
      }
      for (const key of keys) {
        if (!addresses[key]) {
          throw new Error(`Missing address for ${key}`);
        }
      }
    }

    coreAppAddress = addresses["APP_CORE"] as `0x${string}`;
    celoAppAddress = addresses["APP_CELO"] as `0x${string}`;
    gnosisAppAddress = addresses["APP_GNOSIS"] as `0x${string}`;

    coreExecutorAddress = addresses["EXECUTOR_CORE"] as `0x${string}`;
    celoExecutorAddress = addresses["EXECUTOR_CELO"] as `0x${string}`;
    gnosisExecutorAddress = addresses["EXECUTOR_GNOSIS"] as `0x${string}`;

    // store these 6 addresses in a json at cache/integration.json
    let data = JSON.stringify(addresses);
    fs.writeFileSync(CACHE_FILE, data);

    zexecutor = new ZExecutor();
    let stopCore = zexecutor.addChainAndListen(
      1116,
      {
        name: "Core",
        rpc: RPC_CORE,
        endpoint: "0x1a44076050125825900e736c501f859c50fE728c",
        trustedSendLib: "0x0BcAC336466ef7F1e0b5c184aAB2867C108331aF",
        trustedReceiveLib: "0x8F76bAcC52b5730c1f1A2413B8936D4df12aF4f6",
        trustedReceiveLibView: "0x8D183A062e99cad6f3723E6d836F9EA13886B173",
        executor: coreExecutorAddress,
        endpointView: "0xF08f13c080fcc530B1C21DE827C27B7b66874DDc",
        eid: EID_CORE,
      },
      privateKey as `0x${string}`,
    );

    let stopCelo = zexecutor.addChainAndListen(
      42220,
      {
        name: "Celo",
        rpc: RPC_CELO,
        endpoint: "0x1a44076050125825900e736c501f859c50fE728c",
        trustedSendLib: "0x42b4E9C6495B4cFDaE024B1eC32E09F28027620e",
        trustedReceiveLib: "0xaDDed4478B423d991C21E525Cd3638FBce1AaD17",
        trustedReceiveLibView: "0x0Aa32E92879Cfc4a91c64e7A43C5a8794fDdaBba",
        executor: celoExecutorAddress,
        endpointView: "0x6c47E59BC0600942146BF37668fc92b369C85ab7",
        eid: EID_CELO,
      },
      privateKey as `0x${string}`,
    );

    let stopGnosis = zexecutor.addChainAndListen(
      100,
      {
        name: "Gnosis",
        rpc: RPC_GNOSIS,
        endpoint: "0x1a44076050125825900e736c501f859c50fE728c",
        trustedSendLib: "0x3C156b1f625D2B4E004D43E91aC2c3a719C29c7B",
        trustedReceiveLib: "0x9714Ccf1dedeF14BaB5013625DB92746C1358cb4",
        trustedReceiveLibView: "0x6c47E59BC0600942146BF37668fc92b369C85ab7",
        executor: gnosisExecutorAddress,
        endpointView: "0xe70cA542A9f2D932aD34efE3a681D83828452666",
        eid: EID_GNOSIS,
      },
      privateKey as `0x${string}`,
    );

    stop = () => {
      stopCore();
      stopCelo();
      stopGnosis();
    };
  }
});
