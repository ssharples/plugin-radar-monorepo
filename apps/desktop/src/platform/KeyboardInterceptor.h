#pragma once

/**
 * Native macOS keyboard interceptor for JUCE WebBrowserComponent.
 *
 * Problem: When a WKWebView (used by JUCE's WebBrowserComponent) has native
 * macOS first-responder focus, JUCE's keyPressed() is never called. DAWs
 * intercept keyboard shortcuts via performKeyEquivalent: or sendEvent: at the
 * NSWindow level before they reach the WebView.
 *
 * Solution: Install an NSEvent local monitor that intercepts key events BEFORE
 * they enter the normal dispatch chain. When our WebView is focused, we forward
 * the event directly to the WKWebView and consume it, preventing the DAW from
 * seeing it at all.
 *
 * On non-macOS platforms this is a no-op.
 */

#if defined(__APPLE__)

#include <juce_gui_extra/juce_gui_extra.h>

namespace KeyboardInterceptor
{
    void install(juce::WebBrowserComponent* browser, juce::Component* editor);
    void remove(juce::WebBrowserComponent* browser);
}

#else

// No-op on non-macOS platforms
namespace KeyboardInterceptor
{
    template <typename B, typename E>
    inline void install(B*, E*) {}
    template <typename B>
    inline void remove(B*) {}
}

#endif
