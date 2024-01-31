// The configuration for integration tests (separate from the unit test configuration)
// This permits for running the two test types separately:
// - yarn test
// - yarn integration
//
// Integration tests are denoted with .itest.ts while normal ones are .test.ts.
module.exports = {
  transform: { "^.+\\.ts?$": "ts-jest" },
  testEnvironment: "node",
  testRegex: "/tests/.*\\.(itest|ispec)?\\.(ts|tsx)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};
