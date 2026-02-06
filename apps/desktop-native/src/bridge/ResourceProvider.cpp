#include "ResourceProvider.h"
#include <BinaryData.h>
#include <juce_core/juce_core.h>
#include <map>
#include <iostream>

namespace ResourceProvider
{

static std::unique_ptr<juce::ZipFile> uiZip;
static std::map<juce::String, juce::String> mimeTypes;
static bool initialized = false;
static juce::File extractedUiDir;

static void initMimeTypes()
{
    mimeTypes[".html"] = "text/html";
    mimeTypes[".htm"] = "text/html";
    mimeTypes[".css"] = "text/css";
    mimeTypes[".js"] = "application/javascript";
    mimeTypes[".mjs"] = "application/javascript";
    mimeTypes[".json"] = "application/json";
    mimeTypes[".png"] = "image/png";
    mimeTypes[".jpg"] = "image/jpeg";
    mimeTypes[".jpeg"] = "image/jpeg";
    mimeTypes[".gif"] = "image/gif";
    mimeTypes[".svg"] = "image/svg+xml";
    mimeTypes[".ico"] = "image/x-icon";
    mimeTypes[".woff"] = "font/woff";
    mimeTypes[".woff2"] = "font/woff2";
    mimeTypes[".ttf"] = "font/ttf";
    mimeTypes[".eot"] = "application/vnd.ms-fontobject";
}

static juce::String getMimeType(const juce::String& path)
{
    auto ext = path.fromLastOccurrenceOf(".", true, false).toLowerCase();
    auto it = mimeTypes.find(ext);
    if (it != mimeTypes.end())
        return it->second;
    return "application/octet-stream";
}

static void extractUiFiles()
{
    if (BinaryData::ui_zipSize == 0)
    {
        DBG("No UI ZIP data found in binary resources");
        return;
    }

    // Create temp directory for extracted UI
    extractedUiDir = juce::File::getSpecialLocation(juce::File::tempDirectory)
        .getChildFile("PluginChainManagerUI");

    // Clean and recreate
    if (extractedUiDir.exists())
        extractedUiDir.deleteRecursively();
    extractedUiDir.createDirectory();

    // Load ZIP
    juce::MemoryInputStream zipStream(BinaryData::ui_zip, BinaryData::ui_zipSize, false);
    juce::ZipFile zip(&zipStream, false);

    DBG("Extracting UI files to: " + extractedUiDir.getFullPathName());
    DBG("ZIP contains " + juce::String(zip.getNumEntries()) + " entries");

    // Extract all files
    for (int i = 0; i < zip.getNumEntries(); ++i)
    {
        auto* entry = zip.getEntry(i);
        if (entry == nullptr)
            continue;

        auto filename = entry->filename;

        // Skip placeholder and directories
        if (filename.endsWith("/") || filename == "placeholder.txt")
            continue;

        auto targetFile = extractedUiDir.getChildFile(filename);
        targetFile.getParentDirectory().createDirectory();

        if (auto stream = std::unique_ptr<juce::InputStream>(zip.createStreamForEntry(i)))
        {
            juce::FileOutputStream outStream(targetFile);
            if (outStream.openedOk())
            {
                outStream.writeFromInputStream(*stream, -1);
                DBG("Extracted: " + filename);
            }
        }
    }
}

void initialize()
{
    if (initialized)
        return;

    initMimeTypes();
    extractUiFiles();
    initialized = true;
}

bool isDevMode()
{
    // Check environment variable regardless of build type
    return juce::SystemStats::getEnvironmentVariable("PLUGIN_DEV_MODE", "0") == "1";
}

juce::String getBaseUrl()
{
    initialize();

    // Always use the resource provider - this enables native function integration
    #if JUCE_DEBUG
    std::cerr << "Loading UI from resource provider" << std::endl;
    #endif
    return "https://ui.local/index.html";
}

std::optional<juce::WebBrowserComponent::Resource> getResource(const juce::String& url)
{
    initialize();

    #if JUCE_DEBUG
    std::cerr << "ResourceProvider::getResource called with URL: " << url << std::endl;
    #endif

    // Parse the URL to get the path
    juce::String path;
    juce::URL parsedUrl(url);
    path = parsedUrl.getSubPath();

    // Clean up path
    if (path.isEmpty() || path == "/")
        path = "index.html";
    if (path.startsWith("/"))
        path = path.substring(1);

    #if JUCE_DEBUG
    std::cerr << "Looking for resource: " << path << std::endl;
    std::cerr << "Extracted UI dir: " << extractedUiDir.getFullPathName() << std::endl;
    #endif

    // Try to find the file in extracted UI
    auto file = extractedUiDir.getChildFile(path);

    // For SPA routing, serve index.html for unknown paths without extensions
    if (!file.existsAsFile() && !path.contains("."))
        file = extractedUiDir.getChildFile("index.html");

    if (file.existsAsFile())
    {
        #if JUCE_DEBUG
        std::cerr << "Found file: " << file.getFullPathName() << std::endl;
        #endif

        juce::MemoryBlock data;
        file.loadFileAsData(data);

        auto mimeType = getMimeType(path);
        #if JUCE_DEBUG
        std::cerr << "Serving " << data.getSize() << " bytes with mime type: " << mimeType << std::endl;
        #endif

        return juce::WebBrowserComponent::Resource{
            std::vector<std::byte>(
                reinterpret_cast<const std::byte*>(data.getData()),
                reinterpret_cast<const std::byte*>(data.getData()) + data.getSize()
            ),
            mimeType.toStdString()
        };
    }

    #if JUCE_DEBUG
    std::cerr << "File not found: " << path << std::endl;
    #endif
    return std::nullopt;
}

} // namespace ResourceProvider
