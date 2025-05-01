/// <reference types="vitest" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import packageJson from './package.json';

const packageName = packageJson.name.split('/').pop() || packageJson.name;

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'cjs', 'umd', 'iife'],
      name: packageName,
      fileName: 'index',
    },
  },
  plugins: [
    dts({
      exclude: ['src/**/*.test.ts'],
    }),
  ],
  test: {
    testTimeout: 300000,

    coverage: {
      reporter: ['text', 'json-summary', 'json'],
      thresholds: {
        lines: 50,
        branches: 50,
        functions: 50,
        statements: 50,
      },
    },
  },
});
