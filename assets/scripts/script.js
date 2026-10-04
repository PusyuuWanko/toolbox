/*****************************************
  *----------------------------------
  |  ThisJsVersion: 1.23.0        |
  |  © 2021-2026 By ISAMI ABE     |
  |  LastUpdate: 2026-07-25       |
  |  License: MIT License         |
  |  PusyuuMultiApp               |
----------------------------------*
  IEのような古いブラウザでもアイコンクリック→モーダル表示が
  動作するよう、このファイルは意図的にES5構文のみで書かれている
  （const/let、アロー関数、テンプレートリテラル、async/await、
  デフォルト引数、Array.prototype.find/includes、for...of、
  Array.from、NodeList.forEachは使用しない）。
  fetch/PromiseにもAbortControllerにも依存せず、
  legacy-utils.js の ajaxRequest のみを利用する。
******************************************/

/* PusyuuOfMesseage
---------------------------------*/

var pusyuu = "あ、あ、テステス、テストコメントです。まだまだプログラミング初心者です。応戦よろしくお願いします。";
console.log(pusyuu);

/* OnClickMusic
---------------------------------*/

window.onload = function() {
  var audioFiles = [
    { id: 'audioBtn1', src: '../audios/hage.mp3' },
    { id: 'audioBtn2', src: '../audios/another_audio.mp3' },
    { id: 'audioBtn3', src: '../audios/yet_another_audio.mp3' }
  ];

  var currentAudio = null;

  function playAudio(audioSrc) {
    var audio = new Audio(audioSrc);
    audio.play();
    return audio;
  }

  function getAudioSrcById(id) {
    for (var i = 0; i < audioFiles.length; i++) {
      if (audioFiles[i].id === id) {
        return audioFiles[i].src;
      }
    }
    return null;
  }

  // クリックイベントを追加
  audioFiles.forEach(function(audioData) {
    var button = document.getElementById(audioData.id);
    if (button) {
      button.onclick = function() {
        if (currentAudio && !currentAudio.paused) {
          currentAudio.pause();
          currentAudio.currentTime = 0;
        }

        var audioSrc = getAudioSrcById(audioData.id);
        if (audioSrc) {
          currentAudio = playAudio(audioSrc);
        }
      };
    }
  });
};

/* LoadingDisplay
---------------------------------*/

window.onload = function() {
  var spinner = document.getElementById('loading');
  // 条件文で要素が存在しない場合に処理をスキップ
  if (!spinner) {
    console.log('Element with ID "loading" not found.');
    return;
  }
  spinner.classList.add('loaded');
};

/* CreateToolTheFaceMoJi
---------------------------------*/

// 入力フィールドのIDのリスト
var inputFieldIds = ["lefthand", "outline", "lefteyes", "nose", "righteyes", "righthand", "comment"];

// 入力フィールドの要素を格納するオブジェクト
var inputFields = {};

// 各入力フィールドの要素を取得し、イベントリスナーを設定
for (var ffi = 0; ffi < inputFieldIds.length; ffi++) {
  var inputFieldId = inputFieldIds[ffi];
  var inputField = document.getElementById(inputFieldId);

  // 条件文で要素が存在しない場合に処理をスキップ
  if (!inputField) {
    console.log('Element with ID "' + inputFieldId + '" not found.');
    continue;
  }

  inputFields[inputFieldId] = inputField;
  inputFields[inputFieldId].addEventListener("input", updateFace);
}

// スペースのチェックボックスを取得
var spaceCheckbox = document.getElementById("space");

// 条件文で要素が存在しない場合に処理をスキップ
if (!spaceCheckbox) {
  console.log('Element with ID "space" not found.');
} else {
  spaceCheckbox.addEventListener("change", updateFace);
}

// 顔を生成する関数
function createFace() {
  var lefthand = inputFields["lefthand"].value;
  var outline = inputFields["outline"].value;
  var lefteyes = inputFields["lefteyes"].value;
  var nose = inputFields["nose"].value;
  var righteyes = inputFields["righteyes"].value;
  var righthand = inputFields["righthand"].value;
  var space = spaceCheckbox.checked ? " " : "";
  var comment = inputFields["comment"].value;

  var face = lefthand + outline.substring(0, 1) + lefteyes + nose + righteyes + outline.substring(1) + righthand + space + comment;
  document.getElementById("faceContainer").innerHTML = face;
}

// 入力フィールドが変更されたときに顔を生成する関数を呼び出す
function updateFace() {
  createFace();
}

/* FremworkForMemoryOfMemo
---------------------------------*/

function save() {
  var MemoData = document.MemoForm.Memo.value;
  // テキストファイルを作成
  var blob = new Blob([MemoData], {
    type: 'text/plain'
  });
  var url = URL.createObjectURL(blob);
  // ダウンロード用のリンクを作成
  var downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = 'P-memo.txt'; // ダウンロード時のファイル名を指定
  downloadLink.click();
}

function loadFile(event) {
  var file = event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (event) {
    var MemoData = event.target.result;
    document.MemoForm.Memo.value = MemoData;
  };
  reader.readAsText(file);
}

function load() {
  var fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'text/plain'; // テキストファイルのみを選択可能にする
  fileInput.addEventListener('change', loadFile);
  fileInput.click();
}

/* select kabegami
---------------------------------*/

/*
document.addEventListener('DOMContentLoaded', function() {
  var select = document.getElementById('background-select');
  var uploadInput = document.getElementById('upload-input');
  if (select && uploadInput) {
    var body = document.body;
    var maxFileSize = 1 * 1024 * 1024; // 1MB in bytes
    var selectedImage = false;
    setInterval(function() {
      selectedImage = localStorage.getItem('PusyuuMultiApp_selectedImage');
      if (selectedImage) {
        body.style.backgroundImage = "url(" + selectedImage + ")";
        select.value = selectedImage;
      }
    }, 500);

    select.addEventListener('change', function() {
      var selectedImage = select.value;
      body.style.backgroundImage = "url(" + selectedImage + ")";
      localStorage.setItem('PusyuuMultiApp_selectedImage', selectedImage); // Changed the key to 'PusyuuMultiApp_selectedImage'
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
        var randomThreeDigitNumber = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        var imageName = 'Your wallpaper' + randomThreeDigitNumber;
        localStorage.setItem(imageName, uploadedImage);
        addImageOption(imageName, uploadedImage);
      };
      reader.readAsDataURL(file);
    });

    for (let i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key.startsWith('Your wallpaper')) {
        var uploadedImage = localStorage.getItem(key);
        addImageOption(key, uploadedImage);
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
        './assets/images/sys_wallpaper/1.JPG',
        './assets/images/sys_wallpaper/2.jpg',
        './assets/images/sys_wallpaper/4.jpg',
        './assets/images/sys_wallpaper/5.jpg',
        './assets/images/sys_wallpaper/7.JPG'
      ];
      addImageOption("Select Wallpaper", "");
      preloadedImages.forEach(function(image, index) {
        var wallpaperNumber = (index + 1).toString();
        var imageName = 'wallpaper ' + wallpaperNumber;
        addImageOption(imageName, image);
      });
    }

    addPreloadedImages();
  } else {
    console.log('Element with ID "background-select" and "upload-input" not found.');
  }
});
*/

/* Nav List
---------------------------------*/

function appLogic(applist, applistWrapper, modalWrapper) {
  // HTML5ドラッグ&ドロップに対応していない古いブラウザでも
  // 例外を投げずに済むよう、対応状況を最初に一度だけ調べる
  var dragDropSupported = ('draggable' in document.createElement('span'));

  function createAppItem(app) {
    var appItem = document.createElement("div");
    appItem.className = "draggable-item";
    appItem.setAttribute("data-id", app.id);
    var aLink = document.createElement("a");
    aLink.className = "app_link";
    aLink.href = "#" + app.id;
    aLink.title = app.title;
    var appWrapper = document.createElement("div");
    appWrapper.className = "app_wrapper";
    var appImage = document.createElement("div");
    appImage.className = "app_box-1";
    var img = document.createElement("img");
    img.src = app.image;
    img.alt = "image of app";
    img.className = "img-rs_saidai";
    img.oncontextmenu = function () {
      return false;
    };
    img.onselectstart = function () {
      return false;
    };
    img.onmousedown = function () {
      return false;
    };
    img.border = "0";
    var appName = document.createElement("p");
    appName.className = "app_name";
    appName.textContent = app.title;
    appImage.appendChild(img);
    appWrapper.appendChild(appImage);
    appWrapper.appendChild(appName);
    aLink.appendChild(appWrapper);
    appItem.appendChild(aLink);
    return appItem;
  }

  function createModalElement(modalData) {
    var modalDiv = document.createElement('div');
    modalDiv.className = "window";
    modalDiv.setAttribute("id", modalData.id);
    modalDiv.innerHTML =
      '<div>' +
        '<a class="close"></a>' +
        '<div>' +
          '<div>' +
            '<h2>' + modalData.title + '</h2>' +
            '<p>' + modalData.description + '</p>' +
            '<iframe title="アプリコンテンツ" frameborder="0" class="appframe-size" src="' + modalData.src + '"></iframe>' +
          '</div>' +
        '</div>' +
      '</div>';
    return modalDiv;
  }

  function setupCloseWindowLogic(modalElement) {
    var closeButton = modalElement.querySelector('.close');
    var iframe = modalElement.querySelector('.iframe');
    closeButton.addEventListener('click', function() {
      var userConfirmation = confirm("バックグランドで実行？・閉じますか？");
      if (userConfirmation) {
        console.log("ウィンドウを閉じます。");
        closeButton.href = "#mc";
        var modalId = window.location.hash.replace(/#/, '');
        var existingModalElement = document.getElementById(modalId);
        if (existingModalElement) {
          var parentEle = existingModalElement.parentElement;
          if (parentEle) {
            if (iframe) {
              iframe.src = "about:blank"; // 権限リリースを促す
              iframe.parentNode.removeChild(iframe); // DOMから削除
            }
            parentEle.removeChild(existingModalElement); // モーダル自体を削除
          }
        }
      } else {
        console.log("バックグランドで動作させます。");
        closeButton.href = "#mc";
      }
    });
  }

  function setupWindowLogic(clickedApp) {
    console.trace('setupWindowLogic called with:', clickedApp);
    if (!clickedApp) {
      console.error("モーダルデータが見つかりません");
      return;
    }
    var modalData = null;
    for (var mi = 0; mi < applist.length; mi++) {
      if (applist[mi].id === clickedApp.id) {
        modalData = applist[mi];
        break;
      }
    }
    if (modalData) {
      var existingModal = document.getElementById(clickedApp.id);
      if (!existingModal) {
        console.log("作成したWindowは" + clickedApp.id + "です。");
        var modalElement = createModalElement(modalData);
        modalWrapper.appendChild(modalElement);
        setupCloseWindowLogic(modalElement);
      }
    } else {
      console.error("モーダルデータが見つかりません");
    }
  }

  applistWrapper.innerHTML = '';
  for (var ai = 0; ai < applist.length; ai++) {
    var appItem = createAppItem(applist[ai]);
    applistWrapper.appendChild(appItem);
  }
  addDragListeners();

  var draggedItem = null;
  // 並び順の読み書きは legacy-utils.js の getIconOrder()/setIconOrder() を通します
  // (保存の窓口に「ホーム画面」として預け、設定アプリのアップロード/復元からも同じ値を使うため)。

  var isOnceSetupWindowFlug = false;

  function dragStart(e) {
    draggedItem = this;
    isOnceSetupWindowFlug = true;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
  }

  function dragOver(e) {
    if (e.preventDefault) {
      e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
  }

  function drop(e) {
    if (e.stopPropagation) {
      e.stopPropagation();
    }

    if (draggedItem !== this) {
      var draggedParent = draggedItem.parentNode;
      var thisParent = this.parentNode;

      // 位置を交換する
      var draggedClone = draggedItem.cloneNode(true);
      var thisClone = this.cloneNode(true);

      draggedParent.replaceChild(thisClone, draggedItem);
      thisParent.replaceChild(draggedClone, this);

      updateLocalStorageOrder();
      addDragListeners();
    }

    return false;
  }

  function dragEnd(e) {
    isOnceSetupWindowFlug = false;
  }

  // アイコンの並び順は、各アイコンのHTMLをまるごと保存するのではなく
  // data-id(アプリID)だけの軽量な配列として保存します(アカウントへの
  // 同期にも使うため。HTMLスナップショットのままだとマークアップを
  // 変更しただけで復元が壊れる上、サイズもかさみます)。
  function updateLocalStorageOrder() {
    var appLinkElements = document.querySelectorAll('.draggable-item');
    var order = [];
    for (var oi = 0; oi < appLinkElements.length; oi++) {
      var item = appLinkElements[oi];
      var appId = item.getAttribute('data-id');
      var matched = null;
      for (var aj = 0; aj < applist.length; aj++) {
        if (applist[aj].id === appId) {
          matched = applist[aj];
          break;
        }
      }
      if (matched) {
        order.push(appId);
      }
    }
    setIconOrder(order);
    // ドラッグのたびにメイキィへは送りません(操作のたびに通信が走ると操作感がぎこちなく
    // なるため)。メイキィへの反映は、設定アプリのアップロードボタン
    // (pusyuuUploadHomeToAccount、legacy-utils.js)からだけ行います。
  }

  function addDragListeners() {
    console.log("イベント登録を実行します。");
    var draggableItems = document.querySelectorAll('.draggable-item');
    for (var di = 0; di < draggableItems.length; di++) {
      (function (item) {
        if (dragDropSupported) {
          item.addEventListener('dragstart', dragStart);
          item.addEventListener('dragover', dragOver);
          item.addEventListener('drop', drop);
          item.addEventListener('dragend', dragEnd);
        }
        item.addEventListener('click', function() {
          if (isOnceSetupWindowFlug) {
            console.error("無効なウィンドウ作成リクエストです。");
            return;
          } else {
            console.log("ウィンドウの作成リクエストを許可しました。");
            var clickedApp = null;
            for (var ci = 0; ci < applist.length; ci++) {
              if (applist[ci].id === item.getAttribute('data-id')) {
                clickedApp = applist[ci];
                break;
              }
            }
            console.trace(clickedApp);
            setupWindowLogic(clickedApp);
          }
        });
      })(draggableItems[di]);
    }
  }

  // 保存済みのID配列(appOrder)どおりに、既存のDOM要素(.draggable-item)を
  // 並べ替えます。配列に無いIDは無視し、配列に載っていない(新しく増えた)
  // アイコンは末尾に残します。
  function applyIconOrder(appOrder) {
    if (!appOrder || !appOrder.length) {
      return;
    }
    var appContainer = document.querySelector('.yokoori');
    var nodeList = appContainer.querySelectorAll('.draggable-item');
    var appLinkElements = [];
    for (var ei = 0; ei < nodeList.length; ei++) {
      appLinkElements.push(nodeList[ei]);
    }

    function findById(appId) {
      for (var mi2 = 0; mi2 < appLinkElements.length; mi2++) {
        if (appLinkElements[mi2].getAttribute('data-id') === appId) {
          return appLinkElements[mi2];
        }
      }
      return null;
    }

    var updatedOrder = [];
    for (var oi2 = 0; oi2 < appOrder.length; oi2++) {
      var matchingElement = findById(appOrder[oi2]);
      if (matchingElement && updatedOrder.indexOf(matchingElement) === -1) {
        updatedOrder.push(matchingElement);
      }
    }
    for (var fi = 0; fi < appLinkElements.length; fi++) {
      var element = appLinkElements[fi];
      if (updatedOrder.indexOf(element) === -1) {
        updatedOrder.push(element);
      }
    }

    // innerHTML=""でいったん空にしてから既存ノードを詰め直す方式は、
    // 古いIEだと(空にした時点で持っていた参照が壊れるためか)再アペンド後の
    // 描画がおかしくなり、数秒後に画面が真っ黒になる不具合の原因になって
    // いました。appendChild()は対象が既にDOMに存在するノードであれば
    // 自動的に元の位置から移動させてくれるため、空にする処理自体が不要です。
    for (var ui = 0; ui < updatedOrder.length; ui++) {
      appContainer.appendChild(updatedOrder[ui]);
    }
    addDragListeners();
  }

  // 起動時の並び順の決定: ログイン中ならメイキィの並びを自動で取り込みます(この端末で
  // 並べ替えてまだアップロードしていない場合は、この端末の並びを残します。判定は
  // legacy-utils.js の loadIconOrder())。未ログイン・通信失敗のときは、この端末の並びです。
  loadIconOrder(applyIconOrder);
}

function executeApp(html, data) {
  if (typeof html === "undefined") {
    html = null;
  }
  if (typeof data === "undefined") {
    data = null;
  }

  function run() {
    var appWrap = document.getElementById("app_list_wrapper");
    var modalWrap = document.getElementById("modal_wrapper");

    if (appWrap && modalWrap) {
      if (html !== null) {
        appWrap.innerHTML = html;
      } else if (data != null) {
        appLogic(data, appWrap, modalWrap);
      } else {
        appWrap.innerHTML = '<p style="color:#f00;">開発者の設定ミス：アプリケーションデータが指定されていません。</p>';
      }
    } else {
      console.warn('Element with ID "app_list_wrapper" or "modal_wrapper" not found.');
    }
  }

  // すでにDOMがロードされている場合は即実行
  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
}

// ページ読み込みにつき1回だけ、アカウント側のインストール済み一覧で
// localStorageを補正します(true化した後は行いません)。
// これをgetAppList()が呼ばれるたびに行うと、AppStoreでのインストール/
// アンインストール直後のrefreshAppList()呼び出しで問題が起きます
// ―― setInstalledAppIds()によるアカウントへの保存(POST、全アカウントぶん
// 再暗号化するため比較的重い)がまだ終わっていないうちに、この取得(GET、
// 軽い)が先に返ってきてしまい、インストールしたばかりの状態を古い状態で
// 上書きして消してしまうためです(並び順の同期はこの再取得トリガーが
// 無いため影響を受けません)。
var installedIdsSyncedFromAccount = false;

function getAppList() {
  var url = "./?svc=catalog";

  executeApp('<p style="color: #0f0;">アプリケーションを読み込み中...</p>');

  function fetchCatalogAndRender() {
    // キャッシュ避けの値を足します。
    // 【区切りは ? と & を見分けて付けること】以前は url + "?_=" と決め打ちでした。
    // 窓口が ?svc=catalog を持つ形になった日から "?svc=catalog?_=…" になり、
    // svc の値が "catalog?_=…" として届いて**アプリ一覧が空になりました**
    // (2026-09-23)。2つ目以降の区切りは & です。
    var bustedUrl = url + (url.indexOf("?") < 0 ? "?" : "&") + "_=" + Date.now();

    ajaxRequest("GET", bustedUrl, null, function (data) {
      // カタログ全件のうち「常時表示(pinned)」または
      // 「この端末でインストール済み」のものだけをホーム画面に出す
      var apps = (data && data.apps) ? data.apps : [];
      var installedIds = getInstalledAppIds();
      // このブラウザがlegacy(旧ブラウザ)かどうか。loadInstalledAppIds()の
      // 和集合マージで他端末のインストール状態がlocalStorageに書き戻されて
      // いても、legacyCompatible:falseのアプリはここで表示だけ除外する
      // (localStorage/accounts側のinstalled_idsからは削除しない)。
      // これにより、この端末では見えなくなるが、対応している他端末の状態や
      // account側の同期データには一切影響しない。
      // ただし、pinned(アプリストア自身)と初回デフォルトでインストール済みの
      // アプリ(設定・メール)はこの除外の対象外にする。どちらもlegacyCompatible
      // がfalseのため、対象にすると古いブラウザからアプリ管理手段(ストア)や
      // 設定画面そのものが失われてしまうため。
      var isLegacyBrowser = !detectModernJs();
      var homeList = [];
      for (var hi = 0; hi < apps.length; hi++) {
        var app = apps[hi];

        if (app.pinned) {
          homeList.push(app);
          continue;
        }

        var isInstalled = false;
        for (var hj = 0; hj < installedIds.length; hj++) {
          if (installedIds[hj] === app.id) {
            isInstalled = true;
            break;
          }
        }
        if (!isInstalled) {
          continue;
        }

        var isDefaultApp = false;
        for (var dk = 0; dk < PUSYUU_DEFAULT_INSTALLED_IDS.length; dk++) {
          if (PUSYUU_DEFAULT_INSTALLED_IDS[dk] === app.id) {
            isDefaultApp = true;
            break;
          }
        }
        if (isLegacyBrowser && !app.legacyCompatible && !isDefaultApp) {
          continue;
        }

        homeList.push(app);
      }
      executeApp(null, homeList);
    }, function (message) {
      var errorHtml =
        '<div style="color:#f00; display: flex; justify-content: center; align-items: center; flex-direction: column;">' +
          '<p>アプリケーションの読み込みに失敗しました。（' + message + '）</p>' +
          '<button id="retry_btn" style="padding:6px 12px;background:#333;color:#fff;border:none;border-radius:4px;cursor:pointer;">再読み込み</button>' +
        '</div>';
      executeApp(errorHtml);

      document.addEventListener("click", function retryHandler(ev) {
        if (ev.target && ev.target.id === "retry_btn") {
          document.removeEventListener("click", retryHandler);
          executeApp('<p style="color: #0f0;">再読み込み中...</p>');
          getAppList();
        }
      });
    });
  }

  if (installedIdsSyncedFromAccount) {
    fetchCatalogAndRender();
  } else {
    installedIdsSyncedFromAccount = true;
    loadInstalledAppIds(fetchCatalogAndRender);
  }
}
getAppList();

// アプリストアからインストール/アンインストール後に、ホーム画面の
// アイコン一覧を即時re-fetchできるよう親ウィンドウのグローバルに公開する
window.refreshAppList = getAppList;

// 設定アプリで「ホーム画面」の保存が削除された・ファイルやメイキィから読み込まれたときは、
// アイコン一覧を描き直します。
// (以前はここで自動同期(60秒おきのアップロード)を動かしていましたが、廃止しました。
// メイキィへのアップロードは設定アプリのボタンからだけ行います。)
pusyuuHomeStorage().onChange(getAppList, window);

/* Pwa Settings
---------------------------------*/

window.onload = function() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register("./assets/scripts/sw.js")
    .then(function (reg) {
      console.log("PWA:", reg);
    })
    .catch(function (error) {
      console.error("PWA:", error);
    });
  }
};

/* Right Click Disable
---------------------------------*/

document.addEventListener('DOMContentLoaded', function() {
  var targetElement = document.getElementById('target-element');
  var customMenu = document.getElementById('custom-menu');

  // 要素で右クリックイベントを検出
  if (targetElement || customMenu) {
    targetElement.addEventListener('contextmenu', function(event) {
      event.preventDefault(); // デフォルトの右クリックメニューを無効化
      customMenu.style.left = event.clientX + 'px';
      customMenu.style.top = event.clientY + 'px';
      customMenu.style.display = 'block';
      document.body.style.overflow = "hidden";
    });

    // クリック外領域でカスタムメニューを非表示に
    document.addEventListener('click', function(event) {
      customMenu.style.display = 'none';
      document.body.style.overflow = "unset";
    });
  } else {
    console.log('Element with ID "targetElement" or "customMenu" not found.');
  }
});
