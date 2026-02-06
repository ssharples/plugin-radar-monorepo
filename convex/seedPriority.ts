import { mutation } from "./_generated/server";

// Seed priority manufacturers (Scott's list)
export const seedPriorityManufacturers = mutation({
  args: {},
  handler: async (ctx) => {
    const manufacturers = [
      {
        name: "oeksound",
        slug: "oeksound",
        website: "https://oeksound.com",
        description: "Creators of soothe2 - intelligent resonance suppressor",
      },
      {
        name: "Korg",
        slug: "korg",
        website: "https://www.korg.com",
        description: "Japanese manufacturer of synthesizers and music production software",
      },
      {
        name: "Roland",
        slug: "roland",
        website: "https://www.roland.com",
        description: "Legendary synthesizer and drum machine manufacturer",
      },
      {
        name: "Safari Pedals",
        slug: "safari-pedals",
        website: "https://www.safaripedals.com",
        description: "Guitar and audio effect plugins",
      },
      {
        name: "Cableguys",
        slug: "cableguys",
        website: "https://www.cableguys.com",
        description: "Creators of ShaperBox, VolumeShaper, and creative effects",
      },
      {
        name: "Output",
        slug: "output",
        website: "https://output.com",
        description: "Modern instruments and creative tools for music production",
      },
      {
        name: "Antares",
        slug: "antares",
        website: "https://www.antarestech.com",
        description: "Creators of Auto-Tune - the industry standard for pitch correction",
      },
      {
        name: "Sonnox",
        slug: "sonnox",
        website: "https://www.sonnox.com",
        description: "Professional audio plugins derived from Oxford digital technology",
      },
      {
        name: "IK Multimedia",
        slug: "ik-multimedia",
        website: "https://www.ikmultimedia.com",
        description: "T-RackS, AmpliTube, and a wide range of instruments and effects",
      },
    ];
    
    const created = [];
    const skipped = [];
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
      } else {
        skipped.push(mfr.name);
      }
    }
    
    return { created, skipped };
  },
});
