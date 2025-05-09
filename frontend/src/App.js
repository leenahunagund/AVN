import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DownloadIcon from "@mui/icons-material/Download";
import LiveTvIcon from "@mui/icons-material/LiveTv";
import { Button, Card, CardContent, CircularProgress, Typography } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";

function App() {
  const [file, setFile] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRealTime, setIsRealTime] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const socket = useRef(null);
  const streamRef = useRef(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a file first!");
      return;
    }

    const formData = new FormData();
    formData.append("video", file);

    setLoading(true);
    setDownloadUrl("");

    try {
      const response = await fetch("http://localhost:5000/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      if (result.download_url) {
        setDownloadUrl(`http://localhost:5000${result.download_url}`);
      }
    } catch (error) {
      console.error("Error uploading file:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRealTimeDetection = () => {
    if (!isRealTime) {
      setIsRealTime(true); // triggers useEffect
    } else {
      stopRealTimeDetection();
    }
  };

  // 💡 Start detection after videoRef is available
  useEffect(() => {
    if (!isRealTime || !videoRef.current) return;

    const setupCameraAndSocket = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
        streamRef.current = stream;

        // Setup WebSocket
        socket.current = new WebSocket("ws://localhost:5000");
        socket.current.onopen = () => {
          console.log("WebSocket connected");
        };

        socket.current.onmessage = (event) => {
          const processedFrame = event.data;
          const image = new Image();
          image.src = `data:image/jpeg;base64,${processedFrame}`;
          image.onload = () => {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          };
        };
      } catch (err) {
        alert("Could not access the camera.");
        console.error(err);
        setIsRealTime(false);
      }
    };

    setupCameraAndSocket();

    return () => stopRealTimeDetection();
  }, [isRealTime]);

  const stopRealTimeDetection = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (socket.current) {
      socket.current.close();
    }
    setIsRealTime(false);
  };

  const sendFrameToServer = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const width = videoRef.current.videoWidth;
    const height = videoRef.current.videoHeight;
    const imageData = canvas.toDataURL("image/jpeg");

    if (width === 0 || height === 0) return;

    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(videoRef.current, 0, 0, width, height);
    const frameData = canvas.toDataURL("image/jpeg").split(",")[1];

    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      socket.current.emit("video_frame", { image: imageData });
    }
  };

  useEffect(() => {
    if (isRealTime) {
      const interval = setInterval(sendFrameToServer, 100);
      return () => clearInterval(interval);
    }
  }, [isRealTime]);

  return (
    <div style={styles.container}>
      <Card style={styles.card}>
        <CardContent>
          <Typography variant="h4" gutterBottom style={{ fontWeight: "bold" }}>
            YOLO Object & Lane Detection
          </Typography>

          <Typography variant="body1" color="textSecondary">
            Upload a video or use your camera for real-time lane and object detection.
          </Typography>

          <input
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            style={styles.input}
          />

          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={handleUpload}
            style={styles.uploadButton}
            disabled={loading}
          >
            {loading ? "Processing..." : "Upload & Process"}
          </Button>

          {loading && <CircularProgress style={{ marginTop: 10 }} />}

          {downloadUrl && (
            <div style={{ marginTop: 20 }}>
              <Typography variant="h6" color="success.main">
                ✅ Processing Complete!
              </Typography>

              <Button
                variant="contained"
                color="success"
                startIcon={<DownloadIcon />}
                href={downloadUrl}
                download
                style={styles.downloadButton}
              >
                Download Annotated Video
              </Button>
            </div>
          )}

          <Button
            variant="contained"
            startIcon={<LiveTvIcon />}
            onClick={handleRealTimeDetection}
            style={styles.realTimeButton}
          >
            {isRealTime ? "Stop Real-time Detection" : "Detect Real-time"}
          </Button>

          {isRealTime && (
            <div style={{ marginTop: 20, position: "relative" }}>
              <video ref={videoRef} autoPlay muted style={styles.video}></video>
              <canvas ref={canvasRef} style={styles.canvas}></canvas>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Styles
const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh",
    backgroundColor: "#f4f4f4",
  },
  card: {
    padding: "30px",
    width: "500px",
    textAlign: "center",
    boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.1)",
    backgroundColor: "#ffffff",
    borderRadius: "10px",
  },
  input: {
    display: "block",
    margin: "20px auto",
  },
  uploadButton: {
    backgroundColor: "#1976D2",
    color: "#ffffff",
    fontWeight: "bold",
    marginTop: 10,
  },
  downloadButton: {
    marginTop: 10,
    fontWeight: "bold",
  },
  realTimeButton: {
    backgroundColor: "#28a745",
    color: "#ffffff",
    fontWeight: "bold",
    marginTop: 20,
  },
  video: {
    width: "100%",
    height: "auto",
    borderRadius: "10px",
  },
  canvas: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  },
};

export default App;
