#include "KeyboardInterceptor.h"

#if defined(__APPLE__)

#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>

// ---------------------------------------------------------------------------
// ARC compatibility: JUCE compiles .mm files WITHOUT ARC by default.
// We must manually retain/release Objective-C objects stored in static vars.
// ---------------------------------------------------------------------------
#if __has_feature(objc_arc)
  #define KI_RETAIN(x)   (x)
  #define KI_RELEASE(x)  (x) = nil
#else
  #define KI_RETAIN(x)   [(x) retain]
  #define KI_RELEASE(x)  do { [(x) release]; (x) = nil; } while(0)
#endif

// ---------------------------------------------------------------------------
// Internal state — tracks all registered WKWebViews across plugin instances
// ---------------------------------------------------------------------------
static NSHashTable<WKWebView*>* registeredWebViews()
{
    static NSHashTable<WKWebView*>* table = KI_RETAIN([NSHashTable weakObjectsHashTable]);
    return table;
}

static id  keyDownMonitor  = nil;
static id  keyUpMonitor    = nil;
static id  flagsMonitor    = nil;
static int installCount    = 0;

// ---------------------------------------------------------------------------
// Helper: recursively find the WKWebView inside a native view hierarchy
// ---------------------------------------------------------------------------
static WKWebView* findWKWebView(NSView* view)
{
    if (!view)
        return nil;

    if ([view isKindOfClass:[WKWebView class]])
        return (WKWebView*)view;

    for (NSView* child in view.subviews)
    {
        if (auto* found = findWKWebView(child))
            return found;
    }
    return nil;
}

// ---------------------------------------------------------------------------
// Helper: check whether the given event targets one of our registered WebViews
// ---------------------------------------------------------------------------
static WKWebView* matchingWebView(NSEvent* event)
{
    @try {
        NSWindow* eventWindow = [event window];
        if (!eventWindow)
            return nil;

        NSResponder* firstResponder = [eventWindow firstResponder];
        if (!firstResponder || ![firstResponder isKindOfClass:[NSView class]])
            return nil;

        NSView* frView = (NSView*)firstResponder;

        for (WKWebView* wv in registeredWebViews())
        {
            if (!wv || [wv window] != eventWindow)
                continue;

            if (frView == wv || [frView isDescendantOf:wv])
                return wv;
        }
    }
    @catch (NSException*) {}
    return nil;
}

// ---------------------------------------------------------------------------
// Install / Remove
// ---------------------------------------------------------------------------
namespace KeyboardInterceptor
{

void install(juce::WebBrowserComponent* browser, juce::Component* editor)
{
    if (!browser || !editor)
        return;

    auto* peer = editor->getPeer();
    if (!peer)
        return;

    NSView* editorView = (NSView*)peer->getNativeHandle();
    if (!editorView)
        return;

    WKWebView* webView = findWKWebView(editorView);
    if (!webView)
        return;

    [registeredWebViews() addObject:webView];

    if (installCount++ > 0)
        return;

    keyDownMonitor = KI_RETAIN([NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown
        handler:^NSEvent*(NSEvent* event)
        {
            WKWebView* wv = matchingWebView(event);
            if (wv)
            {
                @try { [wv keyDown:event]; }
                @catch (NSException*) {}
                return nil;
            }
            return event;
        }]);

    keyUpMonitor = KI_RETAIN([NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyUp
        handler:^NSEvent*(NSEvent* event)
        {
            WKWebView* wv = matchingWebView(event);
            if (wv)
            {
                @try { [wv keyUp:event]; }
                @catch (NSException*) {}
                return nil;
            }
            return event;
        }]);

    flagsMonitor = KI_RETAIN([NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskFlagsChanged
        handler:^NSEvent*(NSEvent* event)
        {
            WKWebView* wv = matchingWebView(event);
            if (wv)
            {
                @try { [wv flagsChanged:event]; }
                @catch (NSException*) {}
                return nil;
            }
            return event;
        }]);
}

void remove(juce::WebBrowserComponent* browser)
{
    if (!browser)
        return;

    if (--installCount <= 0)
    {
        installCount = 0;

        if (keyDownMonitor)
        {
            [NSEvent removeMonitor:keyDownMonitor];
            KI_RELEASE(keyDownMonitor);
        }
        if (keyUpMonitor)
        {
            [NSEvent removeMonitor:keyUpMonitor];
            KI_RELEASE(keyUpMonitor);
        }
        if (flagsMonitor)
        {
            [NSEvent removeMonitor:flagsMonitor];
            KI_RELEASE(flagsMonitor);
        }
    }
}

} // namespace KeyboardInterceptor

#endif // __APPLE__
