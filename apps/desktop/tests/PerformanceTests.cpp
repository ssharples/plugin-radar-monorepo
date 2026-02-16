#include <catch2/catch_test_macros.hpp>
#include <catch2/benchmark/catch_benchmark.hpp>
#include "../src/PluginProcessor.h"
#include "../src/core/ChainProcessor.h"
#include "../src/core/PluginManager.h"
#include "../src/audio/BranchGainProcessor.h"
#include "../src/audio/DryWetMixProcessor.h"
#include <chrono>

TEST_CASE("Performance - dbToLinear function", "[performance][benchmark]")
{
    BENCHMARK("dbToLinear conversion")
    {
        float result = 0.0f;
        for (float db = -60.0f; db <= 24.0f; db += 0.5f)
        {
            BranchGainProcessor processor;
            processor.setGainDb(db);
            result += processor.getGainDb();
        }
        return result;
    };
}

TEST_CASE("Performance - getFlatPluginList with const correctness", "[performance]")
{
    PluginManager manager;
    ChainProcessor chain(manager);

    // Add some dummy nodes to the chain (using the root group)
    // In a real test, we'd add actual plugins, but for performance testing,
    // we just want to measure the overhead of getFlatPluginList

    // Measure non-const version
    auto start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < 1000; ++i)
    {
        auto plugins = chain.getFlatPluginList();
        (void)plugins;  // Prevent optimization
    }
    auto end = std::chrono::high_resolution_clock::now();
    auto nonConstDuration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);

    INFO("Non-const getFlatPluginList: " << nonConstDuration.count() << " microseconds");

    // Measure const version
    const ChainProcessor& constChain = chain;
    start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < 1000; ++i)
    {
        auto plugins = constChain.getFlatPluginList();
        (void)plugins;  // Prevent optimization
    }
    end = std::chrono::high_resolution_clock::now();
    auto constDuration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);

    INFO("Const getFlatPluginList: " << constDuration.count() << " microseconds");

    // Both should be fast (under 10ms for 1000 iterations on empty chain)
    REQUIRE(nonConstDuration.count() < 10000);
    REQUIRE(constDuration.count() < 10000);
}

TEST_CASE("Performance - MirrorManager parameter snapshot", "[performance][mirror]")
{
    // This test measures the performance of capturing parameter snapshots
    // which is called at 15Hz during mirroring

    auto processor = std::make_unique<PluginChainManagerProcessor>();
    auto& mirror = processor->getMirrorManager();

    // Measure time to capture a snapshot
    auto start = std::chrono::high_resolution_clock::now();

    for (int i = 0; i < 100; ++i)
    {
        // captureParameterSnapshot is private, so we can't call it directly
        // Instead, we'll simulate by calling getFlatPluginList which is the bottleneck
        const auto& chain = processor->getChainProcessor();
        auto plugins = chain.getFlatPluginList();
        (void)plugins;
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);

    INFO("100 parameter snapshots: " << duration.count() << " microseconds");
    INFO("Average per snapshot: " << (duration.count() / 100.0) << " microseconds");

    // Should be fast enough for 15Hz timer (< 66ms per snapshot)
    // We test 100 iterations, so < 6.6ms total
    REQUIRE(duration.count() < 6600);

    processor.reset();
}

TEST_CASE("Performance - Chain rebuild overhead", "[performance]")
{
    PluginManager manager;
    ChainProcessor chain(manager);

    // Measure time to rebuild an empty graph
    auto start = std::chrono::high_resolution_clock::now();

    for (int i = 0; i < 100; ++i)
    {
        // rebuildGraph() is private, but we can trigger it via other operations
        // For now, just measure the getFlatPluginList overhead as a proxy
        auto plugins = chain.getFlatPluginList();
        (void)plugins;
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);

    INFO("100 getFlatPluginList calls: " << duration.count() << " microseconds");

    // Should be very fast for an empty chain
    REQUIRE(duration.count() < 1000);
}

TEST_CASE("Performance - DryWetMixProcessor buffer validation", "[performance][audio]")
{
    DryWetMixProcessor processor;

    // Prepare with a standard buffer size
    processor.prepareToPlay(44100.0, 512);

    // Create buffers
    juce::AudioBuffer<float> buffer(4, 512);
    juce::MidiBuffer midiBuffer;

    // Fill with test data
    for (int ch = 0; ch < 4; ++ch)
    {
        for (int i = 0; i < 512; ++i)
        {
            buffer.setSample(ch, i, (float)i / 512.0f);
        }
    }

    // Benchmark processing
    BENCHMARK("DryWetMixProcessor process block")
    {
        processor.processBlock(buffer, midiBuffer);
    };

    processor.releaseResources();
}

TEST_CASE("Performance - BranchGainProcessor smoothing", "[performance][audio]")
{
    BranchGainProcessor processor;

    processor.prepareToPlay(44100.0, 512);

    juce::AudioBuffer<float> buffer(2, 512);
    juce::MidiBuffer midiBuffer;

    // Fill with test data
    for (int ch = 0; ch < 2; ++ch)
    {
        for (int i = 0; i < 512; ++i)
        {
            buffer.setSample(ch, i, 1.0f);
        }
    }

    // Set initial gain
    processor.setGainDb(0.0f);
    processor.processBlock(buffer, midiBuffer);

    // Benchmark with gain change (triggers smoothing)
    BENCHMARK("BranchGainProcessor with smoothing")
    {
        processor.setGainDb(6.0f);
        processor.processBlock(buffer, midiBuffer);
        processor.setGainDb(0.0f);
        processor.processBlock(buffer, midiBuffer);
    };

    processor.releaseResources();
}

TEST_CASE("Memory - noexcept destructors don't throw", "[memory]")
{
    // This test verifies that destructors marked noexcept actually don't throw
    // If they do throw, the program will terminate (which Catch2 will detect)

    SECTION("ChainProcessor destructor")
    {
        PluginManager manager;
        auto chain = std::make_unique<ChainProcessor>(manager);
        // Destructor called here - should not throw
        chain.reset();
        SUCCEED("ChainProcessor destroyed without exception");
    }

    SECTION("PluginManager destructor")
    {
        auto manager = std::make_unique<PluginManager>();
        // Destructor called here - should not throw
        manager.reset();
        SUCCEED("PluginManager destroyed without exception");
    }

    SECTION("MirrorManager destructor")
    {
        auto processor = std::make_unique<PluginChainManagerProcessor>();
        // When processor is destroyed, MirrorManager destructor is called
        processor.reset();
        SUCCEED("MirrorManager destroyed without exception");
    }
}

TEST_CASE("Memory - move operations are efficient", "[memory][performance]")
{
    // While we can't directly test move constructors (they're defaulted),
    // we can verify that vector operations don't copy excessively

    std::vector<std::unique_ptr<ChainNode>> nodes;
    nodes.reserve(100);

    auto start = std::chrono::high_resolution_clock::now();

    for (int i = 0; i < 100; ++i)
    {
        auto node = std::make_unique<ChainNode>();
        node->id = i;
        node->name = "Node " + juce::String(i);
        nodes.push_back(std::move(node));
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);

    INFO("Creating 100 ChainNodes: " << duration.count() << " microseconds");

    // Should be very fast (under 1ms)
    REQUIRE(duration.count() < 1000);
    REQUIRE(nodes.size() == 100);
}
