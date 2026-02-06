#include "UserProfile.h"

UserProfile::UserProfile() {}

juce::String UserProfile::getUsername() const { return data.username; }
juce::String UserProfile::getEmail() const { return data.email; }
juce::String UserProfile::getPhoneNumber() const { return data.phoneNumber; }
juce::String UserProfile::getInstagramHandle() const { return data.instagramHandle; }

ProfileData UserProfile::getProfileData() const { return data; }

void UserProfile::setUsername(const juce::String& username)
{
    data.username = username;
}

void UserProfile::setEmail(const juce::String& email)
{
    data.email = email;
}

void UserProfile::setPhoneNumber(const juce::String& phone)
{
    data.phoneNumber = phone;
}

void UserProfile::setInstagramHandle(const juce::String& handle)
{
    data.instagramHandle = handle;
}

void UserProfile::setProfileData(const ProfileData& newData)
{
    data = newData;
}

bool UserProfile::hasProfile() const
{
    return data.username.isNotEmpty();
}

void UserProfile::saveToTree(juce::ValueTree& parent) const
{
    auto profileNode = parent.getOrCreateChildWithName(PROFILE_NODE, nullptr);
    profileNode.setProperty(PROP_USERNAME, data.username, nullptr);
    profileNode.setProperty(PROP_EMAIL, data.email, nullptr);
    profileNode.setProperty(PROP_PHONE, data.phoneNumber, nullptr);
    profileNode.setProperty(PROP_INSTAGRAM, data.instagramHandle, nullptr);
}

void UserProfile::loadFromTree(const juce::ValueTree& parent)
{
    auto profileNode = parent.getChildWithName(PROFILE_NODE);
    if (profileNode.isValid())
    {
        data.username = profileNode.getProperty(PROP_USERNAME, "").toString();
        data.email = profileNode.getProperty(PROP_EMAIL, "").toString();
        data.phoneNumber = profileNode.getProperty(PROP_PHONE, "").toString();
        data.instagramHandle = profileNode.getProperty(PROP_INSTAGRAM, "").toString();
    }
}
