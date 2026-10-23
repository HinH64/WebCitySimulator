/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps asset paths relative so the build works under a GitHub Pages sub-path
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // The development study is a separate entry; the normal game does not load its UI or fixtures.
    rolldownOptions: { input: { game: 'index.html', study: 'city-study.html' } },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Balance and approval tests play dozens of whole 29-year games; CI runners are slower than a desktop.
    testTimeout: 30_000,
  },
})
