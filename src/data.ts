import { ActivePage } from "./types";

export interface FAQItem {
  q: string;
  a: string;
}

export const faqData: FAQItem[] = [
  {
    q: "Apa itu Website URL Extractor Indonesia?",
    a: "Website URL Extractor Indonesia adalah alat bantu (tools) web gratis yang dirancang khusus untuk mengambil seluruh URL dari sebuah website secara otomatis. Cukup masukkan alamat website (domain), klik 'Scan Website', dan sistem kami akan bekerja mencarinya untuk Anda."
  },
  {
    q: "CMS apa saja yang didukung oleh extractor ini?",
    a: "Sistem kami secara otomatis mendeteksi platform CMS yang digunakan website target tanpa perlu input manual. Kami mendukung berbagai CMS terpopuler seperti WordPress, Blogger (Blogspot), Shopify, Joomla, Drupal, Wix, Squarespace, Ghost, Webflow, Laravel, maupun custom CMS lainnya."
  },
  {
    q: "Bagaimana cara kerja pencarian URL (URL Discovery Strategy)?",
    a: "Kami menggunakan strategi pencarian bertingkat yang dioptimalkan: pertama memvalidasi URL, lalu membaca robots.txt untuk menemukan sitemap, memindai sitemap.xml dan sitemap_index.xml secara rekursif, mencoba mendeteksi feed (seperti feed Atom Blogger), dan jika semua metode sitemap tidak membuahkan hasil, kami menjalankan crawler internal berkecepatan tinggi untuk menelusuri link internal situs secara real-time."
  },
  {
    q: "Apakah alat ini aman digunakan dan apakah data scan disimpan?",
    a: "Sangat aman. Kami menggunakan caching memori sementara selama proses pemindaian berlangsung untuk menyajikan hasil secara cepat kepada Anda. Kami tidak menyimpan database daftar URL yang Anda pindai atau data sensitif apa pun secara permanen di server kami."
  },
  {
    q: "Format ekspor apa saja yang didukung?",
    a: "Anda dapat mengunduh hasil scan dalam 6 format sekaligus: TXT, CSV, Excel (.xlsx), JSON, Markdown (.md), dan XML. Anda juga dapat menyalin jenis URL tertentu (seperti hanya artikel atau hanya halaman) langsung ke papan klip Anda."
  },
  {
    q: "Apakah ada batasan (limit) dalam memindai URL?",
    a: "Aplikasi ini dioptimalkan untuk memindai ratusan hingga ribuan URL per website secara real-time. Untuk mencegah overloading pada website target, crawler kami dikonfigurasi dengan jeda aman dan batasan rekursi yang ramah bagi server target."
  }
];

export const aboutData = {
  title: "Tentang Website URL Extractor Indonesia",
  description: "Website URL Extractor Indonesia didirikan dengan misi menyederhanakan tugas-tugas SEO teknis dan manajemen konten bagi para pelaku industri digital di Indonesia. Kami memahami bahwa mengumpulkan struktur URL dari sebuah website secara manual adalah pekerjaan yang membosankan dan memakan waktu lama.",
  benefits: [
    {
      title: "Praktis & Otomatis",
      desc: "Tidak ada konfigurasi rumit. Cukup salin dan tempel URL, biarkan sistem mendeteksi CMS dan mengekstrak semua tautan secara instan."
    },
    {
      title: "Analisis Berbasis AI",
      desc: "Memanfaatkan kecerdasan buatan Google Gemini untuk membantu menganalisis dan mengelompokkan pola URL yang rumit secara cerdas."
    },
    {
      title: "Dukungan Multi-Format",
      desc: "Ekspor hasil scan Anda ke format yang paling sesuai dengan alur kerja Anda, baik itu spreadsheet Excel, Markdown, atau skema XML."
    }
  ],
  targetUsers: [
    "Praktisi SEO & Spesialis Digital Marketing",
    "Blogger & Pemilik Website",
    "Content Writer & Editor",
    "Web Developer & Agensi Digital",
    "Mahasiswa & Peneliti Data Web"
  ]
};

export const contactData = {
  email: "prajuritdigitalcom@gmail.com",
  instagram: "@prajuritdigital",
  address: "Jakarta, Indonesia",
  tagline: "Butuh bantuan, custom integrasi, atau memiliki saran pengembangan? Silakan hubungi kami!"
};
