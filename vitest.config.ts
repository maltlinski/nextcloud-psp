import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		passWithNoTests: true,
		include: ['src/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/core/**/*.ts'],
			exclude: ['src/core/__tests__/**', 'src/core/index.ts'],
			reporter: ['text', 'html'],
			thresholds: {
				lines: 90,
				functions: 90,
				branches: 90,
				statements: 90,
			},
		},
	},
})
