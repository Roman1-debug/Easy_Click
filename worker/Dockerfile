FROM python:3.11-slim

# System deps for Chromium (Playwright) + general tools
RUN apt-get update && apt-get install -y \
    wget curl ca-certificates gnupg \
    libnss3 libnspr4 libdbus-1-3 \
    libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libasound2 \
    libx11-6 libxext6 libxshmfence1 \
    fonts-liberation libappindicator3-1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install only Chromium (smallest footprint)
RUN playwright install chromium

COPY . .

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
