"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "./auth-provider";
import type { Id } from "@/convex/_generated/dataModel";
import { Bell, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";

interface PriceAlertButtonProps {
  pluginId: Id<"plugins">;
  currentPrice?: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function PriceAlertButton({
  pluginId,
  currentPrice,
  size = "md",
  showLabel = true,
}: PriceAlertButtonProps) {
  const router = useRouter();
  const { user, isAuthenticated, sessionToken } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [priceThreshold, setTargetPrice] = useState(
    currentPrice ? Math.floor((currentPrice * 0.8) / 100) : 0
  );
  const [alertType, setAlertType] = useState<"price_drop" | "any_sale">("price_drop");

  const existingAlerts = useQuery(
    api.alerts.getForPlugin,
    sessionToken ? { sessionToken, plugin: pluginId } : "skip"
  );

  const createAlert = useMutation(api.alerts.create);
  const removeAlert = useMutation(api.alerts.remove);

  const hasAlert = existingAlerts && existingAlerts.length > 0;

  const handleClick = () => {
    if (!isAuthenticated || !user) {
      router.push("/account");
      return;
    }

    if (hasAlert) {
      // Remove existing alerts
      existingAlerts?.forEach((alert) => {
        removeAlert({ sessionToken: sessionToken!, id: alert._id });
      });
    } else {
      setShowModal(true);
    }
  };

  const handleCreateAlert = async () => {
    if (!user) return;

    await createAlert({
      sessionToken: sessionToken!,
      plugin: pluginId,
      type: alertType,
      priceThreshold: alertType === "price_drop" ? priceThreshold * 100 : undefined,
    });

    setShowModal(false);
  };

  const sizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-4 py-3",
    lg: "px-6 py-4 text-lg",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`${sizeClasses[size]} rounded-xl transition flex items-center gap-2 ${
          hasAlert
            ? "bg-white/20 text-white hover:bg-white/30"
            : "bg-stone-800 text-white hover:bg-stone-700"
        }`}
        title={hasAlert ? "Remove price alert" : "Set price alert"}
      >
        <Bell
          className={iconSizes[size]}
          weight={hasAlert ? "fill" : "regular"}
        />
        {showLabel && (
          <span className="hidden sm:inline">
            {hasAlert ? "Alert Set" : "Price Alert"}
          </span>
        )}
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setShowModal(false)}
          />
          <div className="relative bg-stone-900 border border-stone-700 rounded-xl p-6 max-w-md w-full">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-stone-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-semibold text-white mb-4">Set Price Alert</h3>

            <div className="space-y-4">
              {/* Alert Type */}
              <div>
                <label className="block text-sm text-stone-400 mb-2">Alert Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAlertType("price_drop")}
                    className={`flex-1 px-4 py-2 rounded-lg transition ${
                      alertType === "price_drop"
                        ? "bg-white text-white"
                        : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                    }`}
                  >
                    Price Drop
                  </button>
                  <button
                    onClick={() => setAlertType("any_sale")}
                    className={`flex-1 px-4 py-2 rounded-lg transition ${
                      alertType === "any_sale"
                        ? "bg-white text-white"
                        : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                    }`}
                  >
                    Any Sale
                  </button>
                </div>
              </div>

              {/* Target Price */}
              {alertType === "price_drop" && (
                <div>
                  <label className="block text-sm text-stone-400 mb-2">
                    Target Price ($)
                  </label>
                  <input
                    type="number"
                    value={priceThreshold}
                    onChange={(e) => setTargetPrice(Number(e.target.value))}
                    min={0}
                    className="w-full px-4 py-3 bg-stone-800 border border-stone-700 rounded-lg text-white focus:outline-none focus:border-white"
                  />
                  {currentPrice && (
                    <p className="text-stone-500 text-xs mt-1">
                      Current price: ${(currentPrice / 100).toFixed(0)}
                    </p>
                  )}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleCreateAlert}
                className="w-full bg-white hover:bg-white text-white font-semibold py-3 rounded-lg transition"
              >
                Create Alert
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
