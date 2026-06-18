FROM python:3.10-slim

WORKDIR /app

# Install git and build essentials
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Use a longer timeout for slow networks
RUN pip install --no-cache-dir --default-timeout=1000 -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python", "main.py"]
