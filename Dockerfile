# Etapa 1: Compilar frontend React
FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Etapa 2: Backend Python con FastAPI y herramientas de procesamiento de cómics
FROM python:3.11-slim
WORKDIR /app

# Instalar herramientas del sistema: p7zip para CBR/RAR/7Z y Tesseract OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    p7zip-full \
    tesseract-ocr \
    tesseract-ocr-spa \
    tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código del backend
COPY backend/app ./app

# Copiar frontend compilado desde la etapa 1
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Crear directorios de datos para volúmenes
RUN mkdir -p /app/data/staging /app/data/export

EXPOSE 8000
ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
