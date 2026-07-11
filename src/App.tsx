import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import * as XLSX from "xlsx";
import { 
  Globe, 
  Search, 
  Download, 
  Copy, 
  RefreshCw, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  FileText, 
  List, 
  LayoutGrid,
  ChevronRight,
  ChevronLeft,
  Heart,
  Mail,
  MapPin,
  FileCode,
  ShieldAlert,
  ArrowRight,
  RotateCcw,
  FileSpreadsheet
} from "lucide-react";
import { DiscoveredURL, ScanStats, ScanSummary, ActivePage } from "./types";
import { faqData, aboutData, contactData } from "./data";

export default function App() {
  // Navigation State
  const [activePage, setActivePage] = useState<ActivePage>("home");

  // App States
  const [urlInput, setUrlInput] = useState("");
  const [inputMode, setInputMode] = useState<"auto" | "manual">("auto");
  const [pastedSitemapText, setPastedSitemapText] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [discoveredList, setDiscoveredList] = useState<DiscoveredURL[]>([]);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Real-time status logs appearing during scanning
  const [statusLogs, setStatusLogs] = useState<string[]>([]);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);

  // Filters and search states
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Toast States
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error" | "info">("success");

  // Reference to SSE EventSource for cancelling
  const eventSourceRef = useRef<EventSource | null>(null);

  // Auto-scroll the progress logs
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [statusLogs]);

  // Toast Helper
  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage(message);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Start the Scanner
  const handleStartScan = (urlToScan?: string) => {
    const finalUrl = urlToScan || urlInput;
    if (!finalUrl.trim()) {
      showToast("Harap masukkan URL website terlebih dahulu", "error");
      return;
    }

    // Reset previous states
    setIsScanning(true);
    setScanStatus("Menghubungkan ke server...");
    setProgress(5);
    setDiscoveredList([]);
    setStats(null);
    setSummary(null);
    setErrorMsg(null);
    setStatusLogs(["Memulai pemindaian untuk: " + finalUrl]);
    setCurrentPage(1);

    // Create EventSource
    const sseUrl = `/api/scan-stream?url=${encodeURIComponent(finalUrl)}`;
    const ev = new EventSource(sseUrl);
    eventSourceRef.current = ev;

    ev.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.error) {
          setErrorMsg(data.error);
          showToast(data.error, "error");
          setStatusLogs(prev => [...prev, `[ERROR] ${data.error}`]);
          handleCancelScan();
          return;
        }

        if (data.status) {
          setScanStatus(data.status);
          setStatusLogs(prev => [...prev, data.status]);
        }

        if (data.progress) {
          setProgress(data.progress);
        }

        // Live stream of intermediate files/URL results if available
        if (data.results) {
          setDiscoveredList(data.results);
        }

        // Finished scan
        if (data.status === "Finished") {
          setDiscoveredList(data.results || []);
          setStats(data.stats || null);
          setSummary(data.summary || null);
          setIsScanning(false);
          setProgress(100);
          showToast("Pemindaian selesai! Berhasil mengekstrak " + (data.results?.length || 0) + " URL.", "success");
          setStatusLogs(prev => [...prev, "Proses ekstraksi selesai sepenuhnya."]);
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
          }
        }
      } catch (err) {
        console.error("Gagal membaca pesan streaming:", err);
      }
    };

    ev.onerror = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      console.log("Koneksi streaming terputus atau gagal, beralih ke mode kompatibilitas...");
      runFallbackScan(finalUrl);
    };
  };

  // Resilient fallback scan via standard non-streaming API
  const runFallbackScan = async (urlToScan: string) => {
    setScanStatus("Menjalankan pemindaian alternatif...");
    setProgress(30);
    setStatusLogs(prev => [
      ...prev,
      "[INFO] Koneksi real-time dibatasi atau tidak didukung di lingkungan ini.",
      "[INFO] Mengaktifkan pemindaian dalam mode kompatibilitas penuh...",
      "Menganalisis sitemap dan struktur website..."
    ]);

    try {
      const response = await fetch(`/api/scan?url=${encodeURIComponent(urlToScan)}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setDiscoveredList(data.results || []);
        setStats(data.stats || null);
        setSummary(data.summary || null);
        setIsScanning(false);
        setProgress(100);
        showToast("Pemindaian selesai via mode kompatibilitas!", "success");
        setStatusLogs(prev => [
          ...prev,
          `Berhasil menganalisis platform: ${data.summary?.cms || "Kustom"}`,
          `Ditemukan total: ${data.results?.length || 0} URL`,
          "Proses ekstraksi selesai sepenuhnya."
        ]);
      } else {
        throw new Error(data.error || "Gagal melakukan ekstraksi");
      }
    } catch (err: any) {
      console.error("Fallback scan failed:", err);
      setErrorMsg(err.message || "Gagal melakukan pemindaian. Pastikan website target aktif dan dapat diakses.");
      showToast("Pemindaian gagal pada mode kompatibilitas.", "error");
      setStatusLogs(prev => [
        ...prev,
        `[ERROR] Pemindaian gagal: ${err.message || "Koneksi ditolak"}`
      ]);
      setIsScanning(false);
      setProgress(0);
      setScanStatus("");
    }
  };

  // Cancel current scan
  const handleCancelScan = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsScanning(false);
    setProgress(0);
    setScanStatus("");
    setStatusLogs(prev => [...prev, "Pemindaian dibatalkan oleh pengguna."]);
    showToast("Pemindaian berhasil dibatalkan", "info");
  };

  // Reset all states and clear data
  const handleReset = () => {
    setUrlInput("");
    setPastedSitemapText("");
    setIsScanning(false);
    setScanStatus("");
    setProgress(0);
    setDiscoveredList([]);
    setStats(null);
    setSummary(null);
    setErrorMsg(null);
    setStatusLogs([]);
    setSearchQuery("");
    setCurrentPage(1);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    showToast("Semua data berhasil di-reset", "info");
  };

  // Retry previous URL
  const handleRetry = () => {
    if (summary?.website) {
      handleStartScan(summary.website);
    } else if (urlInput) {
      handleStartScan(urlInput);
    }
  };

  // Heuristics for classifying URL types (Front-end version)
  const classifyUrlHeuristically = (urlStr: string, cms: string = "WordPress"): string => {
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

      // Default heuristics
      if (pathname === "" || pathname === "/") return "Page";
      if (/\/\d{4}\//.test(pathname) || pathname.split("/").length > 3) {
        return "Article";
      }

      return "Page";
    } catch (e) {
      return "Other";
    }
  };

  // Helper to identify if a URL is a static asset or system/junk route to filter out
  const isAssetOrJunkUrl = (urlStr: string): boolean => {
    try {
      const url = new URL(urlStr);
      const pathname = url.pathname.toLowerCase();

      // Check extensions to ignore
      const ignoredExtensions = [
        ".css", ".js", ".woff2", ".woff", ".ttf", ".eot", ".otf", 
        ".json", ".map", ".ico", ".svg", ".png", ".jpg", ".jpeg", 
        ".gif", ".webp", ".bmp", ".tiff", ".less", ".scss", ".sass",
        ".xml", ".rss"
      ];
      if (ignoredExtensions.some(ext => pathname.endsWith(ext))) {
        return true;
      }

      const ignoredPatterns = [
        "/wp-content/themes/",
        "/wp-content/plugins/",
        "/wp-content/cache/",
        "/wp-includes/",
        "/wp-json",
        "xmlrpc.php",
        "wp-login.php",
        "wp-register.php",
        "oembed",
        "wp-embed",
        "/feed",
        "/comments/feed"
      ];
      if (ignoredPatterns.some(pattern => pathname.includes(pattern) || urlStr.toLowerCase().includes(pattern))) {
        if (pathname.includes("/wp-content/uploads/") && (pathname.endsWith(".pdf") || pathname.endsWith(".docx") || pathname.endsWith(".xlsx"))) {
          return false;
        }
        return true;
      }

      return false;
    } catch (e) {
      return true;
    }
  };

  // Handle Manual Sitemap Extraction
  const handleManualExtract = () => {
    if (!pastedSitemapText.trim()) {
      showToast("Harap masukkan atau paste teks sitemap terlebih dahulu", "error");
      return;
    }

    // Reset previous states
    setIsScanning(true);
    setScanStatus("Mengekstrak URL dari teks sitemap...");
    setProgress(20);
    setDiscoveredList([]);
    setStats(null);
    setSummary(null);
    setErrorMsg(null);
    setStatusLogs(["Memulai ekstraksi dari teks sitemap yang di-paste..."]);

    setTimeout(() => {
      try {
        // Regex to match URLs starting with http:// or https://
        // Exclude common chars that terminate a URL in plain text, XML or tab-separated text
        const urlRegex = /https?:\/\/[^\s'"<>\t\r\n]+/gi;
        const matches = pastedSitemapText.match(urlRegex) || [];
        
        setStatusLogs(prev => [...prev, `Ditemukan ${matches.length} baris string URL mentah.`, "Melakukan pembersihan dan penyaringan junk..."]);
        setProgress(55);

        // Clean up trailing punctuation
        const cleaned = matches.map(url => {
          let u = url;
          while (u && /[.,;:!?)\]}$]$/.test(u)) {
            u = u.slice(0, -1);
          }
          return u;
        });

        // Filter out duplicates and invalid URLs, and filter out assets or junk routes
        const validUrls: string[] = Array.from(new Set<string>(cleaned)).filter((url: string) => {
          try {
            new URL(url);
            return !isAssetOrJunkUrl(url);
          } catch {
            return false;
          }
        });

        if (validUrls.length === 0) {
          throw new Error("Tidak ditemukan URL valid dalam teks sitemap yang Anda masukkan.");
        }

        setStatusLogs(prev => [...prev, `Berhasil mengekstrak ${validUrls.length} URL valid setelah penyaringan.`]);
        setProgress(85);

        // Analyze domain
        const hostnames: string[] = validUrls.map((u: string) => {
          try {
            return new URL(u).hostname;
          } catch {
            return "";
          }
        }).filter(Boolean);

        // Find the most frequent hostname
        const frequency: Record<string, number> = {};
        let mostFrequentHost = "extracted-sitemap.com";
        let maxFreq = 0;
        hostnames.forEach(h => {
          frequency[h] = (frequency[h] || 0) + 1;
          if (frequency[h] > maxFreq) {
            maxFreq = frequency[h];
            mostFrequentHost = h;
          }
        });

        // Detect CMS based on URL patterns (WordPress, Blogger, Shopify, etc.)
        let cms = "WordPress"; // Default
        const textLower = pastedSitemapText.toLowerCase();
        if (textLower.includes("wp-content") || textLower.includes("wp-includes") || validUrls.some((u: string) => u.includes("wp-content") || u.includes("wp-includes"))) {
          cms = "WordPress";
        } else if (textLower.includes("blogger") || textLower.includes("blogspot") || validUrls.some((u: string) => u.includes(".html") && /\/\d{4}\/\d{2}\//.test(u))) {
          cms = "Blogger";
        } else if (textLower.includes("shopify") || validUrls.some((u: string) => u.includes("/products/") || u.includes("/collections/"))) {
          cms = "Shopify";
        }

        // Create DiscoveredURL items
        const results: DiscoveredURL[] = validUrls.map((url: string) => {
          const type = classifyUrlHeuristically(url, cms);
          return {
            url,
            type,
            source: "Sitemap",
            status: "Found"
          };
        });

        // Calculate stats
        const counts = {
          total: results.length,
          article: 0,
          page: 0,
          category: 0,
          tag: 0,
          product: 0,
          file: 0,
          image: 0,
          pdf: 0,
          video: 0,
          other: 0,
        };

        results.forEach(item => {
          const t = item.type.toLowerCase();
          if (t === "article") counts.article++;
          else if (t === "page") counts.page++;
          else if (t === "category") counts.category++;
          else if (t === "tag") counts.tag++;
          else if (t === "product") counts.product++;
          else if (t === "image") counts.image++;
          else if (t === "pdf") counts.pdf++;
          else if (t === "video") counts.video++;
          else counts.other++;
        });

        const statsObj: ScanStats = {
          total: results.length,
          article: counts.article,
          page: counts.page,
          category: counts.category,
          tag: counts.tag,
          product: counts.product,
          file: counts.pdf + counts.other,
          image: counts.image,
          pdf: counts.pdf,
          video: counts.video,
        };

        const summaryObj: ScanSummary = {
          website: `https://${mostFrequentHost}`,
          cms,
          urlCount: results.length,
          duration: "Instant",
          sitemapsFound: 1,
          robotsTxtExists: false,
          scanDate: new Date().toLocaleString("id-ID", { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
          }) + " WIB"
        };

        // Update states
        setDiscoveredList(results);
        setStats(statsObj);
        setSummary(summaryObj);
        setIsScanning(false);
        setProgress(100);
        showToast(`Berhasil mengekstrak ${results.length} URL dari sitemap!`, "success");
        setStatusLogs(prev => [...prev, "Proses ekstraksi teks sitemap selesai sepenuhnya."]);
        setCurrentPage(1);

      } catch (err: any) {
        setIsScanning(false);
        setProgress(0);
        setErrorMsg(err.message || "Gagal mengekstrak URL dari teks sitemap.");
        showToast("Proses ekstraksi gagal", "error");
        setStatusLogs(prev => [...prev, `[ERROR] Ekstraksi gagal: ${err.message}`]);
      }
    }, 800);
  };

  // Clean URLs list based on active filters
  const filteredList = discoveredList.filter((item) => {
    // Search by Keyword
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const urlLower = item.url.toLowerCase();
      
      // Keyword search matches URL string or Year
      const matchesUrl = urlLower.includes(query);
      const matchesYear = /\d{4}/.test(query) && urlLower.includes(query);

      if (!matchesUrl && !matchesYear) {
        return false;
      }
    }

    return true;
  });

  // Pagination calculations
  const totalItems = filteredList.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredList.slice(indexOfFirstItem, indexOfLastItem);

  // Download logic for different formats
  const handleDownload = (format: "txt" | "csv" | "excel" | "json" | "markdown" | "xml") => {
    if (discoveredList.length === 0) {
      showToast("Tidak ada data untuk diunduh. Harap lakukan scan terlebih dahulu.", "info");
      return;
    }

    const host = summary ? new URL(summary.website).hostname : "extracted-urls";
    const filename = `url-extractor_${host}_${new Date().toISOString().split("T")[0]}`;

    if (format === "txt") {
      const content = discoveredList.map(item => item.url).join("\r\n");
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.txt`;
      link.click();
      showToast("TXT berhasil diunduh!", "success");
    } 
    
    else if (format === "csv") {
      let csvContent = "URL\r\n";
      discoveredList.forEach((item) => {
        csvContent += `"${item.url}"\r\n`;
      });
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.csv`;
      link.click();
      showToast("CSV berhasil diunduh!", "success");
    } 
    
    else if (format === "excel") {
      const excelData = discoveredList.map((item) => ({
        "URL": item.url
      }));
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Hasil Ekstraksi");
      
      worksheet["!cols"] = [
        { wch: 80 }
      ];

      XLSX.writeFile(workbook, `${filename}.xlsx`);
      showToast("Excel (.xlsx) berhasil diunduh!", "success");
    } 
    
    else if (format === "json") {
      const content = JSON.stringify(discoveredList.map(item => item.url), null, 2);
      const blob = new Blob([content], { type: "application/json;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.json`;
      link.click();
      showToast("JSON berhasil diunduh!", "success");
    } 
    
    else if (format === "markdown") {
      let mdContent = `# Hasil Ekstraksi URL - ${summary?.website || ""}\n\n`;
      mdContent += `* **Jumlah URL:** ${summary?.urlCount || 0}\n`;
      mdContent += `* **Waktu Scan:** ${summary?.scanDate || ""}\n\n`;
      
      discoveredList.forEach((item) => {
        mdContent += `- [${item.url}](${item.url})\n`;
      });
      
      const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.md`;
      link.click();
      showToast("Markdown (.md) berhasil diunduh!", "success");
    } 
    
    else if (format === "xml") {
      let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xmlContent += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      
      discoveredList.forEach((item) => {
        xmlContent += `  <url>\n`;
        xmlContent += `    <loc>${item.url}</loc>\n`;
        xmlContent += `  </url>\n`;
      });
      
      xmlContent += `</urlset>`;
      
      const blob = new Blob([xmlContent], { type: "application/xml;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.xml`;
      link.click();
      showToast("XML berhasil diunduh!", "success");
    }
  };

  // Copy helper function
  const handleCopy = (type: "all" | "article" | "page" | "csv" | "markdown") => {
    if (discoveredList.length === 0) {
      showToast("Tidak ada data untuk disalin. Harap lakukan scan terlebih dahulu.", "info");
      return;
    }

    let textToCopy = "";
    
    if (type === "all") {
      textToCopy = discoveredList.map(item => item.url).join("\n");
      navigator.clipboard.writeText(textToCopy);
      showToast("Berhasil menyalin seluruh URL (" + discoveredList.length + " link)", "success");
    } 
    
    else if (type === "article") {
      const articles = discoveredList.filter(item => item.type.toLowerCase() === "article").map(item => item.url);
      if (articles.length === 0) {
        showToast("Tidak ditemukan URL jenis Artikel", "info");
        return;
      }
      textToCopy = articles.join("\n");
      navigator.clipboard.writeText(textToCopy);
      showToast("Berhasil menyalin " + articles.length + " URL Artikel", "success");
    } 
    
    else if (type === "page") {
      const pages = discoveredList.filter(item => item.type.toLowerCase() === "page").map(item => item.url);
      if (pages.length === 0) {
        showToast("Tidak ditemukan URL jenis Halaman", "info");
        return;
      }
      textToCopy = pages.join("\n");
      navigator.clipboard.writeText(textToCopy);
      showToast("Berhasil menyalin " + pages.length + " URL Halaman", "success");
    } 
    
    else if (type === "csv") {
      textToCopy = "URL,Type,Source\n" + discoveredList.map(item => `"${item.url}","${item.type}","${item.source}"`).join("\n");
      navigator.clipboard.writeText(textToCopy);
      showToast("Berhasil menyalin tabel dalam format CSV", "success");
    } 
    
    else if (type === "markdown") {
      textToCopy = "| No | URL | Tipe | Sumber |\n|---|---|---|---|\n" + 
        discoveredList.map((item, idx) => `| ${idx + 1} | ${item.url} | ${item.type} | ${item.source} |`).join("\n");
      navigator.clipboard.writeText(textToCopy);
      showToast("Berhasil menyalin tabel dalam format Markdown", "success");
    }
  };

  // Quick helper to categorize badge colors
  const getTypeBadgeStyle = (type: string) => {
    const t = type.toLowerCase();
    switch (t) {
      case "article":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "page":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "category":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "tag":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "product":
        return "bg-pink-50 text-pink-700 border-pink-200";
      case "image":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "pdf":
        return "bg-red-50 text-red-700 border-red-200";
      case "video":
        return "bg-cyan-50 text-cyan-700 border-cyan-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const getSourceBadgeStyle = (source: string) => {
    const s = source.toLowerCase();
    switch (s) {
      case "sitemap":
        return "bg-[#fe4c6f]/10 text-[#fe4c6f]";
      case "feed":
        return "bg-teal-50 text-teal-700 border-teal-200";
      case "crawler":
        return "bg-orange-50 text-orange-700 border-orange-200";
      default:
        return "bg-sky-50 text-sky-700 border-sky-200";
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col justify-between font-sans">
      
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 bg-white rounded-2xl shadow-xl border border-gray-100 max-w-md w-full"
            id="toast-notification"
          >
            {toastType === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
            {toastType === "error" && <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />}
            {toastType === "info" && <Info className="w-5 h-5 text-blue-500 shrink-0" />}
            <p className="text-sm font-medium text-gray-700">{toastMessage}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header removed */}

      {/* Main Content Space */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <AnimatePresence mode="wait">
          
          {/* PAGE: HOME */}
          {activePage === "home" && (
            <motion.div
              key="home-page"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              
              {/* Hero Section */}
              <section className="text-center max-w-3xl mx-auto space-y-4 py-6" id="hero-section">
                <h2 className="text-4xl sm:text-5xl font-extrabold font-display text-gray-900 tracking-tight leading-none">
                  Website URL Extractor <span className="text-[#fe4c6f]">Indonesia</span>
                </h2>
                <p className="text-base sm:text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
                  Ekstrak seluruh URL website secara otomatis dan akurat cukup dengan memasukkan alamat domain. Solusi profesional untuk pemetaan link dan analisis sitemap Anda.
                </p>
              </section>

              {/* Input Workspace */}
              <section className="max-w-3xl mx-auto bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/50 space-y-6" id="input-section">
                
                {/* Tabs Switcher */}
                <div className="flex border-b border-gray-100 pb-3 gap-6">
                  <button
                    onClick={() => {
                      if (!isScanning) setInputMode("auto");
                    }}
                    disabled={isScanning}
                    className={`pb-2 text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                      inputMode === "auto" 
                        ? "border-[#fe4c6f] text-gray-900" 
                        : "border-transparent text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    <Globe className="w-4 h-4" />
                    Scan Otomatis (Web URL)
                  </button>
                  <button
                    onClick={() => {
                      if (!isScanning) setInputMode("manual");
                    }}
                    disabled={isScanning}
                    className={`pb-2 text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                      inputMode === "manual" 
                        ? "border-[#fe4c6f] text-gray-900" 
                        : "border-transparent text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    Paste Teks Sitemap (Manual)
                  </button>
                </div>

                {inputMode === "auto" ? (
                  <div className="space-y-2">
                    <label htmlFor="target-url" className="text-sm font-semibold text-gray-700 block">
                      Masukkan URL Website Target
                    </label>
                    <div className="relative flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-grow">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                          <Globe className="w-5 h-5 text-gray-400" />
                        </div>
                        <input
                          id="target-url"
                          type="url"
                          placeholder="Contoh: https://domainanda.com"
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          disabled={isScanning}
                          className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fe4c6f]/20 focus:border-[#fe4c6f] text-base transition-all disabled:bg-gray-50"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !isScanning) {
                              handleStartScan();
                            }
                          }}
                        />
                      </div>
                      
                      {!isScanning ? (
                        <div className="flex gap-2.5 shrink-0">
                          <button
                            onClick={() => handleStartScan()}
                            className="bg-[#fe4c6f] hover:bg-[#e33b5c] text-white px-8 py-4 rounded-2xl font-semibold text-base transition-all duration-200 shadow-lg shadow-[#fe4c6f]/20 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                            id="btn-scan"
                          >
                            <RefreshCw className="w-5 h-5 animate-spin-slow" />
                            Scan Website
                          </button>
                          {discoveredList.length > 0 && (
                            <button
                              onClick={handleReset}
                              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-4 rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2 shrink-0 cursor-pointer border border-gray-200"
                              id="btn-reset-auto"
                              title="Reset data dan input"
                            >
                              <RotateCcw className="w-5 h-5 text-gray-500" />
                              Reset
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={handleCancelScan}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-8 py-4 rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                          id="btn-cancel"
                        >
                          <X className="w-5 h-5 text-red-500" />
                          Cancel Scan
                        </button>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 block mt-2 text-center">
                      Deteksi CMS, sitemap, dan crawling otomatis secara instan.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="pasted-sitemap" className="text-sm font-semibold text-gray-700 block">
                        Paste Teks Sitemap / Salinan XML / Salinan Yoast SEO
                      </label>
                      <textarea
                        id="pasted-sitemap"
                        rows={6}
                        placeholder="Tempel/paste teks sitemap di sini (bisa berupa teks XML sitemap, salinan sitemap Yoast SEO HTML, atau teks biasa berisi daftar URL)..."
                        value={pastedSitemapText}
                        onChange={(e) => setPastedSitemapText(e.target.value)}
                        disabled={isScanning}
                        className="w-full p-4 rounded-2xl border border-gray-200 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#fe4c6f]/20 focus:border-[#fe4c6f] text-sm transition-all disabled:bg-gray-50 font-mono"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <span className="text-xs text-gray-400 leading-relaxed block max-w-md">
                        Mendukung pembersihan junk otomatis, klasifikasi tipe URL, dan deteksi domain otomatis dari teks yang di-paste.
                      </span>
                      {!isScanning ? (
                        <div className="flex gap-2.5 shrink-0 w-full sm:w-auto">
                          <button
                            onClick={handleManualExtract}
                            className="flex-grow sm:flex-none bg-[#fe4c6f] hover:bg-[#e33b5c] text-white px-8 py-4 rounded-2xl font-semibold text-base transition-all duration-200 shadow-lg shadow-[#fe4c6f]/20 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 cursor-pointer shrink-0"
                            id="btn-extract-sitemap"
                          >
                            <FileCode className="w-5 h-5" />
                            Urutkan & Ekstrak URL
                          </button>
                          {discoveredList.length > 0 && (
                            <button
                              onClick={handleReset}
                              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-4 rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2 shrink-0 cursor-pointer border border-gray-200"
                              id="btn-reset-manual"
                              title="Reset data dan input manual"
                            >
                              <RotateCcw className="w-5 h-5 text-gray-500" />
                              Reset
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={handleCancelScan}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-8 py-4 rounded-2xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shrink-0"
                          id="btn-cancel-sitemap"
                        >
                          <X className="w-5 h-5 text-red-500" />
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Real-time Loading & Progress screen inside Workspace */}
                {isScanning && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="pt-6 border-t border-gray-100 space-y-4"
                    id="scanning-progress"
                  >
                    <div className="flex justify-between items-center text-sm font-semibold">
                      <span className="text-gray-700 flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-[#fe4c6f] animate-spin" />
                        {scanStatus}
                      </span>
                      <span className="text-[#fe4c6f]">{progress}%</span>
                    </div>

                    {/* Colored Progress Bar */}
                    <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                      <motion.div 
                        className="bg-[#fe4c6f] h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>

                    {/* Real-time Status Log Console */}
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Real-time Scan Log:</span>
                      <div 
                        ref={logsContainerRef}
                        className="bg-gray-900 text-[#fe4c6f]/95 p-4 rounded-xl font-mono text-xs h-32 overflow-y-auto space-y-1 scroll-smooth shadow-inner border border-gray-800"
                        id="log-console"
                      >
                        {statusLogs.map((log, i) => (
                           <div key={i} className="flex gap-2">
                             <span className="text-gray-500 select-none">&gt;</span>
                             <span>{log}</span>
                           </div>
                        ))}
                      </div>
                    </div>

                    {/* Live Counter Display while running */}
                    {discoveredList.length > 0 && (
                      <div className="bg-[#fe4c6f]/5 p-4 rounded-2xl flex items-center justify-between border border-[#fe4c6f]/10">
                        <span className="text-sm text-gray-600 font-medium">URL Terdeteksi Sementara:</span>
                        <span className="text-lg font-extrabold text-[#fe4c6f] font-mono">{discoveredList.length}</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </section>

              {/* Error Alert Box */}
              {errorMsg && (
                <div className="max-w-3xl mx-auto bg-red-50 border border-red-200 rounded-3xl p-6 flex gap-4 items-start" id="error-alert">
                  <ShieldAlert className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-base font-bold text-red-800">Gagal Mengekstrak URL</h4>
                    <p className="text-sm text-red-700 leading-relaxed">{errorMsg}</p>
                    <div className="flex flex-wrap gap-3 mt-4">
                      <button 
                        onClick={handleRetry}
                        className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 font-semibold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Coba Lagi
                      </button>
                      <button 
                        onClick={() => {
                          setInputMode("manual");
                          const element = document.getElementById("input-section");
                          if (element) {
                            element.scrollIntoView({ behavior: "smooth" });
                          }
                        }}
                        className="px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        <FileText className="w-3.5 h-3.5 text-[#fe4c6f]" /> Paste Teks Sitemap Manual
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Scan Results Workspace (Shown when results are loaded) */}
              {discoveredList.length > 0 && !isScanning && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-8 pt-4"
                  id="scan-results-workspace"
                >
                  
                  {/* Summary Bento Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Simplified Prominent Total Stats & Metadata */}
                    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-lg lg:col-span-2 flex flex-col justify-between h-full">
                      <div>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-100 pb-4 gap-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            <h3 className="text-base font-extrabold text-gray-900">
                              Ringkasan Hasil Pemindaian
                            </h3>
                          </div>
                          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                            <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg">
                              Aktif
                            </span>
                            <button 
                              onClick={handleRetry}
                              className="bg-[#fe4c6f]/10 text-[#fe4c6f] hover:bg-[#fe4c6f]/20 px-4 py-2 rounded-xl font-bold text-xs transition-all duration-200 flex items-center gap-1.5 cursor-pointer"
                              title="Pindai ulang website"
                            >
                              <RefreshCw className="w-3.5 h-3.5" /> Re-scan Website
                            </button>
                          </div>
                        </div>

                        <div className="py-4 flex flex-col justify-center items-start space-y-2">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Jumlah Link Berhasil Di-Scrape</span>
                          <div className="flex items-baseline gap-2.5">
                            <span className="text-6xl font-black text-[#fe4c6f] font-mono tracking-tight leading-none">
                              {discoveredList.length}
                            </span>
                            <span className="text-xl font-bold text-gray-500 font-sans">
                              URL Terdeteksi
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-gray-100 pt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span>
                          Tanggal Scan: <strong className="text-gray-600 font-medium">{summary?.scanDate}</strong>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span>
                          Robots.txt: <strong className={`${summary?.robotsTxtExists ? "text-emerald-600" : "text-amber-600"} font-medium`}>{summary?.robotsTxtExists ? "Ditemukan" : "Tidak Ada"}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Quick Downloads and Actions */}
                    <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-lg flex flex-col justify-between h-full">
                      <div>
                        <div className="border-b border-gray-100 pb-4">
                          <h3 className="text-base font-extrabold text-gray-900">
                            Format Unduhan
                          </h3>
                        </div>
                        <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                          Unduh seluruh hasil URL yang berhasil di-scrape ke dalam format file yang Anda butuhkan.
                        </p>
                        
                        <div className="grid grid-cols-2 gap-3 mt-6">
                          {[
                            { key: "excel", label: "Excel", icon: FileSpreadsheet, className: "bg-[#fe4c6f] text-white hover:bg-[#e33b5c] border border-transparent shadow-md shadow-[#fe4c6f]/15" },
                            { key: "txt", label: "TXT Plain", icon: FileText, className: "bg-[#fe4c6f]/8 text-[#fe4c6f] hover:bg-[#fe4c6f]/15 border border-[#fe4c6f]/20" }
                          ].map((fmt) => (
                            <button
                              key={fmt.key}
                              onClick={() => handleDownload(fmt.key as any)}
                              className={`flex items-center justify-center gap-2 p-3.5 rounded-2xl font-bold text-xs sm:text-sm transition-all duration-200 cursor-pointer ${fmt.className}`}
                            >
                              <fmt.icon className="w-4 h-4 flex-shrink-0" />
                              <span>{fmt.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="text-[11px] text-gray-400 border-t border-gray-50 pt-3 text-center sm:text-left">
                        Hanya berisi daftar link URL saja.
                      </div>
                    </div>

                  </div>

                  {/* Filter & Search Bar + Table Section */}
                  <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden space-y-6 p-6">
                    
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      
                      {/* Search bar */}
                      <div className="relative flex-grow max-w-md">
                        <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Cari kata kunci atau URL..."
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#fe4c6f]/25 focus:border-[#fe4c6f]"
                        />
                      </div>

                      {/* Discovered counts indicators */}
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block font-mono self-center lg:self-auto">
                        Menampilkan {filteredList.length} dari {discoveredList.length} URL
                      </span>

                    </div>

                    {/* Result Table */}
                    <div className="overflow-x-auto rounded-2xl border border-gray-100">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-16">No</th>
                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">URL Website</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {currentItems.length > 0 ? (
                            currentItems.map((item, index) => (
                              <tr key={index} className="hover:bg-gray-50/50 transition-colors group">
                                <td className="px-6 py-4 text-sm font-mono text-gray-400 font-semibold">
                                  {indexOfFirstItem + index + 1}
                                </td>
                                <td className="px-6 py-4 text-sm font-medium flex items-center justify-between gap-4">
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-800 hover:text-[#fe4c6f] hover:underline break-all block flex-grow"
                                  >
                                    {item.url}
                                  </a>
                                  
                                  {/* Fast copy helper button for each individual URL */}
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(item.url);
                                      showToast("URL disalin ke clipboard", "success");
                                    }}
                                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-[#fe4c6f] transition-all cursor-pointer shrink-0"
                                    title="Salin URL"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={2} className="px-6 py-12 text-center text-sm font-semibold text-gray-400">
                                Tidak ada URL yang cocok dengan pencarian Anda.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between border-t border-gray-50 pt-4">
                        <span className="text-xs font-semibold text-gray-500">
                          Halaman {currentPage} dari {totalPages}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="p-2 border border-gray-100 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          {[...Array(totalPages)].map((_, idx) => {
                            const pageNum = idx + 1;
                            // Only show neighbors or first/last
                            if (pageNum === 1 || pageNum === totalPages || Math.abs(pageNum - currentPage) <= 1) {
                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => setCurrentPage(pageNum)}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                    currentPage === pageNum
                                      ? "bg-[#fe4c6f] text-white"
                                      : "border border-gray-100 hover:bg-gray-50 text-gray-600"
                                  }`}
                                >
                                  {pageNum}
                                </button>
                              );
                            } else if (pageNum === 2 || pageNum === totalPages - 1) {
                              return <span key={pageNum} className="px-1 text-gray-300">...</span>;
                            }
                            return null;
                          })}
                          <button
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className="p-2 border border-gray-100 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                  </div>

                </motion.div>
              )}

            </motion.div>
          )}

          {/* PAGE: FAQ */}
          {activePage === "faq" && (
            <motion.div
              key="faq-page"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-3xl mx-auto space-y-8"
              id="faq-workspace"
            >
              <div className="text-center space-y-3">
                <h2 className="text-3xl font-extrabold font-display text-gray-900">Pertanyaan Sering Diajukan (FAQ)</h2>
                <p className="text-gray-500">Temukan jawaban cepat atas pertanyaan Anda tentang fitur dan cara kerja URL Extractor kami.</p>
              </div>

              <div className="space-y-4">
                {faqData.map((item, index) => (
                  <div key={index} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-2">
                    <h4 className="text-base font-bold text-gray-900 flex items-start gap-2.5">
                      <span className="text-[#fe4c6f] font-mono">Q:</span>
                      {item.q}
                    </h4>
                    <p className="text-sm text-gray-600 leading-relaxed pl-6">
                      {item.a}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* PAGE: ABOUT */}
          {activePage === "about" && (
            <motion.div
              key="about-page"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-3xl mx-auto space-y-8"
              id="about-workspace"
            >
              <div className="text-center space-y-3">
                <h2 className="text-3xl font-extrabold font-display text-gray-900">{aboutData.title}</h2>
                <p className="text-[#fe4c6f] font-semibold text-sm uppercase tracking-wider">Misi Kami</p>
              </div>

              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                <p className="text-sm text-gray-600 leading-relaxed">
                  {aboutData.description}
                </p>

                <h3 className="text-base font-bold text-gray-900 border-b border-gray-50 pb-2">Mengapa Memilih Kami?</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {aboutData.benefits.map((b, i) => (
                    <div key={i} className="space-y-1.5">
                      <h4 className="text-sm font-extrabold text-[#fe4c6f]">{b.title}</h4>
                      <p className="text-xs text-gray-500 leading-relaxed">{b.desc}</p>
                    </div>
                  ))}
                </div>

                <h3 className="text-base font-bold text-gray-900 border-b border-gray-50 pb-2">Siapa yang Menggunakan Alat Ini?</h3>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                  {aboutData.targetUsers.map((user, i) => (
                    <li key={i} className="flex items-center gap-2 font-medium">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#fe4c6f]" />
                      {user}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}

          {/* PAGE: CONTACT */}
          {activePage === "contact" && (
            <motion.div
              key="contact-page"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-xl mx-auto space-y-8"
              id="contact-workspace"
            >
              <div className="text-center space-y-3">
                <h2 className="text-3xl font-extrabold font-display text-gray-900">Hubungi Kami</h2>
                <p className="text-gray-500 leading-relaxed">{contactData.tagline}</p>
              </div>

              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-sm space-y-6 text-center">
                <div className="flex flex-col items-center justify-center space-y-4">
                  <div className="w-12 h-12 bg-[#fe4c6f]/10 text-[#fe4c6f] rounded-full flex items-center justify-center shadow-inner">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest block">Email Dukungan</span>
                    <a href={`mailto:${contactData.email}`} className="text-base font-extrabold text-[#fe4c6f] hover:underline">
                      {contactData.email}
                    </a>
                  </div>
                </div>

                <div className="border-t border-gray-50 pt-6 grid grid-cols-2 gap-4">
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-semibold text-gray-400 uppercase">Wilayah</span>
                    <span className="text-sm font-bold text-gray-800 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-gray-500" /> {contactData.address}
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-semibold text-gray-400">Instagram</span>
                    <span className="text-sm font-bold text-gray-800">{contactData.instagram}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* PAGE: PRIVACY POLICY */}
          {activePage === "privacy" && (
            <motion.div
              key="privacy-page"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-3xl mx-auto space-y-8"
              id="privacy-workspace"
            >
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-extrabold font-display text-gray-900">Kebijakan Privasi</h2>
                <p className="text-xs text-gray-400">Terakhir diperbarui: 11 Juli 2026</p>
              </div>

              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-sm space-y-4 text-sm text-gray-600 leading-relaxed">
                <p>
                  Kami sangat berkomitmen menjaga privasi Anda. Halaman ini menjelaskan bagaimana Website URL Extractor Indonesia memperlakukan informasi yang Anda gunakan saat berinteraksi dengan aplikasi kami.
                </p>
                <h3 className="text-base font-bold text-gray-900 mt-6">1. Informasi Pemindaian Website</h3>
                <p>
                  Saat Anda memasukkan URL website untuk dipindai, URL tersebut dikirimkan ke server kami untuk dianalisis (deteksi CMS, membaca file robots.txt/sitemap, dan crawling internal link). Semua data daftar URL yang diperoleh disimpan dalam <strong>caching memori sementara</strong> selama proses pemindaian aktif agar Anda dapat mengunduh hasilnya secara lengkap. Kami tidak pernah menyimpan riwayat hasil pemindaian URL Anda di database permanen kami.
                </p>
                <h3 className="text-base font-bold text-gray-900 mt-6">2. Keamanan Kunci API</h3>
                <p>
                  Semua interaksi kecerdasan buatan (Gemini API) untuk menganalisis pola URL diselesaikan sepenuhnya di sisi server. Kunci API diproteksi dengan ketat dan tidak pernah diekspos ke browser atau pihak luar mana pun.
                </p>
                <h3 className="text-base font-bold text-gray-900 mt-6">3. Kuki (Cookies)</h3>
                <p>
                  Aplikasi ini menggunakan penyimpanan kuki fungsional minimal atau penyimpanan lokal browser untuk menyimpan preferensi tata letak Anda (misalnya riwayat input URL sebelumnya) demi kenyamanan akses berikutnya.
                </p>
              </div>
            </motion.div>
          )}

          {/* PAGE: TERMS OF SERVICE */}
          {activePage === "terms" && (
            <motion.div
              key="terms-page"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-3xl mx-auto space-y-8"
              id="terms-workspace"
            >
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-extrabold font-display text-gray-900">Ketentuan Layanan</h2>
                <p className="text-xs text-gray-400">Terakhir diperbarui: 11 Juli 2026</p>
              </div>

              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-sm space-y-4 text-sm text-gray-600 leading-relaxed">
                <p>
                  Dengan mengakses dan menggunakan Website URL Extractor Indonesia, Anda secara penuh menyetujui ketentuan layanan berikut. Jika Anda tidak menyetujui salah satu poin di bawah ini, mohon untuk tidak menggunakan layanan kami.
                </p>
                <h3 className="text-base font-bold text-gray-900 mt-6">1. Penggunaan yang Diizinkan</h3>
                <p>
                  Layanan ini dibuat murni untuk mempermudah audit struktur SEO, migrasi situs web, serta keperluan riset konten yang sah. Anda dilarang keras menyalahgunakan alat ini untuk melakukan spamming secara beruntun ke server target yang dapat mengganggu kinerja server atau menyebabkan kelebihan beban layanan (Denial of Service).
                </p>
                <h3 className="text-base font-bold text-gray-900 mt-6">2. Batasan Tanggung Jawab</h3>
                <p>
                  Hasil ekstraksi URL, perkiraan kategori (seperti Artikel, Halaman, dsb), serta deteksi CMS didasarkan pada kecerdasan buatan dan algoritma heuristik sitemap/robots.txt. Kami tidak memberikan jaminan 100% akurasi hasil dan tidak bertanggung jawab atas segala kerugian yang muncul akibat penggunaan data hasil scan ini.
                </p>
                <h3 className="text-base font-bold text-gray-900 mt-6">3. Perubahan Ketentuan</h3>
                <p>
                  Kami berhak memperbarui ketentuan layanan ini kapan saja tanpa pemberitahuan sebelumnya demi menjaga kualitas fungsionalitas dan keamanan server.
                </p>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm font-medium text-gray-500" id="footer-text">
            © 2026 Karya Prajurit Digital. Hak Cipta Dilindungi.
          </p>
        </div>
      </footer>

    </div>
  );
}
