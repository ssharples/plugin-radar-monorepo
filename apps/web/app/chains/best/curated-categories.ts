// Curated chain categories for programmatic SEO landing pages
// Each targets a high-value keyword like "best hip hop vocal chain"

export interface CuratedCategory {
  slug: string;
  title: string;
  description: string;
  shortDescription: string;
  useCaseGroup: string;
  genre?: string;
  icon: string; // Phosphor icon name hint for the index page
}

export const CURATED_CATEGORIES: CuratedCategory[] = [
  {
    slug: "vocal-hip-hop",
    title: "Best Hip-Hop Vocal Chains",
    description:
      "Discover community-rated plugin chains built for hip-hop vocals. From crisp rap leads to punchy adlibs, these signal chains cover compression, de-essing, saturation, and spatial effects tuned for modern hip-hop production.",
    shortDescription:
      "Plugin chains for rap vocals, adlibs, and hip-hop vocal production.",
    useCaseGroup: "vocals",
    genre: "Hip-Hop",
    icon: "Microphone",
  },
  {
    slug: "mastering-edm",
    title: "Best EDM Mastering Chains",
    description:
      "Top-rated mastering chains optimized for electronic dance music. Loudness-maximized signal paths with multiband compression, stereo imaging, and limiting designed to compete on streaming platforms and festival sound systems.",
    shortDescription:
      "Mastering chains for EDM, house, techno, and electronic genres.",
    useCaseGroup: "mixing-mastering",
    genre: "EDM",
    icon: "WaveSquare",
  },
  {
    slug: "guitar-metal",
    title: "Best Metal Guitar Tone Chains",
    description:
      "High-gain guitar chains for metal, hardcore, and heavy rock. Amp sim setups, tight low-end EQ curves, and aggressive saturation chains rated by the community for crushing rhythm and searing lead tones.",
    shortDescription:
      "High-gain guitar chains for metal, hardcore, and heavy rock.",
    useCaseGroup: "guitar",
    genre: "Rock/Metal",
    icon: "Guitar",
  },
  {
    slug: "vocal-free",
    title: "Best Free Vocal Chains",
    description:
      "Vocal processing chains you can build with free plugins. Community-curated signal paths using stock DAW tools and free third-party plugins for professional-sounding vocals on any budget.",
    shortDescription:
      "Professional vocal chains built with free and stock plugins.",
    useCaseGroup: "vocals",
    icon: "CurrencyCircleDollar",
  },
  {
    slug: "lo-fi-mixing",
    title: "Best Lo-Fi Mixing Chains",
    description:
      "Lo-fi mixing chains for that warm, vintage aesthetic. Tape saturation, vinyl noise, bit-crushing, and filtered reverbs arranged into complete signal paths for lo-fi hip-hop, chillwave, and bedroom pop.",
    shortDescription:
      "Mixing chains for lo-fi hip-hop, chillwave, and bedroom pop.",
    useCaseGroup: "mixing-mastering",
    genre: "Lo-Fi",
    icon: "CassetteTape",
  },
  {
    slug: "mastering-general",
    title: "Best Mastering Chains",
    description:
      "Top-rated mastering chains across all genres. From transparent loudness maximization to colorful analog-style processing, these community-built chains cover the full mastering workflow: EQ, compression, stereo enhancement, and limiting.",
    shortDescription:
      "All-genre mastering chains for loudness, clarity, and punch.",
    useCaseGroup: "mixing-mastering",
    icon: "Faders",
  },
];

export const CURATED_CATEGORY_MAP = new Map(
  CURATED_CATEGORIES.map((c) => [c.slug, c])
);
