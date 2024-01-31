// The configuration for unit tests (separate from the integration test configuration)
// This permits for running the two test types separately:
// - yarn test
// - yarn integration
//
// Integration tests are denoted with .itest.ts while normal ones are .test.ts.
module.exports = {
  transform: { "^.+\\.ts?$": "ts-jest" },
  testEnvironment: "node",
  testRegex: "/tests/.*\\.(test|spec)?\\.(ts|tsx)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};
