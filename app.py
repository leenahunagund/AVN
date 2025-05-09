import os
import cv2
import base64
import numpy as np
import time
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Define directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # Get the directory of app.py
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
OUTPUT_FOLDER = os.path.join(BASE_DIR, "outputs")
YOLO_DIR = os.path.join(BASE_DIR, "yolo_model")

# Ensure folders exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# Load YOLOv4 Model Paths
MODEL_PATH = os.path.join(YOLO_DIR, "yolov4.weights")
CONFIG_PATH = os.path.join(YOLO_DIR, "yolov4.cfg")
COCO_NAMES_PATH = os.path.join(YOLO_DIR, "coco.names")

# Check if YOLO files exist
if not (os.path.exists(MODEL_PATH) and os.path.exists(CONFIG_PATH) and os.path.exists(COCO_NAMES_PATH)):
    raise FileNotFoundError("YOLO model files are missing! Ensure yolov4.weights, yolov4.cfg, and coco.names exist.")

# Load YOLO Model
net = cv2.dnn.readNet(MODEL_PATH, CONFIG_PATH)

# Enable GPU if available
if cv2.cuda.getCudaEnabledDeviceCount() > 0:
    print("[INFO] Using GPU for inference.")
    net.setPreferableBackend(cv2.dnn.DNN_BACKEND_CUDA)
    net.setPreferableTarget(cv2.dnn.DNN_TARGET_CUDA)
else:
    print("[INFO] Running on CPU.")
    net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
    net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)

# Load COCO class labels
with open(COCO_NAMES_PATH, "r") as f:
    classes = [line.strip() for line in f.readlines()]

layer_names = net.getLayerNames()
output_layers = [layer_names[i - 1] for i in net.getUnconnectedOutLayers()]
np.random.seed(42)
colors = np.random.randint(0, 255, size=(len(classes), 3), dtype="uint8")


def allowed_file(filename):
    """Check if the uploaded file is a valid video format."""
    return filename.lower().endswith((".mp4", ".avi", ".mov", ".mkv"))


def detect_lanes(frame):
    """Detect lanes using edge detection and Hough Transform."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 50, 150)

    height, width = frame.shape[:2]
    mask = np.zeros_like(edges)

    # Define region of interest (ROI)
    polygon = np.array([[
        (50, height), (width // 2 - 50, height // 2),
        (width // 2 + 50, height // 2), (width - 50, height)
    ]])

    cv2.fillPoly(mask, polygon, 255)
    masked_edges = cv2.bitwise_and(edges, mask)

    lines = cv2.HoughLinesP(masked_edges, 1, np.pi / 180, 50, minLineLength=100, maxLineGap=50)

    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]
            cv2.line(frame, (x1, y1), (x2, y2), (0, 255, 255), 3)

    return frame


def detect_objects(frame):
    """Detect objects using YOLOv4 and return annotated frame."""
    height, width = frame.shape[:2]

    blob = cv2.dnn.blobFromImage(frame, 1 / 255.0, (416, 416), swapRB=True, crop=False)
    net.setInput(blob)
    outputs = net.forward(output_layers)

    boxes, confidences, class_ids = [], [], []

    for output in outputs:
        for detection in output:
            scores = detection[5:]
            class_id = np.argmax(scores)
            confidence = scores[class_id]
            if confidence > 0.5:
                center_x, center_y, w, h = (detection[:4] * np.array([width, height, width, height])).astype("int")
                x = int(center_x - w / 2)
                y = int(center_y - h / 2)
                boxes.append([x, y, int(w), int(h)])
                confidences.append(float(confidence))
                class_ids.append(class_id)

    indices = cv2.dnn.NMSBoxes(boxes, confidences, 0.5, 0.4)

    if len(indices) > 0:
        for i in indices.flatten():
            x, y, w, h = boxes[i]
            label = f"{classes[class_ids[i]]}: {confidences[i]:.2f}"
            color = [int(c) for c in colors[class_ids[i]]]

            cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
            cv2.putText(frame, label, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

    return frame


@app.route("/upload", methods=["POST"])
def upload_video():
    """Handle video upload and process it."""
    if "video" not in request.files:
        return jsonify({"error": "No video file provided"}), 400

    video_file = request.files["video"]
    filename = secure_filename(video_file.filename)

    if not allowed_file(filename):
        return jsonify({"error": "Invalid file format. Upload a valid video file."}), 400

    filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    video_file.save(filepath)

    print(f"[INFO] Processing video: {filename}")
    start_time = time.time()

    cap = cv2.VideoCapture(filepath)
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = max(1, int(cap.get(cv2.CAP_PROP_FPS)))

    output_filename = "output_" + filename
    output_path = os.path.join(OUTPUT_FOLDER, output_filename)

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')  # More compatible alternative
    out = cv2.VideoWriter(output_path, fourcc, fps, (frame_width, frame_height))

    frame_skip = 2  # Process every 2nd frame for optimization
    frame_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1
        if frame_count % frame_skip != 0:
            continue

        frame = detect_lanes(frame)
        frame = detect_objects(frame)

        out.write(frame)

    cap.release()
    out.release()

    end_time = time.time()
    print(f"[INFO] Processing complete in {end_time - start_time:.2f} seconds.")

    return jsonify({"message": "Processing complete!", "download_url": f"/download/{output_filename}"})


@app.route("/download/<filename>", methods=["GET"])
def download_video(filename):
    """Allow users to download processed video."""
    output_path = os.path.join(OUTPUT_FOLDER, filename)
    if os.path.exists(output_path):
        return send_file(output_path, as_attachment=True)
    return jsonify({"error": "File not found"}), 404


@app.route("/")
def index():
    return "YOLO + Lane Detection API Running!"


@socketio.on("video_frame")
def handle_video_frame(data):
    image_data = data.get("image")
    if image_data:
        try:
            nparr = np.frombuffer(base64.b64decode(image_data), np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            frame = detect_lanes(frame)
            frame = detect_objects(frame)

            _, buffer = cv2.imencode(".jpg", frame)
            processed_data = base64.b64encode(buffer).decode("utf-8")

            emit("processed_frame", processed_data)
            print("[INFO] Sent processed frame")
        except Exception as e:
            print(f"[ERROR] Processing frame failed: {e}")

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)