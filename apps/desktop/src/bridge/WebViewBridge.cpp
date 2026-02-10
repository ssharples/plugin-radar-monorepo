#include "WebViewBridge.h"
#include "ResourceProvider.h"
#include "../core/ChainNode.h"
#include "../core/ParameterDiscovery.h"
#include "../audio/WaveformCapture.h"
#include "../audio/GainProcessor.h"
#include "../audio/AudioMeter.h"
#include "../audio/FFTProcessor.h"
#include "../audio/NodeMeterProcessor.h"
#include <cmath>

WebViewBridge::WebViewBridge(PluginManager& pm,
                             ChainProcessor& cp,
                             PresetManager& prm)
    : pluginManager(pm)
    , chainProcessor(cp)
    , presetManager(prm)
{
    bindCallbacks();
}

WebViewBridge::~WebViewBridge()
{
    stopTimer();
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
        .withNativeFunction("getCategories", [this](const juce::Array<juce::var>& args,
                                                     juce::WebBrowserComponent::NativeFunctionCompletion completion) {
            juce::ignoreUnused(args);
            completion(getCategories());
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
                bool success = chainProcessor.importChainWithPresets(args[0]);
                auto* result = new juce::DynamicObject();
                result->setProperty("success", success);
                if (success)
                    result->setProperty("chainState", getChainState());
                else
                    result->setProperty("error", "Failed to import chain");
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

    chainProcessor.onChainChanged = [this]() {
        emitEvent("chainChanged", getChainState());
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

    pluginManager.onPluginBlacklisted = [this](const juce::String& pluginPath) {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("path", pluginPath);
        obj->setProperty("name", juce::File(pluginPath).getFileNameWithoutExtension());
        obj->setProperty("reason", "Plugin caused a crash during scanning and was automatically blacklisted");
        emitEvent("pluginBlacklisted", juce::var(obj));
        emitEvent("blacklistChanged", getBlacklist());
    };
}

void WebViewBridge::emitEvent(const juce::String& eventName, const juce::var& data)
{
    #if JUCE_DEBUG
    std::cerr << "WebViewBridge::emitEvent: " << eventName << std::endl;
    #endif
    if (webBrowser)
    {
        webBrowser->emitEventIfBrowserIsVisible(eventName, data);
        #if JUCE_DEBUG
        std::cerr << "  -> Event emitted to browser" << std::endl;
        #endif
    }
    else
    {
        #if JUCE_DEBUG
        std::cerr << "  -> No webBrowser set!" << std::endl;
        #endif
    }
}

std::optional<juce::WebBrowserComponent::Resource> WebViewBridge::resourceHandler(const juce::String& url)
{
    return ResourceProvider::getResource(url);
}

void WebViewBridge::timerCallback()
{
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

        emitEvent("meterData", juce::var(meterObj));
    }

    // Emit FFT spectrum data if processor is available
    if (fftProcessor)
    {
        auto magnitudes = fftProcessor->getMagnitudes();

        juce::Array<juce::var> fftArr;
        fftArr.ensureStorageAllocated(static_cast<int>(magnitudes.size()));
        for (float v : magnitudes)
            fftArr.add(v);

        auto* fftObj = new juce::DynamicObject();
        fftObj->setProperty("magnitudes", fftArr);
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
                entry->setProperty("inputPeakL", nm.inputPeakL);
                entry->setProperty("inputPeakR", nm.inputPeakR);
                entry->setProperty("inputPeakHoldL", nm.inputPeakHoldL);
                entry->setProperty("inputPeakHoldR", nm.inputPeakHoldR);
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

juce::var WebViewBridge::getCategories()
{
    auto categories = presetManager.getCategories();
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
