"use client";

import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { SlugInput } from "./SlugInput";
import { ImageUpload } from "./ImageUpload";
import { FormSection } from "./FormSection";
import { MultiCheckbox } from "./MultiCheckbox";
import { ArrowLeft, MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";

interface PluginData {
  _id?: Id<"plugins">;
  name?: string;
  slug?: string;
  manufacturer?: Id<"manufacturers">;
  category?: string;
  subcategory?: string;
  tags?: string[];
  description?: string;
  shortDescription?: string;
  formats?: string[];
  platforms?: string[];
  systemRequirements?: string;
  currentVersion?: string;
  releaseDate?: number;
  msrp?: number;
  currentPrice?: number;
  currency?: string;
  isFree?: boolean;
  hasDemo?: boolean;
  hasTrial?: boolean;
  trialDays?: number;
  imageStorageId?: Id<"_storage">;
  bannerStorageId?: Id<"_storage">;
  videoUrl?: string;
  audioDemo?: string;
  productUrl?: string;
  manualUrl?: string;
  isActive?: boolean;
  isDiscontinued?: boolean;
  worksWellOn?: string[];
  useCases?: string[];
  genreSuitability?: string[];
  sonicCharacter?: string[];
  comparableTo?: string[];
  skillLevel?: string;
  learningCurve?: string;
  cpuUsage?: string;
  licenseType?: string;
  keyFeatures?: string[];
  recommendedDaws?: string[];
  isIndustryStandard?: boolean;
  effectType?: string;
  circuitEmulation?: string;
  tonalCharacter?: string[];
}

const CATEGORIES = [
  "eq",
  "compressor",
  "limiter",
  "reverb",
  "delay",
  "saturation",
  "modulation",
  "stereo-imaging",
  "gate-expander",
  "de-esser",
  "filter",
  "channel-strip",
  "metering",
  "noise-reduction",
  "multiband",
  "utility",
];

const FORMAT_OPTIONS = [
  { value: "VST3", label: "VST3" },
  { value: "AU", label: "AU" },
  { value: "AAX", label: "AAX" },
  { value: "CLAP", label: "CLAP" },
  { value: "Standalone", label: "Standalone" },
];

const PLATFORM_OPTIONS = [
  { value: "windows", label: "Windows" },
  { value: "mac", label: "macOS" },
  { value: "linux", label: "Linux" },
];

export function PluginForm({
  initialData,
  mode,
}: {
  initialData?: PluginData;
  mode: "create" | "edit";
}) {
  const { sessionToken } = useAuth();
  const router = useRouter();
  const createMutation = useMutation(api.plugins.create);
  const updateMutation = useMutation(api.plugins.update);
  const enrichmentOptions = useQuery(api.plugins.getEnrichmentOptions);

  // Core
  const [name, setName] = useState(initialData?.name ?? "");
  const [slug, setSlug] = useState(initialData?.slug ?? "");
  const [manufacturerId, setManufacturerId] = useState<Id<"manufacturers"> | null>(
    initialData?.manufacturer ?? null
  );
  const [category, setCategory] = useState(initialData?.category ?? "");
  const [subcategory, setSubcategory] = useState(initialData?.subcategory ?? "");
  const [tags, setTags] = useState<string[]>(initialData?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [shortDescription, setShortDescription] = useState(initialData?.shortDescription ?? "");

  // Technical
  const [formats, setFormats] = useState<string[]>(initialData?.formats ?? []);
  const [platforms, setPlatforms] = useState<string[]>(initialData?.platforms ?? []);
  const [systemRequirements, setSystemRequirements] = useState(initialData?.systemRequirements ?? "");
  const [currentVersion, setCurrentVersion] = useState(initialData?.currentVersion ?? "");
  const [releaseDate, setReleaseDate] = useState(
    initialData?.releaseDate ? new Date(initialData.releaseDate).toISOString().split("T")[0] : ""
  );

  // Pricing
  const [msrpDollars, setMsrpDollars] = useState(
    initialData?.msrp != null ? (initialData.msrp / 100).toString() : ""
  );
  const [currentPriceDollars, setCurrentPriceDollars] = useState(
    initialData?.currentPrice != null ? (initialData.currentPrice / 100).toString() : ""
  );
  const [currency, setCurrency] = useState(initialData?.currency ?? "USD");
  const [isFree, setIsFree] = useState(initialData?.isFree ?? false);
  const [hasDemo, setHasDemo] = useState(initialData?.hasDemo ?? false);
  const [hasTrial, setHasTrial] = useState(initialData?.hasTrial ?? false);
  const [trialDays, setTrialDays] = useState(initialData?.trialDays?.toString() ?? "");

  // Media
  const [imageStorageId, setImageStorageId] = useState<Id<"_storage"> | null>(
    initialData?.imageStorageId ?? null
  );
  const [bannerStorageId, setBannerStorageId] = useState<Id<"_storage"> | null>(
    initialData?.bannerStorageId ?? null
  );
  const [videoUrl, setVideoUrl] = useState(initialData?.videoUrl ?? "");
  const [audioDemo, setAudioDemo] = useState(initialData?.audioDemo ?? "");

  // Links
  const [productUrl, setProductUrl] = useState(initialData?.productUrl ?? "");
  const [manualUrl, setManualUrl] = useState(initialData?.manualUrl ?? "");

  // Status
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [isDiscontinued, setIsDiscontinued] = useState(initialData?.isDiscontinued ?? false);

  // Enrichment
  const [worksWellOn, setWorksWellOn] = useState<string[]>(initialData?.worksWellOn ?? []);
  const [useCases, setUseCases] = useState<string[]>(initialData?.useCases ?? []);
  const [genreSuitability, setGenreSuitability] = useState<string[]>(initialData?.genreSuitability ?? []);
  const [sonicCharacter, setSonicCharacter] = useState<string[]>(initialData?.sonicCharacter ?? []);
  const [comparableTo, setComparableTo] = useState<string[]>(initialData?.comparableTo ?? []);
  const [skillLevel, setSkillLevel] = useState(initialData?.skillLevel ?? "");
  const [learningCurve, setLearningCurve] = useState(initialData?.learningCurve ?? "");
  const [cpuUsage, setCpuUsage] = useState(initialData?.cpuUsage ?? "");
  const [licenseType, setLicenseType] = useState(initialData?.licenseType ?? "");
  const [keyFeatures, setKeyFeatures] = useState<string[]>(initialData?.keyFeatures ?? []);
  const [recommendedDaws, setRecommendedDaws] = useState<string[]>(initialData?.recommendedDaws ?? []);
  const [isIndustryStandard, setIsIndustryStandard] = useState(initialData?.isIndustryStandard ?? false);
  const [effectType, setEffectType] = useState(initialData?.effectType ?? "");
  const [circuitEmulation, setCircuitEmulation] = useState(initialData?.circuitEmulation ?? "");
  const [tonalCharacter, setTonalCharacter] = useState<string[]>(initialData?.tonalCharacter ?? []);

  // Manufacturer search
  const [mfgSearch, setMfgSearch] = useState("");
  const mfgResults = useQuery(
    api.manufacturers.search,
    mfgSearch.length >= 2 ? { query: mfgSearch } : "skip"
  );
  const selectedMfg = useQuery(
    api.manufacturers.get,
    manufacturerId ? { id: manufacturerId } : "skip"
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSlugChange = useCallback((newSlug: string) => {
    setSlug(newSlug);
  }, []);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  };

  // Determine which sections should be open by default in edit mode
  const hasEnrichment = mode === "edit" && !!(
    (initialData?.worksWellOn?.length ?? 0) > 0 ||
    (initialData?.useCases?.length ?? 0) > 0 ||
    initialData?.skillLevel ||
    initialData?.effectType
  );
  const hasTechnical = mode === "edit" && (
    (initialData?.formats?.length ?? 0) > 0 ||
    (initialData?.platforms?.length ?? 0) > 0
  );
  const hasPricing = mode === "edit" && !!(initialData?.msrp != null || initialData?.currentPrice != null);
  const hasMedia = mode === "edit" && !!(initialData?.imageStorageId || initialData?.videoUrl);
  const hasLinks = mode === "edit" && !!initialData?.productUrl;
  const hasStatus = (mode as string) === "edit";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken) return;
    if (!name.trim() || !slug.trim() || !category || !manufacturerId || !productUrl.trim()) {
      setError("Name, slug, category, manufacturer, and product URL are required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const msrpCents = msrpDollars ? Math.round(parseFloat(msrpDollars) * 100) : undefined;
      const currentPriceCents = currentPriceDollars
        ? Math.round(parseFloat(currentPriceDollars) * 100)
        : undefined;
      const releaseDateMs = releaseDate ? new Date(releaseDate).getTime() : undefined;

      if (mode === "create") {
        await createMutation({
          sessionToken,
          name: name.trim(),
          slug: slug.trim(),
          manufacturer: manufacturerId,
          category,
          subcategory: subcategory || undefined,
          tags,
          description: description || undefined,
          shortDescription: shortDescription || undefined,
          formats,
          platforms,
          systemRequirements: systemRequirements || undefined,
          currentVersion: currentVersion || undefined,
          releaseDate: releaseDateMs,
          msrp: msrpCents,
          currentPrice: currentPriceCents,
          currency,
          isFree,
          hasDemo,
          hasTrial,
          trialDays: trialDays ? parseInt(trialDays) : undefined,
          imageUrl: undefined,
          videoUrl: videoUrl || undefined,
          audioDemo: audioDemo || undefined,
          productUrl: productUrl.trim(),
          manualUrl: manualUrl || undefined,
        });
      } else if (initialData?._id) {
        await updateMutation({
          sessionToken,
          id: initialData._id,
          name: name.trim(),
          category,
          tags,
          description: description || undefined,
          shortDescription: shortDescription || undefined,
          formats,
          platforms,
          systemRequirements: systemRequirements || undefined,
          currentVersion: currentVersion || undefined,
          releaseDate: releaseDateMs,
          msrp: msrpCents,
          currentPrice: currentPriceCents,
          isFree,
          hasDemo,
          hasTrial,
          trialDays: trialDays ? parseInt(trialDays) : undefined,
          imageStorageId: imageStorageId ?? undefined,
          bannerStorageId: bannerStorageId ?? undefined,
          productUrl: productUrl.trim() || undefined,
          manualUrl: manualUrl || undefined,
          isActive,
          isDiscontinued,
          worksWellOn: worksWellOn.length > 0 ? worksWellOn : undefined,
          useCases: useCases.length > 0 ? useCases : undefined,
          genreSuitability: genreSuitability.length > 0 ? genreSuitability : undefined,
          sonicCharacter: sonicCharacter.length > 0 ? sonicCharacter : undefined,
          comparableTo: comparableTo.length > 0 ? comparableTo : undefined,
          skillLevel: skillLevel || undefined,
          learningCurve: learningCurve || undefined,
          cpuUsage: cpuUsage || undefined,
          licenseType: licenseType || undefined,
          keyFeatures: keyFeatures.length > 0 ? keyFeatures : undefined,
          recommendedDaws: recommendedDaws.length > 0 ? recommendedDaws : undefined,
          isIndustryStandard,
          effectType: effectType || undefined,
          circuitEmulation: circuitEmulation || undefined,
          tonalCharacter: tonalCharacter.length > 0 ? tonalCharacter : undefined,
        });
      }
      router.push("/admin/plugins");
    } catch (err: any) {
      setError(err.message || "Failed to save plugin.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Link
        href="/admin/plugins"
        className="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-stone-200 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Plugins
      </Link>

      <h1
        className="text-2xl font-bold text-stone-100 mb-8"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {mode === "create" ? "Add Plugin" : `Edit ${initialData?.name ?? "Plugin"}`}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl">
        {/* 1. Core Info */}
        <FormSection title="Core Info" defaultOpen>
          <div>
            <label className="block text-sm text-stone-400 mb-2">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
              placeholder="e.g. Pro-Q 4"
            />
          </div>

          <SlugInput
            name={name}
            value={slug}
            onChange={handleSlugChange}
            disabled={mode === "edit"}
          />

          {/* Manufacturer search */}
          <div>
            <label className="block text-sm text-stone-400 mb-2">
              Manufacturer <span className="text-red-400">*</span>
            </label>
            {selectedMfg ? (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                <span className="text-stone-100 flex-1">{selectedMfg.name}</span>
                <button
                  type="button"
                  onClick={() => setManufacturerId(null)}
                  className="text-xs text-stone-400 hover:text-stone-200 transition-colors"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <MagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                <input
                  type="text"
                  value={mfgSearch}
                  onChange={(e) => setMfgSearch(e.target.value)}
                  placeholder="Search manufacturers..."
                  className="w-full pl-11 pr-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
                />
                {mfgResults && mfgResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-stone-900 border border-white/[0.08] rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto">
                    {mfgResults.map((m) => (
                      <button
                        key={m._id}
                        type="button"
                        onClick={() => {
                          setManufacturerId(m._id);
                          setMfgSearch("");
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-stone-300 hover:bg-white/[0.06] hover:text-stone-100 transition-colors"
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm text-stone-400 mb-2">
              Category <span className="text-red-400">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 focus:outline-none focus:border-[#deff0a]/50 transition"
            >
              <option value="">Select category...</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-stone-400 mb-2">Subcategory</label>
            <input
              type="text"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
              placeholder="e.g. parametric"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm text-stone-400 mb-2">Tags</label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/[0.06] rounded-lg text-xs text-stone-300"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((tag) => tag !== t))}
                    className="text-stone-500 hover:text-stone-200 ml-0.5"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                className="flex-1 px-4 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition text-sm"
                placeholder="Add tag and press Enter"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-stone-400 mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition resize-none"
              placeholder="Full description..."
            />
          </div>

          <div>
            <label className="block text-sm text-stone-400 mb-2">Short Description</label>
            <input
              type="text"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
              placeholder="One-line summary"
            />
          </div>
        </FormSection>

        {/* 2. Technical */}
        <FormSection title="Technical" defaultOpen={hasTechnical}>
          <MultiCheckbox label="Formats" options={FORMAT_OPTIONS} value={formats} onChange={setFormats} />
          <MultiCheckbox label="Platforms" options={PLATFORM_OPTIONS} value={platforms} onChange={setPlatforms} />

          <div>
            <label className="block text-sm text-stone-400 mb-2">System Requirements</label>
            <input
              type="text"
              value={systemRequirements}
              onChange={(e) => setSystemRequirements(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
              placeholder="e.g. macOS 10.15+, Windows 10+"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-stone-400 mb-2">Current Version</label>
              <input
                type="text"
                value={currentVersion}
                onChange={(e) => setCurrentVersion(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
                placeholder="e.g. 4.0.1"
              />
            </div>
            <div>
              <label className="block text-sm text-stone-400 mb-2">Release Date</label>
              <input
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 focus:outline-none focus:border-[#deff0a]/50 transition"
              />
            </div>
          </div>
        </FormSection>

        {/* 3. Pricing */}
        <FormSection title="Pricing" defaultOpen={hasPricing}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-stone-400 mb-2">MSRP ($)</label>
              <input
                type="number"
                step="0.01"
                value={msrpDollars}
                onChange={(e) => setMsrpDollars(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
                placeholder="149.00"
              />
            </div>
            <div>
              <label className="block text-sm text-stone-400 mb-2">Current Price ($)</label>
              <input
                type="number"
                step="0.01"
                value={currentPriceDollars}
                onChange={(e) => setCurrentPriceDollars(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
                placeholder="129.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-stone-400 mb-2">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 focus:outline-none focus:border-[#deff0a]/50 transition"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isFree}
                onChange={(e) => setIsFree(e.target.checked)}
                className="rounded border-white/[0.2] bg-white/[0.05]"
              />
              Free
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
              <input
                type="checkbox"
                checked={hasDemo}
                onChange={(e) => setHasDemo(e.target.checked)}
                className="rounded border-white/[0.2] bg-white/[0.05]"
              />
              Has Demo
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
              <input
                type="checkbox"
                checked={hasTrial}
                onChange={(e) => setHasTrial(e.target.checked)}
                className="rounded border-white/[0.2] bg-white/[0.05]"
              />
              Has Trial
            </label>
          </div>

          {hasTrial && (
            <div>
              <label className="block text-sm text-stone-400 mb-2">Trial Days</label>
              <input
                type="number"
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
                placeholder="30"
              />
            </div>
          )}
        </FormSection>

        {/* 4. Media */}
        <FormSection title="Media" defaultOpen={hasMedia}>
          <ImageUpload
            label="Plugin Image"
            storageId={imageStorageId}
            onStorageIdChange={setImageStorageId}
          />
          <ImageUpload
            label="Banner Image"
            storageId={bannerStorageId}
            onStorageIdChange={setBannerStorageId}
          />
          <div>
            <label className="block text-sm text-stone-400 mb-2">Video URL</label>
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
              placeholder="https://youtube.com/watch?v=..."
            />
          </div>
          <div>
            <label className="block text-sm text-stone-400 mb-2">Audio Demo URL</label>
            <input
              type="url"
              value={audioDemo}
              onChange={(e) => setAudioDemo(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
              placeholder="https://..."
            />
          </div>
        </FormSection>

        {/* 5. Links */}
        <FormSection title="Links" defaultOpen={hasLinks}>
          <div>
            <label className="block text-sm text-stone-400 mb-2">
              Product URL <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
              placeholder="https://www.fabfilter.com/products/pro-q-4"
            />
          </div>
          <div>
            <label className="block text-sm text-stone-400 mb-2">Manual URL</label>
            <input
              type="url"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
              placeholder="https://..."
            />
          </div>
        </FormSection>

        {/* 6. Status */}
        <FormSection title="Status" defaultOpen={hasStatus}>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-white/[0.2] bg-white/[0.05]"
              />
              Active (still being sold)
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isDiscontinued}
                onChange={(e) => setIsDiscontinued(e.target.checked)}
                className="rounded border-white/[0.2] bg-white/[0.05]"
              />
              Discontinued
            </label>
          </div>
        </FormSection>

        {/* 7. Enrichment */}
        <FormSection title="Enrichment (AI Data)" defaultOpen={hasEnrichment}>
          {enrichmentOptions ? (
            <>
              <MultiCheckbox
                label="Works Well On"
                options={enrichmentOptions.worksWellOn}
                value={worksWellOn}
                onChange={setWorksWellOn}
              />
              <MultiCheckbox
                label="Use Cases"
                options={enrichmentOptions.useCases}
                value={useCases}
                onChange={setUseCases}
              />
              <MultiCheckbox
                label="Genre Suitability"
                options={enrichmentOptions.genreSuitability}
                value={genreSuitability}
                onChange={setGenreSuitability}
              />
              <MultiCheckbox
                label="Sonic Character"
                options={enrichmentOptions.sonicCharacter}
                value={sonicCharacter}
                onChange={setSonicCharacter}
              />
              <MultiCheckbox
                label="Comparable To"
                options={enrichmentOptions.comparableTo}
                value={comparableTo}
                onChange={setComparableTo}
              />
              <MultiCheckbox
                label="Key Features"
                options={enrichmentOptions.keyFeatures}
                value={keyFeatures}
                onChange={setKeyFeatures}
              />
              <MultiCheckbox
                label="Recommended DAWs"
                options={enrichmentOptions.recommendedDaws}
                value={recommendedDaws}
                onChange={setRecommendedDaws}
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-stone-400 mb-2">Skill Level</label>
                  <select
                    value={skillLevel}
                    onChange={(e) => setSkillLevel(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 focus:outline-none focus:border-[#deff0a]/50 transition"
                  >
                    <option value="">Not set</option>
                    {enrichmentOptions.skillLevel.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-stone-400 mb-2">Learning Curve</label>
                  <select
                    value={learningCurve}
                    onChange={(e) => setLearningCurve(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 focus:outline-none focus:border-[#deff0a]/50 transition"
                  >
                    <option value="">Not set</option>
                    {enrichmentOptions.learningCurve.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-stone-400 mb-2">CPU Usage</label>
                  <select
                    value={cpuUsage}
                    onChange={(e) => setCpuUsage(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 focus:outline-none focus:border-[#deff0a]/50 transition"
                  >
                    <option value="">Not set</option>
                    {enrichmentOptions.cpuUsage.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-stone-400 mb-2">License Type</label>
                  <select
                    value={licenseType}
                    onChange={(e) => setLicenseType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 focus:outline-none focus:border-[#deff0a]/50 transition"
                  >
                    <option value="">Not set</option>
                    {enrichmentOptions.licenseType.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-stone-400 mb-2">Effect Type</label>
                  <input
                    type="text"
                    value={effectType}
                    onChange={(e) => setEffectType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
                    placeholder="e.g. parametric, VCA, optical"
                  />
                </div>
                <div>
                  <label className="block text-sm text-stone-400 mb-2">Circuit Emulation</label>
                  <input
                    type="text"
                    value={circuitEmulation}
                    onChange={(e) => setCircuitEmulation(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:border-[#deff0a]/50 transition"
                    placeholder="e.g. SSL G-Bus, 1176"
                  />
                </div>
              </div>

              <MultiCheckbox
                label="Tonal Character"
                options={enrichmentOptions.sonicCharacter}
                value={tonalCharacter}
                onChange={setTonalCharacter}
              />

              <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isIndustryStandard}
                  onChange={(e) => setIsIndustryStandard(e.target.checked)}
                  className="rounded border-white/[0.2] bg-white/[0.05]"
                />
                Industry Standard
              </label>
            </>
          ) : (
            <div className="animate-pulse text-stone-500 text-sm">
              Loading enrichment options...
            </div>
          )}
        </FormSection>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-[#deff0a] hover:bg-[#ccff00] text-stone-900 font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : mode === "create"
                ? "Create Plugin"
                : "Save Changes"}
          </button>
          <Link
            href="/admin/plugins"
            className="px-6 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-stone-300 rounded-xl border border-white/[0.06] transition"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
