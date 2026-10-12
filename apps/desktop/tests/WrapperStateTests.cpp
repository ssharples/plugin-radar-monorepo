#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include "PluginProcessor.h"
#include "core/PresetManager.h"
#include "core/MirrorManager.h"
#include "bridge/WebViewBridge.h"
#include "automation/ProxyParameter.h"
#include "SyntheticPlugin.h"
#include <functional>
#include <CoreFoundation/CoreFoundation.h>

namespace {
struct WrapperFixture
{
    juce::ScopedJuceInitialiser_GUI gui;
    SyntheticFactory factory;
    PluginChainManagerProcessor processor { [this](auto& d, auto rate, auto block, auto& error) { return factory(d, rate, block, error); } };
    WrapperFixture() { processor.prepareToPlay(48000, 64); }
    void add(const juce::String& name = "gain2") { REQUIRE(processor.getChainProcessor().addPlugin(syntheticDescription(name))); }
    juce::AudioBuffer<float> render(float input = 0.25f, int blocks = 1)
    {
        juce::AudioBuffer<float> audio(2, 64); juce::MidiBuffer midi;
        for (int block = 0; block < blocks; ++block)
        {
            for (int c = 0; c < 2; ++c) juce::FloatVectorOperations::fill(audio.getWritePointer(c), input, 64);
            processor.processBlock(audio, midi);
        }
        return audio;
    }
};

juce::File writePreset(const PluginChainManagerProcessor& processor, const juce::String& name,
                       bool legacy = false, const juce::String& wrapperGain = {})
{
    juce::XmlElement root("PluginChainPreset");
    auto* metadata = root.createNewChildElement("MetaData");
    metadata->setAttribute("name", name);
    metadata->setAttribute("category", "Tests");

    if (legacy)
    {
        auto* chain = root.createNewChildElement("Chain");
        int index = 0;
        for (auto* leaf : const_cast<PluginChainManagerProcessor&>(processor).getChainProcessor().getFlatPluginList())
        {
            auto* slot = chain->createNewChildElement("Slot");
            slot->setAttribute("bypassed", leaf->bypassed);
            auto* plugin = slot->createNewChildElement("Plugin");
            plugin->setAttribute("name", leaf->description.name);
            plugin->setAttribute("format", leaf->description.pluginFormatName);
            plugin->setAttribute("uid", leaf->description.uniqueId);
            plugin->setAttribute("manufacturer", leaf->description.manufacturerName);
            plugin->setAttribute("fileOrIdentifier", leaf->description.fileOrIdentifier);
            auto* state = slot->createNewChildElement("State");
            state->addTextElement(const_cast<PluginChainManagerProcessor&>(processor).getChainProcessor().getSlotPresetData(index++));
        }
    }
    else if (auto chain = const_cast<PluginChainManagerProcessor&>(processor).getChainProcessor().serializeChainToXml())
        root.addChildElement(chain.release());

    if (auto wrapper = processor.captureWrapperState(); wrapper && !legacy)
    {
        if (wrapperGain.isNotEmpty()) wrapper->setAttribute("outputGainDb", wrapperGain);
        root.addChildElement(wrapper.release());
    }

    auto file = juce::File::createTempFile("prochain-wrapper-test");
    REQUIRE(root.writeTo(file));
    return file;
}

bool pumpUntil(const std::function<bool()>& predicate, int timeoutMs = 1000)
{
    const auto deadline = juce::Time::getMillisecondCounter() + static_cast<juce::uint32>(timeoutMs);
    while (!predicate() && juce::Time::getMillisecondCounter() < deadline)
        CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.005, true);
    return predicate();
}
}

TEST_CASE("Actual wrapper host state restores DSP gains and fixed automation identity", "[wrapper][state]")
{
    WrapperFixture source; source.add(); auto& processor = source.processor;
    processor.getGainProcessor().setInputGain(-4); processor.getGainProcessor().setOutputGain(3);
    processor.setGainMatchTargetDB(-6); processor.setGainMatchEnabled(true);
    const auto id = processor.getChainProcessor().getFlatPluginList().front()->persistentId;
    REQUIRE(processor.getParameterPool().assignBinding(1900, id, "gain", 0));
    processor.getParameterPool().rebindAll(processor.getChainProcessor());
    juce::MemoryBlock state; processor.getStateInformation(state);
    WrapperFixture restored; restored.processor.setStateInformation(state.getData(), static_cast<int>(state.getSize()));
    auto& result = restored.processor;
    REQUIRE(result.getChainProcessor().getNumSlots() == 1);
    REQUIRE(result.getGainProcessor().getInputGainDB() == Catch::Approx(-4));
    REQUIRE(result.getGainProcessor().getOutputGainDB() == Catch::Approx(3));
    REQUIRE(result.isGainMatchEnabled()); REQUIRE(result.getGainMatchTargetDB() == Catch::Approx(-6));
    REQUIRE(result.getParameterPool().bindings().getBinding(1900).pluginPersistentId == id);
    result.getParameterPool().getProxy(1900)->setValue(0.75f);
    REQUIRE(dynamic_cast<SyntheticPlugin*>(result.getChainProcessor().getSlotProcessor(0))->gain->get() == Catch::Approx(3));
    // 2048 automation proxies first, then the macro knobs, so proxy indices never move
    REQUIRE(result.getParameters().size() == 2048 + MacroManager::kNumMacros);
    REQUIRE(dynamic_cast<juce::AudioProcessorParameterWithID*>(result.getParameters()[2048])->getParameterID() == "macro1");
    REQUIRE(dynamic_cast<juce::AudioProcessorParameterWithID*>(result.getParameters()[1900])->getParameterID()
            == dynamic_cast<juce::AudioProcessorParameterWithID*>(processor.getParameters()[1900])->getParameterID());
}

TEST_CASE("A failed host restore preserves sound controls and requested payload on subsequent saves", "[wrapper][state]")
{
    WrapperFixture f; f.add(); auto& p = f.processor;
    auto* original = p.getChainProcessor().getSlotProcessor(0);
    p.getGainProcessor().setOutputGain(3);
    const auto pluginId = p.getChainProcessor().getFlatPluginList().front()->persistentId;
    p.getParameterPool().assignBinding(100, pluginId, "gain", 0);
    auto requested = p.captureWrapperState(); requested->setAttribute("outputGainDb", -20.0);
    requested->setAttribute("gainMatchEnabled", true);
    requested->getChildByName("ChainTree")->getChildByName("Node")->getChildByName("PLUGIN")->setAttribute("name", "missing");
    juce::MemoryBlock state; juce::AudioProcessor::copyXmlToBinary(*requested, state);
    p.setStateInformation(state.getData(), static_cast<int>(state.getSize()));
    REQUIRE(p.getChainProcessor().getSlotProcessor(0) == original);
    REQUIRE(p.getGainProcessor().getOutputGainDB() == Catch::Approx(3)); REQUIRE_FALSE(p.isGainMatchEnabled());
    REQUIRE(p.getParameterPool().bindings().getBinding(100).pluginPersistentId == pluginId);
    auto saved = p.captureWrapperState(); REQUIRE(saved->getStringAttribute("pendingRequestedState").contains("missing"));
    REQUIRE(f.render(0.25f, 120).getSample(0, 63) == Catch::Approx(0.5f * juce::Decibels::decibelsToGain(3.0f)).margin(0.0001));
    juce::MemoryBlock savedData; p.getStateInformation(savedData);
    WrapperFixture reload; reload.processor.setStateInformation(savedData.getData(), static_cast<int>(savedData.getSize()));
    REQUIRE(reload.processor.captureWrapperState()->getStringAttribute("pendingRequestedState").contains("missing"));
}

TEST_CASE("Musical presets cannot repurpose an occupied host automation lane", "[wrapper][automation]")
{
    WrapperFixture f; f.add(); auto& p = f.processor;
    const auto id = p.getChainProcessor().getFlatPluginList().front()->persistentId;
    p.getParameterPool().assignBinding(4, id, "gain", 0);
    auto preset = p.captureWrapperState(); AutomationBindingManager other; other.beginNewSession();
    other.assign(4, "another-plugin", "other", 0); other.assign(5, "another-plugin", "other", 0);
    preset->removeChildElement(preset->getChildByName("AUTOMATION_BINDINGS"), true);
    preset->addChildElement(new juce::XmlElement(other.toXml()));
    REQUIRE(p.applyWrapperSettings(*preset, false));
    REQUIRE(p.getParameterPool().bindings().getBinding(4).pluginPersistentId == id);
    REQUIRE(p.getParameterPool().bindings().getBinding(5).pluginPersistentId == "another-plugin");
}

TEST_CASE("Legacy host state migrates its saved slot ordering once", "[wrapper][automation]")
{
    WrapperFixture source; source.add("unity"); source.add("other");
    juce::MemoryBlock legacy; source.processor.getChainProcessor().getStateInformation(legacy);
    WrapperFixture restored; auto& p = restored.processor;
    p.setStateInformation(legacy.getData(), static_cast<int>(legacy.getSize()));
    const auto id = p.getParameterPool().bindings().getBinding(0).pluginPersistentId;
    REQUIRE(id == p.getChainProcessor().getFlatPluginList()[0]->persistentId);
    const auto rootId = p.getChainProcessor().getRootNode().getGroup().children[0]->id;
    REQUIRE(p.getChainProcessor().moveNode(rootId, 0, 2));
    REQUIRE(p.getParameterPool().bindings().getBinding(0).pluginPersistentId == id);
}

TEST_CASE("Editor closed gain matching follows input and preserves manual output gain", "[wrapper][gain-match]")
{
    WrapperFixture f; f.add(); auto& p = f.processor;
    REQUIRE_FALSE(p.getFFTProcessor().isAnalysisEnabled());
    p.setGainMatchEnabled(true);
    REQUIRE(f.render(0.25f, 120).getSample(0, 63) == Catch::Approx(0.25f).margin(0.001));
    REQUIRE(p.getGainMatchTargetDB() == Catch::Approx(-6.0206f).margin(0.001));
    p.getGainProcessor().setOutputGain(6.0206f);
    REQUIRE(f.render(0.25f, 120).getSample(0, 63) == Catch::Approx(0.5f).margin(0.001));
    REQUIRE(p.getOutputMeter().getReadings().peakL == Catch::Approx(0.5f).margin(0.001));
    f.render(0, 120); REQUIRE(p.getGainMatchTargetDB() == Catch::Approx(-6.0206f).margin(0.001));
    p.setGainMatchEnabled(false);
    REQUIRE(f.render(0.25f, 120).getSample(0, 63) == Catch::Approx(1.0f).margin(0.001));
}

TEST_CASE("Preset manager asynchronously restores V1 and V2 files", "[wrapper][preset]")
{
    WrapperFixture f; f.add("gain2");
    *dynamic_cast<SyntheticPlugin*>(f.processor.getChainProcessor().getSlotProcessor(0))->gain = 1.5f;
    auto v2 = writePreset(f.processor, "v2");
    auto v1 = writePreset(f.processor, "v1", true);
    auto& manager = f.processor.getPresetManager();

    int completions = 0;
    ChainProcessor::RestoreResult v2Result, v1Result;
    manager.loadPresetAsync(v2, false, [&](auto result) { v2Result = result; ++completions; });
    REQUIRE(pumpUntil([&] { return completions == 1; }));
    REQUIRE(v2Result.success);
    REQUIRE(v2Result.status == "committed");

    manager.loadPresetAsync(v1, false, [&](auto result) { v1Result = result; ++completions; });
    REQUIRE(pumpUntil([&] { return completions == 2; }));
    REQUIRE(v1Result.success);
    REQUIRE(v1Result.status == "committed");
    REQUIRE(f.render(0.25f, 20).getSample(0, 63) == Catch::Approx(0.375f).margin(1e-5));
    REQUIRE(manager.getCurrentPreset() != nullptr);

    v2.deleteFile(); v1.deleteFile();
}

TEST_CASE("Preset manager rejects malformed or invalid files without changing the audible chain", "[wrapper][preset]")
{
    WrapperFixture f; f.add("gain2");
    auto& manager = f.processor.getPresetManager();
    auto* original = f.processor.getChainProcessor().getSlotProcessor(0);

    auto malformed = juce::File::createTempFile("prochain-malformed");
    REQUIRE(malformed.replaceWithText("<NotAPreset/>"));
    auto invalid = writePreset(f.processor, "invalid", false, "nan");
    int completions = 0;
    ChainProcessor::RestoreResult malformedResult, invalidResult;
    manager.loadPresetAsync(malformed, false, [&](auto result) { malformedResult = result; ++completions; });
    REQUIRE(pumpUntil([&] { return completions == 1; }));
    manager.loadPresetAsync(invalid, false, [&](auto result) { invalidResult = result; ++completions; });
    REQUIRE(pumpUntil([&] { return completions == 2; }));

    REQUIRE_FALSE(malformedResult.success);
    REQUIRE_FALSE(invalidResult.success);
    REQUIRE(f.processor.getChainProcessor().getSlotProcessor(0) == original);
    REQUIRE(f.processor.getChainProcessor().getNumSlots() == 1);
    malformed.deleteFile(); invalid.deleteFile();
}

TEST_CASE("Preset manager marks an older queued request superseded", "[wrapper][preset]")
{
    WrapperFixture f; f.add("unity");
    auto missing = juce::File::createTempFile("prochain-missing");
    missing.deleteFile();
    auto current = writePreset(f.processor, "current");
    auto& manager = f.processor.getPresetManager();
    int completions = 0;
    ChainProcessor::RestoreResult oldResult, currentResult;
    manager.loadPresetAsync(missing, false, [&](auto result) { oldResult = result; ++completions; });
    manager.loadPresetAsync(current, false, [&](auto result) { currentResult = result; ++completions; });
    REQUIRE(pumpUntil([&] { return completions == 2; }));
    REQUIRE(oldResult.status == "superseded");
    REQUIRE(currentResult.success);
    current.deleteFile();
}

TEST_CASE("Preset manager can be destroyed while a file load is pending", "[wrapper][preset]")
{
    WrapperFixture f; f.add("unity");
    auto file = writePreset(f.processor, "destroyed");
    int callbacks = 0;
    {
        auto manager = std::make_unique<PresetManager>(f.processor.getChainProcessor());
        manager->loadPresetAsync(file, false, [&](auto) { ++callbacks; });
    }
    pumpUntil([&] { return false; }, 100);
    REQUIRE(callbacks == 0);
    file.deleteFile();
}

TEST_CASE("Closing and reopening the bridge restores owner callbacks and stops analysis", "[wrapper][bridge][lifecycle]")
{
    WrapperFixture f;
    auto& p = f.processor;
    int chainChanges = 0, presetChanges = 0, scans = 0;
    p.getChainProcessor().onChainChanged = [&] { ++chainChanges; };
    p.getPresetManager().onPresetListChanged = [&] { ++presetChanges; };
    p.getPluginManager().onScanComplete = [&] { ++scans; };
    for (int cycle = 0; cycle < 20; ++cycle)
    {
        std::function<void()> pendingChain, pendingPreset, pendingScan;
        {
            WebViewBridge bridge(p.getPluginManager(), p.getChainProcessor(), p.getPresetManager());
            bridge.setOwnerProcessor(&p); p.setAnalysisSubscriptions(true, true);
            pendingChain = p.getChainProcessor().onChainChanged;
            pendingPreset = p.getPresetManager().onPresetListChanged;
            pendingScan = p.getPluginManager().onScanComplete;
        }
        pendingChain(); pendingPreset(); pendingScan();
        REQUIRE(chainChanges == cycle); REQUIRE(presetChanges == cycle); REQUIRE(scans == cycle);
        p.getChainProcessor().onChainChanged(); p.getPresetManager().onPresetListChanged(); p.getPluginManager().onScanComplete();
        REQUIRE_FALSE(p.getFFTProcessor().isAnalysisEnabled());
    }
    REQUIRE(chainChanges == 20); REQUIRE(presetChanges == 20); REQUIRE(scans == 20);
}

TEST_CASE("Session state includes mirror membership but musical presets do not", "[wrapper][state]")
{
    WrapperFixture a, b;
    const int group = a.processor.getMirrorManager().startMirror(b.processor.getInstanceId());
    REQUIRE(group > 0);
    juce::MemoryBlock state; a.processor.getStateInformation(state);
    auto xml = juce::AudioProcessor::getXmlFromBinary(state.getData(), static_cast<int>(state.getSize()));
    REQUIRE(xml->getChildByName("MirrorGroup") != nullptr);
    REQUIRE(xml->getChildByName("MirrorGroup")->getIntAttribute("id") == group);
    REQUIRE(a.processor.captureWrapperState()->getChildByName("MirrorGroup") == nullptr);
}

TEST_CASE("Wrapper runs on mono and mono-to-stereo tracks", "[wrapper][layout]")
{
    WrapperFixture f; f.add("gain2");
    using Set = juce::AudioChannelSet;
    auto layout = [](Set in, Set out) { juce::AudioProcessor::BusesLayout l; l.inputBuses.add(in, Set::disabled()); l.outputBuses.add(out); return l; };
    REQUIRE(f.processor.checkBusesLayoutSupported(layout(Set::mono(), Set::mono())));
    REQUIRE(f.processor.checkBusesLayoutSupported(layout(Set::mono(), Set::stereo())));
    REQUIRE(f.processor.checkBusesLayoutSupported(layout(Set::stereo(), Set::mono())));
    REQUIRE_FALSE(f.processor.checkBusesLayoutSupported(layout(Set::create5point1(), Set::create5point1())));

    juce::MidiBuffer midi;
    SECTION("mono")
    {
        REQUIRE(f.processor.setBusesLayout(layout(Set::mono(), Set::mono())));
        f.processor.prepareToPlay(48000, 64);
        juce::AudioBuffer<float> audio(1, 64);
        juce::FloatVectorOperations::fill(audio.getWritePointer(0), 0.25f, 64);
        f.processor.processBlock(audio, midi);
        REQUIRE(audio.getSample(0, 63) == Catch::Approx(0.5f).margin(1e-4));
    }
    SECTION("mono to stereo")
    {
        REQUIRE(f.processor.setBusesLayout(layout(Set::mono(), Set::stereo())));
        f.processor.prepareToPlay(48000, 64);
        juce::AudioBuffer<float> audio(2, 64);
        juce::FloatVectorOperations::fill(audio.getWritePointer(0), 0.25f, 64);
        juce::FloatVectorOperations::fill(audio.getWritePointer(1), 9.0f, 64); // junk the host left behind
        f.processor.processBlock(audio, midi);
        REQUIRE(audio.getSample(0, 63) == Catch::Approx(0.5f).margin(1e-4));
        REQUIRE(audio.getSample(1, 63) == Catch::Approx(0.5f).margin(1e-4));
    }
}

TEST_CASE("Wrapper passes its sidechain input to plugins keyed from it", "[wrapper][layout][sidechain]")
{
    WrapperFixture f; f.add("key");
    using Set = juce::AudioChannelSet;
    auto& chain = f.processor.getChainProcessor();
    const auto id = chain.getRootNode().getGroup().children.back()->id;
    REQUIRE(chain.setNodeSidechain(id, true));

    juce::AudioProcessor::BusesLayout layout;
    layout.inputBuses.add(Set::mono(), Set::mono()); layout.outputBuses.add(Set::stereo());
    REQUIRE(f.processor.setBusesLayout(layout));
    f.processor.prepareToPlay(48000, 64);

    // Channel 0 is the track, channel 1 the sidechain
    juce::AudioBuffer<float> audio(2, 64); juce::MidiBuffer midi;
    juce::FloatVectorOperations::fill(audio.getWritePointer(0), 0.25f, 64);
    juce::FloatVectorOperations::fill(audio.getWritePointer(1), 0.75f, 64);
    f.processor.processBlock(audio, midi);
    REQUIRE(audio.getSample(0, 63) == Catch::Approx(0.75f).margin(1e-4));
    REQUIRE(audio.getSample(1, 63) == Catch::Approx(0.75f).margin(1e-4));
}
