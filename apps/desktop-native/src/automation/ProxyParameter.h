#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <atomic>

class ProxyParameter : public juce::AudioProcessorParameterWithID,
                       public juce::AudioProcessorParameter::Listener
{
public:
    ProxyParameter(int slotIndex, int paramIndex);
    ~ProxyParameter() override;

    void bind(juce::AudioProcessorParameter* param);
    void unbind();

    // AudioProcessorParameter overrides
    float getValue() const override;
    void setValue(float newValue) override;
    float getDefaultValue() const override;
    juce::String getName(int maximumStringLength) const override;
    juce::String getLabel() const override;
    int getNumSteps() const override;
    bool isDiscrete() const override;
    bool isBoolean() const override;
    juce::String getText(float value, int maximumStringLength) const override;
    float getValueForText(const juce::String& text) const override;
    bool isAutomatable() const override;
    bool isMetaParameter() const override;

    // AudioProcessorParameter::Listener
    void parameterValueChanged(int parameterIndex, float newValue) override;
    void parameterGestureChanged(int parameterIndex, bool gestureIsStarting) override;

private:
    std::atomic<juce::AudioProcessorParameter*> target { nullptr };
    int slotIndex;
    int paramIndex;

    static juce::String makeParamID(int slot, int param);
    static juce::String makeParamName(int slot, int param);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ProxyParameter)
};
