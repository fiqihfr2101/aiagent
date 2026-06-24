// ─── H.E.R.M.E.S. Lighthouse CI Configuration ─────────────────────
// Performance budgets and Core Web Vitals targets for the frontend dashboard

module.exports = {
  ci: {
    collect: {
      // URLs to test
      url: [
        "http://localhost:3000/",
        "http://localhost:3000/agents",
        "http://localhost:3000/tasks",
        "http://localhost:3000/metrics",
        "http://localhost:3000/notifications",
      ],
      // Number of runs per URL
      numberOfRuns: 3,
      // Settings for Lighthouse
      settings: {
        chromeFlags: "--no-sandbox --headless --disable-gpu",
        preset: "desktop",
        // Throttling settings (simulated 4G)
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
        },
      },
    },
    assert: {
      assertions: {
        // ─── Performance Budget ─────────────────────────────────────
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:seo": ["warn", { minScore: 0.8 }],

        // ─── Core Web Vitals ────────────────────────────────────────
        // Largest Contentful Paint (LCP) - should be < 2.5s
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        // First Input Delay (FID) / Total Blocking Time (TBT) - should be < 200ms
        "total-blocking-time": ["error", { maxNumericValue: 200 }],
        // Cumulative Layout Shift (CLS) - should be < 0.1
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],

        // ─── Additional Performance Metrics ─────────────────────────
        // First Contentful Paint (FCP) - should be < 1.8s
        "first-contentful-paint": ["warn", { maxNumericValue: 1800 }],
        // Speed Index - should be < 3.4s
        "speed-index": ["warn", { maxNumericValue: 3400 }],
        // Time to Interactive (TTI) - should be < 3.8s
        "interactive": ["warn", { maxNumericValue: 3800 }],

        // ─── Resource Budgets ───────────────────────────────────────
        // Total JavaScript bundle < 300KB
        "resource-summary:script:size": ["warn", { maxNumericValue: 300000 }],
        // Total CSS < 50KB
        "resource-summary:stylesheet:size": ["warn", { maxNumericValue: 50000 }],
        // Total images < 500KB
        "resource-summary:image:size": ["warn", { maxNumericValue: 500000 }],
        // Total font < 100KB
        "resource-summary:font:size": ["warn", { maxNumericValue: 100000 }],
        // Total page weight < 1.5MB
        "resource-summary:total:size": ["error", { maxNumericValue: 1500000 }],
        // Number of requests < 50
        "resource-summary:total:count": ["warn", { maxNumericValue: 50 }],

        // ─── Network Requests ───────────────────────────────────────
        // No render-blocking resources > 3
        "render-blocking-resources": ["warn", { maxNumericValue: 3 }],
        // Unused JavaScript < 50KB
        "unused-javascript": ["warn", { maxNumericValue: 50000 }],
        // Unused CSS < 20KB
        "unused-css-rules": ["warn", { maxNumericValue: 20000 }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
