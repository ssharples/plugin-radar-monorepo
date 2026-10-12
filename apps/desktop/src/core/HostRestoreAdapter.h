#pragma once
#include <juce_events/juce_events.h>
#include <exception>
#include <functional>

/** Synchronous control-thread adapter for DAW restore/preparation. These are host
    lifecycle calls, never render callbacks. JUCE requires its graph compilation
    and hosted AU UI/lifecycle work to run on an unblocked message thread. UI
    browsing instead uses ChainProcessor's asynchronous candidate queue. */
inline void onHostControlThread(const std::function<void()>& operation)
{
    auto* messages = juce::MessageManager::getInstance();
    if (messages->isThisTheMessageThread()) { operation(); return; }
    struct Invocation { const std::function<void()>& operation; std::exception_ptr error; } invocation {operation, {}};
    messages->callFunctionOnMessageThread([](void* context) -> void* {
        auto& call = *static_cast<Invocation*>(context);
        try { call.operation(); } catch (...) { call.error = std::current_exception(); }
        return nullptr;
    }, &invocation);
    if (invocation.error) std::rethrow_exception(invocation.error);
}
