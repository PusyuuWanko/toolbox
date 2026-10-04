/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 2.2.3     |
  |  © 2021-2024 By PusyuuWanko/  |
  |  LastUpdate: 2024-02-17       |
  |  License: MIT License         |
  |  PusyuuTenki                  |
----------------------------------*
******************************************/

window.addEventListener("DOMContentLoaded", ()=> {
  // リロードボタン
  let reloadButton = document.getElementById("reload");
  if (reloadButton) {
    reloadButton.addEventListener("click", function() {
      location.reload();
    });
  }

  // デバイスからタイムゾーンを取得
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // 表示するエレメント
  const weatherContainer = document.getElementById("aweather-container");
  const weeklyWeatherContainer = document.getElementById("weekly-weather-container");

  // ユーザーのデバイスから位置情報を取得
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      function(position) {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone; // ユーザーのタイムゾーンを取得するコードを追加

        //const openMeteoApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,snow_depth,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,uv_index_clear_sky_max,precipitation_sum,precipitation_hours,precipitation_probability_max&timezone=${userTimezone}`;

        const openMeteoApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relativehumidity_2m,dewpoint_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,snow_depth,uv_index,uv_index_clear_sky,cape,freezinglevel_height,weathercode&daily=weathercode,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,uv_index_max,uv_index_clear_sky_max,precipitation_sum,sunrise,sunset&timezone=${userTimezone}`;

        fetch(openMeteoApiUrl)
          .then((response) => {
            if (!response.ok) {
              throw new Error("Network response was not ok.");
            }
            return response.json();
          })
          .then((data) => {
            displayWeatherData(data); // 天気情報を表示する関数
            displayWeeklyWeather(data); // 週間の天気情報を表示する関数
          })
          .catch((error) => {
            alert("データの取得に失敗しました。再読み込みをしてください。エラー: " + error.message);
            weatherContainer.innerHTML = "データの取得に失敗しました。再読み込みをしてください。エラー: " + error.message;
            weeklyWeatherContainer.innerHTML = "";
          });
      },
      function(error) {
        if (error.code === error.PERMISSION_DENIED) {
          alert("位置情報の取得が拒否されました、天気予報の表示を行えません。");
          weatherContainer.innerHTML = "位置情報の取得が拒否されました、天気予報の表示を行えません。";
          weeklyWeatherContainer.innerHTML = "";
        } else {
          alert("位置情報の取得中にエラーが発生しました。エラーコード: " + error.code);
          weatherContainer.innerHTML = "位置情報の取得中にエラーが発生しました。エラーコード: " + error.code;
          weeklyWeatherContainer.innerHTML = "";
        }
      }
    );
  } else {
    alert("ご利用のデバイスまたはアプリでは、位置情報を取得できません。");
    weatherContainer.innerHTML = "ご利用のデバイスまたはアプリでは、位置情報を取得できません。";
    weeklyWeatherContainer.innerHTML = "";
  }

  // 天気のロジック
  let todayWeatherData = null;
  let todayHourOffset = new Date().getHours();

  function displayWeatherData(data) {
    todayWeatherData = data;
    todayHourOffset = new Date().getHours();
    renderTodayWeather();
  }

  function renderTodayWeather() {
    const data = todayWeatherData;
    const hour = todayHourOffset;
    // 必要なデータを取得
    const temperature = data.hourly.temperature_2m[hour];
    const relativeHumidity = data.hourly.relativehumidity_2m[hour];
    const dewpoint = data.hourly.dewpoint_2m[hour];
    const apparentTemperature = data.hourly.apparent_temperature[hour];
    const precipitationProbability = data.hourly.precipitation_probability[hour];
    const precipitation = data.hourly.precipitation[hour];
    const weatherCode = data.hourly.weathercode[hour];
    const rain = data.hourly.rain[hour];
    const showers = data.hourly.showers[hour];
    const snowfall = data.hourly.snowfall[hour];
    const snowDepth = data.hourly.snow_depth[hour];
    const uvIndex = data.hourly.uv_index[hour];
    const uvIndexClearSky = data.hourly.uv_index_clear_sky[hour];
    const cape = data.hourly.cape[hour];
    const freezingLevelHeight = data.hourly.freezinglevel_height[hour];

    const weatherDescription = getWeatherDescription(weatherCode);

    // HTMLにデータを表示
    weatherContainer.innerHTML = `
    <h1>天気予報</h1>
    <div id="today-hour-nav">
      <button type="button" id="today-prev-btn" ${hour <= 0 ? "disabled" : ""}>◀ 前の時間</button>
      <p>予報時刻：${hour}時</p>
      <button type="button" id="today-next-btn" ${hour >= 23 ? "disabled" : ""}>次の時間 ▶</button>
    </div>
    <h3>今日の天気は ${weatherDescription} です。天気コード: ${weatherCode}</h3>
    <p>気温: ${temperature}°C</p>
    <p>湿度: ${relativeHumidity}%</p>
    <p>露点: ${dewpoint}°C</p>
    <p>体感温度: ${apparentTemperature}°C</p>
    <p>降水確率: ${precipitationProbability}%</p>
    <p>降水量: ${precipitation}mm</p>
    <p>雨量: ${rain}mm</p>
    <p>にわか雨量: ${showers}mm</p>
    <p>降雪量: ${snowfall}cm</p>
    <p>積雪量: ${snowDepth}m</p>
    <p>UV指数: ${uvIndex}</p>
    <p>クリアスカイUV指数: ${uvIndexClearSky}</p>
    <p>CAPE: ${cape}J/kg</p>
    <p>凍結レベル高度: ${freezingLevelHeight}m</p>
  `;

    const prevBtn = document.getElementById("today-prev-btn");
    const nextBtn = document.getElementById("today-next-btn");
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        todayHourOffset = Math.max(0, todayHourOffset - 1);
        renderTodayWeather();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        todayHourOffset = Math.min(23, todayHourOffset + 1);
        renderTodayWeather();
      });
    }
  }

  // 一週間の天気情報を表示
  function displayWeeklyWeather(data) {
    if (data.daily && data.daily.temperature_2m_min && data.daily.temperature_2m_max) {
      const daily = data.daily;
      weeklyWeatherContainer.innerHTML = "<h2>一週間の天気予報</h2>";
      const newDiv = document.createElement('div');
      newDiv.classList.add("flex");
      // 一週間分の天気情報を表示
      for (let i = 1; i < daily.temperature_2m_min.length; i++) {
        const date = new Date(daily.time[i]);
        const minTemperature = daily.temperature_2m_min[i];
        const maxTemperature = daily.temperature_2m_max[i];
        const weatherCode = daily.weathercode[i];
        const precipitationSum = daily.precipitation_sum[i];
        const sunrise = formatTime(daily.sunrise[i]);
        const sunset = formatTime(daily.sunset[i]);
        const uvIndexMax = daily.uv_index_max[i];
        const uvIndexClearSkyMax = daily.uv_index_clear_sky_max[i];

        const weatherDescription = getWeatherDescription(weatherCode);

        newDiv.innerHTML += `
          <div class="weekly" data-day-index="${i}">
            <p>${formatDate(date)} の天気は ${weatherDescription} です。天気コード: ${weatherCode}</p>
            <p>最低気温: ${minTemperature}°C</p>
            <p>最高気温: ${maxTemperature}°C</p>
            <p>降水量合計: ${precipitationSum}mm</p>
            <p>日の出: ${sunrise}</p>
            <p>日の入: ${sunset}</p>
            <p>UV指数最大: ${uvIndexMax}</p>
            <p>クリアスカイUV指数最大: ${uvIndexClearSkyMax}</p>
          </div>
        `;
         weeklyWeatherContainer.appendChild(newDiv)
      }

      // 日ごとのカードをクリックすると、その日の時間別詳細を前後ボタンで見られるようにする
      newDiv.querySelectorAll(".weekly").forEach((card) => {
        card.addEventListener("click", () => {
          const dayIndex = parseInt(card.getAttribute("data-day-index"), 10);
          openHourlyModal(data, dayIndex);
        });
      });
    } else {
      alert("一週間の天気情報が取得できませんでした。");
    }
  }

  // 時間別詳細モーダル（前の時間／次の時間ボタンで切り替え）
  let hourlyModalOverlay = null;
  let hourlyModalState = { data: null, dayIndex: 1, hourOffset: 0 };

  function buildHourlyModal() {
    const overlay = document.createElement("div");
    overlay.id = "hourly-modal-overlay";
    overlay.innerHTML = `
      <div id="hourly-modal-box">
        <button type="button" id="hourly-modal-close">✕</button>
        <h3 id="hourly-modal-date"></h3>
        <div id="hourly-modal-body"></div>
        <div id="hourly-modal-nav">
          <button type="button" id="hourly-modal-prev">◀ 前の時間</button>
          <span id="hourly-modal-hourlabel"></span>
          <button type="button" id="hourly-modal-next">次の時間 ▶</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector("#hourly-modal-close").addEventListener("click", () => {
      overlay.style.display = "none";
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        overlay.style.display = "none";
      }
    });
    overlay.querySelector("#hourly-modal-prev").addEventListener("click", () => {
      changeHourlyOffset(-1);
    });
    overlay.querySelector("#hourly-modal-next").addEventListener("click", () => {
      changeHourlyOffset(1);
    });

    return overlay;
  }

  function changeHourlyOffset(delta) {
    hourlyModalState.hourOffset = Math.min(23, Math.max(0, hourlyModalState.hourOffset + delta));
    renderHourlyModal();
  }

  function renderHourlyModal() {
    const { data, dayIndex, hourOffset } = hourlyModalState;
    const hourly = data.hourly;
    const index = dayIndex * 24 + hourOffset;

    const date = new Date(data.daily.time[dayIndex]);
    hourlyModalOverlay.querySelector("#hourly-modal-date").textContent = formatDate(date);
    hourlyModalOverlay.querySelector("#hourly-modal-hourlabel").textContent = `${hourOffset}時`;

    const weatherCode = hourly.weathercode[index];
    const weatherDescription = getWeatherDescription(weatherCode);

    hourlyModalOverlay.querySelector("#hourly-modal-body").innerHTML = `
      <p>天気: ${weatherDescription}（天気コード: ${weatherCode}）</p>
      <p>気温: ${hourly.temperature_2m[index]}°C</p>
      <p>体感温度: ${hourly.apparent_temperature[index]}°C</p>
      <p>降水確率: ${hourly.precipitation_probability[index]}%</p>
      <p>降水量: ${hourly.precipitation[index]}mm</p>
      <p>降雪量: ${hourly.snowfall[index]}cm</p>
      <p>UV指数: ${hourly.uv_index[index]}</p>
    `;

    hourlyModalOverlay.querySelector("#hourly-modal-prev").disabled = hourOffset <= 0;
    hourlyModalOverlay.querySelector("#hourly-modal-next").disabled = hourOffset >= 23;
  }

  function openHourlyModal(data, dayIndex) {
    if (!hourlyModalOverlay) {
      hourlyModalOverlay = buildHourlyModal();
    }
    hourlyModalState = { data, dayIndex, hourOffset: 0 };
    renderHourlyModal();
    hourlyModalOverlay.style.display = "flex";
  }

  function getWeatherDescription(weatherCode) {
    switch (weatherCode) {
      case 0:
        return "🌞"; // Cloud development not observed or not observable
      case 1:
        return "🌥️"; // Clouds generally dissolving or becoming less developed
      case 2:
        return "☁️"; // State of sky on the whole unchanged
      case 3:
        return "🌦️"; // Clouds generally forming or developing
      case 4:
      case 5:
        return "🌫️"; // Haze, dust, sand, or smoke
      case 6:
        return "🌫️🏭"; // Visibility reduced by industrial smoke
      case 7:
      case 8:
      case 9:
        return "🌫️🌋"; // Duststorms or sandstorms
      case 10:
        return "🌫️"; // Mist
      case 11:
        return "🌫️"; // Patches of shallow fog
      case 12:
        return "🌫️"; // Continuous shallow fog
      case 13:
        return "🌩️"; // Lightning visible
      case 14:
      case 15:
      case 16:
        return "🌧️"; // Precipitation
      case 17:
        return "🌩️"; // Thunderstorm
      case 18:
        return "💨"; // Squalls
      case 19:
        return "🌪️"; // Funnel cloud (Tornado cloud or waterspout)
      case 20:
      case 21:
      case 22:
      case 23:
      case 24:
      case 25:
      case 26:
      case 27:
      case 28:
      case 29:
        return "🌧️🌩️"; // Precipitation, fog, ice fog, or thunderstorm
      case 30:
      case 31:
      case 32:
      case 33:
      case 34:
      case 35:
        return "🌬️"; // Duststorm or sandstorm
      case 36:
      case 37:
      case 38:
      case 39:
        return "❄️"; // Blowing or drifting snow
      case 40:
        return "🌫️"; // Fog at a distance
      case 41:
      case 42:
      case 43:
      case 44:
      case 45:
      case 46:
      case 47:
        return "🌫️"; // Fog
      case 48:
      case 49:
        return "🌫️❄️"; // Fog with rime
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57:
      case 58:
      case 59:
        return "🌧️"; // Drizzle
      case 60:
      case 61:
      case 62:
      case 63:
      case 64:
      case 65:
      case 66:
      case 67:
      case 68:
      case 69:
        return "🌧️"; // Rain
      case 70:
      case 71:
      case 72:
      case 73:
      case 74:
      case 75:
      case 76:
      case 77:
      case 78:
      case 79:
        return "❄️"; // Solid precipitation
      case 80:
      case 81:
      case 82:
      case 83:
      case 84:
      case 85:
      case 86:
      case 87:
      case 88:
      case 89:
      case 90:
      case 91:
      case 92:
      case 93:
      case 94:
      case 95:
      case 96:
      case 97:
      case 98:
      case 99:
        return "🌦️🌩️"; // Showery precipitation or thunderstorm
      default:
        return "❓"; // Unknown or not specified
    }
  }

  function formatDate(date) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('ja-JP', options);
  }

  function formatTime(time) {
    const formattedTime = new Date(time).toLocaleTimeString('ja-JP');
    return formattedTime;
  }
});