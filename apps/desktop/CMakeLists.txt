cmake_minimum_required(VERSION 3.22)

project(PluginChainManager VERSION 1.0.0)

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

# Development builds must not overwrite an installed plugin implicitly.
option(PROCHAIN_COPY_PLUGIN_AFTER_BUILD "Install plugin bundles after building" OFF)
# Plugin target
juce_add_plugin(PluginChainManager
    COMPANY_NAME "ProChain"
    # Kept from the old name so hosts treat this as the same plugin
    BUNDLE_ID com.PluginChainManager.PluginChainManager
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT TRUE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
    PLUGIN_MANUFACTURER_CODE Pcmr
    PLUGIN_CODE Pcmg
    FORMATS AU VST3 Standalone
    PRODUCT_NAME "ProChain"
)

# Source files
target_sources(PluginChainManager
    PRIVATE
        src/PluginProcessor.cpp
        src/PluginEditor.cpp
        src/core/PluginManager.cpp
        src/core/ChainProcessor.cpp
        src/core/ChainRenderGraph.cpp
        src/core/ChainTransactions.cpp
        src/audio/HostedPluginProcessor.cpp
        src/core/ChainNode.cpp
        src/core/PresetManager.cpp
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
        src/audio/NodeMeterProcessor.cpp
        src/audio/FFTProcessor.cpp
        src/audio/DryWetMixProcessor.cpp
        src/audio/BranchGainProcessor.cpp
        src/audio/CrossoverBandProcessor.cpp
        src/audio/LatencyCompensationProcessor.cpp
        src/automation/ProxyParameter.cpp
        src/automation/AutomationBinding.cpp
        src/automation/ParameterProxyPool.cpp
        src/automation/MacroManager.cpp
)

# Binary resources - embed the UI
juce_add_binary_data(PluginChainManagerData
    SOURCES
        resources/ui.zip
)

target_compile_definitions(PluginChainManager
    PUBLIC
        JUCE_WEB_BROWSER=1
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_PLUGINHOST_VST3=1
        JUCE_PLUGINHOST_AU=1
        JUCE_DISPLAY_SPLASH_SCREEN=0
)

target_link_libraries(PluginChainManager
    PRIVATE
        PluginChainManagerData
        juce::juce_audio_utils
        juce::juce_audio_processors
        juce::juce_gui_extra
        juce::juce_dsp
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags
)

# Include directories
target_include_directories(PluginChainManager
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/src
)

#==============================================================================
# Plugin Scanner Helper - separate process for crash-safe plugin scanning
#==============================================================================
juce_add_console_app(PluginScannerHelper
    PRODUCT_NAME "PluginScannerHelper"
    COMPANY_NAME "PluginChainManager"
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

# Embed the helper after each bundle exists, then seal the complete development
# bundle. Linker-only signatures do not cover AU resources and CoreAudio rejects
# those bundles even when the raw Mach-O loads in another validator.
foreach(format IN ITEMS Standalone AU VST3)
    set(bundle_target PluginChainManager_${format})
    add_dependencies(${bundle_target} PluginScannerHelper)
    set_property(TARGET ${bundle_target} APPEND PROPERTY LINK_DEPENDS "$<TARGET_FILE:PluginScannerHelper>")
    if(APPLE)
        add_custom_command(TARGET ${bundle_target} POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_BUNDLE_DIR:${bundle_target}>/Contents/Resources"
            COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:PluginScannerHelper>"
                "$<TARGET_BUNDLE_DIR:${bundle_target}>/Contents/Resources/PluginScannerHelper"
            COMMAND /usr/bin/codesign --force --sign - "$<TARGET_BUNDLE_DIR:${bundle_target}>/Contents/Resources/PluginScannerHelper"
            COMMAND /usr/bin/codesign --force --sign - "$<TARGET_BUNDLE_DIR:${bundle_target}>"
            COMMENT "Embedding scanner and signing ${format} development bundle"
            VERBATIM)
    endif()
endforeach()
if(PROCHAIN_COPY_PLUGIN_AFTER_BUILD)
    juce_enable_copy_plugin_step(PluginChainManager)
endif()

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

add_executable(PluginChainManager_Tests
    tests/ChainIntegrationTests.cpp
    tests/ChainPerformanceBenchmark.cpp
    tests/AnalysisRegressionTests.cpp
    tests/AutomationBindingTests.cpp
    tests/ScannerUtilsTests.cpp
    tests/BlacklistTests.cpp
    tests/ChainNodeTests.cpp
    tests/DSPTests.cpp
    tests/PresetSerializationTests.cpp
    tests/ParameterDiscoveryTests.cpp
    tests/MacroTests.cpp
    tests/CrossoverTests.cpp
    src/core/PluginManager.cpp
    src/core/ChainNode.cpp
    src/core/ChainProcessor.cpp
    src/core/ChainRenderGraph.cpp
    src/core/ChainTransactions.cpp
    src/audio/HostedPluginProcessor.cpp
    src/audio/NodeMeterProcessor.cpp
    src/audio/FFTProcessor.cpp
    src/audio/WaveformCapture.cpp
    src/automation/AutomationBinding.cpp
    src/automation/ParameterProxyPool.cpp
    src/automation/MacroManager.cpp
    src/automation/ProxyParameter.cpp
    src/core/ParameterDiscovery.cpp
    src/audio/DryWetMixProcessor.cpp
    src/audio/BranchGainProcessor.cpp
    src/audio/CrossoverBandProcessor.cpp
    src/audio/LatencyCompensationProcessor.cpp
    src/audio/GainProcessor.cpp
    src/audio/AudioMeter.cpp
)

target_include_directories(PluginChainManager_Tests
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_compile_definitions(PluginChainManager_Tests
    PRIVATE
        JUCE_PLUGINHOST_VST3=1
        JUCE_PLUGINHOST_AU=1
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_DISPLAY_SPLASH_SCREEN=0
)

target_link_libraries(PluginChainManager_Tests
    PRIVATE
        Catch2::Catch2WithMain
        juce::juce_audio_processors
        juce::juce_audio_utils
        juce::juce_dsp
    PUBLIC
        juce::juce_recommended_config_flags
)

include(CTest)
list(APPEND CMAKE_MODULE_PATH ${catch2_SOURCE_DIR}/extras)
include(Catch)
catch_discover_tests(PluginChainManager_Tests)

# Exercise the actual wrapper and its state adapter without opening an editor.
add_executable(PluginChainManager_WrapperTests tests/WrapperStateTests.cpp tests/ChainPerformanceBenchmark.cpp)
target_compile_definitions(PluginChainManager_WrapperTests PRIVATE PROCHAIN_WRAPPER_BENCHMARK=1)
target_include_directories(PluginChainManager_WrapperTests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(PluginChainManager_WrapperTests PRIVATE
    PluginChainManager Catch2::Catch2WithMain juce::juce_audio_utils juce::juce_dsp)
catch_discover_tests(PluginChainManager_WrapperTests)

set(PROCHAIN_SANITIZER "" CACHE STRING "Optional address or thread sanitizer for native regression tests")
if(PROCHAIN_SANITIZER)
    if(NOT PROCHAIN_SANITIZER MATCHES "^(address|thread)$")
        message(FATAL_ERROR "PROCHAIN_SANITIZER must be address or thread")
    endif()
    target_compile_options(PluginChainManager_Tests PRIVATE -fsanitize=${PROCHAIN_SANITIZER} -fno-omit-frame-pointer -gline-tables-only)
    target_link_options(PluginChainManager_Tests PRIVATE -fsanitize=${PROCHAIN_SANITIZER})
endif()
