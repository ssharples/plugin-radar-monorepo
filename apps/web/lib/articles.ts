import fs from "fs";
import path from "path";
import matter from "gray-matter";

const CONTENT_DIR = path.join(process.cwd(), "content", "learn");

export interface ArticleMeta {
  title: string;
  description: string;
  date: string;
  category: string;
  slug: string;
  author: string;
}

export interface Article extends ArticleMeta {
  content: string;
}

export function getAllArticles(): ArticleMeta[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".mdx"));

  const articles = files.map((filename) => {
    const filePath = path.join(CONTENT_DIR, filename);
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data } = matter(raw);

    return {
      title: data.title ?? "",
      description: data.description ?? "",
      date: data.date ?? "",
      category: data.category ?? "",
      slug: data.slug ?? filename.replace(/\.mdx$/, ""),
      author: data.author ?? "",
    } satisfies ArticleMeta;
  });

  // Sort newest first
  return articles.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function getArticleBySlug(slug: string): Article | null {
  if (!fs.existsSync(CONTENT_DIR)) return null;

  const filePath = path.join(CONTENT_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  return {
    title: data.title ?? "",
    description: data.description ?? "",
    date: data.date ?? "",
    category: data.category ?? "",
    slug: data.slug ?? slug,
    author: data.author ?? "",
    content,
  };
}

export function getArticleSlugs(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}
