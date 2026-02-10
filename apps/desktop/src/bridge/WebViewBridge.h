#pragma once

#include <juce_gui_extra/juce_gui_extra.h>
#include "../core/PluginManager.h"
#include "../core/ChainProcessor.h"
#include "../core/PresetManager.h"
#include "../core/ParameterDiscovery.h"
#include "../core/InstanceRegistry.h"
#include "../core/MirrorManager.h"
#include <atomic>

class WaveformCapture;
class GainProcessor;
class AudioMeter;
class FFTProcessor;

class WebViewBridge : private juce::Timer,
                      private InstanceRegistry::Listener,
                      private MirrorManager::Listener
{
public:
    WebViewBridge(PluginManager& pluginManager,
                  ChainProcessor& chainProcessor,
                  PresetManager& presetManager);
    ~WebViewBridge() override;

    // Get options for WebBrowserComponent
    juce::WebBrowserComponent::Options getOptions();

    // Set the browser component (needed for sending events)
    void setBrowserComponent(juce::WebBrowserComponent* browser);

    // Set waveform capture reference (for streaming waveform data)
    void setWaveformCapture(WaveformCapture* capture) { waveformCapture = capture; }

    // Set gain processor and meter references
    void setGainProcessor(GainProcessor* processor) { gainProcessor = processor; }
    void setInputMeter(AudioMeter* meter) { inputMeter = meter; }
    void setOutputMeter(AudioMeter* meter) { outputMeter = meter; }

    // Set FFT processor reference (for streaming spectrum data)
    void setFFTProcessor(FFTProcessor* processor) { fftProcessor = processor; }

    // Set instance registry and mirror manager references
    void setInstanceRegistry(InstanceRegistry* reg, InstanceId id) {
        instanceRegistry = reg;
        instanceId = id;
        if (instanceRegistry)
            instanceRegistry->addListener(this);
    }
    void setMirrorManager(MirrorManager* mm) {
        mirrorManager = mm;
        if (mirrorManager)
            mirrorManager->addListener(this);
    }

    // Event emission to JavaScript
    void emitEvent(const juce::String& eventName, const juce::var& data);

    // Bind events from core components
    void bindCallbacks();

private:
    // Timer callback for waveform streaming
    void timerCallback() override;

    // InstanceRegistry::Listener
    void instanceRegistryChanged() override;

    // MirrorManager::Listener
    void mirrorStateChanged() override;
    void mirrorUpdateApplied() override;

    // Native function implementations
    juce::var getPluginList();
    juce::var startScan(bool rescanAll);
    juce::var getChainState();
    juce::var addPlugin(const juce::String& pluginId, int insertIndex);
    juce::var removePlugin(int slotIndex);
    juce::var movePlugin(int fromIndex, int toIndex);
    juce::var setSlotBypassed(int slotIndex, bool bypassed);
    juce::var openPluginUI(int slotIndex);
    juce::var closePluginUI(int slotIndex);
    juce::var getScanProgress();
    juce::var getPresetList();
    juce::var savePreset(const juce::String& name, const juce::String& category);
    juce::var loadPreset(const juce::String& path);
    juce::var deletePreset(const juce::String& path);
    juce::var getCategories();

    // Group operations
    juce::var createGroup(const juce::var& args);
    juce::var dissolveGroup(const juce::var& args);
    juce::var setGroupMode(const juce::var& args);
    juce::var setGroupDryWet(const juce::var& args);
    juce::var setBranchGain(const juce::var& args);
    juce::var setBranchSolo(const juce::var& args);
    juce::var setBranchMute(const juce::var& args);
    juce::var moveNodeOp(const juce::var& args);
    juce::var removeNodeOp(const juce::var& args);
    juce::var addPluginToGroup(const juce::var& args);
    juce::var setNodeBypassed(const juce::var& args);

    // Chain-level toggle controls
    juce::var toggleAllBypass();
    juce::var getAllBypassState();
    juce::var toggleAllPluginWindows();
    juce::var getPluginWindowState();

    // Blacklist management
    juce::var getBlacklist();
    juce::var addToBlacklist(const juce::String& pluginPath);
    juce::var removeFromBlacklist(const juce::String& pluginPath);
    juce::var clearBlacklist();

    // Waveform streaming
    juce::var startWaveformStream();
    juce::var stopWaveformStream();

    // Gain control
    juce::var setInputGain(float dB);
    juce::var setOutputGain(float dB);
    juce::var getGainSettings();
    juce::var calculateGainMatch();
    void setMatchLock(bool enabled);
    bool getMatchLockState() const { return matchLockEnabled.load(std::memory_order_relaxed); }

    // Parameter discovery
    juce::var discoverPluginParameters(int nodeId);

    // Instance awareness
    juce::var getOtherInstances();
    juce::var copyChainFromInstance(int targetInstanceId);

    // Mirror management
    juce::var startMirrorOp(int targetInstanceId);
    juce::var stopMirrorOp();
    juce::var getMirrorStateOp();

    PluginManager& pluginManager;
    ChainProcessor& chainProcessor;
    PresetManager& presetManager;
    juce::WebBrowserComponent* webBrowser = nullptr;
    WaveformCapture* waveformCapture = nullptr;
    GainProcessor* gainProcessor = nullptr;
    AudioMeter* inputMeter = nullptr;
    AudioMeter* outputMeter = nullptr;
    FFTProcessor* fftProcessor = nullptr;
    InstanceRegistry* instanceRegistry = nullptr;
    InstanceId instanceId = -1;
    MirrorManager* mirrorManager = nullptr;
    bool waveformStreamActive = false;
    std::atomic<bool> matchLockEnabled{false};
    std::atomic<float> matchLockReferenceOffset{0.0f};  // Target offset in dB, captured on enable
    std::atomic<int> matchLockStuckCounter{0};           // Frames at gain limit
    static constexpr int MaxStuckFrames = 120;           // 2 seconds at 60Hz

    // Resource provider
    std::optional<juce::WebBrowserComponent::Resource> resourceHandler(const juce::String& url);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(WebViewBridge)
};
