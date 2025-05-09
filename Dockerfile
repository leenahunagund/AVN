FROM nvidia/cuda:11.7.1-cudnn8-runtime-ubuntu22.04

# Install OS packages
RUN apt-get update && apt-get install -y \
    python3 python3-pip git curl libsm6 libxext6 libxrender-dev ffmpeg

# Set work directory
WORKDIR /app

# Copy files
COPY . /app

# Install Python dependencies
RUN pip3 install --upgrade pip
RUN pip3 install -r requirements.txt

# Expose port
EXPOSE 5000

# Run the app
CMD ["python3", "app.py"]
