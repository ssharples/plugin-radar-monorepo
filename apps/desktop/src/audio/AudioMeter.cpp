#include "AudioMeter.h"
#include "FastMath.h"  // PHASE 4: Fast dB to linear conversion
#include <cmath>

AudioMeter::AudioMeter()
{
    updateKWeightingCoeffs();
}

void AudioMeter::prepareToPlay(double newSampleRate, int newSamplesPerBlock)
{
    sampleRate = newSampleRate;
    samplesPerBlock = newSamplesPerBlock;

    // RMS coefficient for ~300ms integration time
    float rmsTimeConstant = 0.3f;
    rmsCoeff = 1.0f - std::exp(-1.0f / (static_cast<float>(sampleRate) * rmsTimeConstant));

    // LUFS buffer for 3s short-term window (per ITU-R BS.1770-4)
    lufsBufferSize = static_cast<int>(sampleRate * LufsWindowMs / 1000.0);
    lufsBufferL.resize(static_cast<size_t>(lufsBufferSize), 0.0f);
    lufsBufferR.resize(static_cast<size_t>(lufsBufferSize), 0.0f);
    lufsWritePos = 0;

    // Peak averaging ring buffer (2.5s window, one entry per processBlock call)
    // Number of blocks = (sampleRate * windowMs / 1000) / samplesPerBlock
    peakAvgBufferSize = std::max(1, static_cast<int>((sampleRate * PeakAvgWindowMs / 1000.0) / newSamplesPerBlock));
    peakAvgBufferL.resize(static_cast<size_t>(peakAvgBufferSize), -100.0f);
    peakAvgBufferR.resize(static_cast<size_t>(peakAvgBufferSize), -100.0f);
    peakAvgWritePos = 0;
    peakAvgSamplesWritten = 0;

    // Pre-allocate scratch buffers for K-weighting (used on audio thread)
    // Over-allocate 2x to handle hosts that occasionally exceed samplesPerBlock
    kWeightScratchSize = newSamplesPerBlock * 2;
    kWeightScratchL.resize(static_cast<size_t>(kWeightScratchSize), 0.0f);
    kWeightScratchR.resize(static_cast<size_t>(kWeightScratchSize), 0.0f);

    // Update K-weighting filter coefficients for new sample rate
    updateKWeightingCoeffs();

    reset();
}

void AudioMeter::reset()
{
    peakL.store(0.0f, std::memory_order_relaxed);
    peakR.store(0.0f, std::memory_order_relaxed);
    peakHoldL.store(0.0f, std::memory_order_relaxed);
    peakHoldR.store(0.0f, std::memory_order_relaxed);
    rmsL.store(0.0f, std::memory_order_relaxed);
    rmsR.store(0.0f, std::memory_order_relaxed);
    lufsShort.store(-100.0f, std::memory_order_relaxed);

    rmsAccumL = 0.0f;
    rmsAccumR = 0.0f;
    peakHoldCounterL = 0.0f;
    peakHoldCounterR = 0.0f;

    std::fill(lufsBufferL.begin(), lufsBufferL.end(), 0.0f);
    std::fill(lufsBufferR.begin(), lufsBufferR.end(), 0.0f);
    lufsWritePos = 0;

    // PHASE 1: Reset running sums for incremental LUFS
    lufsRunningSumL = 0.0f;
    lufsRunningSumR = 0.0f;

    // Reset peak averaging
    std::fill(peakAvgBufferL.begin(), peakAvgBufferL.end(), -100.0f);
    std::fill(peakAvgBufferR.begin(), peakAvgBufferR.end(), -100.0f);
    peakAvgWritePos = 0;
    peakAvgSamplesWritten = 0;
    peakAvgRunningSumL = 0.0f;
    peakAvgRunningSumR = 0.0f;
    avgPeakDbL.store(-100.0f, std::memory_order_relaxed);
    avgPeakDbR.store(-100.0f, std::memory_order_relaxed);

    // Reset filter states
    for (auto& state : kWeightStateL)
        state = BiquadState{};
    for (auto& state : kWeightStateR)
        state = BiquadState{};
}

void AudioMeter::process(const juce::AudioBuffer<float>& buffer)
{
    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();

    if (numChannels == 0 || numSamples == 0)
        return;

    // Get channel pointers
    const float* leftChannel = buffer.getReadPointer(0);
    const float* rightChannel = numChannels > 1 ? buffer.getReadPointer(1) : leftChannel;

    // SIMD peak detection via FloatVectorOperations (replaces scalar per-sample loop)
    auto rangeL = juce::FloatVectorOperations::findMinAndMax(leftChannel, numSamples);
    float blockPeakL = std::max(std::abs(rangeL.getStart()), std::abs(rangeL.getEnd()));

    auto rangeR = juce::FloatVectorOperations::findMinAndMax(rightChannel, numSamples);
    float blockPeakR = std::max(std::abs(rangeR.getStart()), std::abs(rangeR.getEnd()));

    // Sum-of-squares for RMS using scratch buffers (pre-allocated in prepareToPlay)
    const int scratchSamples = std::min(numSamples, kWeightScratchSize);
    // Reuse kWeightScratch buffers temporarily for squared values (they get overwritten
    // by K-weighting below anyway, so this is safe)
    juce::FloatVectorOperations::multiply(kWeightScratchL.data(), leftChannel, leftChannel, scratchSamples);
    float sumSquaresL = 0.0f;
    for (int i = 0; i < scratchSamples; ++i)
        sumSquaresL += kWeightScratchL[static_cast<size_t>(i)];

    juce::FloatVectorOperations::multiply(kWeightScratchR.data(), rightChannel, rightChannel, scratchSamples);
    float sumSquaresR = 0.0f;
    for (int i = 0; i < scratchSamples; ++i)
        sumSquaresR += kWeightScratchR[static_cast<size_t>(i)];

    // Update peak with instant attack
    peakL.store(blockPeakL, std::memory_order_relaxed);
    peakR.store(blockPeakR, std::memory_order_relaxed);

    // Update peak hold
    float currentHoldL = peakHoldL.load(std::memory_order_relaxed);
    float currentHoldR = peakHoldR.load(std::memory_order_relaxed);

    if (blockPeakL >= currentHoldL)
    {
        currentHoldL = blockPeakL;
        peakHoldCounterL = peakHoldTimeSeconds * static_cast<float>(sampleRate);
    }
    else
    {
        peakHoldCounterL -= static_cast<float>(numSamples);
        if (peakHoldCounterL <= 0)
        {
            // PHASE 4: Decay peak hold using FastMath lookup (10-20x faster than std::pow)
            float decayDb = peakDecayDbPerSec * (static_cast<float>(numSamples) / static_cast<float>(sampleRate));
            float decayLinear = FastMath::dbToLinear(-decayDb);  // Negative for decay
            currentHoldL *= decayLinear;
            if (currentHoldL < 0.0001f) currentHoldL = 0.0f;
        }
    }

    if (blockPeakR >= currentHoldR)
    {
        currentHoldR = blockPeakR;
        peakHoldCounterR = peakHoldTimeSeconds * static_cast<float>(sampleRate);
    }
    else
    {
        peakHoldCounterR -= static_cast<float>(numSamples);
        if (peakHoldCounterR <= 0)
        {
            // PHASE 4: Decay peak hold using FastMath lookup (10-20x faster than std::pow)
            float decayDb = peakDecayDbPerSec * (static_cast<float>(numSamples) / static_cast<float>(sampleRate));
            float decayLinear = FastMath::dbToLinear(-decayDb);  // Negative for decay
            currentHoldR *= decayLinear;
            if (currentHoldR < 0.0001f) currentHoldR = 0.0f;
        }
    }

    peakHoldL.store(currentHoldL, std::memory_order_relaxed);
    peakHoldR.store(currentHoldR, std::memory_order_relaxed);

    // Update RMS (exponential moving average)
    float blockRmsL = std::sqrt(sumSquaresL / static_cast<float>(numSamples));
    float blockRmsR = std::sqrt(sumSquaresR / static_cast<float>(numSamples));

    rmsAccumL += rmsCoeff * (blockRmsL - rmsAccumL);
    rmsAccumR += rmsCoeff * (blockRmsR - rmsAccumR);

    rmsL.store(rmsAccumL, std::memory_order_relaxed);
    rmsR.store(rmsAccumR, std::memory_order_relaxed);

    // Peak averaging (2.5s ring buffer of per-block peak dB values, O(1) update)
    {
        float blockPeakDbL = (blockPeakL > 1e-10f) ? 20.0f * std::log10(blockPeakL) : -100.0f;
        float blockPeakDbR = (blockPeakR > 1e-10f) ? 20.0f * std::log10(blockPeakR) : -100.0f;

        if (peakAvgBufferSize > 0)
        {
            const size_t writeIdx = static_cast<size_t>(peakAvgWritePos);

            if (peakAvgSamplesWritten >= peakAvgBufferSize)
            {
                // Buffer full — subtract the value we're about to overwrite (O(1))
                peakAvgRunningSumL -= peakAvgBufferL[writeIdx];
                peakAvgRunningSumR -= peakAvgBufferR[writeIdx];
            }
            else
            {
                // Still filling — just count, don't subtract (old slots are uninitialised)
                peakAvgSamplesWritten++;
            }

            // Add new value
            peakAvgRunningSumL += blockPeakDbL;
            peakAvgRunningSumR += blockPeakDbR;

            peakAvgBufferL[writeIdx] = blockPeakDbL;
            peakAvgBufferR[writeIdx] = blockPeakDbR;
            peakAvgWritePos = (peakAvgWritePos + 1) % peakAvgBufferSize;

            // Compute average over filled portion
            float divisor = static_cast<float>(peakAvgSamplesWritten);
            avgPeakDbL.store(peakAvgRunningSumL / divisor, std::memory_order_relaxed);
            avgPeakDbR.store(peakAvgRunningSumR / divisor, std::memory_order_relaxed);
        }
    }

    // PHASE 2: Conditional LUFS calculation (skip if disabled for performance)
    if (lufsEnabled.load(std::memory_order_relaxed))
    {
        // K-weighted LUFS calculation
        // Use pre-allocated scratch buffers (sized in prepareToPlay)
        // If block is larger than expected, clamp to scratch size to stay lock-free
        const int kWeightSamples = std::min(numSamples, kWeightScratchSize);

        processKWeighting(leftChannel, kWeightScratchL.data(), kWeightSamples, 0);
        processKWeighting(rightChannel, kWeightScratchR.data(), kWeightSamples, 1);

        // PHASE 1: Incremental LUFS calculation using running sums (O(1) instead of O(N))
        // Add new K-weighted squared samples to ring buffer and update running sums
        for (int i = 0; i < kWeightSamples; ++i)
        {
            const float newSquaredL = kWeightScratchL[static_cast<size_t>(i)] * kWeightScratchL[static_cast<size_t>(i)];
            const float newSquaredR = kWeightScratchR[static_cast<size_t>(i)] * kWeightScratchR[static_cast<size_t>(i)];

            // Subtract old value being replaced, add new value (O(1) update)
            const size_t writeIdx = static_cast<size_t>(lufsWritePos);
            lufsRunningSumL += newSquaredL - lufsBufferL[writeIdx];
            lufsRunningSumR += newSquaredR - lufsBufferR[writeIdx];

            // Update ring buffer
            lufsBufferL[writeIdx] = newSquaredL;
            lufsBufferR[writeIdx] = newSquaredR;
            lufsWritePos = (lufsWritePos + 1) % lufsBufferSize;
        }

        // LUFS = -0.691 + 10 * log10(sum of weighted channel powers)
        // For stereo: L and R have equal weight (1.0)
        // Use running sums instead of full loop (866M ops/sec → 2.9M ops/sec)
        float meanSquare = (lufsRunningSumL + lufsRunningSumR) / (2.0f * static_cast<float>(lufsBufferSize));

        float lufs = -100.0f;
        if (meanSquare > 1e-10f)
        {
            lufs = -0.691f + 10.0f * std::log10(meanSquare);
        }

        lufsShort.store(lufs, std::memory_order_relaxed);
    }
    else
    {
        // PHASE 2: LUFS disabled - set to silence indicator
        lufsShort.store(-100.0f, std::memory_order_relaxed);
    }
}

void AudioMeter::processKWeighting(const float* input, float* output, int numSamples, int channel)
{
    auto& states = (channel == 0) ? kWeightStateL : kWeightStateR;

    // Copy input to output first
    std::copy(input, input + numSamples, output);

    // Apply each biquad stage
    for (size_t stage = 0; stage < 2; ++stage)
    {
        const auto& c = kWeightCoeffs[stage];
        auto& s = states[stage];

        for (int i = 0; i < numSamples; ++i)
        {
            float x = output[i];

            // Transposed Direct Form II
            float y = c.b0 * x + s.z1;
            s.z1 = c.b1 * x - c.a1 * y + s.z2;
            s.z2 = c.b2 * x - c.a2 * y;

            output[i] = y;
        }
    }
}

void AudioMeter::updateKWeightingCoeffs()
{
    // K-weighting filter coefficients per ITU-R BS.1770-4
    //
    // At 48kHz we use the exact coefficients from Table 1 of the standard.
    // For other sample rates, we derive the analog prototype from the 48kHz
    // digital coefficients via inverse bilinear transform, then re-apply
    // the bilinear transform at the target rate with frequency pre-warping.

    const double fs = sampleRate;
    constexpr double fs48 = 48000.0;

    // --- Stage 1: Pre-filter (head-related) ---
    // ITU-R BS.1770-4 Table 1 coefficients at 48kHz
    constexpr double s1_b0_48 =  1.53512485958697;
    constexpr double s1_b1_48 = -2.69169618940638;
    constexpr double s1_b2_48 =  1.19839281085285;
    constexpr double s1_a1_48 = -1.69065929318241;
    constexpr double s1_a2_48 =  0.73248077421585;

    // --- Stage 2: Revised Low-frequency B-curve (RLB high-pass) ---
    // ITU-R BS.1770-4 Table 1 coefficients at 48kHz
    constexpr double s2_b0_48 =  1.0;
    constexpr double s2_b1_48 = -2.0;
    constexpr double s2_b2_48 =  1.0;
    constexpr double s2_a1_48 = -1.99004745483398;
    constexpr double s2_a2_48 =  0.99007225036621;

    if (std::abs(fs - fs48) < 1.0)
    {
        // Exact 48kHz -- use standard coefficients directly
        kWeightCoeffs[0].b0 = static_cast<float>(s1_b0_48);
        kWeightCoeffs[0].b1 = static_cast<float>(s1_b1_48);
        kWeightCoeffs[0].b2 = static_cast<float>(s1_b2_48);
        kWeightCoeffs[0].a1 = static_cast<float>(s1_a1_48);
        kWeightCoeffs[0].a2 = static_cast<float>(s1_a2_48);

        kWeightCoeffs[1].b0 = static_cast<float>(s2_b0_48);
        kWeightCoeffs[1].b1 = static_cast<float>(s2_b1_48);
        kWeightCoeffs[1].b2 = static_cast<float>(s2_b2_48);
        kWeightCoeffs[1].a1 = static_cast<float>(s2_a1_48);
        kWeightCoeffs[1].a2 = static_cast<float>(s2_a2_48);
    }
    else
    {
        // Non-48kHz: inverse bilinear transform from 48kHz digital -> analog,
        // then bilinear transform to target rate with frequency pre-warping.
        //
        // Bilinear transform: s = (2*fs) * (z-1)/(z+1)
        // For a second-order transfer function H(z) = (b0 + b1*z^-1 + b2*z^-2) /
        //                                             (1  + a1*z^-1 + a2*z^-2)
        // we convert to analog H(s) and then re-discretize at the new rate.
        //
        // The key insight: given digital coefficients at fs_ref, we can compute
        // the analog coefficients and re-apply bilinear transform at fs_target.
        // The frequency mapping uses: s = (2*fs) * (z-1)/(z+1)
        // so the warping constant K = 2*fs changes between rates.

        auto resamplCoeffs = [&](double b0_ref, double b1_ref, double b2_ref,
                                  double a1_ref, double a2_ref,
                                  double fsRef, double fsTarget,
                                  BiquadCoeffs& out)
        {
            // Step 1: Inverse bilinear transform at fsRef to get analog coefficients
            // z = (1 + s/(2*fsRef)) / (1 - s/(2*fsRef))
            // Let K_ref = 2 * fsRef
            double K_ref = 2.0 * fsRef;

            // The digital transfer function with a0=1 is:
            // H(z) = (b0 + b1*z^-1 + b2*z^-2) / (1 + a1*z^-1 + a2*z^-2)
            //
            // Substituting z^-1 = (K-s)/(K+s) where K = 2*fs:
            // Numerator in s: b0*(K+s)^2 + b1*(K+s)*(K-s) + b2*(K-s)^2
            // Denominator in s: 1*(K+s)^2 + a1*(K+s)*(K-s) + a2*(K-s)^2
            //
            // Expand:
            // (K+s)^2 = K^2 + 2Ks + s^2
            // (K+s)(K-s) = K^2 - s^2
            // (K-s)^2 = K^2 - 2Ks + s^2

            double K2 = K_ref * K_ref;

            // Analog numerator coefficients (in powers of s: s^2, s^1, s^0)
            // coeff of s^2: b0*1 + b1*(-1) + b2*1 = b0 - b1 + b2
            // coeff of s^1: 2K*(b0 - b2)
            // coeff of s^0: K^2*(b0 + b1 + b2)
            double numS2 = b0_ref - b1_ref + b2_ref;
            double numS1 = 2.0 * K_ref * (b0_ref - b2_ref);
            double numS0 = K2 * (b0_ref + b1_ref + b2_ref);

            // Analog denominator coefficients
            double denS2 = 1.0 - a1_ref + a2_ref;
            double denS1 = 2.0 * K_ref * (1.0 - a2_ref);
            double denS0 = K2 * (1.0 + a1_ref + a2_ref);

            // Step 2: Forward bilinear transform at fsTarget
            // s -> K_target * (z-1)/(z+1), K_target = 2*fsTarget
            // This maps analog H(s) back to digital H(z) at the new rate.
            //
            // The algebra is equivalent to substituting K_target for K_ref:
            // Digital num: numS0 + numS1*K_t + numS2*K_t^2 ... etc
            // But we already have the analog coefficients, so we do the standard transform.
            //
            // H(s) = (numS2*s^2 + numS1*s + numS0) / (denS2*s^2 + denS1*s + denS0)
            // Apply s = K_t*(z-1)/(z+1) and collect terms of z^0, z^-1, z^-2

            double K_t = 2.0 * fsTarget;
            double Kt2 = K_t * K_t;

            // After substitution and multiplying by (z+1)^2:
            // Numerator terms:
            double nb0 = numS2 * Kt2 + numS1 * K_t + numS0;
            double nb1 = 2.0 * numS0 - 2.0 * numS2 * Kt2;
            double nb2 = numS2 * Kt2 - numS1 * K_t + numS0;

            // Denominator terms:
            double na0 = denS2 * Kt2 + denS1 * K_t + denS0;
            double na1 = 2.0 * denS0 - 2.0 * denS2 * Kt2;
            double na2 = denS2 * Kt2 - denS1 * K_t + denS0;

            // Normalize
            out.b0 = static_cast<float>(nb0 / na0);
            out.b1 = static_cast<float>(nb1 / na0);
            out.b2 = static_cast<float>(nb2 / na0);
            out.a1 = static_cast<float>(na1 / na0);
            out.a2 = static_cast<float>(na2 / na0);
        };

        resamplCoeffs(s1_b0_48, s1_b1_48, s1_b2_48, s1_a1_48, s1_a2_48,
                       fs48, fs, kWeightCoeffs[0]);
        resamplCoeffs(s2_b0_48, s2_b1_48, s2_b2_48, s2_a1_48, s2_a2_48,
                       fs48, fs, kWeightCoeffs[1]);
    }
}

AudioMeter::Readings AudioMeter::getReadings() const
{
    Readings r;
    r.peakL = peakL.load(std::memory_order_relaxed);
    r.peakR = peakR.load(std::memory_order_relaxed);
    r.peakHoldL = peakHoldL.load(std::memory_order_relaxed);
    r.peakHoldR = peakHoldR.load(std::memory_order_relaxed);
    r.rmsL = rmsL.load(std::memory_order_relaxed);
    r.rmsR = rmsR.load(std::memory_order_relaxed);
    r.lufsShort = lufsShort.load(std::memory_order_relaxed);
    r.avgPeakDbL = avgPeakDbL.load(std::memory_order_relaxed);
    r.avgPeakDbR = avgPeakDbR.load(std::memory_order_relaxed);
    return r;
}

void AudioMeter::setEnableLUFS(bool enabled)
{
    lufsEnabled.store(enabled, std::memory_order_relaxed);
}
