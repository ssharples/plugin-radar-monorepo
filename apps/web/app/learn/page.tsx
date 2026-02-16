import Link from "next/link";
import { getAllArticles } from "@/lib/articles";

const CATEGORY_COLORS: Record<string, string> = {
  Guides: "bg-[#deff0a]/15 text-[#deff0a]",
  "Genre Chains": "bg-purple-500/15 text-purple-400",
  Comparisons: "bg-blue-500/15 text-blue-400",
  Techniques: "bg-orange-500/15 text-orange-400",
};

export default function LearnPage() {
  const articles = getAllArticles();

  return (
    <div className="container mx-auto px-4 py-12 lg:py-16">
      {/* Header */}
      <div className="max-w-3xl mb-12">
        <h1 className="text-3xl lg:text-4xl font-bold text-white mb-3">
          Learn
        </h1>
        <p className="text-stone-400 text-lg">
          Guides, techniques, and genre-specific plugin chains for mixing and
          mastering.
        </p>
      </div>

      {/* Article grid */}
      {articles.length === 0 ? (
        <p className="text-stone-500">No articles yet. Check back soon.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <Link
              key={article.slug}
              href={`/learn/${article.slug}`}
              className="group glass-card rounded-xl p-6 transition-all hover:border-white/20"
            >
              {/* Category badge */}
              <span
                className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full mb-4 ${
                  CATEGORY_COLORS[article.category] ??
                  "bg-white/10 text-stone-300"
                }`}
              >
                {article.category}
              </span>

              <h2 className="text-lg font-semibold text-white mb-2 group-hover:text-[#deff0a] transition-colors line-clamp-2">
                {article.title}
              </h2>

              <p className="text-stone-400 text-sm line-clamp-3 mb-4">
                {article.description}
              </p>

              <div className="flex items-center gap-3 text-xs text-stone-500">
                <time dateTime={article.date}>
                  {new Date(article.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </time>
                <span className="text-stone-700">|</span>
                <span>{article.author}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
