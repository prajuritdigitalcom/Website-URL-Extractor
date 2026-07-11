import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import http from "http";
import https from "https";

dotenv.config();

// Bypass SSL issues since some Indonesian sites might have misconfigured/expired certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

interface ResilientResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  url: string;
  headers: {
    forEach: (cb: (val: string, key: string) => void) => void;
    get: (key: string) => string | null;
  };
}

async function resilientFetch(urlStr: string, options: any = {}, redirectCount = 0): Promise<ResilientResponse> {
  if (redirectCount > 5) {
    throw new Error("Terlalu banyak pengalihan (redirect loop)");
  }

  const userAgent = options.headers?.["User-Agent"] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const accept = options.headers?.["Accept"] || "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8";

  try {
    const res = await fetch(urlStr, {
      ...options,
      headers: {
        "User-Agent": userAgent,
        "Accept": accept,
        ...(options.headers || {})
      }
    });
    const textData = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url: res.url || urlStr,
      text: async () => textData,
      headers: {
        forEach: (cb) => {
          res.headers.forEach(cb);
        },
        get: (key) => res.headers.get(key)
      }
    };
  } catch (err: any) {
    console.error(`[VERCEL_SCAN_ERROR_TRACK] Native fetch failed for ${urlStr}: ${err.message}`);
    
    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(urlStr);
        const isHttps = parsedUrl.protocol === "https:";
        const reqModule = isHttps ? https : http;
        
        const reqHeaders: Record<string, string> = {
          "User-Agent": userAgent,
          "Accept": accept,
        };
        
        if (options.headers) {
          Object.keys(options.headers).forEach(k => {
            reqHeaders[k] = options.headers[k];
          });
        }

        const requestOptions: any = {
          method: options.method || "GET",
          headers: reqHeaders,
          timeout: 8000,
        };

        if (isHttps) {
          requestOptions.rejectUnauthorized = false; // Bypass SSL certificate verification
        }

        const req = reqModule.request(urlStr, requestOptions, (res) => {
          const statusCode = res.statusCode || 200;
          if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, urlStr).href;
            console.log(`[VERCEL_SCAN_ERROR_TRACK] Fallback following redirect to: ${redirectUrl}`);
            resilientFetch(redirectUrl, options, redirectCount + 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          const chunks: any[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const buffer = Buffer.concat(chunks);
            const textData = buffer.toString("utf-8");
            
            const headersMap = new Map<string, string>();
            Object.keys(res.headers).forEach(k => {
              const val = res.headers[k];
              if (val) {
                headersMap.set(k.toLowerCase(), Array.isArray(val) ? val.join(", ") : val);
              }
            });

            resolve({
              ok: statusCode >= 200 && statusCode < 300,
              status: statusCode,
              url: urlStr,
              text: async () => textData,
              headers: {
                forEach: (cb) => {
                  headersMap.forEach((val, key) => cb(val, key));
                },
                get: (key) => headersMap.get(key.toLowerCase()) || null
              }
            });
          });
        });

        req.on("error", (reqErr) => {
          console.error(`[VERCEL_SCAN_ERROR_TRACK] Fallback request error for ${urlStr}: ${reqErr.message || reqErr}`);
          reject(new Error(`Koneksi gagal ke ${urlStr}: ${reqErr.message}`));
        });

        req.on("timeout", () => {
          console.error(`[VERCEL_SCAN_ERROR_TRACK] Fallback request timeout after 8s for ${urlStr}`);
          req.destroy();
          reject(new Error(`Timeout koneksi setelah 8 detik saat mengakses ${urlStr}`));
        });

        if (options.body) {
          req.write(options.body);
        }
        req.end();
      } catch (innerErr: any) {
        console.error(`[VERCEL_SCAN_ERROR_TRACK] Fallback internal exception for ${urlStr}: ${innerErr.message || innerErr}`);
        reject(innerErr);
      }
    });
  }
}

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini SDK lazily to avoid crashing on startup if the key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY is not defined. AI classification will use fallback heuristics.");
      return null;
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Interfaces
interface DiscoveredURL {
  url: string;
  type: string; // Article, Page, Category, Tag, Product, Image, PDF, Video, Other
  source: string; // Sitemap, Feed, Crawler, API
  status: string; // "Found", "200 OK", etc.
}

interface ScanStats {
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

// Heuristics for classifying URL types
function classifyUrlHeuristically(urlStr: string, cms: string): string {
  try {
    const url = new URL(urlStr);
    const pathname = url.pathname.toLowerCase();

    // Static assets & files
    if (pathname.match(/\.(jpg|jpeg|png|webp|gif|svg|bmp|ico)$/)) return "Image";
    if (pathname.match(/\.pdf$/)) return "PDF";
    if (pathname.match(/\.(mp4|webm|avi|mkv|mov|flv|mpg|mpeg)$/)) return "Video";
    if (pathname.match(/\.(zip|rar|gz|tar|7z|xml|json|txt|docx|xlsx|pptx)$/)) return "Other";

    // WordPress rules
    if (cms === "WordPress") {
      if (pathname.includes("/category/") || pathname.includes("/seksi/") || pathname.includes("/kolom/")) return "Category";
      if (pathname.includes("/tag/") || pathname.includes("/label/") || pathname.includes("/topik/")) return "Tag";
      if (pathname.includes("/author/")) return "Page";
      if (pathname.includes("/product/") || pathname.includes("/shop/") || pathname.includes("/barang/")) return "Product";
    }

    // Blogger / Blogspot rules
    if (cms === "Blogger") {
      if (pathname.includes("/search/label/")) return "Tag";
      if (pathname.startsWith("/p/")) return "Page";
      // Blogger posts usually have /YYYY/MM/title.html format
      if (/\/\d{4}\/\d{2}\/[^/]+\.html$/.test(pathname)) return "Article";
    }

    // Shopify rules
    if (cms === "Shopify") {
      if (pathname.includes("/products/")) return "Product";
      if (pathname.includes("/collections/")) return "Category";
      if (pathname.includes("/pages/")) return "Page";
      if (pathname.includes("/blogs/")) return "Article";
    }

    // Squarespace & others
    if (pathname.includes("/blog/") || pathname.includes("/artikel/") || pathname.includes("/news/") || pathname.includes("/berita/")) {
      return "Article";
    }
    if (pathname.includes("/product/") || pathname.includes("/produk/") || pathname.includes("/item/") || pathname.includes("/shop/")) {
      return "Product";
    }
    if (pathname.includes("/category/") || pathname.includes("/kategori/")) {
      return "Category";
    }
    if (pathname.includes("/tag/") || pathname.includes("/tags/") || pathname.includes("/label/")) {
      return "Tag";
    }

    // Default heuristics based on depth and extension
    if (pathname === "" || pathname === "/") return "Page";
    
    // If it has multiple levels of directories but ends in html or no extension, it could be an Article or Page.
    // Let's assume standard pages for shallow paths, articles for deeper paths with dates or typical news titles
    if (/\/\d{4}\//.test(pathname) || pathname.split("/").length > 3) {
      return "Article";
    }

    return "Page";
  } catch (e) {
    return "Other";
  }
}

// Clean and validate target URL
function cleanUrl(input: string): string {
  let cleaned = input.trim();
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = "https://" + cleaned;
  }
  // Remove trailing slashes and normalize
  try {
    const url = new URL(cleaned);
    return url.origin + url.pathname.replace(/\/+$/, "") + url.search;
  } catch (e) {
    throw new Error("Format URL tidak valid");
  }
}

// API: Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Non-streaming JSON Scan Endpoint for Vercel/Serverless fallbacks
app.get("/api/scan", async (req, res) => {
  const rawUrl = req.query.url as string;
  if (!rawUrl) {
    return res.status(400).json({ error: "URL wajib diisi" });
  }

  let targetUrl = "";
  try {
    targetUrl = cleanUrl(rawUrl);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || "Format URL tidak valid" });
  }

  const targetOrigin = new URL(targetUrl).origin;
  const targetHost = new URL(targetUrl).hostname;

  console.log(`[VERCEL_SCAN_ERROR_TRACK] Starting non-streaming /api/scan for: ${targetUrl}`);

  try {
    const startTime = Date.now();
    
    // 1. Fetch homepage to validate and detect CMS
    let homeHtml = "";
    let homeHeaders: Record<string, string> = {};
    let resolvedUrl = targetUrl;

    const homeRes = await resilientFetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      }
    });

    resolvedUrl = homeRes.url;
    homeHtml = await homeRes.text();
    homeRes.headers.forEach((val, key) => {
      homeHeaders[key.toLowerCase()] = val;
    });

    if (!homeRes.ok) {
      console.error(`[VERCEL_SCAN_ERROR_TRACK] Non-streaming scan primary failed. Status: ${homeRes.status}`);
    }

    // CMS Detection
    let cms = "Custom CMS";
    const lowercaseHtml = homeHtml.toLowerCase();
    
    if (lowercaseHtml.includes("wp-content") || lowercaseHtml.includes("wp-includes") || homeHeaders["x-powered-by"]?.toLowerCase().includes("wp")) {
      cms = "WordPress";
    } else if (lowercaseHtml.includes("blogger.com") || lowercaseHtml.includes("blogspot.com") || lowercaseHtml.includes("blogger-button")) {
      cms = "Blogger";
    } else if (lowercaseHtml.includes("cdn.shopify.com") || lowercaseHtml.includes("shopify-payment-button")) {
      cms = "Shopify";
    } else if (lowercaseHtml.includes("joomla")) {
      cms = "Joomla";
    } else if (lowercaseHtml.includes("wix.com") || lowercaseHtml.includes("wix-code")) {
      cms = "Wix";
    } else if (lowercaseHtml.includes("ghost-sdk") || lowercaseHtml.includes("ghost-portal")) {
      cms = "Ghost";
    } else if (lowercaseHtml.includes("data-wf-site") || lowercaseHtml.includes('content="webflow')) {
      cms = "Webflow";
    } else if (lowercaseHtml.includes("csrf-token") && (lowercaseHtml.includes("laravel") || homeHeaders["set-cookie"]?.toLowerCase().includes("laravel_session"))) {
      cms = "Laravel";
    }

    const discoveredUrlsMap = new Map<string, DiscoveredURL>();

    // Helper to add URLs safely
    const addDiscoveredUrl = (urlStr: string, source: string) => {
      try {
        const parsed = new URL(urlStr);
        const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
        trackingParams.forEach(p => parsed.searchParams.delete(p));
        parsed.hash = "";
        
        const cleanStr = parsed.href.replace(/\/+$/, "");
        
        if (parsed.hostname === targetHost || parsed.hostname.endsWith("." + targetHost) || targetHost.endsWith("." + parsed.hostname)) {
          if (!discoveredUrlsMap.has(cleanStr)) {
            const type = classifyUrlHeuristically(cleanStr, cms);
            discoveredUrlsMap.set(cleanStr, {
              url: cleanStr,
              type,
              source,
              status: "Found"
            });
          }
        }
      } catch (e) {
        // Invalid URL
      }
    };

    addDiscoveredUrl(resolvedUrl, "Crawler");

    // robots.txt
    const robotsUrl = `${targetOrigin}/robots.txt`;
    let robotsTxt = "";
    let sitemapsFromRobots: string[] = [];

    try {
      const robotsRes = await resilientFetch(robotsUrl, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (robotsRes.ok) {
        robotsTxt = await robotsRes.text();
        const lines = robotsTxt.split("\n");
        for (const line of lines) {
          if (line.toLowerCase().startsWith("sitemap:")) {
            const sUrl = line.substring(8).trim();
            if (sUrl) sitemapsFromRobots.push(sUrl);
          }
        }
      }
    } catch (e) {
      // Ignored
    }

    // Sitemaps
    const sitemapsToTry = new Set<string>(sitemapsFromRobots);
    sitemapsToTry.add(`${targetOrigin}/sitemap.xml`);
    sitemapsToTry.add(`${targetOrigin}/sitemap_index.xml`);

    if (cms === "WordPress") {
      sitemapsToTry.add(`${targetOrigin}/wp-sitemap.xml`);
      sitemapsToTry.add(`${targetOrigin}/post-sitemap.xml`);
      sitemapsToTry.add(`${targetOrigin}/page-sitemap.xml`);
    }

    const scannedSitemaps = new Set<string>();
    const sitemapQueue = Array.from(sitemapsToTry);
    let sitemapsFoundCount = 0;

    while (sitemapQueue.length > 0 && scannedSitemaps.size < 8) {
      const currentSitemapUrl = sitemapQueue.shift()!;
      if (scannedSitemaps.has(currentSitemapUrl)) continue;
      scannedSitemaps.add(currentSitemapUrl);

      try {
        const sitemapRes = await resilientFetch(currentSitemapUrl, {
          headers: { "User-Agent": "Mozilla/5.0" }
        });
        if (sitemapRes.ok) {
          sitemapsFoundCount++;
          const sitemapXml = await sitemapRes.text();
          const locRegex = /<loc>(https?:\/\/[^\s<]+)<\/loc>/gi;
          let match;
          while ((match = locRegex.exec(sitemapXml)) !== null) {
            const discoveredUrl = match[1];
            if (discoveredUrl.toLowerCase().includes(".xml") || discoveredUrl.toLowerCase().includes(".xml.gz")) {
              if (!scannedSitemaps.has(discoveredUrl)) {
                sitemapQueue.push(discoveredUrl);
              }
            } else {
              addDiscoveredUrl(discoveredUrl, "Sitemap");
            }
          }
        }
      } catch (e) {
        // Ignored
      }
    }

    // Blogger Atom feeds
    if (cms === "Blogger") {
      const bloggerFeeds = [
        `${targetOrigin}/feeds/posts/default?max-results=300`,
      ];
      for (const feedUrl of bloggerFeeds) {
        try {
          const feedRes = await resilientFetch(feedUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
          if (feedRes.ok) {
            const feedXml = await feedRes.text();
            const linkRegex = /<link[^>]+rel=['"]alternate['"][^>]+href=['"](https?:\/\/[^'"]+)['"]/gi;
            let match;
            while ((match = linkRegex.exec(feedXml)) !== null) {
              addDiscoveredUrl(match[1], "Feed");
            }
          }
        } catch (e) {
          // Ignored
        }
      }
    }

    // Crawler
    if (discoveredUrlsMap.size < 15) {
      const crawlQueue: { url: string; depth: number }[] = [{ url: resolvedUrl, depth: 0 }];
      const visitedCrawl = new Set<string>([resolvedUrl]);
      
      while (crawlQueue.length > 0 && visitedCrawl.size < 40 && discoveredUrlsMap.size < 100) {
        const currentItem = crawlQueue.shift()!;
        if (currentItem.depth > 1) continue;

        try {
          const pageRes = await resilientFetch(currentItem.url, {
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          if (pageRes.ok) {
            const pageHtml = await pageRes.text();
            const hrefRegex = /href=["']([^"']+)["']/gi;
            let match;
            while ((match = hrefRegex.exec(pageHtml)) !== null) {
              let href = match[1].trim();
              if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
                continue;
              }
              try {
                const resolvedHref = new URL(href, currentItem.url).href;
                if (new URL(resolvedHref).hostname === targetHost) {
                  addDiscoveredUrl(resolvedHref, "Crawler");
                  const cleanHref = resolvedHref.split("#")[0].replace(/\/+$/, "");
                  if (!visitedCrawl.has(cleanHref) && currentItem.depth < 1) {
                    visitedCrawl.add(cleanHref);
                    crawlQueue.push({ url: cleanHref, depth: currentItem.depth + 1 });
                  }
                }
              } catch (err) {}
            }
          }
        } catch (e) {}
      }
    }

    const discoveredList = Array.from(discoveredUrlsMap.values());
    const gemini = getGeminiClient();

    if (gemini && discoveredList.length > 0) {
      try {
        const sampleUrls = discoveredList.slice(0, 30).map(d => d.url);
        const prompt = `
Anda adalah Website URL Pattern Analyzer cerdas untuk SEO.
Tugas Anda adalah menganalisis daftar URL berikut dari domain "${targetHost}" dengan CMS "${cms}".
Klasifikasikan pola URL ini ke dalam tipe berikut:
"Article", "Page", "Category", "Tag", "Product", "Image", "PDF", "Video", "Other"

Daftar URL:
${sampleUrls.join("\n")}

Berikan output berupa JSON yang valid dengan struktur berikut:
{
  "patterns": [
    {
      "substring": "string untuk dicocokkan (misalnya /category/ atau /p/ atau .html)",
      "type": "Article | Page | Category | Tag | Product | Image | PDF | Video | Other",
      "explanation": "Penjelasan singkat dalam Bahasa Indonesia"
    }
  ]
}
Pastikan tidak ada markdown pembungkus di luar JSON.
`;
        const response = await gemini.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });
        const textResponse = response.text;
        if (textResponse) {
          const parsed = JSON.parse(textResponse.trim());
          if (parsed.patterns && Array.isArray(parsed.patterns)) {
            for (const dItem of discoveredList) {
              for (const rule of parsed.patterns) {
                if (dItem.url.toLowerCase().includes(rule.substring.toLowerCase())) {
                  dItem.type = rule.type;
                  break;
                }
              }
            }
          }
        }
      } catch (geminiErr) {
        console.warn("Gemini API failed in non-streaming scan:", geminiErr);
      }
    }

    // Build stats
    const stats: ScanStats = {
      total: discoveredList.length,
      article: 0,
      page: 0,
      category: 0,
      tag: 0,
      product: 0,
      file: 0,
      image: 0,
      pdf: 0,
      video: 0
    };

    discoveredList.forEach(item => {
      const typeLower = item.type.toLowerCase();
      if (typeLower === "article") stats.article++;
      else if (typeLower === "page") stats.page++;
      else if (typeLower === "category") stats.category++;
      else if (typeLower === "tag") stats.tag++;
      else if (typeLower === "product") stats.product++;
      else if (typeLower === "image") { stats.image++; stats.file++; }
      else if (typeLower === "pdf") { stats.pdf++; stats.file++; }
      else if (typeLower === "video") { stats.video++; stats.file++; }
      else stats.file++;
    });

    const scanDurationSec = ((Date.now() - startTime) / 1000).toFixed(1);

    return res.json({
      success: true,
      results: discoveredList,
      stats,
      summary: {
        website: targetUrl,
        cms,
        urlCount: discoveredList.length,
        duration: `${scanDurationSec}s`,
        sitemapsFound: sitemapsFoundCount,
        robotsTxtExists: robotsTxt.length > 0,
        scanDate: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB",
      }
    });

  } catch (error: any) {
    console.error("[VERCEL_SCAN_ERROR_TRACK] Non-streaming scanning endpoint Error:", error);
    return res.status(500).json({
      error: error.message || "Terjadi kesalahan internal saat pemindaian"
    });
  }
});

// SSE Streaming Scan Endpoint
app.get("/api/scan-stream", async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  const rawUrl = req.query.url as string;
  if (!rawUrl) {
    res.write(`data: ${JSON.stringify({ error: "URL wajib diisi" })}\n\n`);
    return res.end();
  }

  let targetUrl = "";
  try {
    targetUrl = cleanUrl(rawUrl);
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err.message || "Format URL tidak valid" })}\n\n`);
    return res.end();
  }

  const targetOrigin = new URL(targetUrl).origin;
  const targetHost = new URL(targetUrl).hostname;

  let isCancelled = false;
  req.on("close", () => {
    console.log(`Scan connection closed by client for URL: ${targetUrl}`);
    isCancelled = true;
  });

  const sendProgress = (status: string, progress: number, data?: any) => {
    if (isCancelled) return;
    res.write(`data: ${JSON.stringify({ status, progress, ...data })}\n\n`);
  };

  try {
    const startTime = Date.now();
    sendProgress("Validating URL...", 10, { step: "validation" });

    // 1. Fetch homepage to validate and detect CMS
    sendProgress("Detecting CMS...", 20, { step: "cms_detection" });
    
    let homeHtml = "";
    let homeHeaders: Record<string, string> = {};
    let resolvedUrl = targetUrl;

    try {
      console.log(`[VERCEL_SCAN_ERROR_TRACK] Starting primary scan for: ${targetUrl}`);
      const homeRes = await resilientFetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        }
      });

      resolvedUrl = homeRes.url;
      homeHtml = await homeRes.text();
      homeRes.headers.forEach((val, key) => {
        homeHeaders[key.toLowerCase()] = val;
      });

      console.log(`[VERCEL_SCAN_ERROR_TRACK] Primary scan completed. Status: ${homeRes.status}, OK: ${homeRes.ok}`);
      if (!homeRes.ok) {
        console.error(`[VERCEL_SCAN_ERROR_TRACK] WARNING: Target returned non-OK status ${homeRes.status}`);
        console.error(`[VERCEL_SCAN_ERROR_TRACK] Response Headers:`, JSON.stringify(homeHeaders));
        console.error(`[VERCEL_SCAN_ERROR_TRACK] HTML Body Preview (first 1000 chars):`, homeHtml.substring(0, 1000));
      }
    } catch (e: any) {
      console.error(`[VERCEL_SCAN_ERROR_TRACK] Primary scan exception for ${targetUrl}:`, e.message || e);
      // Retry with HTTP if HTTPS failed, or throw
      if (targetUrl.startsWith("https://")) {
        const httpUrl = targetUrl.replace("https://", "http://");
        console.log(`[VERCEL_SCAN_ERROR_TRACK] Attempting HTTP fallback retry to: ${httpUrl}`);
        try {
          const homeRes = await resilientFetch(httpUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }
          });
          resolvedUrl = homeRes.url;
          homeHtml = await homeRes.text();
          homeRes.headers.forEach((val, key) => {
            homeHeaders[key.toLowerCase()] = val;
          });

          console.log(`[VERCEL_SCAN_ERROR_TRACK] HTTP fallback completed. Status: ${homeRes.status}, OK: ${homeRes.ok}`);
          if (!homeRes.ok) {
            console.error(`[VERCEL_SCAN_ERROR_TRACK] WARNING: HTTP fallback returned non-OK status ${homeRes.status}`);
            console.error(`[VERCEL_SCAN_ERROR_TRACK] Response Headers:`, JSON.stringify(homeHeaders));
            console.error(`[VERCEL_SCAN_ERROR_TRACK] HTML Body Preview (first 1000 chars):`, homeHtml.substring(0, 1000));
          }
        } catch (retryErr: any) {
          console.error(`[VERCEL_SCAN_ERROR_TRACK] HTTP fallback also failed for ${httpUrl}:`, retryErr.message || retryErr);
          throw new Error(`Gagal mengakses website: ${retryErr.message || "Timeout / Koneksi ditolak"}`);
        }
      } else {
        throw new Error(`Gagal mengakses website: ${e.message || "Timeout / Koneksi ditolak"}`);
      }
    }

    if (isCancelled) return res.end();

    // CMS Detection Logic
    let cms = "Unknown";
    const lowercaseHtml = homeHtml.toLowerCase();
    
    if (lowercaseHtml.includes("wp-content") || lowercaseHtml.includes("wp-includes") || lowercaseHtml.includes("wp-json") || homeHeaders["x-powered-by"]?.includes("WP") || lowercaseHtml.includes("wp-embed")) {
      cms = "WordPress";
    } else if (lowercaseHtml.includes("blogspot.com") || lowercaseHtml.includes("blogger.com/static") || lowercaseHtml.includes('name="generator" content="blogger"') || lowercaseHtml.includes('name=\'generator\' content=\'blogger\'')) {
      cms = "Blogger";
    } else if (lowercaseHtml.includes("cdn.shopify.com") || lowercaseHtml.includes("shopify.js") || lowercaseHtml.includes("shopify.shop") || lowercaseHtml.includes("shopify-checkout")) {
      cms = "Shopify";
    } else if (lowercaseHtml.includes("/media/system/js/") || lowercaseHtml.includes('content="joomla!')) {
      cms = "Joomla";
    } else if (lowercaseHtml.includes("sites/all/modules") || lowercaseHtml.includes("sites/default") || lowercaseHtml.includes('content="drupal')) {
      cms = "Drupal";
    } else if (lowercaseHtml.includes("wixstatic.com") || lowercaseHtml.includes("_wix_") || lowercaseHtml.includes("wix-code") || lowercaseHtml.includes('content="wix.com')) {
      cms = "Wix";
    } else if (lowercaseHtml.includes("static1.squarespace.com") || lowercaseHtml.includes("squarespace.oninitialize")) {
      cms = "Squarespace";
    } else if (lowercaseHtml.includes("/public/ghost.js") || lowercaseHtml.includes('content="ghost')) {
      cms = "Ghost";
    } else if (lowercaseHtml.includes("data-wf-site") || lowercaseHtml.includes('content="webflow')) {
      cms = "Webflow";
    } else if (lowercaseHtml.includes("csrf-token") && (lowercaseHtml.includes("laravel") || homeHeaders["set-cookie"]?.toLowerCase().includes("laravel_session"))) {
      cms = "Laravel";
    } else if (lowercaseHtml.includes("custom-cms")) {
      cms = "Custom CMS";
    }

    sendProgress(`CMS Detected: ${cms}`, 30, { step: "cms_detected", cms });

    // Store found URLs in a set to avoid duplicates
    const discoveredUrlsMap = new Map<string, DiscoveredURL>();

    // Helper to add URLs safely
    const addDiscoveredUrl = (urlStr: string, source: string) => {
      try {
        const parsed = new URL(urlStr);
        // Normalize URL (strip tracking params, hashes)
        const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
        trackingParams.forEach(p => parsed.searchParams.delete(p));
        parsed.hash = "";
        
        const cleanStr = parsed.href.replace(/\/+$/, "");
        
        // Ensure same domain
        if (parsed.hostname === targetHost || parsed.hostname.endsWith("." + targetHost) || targetHost.endsWith("." + parsed.hostname)) {
          if (!discoveredUrlsMap.has(cleanStr)) {
            const type = classifyUrlHeuristically(cleanStr, cms);
            discoveredUrlsMap.set(cleanStr, {
              url: cleanStr,
              type,
              source,
              status: "Found"
            });
          }
        }
      } catch (e) {
        // Invalid URL
      }
    };

    // Always add home page
    addDiscoveredUrl(resolvedUrl, "Crawler");

    // 2. Priority 2: robots.txt
    sendProgress("Searching robots.txt...", 40, { step: "robots" });
    const robotsUrl = `${targetOrigin}/robots.txt`;
    let robotsTxt = "";
    let sitemapsFromRobots: string[] = [];

    try {
      const robotsRes = await resilientFetch(robotsUrl, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (robotsRes.ok) {
        robotsTxt = await robotsRes.text();
        const lines = robotsTxt.split("\n");
        for (const line of lines) {
          if (line.toLowerCase().startsWith("sitemap:")) {
            const sUrl = line.substring(8).trim();
            if (sUrl) sitemapsFromRobots.push(sUrl);
          }
        }
      }
    } catch (e) {
      console.log("No robots.txt found or accessible");
    }

    if (isCancelled) return res.end();

    // 3. Priority 3 & 4: Search standard sitemaps
    sendProgress("Searching sitemaps...", 50, { step: "sitemaps_search" });
    const sitemapsToTry = new Set<string>(sitemapsFromRobots);
    sitemapsToTry.add(`${targetOrigin}/sitemap.xml`);
    sitemapsToTry.add(`${targetOrigin}/sitemap_index.xml`);

    // 4. Priority 5: WordPress specific sitemaps if WordPress
    if (cms === "WordPress") {
      sitemapsToTry.add(`${targetOrigin}/wp-sitemap.xml`);
      sitemapsToTry.add(`${targetOrigin}/post-sitemap.xml`);
      sitemapsToTry.add(`${targetOrigin}/page-sitemap.xml`);
      sitemapsToTry.add(`${targetOrigin}/category-sitemap.xml`);
      sitemapsToTry.add(`${targetOrigin}/tag-sitemap.xml`);
      sitemapsToTry.add(`${targetOrigin}/author-sitemap.xml`);
      sitemapsToTry.add(`${targetOrigin}/news-sitemap.xml`);
      sitemapsToTry.add(`${targetOrigin}/product-sitemap.xml`);
    }

    // Process sitemaps recursively
    const scannedSitemaps = new Set<string>();
    const sitemapQueue = Array.from(sitemapsToTry);
    let sitemapsFoundCount = 0;

    while (sitemapQueue.length > 0 && scannedSitemaps.size < 15) {
      if (isCancelled) return res.end();
      const currentSitemapUrl = sitemapQueue.shift()!;
      if (scannedSitemaps.has(currentSitemapUrl)) continue;
      scannedSitemaps.add(currentSitemapUrl);

      sendProgress(`Reading Sitemap: ${path.basename(currentSitemapUrl)}`, 55, { step: "reading_sitemap" });

      try {
        const sitemapRes = await resilientFetch(currentSitemapUrl, {
          headers: { "User-Agent": "Mozilla/5.0" }
        });
        if (sitemapRes.ok) {
          sitemapsFoundCount++;
          const sitemapXml = await sitemapRes.text();
          
          // Extract URLs using <loc> tags regex
          const locRegex = /<loc>(https?:\/\/[^\s<]+)<\/loc>/gi;
          let match;
          while ((match = locRegex.exec(sitemapXml)) !== null) {
            const discoveredUrl = match[1];
            // If it's a sub-sitemap (ends in .xml or xml.gz)
            if (discoveredUrl.toLowerCase().includes(".xml") || discoveredUrl.toLowerCase().includes(".xml.gz")) {
              if (!scannedSitemaps.has(discoveredUrl)) {
                sitemapQueue.push(discoveredUrl);
              }
            } else {
              addDiscoveredUrl(discoveredUrl, "Sitemap");
            }
          }
        }
      } catch (e) {
        // Failed to fetch this specific sitemap, silent fallback
      }
    }

    if (isCancelled) return res.end();

    // 5. Priority 6: Blogger Atom feeds if Blogger
    if (cms === "Blogger") {
      sendProgress("Reading Blogger Feed...", 65, { step: "blogger_feed" });
      const bloggerFeeds = [
        `${targetOrigin}/feeds/posts/default?max-results=500`,
        `${targetOrigin}/feeds/pages/default?max-results=500`,
      ];
      for (const feedUrl of bloggerFeeds) {
        if (isCancelled) return res.end();
        try {
          const feedRes = await resilientFetch(feedUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
          if (feedRes.ok) {
            const feedXml = await feedRes.text();
            // Match alternate link hrefs
            const linkRegex = /<link[^>]+rel=['"]alternate['"][^>]+href=['"](https?:\/\/[^'"]+)['"]/gi;
            let match;
            while ((match = linkRegex.exec(feedXml)) !== null) {
              addDiscoveredUrl(match[1], "Feed");
            }
          }
        } catch (e) {
          console.log("Blogger feed reading failed for:", feedUrl);
        }
      }
    }

    if (isCancelled) return res.end();

    // 6. Priority 7: Lightweight Crawler (Crawl internal links from homepage, up to max depth 2)
    // Runs if sitemaps/feeds gave fewer than 15 links, or as a complement
    if (discoveredUrlsMap.size < 20) {
      sendProgress("Crawling Website Internal Links...", 75, { step: "crawler_internal" });
      const crawlQueue: { url: string; depth: number }[] = [{ url: resolvedUrl, depth: 0 }];
      const visitedCrawl = new Set<string>([resolvedUrl]);
      
      while (crawlQueue.length > 0 && visitedCrawl.size < 150 && discoveredUrlsMap.size < 250) {
        if (isCancelled) return res.end();
        const currentItem = crawlQueue.shift()!;
        
        if (currentItem.depth > 2) continue;

        try {
          const pageRes = await resilientFetch(currentItem.url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }
          });
          if (pageRes.ok) {
            const pageHtml = await pageRes.text();
            
            // Extract a href attributes
            const hrefRegex = /href=["']([^"']+)["']/gi;
            let match;
            while ((match = hrefRegex.exec(pageHtml)) !== null) {
              let href = match[1].trim();
              if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
                continue;
              }

              // Resolve relative URL
              try {
                const resolvedHref = new URL(href, currentItem.url).href;
                const parsedResolved = new URL(resolvedHref);
                
                // Keep only same domain
                if (parsedResolved.hostname === targetHost) {
                  // Add to discovered map
                  addDiscoveredUrl(resolvedHref, "Crawler");
                  
                  // Add to crawler queue if not visited and depth is small
                  const cleanHref = resolvedHref.split("#")[0].replace(/\/+$/, "");
                  if (!visitedCrawl.has(cleanHref) && currentItem.depth < 2) {
                    visitedCrawl.add(cleanHref);
                    crawlQueue.push({ url: cleanHref, depth: currentItem.depth + 1 });
                  }
                }
              } catch (err) {
                // Invalid URL
              }
            }
          }
        } catch (e) {
          // Crawling error on single page, continue
        }
      }
    }

    if (isCancelled) return res.end();

    // 7. AI Model Classification using Gemini API as an intelligent optimizer if the client has configured the secret key
    // We send a sample of discovered URLs to Gemini to check if it can improve classifications
    const discoveredList = Array.from(discoveredUrlsMap.values());
    const gemini = getGeminiClient();

    if (gemini && discoveredList.length > 0) {
      sendProgress("AI Analyzing Website Patterns...", 85, { step: "ai_analysis" });
      try {
        const sampleUrls = discoveredList.slice(0, 40).map(d => d.url);
        const prompt = `
Anda adalah Website URL Pattern Analyzer cerdas untuk SEO.
Tugas Anda adalah menganalisis daftar URL berikut dari domain "${targetHost}" dengan CMS "${cms}".
Klasifikasikan pola URL ini ke dalam tipe berikut:
"Article", "Page", "Category", "Tag", "Product", "Image", "PDF", "Video", "Other"

Daftar URL:
${sampleUrls.join("\n")}

Berikan output berupa JSON yang valid dengan struktur berikut:
{
  "patterns": [
    {
      "substring": "string untuk dicocokkan (misalnya /category/ atau /p/ atau .html)",
      "type": "Article | Page | Category | Tag | Product | Image | PDF | Video | Other",
      "explanation": "Penjelasan singkat dalam Bahasa Indonesia"
    }
  ]
}
Pastikan tidak ada markdown pembungkus di luar JSON.
`;

        const response = await gemini.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          }
        });

        const textResponse = response.text;
        if (textResponse) {
          const parsed = JSON.parse(textResponse.trim());
          if (parsed.patterns && Array.isArray(parsed.patterns)) {
            // Apply patterns to improve classifications
            for (const dItem of discoveredList) {
              for (const rule of parsed.patterns) {
                if (dItem.url.toLowerCase().includes(rule.substring.toLowerCase())) {
                  dItem.type = rule.type;
                  break;
                }
              }
            }
          }
        }
      } catch (geminiErr) {
        console.warn("Gemini API call failed, falling back to pure heuristics:", geminiErr);
      }
    }

    if (isCancelled) return res.end();

    sendProgress("Preparing Download...", 95, { step: "preparing" });

    // Build stats
    const stats: ScanStats = {
      total: discoveredList.length,
      article: 0,
      page: 0,
      category: 0,
      tag: 0,
      product: 0,
      file: 0,
      image: 0,
      pdf: 0,
      video: 0
    };

    discoveredList.forEach(item => {
      const typeLower = item.type.toLowerCase();
      if (typeLower === "article") stats.article++;
      else if (typeLower === "page") stats.page++;
      else if (typeLower === "category") stats.category++;
      else if (typeLower === "tag") stats.tag++;
      else if (typeLower === "product") stats.product++;
      else if (typeLower === "image") { stats.image++; stats.file++; }
      else if (typeLower === "pdf") { stats.pdf++; stats.file++; }
      else if (typeLower === "video") { stats.video++; stats.file++; }
      else stats.file++; // other kinds of files
    });

    const scanDurationSec = ((Date.now() - startTime) / 1000).toFixed(1);

    // Send final success data
    sendProgress("Finished", 100, {
      step: "finished",
      results: discoveredList,
      stats,
      summary: {
        website: targetUrl,
        cms,
        urlCount: discoveredList.length,
        duration: `${scanDurationSec}s`,
        sitemapsFound: sitemapsFoundCount,
        robotsTxtExists: robotsTxt.length > 0,
        scanDate: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB",
      }
    });

  } catch (error: any) {
    console.error("[VERCEL_SCAN_ERROR_TRACK] Scanning Error:", error);
    sendProgress("Error", 0, {
      step: "error",
      error: error.message || "Terjadi kesalahan internal saat pemindaian"
    });
  } finally {
    res.end();
  }
});

// Serve frontend assets using Vite middleware or static files
async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Website URL Extractor Indonesia running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  bootstrap();
}

export default app;
