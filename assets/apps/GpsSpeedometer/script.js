/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 1.0.0     |
  |  © 2026 By PusyuuWanko/       |
  |  License: MIT License         |
  |  PusyuuGpsSpeedometer         |
----------------------------------*
******************************************/

window.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("speedo-status");
  const gauge = document.getElementById("gauge");
  const speedValueEl = document.getElementById("speed-value");
  const maxSpeedEl = document.getElementById("max-speed");
  const avgSpeedEl = document.getElementById("avg-speed");
  const mphSpeedEl = document.getElementById("mph-speed");
  const accuracyEl = document.getElementById("accuracy");
  const startBtn = document.getElementById("start-btn");
  const stopBtn = document.getElementById("stop-btn");
  const resetBtn = document.getElementById("reset-btn");

  const GAUGE_MAX_KMH = 160;
  // 生のGPS更新は間隔が不揃いで値も飛ぶため、表示だけ毎フレーム補間してなめらかに見せる
  const SMOOTHING_PER_SEC = 8; // 大きいほど追従が速い(=カクつきやすい)、小さいほど滑らかだが遅延が増える

  let watchId = null;
  let lastPosition = null;
  let maxSpeedKmh = 0;
  let totalDistanceMeters = 0;
  let totalTimeMs = 0;

  let targetKmh = 0;
  let displayedKmh = 0;
  let lastAccuracyMeters = null;
  let animFrameId = null;
  let lastFrameTime = null;

  if (!("geolocation" in navigator)) {
    statusEl.textContent = "ご利用のデバイスまたはアプリでは、位置情報を取得できません。";
    startBtn.disabled = true;
    return;
  }

  function toRad(value) {
    return (value * Math.PI) / 180;
  }

  // ハーバサイン公式で2点間の距離(m)を算出
  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function updateGauge(kmh) {
    const ratio = Math.min(Math.max(kmh / GAUGE_MAX_KMH, 0), 1);
    const deg = ratio * 360;
    gauge.style.background = `conic-gradient(#0aff0a ${deg}deg, rgba(255,255,255,0.08) ${deg}deg, rgba(255,255,255,0.08) 360deg)`;
  }

  function renderVisual(kmh) {
    speedValueEl.textContent = kmh.toFixed(1);
    mphSpeedEl.textContent = (kmh * 0.621371).toFixed(1) + " mph";
    updateGauge(kmh);
  }

  function updateStats(kmh, accuracyMeters) {
    if (kmh > maxSpeedKmh) {
      maxSpeedKmh = kmh;
      maxSpeedEl.textContent = maxSpeedKmh.toFixed(1) + " km/h";
    }

    if (totalTimeMs > 0) {
      const avgKmh = (totalDistanceMeters / (totalTimeMs / 1000)) * 3.6;
      avgSpeedEl.textContent = avgKmh.toFixed(1) + " km/h";
    }

    if (accuracyMeters != null) {
      accuracyEl.textContent = accuracyMeters.toFixed(0) + " m";
    }
  }

  // 表示用の値をtargetKmhへ毎フレーム指数補間して滑らかに追従させる
  function animateSpeed(now) {
    if (lastFrameTime == null) {
      lastFrameTime = now;
    }
    const dtSec = Math.min((now - lastFrameTime) / 1000, 0.25);
    lastFrameTime = now;

    const diff = targetKmh - displayedKmh;
    if (Math.abs(diff) < 0.05) {
      displayedKmh = targetKmh;
    } else {
      const alpha = 1 - Math.exp(-SMOOTHING_PER_SEC * dtSec);
      displayedKmh += diff * alpha;
    }
    renderVisual(displayedKmh);
    animFrameId = requestAnimationFrame(animateSpeed);
  }

  function startAnimation() {
    if (animFrameId == null) {
      lastFrameTime = null;
      animFrameId = requestAnimationFrame(animateSpeed);
    }
  }

  function stopAnimation() {
    if (animFrameId != null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  function handlePosition(position) {
    statusEl.textContent = "";
    const { latitude, longitude, speed, accuracy } = position.coords;
    const timestamp = position.timestamp;

    let kmh = 0;

    if (typeof speed === "number" && speed !== null && !Number.isNaN(speed)) {
      kmh = speed * 3.6;
      if (lastPosition) {
        const distance = haversineDistance(lastPosition.latitude, lastPosition.longitude, latitude, longitude);
        const deltaTime = timestamp - lastPosition.timestamp;
        if (deltaTime > 0) {
          totalDistanceMeters += distance;
          totalTimeMs += deltaTime;
        }
      }
    } else if (lastPosition) {
      const distance = haversineDistance(lastPosition.latitude, lastPosition.longitude, latitude, longitude);
      const deltaTime = timestamp - lastPosition.timestamp;
      if (deltaTime > 0) {
        kmh = (distance / (deltaTime / 1000)) * 3.6;
        totalDistanceMeters += distance;
        totalTimeMs += deltaTime;
      }
    }

    targetKmh = kmh;
    lastAccuracyMeters = accuracy;
    updateStats(kmh, accuracy);
    lastPosition = { latitude, longitude, timestamp };
  }

  function handleError(error) {
    if (error.code === error.PERMISSION_DENIED) {
      statusEl.textContent = "位置情報の取得が拒否されました。速度計を利用できません。";
    } else {
      statusEl.textContent = "位置情報の取得中にエラーが発生しました。エラーコード: " + error.code;
    }
    stopWatching();
  }

  function startWatching() {
    if (watchId !== null) {
      return;
    }
    statusEl.textContent = "位置情報を取得中...";
    watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    });
    startBtn.style.display = "none";
    stopBtn.style.display = "inline-block";
    startAnimation();
  }

  function stopWatching() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    startBtn.style.display = "inline-block";
    stopBtn.style.display = "none";
    stopAnimation();
  }

  function resetStats() {
    lastPosition = null;
    maxSpeedKmh = 0;
    totalDistanceMeters = 0;
    totalTimeMs = 0;
    targetKmh = 0;
    displayedKmh = 0;
    lastAccuracyMeters = null;
    speedValueEl.textContent = "0.0";
    mphSpeedEl.textContent = "0.0 mph";
    maxSpeedEl.textContent = "0.0 km/h";
    avgSpeedEl.textContent = "0.0 km/h";
    accuracyEl.textContent = "- m";
    updateGauge(0);
  }

  startBtn.addEventListener("click", startWatching);
  stopBtn.addEventListener("click", stopWatching);
  resetBtn.addEventListener("click", resetStats);

  window.addEventListener("beforeunload", () => {
    stopWatching();
    stopAnimation();
  });
});
