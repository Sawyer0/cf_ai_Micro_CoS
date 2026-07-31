import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        include: ['tests/unit/**/*.test.ts', 'tests/prompts/**/*.test.ts'],
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
