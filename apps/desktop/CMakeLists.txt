cmake_minimum_required(VERSION 3.22)

project(ProChain VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Fetch JUCE
include(FetchContent)
FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 8.0.4
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(JUCE)

# Plugin target
juce_add_plugin(ProChain
    COMPANY_NAME "ProChain"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD TRUE
    PLUGIN_MANUFACTURER_CODE Prcn
    PLUGIN_CODE PrCh
    FORMATS AU VST3 Standalone
    PRODUCT_NAME "ProChain"
)

# Source files
target_sources(ProChain
    PRIVATE
        src/PluginProcessor.cpp
        src/PluginEditor.cpp
        src/core/PluginManager.cpp
        src/core/ChainProcessor.cpp
        src/core/ChainNode.cpp
        src/core/PresetManager.cpp
        src/core/GroupTemplateManager.cpp
        src/core/ParameterDiscovery.cpp
        src/core/InstanceRegistry.cpp
        src/core/MirrorManager.cpp
        src/core/UserProfile.cpp
        src/core/ChainSharingManager.cpp
        src/bridge/WebViewBridge.cpp
        src/bridge/ResourceProvider.cpp
        src/ui/PluginEditorHost.cpp
        src/ui/PluginCanvas.cpp
        src/audio/WaveformCapture.cpp
        src/audio/GainProcessor.cpp
        src/audio/AudioMeter.cpp
        src/audio/PluginWithMeterWrapper.cpp
        src/audio/NodeMeterProcessor.cpp
        src/audio/FFTProcessor.cpp
        src/audio/DryWetMixProcessor.cpp
        src/audio/BranchGainProcessor.cpp
        src/audio/MidSideMatrixProcessor.cpp
        src/audio/DuckingProcessor.cpp
        src/audio/LatencyCompensationProcessor.cpp
        src/audio/MuteProcessor.cpp
        src/audio/PluginParameterWatcher.cpp
        src/automation/ProxyParameter.cpp
        src/automation/ParameterProxyPool.cpp
        src/platform/KeyboardInterceptor.mm
)

# Binary resources - embed the UI
juce_add_binary_data(ProChainData
    SOURCES
        resources/ui.zip
)

target_compile_definitions(ProChain
    PUBLIC
        JUCE_WEB_BROWSER=1
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_PLUGINHOST_VST3=1
        JUCE_PLUGINHOST_AU=1
        JUCE_DISPLAY_SPLASH_SCREEN=0
)

target_link_libraries(ProChain
    PRIVATE
        ProChainData
        juce::juce_audio_utils
        juce::juce_audio_processors
        juce::juce_gui_extra
        juce::juce_dsp
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags
)

target_link_options(ProChain PUBLIC -ObjC)

# Enable -ffast-math in Release builds for faster transcendental functions
# Note: -march=native is intentionally omitted to preserve cross-compilation
target_compile_options(ProChain PRIVATE
    $<$<CONFIG:Release>:-ffast-math>
)

# Include directories
target_include_directories(ProChain
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/src
)

#==============================================================================
# Plugin Scanner Helper - separate process for crash-safe plugin scanning
#==============================================================================
juce_add_console_app(PluginScannerHelper
    PRODUCT_NAME "PluginScannerHelper"
    COMPANY_NAME "ProChain"
)

target_sources(PluginScannerHelper
    PRIVATE
        src/scanner/PluginScannerHelper.cpp
)

target_compile_definitions(PluginScannerHelper
    PRIVATE
        JUCE_PLUGINHOST_VST3=1
        JUCE_PLUGINHOST_AU=1
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_DISPLAY_SPLASH_SCREEN=0
)

target_link_libraries(PluginScannerHelper
    PRIVATE
        juce::juce_audio_processors
        juce::juce_audio_utils
    PUBLIC
        juce::juce_recommended_config_flags
)

# Copy scanner helper to the standalone app bundle's Resources folder
add_custom_command(TARGET PluginScannerHelper POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy
        "$<TARGET_FILE:PluginScannerHelper>"
        "${CMAKE_BINARY_DIR}/ProChain_artefacts/$<CONFIG>/Standalone/ProChain.app/Contents/Resources/PluginScannerHelper"
    COMMENT "Copying PluginScannerHelper to Standalone bundle"
)

# Copy scanner helper to AU component bundle's Resources folder
add_custom_command(TARGET PluginScannerHelper POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory
        "${CMAKE_BINARY_DIR}/ProChain_artefacts/$<CONFIG>/AU/ProChain.component/Contents/Resources"
    COMMAND ${CMAKE_COMMAND} -E copy
        "$<TARGET_FILE:PluginScannerHelper>"
        "${CMAKE_BINARY_DIR}/ProChain_artefacts/$<CONFIG>/AU/ProChain.component/Contents/Resources/PluginScannerHelper"
    COMMENT "Copying PluginScannerHelper to AU bundle"
)

# Copy scanner helper to VST3 bundle's Resources folder
add_custom_command(TARGET PluginScannerHelper POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory
        "${CMAKE_BINARY_DIR}/ProChain_artefacts/$<CONFIG>/VST3/ProChain.vst3/Contents/Resources"
    COMMAND ${CMAKE_COMMAND} -E copy
        "$<TARGET_FILE:PluginScannerHelper>"
        "${CMAKE_BINARY_DIR}/ProChain_artefacts/$<CONFIG>/VST3/ProChain.vst3/Contents/Resources/PluginScannerHelper"
    COMMENT "Copying PluginScannerHelper to VST3 bundle"
)

# Make sure scanner is built before the main plugin
add_dependencies(ProChain_Standalone PluginScannerHelper)
add_dependencies(ProChain_AU PluginScannerHelper)
add_dependencies(ProChain_VST3 PluginScannerHelper)

#==============================================================================
# Tests - Catch2 unit tests for scanner and plugin management logic
#==============================================================================
FetchContent_Declare(
    Catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG v3.5.2
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(Catch2)

add_executable(ProChain_Tests
    tests/ScannerUtilsTests.cpp
    tests/BlacklistTests.cpp
    tests/ChainNodeTests.cpp
    tests/DSPTests.cpp
    tests/PresetSerializationTests.cpp
    tests/ParameterDiscoveryTests.cpp
    tests/ScannerStressTests.cpp
    tests/MirrorManagerTests.cpp
    tests/PerformanceTests.cpp
    tests/PluginWithMeterWrapperTests.cpp
    tests/ChainProcessorTests.cpp
    tests/OversamplingTests.cpp
    tests/PluginProcessorLifecycleTests.cpp
    src/core/PluginManager.cpp
    src/core/ChainNode.cpp
    src/core/ChainProcessor.cpp
    src/core/ParameterDiscovery.cpp
    src/core/InstanceRegistry.cpp
    src/core/MirrorManager.cpp
    src/core/PresetManager.cpp
    src/core/GroupTemplateManager.cpp
    src/core/UserProfile.cpp
    src/core/ChainSharingManager.cpp
    src/PluginProcessor.cpp
    src/PluginEditor.cpp
    src/bridge/WebViewBridge.cpp
    src/bridge/ResourceProvider.cpp
    src/ui/PluginEditorHost.cpp
    src/ui/PluginCanvas.cpp
    src/platform/KeyboardInterceptor.mm
    src/audio/DryWetMixProcessor.cpp
    src/audio/BranchGainProcessor.cpp
    src/audio/MidSideMatrixProcessor.cpp
    src/audio/DuckingProcessor.cpp
    src/audio/LatencyCompensationProcessor.cpp
    src/audio/GainProcessor.cpp
    src/audio/AudioMeter.cpp
    src/audio/PluginWithMeterWrapper.cpp
    src/audio/WaveformCapture.cpp
    src/audio/FFTProcessor.cpp
    src/audio/NodeMeterProcessor.cpp
    src/audio/MuteProcessor.cpp
    src/audio/PluginParameterWatcher.cpp
    src/automation/ProxyParameter.cpp
    src/automation/ParameterProxyPool.cpp
)

target_include_directories(ProChain_Tests
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_compile_definitions(ProChain_Tests
    PRIVATE
        JUCE_PLUGINHOST_VST3=1
        JUCE_PLUGINHOST_AU=1
        JUCE_WEB_BROWSER=1
        JUCE_USE_CURL=0
        JUCE_DISPLAY_SPLASH_SCREEN=0
        JUCE_MODAL_LOOPS_PERMITTED=1
        JucePlugin_Name="ProChain"
        JucePlugin_Desc="Plugin Chain Host"
        JucePlugin_Manufacturer="ProChain"
        JucePlugin_ManufacturerCode=0x5072636e
        JucePlugin_PluginCode=0x50724368
)

target_link_libraries(ProChain_Tests
    PRIVATE
        Catch2::Catch2WithMain
        ProChainData
        juce::juce_audio_processors
        juce::juce_audio_utils
        juce::juce_dsp
        juce::juce_gui_extra
    PUBLIC
        juce::juce_recommended_config_flags
)

include(CTest)
list(APPEND CMAKE_MODULE_PATH ${catch2_SOURCE_DIR}/extras)
include(Catch)
catch_discover_tests(ProChain_Tests)
