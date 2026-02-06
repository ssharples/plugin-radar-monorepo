import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// =============================================================================
// AUTH WITH PBKDF2 HASHING + OPAQUE SESSION TOKENS
// =============================================================================

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// -- Password hashing using Web Crypto PBKDF2 --

function hexEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexDecode(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return `pbkdf2:100000:${hexEncode(salt)}:${hexEncode(derived)}`;
}

async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  // Support legacy simpleHash format for backward compatibility
  if (!stored.startsWith("pbkdf2:100000:")) {
    return legacyVerify(password, stored);
  }

  const parts = stored.split(":");
  if (parts.length !== 4) return false;

  const iterations = parseInt(parts[1], 10);
  const salt = hexDecode(parts[2]);
  const expectedHash = parts[3];

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt.buffer as ArrayBuffer, iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );

  return hexEncode(derived) === expectedHash;
}

/** Verify against legacy simpleHash format for existing accounts */
function legacyVerify(password: string, hash: string): boolean {
  let h = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    h = ((h << 5) - h) + char;
    h = h & h;
  }
  const legacyHash = `pbkdf2_${Math.abs(h).toString(36)}_${password.length}`;
  return legacyHash === hash;
}

/** Generate opaque session token */
function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return hexEncode(bytes);
}

// =============================================================================
// MUTATIONS
// =============================================================================

/**
 * Register a new user with email and password
 */
export const register = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if user exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existing) {
      throw new Error("User already exists with this email");
    }

    // Hash password with PBKDF2
    const passwordHash = await hashPassword(args.password);

    // Create user
    const userId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name,
      externalId: `email_${args.email}`,
      passwordHash,
      isAdmin: false,
      tier: "free",
      preferredCurrency: "USD",
      emailDigest: "weekly",
      createdAt: now,
      lastSeenAt: now,
    });

    // Create session
    const token = generateToken();
    await ctx.db.insert("sessions", {
      token,
      userId,
      createdAt: now,
      expiresAt: now + SESSION_DURATION_MS,
    });

    return {
      userId,
      sessionToken: token,
      email: args.email,
      isAdmin: false,
    };
  },
});

/**
 * Login with email and password
 */
export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user) {
      throw new Error("Invalid email or password");
    }

    // Verify password (supports both PBKDF2 and legacy hashes)
    if (
      !user.passwordHash ||
      !(await verifyPassword(args.password, user.passwordHash))
    ) {
      throw new Error("Invalid email or password");
    }

    // Upgrade legacy hash to PBKDF2 on successful login
    if (!user.passwordHash.startsWith("pbkdf2:100000:")) {
      const newHash = await hashPassword(args.password);
      await ctx.db.patch(user._id, { passwordHash: newHash });
    }

    // Update last seen
    const now = Date.now();
    await ctx.db.patch(user._id, { lastSeenAt: now });

    // Create session
    const token = generateToken();
    await ctx.db.insert("sessions", {
      token,
      userId: user._id,
      createdAt: now,
      expiresAt: now + SESSION_DURATION_MS,
    });

    return {
      userId: user._id,
      sessionToken: token,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin ?? false,
    };
  },
});

/**
 * Verify a session token and get user.
 * Supports both new opaque tokens (sessions table) and legacy tokens (embedded userId).
 */
export const verifySession = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Try new session table first
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .first();

    if (session) {
      // Check expiry
      if (session.expiresAt < now) {
        return null;
      }
      const user = await ctx.db.get(session.userId);
      if (!user) return null;

      return {
        userId: user._id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin ?? false,
        tier: user.tier,
      };
    }

    // Legacy tokens (sess_*) are no longer accepted.
    // Users with old sessions will need to log in again.
    return null;
  },
});

/**
 * Logout — delete the session
 */
export const logout = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .first();

    if (session) {
      await ctx.db.delete(session._id);
    }
  },
});

/**
 * Seed admin user (run once)
 */
export const seedAdmin = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const passwordHash = await hashPassword(args.password);

    // Check if admin already exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existing) {
      // Update to admin if exists
      await ctx.db.patch(existing._id, {
        isAdmin: true,
        passwordHash,
        lastSeenAt: now,
      });
      return { userId: existing._id, updated: true };
    }

    // Create admin user
    const userId = await ctx.db.insert("users", {
      email: args.email,
      name: args.name || "Admin",
      externalId: `admin_${args.email}`,
      passwordHash,
      isAdmin: true,
      tier: "premium",
      preferredCurrency: "USD",
      emailDigest: "none",
      createdAt: now,
      lastSeenAt: now,
    });

    return { userId, created: true };
  },
});

/**
 * Check if user is admin
 */
export const isAdmin = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user?.isAdmin ?? false;
  },
});
