#include <catch2/catch_test_macros.hpp>
#include "core/ChainProcessor.h"
#ifdef PROCHAIN_WRAPPER_BENCHMARK
#include "PluginProcessor.h"
#endif
#include "audio/AudioMeter.h"
#include "SyntheticPlugin.h"
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <memory>
#include <numeric>
#include <sys/utsname.h>
#include <sys/resource.h>
#if defined(__APPLE__)
#include <mach/mach.h>
#endif

namespace
{
using Clock = std::chrono::steady_clock;

struct Summary
{
    double p50 = 0.0, p95 = 0.0, p99 = 0.0, maximum = 0.0;
    int misses = 0;
};

static Summary summarize(std::vector<double> nanoseconds, double deadlineNs)
{
    std::sort(nanoseconds.begin(), nanoseconds.end());
    const auto percentile = [&nanoseconds](double p)
    {
        const auto index = static_cast<size_t>(p * static_cast<double>(nanoseconds.size() - 1));
        return nanoseconds[index];
    };
    Summary result;
    result.p50 = percentile(0.50); result.p95 = percentile(0.95); result.p99 = percentile(0.99);
    result.maximum = nanoseconds.back();
    result.misses = static_cast<int>(std::count_if(nanoseconds.begin(), nanoseconds.end(),
                                                   [deadlineNs](double value) { return value > deadlineNs; }));
    return result;
}

static Summary runActual(int pluginCount, int blockSize, int callbacks)
{
    SyntheticFactory factory;
#ifdef PROCHAIN_WRAPPER_BENCHMARK
    PluginChainManagerProcessor wrapper { [&factory](auto& d, auto rate, auto block, auto& error)
        { return factory(d, rate, block, error); } };
    auto& chain = wrapper.getChainProcessor();
#else
    PluginManager manager { [&factory](auto& d, auto rate, auto block, auto& error)
                            { return factory(d, rate, block, error); } };
    ChainProcessor chain { manager };
#endif
    chain.setPlayConfigDetails(2, 2, 48000.0, blockSize);
    for (int i = 0; i < pluginCount; ++i)
        REQUIRE(chain.addPlugin(syntheticDescription("bench-" + juce::String(i))));
#ifdef PROCHAIN_WRAPPER_BENCHMARK
    wrapper.setAnalysisSubscriptions(false, false);
    wrapper.prepareToPlay(48000.0, blockSize);
#else
    chain.prepareToPlay(48000.0, blockSize);
#endif

    AudioMeter inputMeter, outputMeter;
    inputMeter.setAnalysisMode(AudioMeter::AnalysisMode::full);
    outputMeter.setAnalysisMode(AudioMeter::AnalysisMode::full);
    inputMeter.prepareToPlay(48000.0, blockSize);
    outputMeter.prepareToPlay(48000.0, blockSize);
    juce::AudioBuffer<float> buffer(2, blockSize);
    juce::MidiBuffer midi;
    for (int i = 0; i < 64; ++i)
    {
        for (int ch = 0; ch < 2; ++ch) juce::FloatVectorOperations::fill(buffer.getWritePointer(ch), 0.125f, blockSize); midi.clear();
#ifdef PROCHAIN_WRAPPER_BENCHMARK
        wrapper.processBlock(buffer, midi);
#else
        inputMeter.process(buffer); chain.processBlock(buffer, midi); outputMeter.process(buffer);
#endif
    }

    std::vector<double> timings;
    timings.reserve(static_cast<size_t>(callbacks));
    const double deadlineNs = 1'000'000'000.0 * static_cast<double>(blockSize) / 48000.0;
    for (int i = 0; i < callbacks; ++i)
    {
        for (int ch = 0; ch < 2; ++ch) juce::FloatVectorOperations::fill(buffer.getWritePointer(ch), 0.125f, blockSize); midi.clear();
        const auto start = Clock::now();
#ifdef PROCHAIN_WRAPPER_BENCHMARK
        wrapper.processBlock(buffer, midi);
#else
        inputMeter.process(buffer); chain.processBlock(buffer, midi); outputMeter.process(buffer);
#endif
        timings.push_back(static_cast<double>(std::chrono::duration_cast<std::chrono::nanoseconds>(Clock::now() - start).count()));
    }
    return summarize(std::move(timings), deadlineNs);
}

static Summary runDirectBaseline(int pluginCount, int blockSize, int callbacks)
{
    SyntheticFactory factory;
    std::vector<std::unique_ptr<juce::AudioPluginInstance>> plugins;
    plugins.reserve(static_cast<size_t>(pluginCount));
    for (int i = 0; i < pluginCount; ++i)
    {
        juce::String error;
        plugins.push_back(factory(syntheticDescription("baseline-" + juce::String(i)), 48000.0, blockSize, error));
        REQUIRE(plugins.back() != nullptr);
        plugins.back()->prepareToPlay(48000.0, blockSize);
    }
    juce::AudioBuffer<float> buffer(2, blockSize); juce::MidiBuffer midi;
    for (int i = 0; i < 64; ++i)
    {
        for (int ch = 0; ch < 2; ++ch) juce::FloatVectorOperations::fill(buffer.getWritePointer(ch), 0.125f, blockSize); midi.clear();
        for (auto& plugin : plugins) plugin->processBlock(buffer, midi);
    }
    std::vector<double> timings; timings.reserve(static_cast<size_t>(callbacks));
    const double deadlineNs = 1'000'000'000.0 * static_cast<double>(blockSize) / 48000.0;
    for (int i = 0; i < callbacks; ++i)
    {
        for (int ch = 0; ch < 2; ++ch) juce::FloatVectorOperations::fill(buffer.getWritePointer(ch), 0.125f, blockSize); midi.clear(); const auto start = Clock::now();
       
        for (auto& plugin : plugins) plugin->processBlock(buffer, midi);
        timings.push_back(static_cast<double>(std::chrono::duration_cast<std::chrono::nanoseconds>(Clock::now() - start).count()));
    }
    return summarize(std::move(timings), deadlineNs);
}
}

TEST_CASE("Synthetic ChainProcessor callback benchmark", "[benchmark][.]")
{
    juce::ScopedJuceInitialiser_GUI gui;
    struct Config { int plugins; int block; };
    constexpr Config configs[] = { {20, 64}, {20, 128}, {20, 512},
                                   {40, 64}, {40, 128}, {40, 512},
                                   {64, 64}, {64, 128}, {64, 512} };
    struct utsname machine {}; uname(&machine);
    constexpr int callbacks = 5000;
#ifdef PROCHAIN_WRAPPER_BENCHMARK
    std::cout << "benchmark=production_wrapper_callback,analysis=off,gain_match=off,";
#else
    std::cout << "benchmark=chain_callback_plus_outer_meters,";
#endif
    std::cout << "format=csv,compiler=" << __VERSION__
              << ",machine=" << machine.machine << ",sample_rate=48000,callbacks=" << callbacks << '\n';
    std::cout << "plugins,block,deadline_ns,baseline_p50_ns,baseline_p95_ns,baseline_p99_ns,baseline_max_ns,baseline_deadline_misses,wrapper_p50_ns,wrapper_p95_ns,wrapper_p99_ns,wrapper_max_ns,wrapper_deadline_misses,estimated_routing_metering_p99_ns\n";
    for (const auto config : configs)
    {
        const auto baseline = runDirectBaseline(config.plugins, config.block, callbacks);
        const auto actual = runActual(config.plugins, config.block, callbacks);
        const double deadlineNs = 1'000'000'000.0 * static_cast<double>(config.block) / 48000.0;
        std::cout << config.plugins << ',' << config.block << ',' << deadlineNs << ','
                  << baseline.p50 << ',' << baseline.p95 << ',' << baseline.p99 << ',' << baseline.maximum << ',' << baseline.misses << ','
                  << actual.p50 << ',' << actual.p95 << ',' << actual.p99 << ',' << actual.maximum << ',' << actual.misses << ','
                  << (actual.p99 - baseline.p99) << '\n';
    }
    SUCCEED("Benchmark results emitted as CSV");
}

#ifdef PROCHAIN_WRAPPER_BENCHMARK
TEST_CASE("Wrapper lifecycle and simultaneous callback benchmark", "[benchmark-lifecycle][.]")
{
    juce::ScopedJuceInitialiser_GUI gui;
    constexpr int blockSize = 64, sampleRate = 48000, callbacks = 2000, pluginCount = 20;
    struct Memory { long long current = -1, peak = -1; };
    const auto memory = []
    {
        Memory result;
        struct rusage usage{};
        if (getrusage(RUSAGE_SELF, &usage) == 0)
        {
#if defined(__APPLE__)
            // Darwin reports ru_maxrss in bytes, unlike Linux's KiB.
            result.peak = static_cast<long long>(usage.ru_maxrss);
            mach_task_basic_info_data_t info{};
            mach_msg_type_number_t count = MACH_TASK_BASIC_INFO_COUNT;
            if (task_info(mach_task_self(), MACH_TASK_BASIC_INFO,
                          reinterpret_cast<task_info_t>(&info), &count) == KERN_SUCCESS)
                result.current = static_cast<long long>(info.resident_size);
#else
            result.peak = static_cast<long long>(usage.ru_maxrss) * 1024LL;
#endif
        }
        return result;
    };
    struct Result
    {
        Summary timing;
        double constructMs = 0.0, restoreMs = 0.0;
        Memory before, live, released;
    };
    const auto factory = [](auto& d, auto rate, auto block, auto& error)
    {
        SyntheticFactory f;
        return f(d, rate, block, error);
    };
    const auto run = [&](int wrapperCount, bool analysis)
    {
        Result result;
        result.before = memory();
        const auto constructStart = Clock::now();
        std::vector<std::unique_ptr<PluginChainManagerProcessor>> wrappers;
        wrappers.reserve(static_cast<size_t>(wrapperCount));
        for (size_t w = 0; w < static_cast<size_t>(wrapperCount); ++w)
        {
            auto wrapper = std::make_unique<PluginChainManagerProcessor>(factory);
            for (int i = 0; i < pluginCount; ++i)
                REQUIRE(wrapper->getChainProcessor().addPlugin(
                    syntheticDescription("lifecycle-" + juce::String(static_cast<int>(w)) + "-" + juce::String(i))));
            wrapper->setAnalysisSubscriptions(analysis, analysis);
            wrapper->prepareToPlay(sampleRate, blockSize);
            wrappers.push_back(std::move(wrapper));
        }
        result.constructMs = std::chrono::duration<double, std::milli>(Clock::now() - constructStart).count();
        std::vector<juce::AudioBuffer<float>> buffers;
        std::vector<juce::MidiBuffer> midi;
        for (size_t w = 0; w < static_cast<size_t>(wrapperCount); ++w)
        {
            buffers.emplace_back(2, blockSize);
            midi.emplace_back();
        }
        const auto fillInput = [&]
        {
            for (size_t w = 0; w < static_cast<size_t>(wrapperCount); ++w)
            {
                for (int channel = 0; channel < 2; ++channel)
                    juce::FloatVectorOperations::fill(buffers[w].getWritePointer(channel), 0.125f, blockSize);
                midi[w].clear();
            }
        };
        for (int i = 0; i < 64; ++i)
        {
            fillInput();
            for (size_t w = 0; w < static_cast<size_t>(wrapperCount); ++w) wrappers[w]->processBlock(buffers[w], midi[w]);
        }
        std::vector<double> timings;
        timings.reserve(callbacks);
        for (int i = 0; i < callbacks; ++i)
        {
            fillInput();
            const auto start = Clock::now();
            for (size_t w = 0; w < static_cast<size_t>(wrapperCount); ++w) wrappers[w]->processBlock(buffers[w], midi[w]);
            timings.push_back(static_cast<double>(std::chrono::duration_cast<std::chrono::nanoseconds>(Clock::now() - start).count()));
            // Frame reads and yielding are deliberately outside callback timing.
            // This simulates an analysis consumer; no WebView/editor is created.
            if (analysis && i % 50 == 0)
            {
                for (auto& wrapper : wrappers)
                {
                    (void) wrapper->getFFTProcessor().getMagnitudes();
                    (void) wrapper->getWaveformCapture().getPrePeaks();
                    (void) wrapper->getWaveformCapture().getPostPeaks();
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            }
        }
        std::vector<juce::MemoryBlock> states(static_cast<size_t>(wrapperCount));
        for (size_t w = 0; w < static_cast<size_t>(wrapperCount); ++w) wrappers[w]->getStateInformation(states[w]);
        const auto restoreStart = Clock::now();
        std::vector<std::unique_ptr<PluginChainManagerProcessor>> restored;
        for (size_t w = 0; w < static_cast<size_t>(wrapperCount); ++w)
        {
            auto wrapper = std::make_unique<PluginChainManagerProcessor>(factory);
            wrapper->prepareToPlay(sampleRate, blockSize);
            wrapper->setStateInformation(states[w].getData(), static_cast<int>(states[w].getSize()));
            REQUIRE(wrapper->getChainProcessor().getNumSlots() == pluginCount);
            restored.push_back(std::move(wrapper));
        }
        result.restoreMs = std::chrono::duration<double, std::milli>(Clock::now() - restoreStart).count();
        result.timing = summarize(std::move(timings), 1'000'000'000.0 * blockSize / sampleRate);
        result.live = memory();
        restored.clear();
        wrappers.clear();
        result.released = memory();
        return result;
    };
    std::cout << "benchmark=wrapper_lifecycle,plugins_per_wrapper=20,sample_rate=48000,warmup=64,cycles=3,"
                 "restore=construct_prepare_and_synchronous_state_restore,no_native_editor,format=csv\n";
    std::cout << "cycle,wrappers,analysis_consumer,callbacks,block,deadline_ns,p50_ns,p95_ns,p99_ns,max_ns,deadline_misses,"
                 "construct_ms,restore_ms,rss_before_bytes,rss_live_bytes,rss_released_bytes,peak_rss_bytes\n";
    for (int cycle = 1; cycle <= 3; ++cycle)
        for (int count : {1, 4})
            for (bool analysis : {false, true})
            {
                const auto result = run(count, analysis);
                std::cout << cycle << ',' << count << ',' << (analysis ? "simulated_analysis_consumer" : "off") << ','
                          << callbacks << ',' << blockSize << ',' << (1'000'000'000.0 * blockSize / sampleRate) << ','
                          << result.timing.p50 << ',' << result.timing.p95 << ',' << result.timing.p99 << ','
                          << result.timing.maximum << ',' << result.timing.misses << ',' << result.constructMs << ','
                          << result.restoreMs << ',' << result.before.current << ',' << result.live.current << ','
                          << result.released.current << ',' << result.released.peak << '\n';
            }
    SUCCEED("Lifecycle benchmark emitted as CSV; RSS includes process/framework allocator caches");
}
#endif
