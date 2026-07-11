export interface DiscoveredURL {
  url: string;
  type: string; // Article, Page, Category, Tag, Product, Image, PDF, Video, Other
  source: string; // Sitemap, Feed, Crawler, API
  status: string; // "Found", "200 OK", etc.
}

export interface ScanStats {
  total: number;
  article: number;
  page: number;
  category: number;
  tag: number;
  product: number;
  file: number;
  image: number;
  pdf: number;
  video: number;
}

export interface ScanSummary {
  website: string;
  cms: string;
  urlCount: number;
  duration: string;
  sitemapsFound: number;
  robotsTxtExists: boolean;
  scanDate: string;
}

export type ActivePage = "home" | "faq" | "about" | "contact" | "privacy" | "terms";
