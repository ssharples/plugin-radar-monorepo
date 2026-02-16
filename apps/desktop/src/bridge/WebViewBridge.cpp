#include "WebViewBridge.h"
#include "ResourceProvider.h"
#include "../core/ChainNode.h"
#include "../core/ParameterDiscovery.h"
#include "../PluginProcessor.h"
#include "../PluginEditor.h"
#include "../audio/WaveformCapture.h"
#include "../audio/GainProcessor.h"
#include "../audio/AudioMeter.h"
#include "../audio/FFTProcessor.h"
#include "../audio/NodeMeterProcessor.h"
#include "../utils/ProChainLogger.h"
#include <cmath>

WebViewBridge::WebViewBridge(PluginManager& pm,
                             ChainProcessor& cp,
                             PresetManager& prm,
                             GroupTemplateManager& gtm)
    : pluginManager(pm)
    , chainProcessor(cp)
    , presetManager(prm)
    , groupTemplateManager(gtm)
{
    bindCallbacks();
}

WebViewBridge::~WebViewBridge() noexcept
{
    // Invalidate alive flag so async lambdas bail out
    aliveFlag->store(false, std::memory_order_release);

    stopTimer();

    // Clear all callbacks to prevent use-after-free
    chainProcessor.onChainChanged = nullptr;
    chainProcessor.onLatencyChanged = nullptr;
    chainProcessor.onParameterBindingChanged = nullptr;
    chainProcessor.onUnbindSlot = nullptr;
    chainProcessor.onPluginParameterChangeSettled = nullptr;

    if (instanceRegistry)
        instanceRegistry->removeListener(this);
    if (mirrorManager)
        mirrorManager->removeListener(this);
}

juce::WebBrowserComponent::Options WebViewBridge::getOptions()
{
    return juce::WebBrowserComponent::Options()
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withNativeIntegrationEnabled()
        .withNativeFunction("getPluginList", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getPluginList());
        })
        .withNativeFunction("startScan", [this](const juce::Array<juce::var>& args,
                                                 juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            #if JUCE_DEBUG
            std::cerr << "Native startScan called!" << std::endl;
            #endif
            bool rescanAll = args.size() > 0 ? static_cast<bool>(args[0]) : false;
            auto result = startScan(rescanAll);
            #if JUCE_DEBUG
            std::cerr << "startScan returning" << std::endl;
            #endif
            completion(result);
        })
        .withNativeFunction("getChainState", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getChainState());
        })
        .withNativeFunction("getTotalLatencySamples", [this](const juce::Array<juce::var>& args,
                                                              juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(chainProcessor.getTotalLatencySamples());
        })
        .withNativeFunction("addPlugin", [this](const juce::Array<juce::var>& args,
                                                 juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
            {
                auto pluginId = args[0].toString();
                int insertIndex = args.size() > 1 ? static_cast<int>(args[1]) : -1;
                completion(addPlugin(pluginId, insertIndex));
            }
            else
            {
                completion(juce::var());
            }
        })
        .withNativeFunction("removePlugin", [this](const juce::Array<juce::var>& args,
                                                    juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(removePlugin(static_cast<int>(args[0])));
            else
                completion(juce::var());
        })
        .withNativeFunction("movePlugin", [this](const juce::Array<juce::var>& args,
                                                  juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 2)
                completion(movePlugin(static_cast<int>(args[0]), static_cast<int>(args[1])));
            else
                completion(juce::var());
        })
        .withNativeFunction("setSlotBypassed", [this](const juce::Array<juce::var>& args,
                                                       juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 2)
                completion(setSlotBypassed(static_cast<int>(args[0]), static_cast<bool>(args[1])));
            else
                completion(juce::var());
        })
        .withNativeFunction("openPluginUI", [this](const juce::Array<juce::var>& args,
                                                    juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(openPluginUI(static_cast<int>(args[0])));
            else
                completion(juce::var());
        })
        .withNativeFunction("closePluginUI", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(closePluginUI(static_cast<int>(args[0])));
            else
                completion(juce::var());
        })
        .withNativeFunction("getScanProgress", [this](const juce::Array<juce::var>& args,
                                                       juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getScanProgress());
        })
        .withNativeFunction("getPresetList", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getPresetList());
        })
        .withNativeFunction("savePreset", [this](const juce::Array<juce::var>& args,
                                                  juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 2)
                completion(savePreset(args[0].toString(), args[1].toString()));
            else
                completion(juce::var());
        })
        .withNativeFunction("loadPreset", [this](const juce::Array<juce::var>& args,
                                                  juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(loadPreset(args[0].toString()));
            else
                completion(juce::var());
        })
        .withNativeFunction("deletePreset", [this](const juce::Array<juce::var>& args,
                                                    juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(deletePreset(args[0].toString()));
            else
                completion(juce::var());
        })
        .withNativeFunction("renamePreset", [this](const juce::Array<juce::var>& args,
                                                    juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 2)
                completion(renamePreset(args[0].toString(), args[1].toString()));
            else
                completion(juce::var());
        })
        .withNativeFunction("getCategories", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getCategories());
        })
        // ============================================
        // Group Template Operations
        // ============================================
        .withNativeFunction("getGroupTemplateList", [this](const juce::Array<juce::var>& args,
                                                            juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getGroupTemplateList());
        })
        .withNativeFunction("saveGroupTemplate", [this](const juce::Array<juce::var>& args,
                                                         juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(saveGroupTemplate(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("loadGroupTemplate", [this](const juce::Array<juce::var>& args,
                                                         juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(loadGroupTemplate(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("deleteGroupTemplate", [this](const juce::Array<juce::var>& args,
                                                           juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(deleteGroupTemplate(args[0].toString()));
            else
                completion(juce::var());
        })
        .withNativeFunction("getGroupTemplateCategories", [this](const juce::Array<juce::var>& args,
                                                                  juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getGroupTemplateCategories());
        })
        .withNativeFunction("getBlacklist", [this](const juce::Array<juce::var>& args,
                                                    juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getBlacklist());
        })
        .withNativeFunction("addToBlacklist", [this](const juce::Array<juce::var>& args,
                                                      juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(addToBlacklist(args[0].toString()));
            else
                completion(juce::var());
        })
        .withNativeFunction("removeFromBlacklist", [this](const juce::Array<juce::var>& args,
                                                           juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(removeFromBlacklist(args[0].toString()));
            else
                completion(juce::var());
        })
        .withNativeFunction("clearBlacklist", [this](const juce::Array<juce::var>& args,
                                                      juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(clearBlacklist());
        })
        .withNativeFunction("startWaveformStream", [this](const juce::Array<juce::var>& args,
                                                           juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(startWaveformStream());
        })
        .withNativeFunction("stopWaveformStream", [this](const juce::Array<juce::var>& args,
                                                          juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(stopWaveformStream());
        })
        .withNativeFunction("setInputGain", [this](const juce::Array<juce::var>& args,
                                                    juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(setInputGain(static_cast<float>(args[0])));
            else
                completion(juce::var());
        })
        .withNativeFunction("setOutputGain", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(setOutputGain(static_cast<float>(args[0])));
            else
                completion(juce::var());
        })
        .withNativeFunction("getGainSettings", [this](const juce::Array<juce::var>& args,
                                                       juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getGainSettings());
        })
        .withNativeFunction("calculateGainMatch", [this](const juce::Array<juce::var>& args,
                                                          juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(calculateGainMatch());
        })
        .withNativeFunction("setMatchLock", [this](const juce::Array<juce::var>& args,
                                                    juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
            {
                setMatchLock(static_cast<bool>(args[0]));
                auto* result = new juce::DynamicObject();
                result->setProperty("success", true);
                result->setProperty("matchLockEnabled", matchLockEnabled.load(std::memory_order_relaxed));
                completion(juce::var(result));
            }
            else
            {
                completion(juce::var());
            }
        })
        .withNativeFunction("getMatchLockState", [this](const juce::Array<juce::var>& args,
                                                         juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            auto* result = new juce::DynamicObject();
            result->setProperty("matchLockEnabled", matchLockEnabled.load(std::memory_order_relaxed));
            completion(juce::var(result));
        })
        .withNativeFunction("autoCalibrate", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(autoCalibrate(static_cast<float>(args[0])));
            else
                completion(juce::var());
        })
        .withNativeFunction("setMasterDryWet", [this](const juce::Array<juce::var>& args,
                                                       juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1 && mainProcessor)
            {
                float mix = static_cast<float>(args[0]); // 0.0 to 1.0
                auto* processor = dynamic_cast<PluginChainManagerProcessor*>(mainProcessor);
                if (processor)
                {
                    processor->getMasterDryWetProcessor().setMix(mix);
                    auto* result = new juce::DynamicObject();
                    result->setProperty("success", true);
                    completion(juce::var(result));
                }
                else
                {
                    auto* result = new juce::DynamicObject();
                    result->setProperty("success", false);
                    completion(juce::var(result));
                }
            }
            else
            {
                auto* result = new juce::DynamicObject();
                result->setProperty("success", false);
                completion(juce::var(result));
            }
        })
        .withNativeFunction("getMasterDryWet", [this](const juce::Array<juce::var>& args,
                                                       juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            if (mainProcessor)
            {
                auto* processor = dynamic_cast<PluginChainManagerProcessor*>(mainProcessor);
                if (processor)
                    completion(juce::var(processor->getMasterDryWetProcessor().getMix()));
                else
                    completion(juce::var(1.0f)); // Default to 100% wet
            }
            else
                completion(juce::var(1.0f)); // Default to 100% wet
        })
        .withNativeFunction("getSampleRate", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            if (mainProcessor)
                completion(juce::var(mainProcessor->getSampleRate()));
            else
                completion(juce::var(44100.0)); // Default fallback
        })
        .withNativeFunction("resetAllNodePeaks", [this](const juce::Array<juce::var>& args,
                                                         juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            if (inputMeter)
                inputMeter->reset();
            if (outputMeter)
                outputMeter->reset();
            chainProcessor.resetAllNodePeaks();
            auto* result = new juce::DynamicObject();
            result->setProperty("success", true);
            completion(juce::var(result));
        })
        // Cloud sharing - export/import chains with preset data
        .withNativeFunction("exportChain", [this](const juce::Array<juce::var>& args,
                                                   juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(chainProcessor.exportChainWithPresets());
        })
        .withNativeFunction("importChain", [this](const juce::Array<juce::var>& args,
                                                   juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
            {
                chainProcessor.setParameterWatcherSuppressed(true);
                auto importResult = chainProcessor.importChainWithPresets(args[0]);
                chainProcessor.setParameterWatcherSuppressed(false);
                auto* result = new juce::DynamicObject();
                result->setProperty("success", importResult.success);
                result->setProperty("totalSlots", importResult.totalSlots);
                result->setProperty("loadedSlots", importResult.loadedSlots);
                result->setProperty("failedSlots", importResult.failedSlots);
                if (importResult.success)
                    result->setProperty("chainState", getChainState());
                else
                    result->setProperty("error", "Failed to import chain");

                // Add per-slot failure details
                if (!importResult.failures.empty())
                {
                    juce::Array<juce::var> failuresArray;
                    for (const auto& f : importResult.failures)
                    {
                        auto* fObj = new juce::DynamicObject();
                        fObj->setProperty("position", f.position);
                        fObj->setProperty("pluginName", f.pluginName);
                        fObj->setProperty("reason", f.reason);
                        failuresArray.add(juce::var(fObj));
                    }
                    result->setProperty("failures", failuresArray);
                }

                completion(juce::var(result));
            }
            else
            {
                auto* result = new juce::DynamicObject();
                result->setProperty("success", false);
                result->setProperty("error", "No data provided");
                completion(juce::var(result));
            }
        })
        // Binary snapshots (fast A/B/C/D recall)
        .withNativeFunction("captureSnapshot", [this](const juce::Array<juce::var>& args,
                                                      juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            auto snapshot = chainProcessor.captureSnapshot();
            // Convert MemoryBlock to Base64 for JS transfer
            auto base64 = juce::Base64::toBase64(snapshot.getData(), snapshot.getSize());
            completion(juce::var(base64));
        })
        .withNativeFunction("restoreSnapshot", [this](const juce::Array<juce::var>& args,
                                                       juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1 && args[0].isString())
            {
                // Decode Base64 to MemoryBlock
                juce::MemoryOutputStream outStream;
                if (juce::Base64::convertFromBase64(outStream, args[0].toString()))
                {
                    juce::MemoryBlock snapshot(outStream.getData(), outStream.getDataSize());
                    chainProcessor.setParameterWatcherSuppressed(true);
                    chainProcessor.restoreSnapshot(snapshot);
                    chainProcessor.setParameterWatcherSuppressed(false);

                    auto* result = new juce::DynamicObject();
                    result->setProperty("success", true);
                    result->setProperty("chainState", getChainState());
                    completion(juce::var(result));
                }
                else
                {
                    auto* result = new juce::DynamicObject();
                    result->setProperty("success", false);
                    result->setProperty("error", "Failed to decode snapshot data");
                    completion(juce::var(result));
                }
            }
            else
            {
                auto* result = new juce::DynamicObject();
                result->setProperty("success", false);
                result->setProperty("error", "Invalid snapshot data");
                completion(juce::var(result));
            }
        })
        .withNativeFunction("getSlotPreset", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
            {
                int slotIndex = static_cast<int>(args[0]);
                auto presetData = chainProcessor.getSlotPresetData(slotIndex);
                auto* result = new juce::DynamicObject();
                result->setProperty("success", presetData.isNotEmpty());
                result->setProperty("presetData", presetData);
                result->setProperty("sizeBytes", presetData.length() * 3 / 4); // Approximate decoded size
                completion(juce::var(result));
            }
            else
            {
                completion(juce::var());
            }
        })
        .withNativeFunction("setSlotPreset", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 2)
            {
                int slotIndex = static_cast<int>(args[0]);
                auto presetData = args[1].toString();
                bool success = chainProcessor.setSlotPresetData(slotIndex, presetData);
                auto* result = new juce::DynamicObject();
                result->setProperty("success", success);
                completion(juce::var(result));
            }
            else
            {
                auto* result = new juce::DynamicObject();
                result->setProperty("success", false);
                result->setProperty("error", "Invalid arguments");
                completion(juce::var(result));
            }
        })
        // ============================================
        // Group Operations
        // ============================================
        .withNativeFunction("createGroup", [this](const juce::Array<juce::var>& args,
                                                   juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(createGroup(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("dissolveGroup", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(dissolveGroup(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("setGroupMode", [this](const juce::Array<juce::var>& args,
                                                    juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(setGroupMode(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("setGroupDryWet", [this](const juce::Array<juce::var>& args,
                                                      juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(setGroupDryWet(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("setGroupDucking", [this](const juce::Array<juce::var>& args,
                                                       juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(setGroupDucking(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("setBranchGain", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(setBranchGain(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("setBranchSolo", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(setBranchSolo(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("setBranchMute", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(setBranchMute(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("moveNode", [this](const juce::Array<juce::var>& args,
                                                juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(moveNodeOp(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("removeNode", [this](const juce::Array<juce::var>& args,
                                                  juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(removeNodeOp(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("addPluginToGroup", [this](const juce::Array<juce::var>& args,
                                                        juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(addPluginToGroup(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("setNodeBypassed", [this](const juce::Array<juce::var>& args,
                                                       juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(setNodeBypassed(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("setNodeInputGain", [this](const juce::Array<juce::var>& args,
                                                        juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(setNodeInputGain(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("setNodeOutputGain", [this](const juce::Array<juce::var>& args,
                                                         juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(setNodeOutputGain(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("setNodeDryWet", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(setNodeDryWet(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("setNodeSidechainSource", [this](const juce::Array<juce::var>& args,
                                                              juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(setNodeSidechainSource(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("setNodeMidSideMode", [this](const juce::Array<juce::var>& args,
                                                        juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(setNodeMidSideMode(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("setNodeMute", [this](const juce::Array<juce::var>& args,
                                                   juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(setNodeMute(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("duplicateNode", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
            {
                auto parsed = juce::JSON::parse(args[0].toString());
                auto* obj = parsed.getDynamicObject();
                if (obj && obj->hasProperty("nodeId"))
                {
                    int nodeId = static_cast<int>(obj->getProperty("nodeId"));
                    bool success = chainProcessor.duplicateNode(nodeId);
                    auto* result = new juce::DynamicObject();
                    result->setProperty("success", success);
                    if (success)
                        result->setProperty("chainState", chainProcessor.getChainStateAsJson());
                    completion(juce::var(result));
                }
                else
                    completion(juce::var());
            }
            else
                completion(juce::var());
        })
        // ============================================
        // Chain-level toggle controls
        // ============================================
        .withNativeFunction("toggleAllBypass", [this](const juce::Array<juce::var>& args,
                                                       juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(toggleAllBypass());
        })
        .withNativeFunction("getAllBypassState", [this](const juce::Array<juce::var>& args,
                                                         juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getAllBypassState());
        })
        .withNativeFunction("toggleAllPluginWindows", [this](const juce::Array<juce::var>& args,
                                                              juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(toggleAllPluginWindows());
        })
        .withNativeFunction("getPluginWindowState", [this](const juce::Array<juce::var>& args,
                                                            juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getPluginWindowState());
        })
        // ============================================
        // Parameter Discovery / Auto-Mapping
        // ============================================
        .withNativeFunction("discoverPluginParameters", [this](const juce::Array<juce::var>& args,
                                                                juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
            {
                int nodeId = static_cast<int>(args[0]);
                completion(discoverPluginParameters(nodeId));
            }
            else
            {
                auto* result = new juce::DynamicObject();
                result->setProperty("success", false);
                result->setProperty("error", "Missing nodeId argument");
                completion(juce::var(result));
            }
        })
        // ============================================
        // Parameter Translation / Plugin Swap
        // ============================================
        .withNativeFunction("readPluginParameters", [this](const juce::Array<juce::var>& args,
                                                            juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
            {
                int nodeId = static_cast<int>(args[0]);
                auto* processor = chainProcessor.getNodeProcessor(nodeId);
                if (processor)
                {
                    auto* result = new juce::DynamicObject();
                    result->setProperty("success", true);
                    
                    juce::Array<juce::var> paramArray;
                    auto& params = processor->getParameters();
                    for (int i = 0; i < params.size(); ++i)
                    {
                        auto* param = params[i];
                        auto* paramObj = new juce::DynamicObject();
                        paramObj->setProperty("name", param->getName(256));
                        paramObj->setProperty("index", i);
                        paramObj->setProperty("normalizedValue", param->getValue());
                        paramObj->setProperty("label", param->getLabel());
                        paramObj->setProperty("text", param->getCurrentValueAsText());
                        paramObj->setProperty("numSteps", param->getNumSteps());
                        paramArray.add(juce::var(paramObj));
                    }
                    result->setProperty("parameters", paramArray);
                    result->setProperty("paramCount", params.size());
                    completion(juce::var(result));
                }
                else
                {
                    auto* result = new juce::DynamicObject();
                    result->setProperty("success", false);
                    result->setProperty("error", "No processor found for node " + juce::String(nodeId));
                    completion(juce::var(result));
                }
            }
            else
            {
                auto* result = new juce::DynamicObject();
                result->setProperty("success", false);
                result->setProperty("error", "Missing nodeId argument");
                completion(juce::var(result));
            }
        })
        .withNativeFunction("applyPluginParameters", [this](const juce::Array<juce::var>& args,
                                                             juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            // args[0] = JSON string: { nodeId: number, params: [{paramIndex: number, value: number}] }
            if (args.size() >= 1)
            {
                auto json = juce::JSON::parse(args[0].toString());
                int nodeId = static_cast<int>(json.getProperty("nodeId", -1));
                auto paramsList = json.getProperty("params", juce::var());
                
                auto* processor = chainProcessor.getNodeProcessor(nodeId);
                if (processor && paramsList.isArray())
                {
                    auto& procParams = processor->getParameters();
                    int applied = 0;
                    
                    for (int i = 0; i < paramsList.size(); ++i)
                    {
                        auto paramEntry = paramsList[i];
                        int paramIndex = static_cast<int>(paramEntry.getProperty("paramIndex", -1));
                        float value = static_cast<float>(paramEntry.getProperty("value", 0.0f));
                        
                        if (paramIndex >= 0 && paramIndex < procParams.size())
                        {
                            procParams[paramIndex]->setValue(value);
                            applied++;
                        }
                    }
                    
                    auto* result = new juce::DynamicObject();
                    result->setProperty("success", true);
                    result->setProperty("appliedCount", applied);
                    completion(juce::var(result));
                }
                else
                {
                    auto* result = new juce::DynamicObject();
                    result->setProperty("success", false);
                    result->setProperty("error", "Invalid nodeId or params");
                    completion(juce::var(result));
                }
            }
            else
            {
                auto* result = new juce::DynamicObject();
                result->setProperty("success", false);
                result->setProperty("error", "Missing arguments");
                completion(juce::var(result));
            }
        })
        .withNativeFunction("swapPluginInChain", [this](const juce::Array<juce::var>& args,
                                                         juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            // args[0] = JSON string: { nodeId: number, newPluginUid: string, translatedParams: [{paramIndex, value}] }
            if (args.size() >= 1)
            {
                auto json = juce::JSON::parse(args[0].toString());
                int nodeId = static_cast<int>(json.getProperty("nodeId", -1));
                auto newPluginUid = json.getProperty("newPluginUid", "").toString();
                auto translatedParams = json.getProperty("translatedParams", juce::var());
                
                // Find the position of this node in the flat plugin list
                auto flatPlugins = chainProcessor.getFlatPluginList();
                int flatIndex = -1;
                {
                    const auto* targetNode = ChainNodeHelpers::findById(chainProcessor.getRootNode(), nodeId);
                    if (targetNode && targetNode->isPlugin())
                    {
                        const auto* targetLeaf = &targetNode->getPlugin();
                        for (int i = 0; i < static_cast<int>(flatPlugins.size()); ++i)
                        {
                            if (flatPlugins[i] == targetLeaf)
                            {
                                flatIndex = i;
                                break;
                            }
                        }
                    }
                }
                
                if (flatIndex < 0)
                {
                    auto* result = new juce::DynamicObject();
                    result->setProperty("success", false);
                    result->setProperty("error", "Node not found in chain");
                    completion(juce::var(result));
                    return;
                }
                
                // Find the new plugin description
                auto pluginList = pluginManager.getKnownPlugins().getTypes();
                const juce::PluginDescription* newDesc = nullptr;
                for (auto& desc : pluginList)
                {
                    if (desc.createIdentifierString() == newPluginUid ||
                        juce::String(desc.uniqueId) == newPluginUid)
                    {
                        newDesc = &desc;
                        break;
                    }
                }
                
                if (!newDesc)
                {
                    auto* result = new juce::DynamicObject();
                    result->setProperty("success", false);
                    result->setProperty("error", "New plugin not found: " + newPluginUid);
                    completion(juce::var(result));
                    return;
                }
                
                // Remove old, add new at same position
                bool removed = chainProcessor.removePlugin(flatIndex);
                if (!removed)
                {
                    auto* result = new juce::DynamicObject();
                    result->setProperty("success", false);
                    result->setProperty("error", "Failed to remove old plugin");
                    completion(juce::var(result));
                    return;
                }
                
                bool added = chainProcessor.addPlugin(*newDesc, flatIndex);
                if (!added)
                {
                    auto* result = new juce::DynamicObject();
                    result->setProperty("success", false);
                    result->setProperty("error", "Failed to add new plugin");
                    completion(juce::var(result));
                    return;
                }
                
                // Apply translated parameters to the new plugin
                int appliedCount = 0;
                if (translatedParams.isArray())
                {
                    // Get the new processor (should be at the same flat index)
                    auto* newProcessor = chainProcessor.getSlotProcessor(flatIndex);
                    if (newProcessor)
                    {
                        auto& procParams = newProcessor->getParameters();
                        for (int i = 0; i < translatedParams.size(); ++i)
                        {
                            auto paramEntry = translatedParams[i];
                            int paramIndex = static_cast<int>(paramEntry.getProperty("paramIndex", -1));
                            float value = static_cast<float>(paramEntry.getProperty("value", 0.0f));
                            
                            if (paramIndex >= 0 && paramIndex < procParams.size())
                            {
                                procParams[paramIndex]->setValue(value);
                                appliedCount++;
                            }
                        }
                    }
                }
                
                auto* result = new juce::DynamicObject();
                result->setProperty("success", true);
                result->setProperty("appliedParams", appliedCount);
                result->setProperty("chainState", getChainState());
                completion(juce::var(result));
            }
            else
            {
                auto* result = new juce::DynamicObject();
                result->setProperty("success", false);
                result->setProperty("error", "Missing arguments");
                completion(juce::var(result));
            }
        })
        // ============================================
        // Instance Awareness & Chain Copy/Mirror
        // ============================================
        .withNativeFunction("getOtherInstances", [this](const juce::Array<juce::var>& args,
                                                         juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getOtherInstances());
        })
        .withNativeFunction("copyChainFromInstance", [this](const juce::Array<juce::var>& args,
                                                             juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(copyChainFromInstance(static_cast<int>(args[0])));
            else
                completion(juce::var());
        })
        .withNativeFunction("sendChainToInstance", [this](const juce::Array<juce::var>& args,
                                                           juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(sendChainToInstance(static_cast<int>(args[0])));
            else
                completion(juce::var());
        })
        .withNativeFunction("startMirror", [this](const juce::Array<juce::var>& args,
                                                   juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(startMirrorOp(static_cast<int>(args[0])));
            else
                completion(juce::var());
        })
        .withNativeFunction("stopMirror", [this](const juce::Array<juce::var>& args,
                                                  juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(stopMirrorOp());
        })
        .withNativeFunction("getMirrorState", [this](const juce::Array<juce::var>& args,
                                                      juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getMirrorStateOp());
        })
        .withNativeFunction("setMeterMode", [this](const juce::Array<juce::var>& args,
                                                    juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            // PHASE 2: Conditional metering - set global meter mode
            // Args: mode string ("peak" or "full")
            if (args.size() >= 1)
            {
                juce::String mode = args[0].toString();
                ChainProcessor::MeterMode meterMode = mode == "peak"
                    ? ChainProcessor::MeterMode::PeakOnly
                    : ChainProcessor::MeterMode::FullLUFS;
                chainProcessor.setGlobalMeterMode(meterMode);
                completion(true);
            }
            else
            {
                completion(false);
            }
        })
        // ============================================
        // Oversampling Control
        // ============================================
        .withNativeFunction("getOversamplingFactor", [this](const juce::Array<juce::var>& args,
                                                             juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            if (mainProcessor)
            {
                auto* processor = dynamic_cast<PluginChainManagerProcessor*>(mainProcessor);
                if (processor)
                    completion(juce::var(processor->getOversamplingFactor()));
                else
                    completion(juce::var(0));
            }
            else
                completion(juce::var(0));
        })
        .withNativeFunction("setOversamplingFactor", [this](const juce::Array<juce::var>& args,
                                                             juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1 && mainProcessor)
            {
                auto* processor = dynamic_cast<PluginChainManagerProcessor*>(mainProcessor);
                if (processor)
                {
                    int factor = static_cast<int>(args[0]);
                    processor->setOversamplingFactor(factor);
                    auto* result = new juce::DynamicObject();
                    result->setProperty("success", true);
                    result->setProperty("factor", processor->getOversamplingFactor());
                    result->setProperty("latencyMs", processor->getOversamplingLatencyMs());
                    completion(juce::var(result));
                }
                else
                {
                    auto* result = new juce::DynamicObject();
                    result->setProperty("success", false);
                    result->setProperty("error", "Processor not available");
                    completion(juce::var(result));
                }
            }
            else
            {
                auto* result = new juce::DynamicObject();
                result->setProperty("success", false);
                result->setProperty("error", "Invalid arguments");
                completion(juce::var(result));
            }
        })
        .withNativeFunction("getOversamplingLatencyMs", [this](const juce::Array<juce::var>& args,
                                                                juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            if (mainProcessor)
            {
                auto* processor = dynamic_cast<PluginChainManagerProcessor*>(mainProcessor);
                if (processor)
                    completion(juce::var(processor->getOversamplingLatencyMs()));
                else
                    completion(juce::var(0.0f));
            }
            else
                completion(juce::var(0.0f));
        })
        .withNativeFunction("refreshLatency", [this](const juce::Array<juce::var>& args,
                                                      juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            chainProcessor.refreshLatencyCompensation();
            completion(true);
        })
        // ============================================
        // Custom Scan Paths
        // ============================================
        .withNativeFunction("getCustomScanPaths", [this](const juce::Array<juce::var>& args,
                                                          juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getCustomScanPaths());
        })
        .withNativeFunction("addCustomScanPath", [this](const juce::Array<juce::var>& args,
                                                         juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(addCustomScanPathOp(args[0]));
            else
                completion(juce::var());
        })
        .withNativeFunction("removeCustomScanPath", [this](const juce::Array<juce::var>& args,
                                                            juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(removeCustomScanPathOp(args[0]));
            else
                completion(juce::var());
        })
        // ============================================
        // Plugin Deactivation / Removal
        // ============================================
        .withNativeFunction("deactivatePlugin", [this](const juce::Array<juce::var>& args,
                                                        juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(deactivatePluginOp(args[0].toString()));
            else
                completion(juce::var());
        })
        .withNativeFunction("reactivatePlugin", [this](const juce::Array<juce::var>& args,
                                                        juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(reactivatePluginOp(args[0].toString()));
            else
                completion(juce::var());
        })
        .withNativeFunction("getDeactivatedPlugins", [this](const juce::Array<juce::var>& args,
                                                             juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getDeactivatedPlugins());
        })
        .withNativeFunction("removeKnownPlugin", [this](const juce::Array<juce::var>& args,
                                                          juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(removeKnownPluginOp(args[0].toString()));
            else
                completion(juce::var());
        })
        .withNativeFunction("getPluginListIncludingDeactivated", [this](const juce::Array<juce::var>& args,
                                                                         juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getPluginListIncludingDeactivated());
        })
        // ============================================
        // Auto-Scan Detection
        // ============================================
        .withNativeFunction("enableAutoScan", [this](const juce::Array<juce::var>& args,
                                                      juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (args.size() >= 1)
                completion(enableAutoScanOp(static_cast<int>(args[0])));
            else
                completion(juce::var());
        })
        .withNativeFunction("disableAutoScan", [this](const juce::Array<juce::var>& args,
                                                       juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(disableAutoScanOp());
        })
        .withNativeFunction("getAutoScanState", [this](const juce::Array<juce::var>& args,
                                                        juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getAutoScanState());
        })
        .withNativeFunction("checkForNewPlugins", [this](const juce::Array<juce::var>& args,
                                                          juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(checkForNewPluginsOp());
        })
        .withNativeFunction("setFFTEnabled", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            if (fftProcessor && args.size() > 0)
                fftProcessor->setEnabled(static_cast<bool>(args[0]));
            completion(juce::var());
        })
        // ============================================
        // Inline Editor Mode
        // ============================================
        .withNativeFunction("openPluginInline", [this](const juce::Array<juce::var>& args,
                                                        juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            auto* result = new juce::DynamicObject();
            if (editor && args.size() >= 1)
            {
                int nodeId = static_cast<int>(args[0]);
                bool success = editor->showInlineEditor(nodeId);
                result->setProperty("success", success);
                if (!success)
                    result->setProperty("error", "Plugin has no GUI or node not found");
            }
            else
            {
                result->setProperty("success", false);
                result->setProperty("error", "Missing nodeId argument or editor not available");
            }
            completion(juce::var(result));
        })
        .withNativeFunction("closePluginInline", [this](const juce::Array<juce::var>& args,
                                                         juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            auto* result = new juce::DynamicObject();
            if (editor)
            {
                editor->hideInlineEditor();
                result->setProperty("success", true);
            }
            else
            {
                result->setProperty("success", false);
                result->setProperty("error", "Editor not available");
            }
            completion(juce::var(result));
        })
        .withNativeFunction("getInlineEditorState", [this](const juce::Array<juce::var>& args,
                                                            juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            auto* result = new juce::DynamicObject();
            if (editor)
            {
                result->setProperty("mode", editor->isInInlineEditorMode() ? "plugin" : "webview");
                if (editor->isInInlineEditorMode())
                    result->setProperty("nodeId", editor->getInlineEditorNodeId());
            }
            else
            {
                result->setProperty("mode", "webview");
            }
            completion(juce::var(result));
        })
        // (Dynamic sidebar width removed — sidebar is fixed at 44px)
        // ============================================
        // Search Overlay
        // ============================================
        .withNativeFunction("showSearchOverlay", [this](const juce::Array<juce::var>& args,
                                                         juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            auto* result = new juce::DynamicObject();
            if (editor && editor->isInInlineEditorMode())
            {
                editor->showSearchOverlay();
                result->setProperty("success", true);
            }
            else
            {
                result->setProperty("success", false);
                result->setProperty("error", "Not in inline editor mode or editor not available");
            }
            completion(juce::var(result));
        })
        .withNativeFunction("hideSearchOverlay", [this](const juce::Array<juce::var>& args,
                                                         juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            auto* result = new juce::DynamicObject();
            if (editor)
            {
                editor->hideSearchOverlay();
                result->setProperty("success", true);
            }
            else
            {
                result->setProperty("success", false);
                result->setProperty("error", "Editor not available");
            }
            completion(juce::var(result));
        })
        .withUserScript("document.documentElement.style.backgroundColor='#000000';document.body&&(document.body.style.backgroundColor='#000000');")
        .withResourceProvider([this](const juce::String& url) {
            return resourceHandler(url);
        }, juce::URL("https://ui.local").getOrigin());
}

void WebViewBridge::setBrowserComponent(juce::WebBrowserComponent* browser)
{
    webBrowser = browser;
}

void WebViewBridge::bindCallbacks()
{
    pluginManager.onScanComplete = [this]() {
        // Send final progress event to indicate scan is complete
        auto* progressObj = new juce::DynamicObject();
        progressObj->setProperty("progress", 1.0f);
        progressObj->setProperty("currentPlugin", "");
        progressObj->setProperty("scanning", false);
        emitEvent("scanProgress", juce::var(progressObj));

        emitEvent("pluginListChanged", getPluginList());
    };

    pluginManager.onScanProgress = [this](float progress, const juce::String& currentPlugin) {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("progress", progress);
        obj->setProperty("currentPlugin", currentPlugin);
        obj->setProperty("scanning", true);
        emitEvent("scanProgress", juce::var(obj));

        // Also emit updated plugin list so UI can show plugins as they're discovered
        emitEvent("pluginListChanged", getPluginList());
    };

    // Wrap existing onChainChanged callback (set by PluginProcessor for registry updates)
    auto existingChainCallback = chainProcessor.onChainChanged;
    chainProcessor.onChainChanged = [this, existingChainCallback]() {
        if (existingChainCallback) existingChainCallback();
        emitEvent("chainChanged", getChainState());
        // Propagate structural changes to mirror partners
        if (mirrorManager)
            mirrorManager->onLocalChainChanged();

        // Auto-close inline editor if the displayed node was removed from the chain
        if (editor && editor->isInInlineEditorMode())
        {
            auto activeNodeId = editor->getInlineEditorNodeId();
            auto* node = ChainNodeHelpers::findById(chainProcessor.getRootNode(), activeNodeId);
            if (!node || !node->isPlugin())
                editor->hideInlineEditor();
        }
    };

    // Emit event when child plugin parameters settle (for undo/redo tracking)
    chainProcessor.onPluginParameterChangeSettled = [this](const juce::String& beforeSnapshot) {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("beforeSnapshot", beforeSnapshot);
        emitEvent("pluginParameterChangeSettled", juce::var(obj));
    };

    presetManager.onPresetListChanged = [this]() {
        emitEvent("presetListChanged", getPresetList());
    };

    presetManager.onPresetLoaded = [this](const PresetInfo* preset) {
        if (preset)
            emitEvent("presetLoaded", preset->toJson());
        else
            emitEvent("presetLoaded", juce::var());
    };

    groupTemplateManager.onTemplateListChanged = [this]() {
        emitEvent("templateListChanged", getGroupTemplateList());
    };

    pluginManager.onPluginBlacklisted = [this](const juce::String& pluginPath, ScanFailureReason reason) {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("path", pluginPath);
        obj->setProperty("name", juce::File(pluginPath).getFileNameWithoutExtension());

        // Map enum to string for JS consumption
        juce::String reasonStr;
        switch (reason)
        {
            case ScanFailureReason::Crash:       reasonStr = "crash"; break;
            case ScanFailureReason::ScanFailure: reasonStr = "scan-failure"; break;
            case ScanFailureReason::Timeout:     reasonStr = "timeout"; break;
            default:                             reasonStr = "crash"; break;
        }
        obj->setProperty("reason", reasonStr);

        emitEvent("pluginBlacklisted", juce::var(obj));
        emitEvent("blacklistChanged", getBlacklist());
    };

    pluginManager.onDeactivationChanged = [this]() {
        emitEvent("deactivationChanged", pluginManager.getDeactivatedPluginsAsJson());
        emitEvent("pluginListChanged", getPluginList());
    };

    pluginManager.onNewPluginsDetected = [this](int count, const juce::var& plugins) {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("count", count);
        obj->setProperty("plugins", plugins);
        emitEvent("newPluginsDetected", juce::var(obj));
    };

    pluginManager.onAutoScanStateChanged = [this]() {
        emitEvent("autoScanStateChanged", pluginManager.getAutoScanStateAsJson());
    };
}

void WebViewBridge::emitEvent(const juce::String& eventName, const juce::var& data)
{
    #if JUCE_DEBUG
    std::cerr << "WebViewBridge::emitEvent: " << eventName << std::endl;
    #endif
    if (!webBrowser || !webBrowser->isVisible())
    {
        #if JUCE_DEBUG
        std::cerr << "  -> No webBrowser set or not visible!" << std::endl;
        #endif
        return;
    }

    webBrowser->emitEventIfBrowserIsVisible(eventName, data);
    #if JUCE_DEBUG
    std::cerr << "  -> Event emitted to browser" << std::endl;
    #endif
}

std::optional<juce::WebBrowserComponent::Resource> WebViewBridge::resourceHandler(const juce::String& url)
{
    return ResourceProvider::getResource(url);
}

void WebViewBridge::timerCallback()
{
    // Auto-detect latency changes from hosted plugins (runs even when stream is inactive)
    if (chainProcessor.needsLatencyRefresh())
    {
        chainProcessor.clearLatencyRefreshFlag();
        chainProcessor.refreshLatencyCompensation();
    }

    if (!waveformStreamActive || !webBrowser)
        return;

    // Emit waveform data if available
    if (waveformCapture)
    {
        auto preData = waveformCapture->getPrePeaks();
        auto postData = waveformCapture->getPostPeaks();

        auto* obj = new juce::DynamicObject();

        juce::Array<juce::var> preArr;
        for (float v : preData)
            preArr.add(v);

        juce::Array<juce::var> postArr;
        for (float v : postData)
            postArr.add(v);

        obj->setProperty("pre", preArr);
        obj->setProperty("post", postArr);

        emitEvent("waveformData", juce::var(obj));
    }

    // Emit meter data if meters are available
    if (inputMeter && outputMeter)
    {
        auto inputReadings = inputMeter->getReadings();
        auto outputReadings = outputMeter->getReadings();

        auto* meterObj = new juce::DynamicObject();

        // Input meter values
        meterObj->setProperty("inputPeakL", inputReadings.peakL);
        meterObj->setProperty("inputPeakR", inputReadings.peakR);
        meterObj->setProperty("inputPeakHoldL", inputReadings.peakHoldL);
        meterObj->setProperty("inputPeakHoldR", inputReadings.peakHoldR);
        meterObj->setProperty("inputRmsL", inputReadings.rmsL);
        meterObj->setProperty("inputRmsR", inputReadings.rmsR);
        meterObj->setProperty("inputLufs", inputReadings.lufsShort);

        // Output meter values
        meterObj->setProperty("outputPeakL", outputReadings.peakL);
        meterObj->setProperty("outputPeakR", outputReadings.peakR);
        meterObj->setProperty("outputPeakHoldL", outputReadings.peakHoldL);
        meterObj->setProperty("outputPeakHoldR", outputReadings.peakHoldR);
        meterObj->setProperty("outputRmsL", outputReadings.rmsL);
        meterObj->setProperty("outputRmsR", outputReadings.rmsR);
        meterObj->setProperty("outputLufs", outputReadings.lufsShort);

        // Averaged peak dB (2.5s window) for calibration
        meterObj->setProperty("inputAvgPeakDbL", inputReadings.avgPeakDbL);
        meterObj->setProperty("inputAvgPeakDbR", inputReadings.avgPeakDbR);

        emitEvent("meterData", juce::var(meterObj));
    }

    // Emit stereo FFT spectrum data if processor is available
    if (fftProcessor)
    {
        auto magnitudesL = fftProcessor->getMagnitudesL();
        auto magnitudesR = fftProcessor->getMagnitudesR();

        // Reuse preallocated caches instead of allocating at 30Hz
        fftMagnitudeCacheL.clearQuick();
        fftMagnitudeCacheL.ensureStorageAllocated(static_cast<int>(magnitudesL.size()));
        for (float v : magnitudesL)
            fftMagnitudeCacheL.add(v);

        fftMagnitudeCacheR.clearQuick();
        fftMagnitudeCacheR.ensureStorageAllocated(static_cast<int>(magnitudesR.size()));
        for (float v : magnitudesR)
            fftMagnitudeCacheR.add(v);

        // Build mono average for backward compat (SpectrumAnalyzer uses this)
        juce::Array<juce::var> monoCache;
        monoCache.ensureStorageAllocated(static_cast<int>(magnitudesL.size()));
        for (size_t i = 0; i < magnitudesL.size(); ++i)
            monoCache.add((magnitudesL[i] + magnitudesR[i]) * 0.5f);

        auto* fftObj = new juce::DynamicObject();
        fftObj->setProperty("magnitudes", monoCache);
        fftObj->setProperty("magnitudesL", fftMagnitudeCacheL);
        fftObj->setProperty("magnitudesR", fftMagnitudeCacheR);
        fftObj->setProperty("numBins", fftProcessor->getNumBins());
        fftObj->setProperty("fftSize", fftProcessor->getNumBins() * 2);
        fftObj->setProperty("sampleRate", fftProcessor->getSampleRate());

        emitEvent("fftData", juce::var(fftObj));
    }

    // Emit per-node meter data for inline plugin meters
    {
        auto nodeMeterReadings = chainProcessor.getNodeMeterReadings();
        if (!nodeMeterReadings.empty())
        {
            auto* nodeMetersObj = new juce::DynamicObject();
            for (const auto& nm : nodeMeterReadings)
            {
                auto* entry = new juce::DynamicObject();
                entry->setProperty("peakL", nm.peakL);
                entry->setProperty("peakR", nm.peakR);
                entry->setProperty("peakHoldL", nm.peakHoldL);
                entry->setProperty("peakHoldR", nm.peakHoldR);
                entry->setProperty("rmsL", nm.rmsL);
                entry->setProperty("rmsR", nm.rmsR);
                entry->setProperty("inputPeakL", nm.inputPeakL);
                entry->setProperty("inputPeakR", nm.inputPeakR);
                entry->setProperty("inputPeakHoldL", nm.inputPeakHoldL);
                entry->setProperty("inputPeakHoldR", nm.inputPeakHoldR);
                entry->setProperty("inputRmsL", nm.inputRmsL);
                entry->setProperty("inputRmsR", nm.inputRmsR);
                entry->setProperty("latencyMs", nm.latencyMs);
                nodeMetersObj->setProperty(juce::String(nm.nodeId), juce::var(entry));
            }
            emitEvent("nodeMeterData", juce::var(nodeMetersObj));
        }
    }

    // Continuous match lock logic
    if (inputMeter && outputMeter && matchLockEnabled.load(std::memory_order_relaxed) && gainProcessor)
    {
        auto inputReadingsML = inputMeter->getReadings();
        auto outputReadingsML = outputMeter->getReadings();

        // Convert linear peak readings to dB for gain matching math
        float inputPeakLinear = std::max(inputReadingsML.peakL, inputReadingsML.peakR);
        float outputPeakLinear = std::max(outputReadingsML.peakL, outputReadingsML.peakR);

        // Linear-to-dB with floor at -100 dB (peak of 0.0 -> -inf, clamp to floor)
        constexpr float kDbFloor = -100.0f;
        float inputPeakDB = (inputPeakLinear > 0.0f)
            ? 20.0f * std::log10(inputPeakLinear)
            : kDbFloor;
        float outputPeakDB = (outputPeakLinear > 0.0f)
            ? 20.0f * std::log10(outputPeakLinear)
            : kDbFloor;

        float currentGain = gainProcessor->getOutputGainDB();

        // Only process if both meters have valid readings (in dB domain)
        if (inputPeakDB > -60.0f && outputPeakDB > -60.0f)
        {
            // Target: maintain the dB offset that existed when match lock was enabled
            float refOffset = matchLockReferenceOffset.load(std::memory_order_relaxed);
            float targetOutputPeakDB = inputPeakDB - refOffset;
            float error = targetOutputPeakDB - outputPeakDB;

            // Dead zone to prevent hunting (0.5dB threshold)
            if (std::abs(error) > 0.5f)
            {
                // Proportional control with rate limiting
                // Max 0.5dB adjustment per tick at 60Hz = 30dB/sec max slew
                float adjustment = std::clamp(error * 0.1f, -0.5f, 0.5f);
                float newGain = std::clamp(currentGain + adjustment,
                                           GainProcessor::MinGainDB,
                                           GainProcessor::MaxGainDB);

                // Detect if stuck at limit
                bool atLimit = (newGain <= GainProcessor::MinGainDB + 0.1f && adjustment < 0) ||
                               (newGain >= GainProcessor::MaxGainDB - 0.1f && adjustment > 0);

                if (atLimit)
                {
                    int stuckCount = matchLockStuckCounter.load(std::memory_order_relaxed) + 1;
                    matchLockStuckCounter.store(stuckCount, std::memory_order_relaxed);
                    if (stuckCount >= MaxStuckFrames)
                    {
                        // Auto-disable and notify UI
                        matchLockEnabled.store(false, std::memory_order_relaxed);
                        auto* warningObj = new juce::DynamicObject();
                        warningObj->setProperty("warning", "Match lock disabled: gain limit reached");
                        warningObj->setProperty("matchLockEnabled", false);
                        emitEvent("matchLockWarning", juce::var(warningObj));
                        return;
                    }
                }
                else
                {
                    matchLockStuckCounter.store(0, std::memory_order_relaxed);
                }

                gainProcessor->setOutputGain(newGain);

                // Emit gain update so UI stays in sync
                auto* gainObj = new juce::DynamicObject();
                gainObj->setProperty("outputGainDB", newGain);
                emitEvent("gainChanged", juce::var(gainObj));
            }
        }
    }

    // Check for latency changes every 500ms (30Hz timer, check every 15 ticks)
    if (mainProcessor)
    {
        int counter = latencyCheckCounter.fetch_add(1, std::memory_order_relaxed);
        if (counter >= 15)
        {
            latencyCheckCounter.store(0, std::memory_order_relaxed);
            int newLatency = chainProcessor.getTotalLatencySamples();
            int lastLatency = lastReportedLatency.load(std::memory_order_relaxed);

            if (newLatency != lastLatency)
            {
                lastReportedLatency.store(newLatency, std::memory_order_relaxed);
                mainProcessor->setLatencySamples(newLatency);
                // The host will respond to latency change and may call prepareToPlay
            }
        }
    }
}

// Native function implementations

juce::var WebViewBridge::getPluginList()
{
    return pluginManager.getPluginListAsJson();
}

juce::var WebViewBridge::startScan(bool rescanAll)
{
    #if JUCE_DEBUG
    std::cerr << "WebViewBridge::startScan called, rescanAll=" << rescanAll << std::endl;
    #endif
    pluginManager.startScan(rescanAll);
    #if JUCE_DEBUG
    std::cerr << "pluginManager.startScan returned" << std::endl;
    #endif
    auto* result = new juce::DynamicObject();
    result->setProperty("success", true);
    result->setProperty("message", "Scan started");
    return juce::var(result);
}

juce::var WebViewBridge::getChainState()
{
    return chainProcessor.getChainStateAsJson();
}

juce::var WebViewBridge::addPlugin(const juce::String& pluginId, int insertIndex)
{
    auto* result = new juce::DynamicObject();

    if (auto desc = pluginManager.findPluginByIdentifier(pluginId))
    {
        // desc is now a std::optional<PluginDescription> - a safe copy
        if (chainProcessor.addPlugin(*desc, insertIndex))
        {
            result->setProperty("success", true);
            result->setProperty("chainState", getChainState());
        }
        else
        {
            result->setProperty("success", false);
            result->setProperty("error", "Failed to instantiate plugin");
        }
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Plugin not found: " + pluginId);
    }

    return juce::var(result);
}

juce::var WebViewBridge::removePlugin(int slotIndex)
{
    auto* result = new juce::DynamicObject();

    if (chainProcessor.removePlugin(slotIndex))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid slot index");
    }

    return juce::var(result);
}

juce::var WebViewBridge::movePlugin(int fromIndex, int toIndex)
{
    auto* result = new juce::DynamicObject();

    if (chainProcessor.movePlugin(fromIndex, toIndex))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid indices");
    }

    return juce::var(result);
}

juce::var WebViewBridge::setSlotBypassed(int slotIndex, bool bypassed)
{
    auto* result = new juce::DynamicObject();

    chainProcessor.setSlotBypassed(slotIndex, bypassed);
    result->setProperty("success", true);
    result->setProperty("chainState", getChainState());

    return juce::var(result);
}

juce::var WebViewBridge::openPluginUI(int nodeId)
{
    auto* result = new juce::DynamicObject();

    // Open plugin UI - accepts node ID (new) or slot index (legacy, treated as node ID)
    chainProcessor.showPluginWindow(nodeId);
    result->setProperty("success", true);

    return juce::var(result);
}

juce::var WebViewBridge::closePluginUI(int nodeId)
{
    auto* result = new juce::DynamicObject();

    chainProcessor.hidePluginWindow(nodeId);
    result->setProperty("success", true);

    return juce::var(result);
}

juce::var WebViewBridge::getScanProgress()
{
    auto* result = new juce::DynamicObject();
    result->setProperty("scanning", pluginManager.isScanning());
    result->setProperty("progress", pluginManager.getScanProgress());
    result->setProperty("currentPlugin", pluginManager.getCurrentlyScanning());
    return juce::var(result);
}

juce::var WebViewBridge::getPresetList()
{
    return presetManager.getPresetListAsJson();
}

juce::var WebViewBridge::savePreset(const juce::String& name, const juce::String& category)
{
    auto* result = new juce::DynamicObject();

    if (presetManager.savePreset(name, category))
    {
        result->setProperty("success", true);
        result->setProperty("presetList", getPresetList());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to save preset");
    }

    return juce::var(result);
}

juce::var WebViewBridge::loadPreset(const juce::String& path)
{
    auto* result = new juce::DynamicObject();

    if (presetManager.loadPreset(juce::File(path)))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
        if (auto* preset = presetManager.getCurrentPreset())
            result->setProperty("preset", preset->toJson());

        // Report any missing plugins
        auto& missing = presetManager.getLastMissingPlugins();
        if (missing.size() > 0)
        {
            juce::Array<juce::var> missingArr;
            for (const auto& name : missing)
                missingArr.add(name);
            result->setProperty("missingPlugins", missingArr);
        }
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to load preset: " + path);
    }

    return juce::var(result);
}

juce::var WebViewBridge::deletePreset(const juce::String& path)
{
    auto* result = new juce::DynamicObject();

    if (presetManager.deletePreset(juce::File(path)))
    {
        result->setProperty("success", true);
        result->setProperty("presetList", getPresetList());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to delete preset");
    }

    return juce::var(result);
}

juce::var WebViewBridge::renamePreset(const juce::String& path, const juce::String& newName)
{
    auto* result = new juce::DynamicObject();

    if (presetManager.renamePreset(juce::File(path), newName))
    {
        result->setProperty("success", true);
        result->setProperty("presetList", getPresetList());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to rename preset");
    }

    return juce::var(result);
}

juce::var WebViewBridge::getCategories()
{
    auto categories = presetManager.getCategories();
    juce::Array<juce::var> arr;
    for (const auto& cat : categories)
        arr.add(cat);
    return juce::var(arr);
}

//==============================================================================
// Group Template Operations
//==============================================================================

juce::var WebViewBridge::getGroupTemplateList()
{
    return groupTemplateManager.getTemplateListAsJson();
}

juce::var WebViewBridge::saveGroupTemplate(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    // Parse JSON string from frontend
    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    auto groupId = static_cast<ChainNodeId>(static_cast<int>(obj->getProperty("groupId")));
    auto name = obj->getProperty("name").toString();
    auto category = obj->getProperty("category").toString();

    if (groupTemplateManager.saveGroupTemplate(groupId, name, category))
    {
        result->setProperty("success", true);
        result->setProperty("templateList", getGroupTemplateList());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to save template");
    }

    return juce::var(result);
}

juce::var WebViewBridge::loadGroupTemplate(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    // Parse JSON string from frontend
    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    auto path = obj->getProperty("path").toString();
    auto parentId = static_cast<ChainNodeId>(static_cast<int>(obj->getProperty("parentId")));
    auto insertIndex = static_cast<int>(obj->getProperty("insertIndex"));

    auto newGroupId = groupTemplateManager.loadGroupTemplate(juce::File(path), parentId, insertIndex);

    if (newGroupId >= 0)
    {
        result->setProperty("success", true);
        result->setProperty("groupId", newGroupId);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to load template");
    }

    return juce::var(result);
}

juce::var WebViewBridge::deleteGroupTemplate(const juce::String& path)
{
    auto* result = new juce::DynamicObject();

    if (groupTemplateManager.deleteTemplate(juce::File(path)))
    {
        result->setProperty("success", true);
        result->setProperty("templateList", getGroupTemplateList());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to delete template");
    }

    return juce::var(result);
}

juce::var WebViewBridge::getGroupTemplateCategories()
{
    auto categories = groupTemplateManager.getCategories();
    juce::Array<juce::var> arr;
    for (const auto& cat : categories)
        arr.add(cat);
    return juce::var(arr);
}

//==============================================================================
// Group Operations
//==============================================================================

juce::var WebViewBridge::createGroup(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    // Parse JSON string from frontend (JSON.stringify sends a string, not an object)
    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    auto childIdsVar = obj->getProperty("childIds");
    auto modeStr = obj->getProperty("mode").toString();
    auto name = obj->getProperty("name").toString();

    if (!childIdsVar.isArray())
    {
        result->setProperty("success", false);
        result->setProperty("error", "childIds must be an array");
        return juce::var(result);
    }

    std::vector<ChainNodeId> childIds;
    for (const auto& v : *childIdsVar.getArray())
        childIds.push_back(static_cast<ChainNodeId>(static_cast<int>(v)));

    GroupMode mode = modeStr == "parallel" ? GroupMode::Parallel : GroupMode::Serial;

    auto groupId = chainProcessor.createGroup(childIds, mode, name);
    if (groupId >= 0)
    {
        result->setProperty("success", true);
        result->setProperty("groupId", groupId);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to create group");
    }

    return juce::var(result);
}

juce::var WebViewBridge::dissolveGroup(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int groupId = static_cast<int>(obj->getProperty("groupId"));

    if (chainProcessor.dissolveGroup(groupId))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to dissolve group");
    }

    return juce::var(result);
}

juce::var WebViewBridge::setGroupMode(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int groupId = static_cast<int>(obj->getProperty("groupId"));
    auto modeStr = obj->getProperty("mode").toString();
    GroupMode mode = modeStr == "parallel" ? GroupMode::Parallel : GroupMode::Serial;

    if (chainProcessor.setGroupMode(groupId, mode))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to set group mode");
    }

    return juce::var(result);
}

juce::var WebViewBridge::setGroupDryWet(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int groupId = static_cast<int>(obj->getProperty("groupId"));
    float mix = static_cast<float>(obj->getProperty("mix"));

    if (chainProcessor.setGroupDryWet(groupId, mix))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to set dry/wet");
    }

    return juce::var(result);
}

juce::var WebViewBridge::setGroupDucking(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int groupId = static_cast<int>(obj->getProperty("groupId"));
    float amount = static_cast<float>(obj->getProperty("amount"));
    float releaseMs = obj->hasProperty("releaseMs")
        ? static_cast<float>(obj->getProperty("releaseMs"))
        : 200.0f;

    if (chainProcessor.setGroupDucking(groupId, amount, releaseMs))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to set ducking");
    }

    return juce::var(result);
}

juce::var WebViewBridge::setBranchGain(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int nodeId = static_cast<int>(obj->getProperty("nodeId"));
    float gainDb = static_cast<float>(obj->getProperty("gainDb"));

    if (chainProcessor.setBranchGain(nodeId, gainDb))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to set branch gain");
    }

    return juce::var(result);
}

juce::var WebViewBridge::setBranchSolo(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int nodeId = static_cast<int>(obj->getProperty("nodeId"));
    bool solo = static_cast<bool>(obj->getProperty("solo"));

    if (chainProcessor.setBranchSolo(nodeId, solo))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to set branch solo");
    }

    return juce::var(result);
}

juce::var WebViewBridge::setBranchMute(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int nodeId = static_cast<int>(obj->getProperty("nodeId"));
    bool mute = static_cast<bool>(obj->getProperty("mute"));

    if (chainProcessor.setBranchMute(nodeId, mute))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to set branch mute");
    }

    return juce::var(result);
}

// =============================================
// Per-plugin controls
// =============================================

juce::var WebViewBridge::setNodeInputGain(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int nodeId = static_cast<int>(obj->getProperty("nodeId"));
    float gainDb = static_cast<float>(obj->getProperty("gainDb"));

    if (chainProcessor.setNodeInputGain(nodeId, gainDb))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to set node input gain");
    }

    return juce::var(result);
}

juce::var WebViewBridge::setNodeOutputGain(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int nodeId = static_cast<int>(obj->getProperty("nodeId"));
    float gainDb = static_cast<float>(obj->getProperty("gainDb"));

    if (chainProcessor.setNodeOutputGain(nodeId, gainDb))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to set node output gain");
    }

    return juce::var(result);
}

juce::var WebViewBridge::setNodeDryWet(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int nodeId = static_cast<int>(obj->getProperty("nodeId"));
    float mix = static_cast<float>(obj->getProperty("mix"));

    if (chainProcessor.setNodeDryWet(nodeId, mix))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to set node dry/wet");
    }

    return juce::var(result);
}

juce::var WebViewBridge::setNodeSidechainSource(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int nodeId = static_cast<int>(obj->getProperty("nodeId"));
    int source = static_cast<int>(obj->getProperty("source"));

    if (chainProcessor.setNodeSidechainSource(nodeId, source))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to set sidechain source");
    }

    return juce::var(result);
}

juce::var WebViewBridge::setNodeMidSideMode(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int nodeId = static_cast<int>(obj->getProperty("nodeId"));
    int mode = static_cast<int>(obj->getProperty("mode"));

    if (chainProcessor.setNodeMidSideMode(nodeId, mode))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to set mid/side mode");
    }

    return juce::var(result);
}

juce::var WebViewBridge::moveNodeOp(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int nodeId = static_cast<int>(obj->getProperty("nodeId"));
    int newParentId = static_cast<int>(obj->getProperty("newParentId"));
    int newIndex = static_cast<int>(obj->getProperty("newIndex"));

    if (chainProcessor.moveNode(nodeId, newParentId, newIndex))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to move node");
    }

    return juce::var(result);
}

juce::var WebViewBridge::removeNodeOp(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int nodeId = static_cast<int>(obj->getProperty("nodeId"));

    if (chainProcessor.removeNode(nodeId))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to remove node");
    }

    return juce::var(result);
}

juce::var WebViewBridge::addPluginToGroup(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    auto pluginId = obj->getProperty("pluginId").toString();
    int parentId = static_cast<int>(obj->getProperty("parentId"));
    int insertIndex = static_cast<int>(obj->getProperty("insertIndex"));

    if (auto desc = pluginManager.findPluginByIdentifier(pluginId))
    {
        if (chainProcessor.addPlugin(*desc, parentId, insertIndex))
        {
            result->setProperty("success", true);
            result->setProperty("chainState", getChainState());
        }
        else
        {
            result->setProperty("success", false);
            result->setProperty("error", "Failed to instantiate plugin");
        }
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Plugin not found: " + pluginId);
    }

    return juce::var(result);
}

juce::var WebViewBridge::setNodeBypassed(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int nodeId = static_cast<int>(obj->getProperty("nodeId"));
    bool bypassed = static_cast<bool>(obj->getProperty("bypassed"));

    chainProcessor.setNodeBypassed(nodeId, bypassed);
    result->setProperty("success", true);
    result->setProperty("chainState", getChainState());

    return juce::var(result);
}

juce::var WebViewBridge::setNodeMute(const juce::var& args)
{
    auto* result = new juce::DynamicObject();

    juce::var parsed = args.isString() ? juce::JSON::parse(args.toString()) : args;

    if (!parsed.isObject())
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid arguments");
        return juce::var(result);
    }

    auto* obj = parsed.getDynamicObject();
    int nodeId = static_cast<int>(obj->getProperty("nodeId"));
    bool muted = static_cast<bool>(obj->getProperty("muted"));

    if (chainProcessor.setBranchMute(nodeId, muted))
    {
        result->setProperty("success", true);
        result->setProperty("chainState", getChainState());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Node not found");
    }

    return juce::var(result);
}

//==============================================================================
// Chain-level Toggle Controls
//==============================================================================

juce::var WebViewBridge::toggleAllBypass()
{
    auto* result = new juce::DynamicObject();

    chainProcessor.toggleAllBypass();
    auto state = chainProcessor.getBypassState();

    result->setProperty("success", true);
    result->setProperty("allBypassed", state.allBypassed);
    result->setProperty("anyBypassed", state.anyBypassed);
    result->setProperty("chainState", getChainState());

    return juce::var(result);
}

juce::var WebViewBridge::getAllBypassState()
{
    auto* result = new juce::DynamicObject();

    auto state = chainProcessor.getBypassState();
    result->setProperty("allBypassed", state.allBypassed);
    result->setProperty("anyBypassed", state.anyBypassed);

    return juce::var(result);
}

juce::var WebViewBridge::toggleAllPluginWindows()
{
    auto* result = new juce::DynamicObject();

    chainProcessor.toggleAllPluginWindows();
    auto state = chainProcessor.getWindowState();

    result->setProperty("success", true);
    result->setProperty("openCount", state.openCount);
    result->setProperty("totalCount", state.totalCount);

    return juce::var(result);
}

juce::var WebViewBridge::getPluginWindowState()
{
    auto* result = new juce::DynamicObject();

    auto state = chainProcessor.getWindowState();
    result->setProperty("openCount", state.openCount);
    result->setProperty("totalCount", state.totalCount);

    return juce::var(result);
}

//==============================================================================
// Blacklist Management
//==============================================================================

juce::var WebViewBridge::getBlacklist()
{
    return pluginManager.getBlacklistAsJson();
}

juce::var WebViewBridge::addToBlacklist(const juce::String& pluginPath)
{
    auto* result = new juce::DynamicObject();

    pluginManager.addToBlacklist(pluginPath);
    result->setProperty("success", true);
    result->setProperty("blacklist", getBlacklist());

    return juce::var(result);
}

juce::var WebViewBridge::removeFromBlacklist(const juce::String& pluginPath)
{
    auto* result = new juce::DynamicObject();

    pluginManager.removeFromBlacklist(pluginPath);
    result->setProperty("success", true);
    result->setProperty("blacklist", getBlacklist());

    return juce::var(result);
}

juce::var WebViewBridge::clearBlacklist()
{
    auto* result = new juce::DynamicObject();

    pluginManager.clearBlacklist();
    result->setProperty("success", true);
    result->setProperty("blacklist", getBlacklist());

    return juce::var(result);
}

//==============================================================================
// Waveform Streaming
//==============================================================================

juce::var WebViewBridge::startWaveformStream()
{
    auto* result = new juce::DynamicObject();

    if (waveformCapture)
    {
        waveformStreamActive = true;
        startTimerHz(30);  // 30fps — sufficient for meter visualization
        result->setProperty("success", true);
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Waveform capture not available");
    }

    return juce::var(result);
}

juce::var WebViewBridge::stopWaveformStream()
{
    auto* result = new juce::DynamicObject();

    waveformStreamActive = false;
    stopTimer();
    result->setProperty("success", true);

    return juce::var(result);
}

//==============================================================================
// Gain Control
//==============================================================================

juce::var WebViewBridge::setInputGain(float dB)
{
    auto* result = new juce::DynamicObject();

    if (gainProcessor)
    {
        gainProcessor->setInputGain(dB);
        result->setProperty("success", true);
        result->setProperty("inputGainDB", gainProcessor->getInputGainDB());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Gain processor not available");
    }

    return juce::var(result);
}

juce::var WebViewBridge::setOutputGain(float dB)
{
    auto* result = new juce::DynamicObject();

    if (gainProcessor)
    {
        gainProcessor->setOutputGain(dB);
        result->setProperty("success", true);
        result->setProperty("outputGainDB", gainProcessor->getOutputGainDB());
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Gain processor not available");
    }

    return juce::var(result);
}

juce::var WebViewBridge::getGainSettings()
{
    auto* result = new juce::DynamicObject();

    if (gainProcessor)
    {
        result->setProperty("inputGainDB", gainProcessor->getInputGainDB());
        result->setProperty("outputGainDB", gainProcessor->getOutputGainDB());
    }
    else
    {
        result->setProperty("inputGainDB", 0.0f);
        result->setProperty("outputGainDB", 0.0f);
    }

    return juce::var(result);
}

juce::var WebViewBridge::calculateGainMatch()
{
    auto* result = new juce::DynamicObject();

    if (inputMeter && outputMeter && gainProcessor)
    {
        auto inputReadings = inputMeter->getReadings();
        auto outputReadings = outputMeter->getReadings();

        // Convert linear peaks to dB for gain matching math
        float inputPeakLinear = std::max(inputReadings.peakL, inputReadings.peakR);
        float outputPeakLinear = std::max(outputReadings.peakL, outputReadings.peakR);

        constexpr float kDbFloor = -100.0f;
        float inputPeakDB = (inputPeakLinear > 0.0f)
            ? 20.0f * std::log10(inputPeakLinear)
            : kDbFloor;
        float outputPeakDB = (outputPeakLinear > 0.0f)
            ? 20.0f * std::log10(outputPeakLinear)
            : kDbFloor;

        // Only adjust if we have sufficient signal (match timerCallback's -60dB threshold)
        if (inputPeakDB > -60.0f && outputPeakDB > -60.0f)
        {
            float currentOutputGain = gainProcessor->getOutputGainDB();
            float peakDiff = inputPeakDB - outputPeakDB;
            float newOutputGain = currentOutputGain + peakDiff;

            // Clamp to valid range
            newOutputGain = juce::jlimit(GainProcessor::MinGainDB, GainProcessor::MaxGainDB, newOutputGain);

            gainProcessor->setOutputGain(newOutputGain);

            result->setProperty("success", true);
            result->setProperty("outputGainDB", newOutputGain);
            result->setProperty("inputPeakDB", inputPeakDB);
            result->setProperty("outputPeakDB", outputPeakDB);
            result->setProperty("adjustment", peakDiff);
        }
        else
        {
            result->setProperty("success", false);
            result->setProperty("error", "Insufficient audio signal for gain matching");
        }
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Gain processor or meters not available");
    }

    return juce::var(result);
}

juce::var WebViewBridge::autoCalibrate(float targetMidpointDb)
{
    auto* result = new juce::DynamicObject();

    if (inputMeter && gainProcessor)
    {
        auto inputReadings = inputMeter->getReadings();

        // Use averaged peak (2.5s window) for stable calibration
        float currentAvgPeak = std::max(inputReadings.avgPeakDbL, inputReadings.avgPeakDbR);

        if (currentAvgPeak > -60.0f)
        {
            float adjustment = targetMidpointDb - currentAvgPeak;
            float currentInputGain = gainProcessor->getInputGainDB();
            float newInputGain = currentInputGain + adjustment;

            // Clamp to valid range
            newInputGain = juce::jlimit(GainProcessor::MinGainDB, GainProcessor::MaxGainDB, newInputGain);

            gainProcessor->setInputGain(newInputGain);

            result->setProperty("success", true);
            result->setProperty("inputGainDB", newInputGain);
            result->setProperty("avgPeakDb", currentAvgPeak);
            result->setProperty("adjustment", adjustment);

            // Emit gainChanged so the UI input knob updates
            auto* gainObj = new juce::DynamicObject();
            gainObj->setProperty("inputGainDB", newInputGain);
            gainObj->setProperty("outputGainDB", gainProcessor->getOutputGainDB());
            emitEvent("gainChanged", juce::var(gainObj));
        }
        else
        {
            result->setProperty("success", false);
            result->setProperty("error", "Insufficient audio signal for calibration (avg peak below -60 dB)");
        }
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Input meter or gain processor not available");
    }

    return juce::var(result);
}

//==============================================================================
// Parameter Discovery
//==============================================================================

juce::var WebViewBridge::discoverPluginParameters(int nodeId)
{
    auto* result = new juce::DynamicObject();

    auto* processor = chainProcessor.getNodeProcessor(nodeId);
    if (!processor)
    {
        result->setProperty("success", false);
        result->setProperty("error", "No processor found for node " + juce::String(nodeId));
        return juce::var(result);
    }

    // Get plugin name and manufacturer from the chain node's PluginDescription
    juce::String pluginName = processor->getName();
    juce::String manufacturer;

    // Look up the ChainNode to get the PluginDescription
    {
        const auto& rootNode = chainProcessor.getRootNode();
        const auto* chainNode = ChainNodeHelpers::findById(rootNode, nodeId);
        if (chainNode && chainNode->isPlugin())
        {
            const auto& desc = chainNode->getPlugin().description;
            if (desc.name.isNotEmpty())
                pluginName = desc.name;
            manufacturer = desc.manufacturerName;
        }
    }

    // Run discovery
    auto discoveredMap = ParameterDiscovery::discoverParameterMap(processor, pluginName, manufacturer);

    result->setProperty("success", true);
    result->setProperty("map", ParameterDiscovery::toJson(discoveredMap));

    return juce::var(result);
}

//==============================================================================
// Instance Awareness & Chain Copy/Mirror
//==============================================================================

void WebViewBridge::instanceRegistryChanged()
{
    if (!instanceRegistry)
        return;

    emitEvent("instancesChanged", getOtherInstances());
}

void WebViewBridge::mirrorStateChanged()
{
    emitEvent("mirrorStateChanged", getMirrorStateOp());
}

void WebViewBridge::mirrorUpdateApplied()
{
    emitEvent("mirrorUpdateApplied", juce::var());
}

juce::var WebViewBridge::getOtherInstances()
{
    if (!instanceRegistry)
        return juce::var(juce::Array<juce::var>());

    auto others = instanceRegistry->getOtherInstances(instanceId);

    juce::Array<juce::var> result;
    for (const auto& info : others)
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("id", info.id);
        obj->setProperty("trackName", info.trackName);
        obj->setProperty("pluginCount", info.pluginCount);

        juce::Array<juce::var> namesArr;
        for (const auto& name : info.pluginNames)
            namesArr.add(name);
        obj->setProperty("pluginNames", namesArr);

        // Mirror role info
        auto group = instanceRegistry->getMirrorGroupForInstance(info.id);
        if (group.has_value())
        {
            obj->setProperty("mirrorGroupId", group->groupId);
            obj->setProperty("isLeader", group->leaderId == info.id);
            obj->setProperty("isFollower", group->leaderId != info.id);
        }
        else
        {
            obj->setProperty("mirrorGroupId", -1);
            obj->setProperty("isLeader", false);
            obj->setProperty("isFollower", false);
        }

        result.add(juce::var(obj));
    }

    return juce::var(result);
}

juce::var WebViewBridge::copyChainFromInstance(int targetInstanceId)
{
    PCLOG("copyChainFromInstance — targetId=" + juce::String(targetInstanceId));
    auto* result = new juce::DynamicObject();

    if (!instanceRegistry)
    {
        PCLOG("copyChainFromInstance — no instanceRegistry");
        result->setProperty("success", false);
        result->setProperty("error", "Instance registry not available");
        return juce::var(result);
    }

    auto targetInfo = instanceRegistry->getInstanceInfo(targetInstanceId);
    if (!targetInfo.processor)
    {
        PCLOG("copyChainFromInstance — target not found");
        result->setProperty("success", false);
        result->setProperty("error", "Target instance not found");
        return juce::var(result);
    }

    // Get the source processor's ChainProcessor
    auto* sourceProcessor = dynamic_cast<PluginChainManagerProcessor*>(targetInfo.processor);
    if (!sourceProcessor)
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid source processor");
        return juce::var(result);
    }

    // Export chain from source (safe — message thread, const read)
    auto chainData = sourceProcessor->getChainProcessor().exportChainWithPresets();

    // Import into local chain
    chainProcessor.setParameterWatcherSuppressed(true);
    auto importResult = chainProcessor.importChainWithPresets(chainData);
    chainProcessor.setParameterWatcherSuppressed(false);

    PCLOG("copyChainFromInstance — import " + juce::String(importResult.success ? "succeeded" : "failed"));

    result->setProperty("success", importResult.success);
    if (importResult.success)
        result->setProperty("chainState", getChainState());
    else
        result->setProperty("error", "Failed to import chain from source instance");

    return juce::var(result);
}

juce::var WebViewBridge::sendChainToInstance(int targetInstanceId)
{
    PCLOG("sendChainToInstance — targetId=" + juce::String(targetInstanceId));
    auto* result = new juce::DynamicObject();

    if (!instanceRegistry)
    {
        PCLOG("sendChainToInstance — no instanceRegistry");
        result->setProperty("success", false);
        result->setProperty("error", "Instance registry not available");
        return juce::var(result);
    }

    auto targetInfo = instanceRegistry->getInstanceInfo(targetInstanceId);
    if (!targetInfo.processor)
    {
        PCLOG("sendChainToInstance — target not found");
        result->setProperty("success", false);
        result->setProperty("error", "Target instance not found");
        return juce::var(result);
    }

    auto* targetProcessor = dynamic_cast<PluginChainManagerProcessor*>(targetInfo.processor);
    if (!targetProcessor)
    {
        result->setProperty("success", false);
        result->setProperty("error", "Invalid target processor");
        return juce::var(result);
    }

    // Return immediately — heavy plugin loading happens async
    result->setProperty("success", true);

    // Export chain from our local ChainProcessor (fast — serialization only)
    auto chainData = chainProcessor.exportChainWithPresets();

    PCLOG("sendChainToInstance — dispatching async import to target");

    // Capture weak pointer to detect if this bridge is destroyed before async runs
    std::weak_ptr<std::atomic<bool>> weak = aliveFlag;

    juce::MessageManager::callAsync([this, weak, targetProcessor, chainData]() {
        // Check if bridge is still alive
        auto alive = weak.lock();
        if (!alive || !alive->load(std::memory_order_acquire))
            return;

        PCLOG("sendChainToInstance [async] — starting import");
        auto importRes = targetProcessor->getChainProcessor().importChainWithPresets(chainData);
        PCLOG("sendChainToInstance [async] — import " + juce::String(importRes.success ? "succeeded" : "failed"));

        auto* ev = new juce::DynamicObject();
        ev->setProperty("success", importRes.success);
        if (!importRes.success)
            ev->setProperty("error", "Failed to import chain into target instance");
        emitEvent("sendChainComplete", juce::var(ev));
    });

    return juce::var(result);
}

juce::var WebViewBridge::startMirrorOp(int targetInstanceId)
{
    PCLOG("startMirrorOp — targetId=" + juce::String(targetInstanceId));
    auto* result = new juce::DynamicObject();

    if (!mirrorManager)
    {
        PCLOG("startMirrorOp — no mirrorManager");
        result->setProperty("success", false);
        result->setProperty("error", "Mirror manager not available");
        return juce::var(result);
    }

    int groupId = mirrorManager->startMirror(targetInstanceId);
    PCLOG("startMirrorOp — groupId=" + juce::String(groupId));

    if (groupId >= 0)
    {
        result->setProperty("success", true);
        result->setProperty("mirrorGroupId", groupId);
    }
    else
    {
        result->setProperty("success", false);
        result->setProperty("error", "Failed to create mirror group");
    }

    return juce::var(result);
}

juce::var WebViewBridge::stopMirrorOp()
{
    auto* result = new juce::DynamicObject();

    if (!mirrorManager)
    {
        result->setProperty("success", false);
        result->setProperty("error", "Mirror manager not available");
        return juce::var(result);
    }

    mirrorManager->leaveMirrorGroup();
    result->setProperty("success", true);

    return juce::var(result);
}

juce::var WebViewBridge::getMirrorStateOp()
{
    auto* result = new juce::DynamicObject();

    if (!mirrorManager)
    {
        result->setProperty("isMirrored", false);
        return juce::var(result);
    }

    result->setProperty("isMirrored", mirrorManager->isMirrored());
    result->setProperty("isLeader", mirrorManager->isLeader());
    result->setProperty("mirrorGroupId", mirrorManager->getMirrorGroupId());

    auto partnerIds = mirrorManager->getPartnerIds();
    juce::Array<juce::var> partners;
    if (instanceRegistry)
    {
        for (auto pid : partnerIds)
        {
            auto partnerInfo = instanceRegistry->getInstanceInfo(pid);
            auto* partnerObj = new juce::DynamicObject();
            partnerObj->setProperty("id", pid);
            partnerObj->setProperty("trackName", partnerInfo.trackName);
            partners.add(juce::var(partnerObj));
        }
    }
    result->setProperty("partners", partners);

    return juce::var(result);
}

void WebViewBridge::setMatchLock(bool enabled)
{
    matchLockEnabled.store(enabled, std::memory_order_relaxed);
    matchLockStuckCounter.store(0, std::memory_order_relaxed);

    if (enabled && inputMeter && outputMeter)
    {
        // Capture current offset in dB domain (using peak for DAW meter matching)
        auto inputReadings = inputMeter->getReadings();
        auto outputReadings = outputMeter->getReadings();
        float inputPeakLinear = std::max(inputReadings.peakL, inputReadings.peakR);
        float outputPeakLinear = std::max(outputReadings.peakL, outputReadings.peakR);

        // Convert linear to dB before computing offset
        constexpr float kDbFloor = -100.0f;
        float inputPeakDB = (inputPeakLinear > 0.0f)
            ? 20.0f * std::log10(inputPeakLinear)
            : kDbFloor;
        float outputPeakDB = (outputPeakLinear > 0.0f)
            ? 20.0f * std::log10(outputPeakLinear)
            : kDbFloor;

        if (inputPeakDB > -60.0f && outputPeakDB > -60.0f)
        {
            matchLockReferenceOffset.store(inputPeakDB - outputPeakDB, std::memory_order_relaxed);
        }
        else
        {
            matchLockReferenceOffset.store(0.0f, std::memory_order_relaxed);
        }
    }
}

//==============================================================================
// Custom Scan Paths
//==============================================================================

juce::var WebViewBridge::getCustomScanPaths()
{
    return pluginManager.getCustomScanPathsAsJson();
}

juce::var WebViewBridge::addCustomScanPathOp(const juce::var& args)
{
    auto parsed = juce::JSON::parse(args.toString());
    auto* obj = parsed.getDynamicObject();

    auto* result = new juce::DynamicObject();

    if (!obj || !obj->hasProperty("path") || !obj->hasProperty("format"))
    {
        result->setProperty("success", false);
        result->setProperty("error", "Missing path or format");
        return juce::var(result);
    }

    auto path = obj->getProperty("path").toString();
    auto format = obj->getProperty("format").toString();

    bool success = pluginManager.addCustomScanPath(path, format);
    result->setProperty("success", success);

    if (!success)
    {
        juce::File dir(path);
        if (!dir.isDirectory())
            result->setProperty("error", "Directory does not exist");
        else
            result->setProperty("error", "Path already exists or invalid format");
    }

    return juce::var(result);
}

juce::var WebViewBridge::removeCustomScanPathOp(const juce::var& args)
{
    auto parsed = juce::JSON::parse(args.toString());
    auto* obj = parsed.getDynamicObject();

    auto* result = new juce::DynamicObject();

    if (!obj || !obj->hasProperty("path") || !obj->hasProperty("format"))
    {
        result->setProperty("success", false);
        return juce::var(result);
    }

    auto path = obj->getProperty("path").toString();
    auto format = obj->getProperty("format").toString();

    result->setProperty("success", pluginManager.removeCustomScanPath(path, format));
    return juce::var(result);
}

//==============================================================================
// Plugin Deactivation / Removal
//==============================================================================

juce::var WebViewBridge::deactivatePluginOp(const juce::String& identifier)
{
    auto* result = new juce::DynamicObject();
    result->setProperty("success", pluginManager.deactivatePlugin(identifier));
    return juce::var(result);
}

juce::var WebViewBridge::reactivatePluginOp(const juce::String& identifier)
{
    auto* result = new juce::DynamicObject();
    result->setProperty("success", pluginManager.reactivatePlugin(identifier));
    return juce::var(result);
}

juce::var WebViewBridge::getDeactivatedPlugins()
{
    return pluginManager.getDeactivatedPluginsAsJson();
}

juce::var WebViewBridge::removeKnownPluginOp(const juce::String& identifier)
{
    bool success = pluginManager.removeKnownPlugin(identifier);

    auto* result = new juce::DynamicObject();
    result->setProperty("success", success);

    if (success)
        emitEvent("pluginListChanged", getPluginList());

    return juce::var(result);
}

juce::var WebViewBridge::getPluginListIncludingDeactivated()
{
    return pluginManager.getPluginListIncludingDeactivatedAsJson();
}

//==============================================================================
// Auto-Scan Detection
//==============================================================================

juce::var WebViewBridge::enableAutoScanOp(int intervalMs)
{
    auto* result = new juce::DynamicObject();
    result->setProperty("success", pluginManager.enableAutoScan(intervalMs));
    return juce::var(result);
}

juce::var WebViewBridge::disableAutoScanOp()
{
    auto* result = new juce::DynamicObject();
    result->setProperty("success", pluginManager.disableAutoScan());
    return juce::var(result);
}

juce::var WebViewBridge::getAutoScanState()
{
    return pluginManager.getAutoScanStateAsJson();
}

juce::var WebViewBridge::checkForNewPluginsOp()
{
    return pluginManager.checkForNewPlugins();
}
