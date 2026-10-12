import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getArticleBySlug, getArticleSlugs } from "@/lib/articles";
import { BreadcrumbSchema } from "@/components/SchemaMarkup";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getArticleSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return {};

  return {
    title: `${article.title} | ProChain Learn`,
    description: article.description,
    openGraph: {
      title: article.title,
      description: article.description,
      type: "article",
      url: `https://pluginradar.com/learn/${article.slug}`,
      publishedTime: article.date,
      authors: [article.author],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
    },
  };
}

export default async function LearnArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  const blogPostingSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.description,
    datePublished: article.date,
    author: {
      "@type": "Person",
      name: article.author,
    },
    publisher: {
      "@type": "Organization",
      name: "ProChain by Plugin Radar",
      url: "https://pluginradar.com",
    },
    url: `https://pluginradar.com/learn/${article.slug}`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://pluginradar.com/learn/${article.slug}`,
    },
  };

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "/" },
          { name: "Learn", url: "/learn" },
          { name: article.title, url: `/learn/${article.slug}` },
        ]}
      />
      <Script
        id={`schema-blogposting-${article.slug}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPostingSchema) }}
      />

      <article className="container mx-auto px-4 py-12 lg:py-16">
        {/* Breadcrumb nav */}
        <nav className="flex items-center gap-2 text-sm text-stone-500 mb-8">
          <Link href="/" className="hover:text-white transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link href="/learn" className="hover:text-white transition-colors">
            Learn
          </Link>
          <span>/</span>
          <span className="text-stone-300 truncate">{article.title}</span>
        </nav>

        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <header className="mb-10">
            <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-[#deff0a]/15 text-[#deff0a] mb-4">
              {article.category}
            </span>
            <h1 className="text-3xl lg:text-4xl font-bold text-white mb-4">
              {article.title}
            </h1>
            <div className="flex items-center gap-3 text-sm text-stone-500">
              <time dateTime={article.date}>
                {new Date(article.date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
              <span className="text-stone-700">|</span>
              <span>{article.author}</span>
            </div>
          </header>

          {/* Article body */}
          <div className="prose prose-invert prose-stone max-w-none prose-headings:text-white prose-headings:font-bold prose-a:text-[#deff0a] prose-a:no-underline hover:prose-a:underline prose-strong:text-white prose-code:text-[#deff0a] prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10 prose-li:text-stone-300 prose-p:text-stone-300 prose-ol:text-stone-300 prose-ul:text-stone-300">
            <MDXRemote source={article.content} />
          </div>

          {/* Back link */}
          <div className="mt-12 pt-8 border-t border-white/10">
            <Link
              href="/learn"
              className="text-sm text-stone-400 hover:text-[#deff0a] transition-colors"
            >
              &larr; Back to all articles
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
