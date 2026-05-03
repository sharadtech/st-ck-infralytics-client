import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/infralytiqs.js',
      format: 'iife',
      name: 'Infralytiqs',
      sourcemap: false,
    },
    {
      file: 'dist/infralytiqs.min.js',
      format: 'iife',
      name: 'Infralytiqs',
      sourcemap: false,
      plugins: [terser()],
    },
  ],
  plugins: [
    resolve(),
    typescript({ tsconfig: './tsconfig.json', declaration: false, declarationDir: undefined }),
  ],
};
