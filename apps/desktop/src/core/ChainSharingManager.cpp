#include "ChainSharingManager.h"

ChainSharingManager::ChainSharingManager() {}

ChainSharingManager::~ChainSharingManager()
{
    stopPolling();
}

void ChainSharingManager::startPolling()
{
    if (sessionToken.isEmpty())
    {
        DBG("ChainSharingManager: Cannot start polling without session token");
        return;
    }

    startTimer(POLL_INTERVAL_MS);

    // Immediately check once
    checkForReceivedChains();
}

void ChainSharingManager::stopPolling()
{
    stopTimer();
}

void ChainSharingManager::setSessionToken(const juce::String& token)
{
    sessionToken = token;
}

void ChainSharingManager::setConvexUrl(const juce::String& url)
{
    convexUrl = url;
}

void ChainSharingManager::timerCallback()
{
    // Run on a background thread to avoid blocking the message thread
    juce::Thread::launch([this]()
    {
        checkForReceivedChains();
    });
}

void ChainSharingManager::checkForReceivedChains()
{
    if (sessionToken.isEmpty()) return;

    auto result = httpPost("/api/query", juce::var(new juce::DynamicObject()));

    // Build the query args
    auto* args = new juce::DynamicObject();
    args->setProperty("path", "privateChains:getReceivedChains");
    
    auto* queryArgs = new juce::DynamicObject();
    queryArgs->setProperty("sessionToken", sessionToken);
    args->setProperty("args", juce::var(queryArgs));

    auto response = httpPost("/api/query", juce::var(args));

    if (response.isArray())
    {
        std::vector<ReceivedChainShare> chains;
        auto* arr = response.getArray();

        for (int i = 0; i < arr->size(); ++i)
        {
            auto& item = (*arr)[i];
            ReceivedChainShare share;
            share.shareId = item["_id"].toString();
            share.chainName = item["chainName"].toString();
            share.chainId = item["chainId"].toString();
            share.senderUsername = item["senderUsername"].toString();
            share.senderId = item["senderId"].toString();
            share.status = item["status"].toString();
            share.sentAt = (int64_t) item["sentAt"];
            chains.push_back(share);
        }

        pendingCount.store((int) chains.size());

        // Dispatch callback on message thread
        if (onChainsReceived && !chains.empty())
        {
            auto chainsCopy = chains;
            juce::MessageManager::callAsync([this, chainsCopy]()
            {
                if (onChainsReceived)
                    onChainsReceived(chainsCopy);
            });
        }
    }
}

void ChainSharingManager::sendChainToUser(const juce::String& recipientIdentifier,
                                            const juce::String& chainId)
{
    if (sessionToken.isEmpty()) return;

    juce::Thread::launch([this, recipientIdentifier, chainId]()
    {
        auto* args = new juce::DynamicObject();
        args->setProperty("path", "privateChains:sendChain");
        
        auto* mutationArgs = new juce::DynamicObject();
        mutationArgs->setProperty("sessionToken", sessionToken);
        mutationArgs->setProperty("recipientIdentifier", recipientIdentifier);
        mutationArgs->setProperty("chainId", chainId);
        args->setProperty("args", juce::var(mutationArgs));

        httpPost("/api/mutation", juce::var(args));
    });
}

void ChainSharingManager::acceptChain(const juce::String& shareId)
{
    if (sessionToken.isEmpty()) return;

    juce::Thread::launch([this, shareId]()
    {
        auto* args = new juce::DynamicObject();
        args->setProperty("path", "privateChains:acceptChain");
        
        auto* mutationArgs = new juce::DynamicObject();
        mutationArgs->setProperty("sessionToken", sessionToken);
        mutationArgs->setProperty("shareId", shareId);
        args->setProperty("args", juce::var(mutationArgs));

        auto response = httpPost("/api/mutation", juce::var(args));

        if (response.isObject())
        {
            auto chainData = response["chainData"].toString();
            auto chainName = response["chainName"].toString();

            juce::MessageManager::callAsync([this, chainData, chainName]()
            {
                if (onChainImported)
                    onChainImported(chainData, chainName);
            });
        }
    });
}

void ChainSharingManager::rejectChain(const juce::String& shareId)
{
    if (sessionToken.isEmpty()) return;

    juce::Thread::launch([this, shareId]()
    {
        auto* args = new juce::DynamicObject();
        args->setProperty("path", "privateChains:rejectChain");
        
        auto* mutationArgs = new juce::DynamicObject();
        mutationArgs->setProperty("sessionToken", sessionToken);
        mutationArgs->setProperty("shareId", shareId);
        args->setProperty("args", juce::var(mutationArgs));

        httpPost("/api/mutation", juce::var(args));

        // Refresh the list
        checkForReceivedChains();
    });
}

juce::var ChainSharingManager::httpPost(const juce::String& path, const juce::var& args)
{
    juce::URL url(convexUrl + path);

    auto jsonBody = juce::JSON::toString(args);
    url = url.withPOSTData(jsonBody);

    auto options = juce::URL::InputStreamOptions(juce::URL::ParameterHandling::inPostBody)
        .withExtraHeaders("Content-Type: application/json")
        .withConnectionTimeoutMs(10000)
        .withResponseHeaders(nullptr);

    auto stream = url.createInputStream(options);

    if (stream == nullptr)
    {
        DBG("ChainSharingManager: HTTP request failed - no stream");
        return {};
    }

    auto responseBody = stream->readEntireStreamAsString();
    auto parsed = juce::JSON::parse(responseBody);

    // Convex returns { "value": ... } for queries/mutations
    if (parsed.isObject() && parsed.hasProperty("value"))
        return parsed["value"];

    return parsed;
}
