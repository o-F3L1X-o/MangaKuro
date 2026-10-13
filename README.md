# 📚 MangaKuro • ULTIMATE COMIC & MANGA SUITE

[![Version](https://img.shields.io/badge/version-v0.9.5--rc1-indigo.svg)](https://github.com/)
[![License: GPLv3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React_18_+_Vite-61dafb.svg)](https://react.dev)
[![Komga Ready](https://img.shields.io/badge/Komga-Ready-purple.svg)](https://komga.org)
[![Donate PayPal](https://img.shields.io/badge/Donate-PayPal-00457C.svg)](https://www.paypal.com/donate/?hosted_button_id=K2L2FEZ2NS6TY)

Aplicación web profesional, ligera y de alto rendimiento para organizar, limpiar páginas, fusionar/separar tomos y capítulos, editar metadatos `ComicInfo.xml` y optimizar archivos de cómics y manga en formatos **.CBZ, .CBR, .ZIP, .RAR, .PDF y .EPUB** antes de transferirlos a tu repositorio personal como komga o kavita.

Accesible desde cualquier dispositivo en tu red local (PC, tablet o móvil) a través de tu navegador (`http://<TU_IP>:8000`).

---

## ☕ Apoyar el proyecto

**MangaKuro** es un proyecto de código abierto libre y gratuito bajo licencia **GNU GPLv3**. Si esta herramienta te resulta de utilidad, te ahorra horas organizando tus series o simplemente deseas apoyar el proyecto, puedes colaborar con una donación voluntaria:

[![Donate with PayPal](https://img.shields.io/badge/PayPal-Donar-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.com/donate/?hosted_button_id=K2L2FEZ2NS6TY)

---

## 🚀 Inicio Rápido

### Opción 1: En Windows Nativo (Sin Docker)
Haz doble clic en el archivo:
```bat
run.bat
```
El script configurará automáticamente el entorno virtual de Python, instalará las dependencias necesarias y abrirá la aplicación en tu navegador en `http://localhost:8000` o la IP de tu red local.

---

### Opción 2: Con Docker Compose (Ideal para Servidores / NAS / Linux)
```bash
docker compose up -d --build
```
El servidor quedará corriendo en segundo plano en el puerto `8000`.
* Puedes ajustar en `docker-compose.yml` la ruta de tu biblioteca de cómics donde Komga lee los archivos para exportar directamente con un solo clic.

---

## ✨ Características Principales

### ⚡ Cero Lag: Arquitectura de Sesión en Caliente (*Staging*)
* **Edición instantánea**: Reordenar páginas mediante arrastrar y soltar (*drag & drop*), rotar 90°, cambiar portadas o eliminar páginas se guarda en milisegundos en el servidor sin recomprimir archivos pesados en cada cambio.
* **Extracción acelerada con PyMuPDF (MuPDF en C)**: Rasteriza y extrae páginas de cómics en PDF a máxima velocidad sin sobrecargar los núcleos de la CPU.
* **Virtualización con `LazyImage`**: Carga ultra-ligera basada en `IntersectionObserver`; las páginas fuera de pantalla no consumen memoria gráfica ni saturan el navegador, permitiendo abrir cómics de más de 1.000 páginas fluidamente.

### 📘 Gestión Avanzada de Tomos vs. Capítulos
* **Identificación visual clara**: Distintivos diferenciados para **Tomos Recopilatorios** (📘 morado/índigo) y **Capítulos Sueltos** (📄 ámbar/naranja).
* **Fusión de Capítulos (*Merge to Volume*)**: Selecciona múltiples capítulos y únelos en orden dentro de un tomo único.
* **Portadillas Tankōbon automáticas**: Inserta portadillas de separación entre capítulos generadas dinámicamente con número, título y tipografía minimalista.
* **Separación de Capítulos (*Extract to Chapter*)**: Extrae un rango de páginas de un tomo para crear un nuevo capítulo o transferirlas a otro tomo existente.
* **Renombrado y tipado en caliente**: Modifica la serie, número o volumen al instante con un solo clic.

### 📝 Metadatos Estándar Komga (`ComicInfo.xml`)
* **ComicInfo 100% Individual**: Cada tomo o capítulo mantiene su propio archivo de metadatos independiente sin solapamientos.
* **Edición en Lote y Clonación Inteligente**: Aplica metadatos comunes (Guionista, Dibujante, Géneros, Sinopsis, Editorial) a todos los tomos marcados respetando sus números de volumen individuales.
* **Autocompletado inteligente por nombre**: Reconoce automáticamente Serie, Volumen, Número y Scanlation a partir del nombre del archivo.

### 🇰🇷 Soporte Integral para Webtoons (Manhwa)
* **Visor Cascada Vertical Continua**: Modo de lectura sin saltos de página con desplazamiento suave.
* **Paginación en bloques de seguridad**: Divide webtoons de cientos de tiras en bloques navegables para evitar saturaciones de memoria gráfica.
* **Cortador Inteligente (*Webtoon Slicer*)**: Trocea tiras verticales de gran longitud (ej. 800 x 20.000 px) detectando automáticamente espacios en blanco entre viñetas sin cortar bocadillos ni diálogos.

### 🇯🇵 Soporte Especial para Manga
* **Dirección de Lectura Oriental (RTL)**: Navegación nativa de derecha a izquierda con inversión de controles.
* **Divisor de Dobles Páginas (*Spread Splitter*)**: Corta páginas dobles escaneadas en 2 páginas individuales respetando el orden de lectura japonés u occidental.

### 🖥️ Monitor de Rendimiento en Tiempo Real (HUD)
* Panel flotante y minimizable que monitoriza en vivo:
  - Consumo de **CPU** (total del sistema y del proceso servidor).
  - Consumo de **Memoria RAM** (sistema, backend y pestaña del navegador).
  - Espacio ocupado en **Staging** y espacio libre en disco.
  - Detección inteligente de **sesiones huérfanas** con botón de purga rápida para liberar almacenamiento en disco.

### 📦 Exportación y Optimización
* **Compresión WebP / JPG / Original**: Reduce el peso de los cómics entre un 50% y un 70% sin pérdida apreciable de nitidez visual.
* **Normalización de nombres**: Renombra internamente las páginas a secuencias numéricas estandarizadas (`0001.webp`, `0002.webp`, etc.) para máxima compatibilidad con cualquier lector o biblioteca.
* **Disparo automático de escaneo en Komga**: Notifica a la API de tu servidor Komga tras la exportación para que indexe los nuevos tomos al instante.
* **Cola de exportación en segundo plano**: Exporta múltiples cómics o series completas de manera asíncrona sin bloquear la interfaz de usuario.

---

## 📁 Estructura del Proyecto

```
APP_COMICS/
├── backend/
│   ├── app/
│   │   ├── main.py                # Servidor FastAPI, endpoints REST y servicio estático SPA
│   │   ├── config.py              # Ajustes, versión y rutas de datos
│   │   └── services/
│   │       ├── comic_parser.py    # Extracción CBZ, CBR, ZIP, RAR, PDF y EPUB
│   │       ├── comic_info.py      # Gestor y parser de ComicInfo.xml
│   │       ├── image_processor.py # Miniaturas, rotación y división de dobles páginas
│   │       ├── webtoon_slicer.py  # Cortador inteligente de tiras verticales
│   │       ├── session_manager.py # Motor de sesiones en caliente y limpieza
│   │       └── exporter.py        # Compresión WebP/JPG y empaquetador CBZ
│   ├── requirements.txt
│   └── tests/                     # Batería de pruebas automatizadas
├── frontend/
│   ├── src/
│   │   ├── components/            # Componentes React (PageGrid, Header, Sidebar, Modals, etc.)
│   │   ├── i18n/                  # Internacionalización (Español / English)
│   │   ├── theme/                 # Soporte Modo Claro y Modo Oscuro
│   │   ├── api.ts                 # Cliente HTTP con Axios
│   │   ├── version.ts             # Versión, marca y enlaces de donación
│   │   └── App.tsx                # Aplicación principal
│   ├── package.json
│   └── vite.config.ts
├── data/
│   ├── staging/                   # Directorio de trabajo en caliente
│   └── export/                    # Carpeta de exportación final para Komga
├── .github/
│   └── FUNDING.yml                # Configuración de patrocinio de GitHub Sponsors / PayPal
├── LICENSE                        # Licencia de código abierto GNU General Public License v3.0
├── Dockerfile                     # Construcción multi-etapa para Docker
├── docker-compose.yml             # Orquestación con Docker Compose
└── run.bat                        # Script de inicio en 1 clic para Windows
```

---

## 📄 Licencia

Este proyecto está distribuido bajo la **GNU General Public License v3.0 (GPLv3)**. Consulta el archivo [LICENSE](LICENSE) para más detalles.

Eres libre de utilizar, modificar y redistribuir este software respetando los términos de la licencia GPLv3.
