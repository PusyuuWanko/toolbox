/*****************************************
  *----------------------------------
  |  ThisJsVersion: 2.3.0         |
  |  © 2021-2024 By PusyuuWanko/  |
  |  LastUpdate: 2023-11-18       |
  |  License: MIT License         |
  |  ColorCodeMatcher             |
----------------------------------*
******************************************/

window.onload = function() {
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext('2d');
  const colorCodeDisplay = document.getElementById("colorCode");
  const colorList = document.getElementById("colorList");
  const detectionFrame = document.getElementById("detectionFrame");
  const videoContainer = document.getElementById("videoContainer");
  const switchCameraButton = document.getElementById("switchCameraButton");
  const sensitivitySelect = document.getElementById("sensitivity");
  let sensitivity = parseInt(sensitivitySelect.value);
  let selectedColor = "#000000";
  let frameSize = 100;
  let frontCamera = true;

  sensitivitySelect.addEventListener("change", function() {
    sensitivity = parseInt(sensitivitySelect.value);
  });

  switchCameraButton.addEventListener('click', function() {
    frontCamera = !frontCamera;
    startCamera();
  });

  function startCamera() {
    if (window.stream) {
      window.stream.getTracks().forEach(track => {
        track.stop();
      });
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: frontCamera ? "user" : "environment" }})
      .then(function (stream) {
        video.srcObject = stream;
        window.stream = stream;
      })
      .catch(function (error) {
        if (error.name === 'NotAllowedError') {
          alert ("カメラへのアクセスが拒否されました。　カラーコードマッッチャーを使用するにはカメラへのアクセスが必要です。");
          video.src = "https://21emon.wjg.jp/SystemFolder/VideoData/Show-video.mp4";
          video.play();
        } else {
          alert ("カメラの切り替えまたはアクセスに失敗しました:" + error);
          video.src = "https://21emon.wjg.jp/SystemFolder/VideoData/Show-video.mp4";
          video.play();
        }
      });
  }
  startCamera();

  video.addEventListener("play", function() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    requestAnimationFrame(captureColorCode);
    updateFrameSize();
  });

  function updateFrameSize() {
    detectionFrame.style.width = frameSize + "px";
    detectionFrame.style.height = frameSize + "px";
  }

  function captureColorCode() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frameX = detectionFrame.getBoundingClientRect().left - videoContainer.getBoundingClientRect().left;
    const frameY = detectionFrame.getBoundingClientRect().top - videoContainer.getBoundingClientRect().top;
    const frameWidth = detectionFrame.offsetWidth;
    const frameHeight = detectionFrame.offsetHeight;

    const centerX = frameX + frameWidth / 2;
    const centerY = frameY + frameHeight / 2;

    const pixelData = ctx.getImageData(centerX, centerY, 1, 1).data;
    const detectedColor = rgbToHex(pixelData[0], pixelData[1], pixelData[2]);
    colorCodeDisplay.innerText = 'Detected Color Code: ' + detectedColor;

    if (colorWithinSensitivity(detectedColor, selectedColor, sensitivity)) {
      video.style.border = "1px solid #00ff00";
    } else {
      video.style.border = "1px solid #ff0000";
    }

    requestAnimationFrame(captureColorCode);
  }

  function colorWithinSensitivity(color1, color2, sensitivity) {
    function colorDiff(c1, c2) {
      return Math.abs(parseInt(c1, 16) - parseInt(c2, 16));
    }

    const diffR = colorDiff(color1.substring(1, 3), color2.substring(1, 3)) * 2;
    const diffG = colorDiff(color1.substring(3, 5), color2.substring(3, 5)) * 2;
    const diffB = colorDiff(color1.substring(5, 7), color2.substring(5, 7)) * 2;

    return (
      (diffR <= sensitivity && diffG <= sensitivity && diffB <= sensitivity) ||
      ((diffR / sensitivity) + (diffG / sensitivity) + (diffB / sensitivity) <= 9)
    );
  }

  detectionFrame.addEventListener("touchstart", onTouchStart);
  detectionFrame.addEventListener("mousedown", onMouseDown);
  
  function onTouchStart(e) {
    detectionFrame.style.cursor = "grabbing";
    let touch = e.touches[0];
    let shiftX = touch.clientX - detectionFrame.getBoundingClientRect().left;
    let shiftY = touch.clientY - detectionFrame.getBoundingClientRect().top;

    document.addEventListener("touchmove", onTouchMove);
    document.addEventListener("touchend", onTouchEnd);

    function onTouchMove(event) {
      let touch = event.touches[0];
      let newLeft = touch.clientX - shiftX;
      let newTop = touch.clientY - shiftY;

      newLeft = Math.min(Math.max(newLeft, 0), video.offsetWidth - frameSize);
      newTop = Math.min(Math.max(newTop, 0), video.offsetHeight - frameSize);

      detectionFrame.style.left = newLeft + "px";
      detectionFrame.style.top = newTop + "px";
    }

    function onTouchEnd() {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      detectionFrame.style.cursor = "grab";
    }
  }

  function onMouseDown(e) {
    e.preventDefault();
    detectionFrame.style.cursor = "grabbing";
    let shiftX = e.clientX - detectionFrame.getBoundingClientRect().left;
    let shiftY = e.clientY - detectionFrame.getBoundingClientRect().top;
    
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    
    function onMouseMove(event) {
      let newLeft = event.clientX - shiftX;
      let newTop = event.clientY - shiftY;
      
      newLeft = Math.min(Math.max(newLeft, 0), video.offsetWidth - frameSize);
      newTop = Math.min(Math.max(newTop, 0), video.offsetHeight - frameSize);
      
      detectionFrame.style.left = newLeft + "px";
      detectionFrame.style.top = newTop + "px";
    }
    
    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      detectionFrame.style.cursor = "grab";
    }
  }

  colorCodeDisplay.addEventListener("click", function() {
    const detectedColor = colorCodeDisplay.innerText.replace("Detected Color Code: ", "");
    selectedColor = detectedColor;
    addColorListItem(detectedColor);
  });

  function addColorListItem(color) {
    const colorListItem = document.createElement("li");
    colorListItem.textContent = "Detected Color Code (Can be selected for detection): " + color;
    colorList.appendChild(colorListItem);

    colorListItem.addEventListener("click", function() {
      selectedColor = color;
    });

    colorList.appendChild(colorListItem);
  };
  console.log(selectedColor);

  function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) | (r << 16 | (g << 8) | b)).toString(16).slice(1);
  }
};
