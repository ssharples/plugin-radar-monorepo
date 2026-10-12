"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/auth-provider";
import Link from "next/link";
import { Bell, Trash, Check, ArrowRight, TrendDown, Tag, Waveform } from "@phosphor-icons/react";

export default function AlertsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const alerts = useQuery(
    api.alerts.listByUser,
    user ? { user: user._id } : "skip"
  );
  const removeAlert = useMutation(api.alerts.remove);
  const updateAlert = useMutation(api.alerts.update);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 lg:px-6 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] via-transparent to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 lg:px-6 py-16 text-center relative">
          <div className="w-16 h-16 bg-white/[0.04] border border-white/[0.06] rounded-full flex items-center justify-center mx-auto mb-4">
            <Bell className="w-8 h-8 text-stone-500" />
          </div>
          <h1
            className="text-2xl font-bold text-stone-100 mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Price Alerts
          </h1>
          <p className="text-stone-400 mb-6">Sign in to set up price alerts for plugins</p>
          <Link
            href="/account"
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-stone-900 font-semibold rounded-xl transition shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
          >
            Sign In
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  const activeAlerts = alerts?.filter((a) => a.isActive) || [];
  const triggeredAlerts = alerts?.filter((a) => a.isTriggered) || [];

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-gradient-to-b from-amber-500/[0.02] via-transparent to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-6 py-10 relative">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-wider mb-3">Notifications</p>
            <h1
              className="text-2xl font-bold text-stone-100"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Price Alerts
            </h1>
            <p className="text-stone-400">
              {activeAlerts.length} active alert{activeAlerts.length !== 1 ? "s" : ""}
              {triggeredAlerts.length > 0 && (
                <span className="text-amber-400 ml-2">
                  &bull; {triggeredAlerts.length} triggered!
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="section-line mb-8" />

        {/* Triggered Alerts */}
        {triggeredAlerts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-amber-400 mb-4 flex items-center gap-2">
              <Check className="w-5 h-5" />
              Triggered Alerts
            </h2>
            <div className="space-y-3">
              {triggeredAlerts.map((alert) => (
                <AlertCard
                  key={alert._id}
                  alert={alert}
                  onRemove={() => removeAlert({ id: alert._id })}
                  onToggle={() =>
                    updateAlert({ id: alert._id, isActive: !alert.isActive })
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Active Alerts */}
        {alerts && alerts.length > 0 ? (
          <div className="space-y-3">
            {alerts
              .filter((a) => !a.isTriggered)
              .map((alert) => (
                <AlertCard
                  key={alert._id}
                  alert={alert}
                  onRemove={() => removeAlert({ id: alert._id })}
                  onToggle={() =>
                    updateAlert({ id: alert._id, isActive: !alert.isActive })
                  }
                />
              ))}
          </div>
        ) : (
          <div className="text-center py-16 glass-card rounded-xl">
            <Bell className="w-16 h-16 mx-auto mb-4 text-stone-600" />
            <h3 className="text-xl font-semibold text-stone-100 mb-2">No alerts set</h3>
            <p className="text-stone-400 mb-6">
              Set price alerts on plugin pages to get notified when prices drop
            </p>
            <Link
              href="/plugins"
              className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-stone-900 font-semibold rounded-xl transition shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
            >
              Browse Plugins
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function AlertCard({
  alert,
  onRemove,
  onToggle,
}: {
  alert: any;
  onRemove: () => void;
  onToggle: () => void;
}) {
  const plugin = alert.pluginData;
  const manufacturer = alert.manufacturerData;

  if (!plugin) return null;

  const alertTypeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    price_drop: {
      label: "Price Drop",
      icon: <TrendDown className="w-4 h-4" />,
    },
    any_sale: {
      label: "Any Sale",
      icon: <Tag className="w-4 h-4" />,
    },
    new_release: {
      label: "New Release",
      icon: <Bell className="w-4 h-4" />,
    },
    update: {
      label: "Update",
      icon: <Bell className="w-4 h-4" />,
    },
  };

  const typeInfo = alertTypeLabels[alert.type] || {
    label: alert.type,
    icon: <Bell className="w-4 h-4" />,
  };

  return (
    <div
      className={`glass-card rounded-xl p-4 flex gap-4 ${
        alert.isTriggered
          ? "!border-amber-500/40"
          : alert.isActive
          ? ""
          : "opacity-50"
      }`}
    >
      {/* Plugin Image */}
      <Link href={`/plugins/${plugin.slug}`} className="shrink-0">
        <div className="w-20 h-14 rounded-lg overflow-hidden bg-white/[0.04]">
          {plugin.imageUrl ? (
            <img
              src={plugin.imageUrl}
              alt={plugin.name}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Waveform className="w-5 h-5 text-stone-600" />
            </div>
          )}
        </div>
      </Link>

      {/* Alert Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link
              href={`/plugins/${plugin.slug}`}
              className="font-medium text-stone-100 hover:text-amber-400 transition"
            >
              {plugin.name}
            </Link>
            <p className="text-stone-500 text-sm">{manufacturer?.name || "Unknown"}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${
              alert.isTriggered
                ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
                : "bg-white/[0.04] text-stone-400 border-white/[0.06]"
            }`}
          >
            {typeInfo.icon}
            {typeInfo.label}
          </span>

          {alert.type === "price_drop" && alert.priceThreshold && (
            <span className="text-xs text-stone-500">
              Target: ${(alert.priceThreshold / 100).toFixed(0)}
            </span>
          )}

          {alert.isTriggered && (
            <span className="text-xs text-amber-400 font-medium">Ready to buy!</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {alert.isTriggered && (
          <Link
            href={`/plugins/${plugin.slug}`}
            className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-stone-900 text-sm font-semibold rounded-xl transition"
          >
            View
          </Link>
        )}
        <button
          onClick={onToggle}
          className={`p-2 rounded-xl transition ${
            alert.isActive
              ? "text-stone-400 hover:text-stone-100 hover:bg-white/[0.06]"
              : "text-stone-600 hover:text-amber-400 hover:bg-white/[0.06]"
          }`}
          title={alert.isActive ? "Pause alert" : "Resume alert"}
        >
          {alert.isActive ? (
            <Bell className="w-5 h-5" weight="fill" />
          ) : (
            <Bell className="w-5 h-5" />
          )}
        </button>
        <button
          onClick={onRemove}
          className="p-2 text-stone-500 hover:text-red-400 transition"
          title="Delete alert"
        >
          <Trash className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
