import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: [
      'shared/**/*.test.ts',
      'utils/**/*.test.ts',
      'services/**/*.test.ts',
      'backend/src/lib/dailyQuestionBank.test.ts',
      'backend/src/lib/insightDates.test.ts',
      'backend/src/lib/phone.test.ts',
      'backend/src/routes/history.test.ts',
    ],
  },
})
