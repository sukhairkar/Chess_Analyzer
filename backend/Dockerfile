# Use an official lightweight Python image
FROM python:3.10-slim

# Set the working directory
WORKDIR /app

# Ensure /usr/games is in PATH (where Stockfish is installed on Debian)
ENV PATH="/usr/games:${PATH}"

# Install Stockfish (Linux binary) via apt
RUN apt-get update && apt-get install -y \
    stockfish \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container
COPY requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend code
COPY . .

# Expose the standard port (useful for local testing)
EXPOSE 8000

# Run Uvicorn. Cloud providers will usually assign a PORT environment variable dynamically.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
