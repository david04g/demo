"use client";

import { useMemo } from "react";
import { BacktestResult } from "@/lib/types";
import { line } from "d3-shape";
import { scaleLinear, scaleTime } from "d3-scale";

type ResultsViewProps = {
  result?: BacktestResult;
  loading: boolean;
  error?: string;
};

const formatPct = (value: number) => `${(value * 100).toFixed(2)}%`;
const formatNumber = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export const ResultsView = ({ result, loading, error }: ResultsViewProps) => {
  const chart = useMemo(() => {
    if (!result) return null;
    const dates = result.equity.validate.dates;
    const values = result.equity.validate.values;
    if (dates.length === 0) return null;
    const parseDate = (date: string) => new Date(date);
    const width = 700;
    const height = 240;
    const x = scaleTime()
      .domain([parseDate(dates[0]), parseDate(dates[dates.length - 1])])
      .range([0, width]);
    const y = scaleLinear().domain([Math.min(...values), Math.max(...values)]).range([height, 0]);
    const path = line<number>()
      .x((_, i) => x(parseDate(dates[i])))
      .y((d) => y(d))(values);
    return { width, height, path };
  }, [result]);

  return (
    <section className="card space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="section-title">Backtest Results</h2>
        {loading && <span className="badge animate-pulse bg-brand/20 text-brand">Running…</span>}
      </header>
      {error && <div className="rounded-lg border border-red-600/50 bg-red-900/40 px-3 py-2 text-sm text-red-100">{error}</div>}
      {result?.warnings.length ? (
        <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {result.warnings.join(" ")}
        </div>
      ) : null}
      {chart ? (
        <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="w-full">
          <path d={chart.path ?? ""} fill="none" stroke="#22d3ee" strokeWidth={2} />
        </svg>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-400">
          {loading ? "Crunching synthetic candles…" : "Run the backtest to see the equity curve."}
        </div>
      )}
      {result && (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-300">Train Metrics</h3>
            <table className="table">
              <tbody>
                <MetricRow label="CAGR" value={formatPct(result.metrics.train.cagr)} />
                <MetricRow label="Stdev" value={formatPct(result.metrics.train.stdev)} />
                <MetricRow label="Max Drawdown" value={formatPct(result.metrics.train.maxDrawdown)} />
                <MetricRow label="Calmar" value={result.metrics.train.calmar.toFixed(2)} />
                <MetricRow label="Hit Rate" value={formatPct(result.metrics.train.hitRate)} />
                <MetricRow label="Avg Win" value={formatNumber(result.metrics.train.avgWin)} />
                <MetricRow label="Avg Loss" value={formatNumber(result.metrics.train.avgLoss)} />
                <MetricRow label="Exposure" value={formatPct(result.metrics.train.exposure)} />
                <MetricRow label="Turnover" value={formatNumber(result.metrics.train.turnover)} />
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-300">Validate Metrics</h3>
            <table className="table">
              <tbody>
                <MetricRow label="CAGR" value={formatPct(result.metrics.validate.cagr)} />
                <MetricRow label="Stdev" value={formatPct(result.metrics.validate.stdev)} />
                <MetricRow label="Max Drawdown" value={formatPct(result.metrics.validate.maxDrawdown)} />
                <MetricRow label="Calmar" value={result.metrics.validate.calmar.toFixed(2)} />
                <MetricRow label="Hit Rate" value={formatPct(result.metrics.validate.hitRate)} />
                <MetricRow label="Avg Win" value={formatNumber(result.metrics.validate.avgWin)} />
                <MetricRow label="Avg Loss" value={formatNumber(result.metrics.validate.avgLoss)} />
                <MetricRow label="Exposure" value={formatPct(result.metrics.validate.exposure)} />
                <MetricRow label="Turnover" value={formatNumber(result.metrics.validate.turnover)} />
              </tbody>
            </table>
          </div>
        </div>
      )}
      {result && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-300">Per-Asset Contribution</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Trades</th>
                <th>PnL</th>
                <th>Exposure</th>
              </tr>
            </thead>
            <tbody>
              {result.perAsset.map((row) => (
                <tr key={row.symbol}>
                  <td>{row.symbol}</td>
                  <td>{row.trades}</td>
                  <td>{formatNumber(row.pnl)}</td>
                  <td>{formatPct(row.exposure)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

type MetricRowProps = {
  label: string;
  value: string;
};

const MetricRow = ({ label, value }: MetricRowProps) => (
  <tr>
    <th>{label}</th>
    <td>{value}</td>
  </tr>
);
