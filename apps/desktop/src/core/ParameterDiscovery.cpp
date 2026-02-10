#include "ParameterDiscovery.h"

// ============================================
// Helper: Parse float from text string
// ============================================
float ParameterDiscovery::parseFloatFromText(const juce::String& text)
{
    juce::String numStr;
    bool hasDecimal = false;
    bool hasDigit = false;

    for (int i = 0; i < text.length(); ++i)
    {
        auto c = text[i];
        if (c == '-' && numStr.isEmpty())
            numStr += c;
        else if (c == '.' && !hasDecimal)
        {
            numStr += c;
            hasDecimal = true;
        }
        else if (c >= '0' && c <= '9')
        {
            numStr += c;
            hasDigit = true;
        }
        else if (hasDigit)
            break;
    }

    return hasDigit ? numStr.getFloatValue() : 0.0f;
}

// ============================================
// Helper: Check if input matches regex pattern (case-insensitive)
// ============================================
bool ParameterDiscovery::matchesPattern(const juce::String& input, const std::string& pattern)
{
    try
    {
        std::regex re(pattern, std::regex_constants::icase);
        return std::regex_search(input.toStdString(), re);
    }
    catch (...)
    {
        return false;
    }
}

// ============================================
// Extract physical range from JUCE parameter
// ============================================
void ParameterDiscovery::extractPhysicalRange(juce::AudioProcessorParameter* param,
                                               float& outMin, float& outMax,
                                               juce::String& textAtMin, juce::String& textAtMax)
{
    // Try to get the text representation at normalized 0.0 and 1.0
    textAtMin = param->getText(0.0f, 64);
    textAtMax = param->getText(1.0f, 64);

    outMin = parseFloatFromText(textAtMin);
    outMax = parseFloatFromText(textAtMax);

    // Sanity check: if min >= max, fall back to 0-1
    if (outMin >= outMax)
    {
        outMin = 0.0f;
        outMax = 1.0f;
    }
}

// ============================================
// Extract band number from parameter name
// ============================================
int ParameterDiscovery::extractBandNumber(const juce::String& name)
{
    try
    {
        // Try patterns: "Band 3", "Band3", "B3", "3", "#3"
        std::regex bandRegex(R"((?:band|b)\s*(\d+))", std::regex_constants::icase);
        std::smatch match;
        auto nameStr = name.toStdString();

        if (std::regex_search(nameStr, match, bandRegex) && match.size() > 1)
            return std::stoi(match[1].str());

        // Try bare number at end: "LF 1", "HF 2"
        std::regex trailingNum(R"(\s+(\d+)\s*$)");
        if (std::regex_search(nameStr, match, trailingNum) && match.size() > 1)
            return std::stoi(match[1].str());

        // Try specific band names
        if (matchesPattern(name, R"(\b(low|lf|sub)\b)")) return 1;
        if (matchesPattern(name, R"(\b(low.?mid|lmf)\b)")) return 2;
        if (matchesPattern(name, R"(\b(mid|mf)\b)")) return 3;
        if (matchesPattern(name, R"(\b(high.?mid|hmf)\b)")) return 4;
        if (matchesPattern(name, R"(\b(high|hf|air)\b)")) return 5;
    }
    catch (...)
    {
    }

    return -1;
}

// ============================================
// Semantic parameter name matcher
// ============================================
ParameterDiscovery::SemanticMatch ParameterDiscovery::matchParameterName(const juce::String& name)
{
    SemanticMatch result;
    auto nameLower = name.toLowerCase();

    // Skip bypass parameters
    if (matchesPattern(name, R"(\bbypass\b)"))
        return result; // Empty semantic = skip

    int bandNumber = extractBandNumber(name);

    // ==========================================
    // EQ Patterns
    // ==========================================
    if (matchesPattern(name, R"(\b(freq|frequency)\b)"))
    {
        result.unit = "hz";
        result.curve = "logarithmic";
        if (bandNumber > 0)
            result.semantic = "eq_band_" + juce::String(bandNumber) + "_freq";
        else
            result.semantic = "eq_band_1_freq";
        result.bandNumber = bandNumber > 0 ? bandNumber : 1;
        return result;
    }

    if (matchesPattern(name, R"(\b(gain|boost|cut)\b)") &&
        !matchesPattern(name, R"(\b(input|output|makeup|make.?up|volume|level|drive)\b)"))
    {
        result.unit = "db";
        result.curve = "linear";
        if (bandNumber > 0)
            result.semantic = "eq_band_" + juce::String(bandNumber) + "_gain";
        else
            result.semantic = "eq_band_1_gain";
        result.bandNumber = bandNumber > 0 ? bandNumber : 1;
        return result;
    }

    if (matchesPattern(name, R"(\b(q|bandwidth|width|resonance)\b)") &&
        !matchesPattern(name, R"(\b(freq|frequency|equal)\b)"))
    {
        result.unit = "ratio";
        result.curve = "logarithmic";
        if (bandNumber > 0)
            result.semantic = "eq_band_" + juce::String(bandNumber) + "_q";
        else
            result.semantic = "eq_band_1_q";
        result.bandNumber = bandNumber > 0 ? bandNumber : 1;
        return result;
    }

    if (matchesPattern(name, R"(\b(type|shape|mode|filter)\b)") &&
        !matchesPattern(name, R"(\b(freq|frequency|gain|comp|attack|release|ratio|thresh)\b)"))
    {
        result.unit = "stepped";
        result.curve = "stepped";
        if (bandNumber > 0)
            result.semantic = "eq_band_" + juce::String(bandNumber) + "_type";
        else
            result.semantic = "eq_band_1_type";
        result.bandNumber = bandNumber > 0 ? bandNumber : 1;
        return result;
    }

    // ==========================================
    // Compressor Patterns
    // ==========================================
    if (matchesPattern(name, R"(\b(thresh|threshold)\b)"))
    {
        result.semantic = "comp_threshold";
        result.unit = "db";
        result.curve = "linear";
        return result;
    }

    if (matchesPattern(name, R"(\bratio\b)"))
    {
        result.semantic = "comp_ratio";
        result.unit = "ratio";
        result.curve = "logarithmic";
        return result;
    }

    if (matchesPattern(name, R"(\battack\b)"))
    {
        result.semantic = "comp_attack";
        result.unit = "ms";
        result.curve = "logarithmic";
        return result;
    }

    if (matchesPattern(name, R"(\brelease\b)"))
    {
        result.semantic = "comp_release";
        result.unit = "ms";
        result.curve = "logarithmic";
        return result;
    }

    if (matchesPattern(name, R"(\bknee\b)"))
    {
        result.semantic = "comp_knee";
        result.unit = "db";
        result.curve = "linear";
        return result;
    }

    if (matchesPattern(name, R"(\b(makeup|make.?up)\b)"))
    {
        result.semantic = "comp_makeup";
        result.unit = "db";
        result.curve = "linear";
        return result;
    }

    // Compressor mix (dry/wet, parallel, blend) — check before general mix
    if (matchesPattern(name, R"(\b(mix|dry.?wet|blend|parallel)\b)") &&
        matchesPattern(name, R"(\b(comp|dyn|limit)\b)"))
    {
        result.semantic = "comp_mix";
        result.unit = "percent";
        result.curve = "linear";
        return result;
    }

    // ==========================================
    // General Patterns
    // ==========================================
    if (matchesPattern(name, R"(\b(input|drive)\b)") &&
        !matchesPattern(name, R"(\b(freq|frequency|type|mode)\b)"))
    {
        result.semantic = "input_gain";
        result.unit = "db";
        result.curve = "linear";
        return result;
    }

    if (matchesPattern(name, R"(\b(output|volume|level)\b)") &&
        !matchesPattern(name, R"(\b(freq|frequency|type|mode|meter)\b)"))
    {
        result.semantic = "output_gain";
        result.unit = "db";
        result.curve = "linear";
        return result;
    }

    if (matchesPattern(name, R"(\b(mix|dry.?wet)\b)"))
    {
        result.semantic = "dry_wet_mix";
        result.unit = "percent";
        result.curve = "linear";
        return result;
    }

    // No match — return empty (will be marked as "unknown")
    return result;
}

// ============================================
// Infer physical unit from JUCE label and range
// ============================================
juce::String ParameterDiscovery::inferPhysicalUnit(const juce::String& label,
                                                    float minVal, float maxVal,
                                                    const juce::String& textAtMin,
                                                    const juce::String& textAtMax)
{
    auto labelLower = label.toLowerCase();
    auto textMinLower = textAtMin.toLowerCase();
    auto textMaxLower = textAtMax.toLowerCase();

    // Check JUCE label first
    if (labelLower.contains("hz") || labelLower.contains("hertz"))
        return "hz";
    if (labelLower.contains("db") || labelLower.contains("decibel"))
        return "db";
    if (labelLower.contains("ms") || labelLower.contains("millisec"))
        return "ms";
    if (labelLower.contains("s") && !labelLower.contains("step"))
        return "ms"; // Could be seconds
    if (labelLower.contains("%") || labelLower.contains("percent"))
        return "percent";

    // Check text values
    if (textMinLower.contains("hz") || textMaxLower.contains("hz"))
        return "hz";
    if (textMinLower.contains("db") || textMaxLower.contains("db"))
        return "db";
    if (textMinLower.contains("ms") || textMaxLower.contains("ms"))
        return "ms";

    // Infer from range
    if (minVal >= 20.0f && maxVal >= 5000.0f)
        return "hz";
    if (minVal < 0.0f && maxVal <= 30.0f && minVal >= -100.0f)
        return "db";
    if (minVal >= 0.0f && maxVal <= 1.0f)
        return "percent";
    if (minVal >= 0.0f && maxVal <= 100.0f)
        return "percent";

    return "unknown";
}

// ============================================
// Infer mapping curve from range and metadata
// ============================================
juce::String ParameterDiscovery::inferMappingCurve(float minVal, float maxVal, int numSteps,
                                                    const juce::String& label,
                                                    const juce::String& textAtMin,
                                                    const juce::String& textAtMax)
{
    // Stepped: discrete parameters with small number of steps
    if (numSteps > 0 && numSteps <= 20)
        return "stepped";

    auto unit = inferPhysicalUnit(label, minVal, maxVal, textAtMin, textAtMax);

    // Frequency ranges → logarithmic
    if (unit == "hz" || (minVal >= 20.0f && maxVal >= 5000.0f))
        return "logarithmic";

    // Time ranges (attack, release) → logarithmic
    if (unit == "ms" && maxVal > 10.0f * minVal && minVal > 0.0f)
        return "logarithmic";

    // Ratio → logarithmic
    if (minVal >= 1.0f && maxVal >= 10.0f && maxVal <= 100.0f)
        return "logarithmic";

    // dB, percent → linear
    return "linear";
}

// ============================================
// Infer plugin category from matched parameters
// ============================================
juce::String ParameterDiscovery::inferCategory(const juce::Array<DiscoveredParameter>& params)
{
    int eqCount = 0;
    int compCount = 0;

    for (const auto& p : params)
    {
        if (p.semantic.startsWith("eq_band_"))
            eqCount++;
        else if (p.semantic.startsWith("comp_"))
            compCount++;
    }

    if (eqCount > compCount && eqCount >= 3)
        return "eq";
    if (compCount > eqCount && compCount >= 2)
        return "compressor";

    // Fallback: if we have any EQ or comp params
    if (eqCount > 0)
        return "eq";
    if (compCount > 0)
        return "compressor";

    return "general";
}

// ============================================
// Calculate confidence score
// ============================================
int ParameterDiscovery::calculateConfidence(const DiscoveredMap& map)
{
    if (map.totalCount == 0)
        return 0;

    float matchRatio = static_cast<float>(map.matchedCount) / static_cast<float>(map.totalCount);

    // Base score from match ratio (0-70)
    float score = matchRatio * 70.0f;

    // Bonus for having confirmed units (parameters where JUCE label matches our inferred unit)
    int confirmedUnits = 0;
    for (const auto& p : map.parameters)
    {
        if (p.matched && !p.label.isEmpty() && p.physicalUnit != "unknown")
            confirmedUnits++;
    }

    float unitConfirmationRatio = map.matchedCount > 0
        ? static_cast<float>(confirmedUnits) / static_cast<float>(map.matchedCount)
        : 0.0f;
    score += unitConfirmationRatio * 20.0f;

    // Bonus for category-specific completeness
    if (map.category == "eq" && map.eqBandCount > 0)
        score += 5.0f;
    if (map.category == "compressor")
    {
        // Check for essential compressor params
        bool hasThreshold = false, hasRatio = false, hasAttack = false, hasRelease = false;
        for (const auto& p : map.parameters)
        {
            if (p.semantic == "comp_threshold") hasThreshold = true;
            if (p.semantic == "comp_ratio") hasRatio = true;
            if (p.semantic == "comp_attack") hasAttack = true;
            if (p.semantic == "comp_release") hasRelease = true;
        }
        if (hasThreshold && hasRatio && hasAttack && hasRelease)
            score += 10.0f;
    }

    return juce::jlimit(0, 100, static_cast<int>(score));
}

// ============================================
// Main discovery function
// ============================================
ParameterDiscovery::DiscoveredMap ParameterDiscovery::discoverParameterMap(
    juce::AudioProcessor* processor,
    const juce::String& pluginName,
    const juce::String& manufacturer)
{
    DiscoveredMap map;
    map.pluginName = pluginName.isNotEmpty() ? pluginName : processor->getName();
    map.manufacturer = manufacturer;

    auto& params = processor->getParameters();
    map.totalCount = params.size();

    int maxBandNumber = 0;

    for (int i = 0; i < params.size(); ++i)
    {
        auto* param = params[i];
        DiscoveredParameter discovered;

        discovered.juceParamId = param->getName(256);
        discovered.juceParamIndex = i;
        discovered.label = param->getLabel();
        discovered.numSteps = param->getNumSteps();
        discovered.defaultValue = param->getDefaultValue();

        // Extract physical range
        juce::String textAtMin, textAtMax;
        extractPhysicalRange(param, discovered.minValue, discovered.maxValue,
                             textAtMin, textAtMax);

        // Extract NormalisableRange from RangedAudioParameter
        if (auto* rangedParam = dynamic_cast<juce::RangedAudioParameter*>(param))
        {
            const auto& range = rangedParam->getNormalisableRange();
            discovered.rangeStart = range.start;
            discovered.rangeEnd = range.end;
            discovered.skewFactor = range.skew;
            discovered.symmetricSkew = range.symmetricSkew;
            discovered.interval = range.interval;
            discovered.hasNormalisableRange = true;

            // Override min/max with actual NormalisableRange values (more reliable than getText parsing)
            discovered.minValue = range.start;
            discovered.maxValue = range.end;

            // Sample getText at 5 points to capture the mapping curve
            const float samplePoints[] = { 0.0f, 0.25f, 0.5f, 0.75f, 1.0f };
            for (float norm : samplePoints)
            {
                auto text = param->getText(norm, 64);
                float physical = parseFloatFromText(text);
                discovered.curveSamples.add({ norm, physical });
            }

        }

        // Semantic matching
        auto match = matchParameterName(discovered.juceParamId);

        if (match.semantic.isNotEmpty())
        {
            discovered.semantic = match.semantic;
            discovered.physicalUnit = match.unit;
            discovered.mappingCurve = match.curve;
            discovered.matched = true;
            map.matchedCount++;

            // Track max band number for EQ
            if (match.bandNumber > maxBandNumber)
                maxBandNumber = match.bandNumber;

            // Detect compressor features
            if (match.semantic == "comp_mix" || match.semantic == "dry_wet_mix")
                map.compHasParallelMix = true;
        }
        else
        {
            // Unmatched — still store with "unknown" semantic
            discovered.semantic = "unknown";
            discovered.matched = false;

            // Still infer unit and curve from ranges
            discovered.physicalUnit = inferPhysicalUnit(discovered.label,
                                                         discovered.minValue, discovered.maxValue,
                                                         textAtMin, textAtMax);
            discovered.mappingCurve = inferMappingCurve(discovered.minValue, discovered.maxValue,
                                                         discovered.numSteps, discovered.label,
                                                         textAtMin, textAtMax);
        }

        // Override curve/unit if we got better info from range inference
        if (discovered.matched)
        {
            auto inferredUnit = inferPhysicalUnit(discovered.label,
                                                   discovered.minValue, discovered.maxValue,
                                                   textAtMin, textAtMax);
            // If JUCE confirms our guess, keep it. If JUCE disagrees, trust JUCE for unit.
            if (inferredUnit != "unknown" && inferredUnit != discovered.physicalUnit)
            {
                // JUCE label/range suggests a different unit — update if it seems more specific
                if (discovered.physicalUnit == "unknown")
                    discovered.physicalUnit = inferredUnit;
            }
        }

        // Detect Q representation (after semantic matching assigns the semantic)
        if (discovered.hasNormalisableRange && discovered.semantic.contains("_q"))
        {
            if (discovered.rangeEnd > 5.0f)
                discovered.qRepresentation = "q_factor";
            else
                discovered.qRepresentation = "bandwidth_octaves";
        }

        map.parameters.add(discovered);
    }

    map.eqBandCount = maxBandNumber;

    // Infer category
    map.category = inferCategory(map.parameters);

    // Calculate confidence
    map.confidence = calculateConfidence(map);

    return map;
}

// ============================================
// Convert to JSON
// ============================================
juce::var ParameterDiscovery::toJson(const DiscoveredMap& map)
{
    auto* root = new juce::DynamicObject();

    root->setProperty("pluginName", map.pluginName);
    root->setProperty("manufacturer", map.manufacturer);
    root->setProperty("category", map.category);
    root->setProperty("confidence", map.confidence);
    root->setProperty("matchedCount", map.matchedCount);
    root->setProperty("totalCount", map.totalCount);
    root->setProperty("eqBandCount", map.eqBandCount);
    root->setProperty("eqBandParameterPattern", map.eqBandParameterPattern);
    root->setProperty("compHasParallelMix", map.compHasParallelMix);
    root->setProperty("compHasAutoMakeup", map.compHasAutoMakeup);
    root->setProperty("compHasLookahead", map.compHasLookahead);
    root->setProperty("source", "juce-scanned");

    juce::Array<juce::var> paramArray;

    for (const auto& p : map.parameters)
    {
        auto* paramObj = new juce::DynamicObject();
        paramObj->setProperty("juceParamId", p.juceParamId);
        paramObj->setProperty("juceParamIndex", p.juceParamIndex);
        paramObj->setProperty("semantic", p.semantic);
        paramObj->setProperty("physicalUnit", p.physicalUnit);
        paramObj->setProperty("mappingCurve", p.mappingCurve);
        paramObj->setProperty("minValue", p.minValue);
        paramObj->setProperty("maxValue", p.maxValue);
        paramObj->setProperty("defaultValue", p.defaultValue);
        paramObj->setProperty("numSteps", p.numSteps);
        paramObj->setProperty("label", p.label);
        paramObj->setProperty("matched", p.matched);

        // NormalisableRange fields
        paramObj->setProperty("hasNormalisableRange", p.hasNormalisableRange);
        if (p.hasNormalisableRange)
        {
            paramObj->setProperty("rangeStart", p.rangeStart);
            paramObj->setProperty("rangeEnd", p.rangeEnd);
            paramObj->setProperty("skewFactor", p.skewFactor);
            paramObj->setProperty("symmetricSkew", p.symmetricSkew);
            paramObj->setProperty("interval", p.interval);

            // Curve samples
            juce::Array<juce::var> samplesArray;
            for (const auto& sample : p.curveSamples)
            {
                auto* sampleObj = new juce::DynamicObject();
                sampleObj->setProperty("normalized", sample.first);
                sampleObj->setProperty("physical", sample.second);
                samplesArray.add(juce::var(sampleObj));
            }
            paramObj->setProperty("curveSamples", samplesArray);

            if (p.qRepresentation.isNotEmpty())
                paramObj->setProperty("qRepresentation", p.qRepresentation);
        }

        paramArray.add(juce::var(paramObj));
    }

    root->setProperty("parameters", paramArray);

    return juce::var(root);
}
