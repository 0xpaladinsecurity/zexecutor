import { Command } from "commander";
import path from "path";
import { ZExecutor } from "./zexecutor";
import { readFileSync } from "fs";
import { Config } from "./config";

const DEFAULT_CONFIG = "./executor.config.json";

/**
 * Starts the zexecutor daemon, using the provided configuration file and wallet secret environment variable.
 *
 * @remarks
 * If no configuration file location is provided as a command line argument, the relative "executor.config.json"
 * configuration file will be used.
 */
const main = async () => {
  // Read the CLI arguments using the commander library
  let options = new Command()
    .name("zexecutor")
    .option(
      "-c, --config <location>",
      "Configuration file location",
      DEFAULT_CONFIG,
    )
    .parse(process.argv)
    .opts();

  // Read and parse the configuration file
  const configDir =
    typeof options.config === "string" ? options.config : DEFAULT_CONFIG;
  let absoluteFilePath = path.resolve(configDir);
  const config: Config = JSON.parse(
    readFileSync(absoluteFilePath, "utf8"),
  ) as Config;

  // Read the private key from the environment variables
  const PRIVATE_KEY: string | undefined = process.env.PRIVATE_KEY;
  if (!PRIVATE_KEY) {
    console.error("Missing PRIVATE_KEY environment variable");
    process.exit(1);
  }
  if (!PRIVATE_KEY.startsWith("0x")) {
    console.error("PRIVATE_KEY must start with 0x");
    process.exit(1);
  }

  // Run the application
  const zexecutor = new ZExecutor();
  // Iterate over key value of config.chains
  let stopFunctions: (() => void)[] = [];

  for (const [chainIdStr, chainConfig] of Object.entries(config.chains)) {
    let chainId = parseInt(chainIdStr);
    console.log(`Starting chain ${chainId}...`);
    const stop = zexecutor.addChainAndListen(
      chainId,
      chainConfig,
      PRIVATE_KEY as `0x${string}`,
    );
    stopFunctions.push(stop);
  }

  // If the user presses ctrl+c, gracefully terminate the application
  process.on("SIGINT", () => {
    console.log("Received SIGINT, stopping...");
    stopFunctions.forEach((stop) => stop());
  });
};

main();
