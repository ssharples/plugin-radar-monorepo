// =============================================================================
// PluginLoadUnloadTests.cpp
//
// Crash-path tests for plugin load/unload lifecycle, including rapid
// add/remove, sample rate changes, batch operations, and edge-case
// buffer sizes.
// =============================================================================

#include "TestHelpers.h"
#include <catch2/catch_test_macros.hpp>

// =============================================================================
// Full Plugin Lifecycle
// =============================================================================

TEST_CASE("LoadUnload: load → processBlock → unload → processBlock",
          "[load-unload]") {
  ChainProcessorTestFixture fix;

  auto id = fix.addMock("EQ");
  fix.processBlock();

  REQUIRE(fix.chain.removeNode(id) == true);
  REQUIRE(fix.chain.getNumSlots() == 0);
  fix.processBlock();
}

TEST_CASE("LoadUnload: load multiple → remove middle → processBlock",
          "[load-unload]") {
  ChainProcessorTestFixture fix;

  auto id1 = fix.addMock("First");
  auto id2 = fix.addMock("Middle");
  auto id3 = fix.addMock("Last");
  fix.processBlock();

  REQUIRE(fix.chain.removeNode(id2) == true);
  REQUIRE(fix.chain.getNumSlots() == 2);
  fix.processBlock();
}

// =============================================================================
// Sample Rate / Block Size Changes
// =============================================================================

TEST_CASE("LoadUnload: load → release → re-prepare → processBlock",
          "[load-unload]") {
  ChainProcessorTestFixture fix;

  fix.addMock("EQ");
  fix.processBlock();

  // Simulate DAW sample rate change
  fix.chain.releaseResources();
  fix.chain.prepareToPlay(48000.0, 256);

  juce::AudioBuffer<float> buffer(2, 256);
  buffer.clear();
  juce::MidiBuffer midi;
  fix.chain.processBlock(buffer, midi);
}

TEST_CASE("LoadUnload: multiple prepareToPlay with different rates",
          "[load-unload]") {
  ChainProcessorTestFixture fix;

  fix.addMock("EQ");

  // DAW transport changes
  fix.chain.prepareToPlay(44100.0, 512);
  fix.processBlock();

  fix.chain.prepareToPlay(48000.0, 1024);
  juce::AudioBuffer<float> buf(2, 1024);
  buf.clear();
  juce::MidiBuffer midi;
  fix.chain.processBlock(buf, midi);

  fix.chain.prepareToPlay(96000.0, 128);
  buf.setSize(2, 128);
  buf.clear();
  fix.chain.processBlock(buf, midi);
}

// =============================================================================
// Duplicate Lifecycle
// =============================================================================

TEST_CASE("LoadUnload: load → duplicate → verify no crash", "[load-unload]") {
  ChainProcessorTestFixture fix;

  auto id = fix.addMock("EQ");
  fix.processBlock();

  // duplicateNode internally calls pluginManager.createPluginInstance() —
  // returns false for mock plugins, but must not crash
  fix.chain.duplicateNode(id);

  fix.processBlock();
}

// =============================================================================
// Group Lifecycle
// =============================================================================

TEST_CASE("LoadUnload: load into parallel group → processBlock",
          "[load-unload]") {
  ChainProcessorTestFixture fix;

  auto groupId = fix.addMockGroup(GroupMode::Parallel, "ParGroup");
  fix.addMock("Branch1", groupId);
  fix.addMock("Branch2", groupId);

  REQUIRE(fix.chain.getNumSlots() == 2);
  fix.processBlock();
}

TEST_CASE("LoadUnload: createGroup from 2 plugins → processBlock",
          "[load-unload]") {
  ChainProcessorTestFixture fix;

  auto id1 = fix.addMock("EQ");
  auto id2 = fix.addMock("Comp");
  fix.processBlock();

  auto groupId = fix.chain.createGroup({id1, id2}, GroupMode::Serial, "Group");
  REQUIRE(groupId >= 0);
  fix.processBlock();
}

TEST_CASE("LoadUnload: load then dissolveGroup → processBlock",
          "[load-unload]") {
  ChainProcessorTestFixture fix;

  auto id1 = fix.addMock("EQ");
  auto id2 = fix.addMock("Comp");
  auto groupId = fix.chain.createGroup({id1, id2}, GroupMode::Serial, "Group");
  fix.processBlock();

  REQUIRE(fix.chain.dissolveGroup(groupId) == true);
  REQUIRE(fix.chain.getNumSlots() == 2);
  fix.processBlock();
}

// =============================================================================
// Teardown Stress
// =============================================================================

TEST_CASE("LoadUnload: load 10 plugins and remove all one-by-one",
          "[load-unload]") {
  ChainProcessorTestFixture fix;

  std::vector<ChainNodeId> ids;
  for (int i = 0; i < 10; ++i) {
    auto id = fix.addMock("Plugin_" + juce::String(i));
    REQUIRE(id >= 0);
    ids.push_back(id);
  }

  REQUIRE(fix.chain.getNumSlots() == 10);
  fix.processBlock();

  // Remove one-by-one in reverse order
  for (int i = 9; i >= 0; --i) {
    REQUIRE(fix.chain.removeNode(ids[i]) == true);
    fix.processBlock();
  }

  REQUIRE(fix.chain.getNumSlots() == 0);
}

// =============================================================================
// Bypass Lifecycle
// =============================================================================

TEST_CASE("LoadUnload: load → setNodeBypassed → processBlock",
          "[load-unload]") {
  ChainProcessorTestFixture fix;

  auto id = fix.addMock("EQ");
  fix.processBlock();

  fix.chain.setNodeBypassed(id, true);
  fix.processBlock();

  fix.chain.setNodeBypassed(id, false);
  fix.processBlock();
}

// =============================================================================
// Edge-Case Buffer Sizes
// =============================================================================

TEST_CASE("LoadUnload: processBlock with small buffer (1 sample)",
          "[load-unload]") {
  ChainProcessorTestFixture fix;

  fix.addMock("EQ");
  fix.chain.prepareToPlay(44100.0, 1);

  juce::AudioBuffer<float> buffer(2, 1);
  buffer.clear();
  juce::MidiBuffer midi;
  fix.chain.processBlock(buffer, midi);
}

TEST_CASE("LoadUnload: processBlock with large buffer (4096 samples)",
          "[load-unload]") {
  ChainProcessorTestFixture fix;

  fix.addMock("EQ");
  fix.chain.prepareToPlay(44100.0, 4096);

  juce::AudioBuffer<float> buffer(2, 4096);
  buffer.clear();
  juce::MidiBuffer midi;
  fix.chain.processBlock(buffer, midi);
}

TEST_CASE("LoadUnload: processBlock with various block sizes",
          "[load-unload]") {
  ChainProcessorTestFixture fix;

  fix.addMock("EQ");

  int blockSizes[] = {1, 32, 64, 128, 256, 512, 1024, 2048, 4096};

  for (auto bs : blockSizes) {
    fix.chain.prepareToPlay(44100.0, bs);

    juce::AudioBuffer<float> buffer(2, bs);
    buffer.clear();
    juce::MidiBuffer midi;
    fix.chain.processBlock(buffer, midi);
  }
}

// =============================================================================
// Burst Loading
// =============================================================================

TEST_CASE("LoadUnload: burst load 5 plugins without processBlock between",
          "[load-unload]") {
  ChainProcessorTestFixture fix;

  for (int i = 0; i < 5; ++i) {
    auto id = fix.addMock("Plugin_" + juce::String(i));
    REQUIRE(id >= 0);
  }

  REQUIRE(fix.chain.getNumSlots() == 5);

  // Only processBlock AFTER all are loaded
  fix.processBlock();
}

// =============================================================================
// Toggle All Controls
// =============================================================================

TEST_CASE("LoadUnload: toggleAllBypass with loaded plugins", "[load-unload]") {
  ChainProcessorTestFixture fix;

  fix.addMock("EQ");
  fix.addMock("Comp");
  fix.processBlock();

  // Toggle: all active → all bypassed
  fix.chain.toggleAllBypass();
  auto state = fix.chain.getBypassState();
  REQUIRE(state.allBypassed == true);
  fix.processBlock();

  // Toggle: all bypassed → all active
  fix.chain.toggleAllBypass();
  state = fix.chain.getBypassState();
  REQUIRE(state.allBypassed == false);
  fix.processBlock();
}

// =============================================================================
// Destruction with Active Plugins
// =============================================================================

TEST_CASE("LoadUnload: destruction with plugins loaded", "[load-unload]") {
  auto fix = std::make_unique<ChainProcessorTestFixture>();

  fix->addMock("EQ");
  fix->addMock("Comp");
  fix->addMock("Limiter");
  fix->processBlock();

  // Destroy while plugins are loaded — must not crash
  fix.reset();
}

TEST_CASE("LoadUnload: destruction with nested groups and plugins",
          "[load-unload]") {
  auto fix = std::make_unique<ChainProcessorTestFixture>();

  auto groupId = fix->addMockGroup(GroupMode::Parallel, "ParGroup");
  fix->addMock("Branch1", groupId);
  fix->addMock("Branch2", groupId);
  fix->addMock("TopLevel");
  fix->processBlock();

  // Destroy complex chain — must not crash or leak
  fix.reset();
}
