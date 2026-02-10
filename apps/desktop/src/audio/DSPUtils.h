#pragma once

#include <cmath>

/**
 * DSPUtils - Pure math utility functions for audio DSP.
 *
 * Extracted from BranchGainProcessor, GainProcessor, etc. for testability.
 * All functions are constexpr-friendly or inline, no JUCE dependency.
 */
namespace DSPUtils
{

/** Convert decibels to linear gain. Values at or below -60 dB floor to 0.0. */
inline float dbToLinear(float dB)
{
    if (dB <= -60.0f)
        return 0.0f;
    return std::pow(10.0f, dB / 20.0f);
}

/** Convert linear gain to decibels. Values at or below 0 return -100 dB. */
inline float linearToDb(float linear)
{
    if (linear <= 0.0f)
        return -100.0f;
    return 20.0f * std::log10(linear);
}

/** Clamp a dB value to the allowed range [-60, +24]. */
inline float clampGainDb(float dB)
{
    if (dB < -60.0f) return -60.0f;
    if (dB > 24.0f) return 24.0f;
    return dB;
}

/** Dry/wet crossfade: mix=0 returns dry, mix=1 returns wet. */
inline float crossfade(float dry, float wet, float mix)
{
    return dry * (1.0f - mix) + wet * mix;
}

} // namespace DSPUtils
