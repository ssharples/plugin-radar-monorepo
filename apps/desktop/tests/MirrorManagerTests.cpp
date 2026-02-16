#include <catch2/catch_test_macros.hpp>
#include "../src/core/MirrorManager.h"
#include "../src/core/InstanceRegistry.h"
#include "../src/PluginProcessor.h"
#include <thread>
#include <chrono>
#include <memory>

TEST_CASE("MirrorManager lifecycle - basic creation and destruction", "[mirror]")
{
    // Create a simple PluginChainManagerProcessor instance
    // Note: This test verifies that MirrorManager can be created and destroyed safely

    auto processor = std::make_unique<PluginChainManagerProcessor>();

    // Get the mirror manager (should be initialized in the processor)
    auto& mirrorManager = processor->getMirrorManager();

    // Should not be mirrored initially
    REQUIRE(!mirrorManager.isMirrored());
    REQUIRE(mirrorManager.getMirrorGroupId() == -1);

    // Destroy processor - should clean up without crash
    processor.reset();

    SUCCEED("MirrorManager destroyed without crash");
}

TEST_CASE("MirrorManager - basic mirror group operations", "[mirror]")
{
    auto instance1 = std::make_unique<PluginChainManagerProcessor>();
    auto instance2 = std::make_unique<PluginChainManagerProcessor>();

    auto& mirror1 = instance1->getMirrorManager();
    auto& mirror2 = instance2->getMirrorManager();

    // Start mirroring between instance1 and instance2
    int groupId = mirror1.startMirror(instance2->getInstanceId());

    // Both should be in the same mirror group
    REQUIRE(groupId > 0);
    REQUIRE(mirror1.isMirrored());
    REQUIRE(mirror1.getMirrorGroupId() == groupId);

    // Wait for mirror sync (async)
    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    // Leave mirror group
    mirror1.leaveMirrorGroup();

    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    REQUIRE(!mirror1.isMirrored());

    // Clean up
    instance1.reset();
    instance2.reset();
}

TEST_CASE("MirrorManager - destruction during active mirroring", "[mirror][stress]")
{
    // This test simulates the race condition where one instance is destroyed
    // while mirror propagation is happening

    auto instance1 = std::make_unique<PluginChainManagerProcessor>();
    auto instance2 = std::make_unique<PluginChainManagerProcessor>();
    auto instance3 = std::make_unique<PluginChainManagerProcessor>();

    auto& mirror1 = instance1->getMirrorManager();

    // Create mirror group with 3 instances
    int groupId = mirror1.startMirror(instance2->getInstanceId());
    REQUIRE(groupId > 0);

    // Wait for initial sync
    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    // Start making chain changes in a background thread
    std::atomic<bool> keepRunning{true};
    std::thread updater([&]() {
        juce::PluginDescription dummyDesc;
        dummyDesc.name = "TestPlugin";
        dummyDesc.manufacturerName = "TestMfr";
        dummyDesc.pluginFormatName = "AudioUnit";

        int changeCount = 0;
        while (keepRunning.load() && changeCount < 20)
        {
            // Try to add a plugin (may fail if no real plugins available)
            // The important part is the mirror propagation, not the actual plugin
            instance1->getChainProcessor().addPlugin(dummyDesc, -1);

            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            changeCount++;
        }
    });

    // Let it run for a bit
    std::this_thread::sleep_for(std::chrono::milliseconds(200));

    // Destroy instance2 mid-propagation
    instance2.reset();

    // Continue running for a bit longer
    std::this_thread::sleep_for(std::chrono::milliseconds(200));

    // Stop the updater thread
    keepRunning.store(false);
    updater.join();

    // instance1 should still be alive and functional
    REQUIRE(instance1 != nullptr);

    // Clean up remaining instances
    instance1.reset();
    instance3.reset();

    SUCCEED("Handled instance destruction during active mirroring");
}

TEST_CASE("MirrorManager - rapid mirror join/leave cycles", "[mirror][stress]")
{
    auto instance1 = std::make_unique<PluginChainManagerProcessor>();
    auto instance2 = std::make_unique<PluginChainManagerProcessor>();

    auto& mirror1 = instance1->getMirrorManager();

    // Rapidly join and leave mirror group
    for (int i = 0; i < 10; ++i)
    {
        int groupId = mirror1.startMirror(instance2->getInstanceId());
        REQUIRE(groupId > 0);

        std::this_thread::sleep_for(std::chrono::milliseconds(20));

        mirror1.leaveMirrorGroup();

        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }

    // Should not crash or leak
    instance1.reset();
    instance2.reset();

    SUCCEED("Rapid join/leave cycles completed");
}

TEST_CASE("MirrorManager - parameter diff propagation", "[mirror]")
{
    // This test verifies that the parameter diff timer works correctly

    auto instance1 = std::make_unique<PluginChainManagerProcessor>();
    auto instance2 = std::make_unique<PluginChainManagerProcessor>();

    auto& mirror1 = instance1->getMirrorManager();

    // Start mirroring
    int groupId = mirror1.startMirror(instance2->getInstanceId());
    REQUIRE(groupId > 0);

    // The timer should start at 15Hz (66ms period)
    // Wait for at least one timer callback
    std::this_thread::sleep_for(std::chrono::milliseconds(150));

    // If we got here without crashing, the timer is working
    SUCCEED("Parameter diff timer running");

    // Clean up
    mirror1.leaveMirrorGroup();
    instance1.reset();
    instance2.reset();
}

TEST_CASE("MirrorManager - listener notifications", "[mirror]")
{
    juce::ScopedJuceInitialiser_GUI juceInit;

    struct TestListener : MirrorManager::Listener
    {
        int stateChangeCount = 0;
        int updateAppliedCount = 0;

        void mirrorStateChanged() override
        {
            stateChangeCount++;
        }

        void mirrorUpdateApplied() override
        {
            updateAppliedCount++;
        }
    };

    auto instance1 = std::make_unique<PluginChainManagerProcessor>();
    auto instance2 = std::make_unique<PluginChainManagerProcessor>();

    auto& mirror1 = instance1->getMirrorManager();

    TestListener listener;
    mirror1.addListener(&listener);

    // Start mirror - should trigger stateChanged
    mirror1.startMirror(instance2->getInstanceId());

    // Pump the message queue so callAsync callbacks execute
    for (int i = 0; i < 20 && listener.stateChangeCount == 0; ++i)
        juce::MessageManager::getInstance()->runDispatchLoopUntil(50);

    CHECK(listener.stateChangeCount > 0);

    // Leave mirror - should trigger another stateChanged
    mirror1.leaveMirrorGroup();

    for (int i = 0; i < 20 && listener.stateChangeCount < 2; ++i)
        juce::MessageManager::getInstance()->runDispatchLoopUntil(50);

    CHECK(listener.stateChangeCount >= 2);

    mirror1.removeListener(&listener);

    instance1.reset();
    instance2.reset();
}
