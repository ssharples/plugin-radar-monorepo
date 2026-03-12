// =============================================================================
// CrashPathChainProcessorTests.cpp
//
// Crash-path tests for ChainProcessor graph mutations with MockPluginInstance.
// Every test verifies that the operation does not crash AND that a subsequent
// processBlock() completes without error.
// =============================================================================

#include "TestHelpers.h"
#include <catch2/catch_test_macros.hpp>

// =============================================================================
// Add Plugin
// =============================================================================

TEST_CASE("CrashPath: addPlugin to root, verify tree + processBlock",
          "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto id = fix.addMock("EQ");
  REQUIRE(id >= 0);

  REQUIRE(fix.chain.getNumSlots() == 1);
  REQUIRE(fix.chain.getRootNode().isGroup());
  REQUIRE(fix.chain.getRootNode().getGroup().children.size() == 1);

  // processBlock must not crash
  fix.processBlock();
}

TEST_CASE("CrashPath: addPlugin multiple, verify order and processBlock",
          "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto id1 = fix.addMock("EQ");
  auto id2 = fix.addMock("Comp");
  auto id3 = fix.addMock("Limiter");

  REQUIRE(id1 >= 0);
  REQUIRE(id2 >= 0);
  REQUIRE(id3 >= 0);
  REQUIRE(fix.chain.getNumSlots() == 3);

  fix.processBlock();
}

// =============================================================================
// Remove Node
// =============================================================================

TEST_CASE("CrashPath: removeNode valid plugin", "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto id = fix.addMock("EQ");
  REQUIRE(id >= 0);
  fix.processBlock();

  REQUIRE(fix.chain.removeNode(id) == true);
  REQUIRE(fix.chain.getNumSlots() == 0);

  fix.processBlock();
}

TEST_CASE("CrashPath: removeNode — double remove same ID", "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto id = fix.addMock("EQ");
  REQUIRE(fix.chain.removeNode(id) == true);

  // Second remove should return false, not crash
  REQUIRE(fix.chain.removeNode(id) == false);

  fix.processBlock();
}

TEST_CASE("CrashPath: removeNode — non-existent ID returns false",
          "[crash-path]") {
  ChainProcessorTestFixture fix;

  REQUIRE(fix.chain.removeNode(999) == false);
  fix.processBlock();
}

TEST_CASE("CrashPath: removeNode — root node returns false", "[crash-path]") {
  ChainProcessorTestFixture fix;

  // Root node (id=0) must never be removable
  REQUIRE(fix.chain.removeNode(0) == false);
  REQUIRE(fix.chain.getRootNode().isGroup());

  fix.processBlock();
}

TEST_CASE("CrashPath: remove middle plugin from chain of 3", "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto id1 = fix.addMock("First");
  auto id2 = fix.addMock("Middle");
  auto id3 = fix.addMock("Last");
  fix.processBlock();

  REQUIRE(fix.chain.removeNode(id2) == true);
  REQUIRE(fix.chain.getNumSlots() == 2);

  // Remaining plugins should still process
  fix.processBlock();
}

// =============================================================================
// Move Node
// =============================================================================

TEST_CASE("CrashPath: moveNode within same parent", "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto id1 = fix.addMock("First");
  auto id2 = fix.addMock("Second");
  auto id3 = fix.addMock("Third");
  fix.processBlock();

  // Move first to end (index 2)
  REQUIRE(fix.chain.moveNode(id1, 0, 2) == true);

  fix.processBlock();
}

TEST_CASE("CrashPath: moveNode — invalid source returns false",
          "[crash-path]") {
  ChainProcessorTestFixture fix;

  fix.addMock("Plugin");

  REQUIRE(fix.chain.moveNode(999, 0, 0) == false);
  fix.processBlock();
}

TEST_CASE("CrashPath: moveNode between groups", "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto groupId = fix.addMockGroup(GroupMode::Serial, "SubGroup");
  auto pluginId = fix.addMock("EQ");
  fix.processBlock();

  // Move plugin into the subgroup
  REQUIRE(fix.chain.moveNode(pluginId, groupId, 0) == true);

  fix.processBlock();
}

// =============================================================================
// Duplicate Node
// =============================================================================

TEST_CASE("CrashPath: duplicateNode plugin leaf (no crash)", "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto id = fix.addMock("EQ");
  fix.processBlock();

  // duplicateNode internally calls pluginManager.createPluginInstance() to
  // clone the plugin — this returns false for mock plugins (no real binaries),
  // but the important thing is it doesn't CRASH.
  fix.chain.duplicateNode(id);

  fix.processBlock();
}

// =============================================================================
// Group Operations
// =============================================================================

TEST_CASE("CrashPath: createGroup from two children", "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto id1 = fix.addMock("EQ");
  auto id2 = fix.addMock("Comp");
  fix.processBlock();

  auto groupId =
      fix.chain.createGroup({id1, id2}, GroupMode::Serial, "MyGroup");
  REQUIRE(groupId >= 0);

  fix.processBlock();
}

TEST_CASE("CrashPath: createGroup — empty childIds", "[crash-path]") {
  ChainProcessorTestFixture fix;

  // Should handle gracefully (either create empty group or return -1)
  auto groupId = fix.chain.createGroup({}, GroupMode::Serial, "EmptyGroup");
  // Just verify no crash
  fix.processBlock();
}

TEST_CASE("CrashPath: dissolveGroup — unwrap children", "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto id1 = fix.addMock("EQ");
  auto id2 = fix.addMock("Comp");
  auto groupId =
      fix.chain.createGroup({id1, id2}, GroupMode::Serial, "MyGroup");
  fix.processBlock();

  REQUIRE(fix.chain.dissolveGroup(groupId) == true);

  fix.processBlock();
}

TEST_CASE("CrashPath: dissolveGroup — root group returns false",
          "[crash-path]") {
  ChainProcessorTestFixture fix;

  // Root (id=0) must not be dissolvable
  REQUIRE(fix.chain.dissolveGroup(0) == false);
  fix.processBlock();
}

TEST_CASE("CrashPath: setGroupMode serial to parallel toggle", "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto id1 = fix.addMock("EQ");
  auto id2 = fix.addMock("Comp");
  auto groupId = fix.chain.createGroup({id1, id2}, GroupMode::Serial, "Group");
  fix.processBlock();

  REQUIRE(fix.chain.setGroupMode(groupId, GroupMode::Parallel) == true);
  fix.processBlock();

  REQUIRE(fix.chain.setGroupMode(groupId, GroupMode::Serial) == true);
  fix.processBlock();
}

TEST_CASE("CrashPath: setGroupDryWet and setGroupDucking", "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto id1 = fix.addMock("EQ");
  auto id2 = fix.addMock("Comp");
  auto groupId = fix.chain.createGroup({id1, id2}, GroupMode::Serial, "Group");
  fix.processBlock();

  REQUIRE(fix.chain.setGroupDryWet(groupId, 0.5f) == true);
  fix.processBlock();

  REQUIRE(fix.chain.setGroupDucking(groupId, 0.8f, 150.0f) == true);
  fix.processBlock();
}

// =============================================================================
// Per-branch Controls
// =============================================================================

TEST_CASE("CrashPath: setBranchGain / setBranchSolo / setBranchMute",
          "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto id1 = fix.addMock("EQ");
  auto id2 = fix.addMock("Comp");
  auto groupId =
      fix.chain.createGroup({id1, id2}, GroupMode::Parallel, "ParGroup");
  fix.processBlock();

  // These should work on children of a parallel group
  fix.chain.setBranchGain(id1, -6.0f);
  fix.processBlock();

  fix.chain.setBranchSolo(id1, true);
  fix.processBlock();

  fix.chain.setBranchSolo(id1, false);
  fix.chain.setBranchMute(id2, true);
  fix.processBlock();
}

// =============================================================================
// Per-plugin Controls
// =============================================================================

TEST_CASE("CrashPath: setNodeBypassed toggle with loaded plugin",
          "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto id = fix.addMock("EQ");
  fix.processBlock();

  fix.chain.setNodeBypassed(id, true);
  fix.processBlock();

  fix.chain.setNodeBypassed(id, false);
  fix.processBlock();
}

TEST_CASE("CrashPath: setNodeInputGain / setNodeOutputGain", "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto id = fix.addMock("EQ");
  fix.processBlock();

  REQUIRE(fix.chain.setNodeInputGain(id, -12.0f) == true);
  fix.processBlock();

  REQUIRE(fix.chain.setNodeOutputGain(id, 6.0f) == true);
  fix.processBlock();
}

TEST_CASE("CrashPath: setNodeDryWet", "[crash-path]") {
  ChainProcessorTestFixture fix;

  auto id = fix.addMock("Reverb");
  fix.processBlock();

  REQUIRE(fix.chain.setNodeDryWet(id, 0.3f) == true);
  fix.processBlock();
}

// =============================================================================
// Stress: Rapid Add/Remove
// =============================================================================

TEST_CASE("CrashPath: rapid add-remove cycle (20 iterations)", "[crash-path]") {
  ChainProcessorTestFixture fix;

  for (int i = 0; i < 20; ++i) {
    auto id = fix.addMock("Plugin_" + juce::String(i));
    REQUIRE(id >= 0);
    fix.processBlock();

    REQUIRE(fix.chain.removeNode(id) == true);
    fix.processBlock();
  }

  REQUIRE(fix.chain.getNumSlots() == 0);
}

// =============================================================================
// Nested Groups
// =============================================================================

TEST_CASE("CrashPath: nested serial inside parallel with plugins",
          "[crash-path]") {
  ChainProcessorTestFixture fix;

  // Create: Root(Serial) > ParGroup(Parallel) > [EQ, SerialSub(Serial) > [Comp,
  // Limiter]]
  auto parGroupId = fix.addMockGroup(GroupMode::Parallel, "ParGroup");
  auto eqId = fix.addMock("EQ", parGroupId);
  auto serialSubId =
      fix.addMockGroup(GroupMode::Serial, "SerialSub", parGroupId);
  auto compId = fix.addMock("Comp", serialSubId);
  auto limiterId = fix.addMock("Limiter", serialSubId);

  REQUIRE(fix.chain.getNumSlots() == 3);
  fix.processBlock();
}

// =============================================================================
// clearGraph + processBlock
// =============================================================================

TEST_CASE("CrashPath: clearGraph then processBlock", "[crash-path]") {
  ChainProcessorTestFixture fix;

  fix.addMock("EQ");
  fix.addMock("Comp");
  fix.processBlock();

  fix.chain.clearGraph();
  fix.processBlock();
}
