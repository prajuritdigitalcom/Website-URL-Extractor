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
  ArrowRight
} from "lucide-react";
import { DiscoveredURL, ScanStats, ScanSummary, ActivePage } from "./types";
import { faqData, aboutData, contactData } from "./data";

export default function App() {
  // Navigation State
  const [activePage, setActivePage] = useState<ActivePage>("home");

  // App States
  const [urlInput, setUrlInput] = useState("");
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
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("Semua");
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
      setErrorMsg("Gagal melakukan pemindaian. Pastikan website target aktif dan dapat diakses.");
      showToast("Pemindaian terputus atau terjadi kesalahan koneksi.", "error");
      setStatusLogs(prev => [...prev, "[ERROR] Terjadi kegagalan koneksi atau timeout."]);
      handleCancelScan();
    };
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

  // Retry previous URL
  const handleRetry = () => {
    if (summary?.website) {
      handleStartScan(summary.website);
    } else if (urlInput) {
      handleStartScan(urlInput);
    }
  };

  // Clean URLs list based on active filters
  const filteredList = discoveredList.filter((item) => {
    // 1. Filter by Selected Type Tab
    if (selectedTypeFilter !== "Semua") {
      const typeLower = item.type.toLowerCase();
      const filterLower = selectedTypeFilter.toLowerCase();
      
      if (filterLower === "artikel" && typeLower !== "article") return false;
      if (filterLower === "halaman" && typeLower !== "page") return false;
      if (filterLower === "kategori" && typeLower !== "category") return false;
      if (filterLower === "tag" && typeLower !== "tag") return false;
      if (filterLower === "produk" && typeLower !== "product") return false;
      if (filterLower === "gambar" && typeLower !== "image") return false;
      if (filterLower === "pdf" && typeLower !== "pdf") return false;
      if (filterLower === "video" && typeLower !== "video") return false;
    }

    // 2. Search by Keyword
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const urlLower = item.url.toLowerCase();
      const typeLower = item.type.toLowerCase();
      
      // Keyword search matches URL string, Type, Folder structures (e.g. /p/ or /blog/), or Year
      const matchesUrl = urlLower.includes(query);
      const matchesType = typeLower.includes(query);
      
      // Year check (e.g., matching "2023" or "2024" inside URLs)
      const matchesYear = /\d{4}/.test(query) && urlLower.includes(query);

      if (!matchesUrl && !matchesType && !matchesYear) {
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
      let csvContent = "No,URL,Type,Source,Status\r\n";
      discoveredList.forEach((item, index) => {
        csvContent += `${index + 1},"${item.url}","${item.type}","${item.source}","${item.status}"\r\n`;
      });
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.csv`;
      link.click();
      showToast("CSV berhasil diunduh!", "success");
    } 
    
    else if (format === "excel") {
      const excelData = discoveredList.map((item, index) => ({
        "No": index + 1,
        "URL": item.url,
        "Tipe": item.type,
        "Sumber": item.source,
        "Status": item.status
      }));
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Hasil Ekstraksi");
      
      // Auto-fit column widths
      const maxColWidth = excelData.reduce((acc, row) => {
        return {
          No: 5,
          URL: Math.max(acc.URL, row.URL.length),
          Tipe: Math.max(acc.Tipe, row.Tipe.length),
          Sumber: Math.max(acc.Sumber, row.Sumber.length),
          Status: Math.max(acc.Status, row.Status.length),
        };
      }, { No: 5, URL: 20, Tipe: 10, Sumber: 10, Status: 10 });

      worksheet["!cols"] = [
        { wch: maxColWidth.No },
        { wch: Math.min(maxColWidth.URL, 80) },
        { wch: maxColWidth.Tipe + 2 },
        { wch: maxColWidth.Sumber + 2 },
        { wch: maxColWidth.Status + 2 }
      ];

      XLSX.writeFile(workbook, `${filename}.xlsx`);
      showToast("Excel (.xlsx) berhasil diunduh!", "success");
    } 
    
    else if (format === "json") {
      const content = JSON.stringify({
        summary,
        stats,
        urls: discoveredList
      }, null, 2);
      const blob = new Blob([content], { type: "application/json;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.json`;
      link.click();
      showToast("JSON berhasil diunduh!", "success");
    } 
    
    else if (format === "markdown") {
      let mdContent = `# Website URL Extractor Report - ${summary?.website || ""}\n\n`;
      mdContent += `* **Platform CMS:** ${summary?.cms || "Tidak diketahui"}\n`;
      mdContent += `* **Jumlah URL:** ${summary?.urlCount || 0}\n`;
      mdContent += `* **Waktu Scan:** ${summary?.scanDate || ""}\n\n`;
      mdContent += `| No | URL | Tipe | Sumber | Status |\n`;
      mdContent += `|---|---|---|---|---|\n`;
      
      discoveredList.forEach((item, index) => {
        mdContent += `| ${index + 1} | [${item.url}](${item.url}) | ${item.type} | ${item.source} | ${item.status} |\n`;
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
      xmlContent += `<urlset_report>\n`;
      xmlContent += `  <summary>\n`;
      xmlContent += `    <website>${summary?.website || ""}</website>\n`;
      xmlContent += `    <cms>${summary?.cms || ""}</cms>\n`;
      xmlContent += `    <total_urls>${summary?.urlCount || 0}</total_urls>\n`;
      xmlContent += `    <scan_date>${summary?.scanDate || ""}</scan_date>\n`;
      xmlContent += `  </summary>\n`;
      xmlContent += `  <urls>\n`;
      
      discoveredList.forEach((item) => {
        xmlContent += `    <url>\n`;
        xmlContent += `      <loc>${item.url}</loc>\n`;
        xmlContent += `      <type>${item.type}</type>\n`;
        xmlContent += `      <source>${item.source}</source>\n`;
        xmlContent += `      <status>${item.status}</status>\n`;
        xmlContent += `    </url>\n`;
      });
      
      xmlContent += `  </urls>\n`;
      xmlContent += `</urlset_report>`;
      
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
                  Ambil seluruh URL website secara otomatis hanya dengan memasukkan alamat website. Mendukung WordPress, Blogger, Shopify, Joomla, Wix, Ghost, Webflow, Drupal, dan berbagai CMS lainnya.
                </p>
              </section>

              {/* Input Workspace */}
              <section className="max-w-3xl mx-auto bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/50 space-y-6" id="input-section">
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
                      <button
                        onClick={() => handleStartScan()}
                        className="bg-[#fe4c6f] hover:bg-[#e33b5c] text-white px-8 py-4 rounded-2xl font-semibold text-base transition-all duration-200 shadow-lg shadow-[#fe4c6f]/20 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                        id="btn-scan"
                      >
                        <RefreshCw className="w-5 h-5 animate-spin-slow" />
                        Scan Website
                      </button>
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
                    <div className="flex gap-3 mt-3">
                      <button 
                        onClick={handleRetry}
                        className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 font-semibold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Coba Lagi
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    {/* General Metadata */}
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-lg md:col-span-2 space-y-4">
                      <div className="flex justify-between items-center border-b border-gray-50 pb-3">
                        <h3 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          Ringkasan Scan Website
                        </h3>
                        <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg">
                          Aktif
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6">
                        <div>
                          <span className="text-xs font-semibold text-gray-400 block uppercase">Website</span>
                          <a href={summary?.website} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#fe4c6f] hover:underline truncate block max-w-full">
                            {summary?.website}
                          </a>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-gray-400 block uppercase">Platform CMS</span>
                          <span className="text-sm font-bold text-gray-800 block">
                            {summary?.cms || "Tidak diketahui"}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-gray-400 block uppercase">Jumlah URL</span>
                          <span className="text-sm font-extrabold text-[#fe4c6f] block font-mono">
                            {summary?.urlCount || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-gray-400 block uppercase">Durasi Scan</span>
                          <span className="text-sm font-semibold text-gray-800 block">
                            {summary?.duration || "0.0s"}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-gray-400 block uppercase">Sitemaps Ditemukan</span>
                          <span className="text-sm font-semibold text-gray-800 block">
                            {summary?.sitemapsFound || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-gray-400 block uppercase">Robots.txt</span>
                          <span className="text-sm font-semibold text-gray-800 block">
                            {summary?.robotsTxtExists ? "Ditemukan" : "Tidak Ada"}
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-gray-50 pt-3 flex justify-between items-center">
                        <span className="text-xs text-gray-400">Tanggal Scan: {summary?.scanDate}</span>
                        <button 
                          onClick={handleRetry}
                          className="text-[#fe4c6f] hover:text-[#e33b5c] text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Re-scan
                        </button>
                      </div>
                    </div>

                    {/* Quick Downloads and Actions */}
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-lg space-y-4">
                      <h3 className="text-base font-extrabold text-gray-900 border-b border-gray-50 pb-3">
                        Format Unduhan
                      </h3>
                      
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { key: "excel", label: "Excel (.xlsx)", icon: FileText, color: "hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200" },
                          { key: "csv", label: "CSV", icon: FileText, color: "hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200" },
                          { key: "txt", label: "TXT Plain", icon: FileText, color: "hover:bg-gray-50 hover:text-gray-700 hover:border-gray-200" },
                          { key: "json", label: "JSON", icon: FileCode, color: "hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200" },
                          { key: "markdown", label: "Markdown", icon: FileText, color: "hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200" },
                          { key: "xml", label: "Sitemap XML", icon: FileCode, color: "hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200" }
                        ].map((fmt) => (
                          <button
                            key={fmt.key}
                            onClick={() => handleDownload(fmt.key as any)}
                            className={`flex flex-col items-center justify-center p-3 border border-gray-100 rounded-xl transition-all duration-150 text-center gap-1.5 group cursor-pointer ${fmt.color}`}
                          >
                            <fmt.icon className="w-5 h-5 text-gray-400 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-semibold text-gray-600 block leading-none">{fmt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                  </div>

                  {/* Complete Metric Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    {[
                      { label: "Artikel", value: stats?.article || 0, color: "text-emerald-600", bg: "bg-emerald-50/50" },
                      { label: "Halaman", value: stats?.page || 0, color: "text-blue-600", bg: "bg-blue-50/50" },
                      { label: "Kategori", value: stats?.category || 0, color: "text-purple-600", bg: "bg-purple-50/50" },
                      { label: "Tag", value: stats?.tag || 0, color: "text-amber-600", bg: "bg-amber-50/50" },
                      { label: "Produk", value: stats?.product || 0, color: "text-pink-600", bg: "bg-pink-50/50" },
                    ].map((statItem, idx) => (
                      <div key={idx} className={`p-4 rounded-2xl border border-gray-100 shadow-sm ${statItem.bg} text-center space-y-1`}>
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">{statItem.label}</span>
                        <span className={`text-2xl font-extrabold font-mono ${statItem.color}`}>{statItem.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Clipboard / Copy Toolbelt */}
                  <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-md flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <Copy className="w-4 h-4 text-[#fe4c6f]" />
                      Salin Instan URL ke Clipboard:
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      <button
                        onClick={() => handleCopy("all")}
                        className="px-4 py-2 border border-gray-100 bg-gray-50 hover:bg-gray-100 rounded-xl text-xs font-semibold text-gray-600 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        Copy Semua URL
                      </button>
                      <button
                        onClick={() => handleCopy("article")}
                        className="px-4 py-2 border border-emerald-100 bg-emerald-50/50 hover:bg-emerald-50 rounded-xl text-xs font-semibold text-emerald-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        Copy Hanya Artikel
                      </button>
                      <button
                        onClick={() => handleCopy("page")}
                        className="px-4 py-2 border border-blue-100 bg-blue-50/50 hover:bg-blue-50 rounded-xl text-xs font-semibold text-blue-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        Copy Hanya Halaman
                      </button>
                      <button
                        onClick={() => handleCopy("csv")}
                        className="px-4 py-2 border border-gray-100 bg-gray-50 hover:bg-gray-100 rounded-xl text-xs font-semibold text-gray-600 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        Copy CSV
                      </button>
                      <button
                        onClick={() => handleCopy("markdown")}
                        className="px-4 py-2 border border-gray-100 bg-gray-50 hover:bg-gray-100 rounded-xl text-xs font-semibold text-gray-600 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        Copy Markdown Table
                      </button>
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
                          placeholder="Cari kata kunci, URL, folder, atau tahun..."
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

                    {/* Filter Category Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
                      {["Semua", "Artikel", "Halaman", "Kategori", "Tag", "Produk", "Gambar", "PDF", "Video"].map((filter) => (
                        <button
                          key={filter}
                          onClick={() => {
                            setSelectedTypeFilter(filter);
                            setCurrentPage(1);
                          }}
                          className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer ${
                            selectedTypeFilter === filter
                              ? "bg-[#fe4c6f] text-white"
                              : "bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-100"
                          }`}
                        >
                          {filter}
                        </button>
                      ))}
                    </div>

                    {/* Result Table */}
                    <div className="overflow-x-auto rounded-2xl border border-gray-100">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-16">No</th>
                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">URL Website</th>
                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-32 text-center">Tipe</th>
                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-32 text-center">Sumber</th>
                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-28 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {currentItems.length > 0 ? (
                            currentItems.map((item, index) => (
                              <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-6 py-4 text-sm font-mono text-gray-400 font-semibold">
                                  {indexOfFirstItem + index + 1}
                                </td>
                                <td className="px-6 py-4 text-sm font-medium">
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-800 hover:text-[#fe4c6f] hover:underline break-all block max-w-2xl"
                                  >
                                    {item.url}
                                  </a>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <span className={`inline-block px-2.5 py-1 text-xs font-bold rounded-lg border ${getTypeBadgeStyle(item.type)}`}>
                                    {item.type}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <span className={`inline-block px-2.5 py-1 text-xs font-bold rounded-lg border ${getSourceBadgeStyle(item.source)}`}>
                                    {item.source}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    {item.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="px-6 py-12 text-center text-sm font-semibold text-gray-400">
                                Tidak ada URL yang cocok dengan pencarian atau filter Anda.
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
