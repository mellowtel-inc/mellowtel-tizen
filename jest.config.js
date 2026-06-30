/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2015',
          module: 'CommonJS',
          esModuleInterop: true,
          strict: true,
          // tests intentionally exercise unused params; relax these for test transpile
          noUnusedLocals: false,
          noUnusedParameters: false,
        },
      },
    ],
  },
};
