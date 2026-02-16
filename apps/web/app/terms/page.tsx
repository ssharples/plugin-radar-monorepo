import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | ProChain by Plugin Radar",
  description: "Terms of service for ProChain and Plugin Radar.",
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold text-neutral-100 mb-2">
        Terms of Service
      </h1>
      <p className="text-neutral-500 text-sm mb-10">Last updated: February 2026</p>

      <div className="space-y-8 text-neutral-300 text-sm leading-relaxed">
        <p>
          By using ProChain (the &ldquo;Software&rdquo;) and the Plugin Radar
          website (the &ldquo;Service&rdquo;), you agree to the following terms.
        </p>

        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            1. License
          </h2>
          <p className="text-neutral-400">
            ProChain is licensed, not sold. A valid purchase grants you a
            personal, non-exclusive, non-transferable license to use the
            Software on any number of computers you own for music production
            purposes. You may not redistribute, reverse-engineer, or sublicense
            the Software.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            2. Account
          </h2>
          <p className="text-neutral-400">
            You are responsible for maintaining the security of your account
            credentials. You must not share your session token or allow
            unauthorized access to your account. We reserve the right to
            suspend accounts that violate these terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            3. Acceptable Use
          </h2>
          <ul className="list-disc list-inside space-y-1 text-neutral-400">
            <li>
              Do not use the Service to distribute malicious software, spam, or
              content that infringes on third-party rights
            </li>
            <li>
              Do not attempt to reverse-engineer, scrape, or exploit the Service
              or its APIs
            </li>
            <li>
              Respect other users &mdash; abusive comments, harassment, or
              fraudulent ratings may result in account suspension
            </li>
            <li>
              Shared chains must only contain plugin preset data you have the
              right to distribute
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            4. User Content
          </h2>
          <p className="text-neutral-400">
            You retain ownership of chains, comments, and other content you
            create. By sharing content publicly, you grant ProChain a
            non-exclusive license to display and distribute that content within
            the Service. You can delete your public content at any time.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            5. Third-Party Plugins
          </h2>
          <p className="text-neutral-400">
            ProChain hosts third-party audio plugins within its signal chain.
            We are not responsible for the behavior, stability, or licensing of
            third-party plugins. You are responsible for ensuring you hold valid
            licenses for any plugins you load.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            6. Disclaimers
          </h2>
          <p className="text-neutral-400">
            The Software and Service are provided &ldquo;as is&rdquo; without
            warranty of any kind. We do not guarantee uninterrupted or
            error-free operation. Audio processing involves real-time
            constraints &mdash; we are not liable for audio glitches, latency
            issues, or plugin compatibility problems.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            7. Limitation of Liability
          </h2>
          <p className="text-neutral-400">
            To the maximum extent permitted by law, ProChain and Plugin Radar
            shall not be liable for any indirect, incidental, special, or
            consequential damages arising from your use of the Software or
            Service. Our total liability shall not exceed the amount you paid
            for the Software.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            8. Changes
          </h2>
          <p className="text-neutral-400">
            We may update these terms at any time. Continued use of the Service
            after changes constitutes acceptance. Material changes will be
            communicated via the website.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-neutral-100 mb-3">
            9. Contact
          </h2>
          <p className="text-neutral-400">
            Questions about these terms?{" "}
            <a
              href="mailto:hello@pluginradar.com"
              className="text-[#deff0a] hover:underline"
            >
              hello@pluginradar.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
