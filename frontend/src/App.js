import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DownloadIcon from "@mui/icons-material/Download";
import LiveTvIcon from "@mui/icons-material/LiveTv";
import { Button, Card, CardContent, CircularProgress, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css";

function App() {
  const [file, setFile] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRealTime, setIsRealTime] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null); // display annotated output
  const offscreenCanvasRef = useRef(null); // used only to capture and send
  const socket = useRef(null);
  const streamRef = useRef(null);

  const handleFileChange = (e) => setFile(e.target.files[0]);

  const handleUpload = async () => {
    if (!file) return alert("Please select a file first!");
    const formData = new FormData();
    formData.append("video", file);
    setLoading(true);
    setDownloadUrl("");

    try {
      const res = await fetch("http://localhost:5000/upload", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();
      if (result.download_url) {
        setDownloadUrl(`http://localhost:5000${result.download_url}`);
      }
    } catch (err) {
      console.error("Error uploading file:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRealTimeDetection = () => {
    if (isRealTime) stopRealTimeDetection();
    else setIsRealTime(true);
  };

  useEffect(() => {
    if (!isRealTime || !videoRef.current) return;

    const setupCameraAndSocket = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
        streamRef.current = stream;

        socket.current = io("http://localhost:5000");

        socket.current.on("processed_frame", (data) => {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
          const img = new Image();
          img.src = `data:image/jpeg;base64,${data}`;

          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            //ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, img.width, img.height);
          };
        });
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
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    socket.current?.close();
    setIsRealTime(false);
  };

  const sendFrameToServer = () => {
    if (!videoRef.current || !offscreenCanvasRef.current) return;

    const canvas = offscreenCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const { videoWidth: w, videoHeight: h } = videoRef.current;
    if (!w || !h) return;

    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(videoRef.current, 0, 0, w, h);

    const img64 = canvas.toDataURL("image/jpeg").split(",")[1];
    if (socket.current && socket.current.connected) {
      socket.current.emit("video_frame", { image: img64 });
    }
  };

  useEffect(() => {
    if (!isRealTime) return;
    const id = setInterval(sendFrameToServer, 100);
    return () => clearInterval(id);
  }, [isRealTime]);

  return (
    <div className="container">
      <Card className="card">
        <CardContent>
          <Typography variant="h4" gutterBottom className="title">
            YOLO Object &amp; Lane Detection
          </Typography>

          <Typography variant="body1" color="textSecondary">
            Upload a video or use your camera for real‑time lane and object detection.
          </Typography>

          <input type="file" accept="video/*" onChange={handleFileChange} className="input" />

          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={handleUpload}
            className="upload-button"
            disabled={loading}
          >
            {loading ? "Processing..." : "Upload & Process"}
          </Button>

          {loading && <CircularProgress className="mt-10" />}

          {downloadUrl && (
            <div className="result-container">
              <Typography variant="h6" color="success.main">
                ✅ Processing Complete!
              </Typography>

              <Button
                variant="contained"
                color="success"
                startIcon={<DownloadIcon />}
                href={downloadUrl}
                download
                className="download-button"
              >
                Download Annotated Video
              </Button>
            </div>
          )}

          <Button
            variant="contained"
            startIcon={<LiveTvIcon />}
            onClick={handleRealTimeDetection}
            className="real-time-button"
          >
            {isRealTime ? "Stop Real‑time Detection" : "Detect Real‑time"}
          </Button>

          {isRealTime && (
            <div className="video-container">
              <video ref={videoRef} autoPlay muted className="video-preview" />
              {/* Hidden canvas for capturing raw webcam frames */}
              <canvas ref={offscreenCanvasRef} style={{ display: "none" }} />
              {/* Visible canvas for showing processed annotated output */}
              <canvas ref={canvasRef} className="video-canvas" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
