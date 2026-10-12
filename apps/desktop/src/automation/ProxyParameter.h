#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <atomic>

class ProxyParameter : public juce::AudioProcessorParameterWithID,
                       public juce::AudioProcessorParameter::Listener
{
public:
    class ReadGuard
    {
    public:
        ReadGuard(const ProxyParameter& owner) noexcept;
        ~ReadGuard();
        juce::AudioProcessorParameter* get() const noexcept { return target; }
        ReadGuard(const ReadGuard&) = delete;
        ReadGuard& operator=(const ReadGuard&) = delete;
    private:
        const ProxyParameter& owner;
        juce::AudioProcessorParameter* target = nullptr;
        bool counted = true;
    };

    ProxyParameter(int slotIndex, int paramIndex);
    ~ProxyParameter() override;

    void bind(juce::AudioProcessorParameter* param);
    void unbind();
    bool isQuiescent() const noexcept { return activeReaders.load(std::memory_order_seq_cst) == 0; }

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
    mutable std::atomic<unsigned int> activeReaders { 0 };
    std::atomic<bool> retiring { false };
    int slotIndex;
    int paramIndex;

    static juce::String makeParamID(int slot, int param);
    static juce::String makeParamName(int slot, int param);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ProxyParameter)
};
