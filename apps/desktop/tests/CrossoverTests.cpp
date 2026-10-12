#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include "core/ChainProcessor.h"
#include "audio/CrossoverBandProcessor.h"
#include "SyntheticPlugin.h"
#include <cmath>

namespace {
struct CrossoverFixture
{
    juce::ScopedJuceInitialiser_GUI gui;
    SyntheticFactory factory;
    PluginManager manager { [this](auto& d, auto rate, auto block, auto& error) { return factory(d, rate, block, error); } };
    ChainProcessor chain { manager };
    CrossoverFixture() { chain.setPlayConfigDetails(2, 2, 48000, 512); chain.prepareToPlay(48000, 512); }
    int add(const juce::String& name)
    {
        REQUIRE(chain.addPlugin(syntheticDescription(name, 0)));
        return chain.getRootNode().getGroup().children.back()->id;
    }
    int crossover(int bands)
    {
        std::vector<int> ids;
        for (int i = 0; i < bands; ++i) ids.push_back(add("unity"));
        const auto group = chain.createGroup(ids, GroupMode::Crossover, "bands");
        REQUIRE(group > 0);
        return group;
    }
};

// RMS of the last half of a few blocks of a sine run through a processor
template <typename Process>
float sineRms(float hz, Process&& process)
{
    double phase = 0, sum = 0; int counted = 0;
    const int blocks = 24;
    for (int b = 0; b < blocks; ++b)
    {
        juce::AudioBuffer<float> buffer(2, 512);
        for (int i = 0; i < 512; ++i)
        {
            const auto v = static_cast<float>(std::sin(phase));
            phase += juce::MathConstants<double>::twoPi * hz / 48000.0;
            buffer.setSample(0, i, v); buffer.setSample(1, i, v);
        }
        process(buffer);
        if (b >= blocks / 2)
            for (int i = 0; i < 512; ++i) { sum += buffer.getSample(0, i) * buffer.getSample(0, i); ++counted; }
    }
    return static_cast<float>(std::sqrt(sum / counted));
}

float toDb(float rms) { return 20.0f * std::log10(rms / std::sqrt(0.5f)); }
}

TEST_CASE("A crossover band keeps only its own frequencies", "[crossover]")
{
    CrossoverBandProcessor low(0, 2), high(1, 2);
    for (auto* p : { &low, &high }) { p->setFrequencies({ 1000.0f }); p->prepareToPlay(48000, 512); }
    juce::MidiBuffer midi;
    auto through = [&](CrossoverBandProcessor& p) { return [&](juce::AudioBuffer<float>& b) { p.processBlock(b, midi); }; };
    REQUIRE(toDb(sineRms(100.0f, through(low))) > -0.5f);
    REQUIRE(toDb(sineRms(10000.0f, through(low))) < -40.0f);
    REQUIRE(toDb(sineRms(10000.0f, through(high))) > -0.5f);
    REQUIRE(toDb(sineRms(100.0f, through(high))) < -40.0f);
}

TEST_CASE("Crossover bands add back up flat", "[crossover]")
{
    CrossoverFixture f; f.crossover(4);
    juce::MidiBuffer midi;
    for (float hz : { 40.0f, 120.0f, 700.0f, 1000.0f, 3000.0f, 5000.0f, 12000.0f })
    {
        const auto db = toDb(sineRms(hz, [&](juce::AudioBuffer<float>& b) { f.chain.processBlock(b, midi); }));
        INFO(hz << " Hz: " << db << " dB");
        REQUIRE(std::abs(db) < 0.1f);
    }
}

TEST_CASE("Muting a crossover band removes just that band", "[crossover]")
{
    CrossoverFixture f; const auto group = f.crossover(3);
    const auto lowBand = ChainNodeHelpers::findById(f.chain.getRootNode(), group)->getGroup().children[0]->id;
    REQUIRE(f.chain.setBranchMute(lowBand, true));
    juce::MidiBuffer midi;
    auto run = [&](juce::AudioBuffer<float>& b) { f.chain.processBlock(b, midi); };
    REQUIRE(toDb(sineRms(50.0f, run)) < -30.0f);
    REQUIRE(std::abs(toDb(sineRms(8000.0f, run))) < 0.2f);
}

TEST_CASE("Crossover split points stay in order and survive a save", "[crossover]")
{
    CrossoverFixture f; const auto group = f.crossover(3);
    auto hz = [&] { return ChainNodeHelpers::findById(f.chain.getRootNode(), group)->getGroup().crossoverHz; };
    REQUIRE(hz().size() == 2);
    REQUIRE(f.chain.setCrossoverFrequency(group, 0, 300.0f));
    REQUIRE(hz()[0] == Catch::Approx(300.0f));
    REQUIRE(f.chain.setCrossoverFrequency(group, 0, 90000.0f)); // clamped below the next split
    REQUIRE(hz()[0] < hz()[1]);
    REQUIRE(f.chain.setCrossoverFrequency(group, 0, 300.0f));
    REQUIRE_FALSE(f.chain.setCrossoverFrequency(group, 5, 300.0f));
    REQUIRE_FALSE(f.chain.setCrossoverFrequency(0, 0, 300.0f)); // root is serial

    auto saved = f.chain.serializeChainToXml();
    REQUIRE(f.chain.restoreChainFromXml(*saved).success);
    const auto* restored = f.chain.getRootNode().getGroup().children[0].get();
    REQUIRE(restored->getGroup().mode == GroupMode::Crossover);
    REQUIRE(restored->getGroup().crossoverHz.size() == 2);
    REQUIRE(restored->getGroup().crossoverHz[0] == Catch::Approx(300.0f));
}

TEST_CASE("A crossover group holds at most five bands", "[crossover]")
{
    CrossoverFixture f; const auto group = f.crossover(5);
    const auto extra = f.add("unity");
    REQUIRE_FALSE(f.chain.moveNode(extra, group, 0));
    REQUIRE_FALSE(f.chain.addPlugin(syntheticDescription("unity", 0), group, -1));
    REQUIRE(f.chain.setGroupMode(group, GroupMode::Parallel));
    REQUIRE(f.chain.moveNode(extra, group, 0));
    REQUIRE_FALSE(f.chain.setGroupMode(group, GroupMode::Crossover));
}

TEST_CASE("Invalid crossover state is rejected", "[crossover]")
{
    std::vector<float> hz;
    REQUIRE_FALSE(CrossoverHelpers::fromString("500,200", hz));
    REQUIRE_FALSE(CrossoverHelpers::fromString("abc", hz));
    REQUIRE_FALSE(CrossoverHelpers::fromString("5", hz));
    REQUIRE(CrossoverHelpers::fromString("200,2500", hz));
    REQUIRE(hz.size() == 2);
}
