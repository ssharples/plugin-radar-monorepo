# ProChain Privacy Policy

**Last updated:** February 2026

This privacy policy describes how ProChain ("we", "us", "our") collects, uses, and protects your personal information when you use the ProChain desktop plugin and the Plugin Radar website.

---

## 1. Information We Collect

### Account Information

When you create an account, we collect:
- **Email address** -- used for authentication and account recovery
- **Username** -- displayed publicly on shared chains, comments, and your profile
- **Password** -- stored as a PBKDF2 hash; we never store or have access to your plaintext password

### Profile Information (Optional)

You may optionally provide:
- Contact information (phone number, Instagram handle) -- used only for friend lookup
- Display name

### Plugin Data

When you use the plugin scanner, we collect:
- **List of installed audio plugins** (names, manufacturers, formats) -- used to enable plugin compatibility checking and cloud chain features
- This data is synced to the cloud only if you are logged in and have completed the onboarding scan

### Chain Data

When you save chains to the cloud, we store:
- Chain name, description, and structure (plugin order, group configuration)
- Plugin preset data (binary state blobs) embedded in the chain
- Associated metadata (creation date, update date, public/private status)

### Social Activity

When you interact with community features, we store:
- Star ratings you give to chains
- Comments you post on chains
- Follow/unfollow actions
- Friend requests and friendships
- Chain forks

### Usage Data

We currently do **not** collect analytics, telemetry, or usage tracking data. This may change in future versions, and this policy will be updated accordingly.

---

## 2. How We Use Your Information

We use your information to:
- Authenticate you and maintain your session
- Display your username on shared chains, comments, and profiles
- Enable plugin compatibility checking (matching your plugins against community chains)
- Deliver chains shared with you by friends
- Display ratings, comments, and social interactions on community chains
- Enable friend lookup by username, email, phone, or Instagram handle

We do **not** sell your data to third parties.

---

## 3. Data Storage

All user data is stored in a **Convex** cloud database (convex.dev). Convex provides:
- Encrypted data at rest and in transit
- Hosted in the United States
- Automatic backups

For more information on Convex's security practices, see [convex.dev/security](https://convex.dev).

---

## 4. Session Management

- When you log in, a session token is generated and stored in your browser's `localStorage` (key: `pluginradar_session`).
- Session tokens expire after **7 days**, after which you will need to log in again.
- Sessions are opaque tokens (not JWTs) and cannot be decoded by third parties.
- You can log out at any time, which invalidates your session token.

---

## 5. Third-Party Services

| Service | Purpose | Data Shared |
|---------|---------|-------------|
| **Convex** | Backend database and serverless functions | All stored data (see Section 1) |

We do not currently use any third-party analytics, advertising, or tracking services.

---

## 6. Data Sharing

We share your data only in these cases:
- **Public chains**: If you publish a chain as public, its name, description, structure, your username, and associated ratings/comments are visible to all ProChain users.
- **Friend interactions**: Friends can see your username and chains you send to them.
- **Comments and ratings**: These are visible to all users on the associated chain's page.
- **Legal requirements**: We may disclose data if required by law.

---

## 7. Data Retention and Deletion

- Your data is retained as long as your account is active.
- You can delete your account and all associated data by contacting us (see Section 10).
- Upon account deletion, we will remove: your profile, saved chains, comments, ratings, friend connections, and synced plugin data.
- Some data may be retained in backups for up to 30 days after deletion.

---

## 8. Children's Privacy

ProChain is not directed at children under 13. We do not knowingly collect information from children under 13. If you believe a child has provided us with personal information, please contact us and we will delete it.

---

## 9. Changes to This Policy

We may update this privacy policy from time to time. Changes will be posted in this document with an updated "Last updated" date. Continued use of ProChain after changes constitutes acceptance of the updated policy.

---

## 10. Contact

For privacy-related questions, data deletion requests, or concerns:

- **Email**: [privacy@pluginradar.com](mailto:privacy@pluginradar.com)
- **Website**: [pluginradar.com](https://pluginradar.com)

---

*This privacy policy applies to the ProChain desktop plugin and the Plugin Radar website (pluginradar.com).*
