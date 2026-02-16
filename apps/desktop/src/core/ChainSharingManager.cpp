#include "ChainSharingManager.h"

ChainSharingManager::ChainSharingManager() {}

ChainSharingManager::~ChainSharingManager()
{
    isShuttingDown.store(true, std::memory_order_release);
    stopPolling();

    // Wait for any in-flight background threads to finish
    std::unique_lock<std::mutex> lock(shutdownMutex);
    shutdownCondition.wait(lock, [this]() { return activeThreadCount.load() == 0; });
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
    if (isShuttingDown.load(std::memory_order_acquire))
        return;

    activeThreadCount.fetch_add(1);
    auto tokenCopy = sessionToken;
    // Run on a background thread to avoid blocking the message thread
    juce::Thread::launch([this, tokenCopy]()
    {
        if (!isShuttingDown.load(std::memory_order_acquire))
            checkForReceivedChainsWithToken(tokenCopy);

        activeThreadCount.fetch_sub(1);
        shutdownCondition.notify_one();
    });
}

void ChainSharingManager::checkForReceivedChains()
{
    checkForReceivedChainsWithToken(sessionToken);
}

void ChainSharingManager::checkForReceivedChainsWithToken(const juce::String& token)
{
    if (token.isEmpty()) return;
    if (isShuttingDown.load(std::memory_order_acquire)) return;

    // Build the query args
    auto* args = new juce::DynamicObject();
    args->setProperty("path", "privateChains:getReceivedChains");
    
    auto* queryArgs = new juce::DynamicObject();
    queryArgs->setProperty("sessionToken", token);
    args->setProperty("args", juce::var(queryArgs));

    auto response = httpPost("/api/query", juce::var(args));

    if (response.isArray())
    {
        std::vector<ReceivedChainShare> chains;
        auto* arr = response.getArray();

        for (int i = 0; i < arr->size(); ++i)
        {
            auto item = (*arr)[i];
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
        if (onChainsReceived && !chains.empty() && !isShuttingDown.load(std::memory_order_acquire))
        {
            auto chainsCopy = chains;
            juce::MessageManager::callAsync([this, chainsCopy]()
            {
                if (!isShuttingDown.load(std::memory_order_acquire) && onChainsReceived)
                    onChainsReceived(chainsCopy);
            });
        }
    }
}

void ChainSharingManager::sendChainToUser(const juce::String& recipientIdentifier,
                                            const juce::String& chainId)
{
    if (sessionToken.isEmpty()) return;
    if (isShuttingDown.load(std::memory_order_acquire)) return;

    auto tokenCopy = sessionToken;
    activeThreadCount.fetch_add(1);
    juce::Thread::launch([this, recipientIdentifier, chainId, tokenCopy]()
    {
        if (!isShuttingDown.load(std::memory_order_acquire))
        {
            auto* args = new juce::DynamicObject();
            args->setProperty("path", "privateChains:sendChain");

            auto* mutationArgs = new juce::DynamicObject();
            mutationArgs->setProperty("sessionToken", tokenCopy);
            mutationArgs->setProperty("recipientIdentifier", recipientIdentifier);
            mutationArgs->setProperty("chainId", chainId);
            args->setProperty("args", juce::var(mutationArgs));

            httpPost("/api/mutation", juce::var(args));
        }

        activeThreadCount.fetch_sub(1);
        shutdownCondition.notify_one();
    });
}

void ChainSharingManager::acceptChain(const juce::String& shareId)
{
    if (sessionToken.isEmpty()) return;
    if (isShuttingDown.load(std::memory_order_acquire)) return;

    auto tokenCopy = sessionToken;
    activeThreadCount.fetch_add(1);
    juce::Thread::launch([this, shareId, tokenCopy]()
    {
        if (!isShuttingDown.load(std::memory_order_acquire))
        {
            auto* args = new juce::DynamicObject();
            args->setProperty("path", "privateChains:acceptChain");

            auto* mutationArgs = new juce::DynamicObject();
            mutationArgs->setProperty("sessionToken", tokenCopy);
            mutationArgs->setProperty("shareId", shareId);
            args->setProperty("args", juce::var(mutationArgs));

            auto response = httpPost("/api/mutation", juce::var(args));

            if (response.isObject() && !isShuttingDown.load(std::memory_order_acquire))
            {
                auto chainData = response["chainData"].toString();
                auto chainName = response["chainName"].toString();

                juce::MessageManager::callAsync([this, chainData, chainName]()
                {
                    if (onChainImported)
                        onChainImported(chainData, chainName);
                });
            }
        }

        activeThreadCount.fetch_sub(1);
        shutdownCondition.notify_one();
    });
}

void ChainSharingManager::rejectChain(const juce::String& shareId)
{
    if (sessionToken.isEmpty()) return;
    if (isShuttingDown.load(std::memory_order_acquire)) return;

    auto tokenCopy = sessionToken;
    activeThreadCount.fetch_add(1);
    juce::Thread::launch([this, shareId, tokenCopy]()
    {
        if (!isShuttingDown.load(std::memory_order_acquire))
        {
            auto* args = new juce::DynamicObject();
            args->setProperty("path", "privateChains:rejectChain");

            auto* mutationArgs = new juce::DynamicObject();
            mutationArgs->setProperty("sessionToken", tokenCopy);
            mutationArgs->setProperty("shareId", shareId);
            args->setProperty("args", juce::var(mutationArgs));

            httpPost("/api/mutation", juce::var(args));

            // Refresh the list
            if (!isShuttingDown.load(std::memory_order_acquire))
                checkForReceivedChains();
        }

        activeThreadCount.fetch_sub(1);
        shutdownCondition.notify_one();
    });
}

juce::var ChainSharingManager::httpPost(const juce::String& path, const juce::var& args)
{
    juce::URL url(convexUrl + path);

    auto jsonBody = juce::JSON::toString(args);
    url = url.withPOSTData(jsonBody);

    auto options = juce::URL::InputStreamOptions(juce::URL::ParameterHandling::inPostData)
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
