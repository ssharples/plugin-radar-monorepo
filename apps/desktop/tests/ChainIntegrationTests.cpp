#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include "core/ChainProcessor.h"
#include "SyntheticPlugin.h"
#include <thread>
#include <CoreFoundation/CoreFoundation.h>
#include <atomic>
#include <optional>
#include <cmath>

namespace {
struct ChainFixture
{
    juce::ScopedJuceInitialiser_GUI gui;
    SyntheticFactory factory;
    PluginManager manager { [this](auto& d, auto rate, auto block, auto& error) { return factory(d, rate, block, error); } };
    ChainProcessor chain { manager };
    ChainFixture() { chain.setPlayConfigDetails(2, 2, 48000, 512); chain.prepareToPlay(48000, 512); }
    int add(const juce::String& name, int latency = 0)
    {
        REQUIRE(chain.addPlugin(syntheticDescription(name, latency)));
        return chain.getRootNode().getGroup().children.back()->id;
    }
    juce::AudioBuffer<float> render(float value = 0.0f, bool impulse = false)
    {
        juce::AudioBuffer<float> b(2, 2048);
        for (int c = 0; c < 2; ++c) juce::FloatVectorOperations::fill(b.getWritePointer(c), value, b.getNumSamples());
        if (impulse) { b.setSample(0, 0, 1.0f); b.setSample(1, 0, 1.0f); }
        juce::MidiBuffer midi; chain.processBlock(b, midi); return b;
    }
};

bool pumpUntil(const std::function<bool()>& predicate, int timeoutMs = 1000)
{
    const auto deadline = juce::Time::getMillisecondCounter() + static_cast<juce::uint32>(timeoutMs);
    while (!predicate() && juce::Time::getMillisecondCounter() < deadline)
        CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.005, true);
    return predicate();
}

class TestPlayHead final : public juce::AudioPlayHead
{
public:
    juce::Optional<PositionInfo> getPosition() const override
    {
        PositionInfo position;
        position.setBpm(123.0);
        position.setTimeInSamples(0);
        return position;
    }
};
}

TEST_CASE("Parallel unequal-latency branches retain both signals", "[chain][regression]")
{
    ChainFixture f;
    auto a = f.add("short"); auto b = f.add("long", 64);
    f.chain.createGroup({a, b}, GroupMode::Parallel, "parallel");
    auto out = f.render(0, true);
    REQUIRE(out.getSample(0, 64) == Catch::Approx(1.0f).margin(1e-5));
    REQUIRE(out.getMagnitude(0, 64) == Catch::Approx(0).margin(1e-5));
    REQUIRE(f.chain.getTotalLatencySamples() == 64);
}

TEST_CASE("First group dry wet edit immediately affects audio", "[chain][regression]")
{
    ChainFixture f; auto a = f.add("gain2");
    auto group = f.chain.createGroup({a}, GroupMode::Serial, "mix");
    REQUIRE(f.chain.setGroupDryWet(group, 0.0f));
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(1).margin(1e-4));
    REQUIRE(f.chain.setGroupDryWet(group, 0.5f));
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(1.5).margin(1e-4));
}

TEST_CASE("Group branch settings survive a real processor restore", "[chain][state]")
{
    ChainFixture f; auto a = f.add("unity");
    auto group = f.chain.createGroup({a}, GroupMode::Serial, "inner");
    auto b = f.add("other"); f.chain.createGroup({group, b}, GroupMode::Parallel, "outer");
    f.chain.setBranchGain(group, -6); f.chain.setBranchMute(group, true);
    auto state = f.chain.serializeChainToXml();
    REQUIRE(f.chain.restoreChainFromXml(*state).success);
    auto* restored = ChainNodeHelpers::findById(f.chain.getRootNode(), group);
    REQUIRE(restored != nullptr);
    REQUIRE(restored->branchGainDb == Catch::Approx(-6));
    REQUIRE(restored->mute);
}

TEST_CASE("Unavailable preset preserves the active plugin instance", "[chain][state]")
{
    ChainFixture f; auto a = f.add("gain2");
    auto* original = f.chain.getNodeProcessor(a);
    auto state = f.chain.serializeChainToXml();
    auto* pluginXml = state->getChildByName("Node")->getChildByName("PLUGIN");
    pluginXml->setAttribute("name", "missing");
    REQUIRE_FALSE(f.chain.restoreChainFromXml(*state).success);
    REQUIRE(f.chain.getNodeProcessor(a) == original);
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(2));
}

TEST_CASE("Parallel audio groups pass incoming MIDI once", "[chain][midi]")
{
    ChainFixture f; auto a = f.add("note60"); auto b = f.add("note72");
    f.chain.createGroup({a, b}, GroupMode::Parallel, "parallel");
    juce::AudioBuffer<float> audio(2, 64); audio.clear();
    juce::MidiBuffer midi; midi.addEvent(juce::MidiMessage::noteOn(1, 48, (juce::uint8)100), 7);
    f.chain.processBlock(audio, midi);
    REQUIRE(midi.getNumEvents() == 1);
    REQUIRE((*midi.begin()).samplePosition == 7);
    REQUIRE((*midi.begin()).getMessage().getNoteNumber() == 48);
}

TEST_CASE("Bypass keeps DSP and Suspend stops it without changing latency", "[chain][lifecycle]")
{
    ChainFixture f; const auto id = f.add("gain2", 64);
    f.render(1);
    const auto revision = f.chain.getRenderRevision();
    const auto before = f.factory.stats["gain2"]->calls;
    f.chain.setNodeBypassed(id, true);
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(1).margin(1e-5));
    REQUIRE(f.factory.stats["gain2"]->calls > before);
    REQUIRE(f.chain.getTotalLatencySamples() == 64);
    REQUIRE(f.chain.setNodeSuspended(id, true));
    f.render(1); const auto suspendedCalls = f.factory.stats["gain2"]->calls;
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(1).margin(1e-5));
    REQUIRE(f.factory.stats["gain2"]->calls == suspendedCalls);
    REQUIRE(f.chain.getRenderRevision() == revision);
    REQUIRE(f.chain.setNodeSuspended(id, false)); f.chain.setNodeBypassed(id, false);
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(2).margin(1e-5));
    REQUIRE(f.factory.stats["gain2"]->calls > suspendedCalls);
}

TEST_CASE("Parallel runtime controls preserve topology and compensation", "[chain][routing]")
{
    ChainFixture f; const auto a = f.add("gain2"), b = f.add("unity", 96);
    auto group = f.chain.createGroup({a, b}, GroupMode::Parallel, "parallel");
    f.render(1); const auto revision = f.chain.getRenderRevision();
    REQUIRE(f.chain.setBranchMute(b, true));
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(2).margin(1e-5));
    REQUIRE(f.chain.getTotalLatencySamples() == 96);
    REQUIRE(f.chain.setBranchSolo(b, true)); // Solo takes precedence over mute, as before.
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(1).margin(1e-5));
    REQUIRE(f.chain.setGroupDryWet(group, 0));
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(1).margin(1e-5));
    REQUIRE(f.chain.getRenderRevision() == revision);
}

TEST_CASE("Serial dry wet and nested parallel paths align impulses", "[chain][routing]")
{
    ChainFixture f; auto a = f.add("first", 32); auto b = f.add("second", 96);
    auto inner = f.chain.createGroup({a, b}, GroupMode::Parallel, "inner");
    auto c = f.add("third", 16); auto outer = f.chain.createGroup({inner, c}, GroupMode::Serial, "outer");
    f.chain.setGroupDryWet(outer, 0.5f);
    auto output = f.render(0, true);
    REQUIRE(f.chain.getTotalLatencySamples() == 112);
    REQUIRE(output.getSample(0, 112) == Catch::Approx(1).margin(1e-5));
    REQUIRE(output.getMagnitude(0, 112) == Catch::Approx(0).margin(1e-5));
}

TEST_CASE("Partial restore retains missing effect identity and opaque state", "[chain][state]")
{
    ChainFixture f; auto id = f.add("gain2");
    auto xml = f.chain.serializeChainToXml(); auto* node = xml->getChildByName("Node");
    auto savedId = node->getStringAttribute("persistentId"); auto state = node->getStringAttribute("state");
    node->getChildByName("PLUGIN")->setAttribute("name", "missing");
    const auto result = f.chain.restoreChainFromXml(*xml, true);
    REQUIRE(result.success); REQUIRE(result.status == "partial"); REQUIRE(result.issues.size() == 1);
    REQUIRE(f.chain.getNodeProcessor(id) == nullptr);
    auto restored = f.chain.serializeChainToXml()->getChildByName("Node")->toString();
    REQUIRE(restored.contains(savedId)); REQUIRE(restored.contains(state));
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(1));
}

TEST_CASE("Invalid state and identity never replace current instances", "[chain][state]")
{
    ChainFixture f; auto id = f.add("unity"); auto* original = f.chain.getNodeProcessor(id);
    auto xml = f.chain.serializeChainToXml();
    SECTION("Malformed effect state") { xml->getChildByName("Node")->setAttribute("state", "this is not encoded state"); }
    SECTION("Repeated node identity") { xml->addChildElement(new juce::XmlElement(*xml->getChildByName("Node"))); }
    REQUIRE_FALSE(f.chain.restoreChainFromXml(*xml).success);
    REQUIRE(f.chain.getNodeProcessor(id) == original);
}

TEST_CASE("Individual effect state import reuses every unaffected instance", "[chain][state]")
{
    ChainFixture f; auto a = f.add("unity"), b = f.add("other");
    auto* originalA = f.chain.getNodeProcessor(a); auto* originalB = f.chain.getNodeProcessor(b);
    const auto persistentId = f.chain.getFlatPluginList().front()->persistentId;
    float value = 2.0f; juce::MemoryBlock state(&value, sizeof(value));
    REQUIRE(f.chain.setSlotPresetData(0, state.toBase64Encoding()));
    REQUIRE(f.chain.getNodeProcessor(a) != originalA);
    REQUIRE(f.chain.getNodeProcessor(b) == originalB);
    REQUIRE(f.chain.getFlatPluginList().front()->persistentId == persistentId);
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(2));
}

TEST_CASE("Async replacement failure preserves the original instance and audio", "[chain][transaction]")
{
    ChainFixture f; const auto id = f.add("gain2");
    auto* original = f.chain.getNodeProcessor(id);
    const auto before = f.render(1).getSample(0, 2047);
    bool completed = false; ChainProcessor::RestoreResult result;
    f.chain.replaceNodeAsync(id, syntheticDescription("missing"), juce::Array<juce::var>{},
                             [&](auto restore) { result = restore; completed = true; });
    REQUIRE(pumpUntil([&] { return completed; }));
    REQUIRE_FALSE(result.success);
    REQUIRE(f.chain.getNodeProcessor(id) == original);
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(before).margin(1e-5));
}

TEST_CASE("Async replacement preserves grouped position and unaffected instances", "[chain][transaction]")
{
    ChainFixture f; const auto first = f.add("unity"), second = f.add("other");
    const auto group = f.chain.createGroup({first, second}, GroupMode::Serial, "group");
    auto* unaffected = f.chain.getNodeProcessor(second);
    juce::Array<juce::var> translated;
    auto* param = new juce::DynamicObject(); param->setProperty("paramIndex", 0); param->setProperty("value", 0.75); translated.add(juce::var(param));
    bool completed = false; ChainProcessor::RestoreResult result;
    f.chain.replaceNodeAsync(first, syntheticDescription("gain2"), translated,
                             [&](auto restore) { result = restore; completed = true; });
    REQUIRE(pumpUntil([&] { return completed; }));
    REQUIRE(result.success); REQUIRE(result.status == "committed");
    const auto* groupNode = ChainNodeHelpers::findById(f.chain.getRootNode(), group);
    REQUIRE(groupNode != nullptr); REQUIRE(groupNode->getGroup().children.size() == 2);
    REQUIRE(groupNode->getGroup().children[0]->id == first);
    REQUIRE(groupNode->getGroup().children[1]->id == second);
    REQUIRE(f.chain.getNodeProcessor(second) == unaffected);
    REQUIRE(dynamic_cast<SyntheticPlugin*>(f.chain.getNodeProcessor(first))->gain->get() == Catch::Approx(3.0f));
    REQUIRE(f.chain.getFlatPluginList()[0]->persistentId != f.chain.getFlatPluginList()[1]->persistentId);
}

TEST_CASE("Async slot preset replacement reuses other instances", "[chain][transaction]")
{
    ChainFixture f; const auto first = f.add("unity"), second = f.add("other");
    auto* originalSecond = f.chain.getNodeProcessor(second);
    float gain = 3.0f; juce::MemoryBlock state(&gain, sizeof(gain));
    bool completed = false; ChainProcessor::RestoreResult result;
    f.chain.requestSlotPresetData(0, state.toBase64Encoding(), [&](auto restore) { result = restore; completed = true; });
    REQUIRE(pumpUntil([&] { return completed; }));
    REQUIRE(result.success); REQUIRE(f.chain.getNodeProcessor(second) == originalSecond);
    REQUIRE(dynamic_cast<SyntheticPlugin*>(f.chain.getNodeProcessor(first))->gain->get() == Catch::Approx(3.0f));
}

TEST_CASE("Async duplication keeps the source and copies its state", "[chain][transaction]")
{
    ChainFixture f; const auto sourceId = f.add("gain2");
    auto group = f.chain.createGroup({sourceId}, GroupMode::Serial, "group");
    auto* original = f.chain.getNodeProcessor(sourceId);
    bool completed = false; ChainProcessor::RestoreResult result;
    f.chain.duplicateNodeAsync(sourceId, [&](auto restore) { result = restore; completed = true; });
    REQUIRE(pumpUntil([&] { return completed; }));
    REQUIRE(result.success);
    const auto* groupNode = ChainNodeHelpers::findById(f.chain.getRootNode(), group);
    REQUIRE(groupNode != nullptr); REQUIRE(groupNode->getGroup().children.size() == 2);
    const auto copiedId = groupNode->getGroup().children[1]->id;
    REQUIRE(f.chain.getNodeProcessor(sourceId) == original);
    REQUIRE(copiedId != sourceId);
    REQUIRE(f.chain.getFlatPluginList()[0]->persistentId != f.chain.getFlatPluginList()[1]->persistentId);
    REQUIRE(dynamic_cast<SyntheticPlugin*>(f.chain.getNodeProcessor(copiedId))->gain->get() == Catch::Approx(2.0f));
}

TEST_CASE("Hosted effects receive playhead, offline, reset, tail and latency changes", "[chain][host]")
{
    ChainFixture f; const auto id = f.add("tail");
    TestPlayHead playHead; f.chain.setPlayHead(&playHead);
    f.chain.setNonRealtime(true); f.render(1);
    auto stats = f.factory.stats["tail"];
    REQUIRE(stats->sawPlayhead); REQUIRE(stats->offline); REQUIRE(stats->lastBpm == Catch::Approx(123.0));
    const auto resetsBefore = stats->resets; f.chain.reset(); f.render(1);
    REQUIRE(stats->resets > resetsBefore); REQUIRE(f.chain.getTailLengthSeconds() == Catch::Approx(2.0));
    auto* plugin = dynamic_cast<SyntheticPlugin*>(f.chain.getNodeProcessor(id));
    REQUIRE(plugin != nullptr); plugin->setLatencySamples(32);
    REQUIRE(pumpUntil([&] { return f.chain.getTotalLatencySamples() == 32; }, 250));
}

TEST_CASE("Queued factory requests keep only the latest candidate", "[chain][transaction]")
{
    juce::ScopedJuceInitialiser_GUI gui; SyntheticFactory factory;
    struct Pending { juce::PluginDescription desc; PluginManager::CreationCallback callback; };
    std::vector<Pending> pending;
    PluginManager manager(
        [&](auto& desc, auto rate, auto block, auto& error) { return factory(desc, rate, block, error); },
        [&](const auto& desc, auto, auto, auto callback) { pending.push_back({desc, std::move(callback)}); });
    ChainProcessor chain(manager); chain.setPlayConfigDetails(2, 2, 48000, 512); chain.prepareToPlay(48000, 512);
    REQUIRE(chain.addPlugin(syntheticDescription("unity")));
    auto* original = chain.getSlotProcessor(0);
    auto xml = chain.serializeChainToXml();
    std::vector<ChainProcessor::RestoreResult> results;
    auto request = [&](const char* name) {
        xml->getChildByName("Node")->getChildByName("PLUGIN")->setAttribute("name", name);
        return chain.requestRestore(*xml, false, [&](auto result) { results.push_back(result); });
    };
    const auto first = request("first"), middle = request("middle"), last = request("gain2");
    REQUIRE(pending.size() == 1); REQUIRE(results.size() == 1);
    REQUIRE(results.front().requestId == middle); REQUIRE(results.front().status == "superseded");
    REQUIRE(chain.getSlotProcessor(0) == original);
    auto finish = [&] {
        auto current = std::move(pending.front()); pending.erase(pending.begin()); juce::String error;
        auto instance = factory(current.desc, 48000, 512, error); current.callback(std::move(instance), error);
    };
    finish(); REQUIRE(pending.size() == 1); REQUIRE(pending.front().desc.name == "gain2");
    REQUIRE(results.back().requestId == first); REQUIRE(results.back().status == "superseded");
    REQUIRE(chain.getSlotProcessor(0) == original);
    finish(); REQUIRE(pending.empty()); REQUIRE(results.back().requestId == last);
    REQUIRE(results.back().status == "committed"); REQUIRE(chain.getSlotProcessor(0)->getName() == "gain2");
    REQUIRE(factory.stats["first"]->calls == 0); REQUIRE(factory.stats["first"]->destroyed == 1);
}

TEST_CASE("An active graph handoff completes its fade without a UI timer", "[chain][transaction]")
{
    ChainFixture f; f.add("unity"); f.render(1);
    auto xml = f.chain.serializeChainToXml();
    float gain = 2.0f; juce::MemoryBlock state(&gain, sizeof(gain));
    xml->getChildByName("Node")->setAttribute("state", state.toBase64Encoding());
    bool completed = false;
    f.chain.requestRestore(*xml, false, [&](auto result) { completed = result.success; });
    REQUIRE_FALSE(completed);
    auto output = f.render(1); // includes both 5 ms fades, with no message pumping
    REQUIRE(output.getSample(0, 2047) == Catch::Approx(2).margin(1e-5));
    REQUIRE_FALSE(completed); // completion remains a control-thread notification
    juce::Thread::sleep(20);
    juce::Timer::callPendingTimersSynchronously();
    REQUIRE(completed);
}

TEST_CASE("Graph edits retire instances after the concurrent audio reader", "[chain][stress]")
{
    ChainFixture f; f.add("first");
    std::atomic<bool> stop {false}, invalid {false}; std::atomic<int> calls {0};
    std::thread audio([&] {
        juce::AudioBuffer<float> buffer(2, 64); juce::MidiBuffer midi;
        while (!stop.load())
        {
            for (int c = 0; c < 2; ++c) juce::FloatVectorOperations::fill(buffer.getWritePointer(c), 0.1f, 64);
            f.chain.processBlock(buffer, midi);
            if (!std::isfinite(buffer.getSample(0, 63))) invalid.store(true);
            calls.fetch_add(1);
        }
    });
    while (calls.load() < 10) std::this_thread::yield();
    for (int i = 0; i < 50; ++i)
    {
        f.chain.addPlugin(syntheticDescription("stress-" + juce::String(i)));
        const auto id = f.chain.getRootNode().getGroup().children.front()->id;
        f.chain.removeNode(id);
    }
    stop.store(true); audio.join();
    REQUIRE_FALSE(invalid.load()); REQUIRE(calls.load() > 10);
    REQUIRE(f.chain.getNumSlots() == 1);
}

TEST_CASE("Branch phase invert cancels an identical branch and survives restore", "[chain][routing]")
{
    ChainFixture f; const auto a = f.add("unity"), b = f.add("unity");
    f.chain.createGroup({a, b}, GroupMode::Parallel, "parallel");
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(1).margin(1e-5));
    const auto revision = f.chain.getRenderRevision();
    REQUIRE(f.chain.setBranchPolarity(b, true));
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(0).margin(1e-5));
    REQUIRE(f.chain.getRenderRevision() == revision); // no graph rebuild
    auto state = f.chain.serializeChainToXml();
    REQUIRE(f.chain.restoreChainFromXml(*state).success);
    REQUIRE(ChainNodeHelpers::findById(f.chain.getRootNode(), b)->polarityInverted);
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(0).margin(1e-5));
}

TEST_CASE("A plugin keyed from the sidechain hears the sidechain input", "[chain][sidechain]")
{
    ChainFixture f; const auto key = f.add("key"); const auto plain = f.add("unity");
    REQUIRE_FALSE(f.chain.setNodeSidechain(plain, true)); // no sidechain bus
    // Off: the plugin's sidechain hears its own input
    REQUIRE(f.render(0.5f).getSample(0, 2047) == Catch::Approx(0.5f));

    REQUIRE(f.chain.setNodeSidechain(key, true));
    std::vector<float> left(2048), right(2048);
    for (int i = 0; i < 2048; ++i) { left[(size_t) i] = 0.001f * static_cast<float>(i % 512 == 0 ? 0 : i); right[(size_t) i] = 0.2f; }
    f.chain.setSidechainInput(left.data(), right.data(), 2048);
    auto out = f.render(0.5f);
    REQUIRE(out.getSample(0, 1500) == Catch::Approx(1.5f)); // the right sample in each chunk
    REQUIRE(out.getSample(1, 2047) == Catch::Approx(0.2f));
    // Without a host sidechain this block, it falls back to its own input
    REQUIRE(f.render(0.5f).getSample(0, 2047) == Catch::Approx(0.5f));

    auto state = f.chain.serializeChainToXml();
    REQUIRE(f.chain.restoreChainFromXml(*state).success);
    REQUIRE(ChainNodeHelpers::findById(f.chain.getRootNode(), key)->getPlugin().sidechain);
}

TEST_CASE("Ignore latency removes a slot from delay compensation", "[chain][latency]")
{
    ChainFixture f; const auto id = f.add("unity", 64);
    REQUIRE(f.chain.getTotalLatencySamples() == 64);
    REQUIRE(f.chain.setNodeIgnoreLatency(id, true));
    REQUIRE(f.chain.getTotalLatencySamples() == 0);
    auto state = f.chain.serializeChainToXml();
    REQUIRE(f.chain.restoreChainFromXml(*state).success);
    REQUIRE(ChainNodeHelpers::findById(f.chain.getRootNode(), id)->getPlugin().ignoreLatency);
    REQUIRE(f.chain.getTotalLatencySamples() == 0);
    REQUIRE(f.chain.setNodeIgnoreLatency(id, false));
    REQUIRE(f.chain.getTotalLatencySamples() == 64);
}

namespace {
juce::AudioProcessor* processorNamed(ChainFixture& f, const juce::String& name)
{
    for (auto& child : f.chain.getRootNode().getGroup().children)
        if (child->isPlugin() && child->getPlugin().description.name == name) return f.chain.getNodeProcessor(child->id);
    return nullptr;
}

ChainProcessor::RestoreResult restoreRespectingRecallSafe(ChainFixture& f, const juce::XmlElement& xml)
{
    std::optional<ChainProcessor::RestoreResult> done;
    f.chain.requestRestore(xml, false, [&](ChainProcessor::RestoreResult r) { done = r; }, {}, true);
    REQUIRE(pumpUntil([&] { return done.has_value(); }));
    return *done;
}
}

TEST_CASE("Recall-safe slot keeps its instance when a chain without it loads", "[chain][state]")
{
    ChainFixture f; const auto locked = f.add("gain2"); f.add("unity");
    auto incoming = f.chain.serializeChainToXml();
    incoming->removeChildElement(incoming->getChildByName("Node"), true); // incoming chain: unity only
    REQUIRE(f.chain.setNodeRecallSafe(locked, true));
    auto* original = f.chain.getNodeProcessor(locked);
    REQUIRE(restoreRespectingRecallSafe(f, *incoming).success);
    REQUIRE(f.chain.getRootNode().getGroup().children.size() == 2);
    REQUIRE(processorNamed(f, "gain2") == original);
    REQUIRE(f.chain.getRootNode().getGroup().children.front()->getPlugin().recallSafe);
    REQUIRE(f.render(1).getSample(0, 2047) == Catch::Approx(2).margin(1e-5));
}

TEST_CASE("Recall-safe slot takes the place of the same plugin in the loaded chain", "[chain][state]")
{
    ChainFixture f; const auto locked = f.add("gain2");
    auto incoming = f.chain.serializeChainToXml(); // gain2 with a different identity
    incoming->getChildByName("Node")->setAttribute("persistentId", juce::Uuid().toString());
    incoming->getChildByName("Node")->setAttribute("bypassed", true);
    REQUIRE(f.chain.setNodeRecallSafe(locked, true));
    auto* original = f.chain.getNodeProcessor(locked);
    REQUIRE(restoreRespectingRecallSafe(f, *incoming).success);
    REQUIRE(f.chain.getRootNode().getGroup().children.size() == 1);
    REQUIRE(processorNamed(f, "gain2") == original);
    REQUIRE_FALSE(f.chain.getRootNode().getGroup().children.front()->getPlugin().bypassed);
}

TEST_CASE("Plain restores ignore the recall-safe lock", "[chain][state]")
{
    ChainFixture f; const auto locked = f.add("gain2"); f.add("unity");
    auto incoming = f.chain.serializeChainToXml();
    incoming->removeChildElement(incoming->getChildByName("Node"), true);
    REQUIRE(f.chain.setNodeRecallSafe(locked, true));
    REQUIRE(f.chain.restoreChainFromXml(*incoming).success);
    REQUIRE(f.chain.getRootNode().getGroup().children.size() == 1);
}
