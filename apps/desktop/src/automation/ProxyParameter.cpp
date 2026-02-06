#include "ProxyParameter.h"

ProxyParameter::ProxyParameter(int slotIdx, int paramIdx)
    : AudioProcessorParameterWithID(makeParamID(slotIdx, paramIdx),
                                     makeParamName(slotIdx, paramIdx)),
      slotIndex(slotIdx),
      paramIndex(paramIdx)
{
}

ProxyParameter::~ProxyParameter()
{
    unbind();
}

juce::String ProxyParameter::makeParamID(int slot, int param)
{
    return "s" + juce::String(slot + 1).paddedLeft('0', 2)
         + "_p" + juce::String(param).paddedLeft('0', 3);
}

juce::String ProxyParameter::makeParamName(int slot, int param)
{
    return "Slot " + juce::String(slot + 1) + " Param " + juce::String(param);
}

void ProxyParameter::bind(juce::AudioProcessorParameter* param)
{
    unbind();

    if (param != nullptr)
    {
        target.store(param, std::memory_order_release);
        param->addListener(this);
        sendValueChangedMessageToListeners(param->getValue());
    }
}

void ProxyParameter::unbind()
{
    auto* prev = target.exchange(nullptr, std::memory_order_acq_rel);
    if (prev != nullptr)
        prev->removeListener(this);

    sendValueChangedMessageToListeners(0.0f);
}

float ProxyParameter::getValue() const
{
    auto* t = target.load(std::memory_order_acquire);
    return t != nullptr ? t->getValue() : 0.0f;
}

void ProxyParameter::setValue(float newValue)
{
    auto* t = target.load(std::memory_order_acquire);
    if (t != nullptr)
        t->setValue(newValue);
}

float ProxyParameter::getDefaultValue() const
{
    auto* t = target.load(std::memory_order_acquire);
    return t != nullptr ? t->getDefaultValue() : 0.0f;
}

juce::String ProxyParameter::getName(int maximumStringLength) const
{
    auto* t = target.load(std::memory_order_acquire);
    if (t != nullptr)
        return ("[Slot" + juce::String(slotIndex + 1) + "] " + t->getName(maximumStringLength))
                   .substring(0, maximumStringLength);

    return makeParamName(slotIndex, paramIndex).substring(0, maximumStringLength);
}

juce::String ProxyParameter::getLabel() const
{
    auto* t = target.load(std::memory_order_acquire);
    return t != nullptr ? t->getLabel() : juce::String();
}

int ProxyParameter::getNumSteps() const
{
    auto* t = target.load(std::memory_order_acquire);
    return t != nullptr ? t->getNumSteps() : AudioProcessorParameter::getNumSteps();
}

bool ProxyParameter::isDiscrete() const
{
    auto* t = target.load(std::memory_order_acquire);
    return t != nullptr ? t->isDiscrete() : false;
}

bool ProxyParameter::isBoolean() const
{
    auto* t = target.load(std::memory_order_acquire);
    return t != nullptr ? t->isBoolean() : false;
}

juce::String ProxyParameter::getText(float value, int maximumStringLength) const
{
    auto* t = target.load(std::memory_order_acquire);
    return t != nullptr ? t->getText(value, maximumStringLength)
                        : AudioProcessorParameterWithID::getText(value, maximumStringLength);
}

float ProxyParameter::getValueForText(const juce::String& text) const
{
    auto* t = target.load(std::memory_order_acquire);
    return t != nullptr ? t->getValueForText(text) : 0.0f;
}

bool ProxyParameter::isAutomatable() const
{
    auto* t = target.load(std::memory_order_acquire);
    return t != nullptr ? t->isAutomatable() : true;
}

bool ProxyParameter::isMetaParameter() const
{
    auto* t = target.load(std::memory_order_acquire);
    return t != nullptr ? t->isMetaParameter() : false;
}

void ProxyParameter::parameterValueChanged(int /*parameterIndex*/, float newValue)
{
    sendValueChangedMessageToListeners(newValue);
}

void ProxyParameter::parameterGestureChanged(int /*parameterIndex*/, bool gestureIsStarting)
{
    if (gestureIsStarting)
        beginChangeGesture();
    else
        endChangeGesture();
}
