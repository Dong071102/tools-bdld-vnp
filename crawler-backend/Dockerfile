# ── Stage: runtime ────────────────────────────────────
FROM python:3.11-slim

# Tránh các prompt interactive khi cài package
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Cài dependencies hệ thống cần cho pymssql và tzdata để đồng bộ múi giờ Việt Nam
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       gcc \
       freetds-dev \
       freetds-bin \
       libssl-dev \
       tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Ho_Chi_Minh

# Cài Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ source code
COPY . .

# Port mà FastAPI/uvicorn lắng nghe
EXPOSE 8000

# Chạy app (DB_SERVER, DB_USER, DB_PASSWORD... sẽ được truyền qua env của Portainer)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
