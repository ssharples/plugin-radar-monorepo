#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_core/juce_core.h>
#include <regex>

/**
 * ParameterDiscovery — Auto-discovers and semantically classifies plugin parameters.
 *
 * When a plugin is loaded, this class enumerates all its JUCE parameters,
 * pattern-matches their names to semantic IDs (eq_band_N_freq, comp_threshold, etc.),
 * infers mapping curves from ranges, and produces a complete parameter map
 * suitable for upload to Convex.
 */
class ParameterDiscovery
{
public:
    // ============================================
    // Result types
    // ============================================

    struct DiscoveredParameter
    {
        juce::String juceParamId;       // Parameter name from JUCE
        int juceParamIndex = -1;        // Index in AudioProcessor::getParameters()
        juce::String semantic;           // Semantic ID: "eq_band_1_freq", "comp_threshold", "unknown"
        juce::String physicalUnit;       // "hz", "db", "ms", "ratio", "percent", "boolean", "unknown"
        juce::String mappingCurve;       // "linear", "logarithmic", "exponential", "stepped"
        float minValue = 0.0f;          // Physical min
        float maxValue = 1.0f;          // Physical max
        float defaultValue = 0.0f;      // Physical default
        int numSteps = 0;               // 0 = continuous
        juce::String label;             // Unit label from JUCE (e.g., "Hz", "dB")
        bool matched = false;           // Whether semantic matching succeeded
    };

    struct DiscoveredMap
    {
        juce::String pluginName;
        juce::String manufacturer;
        juce::String category;           // "eq", "compressor", "general"
        juce::Array<DiscoveredParameter> parameters;
        int eqBandCount = 0;
        juce::String eqBandParameterPattern;
        bool compHasParallelMix = false;
        bool compHasAutoMakeup = false;
        bool compHasLookahead = false;
        int confidence = 0;              // 0-100
        int matchedCount = 0;
        int totalCount = 0;
    };

    // ============================================
    // Public API
    // ============================================

    /**
     * Discover and classify all parameters from a plugin instance.
     * Returns a complete parameter map ready for JSON serialization or Convex upload.
     */
    static DiscoveredMap discoverParameterMap(juce::AudioProcessor* processor,
                                              const juce::String& pluginName = {},
                                              const juce::String& manufacturer = {});

    /**
     * Convert a DiscoveredMap to a juce::var (JSON-compatible) for WebView bridge.
     */
    static juce::var toJson(const DiscoveredMap& map);

private:
    // ============================================
    // Semantic matching
    // ============================================

    struct SemanticMatch
    {
        juce::String semantic;
        juce::String unit;
        juce::String curve;
        int bandNumber = -1; // For EQ band parameters
    };

    /** Pattern-match a parameter name against known semantic patterns. */
    static SemanticMatch matchParameterName(const juce::String& name);

    /** Extract a band number from a parameter name (e.g., "Band 3 Freq" → 3). */
    static int extractBandNumber(const juce::String& name);

    /** Infer the mapping curve from parameter range and JUCE metadata. */
    static juce::String inferMappingCurve(float minVal, float maxVal, int numSteps,
                                           const juce::String& label, const juce::String& textAtMin,
                                           const juce::String& textAtMax);

    /** Infer the physical unit from JUCE label and range. */
    static juce::String inferPhysicalUnit(const juce::String& label, float minVal, float maxVal,
                                           const juce::String& textAtMin, const juce::String& textAtMax);

    /** Infer the plugin category from the set of matched semantics. */
    static juce::String inferCategory(const juce::Array<DiscoveredParameter>& params);

    /** Calculate confidence score based on match quality. */
    static int calculateConfidence(const DiscoveredMap& map);

    /** Check if a string matches a regex pattern (case-insensitive). */
    static bool matchesPattern(const juce::String& input, const std::string& pattern);

    /** Extract physical range from JUCE parameter (getText at 0.0 and 1.0). */
    static void extractPhysicalRange(juce::AudioProcessorParameter* param,
                                      float& outMin, float& outMax,
                                      juce::String& textAtMin, juce::String& textAtMax);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ParameterDiscovery)
};
