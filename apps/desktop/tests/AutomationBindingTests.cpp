#include <catch2/catch_test_macros.hpp>
#include "automation/AutomationBinding.h"
#include "automation/ProxyParameter.h"
#include "automation/ParameterProxyPool.h"
#include <atomic>
#include <chrono>
#include <thread>

class AutomationSyntheticProcessor : public juce::AudioProcessor
{
public:
    explicit AutomationSyntheticProcessor(const juce::String& parameterId, float initial)
    {
        parameter = new juce::AudioParameterFloat(juce::ParameterID(parameterId, 1), parameterId,
                                                   juce::NormalisableRange<float>(0.0f, 1.0f), initial);
        addParameter(parameter);
    }
    const juce::String getName() const override { return "AutomationSynthetic"; }
    void prepareToPlay(double, int) override {}
    void releaseResources() override {}
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override {}
    double getTailLengthSeconds() const override { return 0.0; }
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
    juce::AudioParameterFloat* parameter = nullptr;
};

TEST_CASE("Automation bindings keep host identities across reorder", "[Automation]")
{
    AutomationBindingManager manager;
    REQUIRE(manager.assign(0, "plugin-a", "cutoff", 2));
    REQUIRE(manager.assign(127, "plugin-b", "mix", 1));

    auto xml = manager.toXml();
    AutomationBindingManager restored;
    REQUIRE(restored.restoreFromXml(xml));
    CHECK(restored.getBinding(0).pluginPersistentId == "plugin-a");
    CHECK(restored.getBinding(0).parameterId == "cutoff");
    CHECK(restored.getBinding(127).pluginPersistentId == "plugin-b");
}

TEST_CASE("Legacy migration populates all fixed controls once", "[Automation]")
{
    AutomationBindingManager manager;
    manager.migrateLegacy({ "a", "b", "c" });
    CHECK(manager.getBinding(0).pluginPersistentId == "a");
    CHECK(manager.getBinding(127).pluginPersistentId == "a");
    CHECK(manager.getBinding(128).pluginPersistentId == "b");
    manager.migrateLegacy({ "c", "d" });
    CHECK(manager.getBinding(0).pluginPersistentId == "a");
}

TEST_CASE("Missing targets become tombstones until explicit unassign", "[Automation]")
{
    AutomationBindingManager manager;
    REQUIRE(manager.assign(3, "plugin-a", "gain"));
    manager.markTargetUnavailable("plugin-a");
    CHECK(manager.getBinding(3).tombstone);
    CHECK(manager.getBinding(3).isAssigned());
    REQUIRE(manager.unassign(3));
    CHECK_FALSE(manager.getBinding(3).isAssigned());
    CHECK_FALSE(manager.getBinding(3).tombstone);
}

TEST_CASE("Proxy reader guard reports quiescence after read", "[Automation]")
{
    ProxyParameter proxy(0, 0);
    CHECK(proxy.isQuiescent());
    { ProxyParameter::ReadGuard guard(proxy); CHECK(proxy.isQuiescent() == false); }
    CHECK(proxy.isQuiescent());
}

TEST_CASE("ParameterProxyPool keeps assignments through reorder", "[Automation]")
{
    AutomationSyntheticProcessor hostA("gain", 0.25f);
    AutomationSyntheticProcessor hostB("mix", 0.75f);
    AutomationSyntheticProcessor host("host", 0.0f);
    ParameterProxyPool pool;
    pool.createAndRegister(host);
    PluginLeaf a; a.persistentId = "plugin-a";
    PluginLeaf b; b.persistentId = "plugin-b";
    std::vector<PluginLeaf*> order { &a, &b };
    REQUIRE(pool.assignBinding(0, "plugin-a", "gain"));
    REQUIRE(pool.assignBinding(1, "plugin-b", "mix"));
    auto resolve = [&](int index) { return index == 0 ? static_cast<juce::AudioProcessor*>(&hostA)
                                                      : static_cast<juce::AudioProcessor*>(&hostB); };
    pool.rebindBindings(order, resolve);
    CHECK(pool.getProxy(0)->getValue() == 0.25f);
    CHECK(pool.getProxy(1)->getValue() == 0.75f);

    std::swap(order[0], order[1]);
    auto reorderedResolve = [&](int index) { return index == 0 ? static_cast<juce::AudioProcessor*>(&hostB)
                                                                 : static_cast<juce::AudioProcessor*>(&hostA); };
    pool.rebindBindings(order, reorderedResolve);
    CHECK(pool.getProxy(0)->getValue() == 0.25f);
    CHECK(pool.getProxy(1)->getValue() == 0.75f);
}

TEST_CASE("ParameterProxyPool deletion leaves tombstone and does not retarget", "[Automation]")
{
    AutomationSyntheticProcessor hostA("gain", 0.2f);
    AutomationSyntheticProcessor hostB("mix", 0.8f);
    AutomationSyntheticProcessor host("host", 0.0f);
    ParameterProxyPool pool;
    pool.createAndRegister(host);
    PluginLeaf a; a.persistentId = "plugin-a";
    PluginLeaf b; b.persistentId = "plugin-b";
    REQUIRE(pool.assignBinding(0, "plugin-a", "gain"));
    REQUIRE(pool.assignBinding(1, "plugin-b", "mix"));
    std::vector<PluginLeaf*> initial { &a, &b };
    pool.rebindBindings(initial, [&](int i) { return i == 0 ? static_cast<juce::AudioProcessor*>(&hostA)
                                                             : static_cast<juce::AudioProcessor*>(&hostB); });

    pool.unbindAffected("plugin-a");
    std::vector<PluginLeaf*> afterDelete { &b };
    pool.rebindBindings(afterDelete, [&](int) { return static_cast<juce::AudioProcessor*>(&hostB); });
    CHECK(pool.getProxy(0)->getValue() == 0.0f);
    CHECK(pool.getProxy(1)->getValue() == 0.8f);
    CHECK(pool.getBinding(0).tombstone);
    CHECK(pool.getBinding(0).pluginPersistentId == "plugin-a");
}

TEST_CASE("Pool proxy reader remains safe until guard leaves", "[Automation]")
{
    AutomationSyntheticProcessor host("host", 0.0f);
    ParameterProxyPool pool;
    pool.createAndRegister(host);
    AutomationSyntheticProcessor target("gain", 0.5f);
    pool.getProxy(0)->bind(target.parameter);
    auto* proxy = pool.getProxy(0);
    { ProxyParameter::ReadGuard guard(*proxy); proxy->unbind(); CHECK_FALSE(proxy->isQuiescent()); }
    CHECK(proxy->isQuiescent());
}

TEST_CASE("Pool shutdown waits for an in-flight reader", "[Automation]")
{
    AutomationSyntheticProcessor host("host", 0.0f);
    ParameterProxyPool pool;
    pool.createAndRegister(host);
    AutomationSyntheticProcessor target("gain", 0.5f);
    pool.getProxy(0)->bind(target.parameter);

    std::atomic<bool> finished { false };
    std::thread shutdownThread;
    {
        ProxyParameter::ReadGuard guard(*pool.getProxy(0));
        shutdownThread = std::thread([&]
        {
            pool.shutdown();
            finished.store(true, std::memory_order_release);
        });
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        CHECK_FALSE(finished.load(std::memory_order_acquire));
    }
    shutdownThread.join();
    CHECK(finished.load(std::memory_order_acquire));
}
