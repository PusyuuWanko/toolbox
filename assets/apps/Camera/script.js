/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 1.1.0     |
  |  © 2026 By PusyuuWanko/       |
  |  License: MIT License         |
  |  PusyuuCamera                 |
----------------------------------*
******************************************/

window.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("camera-status");
  const video = document.getElementById("preview");
  const canvas = document.getElementById("capture-canvas");
  const snapshot = document.getElementById("snapshot");
  const recordedPlayback = document.getElementById("recorded-playback");
  const shutterBtn = document.getElementById("shutter-btn");
  const recordBtn = document.getElementById("record-btn");
  const retakeBtn = document.getElementById("retake-btn");
  const switchBtn = document.getElementById("switch-btn");
  const downloadLink = document.getElementById("download-link");
  const videoDownloadLink = document.getElementById("video-download-link");
  const mirrorToggle = document.getElementById("mirror-toggle");
  const recIndicator = document.getElementById("rec-indicator");
  const recTimer = document.getElementById("rec-timer");

  let currentStream = null;
  let facingMode = "environment";
  let hasMultipleCameras = false;

  let recordCanvas = null;
  let recordCtx = null;
  let recordRafId = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordAudioStream = null;
  let recordMirror = true;
  let recordStartTime = 0;
  let recTimerId = null;
  let recordedVideoUrl = null;

  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
    statusEl.textContent = "ご利用のブラウザまたはアプリでは、カメラを利用できません。";
    return;
  }

  function applyMirrorPreview() {
    video.classList.toggle("mirrored", mirrorToggle.checked);
  }

  mirrorToggle.addEventListener("change", applyMirrorPreview);
  applyMirrorPreview();

  function stopStream() {
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
      currentStream = null;
    }
  }

  async function startCamera() {
    stopStream();
    statusEl.textContent = "カメラへのアクセスを準備しています...";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false
      });
      currentStream = stream;
      video.srcObject = stream;
      statusEl.textContent = "";
      await checkMultipleCameras();
    } catch (error) {
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        statusEl.textContent = "カメラへのアクセスが拒否されました。撮影を行えません。";
      } else if (error.name === "NotFoundError") {
        statusEl.textContent = "ご利用のデバイスにはカメラが見つかりませんでした。";
      } else {
        statusEl.textContent = "カメラの起動中にエラーが発生しました。エラー: " + error.message;
      }
    }
  }

  async function checkMultipleCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      hasMultipleCameras = videoInputs.length > 1;
      switchBtn.style.display = hasMultipleCameras ? "inline-block" : "none";
    } catch (error) {
      hasMultipleCameras = false;
      switchBtn.style.display = "none";
    }
  }

  switchBtn.addEventListener("click", () => {
    facingMode = facingMode === "environment" ? "user" : "environment";
    startCamera();
  });

  function timestampLabel() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, "0");
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  function enterLiveMode() {
    snapshot.style.display = "none";
    recordedPlayback.style.display = "none";
    recordedPlayback.pause();
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
      recordedVideoUrl = null;
    }
    video.style.display = "block";
    shutterBtn.style.display = "inline-block";
    recordBtn.style.display = "inline-block";
    mirrorToggle.disabled = false;
    if (hasMultipleCameras) {
      switchBtn.style.display = "inline-block";
    }
    retakeBtn.style.display = "none";
    downloadLink.style.display = "none";
    videoDownloadLink.style.display = "none";
  }

  shutterBtn.addEventListener("click", () => {
    if (!currentStream) {
      return;
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      return;
    }
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.save();
    if (mirrorToggle.checked) {
      context.translate(width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, width, height);
    context.restore();

    const dataUrl = canvas.toDataURL("image/png");
    snapshot.src = dataUrl;
    downloadLink.href = dataUrl;
    downloadLink.download = `photo_${timestampLabel()}.png`;

    video.style.display = "none";
    snapshot.style.display = "block";
    shutterBtn.style.display = "none";
    recordBtn.style.display = "none";
    switchBtn.style.display = "none";
    mirrorToggle.disabled = true;
    retakeBtn.style.display = "inline-block";
    downloadLink.style.display = "inline-block";
  });

  function pickRecorderMimeType() {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    for (const type of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "";
  }

  function drawRecordFrame() {
    if (!recordCtx) {
      return;
    }
    recordCtx.save();
    if (recordMirror) {
      recordCtx.translate(recordCanvas.width, 0);
      recordCtx.scale(-1, 1);
    }
    recordCtx.drawImage(video, 0, 0, recordCanvas.width, recordCanvas.height);
    recordCtx.restore();
    recordRafId = requestAnimationFrame(drawRecordFrame);
  }

  function updateRecTimer() {
    const elapsedSec = Math.floor((Date.now() - recordStartTime) / 1000);
    const m = Math.floor(elapsedSec / 60).toString().padStart(2, "0");
    const s = (elapsedSec % 60).toString().padStart(2, "0");
    recTimer.textContent = `${m}:${s}`;
  }

  async function startRecording() {
    if (!currentStream || !window.MediaRecorder) {
      if (!window.MediaRecorder) {
        statusEl.textContent = "ご利用のブラウザでは動画撮影に対応していません。";
      }
      return;
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      return;
    }

    recordMirror = mirrorToggle.checked;
    recordCanvas = document.createElement("canvas");
    recordCanvas.width = width;
    recordCanvas.height = height;
    recordCtx = recordCanvas.getContext("2d");

    try {
      recordAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (error) {
      recordAudioStream = null;
      statusEl.textContent = "マイクへのアクセスが許可されなかったため、映像のみ録画します。";
    }

    const canvasStream = recordCanvas.captureStream(30);
    const tracks = canvasStream.getVideoTracks().slice();
    if (recordAudioStream) {
      recordAudioStream.getAudioTracks().forEach((track) => tracks.push(track));
    }
    const combinedStream = new MediaStream(tracks);

    const mimeType = pickRecorderMimeType();
    recordedChunks = [];
    try {
      mediaRecorder = mimeType
        ? new MediaRecorder(combinedStream, { mimeType })
        : new MediaRecorder(combinedStream);
    } catch (error) {
      statusEl.textContent = "動画撮影の開始に失敗しました。エラー: " + error.message;
      if (recordAudioStream) {
        recordAudioStream.getTracks().forEach((track) => track.stop());
        recordAudioStream = null;
      }
      return;
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };
    mediaRecorder.onstop = onRecordingStopped;

    mediaRecorder.start();
    drawRecordFrame();

    recordStartTime = Date.now();
    recIndicator.style.display = "block";
    updateRecTimer();
    recTimerId = setInterval(updateRecTimer, 500);

    recordBtn.textContent = "⏹ 停止";
    shutterBtn.style.display = "none";
    switchBtn.style.display = "none";
    mirrorToggle.disabled = true;
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  }

  function onRecordingStopped() {
    if (recordRafId) {
      cancelAnimationFrame(recordRafId);
      recordRafId = null;
    }
    if (recTimerId) {
      clearInterval(recTimerId);
      recTimerId = null;
    }
    recIndicator.style.display = "none";
    if (recordAudioStream) {
      recordAudioStream.getTracks().forEach((track) => track.stop());
      recordAudioStream = null;
    }
    recordCtx = null;
    recordCanvas = null;

    recordBtn.textContent = "🎥 動画";

    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "video/webm" });
    recordedChunks = [];
    recordedVideoUrl = URL.createObjectURL(blob);

    recordedPlayback.src = recordedVideoUrl;
    videoDownloadLink.href = recordedVideoUrl;
    videoDownloadLink.download = `video_${timestampLabel()}.webm`;

    video.style.display = "none";
    recordedPlayback.style.display = "block";
    shutterBtn.style.display = "none";
    recordBtn.style.display = "none";
    switchBtn.style.display = "none";
    retakeBtn.style.display = "inline-block";
    videoDownloadLink.style.display = "inline-block";
  }

  recordBtn.addEventListener("click", () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      startRecording();
    } else {
      stopRecording();
    }
  });

  retakeBtn.addEventListener("click", enterLiveMode);

  window.addEventListener("beforeunload", () => {
    stopStream();
    if (recordAudioStream) {
      recordAudioStream.getTracks().forEach((track) => track.stop());
    }
  });

  startCamera();
});
