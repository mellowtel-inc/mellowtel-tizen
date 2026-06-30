import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const input = 'src/index.ts';

// Everything is bundled in (turndown, uuid) so the host Tizen app needs no
// node_modules resolution at runtime — a single <script> or ESM import works.
const jsPlugins = [
  resolve({ browser: true }),
  commonjs(),
  typescript({
    tsconfig: './tsconfig.json',
    declaration: false,
    declarationDir: undefined,
    outDir: undefined,
  }),
];

export default [
  // UMD build — for <script> tag users on the TV. Exposes global `Mellowtel`.
  {
    input: 'src/umd.ts',
    output: {
      file: 'dist/mellowtel-tizen.umd.js',
      format: 'umd',
      name: 'Mellowtel',
      exports: 'default',
      sourcemap: true,
    },
    plugins: jsPlugins,
  },
  // ESM build — for bundler users.
  {
    input,
    output: {
      file: 'dist/mellowtel-tizen.esm.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: jsPlugins,
  },
  // Rolled-up type declarations.
  {
    input,
    output: { file: 'dist/types/index.d.ts', format: 'es' },
    plugins: [dts()],
  },
];
