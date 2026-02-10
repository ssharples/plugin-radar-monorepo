#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>
#include "core/ParameterDiscovery.h"

using Catch::Matchers::WithinAbs;
using Catch::Matchers::WithinRel;

// ============================================
// Mock AudioProcessor with typed parameters
// ============================================
class MockProcessor : public juce::AudioProcessor
{
public:
    MockProcessor()
    {
        // Frequency parameter: 20-20000 Hz with skew 0.2 (log-like)
        addParameter(freqParam = new juce::AudioParameterFloat(
            juce::ParameterID("Frequency", 1),
            "Frequency",
            juce::NormalisableRange<float>(20.0f, 20000.0f, 0.0f, 0.199f),
            1000.0f,
            juce::AudioParameterFloatAttributes().withLabel("Hz")));

        // Threshold: -60 to 0 dB, linear (skew 1.0)
        addParameter(threshParam = new juce::AudioParameterFloat(
            juce::ParameterID("Threshold", 1),
            "Threshold",
            juce::NormalisableRange<float>(-60.0f, 0.0f, 0.1f, 1.0f),
            -20.0f,
            juce::AudioParameterFloatAttributes().withLabel("dB")));

        // Q parameter: 0.1 to 30 (q_factor range)
        addParameter(qParam = new juce::AudioParameterFloat(
            juce::ParameterID("Band 1 Q", 1),
            "Band 1 Q",
            juce::NormalisableRange<float>(0.1f, 30.0f, 0.0f, 0.5f),
            1.0f));

        // Bandwidth parameter: 0.1 to 4.0 octaves
        addParameter(bwParam = new juce::AudioParameterFloat(
            juce::ParameterID("Band 1 Bandwidth", 1),
            "Band 1 Bandwidth",
            juce::NormalisableRange<float>(0.1f, 4.0f, 0.0f, 1.0f),
            1.0f));

        // Generic unnamed parameter (no NormalisableRange via AudioParameterFloat but with range)
        addParameter(gainParam = new juce::AudioParameterFloat(
            juce::ParameterID("Gain", 1),
            "Gain",
            juce::NormalisableRange<float>(-24.0f, 24.0f, 0.1f, 1.0f),
            0.0f,
            juce::AudioParameterFloatAttributes().withLabel("dB")));
    }

    // Required AudioProcessor overrides
    const juce::String getName() const override { return "MockPlugin"; }
    void prepareToPlay(double, int) override {}
    void releaseResources() override {}
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override {}
    double getTailLengthSeconds() const override { return 0; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock&) override {}
    void setStateInformation(const void*, int) override {}

    juce::AudioParameterFloat* freqParam = nullptr;
    juce::AudioParameterFloat* threshParam = nullptr;
    juce::AudioParameterFloat* qParam = nullptr;
    juce::AudioParameterFloat* bwParam = nullptr;
    juce::AudioParameterFloat* gainParam = nullptr;
};

// ============================================
// Tests
// ============================================

TEST_CASE("ParameterDiscovery — NormalisableRange extraction", "[ParameterDiscovery]")
{
    MockProcessor proc;
    auto map = ParameterDiscovery::discoverParameterMap(&proc, "MockPlugin", "TestMfr");

    SECTION("Extracts skew factor from frequency parameter")
    {
        // Find the frequency parameter
        const ParameterDiscovery::DiscoveredParameter* freqDiscovered = nullptr;
        for (const auto& p : map.parameters)
        {
            if (p.juceParamId == "Frequency")
            {
                freqDiscovered = &p;
                break;
            }
        }

        REQUIRE(freqDiscovered != nullptr);
        CHECK(freqDiscovered->hasNormalisableRange == true);
        CHECK_THAT(freqDiscovered->rangeStart, WithinAbs(20.0f, 0.01f));
        CHECK_THAT(freqDiscovered->rangeEnd, WithinAbs(20000.0f, 0.01f));
        CHECK_THAT(freqDiscovered->skewFactor, WithinAbs(0.199f, 0.001f));
        CHECK(freqDiscovered->symmetricSkew == false);
    }

    SECTION("Extracts linear range from threshold parameter")
    {
        const ParameterDiscovery::DiscoveredParameter* threshDiscovered = nullptr;
        for (const auto& p : map.parameters)
        {
            if (p.juceParamId == "Threshold")
            {
                threshDiscovered = &p;
                break;
            }
        }

        REQUIRE(threshDiscovered != nullptr);
        CHECK(threshDiscovered->hasNormalisableRange == true);
        CHECK_THAT(threshDiscovered->rangeStart, WithinAbs(-60.0f, 0.01f));
        CHECK_THAT(threshDiscovered->rangeEnd, WithinAbs(0.0f, 0.01f));
        CHECK_THAT(threshDiscovered->skewFactor, WithinAbs(1.0f, 0.001f));
        CHECK_THAT(threshDiscovered->interval, WithinAbs(0.1f, 0.001f));
    }

    SECTION("Multi-point sampling returns 5 curve samples")
    {
        const ParameterDiscovery::DiscoveredParameter* freqDiscovered = nullptr;
        for (const auto& p : map.parameters)
        {
            if (p.juceParamId == "Frequency")
            {
                freqDiscovered = &p;
                break;
            }
        }

        REQUIRE(freqDiscovered != nullptr);
        CHECK(freqDiscovered->curveSamples.size() == 5);

        // Check that sample points are 0.0, 0.25, 0.5, 0.75, 1.0
        CHECK_THAT(freqDiscovered->curveSamples[0].first, WithinAbs(0.0f, 0.001f));
        CHECK_THAT(freqDiscovered->curveSamples[1].first, WithinAbs(0.25f, 0.001f));
        CHECK_THAT(freqDiscovered->curveSamples[2].first, WithinAbs(0.5f, 0.001f));
        CHECK_THAT(freqDiscovered->curveSamples[3].first, WithinAbs(0.75f, 0.001f));
        CHECK_THAT(freqDiscovered->curveSamples[4].first, WithinAbs(1.0f, 0.001f));

        // First sample should be ~20 Hz (min), last should be ~20000 Hz (max)
        CHECK_THAT(freqDiscovered->curveSamples[0].second, WithinAbs(20.0f, 1.0f));
        CHECK_THAT(freqDiscovered->curveSamples[4].second, WithinRel(20000.0f, 0.01f));
    }

    SECTION("Q representation detection — q_factor for high range")
    {
        const ParameterDiscovery::DiscoveredParameter* qDiscovered = nullptr;
        for (const auto& p : map.parameters)
        {
            if (p.juceParamId == "Band 1 Q")
            {
                qDiscovered = &p;
                break;
            }
        }

        REQUIRE(qDiscovered != nullptr);
        CHECK(qDiscovered->hasNormalisableRange == true);
        CHECK(qDiscovered->qRepresentation == juce::String("q_factor"));
    }

    SECTION("Q representation detection — bandwidth_octaves for low range")
    {
        const ParameterDiscovery::DiscoveredParameter* bwDiscovered = nullptr;
        for (const auto& p : map.parameters)
        {
            if (p.juceParamId == "Band 1 Bandwidth")
            {
                bwDiscovered = &p;
                break;
            }
        }

        REQUIRE(bwDiscovered != nullptr);
        CHECK(bwDiscovered->hasNormalisableRange == true);
        // Bandwidth matches "_q" via "bandwidth" semantic, rangeEnd=4.0 <= 5.0
        // Note: this only applies if semantic contains "_q"
        // Since "Band 1 Bandwidth" matches "bandwidth" pattern → eq_band_1_q semantic
        CHECK(bwDiscovered->qRepresentation == juce::String("bandwidth_octaves"));
    }

    SECTION("Confidence and category are set")
    {
        CHECK(map.category == juce::String("eq")); // Has band frequency params
        CHECK(map.confidence > 0);
        CHECK(map.totalCount == 5);
    }
}

TEST_CASE("ParameterDiscovery — JSON serialization includes NormalisableRange", "[ParameterDiscovery]")
{
    MockProcessor proc;
    auto map = ParameterDiscovery::discoverParameterMap(&proc, "MockPlugin", "TestMfr");
    auto json = ParameterDiscovery::toJson(map);

    auto* root = json.getDynamicObject();
    REQUIRE(root != nullptr);

    auto params = root->getProperty("parameters");
    REQUIRE(params.isArray());

    // Find frequency param in JSON
    for (int i = 0; i < params.getArray()->size(); ++i)
    {
        auto paramVar = (*params.getArray())[i];
        auto* paramObj = paramVar.getDynamicObject();
        if (paramObj && paramObj->getProperty("juceParamId") == juce::var("Frequency"))
        {
            CHECK(paramObj->getProperty("hasNormalisableRange") == juce::var(true));
            CHECK_THAT(static_cast<float>(paramObj->getProperty("rangeStart")), WithinAbs(20.0f, 0.01f));
            CHECK_THAT(static_cast<float>(paramObj->getProperty("rangeEnd")), WithinAbs(20000.0f, 0.01f));
            CHECK_THAT(static_cast<float>(paramObj->getProperty("skewFactor")), WithinAbs(0.199f, 0.001f));

            auto samples = paramObj->getProperty("curveSamples");
            CHECK(samples.isArray());
            CHECK(samples.getArray()->size() == 5);
            break;
        }
    }
}

TEST_CASE("ParameterDiscovery — parseFloatFromText", "[ParameterDiscovery]")
{
    CHECK_THAT(ParameterDiscovery::parseFloatFromText("20.0 Hz"), WithinAbs(20.0f, 0.01f));
    CHECK_THAT(ParameterDiscovery::parseFloatFromText("-12.5 dB"), WithinAbs(-12.5f, 0.01f));
    CHECK_THAT(ParameterDiscovery::parseFloatFromText("1000"), WithinAbs(1000.0f, 0.01f));
    CHECK_THAT(ParameterDiscovery::parseFloatFromText("0.25 ms"), WithinAbs(0.25f, 0.01f));
    CHECK_THAT(ParameterDiscovery::parseFloatFromText("no number"), WithinAbs(0.0f, 0.01f));
}
