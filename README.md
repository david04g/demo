# EOD Strategy Lab

A beginner-friendly, rule-based end-of-day strategy builder and synthetic backtester built with Next.js 15, TypeScript, and Tailwind CSS.

## Getting Started

```bash
pnpm install
pnpm dev
```

Visit http://localhost:3000 to load the demo.

## Features

- Visual strategy builder with guardrails and presets
- Natural-language summary and JSON preview of the Strategy v1 spec
- Deterministic synthetic data generation and close-only execution
- Train/validate split with metrics, equity curve, and per-asset table
- No external dependencies or databases; everything runs in-memory via API routes

## Strategy JSON (v1)

The Strategy schema lives in [`lib/types.ts`](lib/types.ts) with validation helpers in [`lib/validate.ts`](lib/validate.ts). Each strategy defines universe, window, capital, risk, indicators, and entry/exit rules composed of boolean expressions.

Guardrails ensure:

- Window length covers indicator warmup plus 252 trading days
- Indicator references are unique and valid
- Sizing actions compute from close-only data with max allocation and position caps
- Time anchor is always the session close

## Synthetic Data & Backtesting

[`lib/sim.ts`](lib/sim.ts) provides deterministic geometric-Brownian candles, indicator caching, and a close-only portfolio engine. The engine executes entries and exits on the close, applies commission and slippage, enforces risk caps, and returns equity curves plus metrics (CAGR, stdev, drawdown, Calmar, hit rate, exposure, turnover).

The API endpoint [`app/api/backtest/route.ts`](app/api/backtest/route.ts) validates incoming JSON with Zod before running the simulation.

## Limitations

- Intended for educational demos only; no intraday modeling
- Parameter sweeps and optimization are intentionally excluded
- Portfolio rules assume liquid instruments with deterministic fills at the close

Feel free to adapt the presets or extend the builder with additional blocks and analytics.
