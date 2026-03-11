// =============================================================================
// SerializationCrashTests.cpp
//
// Crash-path tests for ChainProcessor serialization: XML, JSON, binary state,
// corrupt data handling, and format version backward compatibility.
// =============================================================================

#include "TestHelpers.h"
#include <catch2/catch_test_macros.hpp>

// =============================================================================
// getStateInformation / setStateInformation Roundtrip (Populated Chain)
// =============================================================================

TEST_CASE("Serialization: getStateInformation/setStateInformation roundtrip "
          "(populated)",
          "[serialization-crash]") {
  juce::MemoryBlock savedState;
  {
    ChainProcessorTestFixture fix;
    fix.addMock("EQ");
    fix.addMock("Comp");
    fix.addMock("Limiter");
    fix.processBlock();

    fix.chain.getStateInformation(savedState);
    REQUIRE(savedState.getSize() > 0);
  }

  // Restore into fresh ChainProcessor (simulates DAW project reload)
  {
    ChainProcessorTestFixture fix2;
    fix2.chain.setStateInformation(savedState.getData(),
                                   static_cast<int>(savedState.getSize()));

    // Note: MockPlugins won't be re-instantiated (no real plugin binaries),
    // but the code path must not crash
    fix2.processBlock();
  }
}

// =============================================================================
// serializeChainToXml / restoreChainFromXml Roundtrip
// =============================================================================

TEST_CASE("Serialization: serializeChainToXml/restoreChainFromXml roundtrip",
          "[serialization-crash]") {
  std::unique_ptr<juce::XmlElement> savedXml;
  {
    ChainProcessorTestFixture fix;
    fix.addMock("EQ");
    fix.addMock("Comp");
    fix.processBlock();

    savedXml = fix.chain.serializeChainToXml();
    REQUIRE(savedXml != nullptr);
    REQUIRE(savedXml->hasTagName("ChainTree"));
  }

  // Restore into fresh chain
  {
    ChainProcessorTestFixture fix2;
    auto result = fix2.chain.restoreChainFromXml(*savedXml);
    REQUIRE(result.success == true);

    fix2.processBlock();
  }
}

// =============================================================================
// captureSnapshot / restoreSnapshot Roundtrip
// =============================================================================

TEST_CASE("Serialization: captureSnapshot/restoreSnapshot roundtrip",
          "[serialization-crash]") {
  juce::MemoryBlock snapshot;
  {
    ChainProcessorTestFixture fix;
    fix.addMock("EQ");
    fix.processBlock();

    snapshot = fix.chain.captureSnapshot();
    REQUIRE(snapshot.getSize() > 0);
  }

  {
    ChainProcessorTestFixture fix2;
    fix2.chain.restoreSnapshot(snapshot);

    fix2.processBlock();
  }
}

// =============================================================================
// exportChainWithPresets / importChainWithPresets Roundtrip
// =============================================================================

TEST_CASE(
    "Serialization: exportChainWithPresets/importChainWithPresets roundtrip",
    "[serialization-crash]") {
  juce::var exportedData;
  {
    ChainProcessorTestFixture fix;
    fix.addMock("EQ");
    fix.addMock("Comp");
    fix.processBlock();

    exportedData = fix.chain.exportChainWithPresets();
    REQUIRE(exportedData.isObject());
  }

  {
    ChainProcessorTestFixture fix2;
    auto result = fix2.chain.importChainWithPresets(exportedData);
    // Import may partially succeed if mock plugins can't be re-instantiated,
    // but must not crash
    fix2.processBlock();
  }
}

// =============================================================================
// getChainStateAsJson (Populated Chain)
// =============================================================================

TEST_CASE("Serialization: getChainStateAsJson with populated chain",
          "[serialization-crash]") {
  ChainProcessorTestFixture fix;
  fix.addMock("EQ");
  fix.addMock("Comp");
  fix.processBlock();

  auto json = fix.chain.getChainStateAsJson();
  REQUIRE(json.isObject());

  auto *obj = json.getDynamicObject();
  REQUIRE(obj != nullptr);

  auto nodesArr = obj->getProperty("nodes");
  REQUIRE(nodesArr.isArray());
  REQUIRE(nodesArr.getArray()->size() == 2);

  auto slotsArr = obj->getProperty("slots");
  REQUIRE(slotsArr.isArray());
  REQUIRE(slotsArr.getArray()->size() == 2);

  REQUIRE(static_cast<int>(obj->getProperty("numSlots")) == 2);
}

TEST_CASE("Serialization: getChainStateAsJson with nested groups",
          "[serialization-crash]") {
  ChainProcessorTestFixture fix;

  auto groupId = fix.addMockGroup(GroupMode::Parallel, "ParGroup");
  fix.addMock("EQ", groupId);
  fix.addMock("Comp", groupId);
  fix.processBlock();

  auto json = fix.chain.getChainStateAsJson();
  REQUIRE(json.isObject());

  // The tree should have 1 top-level node (the group), but 2 flat slots
  auto *obj = json.getDynamicObject();
  REQUIRE(static_cast<int>(obj->getProperty("numSlots")) == 2);
}

// =============================================================================
// Corrupt / Malformed Data Resilience
// =============================================================================

TEST_CASE("Serialization: setStateInformation with zero-size data",
          "[serialization-crash]") {
  ChainProcessorTestFixture fix;
  fix.addMock("EQ");
  fix.processBlock();

  // Zero-size should be handled gracefully
  char dummy = 0;
  fix.chain.setStateInformation(&dummy, 0);

  // Chain should still be functional
  fix.processBlock();
}

TEST_CASE("Serialization: setStateInformation with random garbage",
          "[serialization-crash]") {
  ChainProcessorTestFixture fix;
  fix.addMock("EQ");
  fix.processBlock();

  // Fill with random garbage
  const int garbageSize = 1024;
  std::vector<uint8_t> garbage(garbageSize);
  for (int i = 0; i < garbageSize; ++i)
    garbage[i] =
        static_cast<uint8_t>(i * 37 + 13); // deterministic pseudo-random

  fix.chain.setStateInformation(garbage.data(), garbageSize);

  // Must not crash — chain state may be undefined but processBlock must survive
  fix.processBlock();
}

TEST_CASE("Serialization: setStateInformation with truncated valid XML",
          "[serialization-crash]") {
  ChainProcessorTestFixture fix;
  fix.addMock("EQ");
  fix.processBlock();

  // Get valid state, then truncate it
  juce::MemoryBlock validState;
  fix.chain.getStateInformation(validState);

  if (validState.getSize() > 10) {
    // Truncate to 50% of original size
    int truncatedSize = static_cast<int>(validState.getSize()) / 2;
    fix.chain.setStateInformation(validState.getData(), truncatedSize);
  }

  fix.processBlock();
}

// =============================================================================
// importChainWithPresets Edge Cases
// =============================================================================

TEST_CASE("Serialization: importChainWithPresets with empty JSON object",
          "[serialization-crash]") {
  ChainProcessorTestFixture fix;
  fix.addMock("EQ");
  fix.processBlock();

  auto *emptyObj = new juce::DynamicObject();
  juce::var emptyData(emptyObj);

  auto result = fix.chain.importChainWithPresets(emptyData);
  // Should not crash, just fail gracefully
  fix.processBlock();
}

TEST_CASE("Serialization: importChainWithPresets with non-object input",
          "[serialization-crash]") {
  ChainProcessorTestFixture fix;

  juce::var stringData("not an object");
  auto result = fix.chain.importChainWithPresets(stringData);
  REQUIRE(result.success == false);

  juce::var intData(42);
  result = fix.chain.importChainWithPresets(intData);
  REQUIRE(result.success == false);

  fix.processBlock();
}

TEST_CASE("Serialization: importChainWithPresets with missing nodes array",
          "[serialization-crash]") {
  ChainProcessorTestFixture fix;

  auto *obj = new juce::DynamicObject();
  obj->setProperty("version", 2);
  // No "nodes" property
  juce::var data(obj);

  auto result = fix.chain.importChainWithPresets(data);
  fix.processBlock();
}

// =============================================================================
// Slot Preset Data
// =============================================================================

TEST_CASE("Serialization: getSlotPresetData/setSlotPresetData roundtrip",
          "[serialization-crash]") {
  ChainProcessorTestFixture fix;
  auto id = fix.addMock("EQ");
  fix.processBlock();

  auto presetData = fix.chain.getSlotPresetData(0);
  // MockPlugin produces a known state string
  REQUIRE(presetData.isNotEmpty());

  // Re-apply the same preset data
  REQUIRE(fix.chain.setSlotPresetData(0, presetData) == true);

  fix.processBlock();
}

TEST_CASE("Serialization: getSlotPresetData on OOB slot index",
          "[serialization-crash]") {
  ChainProcessorTestFixture fix;
  fix.addMock("EQ");

  // OOB should return empty, not crash
  auto data = fix.chain.getSlotPresetData(99);
  REQUIRE(data.isEmpty());
}

TEST_CASE("Serialization: setSlotPresetData on OOB slot index",
          "[serialization-crash]") {
  ChainProcessorTestFixture fix;
  fix.addMock("EQ");

  REQUIRE(fix.chain.setSlotPresetData(99, "QUFB") == false);
  fix.processBlock();
}

TEST_CASE("Serialization: setSlotPresetData with invalid base64",
          "[serialization-crash]") {
  ChainProcessorTestFixture fix;
  fix.addMock("EQ");
  fix.processBlock();

  // Invalid base64 — should not crash
  fix.chain.setSlotPresetData(0, "!!not_valid_base64!!");
  fix.processBlock();
}

// =============================================================================
// Double setStateInformation
// =============================================================================

TEST_CASE("Serialization: double setStateInformation (restore twice in a row)",
          "[serialization-crash]") {
  juce::MemoryBlock savedState;
  {
    ChainProcessorTestFixture fix;
    fix.addMock("EQ");
    fix.addMock("Comp");
    fix.processBlock();
    fix.chain.getStateInformation(savedState);
  }

  {
    ChainProcessorTestFixture fix2;

    // Restore twice
    fix2.chain.setStateInformation(savedState.getData(),
                                   static_cast<int>(savedState.getSize()));
    fix2.chain.setStateInformation(savedState.getData(),
                                   static_cast<int>(savedState.getSize()));

    fix2.processBlock();
  }
}

// =============================================================================
// processBlock After setStateInformation
// =============================================================================

TEST_CASE("Serialization: processBlock stress after setStateInformation",
          "[serialization-crash]") {
  juce::MemoryBlock savedState;
  {
    ChainProcessorTestFixture fix;
    fix.addMock("EQ");
    fix.processBlock();
    fix.chain.getStateInformation(savedState);
  }

  {
    ChainProcessorTestFixture fix2;
    fix2.chain.setStateInformation(savedState.getData(),
                                   static_cast<int>(savedState.getSize()));

    // Run many processBlock calls after restore
    for (int i = 0; i < 50; ++i)
      fix2.processBlock();
  }
}
