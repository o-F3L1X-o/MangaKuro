@echo off
title MangaKuro - Actualizador de Contenedor Docker
echo ==================================================
echo     MangaKuro - Actualizador de Contenedor
echo ==================================================
echo Descargando la ultima version desde GitHub Container Registry...
docker compose pull mangakuro
docker compose up -d --remove-orphans mangakuro
echo.
echo !MangaKuro actualizado y ejecutandose en su ultima version!
pause
