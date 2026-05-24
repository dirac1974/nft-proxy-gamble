import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  setupFiles: ["<rootDir>/tests/setup.ts"],
  testMatch: ["**/*.test.ts"],
  collectCoverageFrom: ["src/**/*.ts", "!src/server.ts"],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
    "./src/services/videoPoker.ts": {
      branches: 100, functions: 100, lines: 100, statements: 100,
    },
  },
  // ts-jest + CommonJS: strip .js extensions so imports resolve to .ts files
  moduleNameMapper: {
    "^(\\.{1,2}/.+)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { strict: true } }],
  },
};

export default config;
