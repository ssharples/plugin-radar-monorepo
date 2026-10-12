import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const http = httpRouter();

// ============================================
// STRIPE WEBHOOKS
// ============================================
import { stripeWebhook, createCheckoutSession } from "./stripe";
http.route({
  path: "/stripe",
  method: "POST",
  handler: stripeWebhook,
});

http.route({
  path: "/create-checkout-session",
  method: "POST",
  handler: createCheckoutSession,
});

// CORS preflight for checkout
http.route({
  path: "/create-checkout-session",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }),
});

// ============================================
// AI ASSISTANT STREAMING ENDPOINT
// ============================================

http.route({
  path: "/ai/chat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    try {
      const body = await request.json();

      const {
        sessionToken,
        threadId,
        userMessage,
        currentChain,
        inputLevels,
      } = body;

      if (!sessionToken || !threadId || !userMessage) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: sessionToken, threadId, userMessage" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Call the AI action
      const result = await ctx.runAction(api.aiAssistant.chat, {
        sessionToken,
        threadId: threadId as Id<"aiChatThreads">,
        userMessage,
        currentChain: currentChain || undefined,
        inputLevels: inputLevels || undefined,
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error: any) {
      return new Response(
        JSON.stringify({ error: error.message || "Internal server error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }),
});

// CORS preflight
http.route({
  path: "/ai/chat",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }),
});

export default http;
