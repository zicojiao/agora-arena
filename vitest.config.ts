import { mergeConfig, defineConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(viteConfig, defineConfig({
  // Several engine suites simulate thousands of fights; on 2-core CI runners they need more than the default 5 s.
  test: { maxWorkers: 4, testTimeout: 60_000, include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,tsx}'] },
}));
