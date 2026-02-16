import Link from "next/link";

const productLinks = [
  { href: "/chains", label: "Chains" },
  { href: "/plugins", label: "Plugins" },
  { href: "/download", label: "Download" },
  { href: "/free", label: "Free Plugins" },
];

const companyLinks = [
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

const connectLinks = [
  { href: "https://github.com/pluginradar", label: "GitHub", external: true },
  { href: "https://discord.gg/pluginradar", label: "Discord", external: true },
];

export function Footer() {
  return (
    <footer className="relative mt-24">
      <div className="section-line" />

      <div className="container mx-auto px-4 lg:px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <img
              src="/prochain-logo.png"
              alt="ProChain"
              className="h-7 w-auto object-contain opacity-60 mb-3"
            />
            <p className="text-stone-500 text-xs leading-relaxed max-w-[200px]">
              Chain any plugin. Share with anyone. The only chain platform that works with every plugin.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
              Product
            </h4>
            <ul className="space-y-2">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-stone-500 hover:text-stone-300 text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
              Company
            </h4>
            <ul className="space-y-2">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-stone-500 hover:text-stone-300 text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h4 className="text-stone-300 text-xs font-semibold uppercase tracking-wider mb-3">
              Connect
            </h4>
            <ul className="space-y-2">
              {connectLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-stone-500 hover:text-stone-300 text-sm transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/[0.06] pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-stone-600 text-[11px]">
            &copy; {new Date().getFullYear()} ProChain. All rights reserved.
          </p>
          <p className="text-stone-600 text-[11px]">
            A{" "}
            <Link href="/" className="hover:text-stone-400 transition-colors">
              Plugin Radar
            </Link>{" "}
            product
          </p>
        </div>
      </div>
    </footer>
  );
}
