#!/usr/bin/env bash
set -e

echo "=================================================="
echo "    MangaKuro - Actualizador de Contenedor"
echo "=================================================="
echo "Descargando la última versión desde GitHub Container Registry..."
docker compose pull mangakuro
docker compose up -d --remove-orphans mangakuro
echo ""
echo "¡MangaKuro actualizado y ejecutándose en su última versión!"
