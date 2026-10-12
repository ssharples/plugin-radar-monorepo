"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { TrendDown, TrendUp, ChartLine } from "@phosphor-icons/react";

interface PriceHistoryChartProps {
  pluginId: Id<"plugins">;
  currentPrice?: number;
  msrp?: number;
}

export function PriceHistoryChart({ pluginId, currentPrice, msrp }: PriceHistoryChartProps) {
  const history = useQuery(api.priceHistory.getForPlugin, { plugin: pluginId, days: 365 });
  const stats = useQuery(api.priceHistory.getStats, { plugin: pluginId });

  if (!history || history.length === 0) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 text-center">
        <ChartLine className="w-12 h-12 mx-auto mb-3 text-stone-600" />
        <p className="text-stone-400">No price history available yet</p>
        <p className="text-stone-500 text-sm mt-1">
          We'll start tracking prices when this plugin goes on sale
        </p>
      </div>
    );
  }

  // Format data for chart
  const chartData = history.map((item) => ({
    date: new Date(item.recordedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    timestamp: item.recordedAt,
    price: item.price / 100,
    storeName: item.storeName,
    wasOnSale: item.wasOnSale,
  }));

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-stone-800 border border-stone-700 rounded-lg p-3 text-sm">
          <p className="text-white font-medium">${data.price.toFixed(0)}</p>
          <p className="text-stone-400">{data.date}</p>
          <p className="text-stone-500 text-xs">{data.storeName}</p>
          {data.wasOnSale && (
            <p className="text-white text-xs mt-1">On Sale</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-white">Price History</h3>
        {stats && (
          <div className="flex gap-4 text-sm">
            <div className="text-center">
              <p className="text-white font-semibold">${(stats.lowest / 100).toFixed(0)}</p>
              <p className="text-stone-500 text-xs">Lowest</p>
            </div>
            <div className="text-center">
              <p className="text-stone-300 font-semibold">${(stats.average / 100).toFixed(0)}</p>
              <p className="text-stone-500 text-xs">Average</p>
            </div>
            <div className="text-center">
              <p className="text-red-400 font-semibold">${(stats.highest / 100).toFixed(0)}</p>
              <p className="text-stone-500 text-xs">Highest</p>
            </div>
          </div>
        )}
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#44403c" />
            <XAxis
              dataKey="date"
              stroke="#a8a29e"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#a8a29e"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `$${value}`}
              domain={["dataMin - 10", "dataMax + 10"]}
            />
            <Tooltip content={<CustomTooltip />} />
            {msrp && (
              <ReferenceLine
                y={msrp / 100}
                stroke="#78716c"
                strokeDasharray="5 5"
                label={{ value: "MSRP", fill: "#78716c", fontSize: 10 }}
              />
            )}
            <Line
              type="stepAfter"
              dataKey="price"
              stroke="#34d399"
              strokeWidth={2}
              dot={{ fill: "#34d399", strokeWidth: 0, r: 3 }}
              activeDot={{ fill: "#34d399", strokeWidth: 0, r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Price Insight */}
      {stats && currentPrice && (
        <div className="mt-4 pt-4 border-t border-stone-800">
          {currentPrice <= stats.lowest ? (
            <div className="flex items-center gap-2 text-white">
              <TrendDown className="w-5 h-5" />
              <span className="text-sm">Current price is at or near the all-time low!</span>
            </div>
          ) : currentPrice > stats.average ? (
            <div className="flex items-center gap-2 text-white">
              <TrendUp className="w-5 h-5" />
              <span className="text-sm">
                Current price is above average. Consider waiting for a sale.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-stone-400">
              <ChartLine className="w-5 h-5" />
              <span className="text-sm">
                Current price is near average (${((stats.average / 100).toFixed(0))})
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
