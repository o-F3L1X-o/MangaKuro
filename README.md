# 📚 MangaKuro • Ultimate Comic & Manga Suite

[![Version](https://img.shields.io/badge/version-v0.9.5--rc1-indigo.svg)](https://github.com/o-F3L1X-o/MangaKuro/releases)
[![License: GPLv3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)](docker-compose.yml)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React_18_+_Vite-61dafb.svg?logo=react&logoColor=black)](https://react.dev)
[![Komga Ready](https://img.shields.io/badge/Komga-Compatible-purple.svg)](https://komga.org)

**MangaKuro** is a comprehensive, lightweight, high-performance web suite designed for curating, preparing, optimizing, and editing metadata for comic and manga collections before importing them into personal media servers like **Komga** or **Kavita**.

Seamlessly process **.CBZ, .CBR, .ZIP, .RAR, .PDF, and .EPUB** archives, reorder or purge pages with zero latency, split double-page spreads, slice webtoon strips, and standardize `ComicInfo.xml` metadata across any device on your local network.

---

## 🚀 Quick Deployment

### Option 1: Docker Compose (Recommended for Servers, NAS, and Linux)

MangaKuro is automatically built and published as an official image on **GitHub Container Registry (`ghcr.io`)**. You can deploy it in seconds without local compilation:

```yaml
services:
  mangakuro:
    image: ghcr.io/o-f3l1x-o/mangakuro:latest
    container_name: mangakuro
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data                        # Application data and hot staging sessions
      - /your/path/comics:/comics_library       # Folder read by Komga / Media Server
    environment:
      - EXPORT_DIR=/comics_library
    restart: unless-stopped
```

Start the container with:
```bash
docker compose up -d
```

Or using the **Docker CLI** directly:
```bash
docker run -d \
  --name mangakuro \
  -p 8000:8000 \
  -v ./data:/app/data \
  -v /your/path/comics:/comics_library \
  -e EXPORT_DIR=/comics_library \
  --restart unless-stopped \
  ghcr.io/o-f3l1x-o/mangakuro:latest
```

The service will be instantly available at `http://localhost:8000` (or your server/NAS IP address).

#### 🔄 Updating the Container
Whenever a new release or commit is pushed to GitHub, the official Docker image is automatically compiled and pushed to GHCR. To update your server container:
```bash
# Using Docker Compose:
docker compose pull && docker compose up -d
```

---

### Option 2: Native Windows (Without Docker)

To run directly on Windows:
1. Double-click the launch script:
   ```bat
   run.bat
   ```
2. The script will automatically configure the Python virtual environment, install required dependencies, and launch the application in your default browser.

---

## ✨ Key Features

### ⚡ Hot-Staging Architecture
* **Instant In-Place Editing**: Reorder pages via drag & drop, rotate, swap covers, or delete unwanted pages in milliseconds without recompressing large archives on every action.
* **Accelerated Engine with PyMuPDF (C / MuPDF)**: Native-speed extraction and rasterization of PDF comic pages without overloading system CPU.
* **Efficient Virtualization**: `IntersectionObserver`-based rendering; off-screen pages consume zero GPU memory, ensuring smooth scrolling even in volumes with hundreds of high-resolution pages.

### 📘 Advanced Volume & Chapter Management
* **Structural Categorization**: Immediate visual differentiation between **Compiled Volumes** (Tankōbon) and **Single Chapters**.
* **Chapter Merge**: Combine multiple chapter releases into a single, cohesive volume with sequential page numbering.
* **Automatic Tankōbon Chapter Covers**: Optional generation and insertion of minimalist divider cover cards between merged chapters.
* **Chapter Extraction**: Separate page ranges into standalone chapters or transfer them to another volume.
* **Collection Organization**: Automatic grouping by series in the sidebar with alphabetical and numeric sorting tools.

### 📝 Standard Metadata Editor (`ComicInfo.xml`)
* **Session Isolation**: Each volume or chapter retains its own independent `ComicInfo.xml` metadata file.
* **Batch Editing & Metadata Cloning**: Copy shared attributes (Writer, Penciller, Genres, Summary, Publisher, Year) across multiple volumes while preserving unique volume/issue numbers.
* **Smart Metadata Inference**: Automatic detection and population of Series, Volume, and Issue numbers directly from archive filenames.

### 🇰🇷 Complete Webtoon (Manhwa) Support
* **Vertical Cascade Reader**: Continuous vertical reading mode with fluid infinite scroll.
* **Safe Chunked Pagination**: Chunked page streaming prevents browser GPU memory crashes on ultra-long strips.
* **Smart Webtoon Slicer**: Intelligently slices tall vertical strips (e.g., 800 × 25,000 px) by auto-detecting whitespace gutters between panels without cutting through dialog balloons or artwork.

### 🇯🇵 Dedicated Manga Support
* **Right-to-Left (RTL) Reading**: Native oriental reading direction with inverted keyboard and navigation controls.
* **Spread Splitter**: Splits scanned two-page spreads into individual pages while preserving the natural reading sequence.

### 📦 Safe Export & NAS In-Place Overwrite
* **Zero-Loss Safety Backup**: When exporting directly over the original file on a NAS/Server, MangaKuro first creates a full backup inside staging before overwriting.
* **One-Click Revert & Safe Verification**: Verify in Komga before freeing staging space, or revert back to the original in one click.
* **WebP / JPEG / Original Format Optimization**: Reduces storage space by 50% to 70% while maintaining visual fidelity.
* **Background Queue**: Non-blocking export processing runs asynchronously in the background.
* **Direct Komga Scan Trigger**: Automatically signals Komga to rescan the updated library immediately upon export completion.

---

## 📁 Project Structure

```
MangaKuro/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI server, REST API, and SPA static router
│   │   ├── config.py              # Global settings and environment path resolution
│   │   └── services/
│   │       ├── comic_parser.py    # Archive extraction (CBZ, CBR, ZIP, RAR, PDF, EPUB)
│   │       ├── comic_info.py      # ComicInfo.xml metadata parser and generator
│   │       ├── image_processor.py # Thumbnails, rotation, and double-page splitting
│   │       ├── webtoon_slicer.py  # Smart whitespace-based vertical strip slicer
│   │       ├── session_manager.py # Hot-staging session manager and storage
│   │       └── exporter.py        # Archive packaging, WebP/JPEG conversion, and Komga trigger
│   ├── requirements.txt
│   └── tests/                     # Automated test suites
├── frontend/
│   ├── src/
│   │   ├── components/            # React components (PageGrid, Header, Modals, etc.)
│   │   ├── i18n/                  # Internationalization (Spanish / English)
│   │   ├── theme/                 # Light and Dark theme support
│   │   ├── api.ts                 # Typed HTTP client
│   │   ├── version.ts             # App version and metadata
│   │   └── App.tsx                # Main view and application state
│   ├── package.json
│   └── vite.config.ts
├── data/
│   ├── staging/                   # Hot-staging work directory (.gitignored)
│   └── export/                    # Default local export destination (.gitignored)
├── Dockerfile                     # Multi-stage production container build
├── docker-compose.yml             # Container orchestration
├── LICENSE                        # GNU General Public License v3.0
└── run.bat                        # Quick launch script for Windows
```

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0 (GPLv3)**. See the [LICENSE](LICENSE) file for details.

You are free to use, modify, and distribute this software in compliance with the terms of the GPLv3.

---

## ☕ Support the Project

MangaKuro is free and open-source software. If you find it helpful and wish to support its ongoing development and maintenance, you can buy the developer a coffee via [PayPal](https://www.paypal.com/donate/?hosted_button_id=K2L2FEZ2NS6TY).
