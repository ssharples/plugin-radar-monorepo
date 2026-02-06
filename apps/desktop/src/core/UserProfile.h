#pragma once

#include <juce_data_structures/juce_data_structures.h>

/**
 * Represents the user's social profile data.
 * Stored in a ValueTree for persistence with the plugin state.
 */
struct ProfileData
{
    juce::String username;
    juce::String email;
    juce::String phoneNumber;
    juce::String instagramHandle;
};

class UserProfile
{
public:
    UserProfile();

    // Getters
    juce::String getUsername() const;
    juce::String getEmail() const;
    juce::String getPhoneNumber() const;
    juce::String getInstagramHandle() const;
    ProfileData getProfileData() const;

    // Setters
    void setUsername(const juce::String& username);
    void setEmail(const juce::String& email);
    void setPhoneNumber(const juce::String& phone);
    void setInstagramHandle(const juce::String& handle);
    void setProfileData(const ProfileData& data);

    // Serialization
    void saveToTree(juce::ValueTree& parent) const;
    void loadFromTree(const juce::ValueTree& parent);

    // Check if profile has been set up
    bool hasProfile() const;

private:
    ProfileData data;

    static inline const juce::Identifier PROFILE_NODE { "UserProfile" };
    static inline const juce::Identifier PROP_USERNAME { "username" };
    static inline const juce::Identifier PROP_EMAIL { "email" };
    static inline const juce::Identifier PROP_PHONE { "phoneNumber" };
    static inline const juce::Identifier PROP_INSTAGRAM { "instagramHandle" };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(UserProfile)
};
