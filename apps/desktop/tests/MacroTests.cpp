#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include "core/ChainProcessor.h"
#include "automation/MacroManager.h"
#include "SyntheticPlugin.h"

namespace {
struct MacroFixture
{
    juce::ScopedJuceInitialiser_GUI gui;
    SyntheticFactory factory;
    PluginManager manager { [this](auto& d, auto rate, auto block, auto& error) { return factory(d, rate, block, error); } };
    ChainProcessor chain { manager };
    juce::AudioProcessorGraph host; // stands in for the wrapper that owns the macro parameters
    MacroManager macros;

    MacroFixture()
    {
        chain.setPlayConfigDetails(2, 2, 48000, 512); chain.prepareToPlay(48000, 512);
        macros.createAndRegister(host);
        chain.onPluginRetiring = [this](const juce::String& id) { macros.unbindAffected(id); };
        chain.canRetireTargets = [this] { return macros.isQuiescent(); };
        macros.rebind(chain);
    }
    ~MacroFixture() { chain.onPluginRetiring = {}; chain.canRetireTargets = {}; macros.shutdown(); }

    int add(const juce::String& name)
    {
        REQUIRE(chain.addPlugin(syntheticDescription(name, 0)));
        macros.rebind(chain);
        return chain.getRootNode().getGroup().children.back()->id;
    }
    juce::String pluginId(int nodeId) { return ChainNodeHelpers::findById(chain.getRootNode(), nodeId)->getPlugin().persistentId; }
    juce::AudioProcessorParameter* gainOf(int nodeId) { return chain.getNodeProcessor(nodeId)->getParameters()[0]; }
    float render()
    {
        juce::AudioBuffer<float> b(2, 512);
        for (int c = 0; c < 2; ++c) juce::FloatVectorOperations::fill(b.getWritePointer(c), 1.0f, b.getNumSamples());
        juce::MidiBuffer midi; chain.processBlock(b, midi); return b.getSample(0, 511);
    }
};

MacroLink gainLink(const juce::String& pluginId, float min, float max)
{
    MacroLink link; link.pluginId = pluginId; link.parameterId = "gain"; link.min = min; link.max = max; return link;
}
}

TEST_CASE("A macro sweeps each linked parameter over its own range", "[macro]")
{
    MacroFixture f; const auto a = f.add("unity"), b = f.add("unity");
    REQUIRE(f.macros.addLink(0, gainLink(f.pluginId(a), 0.25f, 0.75f)));
    REQUIRE(f.macros.addLink(0, gainLink(f.pluginId(b), 0.5f, 0.0f))); // reversed range
    f.macros.setValue(0, 1.0f);
    REQUIRE(f.gainOf(a)->getValue() == Catch::Approx(0.75f));
    REQUIRE(f.gainOf(b)->getValue() == Catch::Approx(0.0f));
    f.macros.setValue(0, 0.5f);
    REQUIRE(f.gainOf(a)->getValue() == Catch::Approx(0.5f));
    REQUIRE(f.gainOf(b)->getValue() == Catch::Approx(0.25f));
    REQUIRE(f.macros.getValue(0) == Catch::Approx(0.5f));
    // 0.5 and 0.25 of a 0..4 gain range: 2 x 1 = 2
    REQUIRE(f.render() == Catch::Approx(2.0f).margin(1e-4));
}

TEST_CASE("Host automation of a macro parameter moves its links", "[macro]")
{
    MacroFixture f; const auto a = f.add("unity");
    REQUIRE(f.macros.addLink(3, gainLink(f.pluginId(a), 0.0f, 1.0f)));
    auto* hostParameter = f.host.getParameters()[3];
    REQUIRE(hostParameter->getName(32) == "Macro 4");
    hostParameter->setValue(0.75f);
    REQUIRE(f.gainOf(a)->getValue() == Catch::Approx(0.75f));
}

TEST_CASE("Linking the same parameter twice updates its range", "[macro]")
{
    MacroFixture f; const auto a = f.add("unity");
    REQUIRE(f.macros.addLink(0, gainLink(f.pluginId(a), 0.0f, 1.0f)));
    REQUIRE(f.macros.addLink(0, gainLink(f.pluginId(a), 0.2f, 0.4f)));
    REQUIRE(f.macros.getMacro(0).links.size() == 1);
    REQUIRE(f.macros.getMacro(0).links[0].max == Catch::Approx(0.4f));
    REQUIRE(f.macros.setLinkRange(0, 0, 0.1f, 2.0f)); // clamps to 0..1
    REQUIRE(f.macros.getMacro(0).links[0].max == Catch::Approx(1.0f));
    REQUIRE(f.macros.removeLink(0, 0));
    REQUIRE(f.macros.getMacro(0).links.empty());
}

TEST_CASE("Links to a missing plugin are kept and come back with it", "[macro]")
{
    MacroFixture f; const auto a = f.add("unity"); const auto keep = f.add("unity");
    const auto missingId = f.pluginId(a);
    REQUIRE(f.macros.addLink(0, gainLink(missingId, 0.0f, 1.0f)));
    REQUIRE(f.macros.addLink(0, gainLink(f.pluginId(keep), 0.0f, 0.5f)));
    REQUIRE(f.macros.isLinkAvailable(0, 0));

    auto saved = f.chain.serializeChainToXml();
    REQUIRE(f.chain.removeNode(a));
    f.macros.rebind(f.chain);
    REQUIRE(f.macros.getMacro(0).links.size() == 2);
    REQUIRE_FALSE(f.macros.isLinkAvailable(0, 0));
    REQUIRE(f.macros.isLinkAvailable(0, 1));
    f.macros.setValue(0, 1.0f); // must not touch the removed plugin
    REQUIRE(f.gainOf(keep)->getValue() == Catch::Approx(0.5f));

    // The macro state survives a save while the plugin is missing
    MacroManager reloaded;
    REQUIRE(reloaded.restoreFromXml(f.macros.toXml()));
    REQUIRE(reloaded.getMacro(0).links.size() == 2);
    REQUIRE(reloaded.getMacro(0).links[0].pluginId == missingId);

    // Restoring the chain brings the plugin, and the link, back
    REQUIRE(f.chain.restoreChainFromXml(*saved).success);
    f.macros.rebind(f.chain);
    REQUIRE(f.macros.isLinkAvailable(0, 0));
}

TEST_CASE("Restoring macros keeps the plugins' saved values", "[macro]")
{
    MacroFixture f; const auto a = f.add("unity");
    REQUIRE(f.macros.addLink(1, gainLink(f.pluginId(a), 0.0f, 1.0f)));
    REQUIRE(f.macros.rename(1, "Drive"));
    f.macros.setValue(1, 0.8f);
    auto xml = f.macros.toXml();

    f.gainOf(a)->setValue(0.1f); // the user moved it by hand after saving
    REQUIRE(f.macros.restoreFromXml(xml));
    REQUIRE(f.macros.getMacro(1).name == "Drive");
    REQUIRE(f.macros.getValue(1) == Catch::Approx(0.8f));
    REQUIRE(f.gainOf(a)->getValue() == Catch::Approx(0.1f));
}

TEST_CASE("Invalid macro state is rejected", "[macro]")
{
    MacroManager macros;
    juce::XmlElement bad("MACROS");
    bad.createNewChildElement("MACRO")->setAttribute("index", 9);
    REQUIRE_FALSE(macros.restoreFromXml(bad));
    REQUIRE_FALSE(macros.restoreFromXml(juce::XmlElement("OTHER")));
    REQUIRE_FALSE(macros.addLink(0, MacroLink{}));
}

TEST_CASE("A link's curve bends the sweep but keeps its end points", "[macro]")
{
    REQUIRE(shapeMacroValue(0.5f, 0.0f) == Catch::Approx(0.5f));
    REQUIRE(shapeMacroValue(0.5f, 1.0f) > 0.8f);  // moves fast early
    REQUIRE(shapeMacroValue(0.5f, -1.0f) < 0.1f); // moves fast late
    REQUIRE(shapeMacroValue(1.0f, 1.0f) == Catch::Approx(1.0f));
    REQUIRE(shapeMacroValue(0.0f, -1.0f) == Catch::Approx(0.0f));

    MacroFixture f; const auto a = f.add("unity");
    REQUIRE(f.macros.addLink(0, gainLink(f.pluginId(a), 0.0f, 1.0f)));
    REQUIRE(f.macros.setLinkCurve(0, 0, -1.0f));
    f.macros.setValue(0, 0.5f);
    REQUIRE(f.gainOf(a)->getValue() == Catch::Approx(0.0625f).margin(1e-3)); // 0.5 to the power 4

    MacroManager reloaded;
    REQUIRE(reloaded.restoreFromXml(f.macros.toXml()));
    REQUIRE(reloaded.getMacro(0).links[0].curve == Catch::Approx(-1.0f));
    REQUIRE_FALSE(f.macros.setLinkCurve(0, 3, 0.5f));
}
