import { v } from "convex/values";
import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";

export const stripeWebhook = httpAction(async (ctx, request) => {
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecret || !webhookSecret) {
        return new Response("Stripe keys not configured", { status: 500 });
    }

    const stripe = new Stripe(stripeSecret, {
        apiVersion: "2024-06-20" as any,
    });

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
        return new Response("Missing stripe-signature header", { status: 400 });
    }

    const payload = await request.text();

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
        console.error(`Webhook Error: ${err.message}`);
        return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;

        const email = session.customer_details?.email;
        const clientReferenceId = session.client_reference_id;

        if (email || clientReferenceId) {
            await ctx.runMutation(internal.stripe.markUserPurchased, {
                email: email ?? undefined,
                userId: clientReferenceId ?? undefined,
            });
        }
    }

    return new Response(null, { status: 200 });
});

export const createCheckoutSession = httpAction(async (ctx, request) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env.STRIPE_PRICE_ID;

    if (!stripeSecret || !priceId) {
        return new Response(
            JSON.stringify({ error: "Stripe not configured" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const stripe = new Stripe(stripeSecret, {
        apiVersion: "2024-06-20" as any,
    });

    let body: { sessionToken?: string; successUrl?: string; cancelUrl?: string };
    try {
        body = await request.json();
    } catch {
        return new Response(
            JSON.stringify({ error: "Invalid JSON body" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Look up user if sessionToken provided
    let userEmail: string | undefined;
    let userId: string | undefined;
    if (body.sessionToken) {
        const session = await ctx.runQuery(internal.stripe.getSessionUser, {
            sessionToken: body.sessionToken,
        });
        if (session) {
            userEmail = session.email;
            userId = session.userId;
        }
    }

    const successUrl = body.successUrl || "https://pluginradar.com/pricing/success";
    const cancelUrl = body.cancelUrl || "https://pluginradar.com/pricing";

    try {
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl,
            client_reference_id: userId,
            customer_email: userEmail,
        });

        return new Response(
            JSON.stringify({ url: session.url }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err: any) {
        console.error("Stripe checkout error:", err.message);
        return new Response(
            JSON.stringify({ error: "Failed to create checkout session" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

export const getSessionUser = internalQuery({
    args: { sessionToken: v.string() },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
            .first();
        if (!session) return null;

        const user = await ctx.db.get(session.userId);
        if (!user) return null;

        return { email: user.email, userId: user._id.toString() };
    },
});

export const markUserPurchased = internalMutation({
    args: {
        email: v.optional(v.string()),
        userId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        let user = null;

        if (args.userId) {
            user = await ctx.db.get(args.userId as any);
        }

        if (!user && args.email) {
            user = await ctx.db
                .query("users")
                .withIndex("by_email", (q) => q.eq("email", args.email!))
                .first();
        }

        if (user) {
            await ctx.db.patch(user._id, { hasPurchased: true });
        } else {
            console.warn("Could not find user to mark as purchased:", args);
        }
    },
});
