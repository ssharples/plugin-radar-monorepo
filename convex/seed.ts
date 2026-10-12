import { mutation } from "./_generated/server";

// Seed data for initial setup
export const seedStores = mutation({
  args: {},
  handler: async (ctx) => {
    const stores = [
      {
        name: "Plugin Boutique",
        slug: "plugin-boutique",
        website: "https://www.pluginboutique.com",
        affiliateParam: "?a_aid=pluginradar",
      },
      {
        name: "Plugin Alliance",
        slug: "plugin-alliance",
        website: "https://www.plugin-alliance.com",
      },
      {
        name: "JRRshop",
        slug: "jrrshop",
        website: "https://www.jrrshop.com",
      },
      {
        name: "AudioDeluxe",
        slug: "audiodeluxe",
        website: "https://www.audiodeluxe.com",
      },
      {
        name: "Sweetwater",
        slug: "sweetwater",
        website: "https://www.sweetwater.com",
      },
      {
        name: "Thomann",
        slug: "thomann",
        website: "https://www.thomann.de",
      },
      {
        name: "Best Service",
        slug: "best-service",
        website: "https://www.bestservice.com",
      },
    ];
    
    const created = [];
    for (const store of stores) {
      const existing = await ctx.db
        .query("stores")
        .withIndex("by_slug", (q) => q.eq("slug", store.slug))
        .first();
      
      if (!existing) {
        const id = await ctx.db.insert("stores", {
          ...store,
          logoUrl: undefined,
          affiliateBaseUrl: undefined,
          affiliateParam: store.affiliateParam,
          isActive: true,
          createdAt: Date.now(),
        });
        created.push(store.name);
      }
    }
    
    return { created };
  },
});

export const seedManufacturers = mutation({
  args: {},
  handler: async (ctx) => {
    const manufacturers = [
      {
        name: "FabFilter",
        slug: "fabfilter",
        website: "https://www.fabfilter.com",
        description: "Premium mixing and mastering plugins known for their intuitive interfaces",
      },
      {
        name: "Universal Audio",
        slug: "universal-audio",
        website: "https://www.uaudio.com",
        description: "Industry-standard analog emulations and DSP hardware",
      },
      {
        name: "Waves",
        slug: "waves",
        website: "https://www.waves.com",
        description: "Extensive catalog of professional audio plugins",
      },
      {
        name: "iZotope",
        slug: "izotope",
        website: "https://www.izotope.com",
        description: "AI-powered audio tools for mixing, mastering, and restoration",
      },
      {
        name: "Soundtoys",
        slug: "soundtoys",
        website: "https://www.soundtoys.com",
        description: "Creative audio effects with analog character",
      },
      {
        name: "Native Instruments",
        slug: "native-instruments",
        website: "https://www.native-instruments.com",
        description: "Virtual instruments, effects, and production tools",
      },
      {
        name: "Slate Digital",
        slug: "slate-digital",
        website: "https://www.slatedigital.com",
        description: "Professional mixing and mastering plugins",
      },
      {
        name: "Plugin Alliance",
        slug: "plugin-alliance",
        website: "https://www.plugin-alliance.com",
        description: "Coalition of boutique plugin developers",
      },
      {
        name: "Arturia",
        slug: "arturia",
        website: "https://www.arturia.com",
        description: "Vintage synthesizer emulations and effects",
      },
      {
        name: "Valhalla DSP",
        slug: "valhalla-dsp",
        website: "https://valhalladsp.com",
        description: "High-quality reverbs and delays at affordable prices",
      },
      {
        name: "Eventide",
        slug: "eventide",
        website: "https://www.eventideaudio.com",
        description: "Legendary effects processors",
      },
      {
        name: "Softube",
        slug: "softube",
        website: "https://www.softube.com",
        description: "Premium analog emulations",
      },
      {
        name: "Tokyo Dawn Labs",
        slug: "tokyo-dawn-labs",
        website: "https://www.tokyodawn.net",
        description: "High-quality free and commercial plugins",
      },
      {
        name: "Xfer Records",
        slug: "xfer-records",
        website: "https://xferrecords.com",
        description: "Creator of Serum synthesizer",
      },
      {
        name: "Spectrasonics",
        slug: "spectrasonics",
        website: "https://www.spectrasonics.net",
        description: "Omnisphere and premium virtual instruments",
      },
    ];
    
    const created = [];
    const now = Date.now();
    
    for (const mfr of manufacturers) {
      const existing = await ctx.db
        .query("manufacturers")
        .withIndex("by_slug", (q) => q.eq("slug", mfr.slug))
        .first();
      
      if (!existing) {
        await ctx.db.insert("manufacturers", {
          name: mfr.name,
          slug: mfr.slug,
          website: mfr.website,
          description: mfr.description,
          logoUrl: undefined,
          newsletterEmail: undefined,
          newsletterSubscribed: false,
          pluginCount: 0,
          createdAt: now,
          updatedAt: now,
        });
        created.push(mfr.name);
      }
    }
    
    return { created };
  },
});

// Seed some example plugins (you can expand this)
export const seedExamplePlugins = mutation({
  args: {},
  handler: async (ctx) => {
    // Get FabFilter manufacturer
    const fabfilter = await ctx.db
      .query("manufacturers")
      .withIndex("by_slug", (q) => q.eq("slug", "fabfilter"))
      .first();
    
    if (!fabfilter) {
      return { error: "Run seedManufacturers first" };
    }
    
    const plugins = [
      {
        name: "Pro-Q 4",
        slug: "fabfilter-pro-q-4",
        category: "eq",
        description: "The latest version of the award-winning FabFilter Pro-Q equalizer",
        msrp: 17900, // $179.00 in cents
        formats: ["VST3", "AU", "AAX"],
        platforms: ["windows", "mac"],
        productUrl: "https://www.fabfilter.com/products/pro-q-4-equalizer-plug-in",
        tags: ["mixing", "mastering", "dynamic-eq", "linear-phase"],
      },
      {
        name: "Pro-L 2",
        slug: "fabfilter-pro-l-2",
        category: "limiter",
        description: "Professional true peak limiter with advanced metering",
        msrp: 19900,
        formats: ["VST3", "AU", "AAX"],
        platforms: ["windows", "mac"],
        productUrl: "https://www.fabfilter.com/products/pro-l-2-limiter-plug-in",
        tags: ["mastering", "loudness", "true-peak"],
      },
      {
        name: "Pro-C 2",
        slug: "fabfilter-pro-c-2",
        category: "compressor",
        description: "Versatile compressor with 8 compression styles",
        msrp: 17900,
        formats: ["VST3", "AU", "AAX"],
        platforms: ["windows", "mac"],
        productUrl: "https://www.fabfilter.com/products/pro-c-2-compressor-plug-in",
        tags: ["mixing", "mastering", "multiband"],
      },
    ];
    
    const created = [];
    const now = Date.now();
    
    for (const plugin of plugins) {
      const existing = await ctx.db
        .query("plugins")
        .withIndex("by_slug", (q) => q.eq("slug", plugin.slug))
        .first();
      
      if (!existing) {
        await ctx.db.insert("plugins", {
          name: plugin.name,
          slug: plugin.slug,
          manufacturer: fabfilter._id,
          description: plugin.description,
          shortDescription: undefined,
          category: plugin.category,
          subcategory: undefined,
          tags: plugin.tags,
          formats: plugin.formats,
          platforms: plugin.platforms,
          systemRequirements: undefined,
          currentVersion: undefined,
          releaseDate: undefined,
          lastUpdated: now,
          msrp: plugin.msrp,
          currentPrice: plugin.msrp,
          currency: "USD",
          isFree: false,
          hasDemo: true,
          hasTrial: true,
          trialDays: 30,
          imageUrl: undefined,
          bannerUrl: undefined,
          screenshots: [],
          videoUrl: undefined,
          audioDemo: undefined,
          productUrl: plugin.productUrl,
          manualUrl: undefined,
          isActive: true,
          isDiscontinued: false,
          createdAt: now,
          updatedAt: now,
        });
        created.push(plugin.name);
        
        // Increment manufacturer count
        await ctx.db.patch(fabfilter._id, {
          pluginCount: fabfilter.pluginCount + created.length,
        });
      }
    }
    
    return { created };
  },
});
