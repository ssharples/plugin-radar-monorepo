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

ProxyParameter::ReadGuard::ReadGuard(const ProxyParameter& ownerIn) noexcept : owner(ownerIn)
{
    // A single global atomic order closes the enter-vs-retire race: any reader
    // that observes the old target is counted before the retirement check.
    owner.activeReaders.fetch_add(1, std::memory_order_seq_cst);
    if (!owner.retiring.load(std::memory_order_seq_cst))
        target = owner.target.load(std::memory_order_seq_cst);
    else
    {
        owner.activeReaders.fetch_sub(1, std::memory_order_seq_cst);
        counted = false;
    }
}

ProxyParameter::ReadGuard::~ReadGuard()
{
    if (counted) owner.activeReaders.fetch_sub(1, std::memory_order_seq_cst);
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
    if (target.load(std::memory_order_seq_cst) == param) return;
    unbind();

    if (param != nullptr)
    {
        retiring.store(false, std::memory_order_seq_cst);
        target.store(param, std::memory_order_seq_cst);
        param->addListener(this);
        sendValueChangedMessageToListeners(param->getValue());
    }
}

void ProxyParameter::unbind()
{
    retiring.store(true, std::memory_order_seq_cst);
    auto* prev = target.exchange(nullptr, std::memory_order_seq_cst);
    if (prev != nullptr)
        prev->removeListener(this);
}

float ProxyParameter::getValue() const
{
    ReadGuard guard(*this); auto* t = guard.get();
    return t != nullptr ? t->getValue() : 0.0f;
}

void ProxyParameter::setValue(float newValue)
{
    ReadGuard guard(*this); auto* t = guard.get();
    if (t != nullptr)
        t->setValue(newValue);
}

float ProxyParameter::getDefaultValue() const
{
    ReadGuard guard(*this); auto* t = guard.get();
    return t != nullptr ? t->getDefaultValue() : 0.0f;
}

juce::String ProxyParameter::getName(int maximumStringLength) const
{
    ReadGuard guard(*this); auto* t = guard.get();
    if (t != nullptr)
        return ("[Slot" + juce::String(slotIndex + 1) + "] " + t->getName(maximumStringLength))
                   .substring(0, maximumStringLength);

    return makeParamName(slotIndex, paramIndex).substring(0, maximumStringLength);
}

juce::String ProxyParameter::getLabel() const
{
    ReadGuard guard(*this); auto* t = guard.get();
    return t != nullptr ? t->getLabel() : juce::String();
}

int ProxyParameter::getNumSteps() const
{
    ReadGuard guard(*this); auto* t = guard.get();
    return t != nullptr ? t->getNumSteps() : AudioProcessorParameter::getNumSteps();
}

bool ProxyParameter::isDiscrete() const
{
    ReadGuard guard(*this); auto* t = guard.get();
    return t != nullptr ? t->isDiscrete() : false;
}

bool ProxyParameter::isBoolean() const
{
    ReadGuard guard(*this); auto* t = guard.get();
    return t != nullptr ? t->isBoolean() : false;
}

juce::String ProxyParameter::getText(float value, int maximumStringLength) const
{
    ReadGuard guard(*this); auto* t = guard.get();
    return t != nullptr ? t->getText(value, maximumStringLength)
                        : AudioProcessorParameterWithID::getText(value, maximumStringLength);
}

float ProxyParameter::getValueForText(const juce::String& text) const
{
    ReadGuard guard(*this); auto* t = guard.get();
    return t != nullptr ? t->getValueForText(text) : 0.0f;
}

bool ProxyParameter::isAutomatable() const
{
    ReadGuard guard(*this); auto* t = guard.get();
    return t != nullptr ? t->isAutomatable() : true;
}

bool ProxyParameter::isMetaParameter() const
{
    ReadGuard guard(*this); auto* t = guard.get();
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
