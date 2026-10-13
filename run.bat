@echo off
title Servidor Web MangaKuro - ULTIMATE COMIC ^& MANGA SUITE

echo ========================================================
echo       MANGAKURO - ULTIMATE COMIC ^& MANGA SUITE
echo ========================================================
echo.

cd /d "%~dp0"

:: Verificar entorno virtual
if not exist "backend\venv\Scripts\python.exe" (
    echo [1/3] Creando entorno virtual de Python...
    python -m venv backend\venv
    if errorlevel 1 (
        echo [ERROR] No se pudo crear el entorno virtual. Verifica que Python este instalado.
        pause
        exit /b 1
    )
)

:: Instalar dependencias si faltan
echo [2/3] Verificando dependencias...
backend\venv\Scripts\pip install -q -r backend\requirements.txt

:: Obtener IP local para mostrar al usuario
echo [3/3] Iniciando servidor web accesible en tu red local...
echo.
echo ========================================================
echo  Servidor MangaKuro iniciado. Puedes acceder desde:
echo.
echo   * Este ordenador:   http://localhost:8000
for /f "usebackq tokens=*" %%a in (`backend\venv\Scripts\python.exe -c "import socket; ips = {info[4][0] for info in socket.getaddrinfo(socket.gethostname(), None) if ':' not in info[4][0] and not info[4][0].startswith('127.')}; [print(ip) for ip in sorted(ips)]" 2^>nul`) do (
    if not "%%a"=="" (
        echo   * Desde tu red:    http://%%a:8000
    )
)
echo.
echo  Presiona Ctrl + C en esta ventana para detener el servidor.
echo ========================================================
echo.

cd backend
venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

pause
