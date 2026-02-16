#pragma once

#include <juce_core/juce_core.h>
#include <memory>

/**
 * ProChain File Logger — writes to ~/Library/Logs/ProChain/ProChain.log
 *
 * Singleton FileLogger shared by all plugin instances in the process.
 * Safe to call from any thread (juce::FileLogger is internally synchronized).
 *
 * Usage:
 *   PCLOG("Something happened");
 *   PCLOG("Value is " + juce::String(42));
 */
class ProChainLogger
{
public:
    static ProChainLogger& getInstance()
    {
        static ProChainLogger instance;
        return instance;
    }

    void log(const juce::String& message)
    {
        if (fileLogger)
            fileLogger->logMessage(message);
    }

    void log(const juce::String& tag, const juce::String& message)
    {
        if (fileLogger)
            fileLogger->logMessage("[" + tag + "] " + message);
    }

private:
    ProChainLogger()
    {
        auto logDir = juce::File::getSpecialLocation(juce::File::userHomeDirectory)
                          .getChildFile("Library/Logs/ProChain");
        logDir.createDirectory();

        auto logFile = logDir.getChildFile("ProChain.log");

        // Rotate if > 2MB
        if (logFile.existsAsFile() && logFile.getSize() > 2 * 1024 * 1024)
        {
            auto oldLog = logDir.getChildFile("ProChain.old.log");
            oldLog.deleteFile();
            logFile.moveFileTo(oldLog);
        }

        fileLogger = std::make_unique<juce::FileLogger>(
            logFile,
            "ProChain — Log started"
        );
    }

    ~ProChainLogger() = default;

    std::unique_ptr<juce::FileLogger> fileLogger;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ProChainLogger)
};

/** Convenience macro — use like: PCLOG("message here"); */
#define PCLOG(msg) ProChainLogger::getInstance().log(msg)
#define PCLOG_TAG(tag, msg) ProChainLogger::getInstance().log(tag, msg)
