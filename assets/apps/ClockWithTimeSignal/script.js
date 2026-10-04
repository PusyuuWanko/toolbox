/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 1.14.6    |
  |  © 2021-2026 By PusyuuWanko/  |
  |  LastUpdate: 2026-09-03       |
  |  License: MIT License         |
  |  ClockWithTimeSignal          |
----------------------------------*
  IEのような古いブラウザでも動作するよう、このファイルは
  意図的にES5構文のみで書かれている（const/let、アロー関数、
  テンプレートリテラル、String.prototype.startsWith/padStart、
  Array.prototype.findは使用しない）。
******************************************/

function padStartZero(value, targetLength) {
  var str = String(value);
  while (str.length < targetLength) {
    str = '0' + str;
  }
  return str;
}

// ---------------------------------------------------------------------
// 保存係
//
// ツールボックスの中で使うときは、ツールボックスの保存の窓口(storage-hub.js)に預けます。
// 設定アプリで保存先の切り替え・項目ごとの削除・ファイルへの書き出しができるようになります。
// 窓口が無い場所(このアプリだけを取り出して使う場合)では、今までどおり localStorage に
// 直接保存します。どちらでも localStorage と同じ呼び方(getItem/setItem/removeItem)で使えます。
//
// 【このアプリの中で localStorage を直接触らないこと】窓口を通らない保存は、設定アプリの
// 一覧にも書き出しにも出ず、保存先を「メモリ上だけ」にしても localStorage に残り続けます。
// ---------------------------------------------------------------------
var clockStorage = (function () {
  var store = (typeof PusyuuToolboxStorage !== 'undefined')
    ? PusyuuToolboxStorage.app('ClockWithTimeSignal', 'チャイム付き時計、カレンダー')
    : null;
  var result = null;

  // 設定アプリの削除一覧に出す名札。
  function labelFor(key) {
    var labels = {
      'ClockChime_selectedImage': '選んでいる壁紙',
      'ClockChime_selectedChimeIndex00': '00分のチャイムの選択',
      'ClockChime_selectedChimeIndex30': '30分のチャイムの選択',
      'selectedChimes': 'チャイム音ライブラリ(追加したチャイム音を含む)',
      'ClockChime_customMinuteChimes': '任意の分のチャイム',
      'ClockChime_chimeVolume': 'チャイムの音量',
      'ClockChime_events': 'カレンダーの予定',
      'ClockChime_alarms': 'アラーム',
      'ClockChime_eventNotifyDismissedKey': '予定の通知を閉じた記録'
    };
    var label = key;

    if (labels.hasOwnProperty(key)) {
      label = labels[key];
    } else if (key.indexOf('Your wallpaper') === 0) {
      label = '追加した壁紙: ' + key;
    }

    return label;
  }

  if (store) {
    result = {
      getItem: store.get,
      setItem: function (key, value) {
        return store.set(key, value, labelFor(key));
      },
      removeItem: store.remove,
      keys: store.keys
    };
    // 設定アプリで削除された・ファイルから読み込まれたときは、画面を読み直します
    // (このアプリは保存した値を画面のあちこちに持っているため、読み直すのが一番確かです)。
    store.onChange(function () {
      window.location.reload();
    }, window);
  } else {
    result = {
      getItem: function (key) {
        try {
          return localStorage.getItem(key);
        } catch (e) {
          return null;
        }
      },
      setItem: function (key, value) {
        try {
          localStorage.setItem(key, value);
          return true;
        } catch (e) {
          return false;
        }
      },
      removeItem: function (key) {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          // 使えない環境では消すものもありません。
        }
      },
      keys: function () {
        var list = [];
        try {
          for (var i = 0; i < localStorage.length; i++) {
            list.push(localStorage.key(i));
          }
        } catch (e) {
          list = [];
        }
        return list;
      }
    };
  }

  return result;
})();

document.addEventListener('DOMContentLoaded', function() {
  var select = document.getElementById('background-select');
  var body = document.body;
  var uploadInput = document.getElementById('upload-input');
  var maxFileSize = 1 * 1024 * 1024; // 1MB in bytes
  var selectedLocalStorageKey = 'ClockChime_selectedImage';

  var selectedImage = clockStorage.getItem(selectedLocalStorageKey);
  if (selectedImage) {
    body.style.backgroundImage = 'url(' + selectedImage + ')';
    select.value = selectedImage;
  }

  select.addEventListener('change', function() {
    var newSelectedImage = select.value;
    body.style.backgroundImage = 'url(' + newSelectedImage + ')';
    clockStorage.setItem(selectedLocalStorageKey, newSelectedImage);
  });

  uploadInput.addEventListener('change', function(event) {
    var file = event.target.files[0];
    var reader = new FileReader();

    if (file.size > maxFileSize) {
      alert('The file size exceeds the maximum limit of 1MB.');
      return;
    }

    reader.onload = function() {
      var uploadedImage = reader.result;
      var randomThreeDigitNumber = padStartZero(Math.floor(Math.random() * 1000).toString(), 3);
      var imageName = 'Your wallpaper' + randomThreeDigitNumber;
      clockStorage.setItem(imageName, uploadedImage);
      addImageOption(imageName, uploadedImage);
    };
    reader.readAsDataURL(file);
  });

  // 追加した壁紙は、このアプリの保存の中から拾います(以前は localStorage 全体から拾って
  // いたため、同じ名前の付け方をしていた周期表の壁紙まで混ざって出ていました)。
  var savedKeys = clockStorage.keys();
  for (var wi = 0; wi < savedKeys.length; wi++) {
    var key = savedKeys[wi];
    if (key !== null && key.indexOf('Your wallpaper') === 0) {
      var storedImage = clockStorage.getItem(key);
      addImageOption(key, storedImage);
    }
  }

  function addImageOption(imageName, uploadedImage) {
    var option = document.createElement('option');
    option.value = uploadedImage;
    option.text = imageName;
    select.add(option);

    if (uploadedImage === selectedImage) {
      option.selected = true;
    }
  }

  function applyBackgroundStyles() {
    body.style.backgroundSize = 'cover';
    body.style.backgroundRepeat = 'no-repeat';
    body.style.backgroundPosition = 'center';
    body.style.backgroundAttachment = 'fixed';
  }

  applyBackgroundStyles();

  function addPreloadedImages() {
    var preloadedImages = [
      './1.jpg',
      './2.jpg'
    ];
    addImageOption("Select Wallpaper", "");
    preloadedImages.forEach(function(image, index) {
      var wallpaperNumber = (index + 1).toString();
      var imageName = 'wallpaper ' + wallpaperNumber;
      addImageOption(imageName, image);
    });
  }

  addPreloadedImages();

  var calendar = document.getElementById("calendar");
  var handMonth = 1;

  function calendarHandle(month, tbody) {
    calendar.textContent = "";

    var monthHandleRow = document.createElement("tr");
    var monthHandleCell = document.createElement("td");
    monthHandleCell.colSpan = 7;
    var monthBtnWrap = document.createElement("div");
    monthBtnWrap.classList.add("month_btn_wrap");

    var negaMonthBtn = document.createElement("button");
    negaMonthBtn.innerText = "前の月";
    negaMonthBtn.addEventListener("click", function() {
      if (month > 1) {
        handMonth -= 1;
      } else {
        handMonth += 11;
      }
      updateClockAndCalendar();
    });
    monthBtnWrap.appendChild(negaMonthBtn);

    var prevMonthBtn = document.createElement("button");
    prevMonthBtn.innerText = "今日";
    prevMonthBtn.addEventListener("click", function() {
      handMonth = 1;
      updateClockAndCalendar();
    });
    monthBtnWrap.appendChild(prevMonthBtn);

    var posiMonthBtn = document.createElement("button");
    posiMonthBtn.innerText = "次の月";
    posiMonthBtn.addEventListener("click", function() {
      if (month < 12) {
        handMonth += 1;
      } else {
        handMonth -= 11;
      }
      updateClockAndCalendar();
    });
    monthBtnWrap.appendChild(posiMonthBtn);

    monthHandleCell.appendChild(monthBtnWrap);
    monthHandleRow.appendChild(monthHandleCell);
    tbody.appendChild(monthHandleRow);
  }

  function addZero(number) {
    return number < 10 ? ('0' + number) : String(number);
  }

  function updateClockAndCalendar() {
    calendar.textContent = "";

    // 現在の時刻と日付を取得
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth() + handMonth;
    var day = now.getDate();
    var hour = now.getHours();
    var min = now.getMinutes();
    var sec = now.getSeconds();

    var formattedTime = addZero(hour) + ':' + addZero(min) + ':' + addZero(sec);

    var clock = document.createElement("div");
    clock.id = "clock";
    clock.textContent = formattedTime;

    playChime(hour, min, sec);
    checkAlarms(hour, min, sec);
    checkTodayEvent(year, now.getMonth() + 1, day);

    var table = document.createElement("table");
    var tbody = document.createElement("tbody");
    table.appendChild(tbody);

    var clockRow = document.createElement("tr");
    var clockCell = document.createElement("td");
    clockCell.colSpan = 7;
    clockCell.appendChild(clock);
    clockRow.appendChild(clockCell);
    tbody.appendChild(clockRow);

    var firstDate = new Date(year, month - 1, 1);
    var lastDate = new Date(year, month, 0);

    calendarHandle(month, tbody);

    // 年と月を表示する部分を追加
    var yearMonthRow = document.createElement("tr");
    var yearMonthCell = document.createElement("td");
    yearMonthCell.classList.add("yearMonth");
    yearMonthCell.colSpan = 7;
    yearMonthCell.textContent = year + '年' + month + '月';
    yearMonthRow.appendChild(yearMonthCell);
    tbody.appendChild(yearMonthRow);

    var weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    var weekdaysRow = document.createElement("tr");
    for (var wdi = 0; wdi < weekdays.length; wdi++) {
      var th = document.createElement("th");
      th.textContent = weekdays[wdi];
      weekdaysRow.appendChild(th);
    }
    tbody.appendChild(weekdaysRow);

    for (var i = 0; i < 6; i++) {
      var dateRow = document.createElement("tr");
      for (var j = 0; j < 7; j++) {
        var dateCell = document.createElement("td");
        var date = i * 7 + j - firstDate.getDay() + 1;
        if (date > 0 && date <= lastDate.getDate()) {
          dateCell.textContent = date;
          if (date === day) {
            dateCell.classList.add("current-date");
          }
          if (getDayEvents()[eventKeyFor(year, month, date)]) {
            dateCell.classList.add("has-event");
          }
          dateCell.classList.add("has-click");
          (function (clickYear, clickMonth, clickDate, cell) {
            cell.addEventListener("click", function () {
              openDayEventModal(clickYear, clickMonth, clickDate);
            });
          })(year, month, date, dateCell);
        }
        dateRow.appendChild(dateCell);
      }
      tbody.appendChild(dateRow);
    }

    calendar.appendChild(table);
  }

  var chimeIndexStorageKey00 = 'ClockChime_selectedChimeIndex00';
  var chimeIndexStorageKey30 = 'ClockChime_selectedChimeIndex30';
  var selectChime00 = document.getElementById('chime00-select');
  var selectChime30 = document.getElementById('chime30-select');
  var uploadChimeInput = document.getElementById('upload-chime');

  if (selectChime00 && selectChime30 && uploadChimeInput) {
    var storageChKey = 'selectedChimes';
    // プリセットのチャイム音源一覧。この配列に含まれる値かどうかで
    // 「プリセットかアップロードされたものか」を判定する(名前ではなく
    // 実体のパス/データで判定するので、プリセットの名前や数が変わっても
    // 影響を受けない)
    var preloadedChimes = [
      './1.mp3',
      './2.mp3'
    ];

    uploadChimeInput.addEventListener('change', function(event) {
      var file = event.target.files[0];
      var reader = new FileReader();

      if (file.size > maxFileSize) {
        alert('The file size exceeds the maximum limit of 1MB.');
        return;
      }

      reader.onload = function() {
        var uploadedChime = reader.result;
        var randomThreeDigitNumber = padStartZero(Math.floor(Math.random() * 1000).toString(), 3);
        var chimeName = 'Your chime' + randomThreeDigitNumber;
        addChimeOption(chimeName, uploadedChime);
      };
      reader.readAsDataURL(file);
    });

    // 事前に読み込むチャイムのリスト
    function addPreloadedChimes() {
      preloadedChimes.forEach(function(chime, index) {
        var chimeNumber = (index + 1).toString();
        var chimeName = 'chimeSound ' + chimeNumber;
        addChimeOption(chimeName, chime);
      });
    }
    addPreloadedChimes();

    function addChimeOption(chimeName, uploadedChime) {
      var option = document.createElement('option');
      option.value = uploadedChime;
      option.text = chimeName;
      selectChime00.add(option);
      selectChime30.add(option.cloneNode(true));

      // 新しいオプションが追加された時にローカルストレージに保存
      saveChimeToLocalStorage(chimeName, uploadedChime);
    }

    function saveChimeToLocalStorage(chimeName, uploadedChime) {
      var selectedChimes = JSON.parse(clockStorage.getItem(storageChKey)) || {};

      selectedChimes[chimeName] = uploadedChime;
      clockStorage.setItem(storageChKey, JSON.stringify(selectedChimes));
    }

    var noneChimeLabel = '設定しない';

    // 「設定しない」の選択肢を追加する(ローカルストレージのチャイム音
    // ライブラリには保存しない。アラームや分チャイムの選択肢には出さない)
    function addNoneChimeOption() {
      var noneOption00 = document.createElement('option');
      noneOption00.value = '';
      noneOption00.text = noneChimeLabel;
      selectChime00.add(noneOption00);

      var noneOption30 = document.createElement('option');
      noneOption30.value = '';
      noneOption30.text = noneChimeLabel;
      selectChime30.add(noneOption30);
    }

    function loadChimesFromLocalStorage() {
      var selectedChimes = JSON.parse(clockStorage.getItem(storageChKey)) || {};

      // チャイムの選択肢をクリア
      selectChime00.innerHTML = "";
      selectChime30.innerHTML = "";

      // 過去のバグで「設定しない」(値が空)がライブラリに保存されてしまった
      // 環境向けの自動クリーンアップ。見つかった場合はストレージからも除去する。
      var storageNeedsCleanup = false;
      for (var chimeName in selectedChimes) {
        if (selectedChimes.hasOwnProperty(chimeName)) {
          if (chimeName === noneChimeLabel || !selectedChimes[chimeName]) {
            delete selectedChimes[chimeName];
            storageNeedsCleanup = true;
            continue;
          }
          addChimeOption(chimeName, selectedChimes[chimeName]);
        }
      }
      if (storageNeedsCleanup) {
        clockStorage.setItem(storageChKey, JSON.stringify(selectedChimes));
      }

      // 末尾に追加することで、既存に保存済みのselectedIndexが指す
      // チャイムの位置がずれないようにする
      addNoneChimeOption();

      selectChime00.selectedIndex = clockStorage.getItem(chimeIndexStorageKey00);
      selectChime30.selectedIndex = clockStorage.getItem(chimeIndexStorageKey30);
    }

    // ページ読み込み時にローカルストレージからチャイムを読み込む
    loadChimesFromLocalStorage();

    // チャイム選択が変更された時の処理
    // 「設定しない」(値が空)を選んだ場合は、チャイム音ライブラリには
    // 保存しない(保存するとリロードのたびに「設定しない」が重複して増えていく)。
    // 選択位置(selectedIndex)だけは常に保存し、復元できるようにする。
    selectChime00.addEventListener('change', function() {
      var selectedChimeName = selectChime00.options[selectChime00.selectedIndex].text;
      var selectedChimeValue = selectChime00.value;

      if (selectedChimeValue) {
        saveChimeToLocalStorage(selectedChimeName, selectedChimeValue);
      }
      clockStorage.setItem(chimeIndexStorageKey00, selectChime00.selectedIndex);
    });

    selectChime30.addEventListener('change', function() {
      var selectedChimeName = selectChime30.options[selectChime30.selectedIndex].text;
      var selectedChimeValue = selectChime30.value;

      if (selectedChimeValue) {
        saveChimeToLocalStorage(selectedChimeName, selectedChimeValue);
      }
      clockStorage.setItem(chimeIndexStorageKey30, selectChime30.selectedIndex);
    });

    // チャイムの管理（アップロードしたチャイムの削除機能。プリセット音源
    // (preloadedChimesに含まれる値)は対象外にする）
    var chimeManageToggleBtn = document.getElementById('chime-manage-toggle-btn');
    var chimeManagePanel = document.getElementById('chime-manage-panel');
    var chimeManageListEl = document.getElementById('chime-manage-list');

    function renderChimeManageList() {
      if (!chimeManageListEl) {
        return;
      }
      var selectedChimes = JSON.parse(clockStorage.getItem(storageChKey)) || {};
      chimeManageListEl.innerHTML = '';
      var hasDeletable = false;

      for (var chimeName in selectedChimes) {
        if (!selectedChimes.hasOwnProperty(chimeName)) {
          continue;
        }
        var chimeValue = selectedChimes[chimeName];
        if (preloadedChimes.indexOf(chimeValue) !== -1) {
          continue; // プリセット音源は管理対象外
        }
        hasDeletable = true;

        var row = document.createElement('div');
        row.className = 'alarm-row';

        var label = document.createElement('span');
        label.className = 'alarm-row-label';
        label.textContent = chimeName;

        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.textContent = '削除';
        (function (targetName) {
          delBtn.addEventListener('click', function () {
            var confirmed = confirm('「' + targetName + '」を削除しますか？\nこのチャイムを使用中のアラーム・分チャイムには影響しません。');
            if (!confirmed) {
              return;
            }
            deleteChimeFromLibrary(targetName);
          });
        })(chimeName);

        row.appendChild(label);
        row.appendChild(delBtn);
        chimeManageListEl.appendChild(row);
      }

      if (!hasDeletable) {
        var empty = document.createElement('p');
        empty.className = 'alarm-empty';
        empty.textContent = '削除できるチャイムはありません。';
        chimeManageListEl.appendChild(empty);
      }
    }

    function deleteChimeFromLibrary(chimeName) {
      var selectedChimes = JSON.parse(clockStorage.getItem(storageChKey)) || {};
      delete selectedChimes[chimeName];
      clockStorage.setItem(storageChKey, JSON.stringify(selectedChimes));
      // 過去のバージョンで残っている可能性のある未使用の生データキーも掃除する
      clockStorage.removeItem(chimeName);

      loadChimesFromLocalStorage();
      populateAlarmChimeSelect();
      populateChimeMinuteSelect();
      renderChimeManageList();
    }

    if (chimeManageToggleBtn && chimeManagePanel) {
      chimeManageToggleBtn.addEventListener('click', function () {
        var isHidden = chimeManagePanel.style.display === 'none';
        if (isHidden) {
          renderChimeManageList();
        }
        chimeManagePanel.style.display = isHidden ? '' : 'none';
      });
    }
  }

  // 任意の分チャイム機能（アラームとは別機能。00分・30分は既定のまま、
  // それ以外の分に鳴らすチャイムを＋で追加、－で削除できるようにする。
  // 既存のチャイム音ライブラリ(selectedChimes)を流用する）
  var customChimeStorageKey = 'ClockChime_customMinuteChimes';
  var chimeMinuteListEl = document.getElementById('chime-minute-list');
  var chimeMinuteInput = document.getElementById('chime-minute-input');
  var chimeMinuteSecondInput = document.getElementById('chime-minute-second-input');
  var chimeMinuteChimeSelect = document.getElementById('chime-minute-chime-select');
  var chimeMinuteAddBtn = document.getElementById('chime-minute-add-btn');

  function populateChimeMinuteSelect() {
    if (!chimeMinuteChimeSelect) {
      return;
    }
    chimeMinuteChimeSelect.innerHTML = '';
    var selectedChimes = JSON.parse(clockStorage.getItem('selectedChimes')) || {};
    for (var chimeName in selectedChimes) {
      if (selectedChimes.hasOwnProperty(chimeName)) {
        var option = document.createElement('option');
        option.value = selectedChimes[chimeName];
        option.text = chimeName;
        chimeMinuteChimeSelect.appendChild(option);
      }
    }
  }

  if (uploadChimeInput) {
    uploadChimeInput.addEventListener('change', function () {
      setTimeout(populateChimeMinuteSelect, 300);
    });
  }

  function getCustomChimes() {
    return JSON.parse(clockStorage.getItem(customChimeStorageKey)) || [];
  }

  function saveCustomChimes(chimes) {
    clockStorage.setItem(customChimeStorageKey, JSON.stringify(chimes));
  }

  function renderChimeMinuteList() {
    if (!chimeMinuteListEl) {
      return;
    }
    var chimes = getCustomChimes();
    chimeMinuteListEl.innerHTML = '';
    if (chimes.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'alarm-empty';
      empty.textContent = '追加されている分チャイムはありません。';
      chimeMinuteListEl.appendChild(empty);
      return;
    }
    chimes.forEach(function (chime) {
      var row = document.createElement('div');
      row.className = 'alarm-row';

      var chimeSecond = chime.second || 0;
      var label = document.createElement('span');
      label.className = 'alarm-row-label';
      label.textContent = addZeroPad(chime.minute) + '分' + addZeroPad(chimeSecond) + '秒（' + chime.chimeName + '）';

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '－';
      delBtn.addEventListener('click', function () {
        var remaining = [];
        var current = getCustomChimes();
        for (var ri = 0; ri < current.length; ri++) {
          if (current[ri].id !== chime.id) {
            remaining.push(current[ri]);
          }
        }
        saveCustomChimes(remaining);
        renderChimeMinuteList();
      });

      row.appendChild(label);
      row.appendChild(delBtn);
      chimeMinuteListEl.appendChild(row);
    });
  }

  if (chimeMinuteAddBtn) {
    chimeMinuteAddBtn.addEventListener('click', function () {
      var minute = parseInt(chimeMinuteInput.value, 10);
      if (isNaN(minute) || minute < 0 || minute > 59) {
        alert('分は0～59の数値で入力してください。');
        return;
      }

      // 秒は省略可能(空欄の場合は0秒扱い)
      var secondRaw = chimeMinuteSecondInput ? chimeMinuteSecondInput.value : '';
      var second = secondRaw === '' ? 0 : parseInt(secondRaw, 10);
      if (isNaN(second) || second < 0 || second > 59) {
        alert('秒は0～59の数値で入力してください。');
        return;
      }

      // 既定のチャイムが鳴る「00分00秒」「30分00秒」のタイミングとちょうど
      // 重複する場合のみ予約済みとして弾く(例: 0分15秒は追加可能)
      if ((minute === 0 || minute === 30) && second === 0) {
        alert('00分00秒・30分00秒はシステムで予約済みな為設定できません');
        return;
      }

      var chimes = getCustomChimes();
      for (var ei = 0; ei < chimes.length; ei++) {
        if (chimes[ei].minute === minute && (chimes[ei].second || 0) === second) {
          alert('その分・秒にはすでにチャイムが追加されています。');
          return;
        }
      }
      var chimeName = (chimeMinuteChimeSelect && chimeMinuteChimeSelect.selectedIndex >= 0)
        ? chimeMinuteChimeSelect.options[chimeMinuteChimeSelect.selectedIndex].text
        : '';
      chimes.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        minute: minute,
        second: second,
        chimeValue: chimeMinuteChimeSelect ? chimeMinuteChimeSelect.value : '',
        chimeName: chimeName
      });
      saveCustomChimes(chimes);
      chimeMinuteInput.value = '';
      if (chimeMinuteSecondInput) {
        chimeMinuteSecondInput.value = '';
      }
      renderChimeMinuteList();
    });
  }

  // チャイムの音量設定（大・中・小のラジオボタン。設定はlocalStorageに保存し、
  // チャイム・分チャイム・アラームの再生すべてに共通で適用する）
  var chimeVolumeStorageKey = 'ClockChime_chimeVolume';
  var chimeVolumeLevels = { large: 1.0, medium: 0.6, small: 0.3 };
  var defaultChimeVolumeLevel = 'medium';
  var chimeVolumeRadios = document.getElementsByName('chime-volume');

  function getSavedChimeVolumeLevel() {
    var saved = clockStorage.getItem(chimeVolumeStorageKey);
    if (saved && chimeVolumeLevels.hasOwnProperty(saved)) {
      return saved;
    } else {
      return defaultChimeVolumeLevel;
    }
  }

  function getChimeVolume() {
    return chimeVolumeLevels[getSavedChimeVolumeLevel()];
  }

  function applyChimeVolumeRadioState() {
    var currentLevel = getSavedChimeVolumeLevel();
    for (var cvi = 0; cvi < chimeVolumeRadios.length; cvi++) {
      chimeVolumeRadios[cvi].checked = (chimeVolumeRadios[cvi].value === currentLevel);
    }
  }
  applyChimeVolumeRadioState();

  for (var cvj = 0; cvj < chimeVolumeRadios.length; cvj++) {
    chimeVolumeRadios[cvj].addEventListener('change', function(event) {
      if (event.target.checked) {
        clockStorage.setItem(chimeVolumeStorageKey, event.target.value);
      }
    });
  }

  // チャイム再生機能
  function playChime(hour, min, sec) {
    if (!isChimeEnabled) {
      return;
    }

    if (min === 0 && sec === 0 && selectChime00.value) {
      var my_audio00 = new Audio(selectChime00.value);
      my_audio00.volume = getChimeVolume();
      my_audio00.play();
    }
    if (min === 30 && sec === 0 && selectChime30.value) {
      var my_audio30 = new Audio(selectChime30.value);
      my_audio30.volume = getChimeVolume();
      my_audio30.play();
    }
    var customChimes = getCustomChimes();
    for (var pi = 0; pi < customChimes.length; pi++) {
      var customSecond = customChimes[pi].second || 0;
      if (customChimes[pi].minute === min && customSecond === sec && customChimes[pi].chimeValue) {
        var my_audio_custom = new Audio(customChimes[pi].chimeValue);
        my_audio_custom.volume = getChimeVolume();
        my_audio_custom.play();
      }
    }
  }

  var chimeToggle = document.getElementById("chime-toggle");
  chimeToggle.textContent = "チャイムオフ🔇";
  chimeToggle.addEventListener("click", function() {
    isChimeEnabled = !isChimeEnabled;

    if (isChimeEnabled) {
      chimeToggle.textContent = "チャイムオン🔊";
    } else {
      chimeToggle.textContent = "チャイムオフ🔇";
    }
  });

  var isChimeEnabled = false;

  // カレンダー予定の保存機能
  var dayEventStorageKey = 'ClockChime_events';

  function getDayEvents() {
    return JSON.parse(clockStorage.getItem(dayEventStorageKey)) || {};
  }

  function saveDayEvents(events) {
    clockStorage.setItem(dayEventStorageKey, JSON.stringify(events));
  }

  function eventKeyFor(y, m, d) {
    return y + '-' + m + '-' + d;
  }

  var currentEventKey = null;
  var dayEventText = document.getElementById('dayEventText');
  var dayEventDateLabel = document.getElementById('dayEventDateLabel');
  var dayEventSaveBtn = document.getElementById('dayEventSaveBtn');
  var dayEventDeleteBtn = document.getElementById('dayEventDeleteBtn');

  function openDayEventModal(y, m, d) {
    currentEventKey = eventKeyFor(y, m, d);
    var events = getDayEvents();
    if (dayEventDateLabel) {
      dayEventDateLabel.textContent = y + '年' + m + '月' + d + '日の予定';
    }
    if (dayEventText) {
      dayEventText.value = events[currentEventKey] || '';
    }
    window.location.hash = 'dayEventModal';
  }

  if (dayEventSaveBtn) {
    dayEventSaveBtn.addEventListener('click', function () {
      var events = getDayEvents();
      var text = dayEventText.value;
      if (text.replace(/^\s+|\s+$/g, '') === '') {
        delete events[currentEventKey];
      } else {
        events[currentEventKey] = text;
      }
      saveDayEvents(events);
      window.location.hash = 'mc';
      updateClockAndCalendar();
    });
  }

  if (dayEventDeleteBtn) {
    dayEventDeleteBtn.addEventListener('click', function () {
      var events = getDayEvents();
      delete events[currentEventKey];
      saveDayEvents(events);
      dayEventText.value = '';
      window.location.hash = 'mc';
      updateClockAndCalendar();
    });
  }

  // アラーム機能（既存のチャイム音ライブラリを流用）
  var alarmStorageKey = 'ClockChime_alarms';
  var alarmListEl = document.getElementById('alarm-list');
  var alarmTimeInput = document.getElementById('alarm-time-input');
  var alarmLabelInput = document.getElementById('alarm-label-input');
  var alarmChimeSelect = document.getElementById('alarm-chime-select');
  var alarmAddBtn = document.getElementById('alarm-add-btn');
  var alarmBanner = document.getElementById('alarm-banner');
  var alarmBannerLabel = document.getElementById('alarm-banner-label');
  var alarmBannerDismiss = document.getElementById('alarm-banner-dismiss');

  function populateAlarmChimeSelect() {
    if (!alarmChimeSelect) {
      return;
    }
    alarmChimeSelect.innerHTML = '';
    var selectedChimes = JSON.parse(clockStorage.getItem('selectedChimes')) || {};
    for (var chimeName in selectedChimes) {
      if (selectedChimes.hasOwnProperty(chimeName)) {
        var option = document.createElement('option');
        option.value = selectedChimes[chimeName];
        option.text = chimeName;
        alarmChimeSelect.appendChild(option);
      }
    }
  }

  if (uploadChimeInput) {
    uploadChimeInput.addEventListener('change', function () {
      setTimeout(populateAlarmChimeSelect, 300);
    });
  }

  function getAlarms() {
    return JSON.parse(clockStorage.getItem(alarmStorageKey)) || [];
  }

  function saveAlarms(alarms) {
    clockStorage.setItem(alarmStorageKey, JSON.stringify(alarms));
  }

  function renderAlarmList() {
    if (!alarmListEl) {
      return;
    }
    var alarms = getAlarms();
    alarmListEl.innerHTML = '';
    if (alarms.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'alarm-empty';
      empty.textContent = '登録されているアラームはありません。';
      alarmListEl.appendChild(empty);
      return;
    }
    alarms.forEach(function (alarm) {
      var row = document.createElement('div');
      row.className = 'alarm-row';

      var toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = alarm.enabled;
      toggle.addEventListener('change', function () {
        var current = getAlarms();
        var target = null;
        for (var ci = 0; ci < current.length; ci++) {
          if (current[ci].id === alarm.id) {
            target = current[ci];
            break;
          }
        }
        if (target) {
          target.enabled = toggle.checked;
          saveAlarms(current);
        }
      });

      var label = document.createElement('span');
      label.className = 'alarm-row-label';
      label.textContent = alarm.label ? (alarm.time + '（' + alarm.label + '）') : alarm.time;

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '削除';
      delBtn.addEventListener('click', function () {
        var remaining = [];
        var currentAlarms = getAlarms();
        for (var ri = 0; ri < currentAlarms.length; ri++) {
          if (currentAlarms[ri].id !== alarm.id) {
            remaining.push(currentAlarms[ri]);
          }
        }
        saveAlarms(remaining);
        renderAlarmList();
      });

      row.appendChild(toggle);
      row.appendChild(label);
      row.appendChild(delBtn);
      alarmListEl.appendChild(row);
    });
  }

  // <input type="time">に対応していない古いブラウザでは普通の
  // テキスト欄として動作するため、「9:30」のような入力でも
  // 「09:30」に正規化してから比較・保存する
  function normalizeTimeString(value) {
    var parts = String(value).split(':');
    if (parts.length < 2) {
      return null;
    }
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      return null;
    }
    return addZeroPad(h) + ':' + addZeroPad(m);
  }

  if (alarmAddBtn) {
    alarmAddBtn.addEventListener('click', function () {
      var time = normalizeTimeString(alarmTimeInput.value);
      if (!time) {
        alert('アラームの時刻を「時:分」の形式で入力してください（例: 07:30）。');
        return;
      }
      var alarms = getAlarms();
      alarms.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        time: time,
        label: alarmLabelInput.value.replace(/^\s+|\s+$/g, ''),
        chimeValue: alarmChimeSelect ? alarmChimeSelect.value : '',
        enabled: true
      });
      saveAlarms(alarms);
      alarmLabelInput.value = '';
      renderAlarmList();
    });
  }

  var currentAlarmAudio = null;
  var lastFiredAlarmMinute = null;

  function checkAlarms(hour, min, sec) {
    if (sec !== 0) {
      return;
    }
    var nowStr = addZeroPad(hour) + ':' + addZeroPad(min);
    if (lastFiredAlarmMinute === nowStr) {
      return;
    }
    var alarms = getAlarms();
    var matched = [];
    for (var mi = 0; mi < alarms.length; mi++) {
      if (alarms[mi].enabled && alarms[mi].time === nowStr) {
        matched.push(alarms[mi]);
      }
    }
    if (matched.length > 0) {
      lastFiredAlarmMinute = nowStr;
      triggerAlarm(matched[0]);
    }
  }

  function addZeroPad(number) {
    return number < 10 ? ('0' + number) : String(number);
  }

  function triggerAlarm(alarm) {
    if (currentAlarmAudio) {
      currentAlarmAudio.pause();
      currentAlarmAudio = null;
    }
    if (alarm.chimeValue) {
      currentAlarmAudio = new Audio(alarm.chimeValue);
      currentAlarmAudio.volume = getChimeVolume();
      currentAlarmAudio.loop = true;
      currentAlarmAudio.play();
    }
    if (alarmBanner && alarmBannerLabel) {
      alarmBannerLabel.textContent = '⏰ アラーム: ' + (alarm.label || alarm.time);
      alarmBanner.style.display = 'flex';
    }
  }

  if (alarmBannerDismiss) {
    alarmBannerDismiss.addEventListener('click', function () {
      if (currentAlarmAudio) {
        currentAlarmAudio.pause();
        currentAlarmAudio = null;
      }
      if (alarmBanner) {
        alarmBanner.style.display = 'none';
      }
    });
  }

  // その日の予定通知（alert()はintervalの実行を止めてしまうため使わず、
  // アラームバナーと同様に非ブロッキングなバナーで知らせる）
  var eventNotifyDismissedStorageKey = 'ClockChime_eventNotifyDismissedKey';
  var eventBanner = document.getElementById('event-banner');
  var eventBannerLabel = document.getElementById('event-banner-label');
  var eventBannerDismiss = document.getElementById('event-banner-dismiss');
  var lastCheckedEventKey = null;

  function checkTodayEvent(year, realMonth, day) {
    var todayKey = eventKeyFor(year, realMonth, day);
    if (todayKey === lastCheckedEventKey) {
      return;
    }
    lastCheckedEventKey = todayKey;

    var text = getDayEvents()[todayKey];
    if (!text) {
      return;
    }
    if (clockStorage.getItem(eventNotifyDismissedStorageKey) === todayKey) {
      return;
    }
    if (eventBanner && eventBannerLabel) {
      eventBannerLabel.textContent = '📅 本日の予定: ' + text;
      eventBanner.style.display = 'flex';
    }
  }

  if (eventBannerDismiss) {
    eventBannerDismiss.addEventListener('click', function () {
      if (lastCheckedEventKey) {
        clockStorage.setItem(eventNotifyDismissedStorageKey, lastCheckedEventKey);
      }
      if (eventBanner) {
        eventBanner.style.display = 'none';
      }
    });
  }

  populateAlarmChimeSelect();
  renderAlarmList();
  populateChimeMinuteSelect();
  renderChimeMinuteList();

  // 1秒ごとに時計とカレンダーを更新
  setInterval(updateClockAndCalendar, 1000);
});
