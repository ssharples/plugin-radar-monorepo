// Web links used by the desktop UI. The website shares the catalogue with
// the plugin, so these pages show prices and store links.
export const WEB_BASE_URL = 'https://pluginradar.com';

/** Catalogue page for a plugin we know the slug of. */
export function pluginPageUrl(slug: string): string {
  return `${WEB_BASE_URL}/plugins/${encodeURIComponent(slug)}`;
}

/** Catalogue search for a plugin we only know by name. */
export function pluginSearchUrl(name: string): string {
  return `${WEB_BASE_URL}/plugins?q=${encodeURIComponent(name)}`;
}
