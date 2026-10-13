# Etapa 1: Compilar frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Etapa 2: Backend Python con PyMuPDF y FastAPI
FROM python:3.11-slim
WORKDIR /app

# Instalar dependencias necesarias del sistema para procesamiento de imágenes
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copiar backend
COPY backend/app ./app

# Copiar frontend compilado
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Crear carpetas de datos
RUN mkdir -p /app/data/staging /app/data/export

EXPOSE 8000
ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
