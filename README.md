# 📚 MangaKuro • Ultimate Comic & Manga Suite

[![Version](https://img.shields.io/badge/version-v0.9.5--rc1-indigo.svg)](https://github.com/o-F3L1X-o/MangaKuro)
[![License: GPLv3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)](docker-compose.yml)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React_18_+_Vite-61dafb.svg?logo=react&logoColor=black)](https://react.dev)
[![Komga Ready](https://img.shields.io/badge/Komga-Compatible-purple.svg)](https://komga.org)

**MangaKuro** es una suite web integral, ligera y de alto rendimiento diseñada para la preparación, curación, optimización y edición de metadatos de colecciones de cómics y manga antes de incorporarlos a tu servidor personal como **Komga** o **Kavita**.

Permite procesar archivos en formatos **.CBZ, .CBR, .ZIP, .RAR, .PDF y .EPUB**, reordenar o limpiar páginas sin latencia, dividir dobles páginas, segmentar tiras de webtoon y estandarizar metadatos `ComicInfo.xml` desde cualquier dispositivo de la red local.

---

## 🚀 Despliegue Rápido

### Opción 1: Docker Compose (Recomendado para Servidores, NAS y Linux)

MangaKuro se compila y publica automáticamente como imagen oficial en **GitHub Container Registry (`ghcr.io`)**. Puedes desplegarlo en segundos sin necesidad de compilar código localmente:

```yaml
services:
  mangakuro:
    image: ghcr.io/o-f3l1x-o/mangakuro:latest
    container_name: mangakuro
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data                        # Almacenamiento y sesiones en caliente
      - /tu/ruta/comics:/comics_library         # Carpeta leída por Komga
    environment:
      - EXPORT_DIR=/comics_library
    restart: unless-stopped
```

Inicia el servicio ejecutando:
```bash
docker compose up -d
```

O si prefieres utilizar **Docker CLI** directamente:
```bash
docker run -d \
  --name mangakuro \
  -p 8000:8000 \
  -v ./data:/app/data \
  -v /tu/ruta/comics:/comics_library \
  -e EXPORT_DIR=/comics_library \
  --restart unless-stopped \
  ghcr.io/o-f3l1x-o/mangakuro:latest
```

El servicio estará disponible de inmediato en `http://localhost:8000` (o la IP de tu servidor o NAS).

---

### Opción 2: Windows Nativo (Sin Docker)

Si prefieres ejecutarlo directamente en tu equipo con Windows:
1. Haz doble clic en el script:
   ```bat
   run.bat
   ```
2. El script configurará automáticamente el entorno virtual de Python, instalará las dependencias necesarias y abrirá la aplicación en tu navegador web.

---

## ✨ Características Principales

### ⚡ Arquitectura de Sesión en Caliente (*Staging*)
* **Edición instantánea**: Reordenar páginas mediante arrastrar y soltar (*drag & drop*), rotar, intercambiar portadas o eliminar descartes se refleja en milisegundos sin recomprimir archivos pesados en cada acción.
* **Motor acelerado con PyMuPDF (C / MuPDF)**: Extracción y rasterizado de páginas de cómics en PDF a velocidad nativa sin saturar la CPU.
* **Virtualización eficiente**: Renderizado basado en `IntersectionObserver`; las páginas fuera del viewport no consumen memoria gráfica, garantizando fluidez incluso en tomos con cientos de páginas.

### 📘 Gestión Avanzada de Tomos y Capítulos
* **Diferenciación estructural**: Identificación visual inmediata entre **Tomos Recopilatorios** (Tankōbon) y **Capítulos Sueltos**.
* **Fusión de Capítulos (*Merge*)**: Combina múltiples entregas en un único tomo continuo con numeración coherente.
* **Portadillas Tankōbon automáticas**: Generación e inserción opcional de portadillas divisorias de estilo minimalista entre capítulos.
* **Extracción de Capítulos (*Extract*)**: Separa rangos de páginas para conformar nuevos capítulos o transferirlos a otro volumen.
* **Organización por Colecciones**: Agrupación automática de series en el panel lateral con herramientas de ordenación alfabética y por número.

### 📝 Editor de Metadatos Estándar (`ComicInfo.xml`)
* **Aislamiento por sesión**: Cada tomo o capítulo mantiene su propio archivo de metadatos `ComicInfo.xml` independiente.
* **Edición y clonación en lote**: Copia datos compartidos (Guionista, Dibujante, Géneros, Sinopsis, Editorial, Año) a múltiples volúmenes conservando sus números individuales.
* **Inferencia inteligente**: Detección y autocompletado de Serie, Volumen y Número a partir del nombre del archivo.

### 🇰🇷 Soporte Integral para Webtoons (Manhwa)
* **Visor Cascada Vertical**: Modo de lectura vertical continuo con desplazamiento fluido.
* **Paginación segura**: Lectura por bloques para proteger la memoria gráfica en tiras kilométricas.
* **Cortador Inteligente (*Smart Slicer*)**: Trocea tiras verticales de gran altura (ej. 800 × 25.000 px) detectando automáticamente los espacios en blanco entre viñetas sin cortar diálogos ni bocadillos.

### 🇯🇵 Soporte Especial para Manga
* **Lectura Derecha a Izquierda (RTL)**: Modo de lectura nativo oriental con inversión de teclado y controles.
* **Divisor de Dobles Páginas (*Spread Splitter*)**: Corta pliegos dobles escaneados en 2 páginas individuales preservando el orden de lectura correcto.

### 🖥️ Monitor de Rendimiento en Tiempo Real (HUD)
* Panel de diagnóstico minimizable con telemetría en vivo:
  - Consumo de **CPU** y **Memoria RAM** (backend y sistema).
  - Espacio ocupado en almacenamiento temporal (*Staging*) y espacio libre en disco.
  - Detección de sesiones inactivas y herramienta de purga en un solo clic.

### 📦 Exportación Asíncrona y Optimización
* **Conversión WebP / JPEG / Formato Original**: Reduce el volumen de almacenamiento entre un 50% y un 70% preservando la nitidez visual.
* **Normalización de archivos**: Estandariza la secuencia de imágenes (`0001.webp`, `0002.webp`, etc.) para máxima compatibilidad con cualquier lector.
* **Notificación directa a Komga**: Disparo opcional de re-escaneo en la API de Komga tras finalizar la exportación.
* **Cola asíncrona**: Procesa múltiples exportaciones en segundo plano sin interrumpir la navegación.

---

## 📁 Estructura del Proyecto

```
MangaKuro/
├── backend/
│   ├── app/
│   │   ├── main.py                # Servidor FastAPI, API REST y servicio de estáticos SPA
│   │   ├── config.py              # Ajustes globales y resolución de rutas
│   │   └── services/
│   │       ├── comic_parser.py    # Extracción CBZ, CBR, ZIP, RAR, PDF y EPUB
│   │       ├── comic_info.py      # Gestor y parser de ComicInfo.xml
│   │       ├── image_processor.py # Miniaturas, rotación y división de páginas dobles
│   │       ├── webtoon_slicer.py  # Cortador inteligente de tiras verticales
│   │       ├── session_manager.py # Motor de sesiones en caliente y almacenamiento
│   │       └── exporter.py        # Compresión WebP/JPEG y empaquetador CBZ
│   ├── requirements.txt
│   └── tests/                     # Batería de pruebas automatizadas
├── frontend/
│   ├── src/
│   │   ├── components/            # Componentes React (PageGrid, Header, Sidebar, etc.)
│   │   ├── i18n/                  # Internacionalización (Español / English)
│   │   ├── theme/                 # Soporte Modo Claro y Modo Oscuro
│   │   ├── api.ts                 # Cliente HTTP con Axios
│   │   ├── version.ts             # Versión y metadatos de la aplicación
│   │   └── App.tsx                # Vista y estado principal
│   ├── package.json
│   └── vite.config.ts
├── data/
│   ├── staging/                   # Directorio de trabajo en caliente (.gitignored)
│   └── export/                    # Destino de exportación (.gitignored)
├── Dockerfile                     # Construcción multi-etapa
├── docker-compose.yml             # Orquestación de servicios
├── LICENSE                        # Licencia GNU General Public License v3.0
└── run.bat                        # Script de inicio rápido en Windows
```

---

## 📄 Licencia

Este proyecto está bajo la licencia **GNU General Public License v3.0 (GPLv3)**. Consulta el archivo [LICENSE](LICENSE) para más información.

Eres libre de usar, modificar y distribuir esta aplicación respetando los términos de la licencia GPLv3.

---

## ☕ Apoyo al Proyecto

MangaKuro es software libre y de código abierto. Si la herramienta te resulta de utilidad y deseas colaborar con su mantenimiento y desarrollo continuo, puedes invitar a un café mediante [PayPal](https://www.paypal.com/donate/?hosted_button_id=K2L2FEZ2NS6TY) o apoyar a través de GitHub Sponsors.
