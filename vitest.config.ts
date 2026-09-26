import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.spec.{ts,tsx}'],
    // The adapter suite drives real timers (an idle watchdog, image projection)
    // and a couple of its cases assert inside a 5s bound that only holds when
    // the file runs alone. Under the full parallel suite those cases can exceed
    // it and fail while the behavior under test is fine, so the bound is raised
    // once here rather than being papered over per assertion.
    testTimeout: 20_000,
  },
})
