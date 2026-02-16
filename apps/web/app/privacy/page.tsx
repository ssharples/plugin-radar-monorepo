import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | ProChain by Plugin Radar",
  description:
    "How ProChain collects, uses, and protects your personal information.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold text-neutral-100 mb-2">
        Privacy Policy
      </h1>
      <p className="text-neutral-500 text-sm mb-10">Last updated: February 2026</p>

      <div className="space-y-8 text-neutral-300 text-sm leading-relaxed">
        <p>
          This privacy policy describes how ProChain (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;, &ldquo;our&rdquo;) collects, uses, and protects
          your personal information when you use the ProChain desktop plugin and
          the Plugin Radar website.
        </p>

        {/* 1 */}
        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            1. Information We Collect
          </h2>

          <h3 className="font-medium text-neutral-200 mt-4 mb-2">
            Account Information
          </h3>
          <ul className="list-disc list-inside space-y-1 text-neutral-400">
            <li>
              <strong>Email address</strong> &mdash; used for authentication and
              account recovery
            </li>
            <li>
              <strong>Username</strong> &mdash; displayed publicly on shared
              chains, comments, and your profile
            </li>
            <li>
              <strong>Password</strong> &mdash; stored as a PBKDF2 hash; we
              never store or have access to your plaintext password
            </li>
          </ul>

          <h3 className="font-medium text-neutral-200 mt-4 mb-2">
            Profile Information (Optional)
          </h3>
          <ul className="list-disc list-inside space-y-1 text-neutral-400">
            <li>
              Contact information (phone number, Instagram handle) &mdash; used
              only for friend lookup
            </li>
            <li>Display name</li>
          </ul>

          <h3 className="font-medium text-neutral-200 mt-4 mb-2">
            Plugin Data
          </h3>
          <p className="text-neutral-400">
            When you use the plugin scanner, we collect a list of installed
            audio plugins (names, manufacturers, formats) to enable plugin
            compatibility checking and cloud chain features. This data is synced
            to the cloud only if you are logged in and have completed the
            onboarding scan.
          </p>

          <h3 className="font-medium text-neutral-200 mt-4 mb-2">
            Chain Data
          </h3>
          <p className="text-neutral-400">
            When you save chains to the cloud, we store chain name, description,
            structure (plugin order, group configuration), plugin preset data,
            and associated metadata.
          </p>

          <h3 className="font-medium text-neutral-200 mt-4 mb-2">
            Social Activity
          </h3>
          <ul className="list-disc list-inside space-y-1 text-neutral-400">
            <li>Star ratings, comments, follow/unfollow actions</li>
            <li>Friend requests and friendships</li>
            <li>Chain forks</li>
          </ul>

          <h3 className="font-medium text-neutral-200 mt-4 mb-2">
            Usage Data
          </h3>
          <p className="text-neutral-400">
            We currently do <strong>not</strong> collect analytics, telemetry, or
            usage tracking data. This may change in future versions, and this
            policy will be updated accordingly.
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            2. How We Use Your Information
          </h2>
          <ul className="list-disc list-inside space-y-1 text-neutral-400">
            <li>Authenticate you and maintain your session</li>
            <li>
              Display your username on shared chains, comments, and profiles
            </li>
            <li>
              Enable plugin compatibility checking (matching your plugins
              against community chains)
            </li>
            <li>Deliver chains shared with you by friends</li>
            <li>
              Display ratings, comments, and social interactions on community
              chains
            </li>
            <li>
              Enable friend lookup by username, email, phone, or Instagram
              handle
            </li>
          </ul>
          <p className="mt-3 text-neutral-400">
            We do <strong>not</strong> sell your data to third parties.
          </p>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            3. Data Storage
          </h2>
          <p className="text-neutral-400">
            All user data is stored in a Convex cloud database (convex.dev).
            Convex provides encrypted data at rest and in transit, hosted in the
            United States, with automatic backups. For more information, see{" "}
            <a
              href="https://convex.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#deff0a] hover:underline"
            >
              convex.dev
            </a>
            .
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            4. Session Management
          </h2>
          <ul className="list-disc list-inside space-y-1 text-neutral-400">
            <li>
              Session tokens are stored in your browser&apos;s localStorage and
              expire after 7 days
            </li>
            <li>
              Tokens are opaque (not JWTs) and cannot be decoded by third
              parties
            </li>
            <li>
              You can log out at any time, which invalidates your session token
            </li>
          </ul>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            5. Third-Party Services
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-neutral-400 mt-2">
              <thead>
                <tr className="border-b border-white/[0.06] text-neutral-300">
                  <th className="text-left py-2 pr-4">Service</th>
                  <th className="text-left py-2 pr-4">Purpose</th>
                  <th className="text-left py-2">Data Shared</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/[0.04]">
                  <td className="py-2 pr-4 font-medium text-neutral-300">
                    Convex
                  </td>
                  <td className="py-2 pr-4">
                    Backend database and serverless functions
                  </td>
                  <td className="py-2">All stored data (see Section 1)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-neutral-400">
            We do not currently use any third-party analytics, advertising, or
            tracking services.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            6. Data Sharing
          </h2>
          <ul className="list-disc list-inside space-y-1 text-neutral-400">
            <li>
              <strong>Public chains:</strong> visible to all ProChain users
              including name, description, structure, your username, and
              associated ratings/comments
            </li>
            <li>
              <strong>Friend interactions:</strong> friends can see your username
              and chains you send to them
            </li>
            <li>
              <strong>Comments and ratings:</strong> visible to all users on the
              associated chain&apos;s page
            </li>
            <li>
              <strong>Legal requirements:</strong> we may disclose data if
              required by law
            </li>
          </ul>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            7. Data Retention and Deletion
          </h2>
          <p className="text-neutral-400">
            Your data is retained as long as your account is active. You can
            request deletion by contacting us (see Section 10). Upon deletion we
            will remove your profile, saved chains, comments, ratings, friend
            connections, and synced plugin data. Backups may be retained for up
            to 30 days.
          </p>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            8. Children&apos;s Privacy
          </h2>
          <p className="text-neutral-400">
            ProChain is not directed at children under 13. We do not knowingly
            collect information from children under 13. If you believe a child
            has provided us with personal information, please contact us and we
            will delete it.
          </p>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            9. Changes to This Policy
          </h2>
          <p className="text-neutral-400">
            We may update this privacy policy from time to time. Changes will be
            posted on this page with an updated date. Continued use of ProChain
            after changes constitutes acceptance of the updated policy.
          </p>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            10. Contact
          </h2>
          <p className="text-neutral-400">
            For privacy-related questions, data deletion requests, or concerns:{" "}
            <a
              href="mailto:privacy@pluginradar.com"
              className="text-[#deff0a] hover:underline"
            >
              privacy@pluginradar.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
