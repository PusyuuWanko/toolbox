/* ----- 保存係 -----
  ツールボックスの中で使うときは、ツールボックスの保存の窓口(storage-hub.js)に預けます。
  窓口が無い場所(file:// で直接開く等)では、今までどおり localStorage に直接保存します。
  どちらでも getItem/setItem/removeItem で使え、setItem は成功で true を返します
  (窓口では溢れた時の案内を窓口が出すので、アプリ側で重ねて出さないこと。viaHub で見分ける)。
  【このアプリの中で localStorage を直接触らないこと】窓口を通らない保存は、設定アプリの
  一覧にも書き出しにも出ず、保存先を「メモリ上だけ」にしても localStorage に残り続けます。 */
var cameraStorage = (function () {
  var store = (typeof PusyuuToolboxStorage !== "undefined")
    ? PusyuuToolboxStorage.app("ipCameraViewer", "IPカメラビューア")
    : null;
  var labels = {
    cameraViewerConfig: "カメラの設定",
    cameraViewerSounds: "動体検知の通知音",
    cameraViewerCompanionDismissUntil: "リレーアプリの案内を閉じた記録"
  };
  var result = null;

  if (store) {
    result = {
      viaHub: true,
      getItem: store.get,
      setItem: function (key, value) {
        return store.set(key, value, labels.hasOwnProperty(key) ? labels[key] : key);
      },
      removeItem: store.remove
    };
    /* 設定アプリで削除された・ファイルから読み込まれたときは、画面を読み直します。 */
    store.onChange(function () {
      window.location.reload();
    }, window);
  } else {
    result = {
      viaHub: false,
      getItem: function (key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
      },
      setItem: function (key, value) {
        try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
      },
      removeItem: function (key) {
        try { window.localStorage.removeItem(key); } catch (e) {}
      }
    };
  }

  return result;
})();

window.addEventListener("DOMContentLoaded", function () {
  /*
    ==========================================================================
    カメラビューア（ローカル / IE9〜11 想定・ES5のみ）
    - 既定は「スナップショットのタイマー取得」= 手動リロード不要・自己回復・IE可
    - 設定は <input type=file> + FileReader で読む（file:// でCORSに引っかからない）
    - localStorage は file:// では不安定なので try/catch の保険だけ
    - 動体検知：前フレームとの縮小画像の差分で検知し、選んだ音声（localStorage保存）を再生
      クロスオリジンでcanvasが汚染され直接読めない場合は、ユーザー自身のPC上で動く
      軽量なローカルリレーアプリ(ipcam-companion, assets/companion/)を経由することで
      回避する。http://127.0.0.1 へのアクセスはブラウザのMixed Content制限の対象外
      (loopback特例)であり、かつcompanion自身が正当なCORSヘッダーを返せるため、
      canvas読み取りが合法的にクリアできる。companionはユーザーのPC上で動くので
      「ブラウザから見えるローカルネットワークのカメラを見る」という設計思想は崩さない
      （サーバー側プロキシとは異なり、toolbox側には一切手を入れない）。
    ========================================================================== */

  /* ----- 既定の設定（ファイルが無くても動く。URLは自分の環境に書き換える） ----- */

  document.body.innerHTML = '\
    <div id="bar">\
      <button id="toggleRead" type="button">説明</button>\
      <button id="toggleCfg" type="button">設定</button>\
      <button id="toggleSound" type="button">🔔 サウンド</button>\
      <button id="pauseBtn" type="button">一時停止</button>\
      <span style="margin:0 4px 0 6px;">列</span>\
      <input id="cols" type="number" min="1" max="8" value="3">\
      <button id="applyCols" type="button">適用</button>\
      <span id="clock"></span>\
    </div>\
    <div id="companionBanner" class="companionBanner" style="display:none;"></div>\
    <div id="readme">\
      <div>\
        <p>このアプリではIPカメラなどの画像表示型ストリームを自動的に更新し表示します、またそれらを複数並べてみる事ができるアプリです、なお、機能的にのアプリではログイン機能がありません、ロックをあらかじめ外すか、別のタブであらかじめログインしておくことで閲覧できる可能性があります、また、このアプリでJOSNを用いて詳細に設定できますがそれゆえJOSNの構文知識とお使いになりたい機器のネットワーク的映像的なところの仕組みを知っておく必要があります。試行錯誤しながらうまく機能する機能を探すのが最もなとか道です。</p>\
        <p>type は "snapshot"（1枚のJPEGを定期取得。既定）/ "mjpeg"（連続画像ストリーム。IE非対応）/ "mp4"（動画ストリームをvideoタグで再生。カメラが自動でリロード・配信し続けるタイプ向け）から選べます。</p>\
        <p>各カメラの映像下に「動体検知」欄があります。チェックを入れ、あらかじめ「🔔 サウンド」から登録した音声を選ぶと、映像に動きがあった際にその音声を再生します（再生中に再度検知した場合は先頭に巻き戻して再生を続けます）。欄の右側のスライダーで、そのカメラの通知音の音量を変えられます（左端で消音）。カメラ映像を提供するサーバーがCORSに対応していない場合、ブラウザの制限(canvas汚染)により直接の動体検知が行えないことがあります（表示自体は継続されます）。Windows/macOS/Linux、またはAndroid(Termuxアプリ経由)をお使いの場合、画面上部に案内が表示されたら、軽量な「検知連携アプリ」をインストールしてください。ユーザー自身の端末上(127.0.0.1)でカメラ映像を中継し、ブラウザから正当にCORSをクリアして動体検知できるようになります。連携アプリはtoolbox.pusyuuwanko.com以外のWebページや他の端末からはアクセスできません。連携アプリの詳細と安全性の説明は案内バナーの「説明を読む」から確認できます。</p>\
      </div>\
    </div>\
    <div id="panel">\
      <div class="row">\
        JSON読み込み：<input id="file" type="file" accept=".json,application/json">\
        <button id="saveBtn" type="button">保存（ダウンロード）</button>\
        <span class="hint">保存は IE10/11・モダンブラウザ対応。古い環境は下のテキストをコピーして保存してください。</span>\
      </div>\
      <textarea id="cfgText" spellcheck="false"></textarea>\
      <div class="row" style="margin-top:8px;">\
        <button id="applyText" type="button">テキストを適用</button>\
        <span class="hint">type: "snapshot" | "mjpeg" | "mp4"。各カメラの motion: {enabled, sensitivity, soundId, volume(0〜100、省略時100)} で動体検知、cookie: "sessionid=..." でCookieログイン(検知連携アプリ経由の場合のみ有効)も設定できます。url に user:pass@ipaddress 形式でBasic認証を埋め込んだカメラは、ブラウザの仕様上クロスオリジンの直リンクでは常にブロックされるため(カメラ個体差ではありません)、検知連携アプリが起動していれば自動的にそちら経由に切り替わります(未起動の場合は映像欄にその旨を表示します)。それ以外の理由で特定のカメラだけ強制的に検知連携アプリ経由にしたい場合は useCompanion: true を追加してください。これらは他のカメラの設定から独立しており、該当しないカメラは常にブラウザから直接アクセスします(別タブでの事前ログインとの併用も引き続き可能)。</span>\
      </div>\
    </div>\
    <div id="soundPanel">\
      <div class="row">\
        音声ファイルを追加：<input id="soundFile" type="file" accept="audio/*">\
        <span class="hint">1ファイル最大1MB / 合計最大5MBまでこのブラウザに保存します。</span>\
      </div>\
      <div id="soundUsage"></div>\
      <div id="soundListContainer"></div>\
    </div>\
    <div id="grid"></div>\
  ';

  function setup() {
    var config = {
      columns: 3,
      cameras: [
        { name: "カメラ1", url: "http://192.168.1.10/snapshot.cgi", interval: 1000, type: "snapshot", motion: { enabled: false, sensitivity: 3, soundId: "", volume: 100 } },
        { name: "カメラ2", url: "http://192.168.1.11/snapshot.cgi", interval: 1000, type: "snapshot", motion: { enabled: false, sensitivity: 3, soundId: "", volume: 100 } },
        { name: "カメラ3", url: "http://192.168.1.12/snapshot.cgi", interval: 1000, type: "snapshot", motion: { enabled: false, sensitivity: 3, soundId: "", volume: 100 } }
      ]
    };

    var STORAGE_KEY = "cameraViewerConfig";
    var timers = [];       /* スナップショット各カメラの次回tick */
    var extraTimers = [];  /* MJPEG/MP4のwatchdog・動体検知サンプリングなど */
    var paused = false;

    /* ----- 動体検知の状態（カメラindexごと） ----- */
    var motionCanvas = [];
    var motionCtxArr = [];
    var motionPrevFrame = [];
    var motionUnavailable = [];
    var motionFlashUntil = [];
    var motionAudios = [];
    var motionAudioSoundId = [];
    var motionSelects = [];
    var motionStatusEls = [];
    var corsBlocked = [];  /* このカメラは直接canvas読み取り不可(CORS/companion未導入) */

    /* ----- ローカルリレー(ipcam-companion)によるCORS回避 -----
      ユーザー自身のPC上で http://127.0.0.1:<port> として動く軽量なGo製アプリ。
      詳細は assets/companion/README.html、及びscript.js先頭コメントを参照。
      COMPANION_PORTS は companion側 main.go の candidatePorts と同期させること。 */
    var COMPANION_PORTS = [58712, 58713, 58714];
    var COMPANION_EXPECTED_NAME = "ipcam-companion";
    var COMPANION_PROBE_TIMEOUT_MS = 700;
    var COMPANION_DOWNLOAD_BASE = "./assets/companion/dist/";
    var COMPANION_README_URL = "./assets/companion/README.html";
    var COMPANION_DISMISS_KEY = "cameraViewerCompanionDismissUntil";
    var companionState = { os: null, checked: false, available: false, baseUrl: null };

    /* ----- 音声ファイルの保存（localStorage、1件1MB/合計5MBまで） ----- */
    var SOUND_KEY = "cameraViewerSounds";
    var MAX_FILE_BYTES = 1048576;
    var MAX_TOTAL_BYTES = 5242880;
    var soundList = loadSoundList();

    function loadSoundList() {
      try {
        var s = cameraStorage.getItem(SOUND_KEY);
        if (s) { return JSON.parse(s); }
      } catch (e) {}
      return [];
    }
    function persistSoundList() {
      var saved = cameraStorage.setItem(SOUND_KEY, JSON.stringify(soundList));
      /* 窓口を通しているときは、溢れた案内を窓口が出します(ここで重ねて出さない)。 */
      if (!saved && !cameraStorage.viaHub) {
        alert("音声の保存に失敗しました（容量が一杯の可能性があります）。");
      }
      return saved;
    }
    function soundListTotalBytes() {
      var sum = 0, i;
      for (i = 0; i < soundList.length; i++) { sum += (soundList[i].size || 0); }
      return sum;
    }
    function getSoundById(id) {
      var i;
      for (i = 0; i < soundList.length; i++) {
        if (soundList[i].id === id) { return soundList[i]; }
      }
      return null;
    }
    function formatBytes(n) {
      return (n / 1024 / 1024).toFixed(2) + "MB";
    }
    function addSoundFile(file) {
      if (!file) { return; }
      if (file.size > MAX_FILE_BYTES) {
        alert("1ファイルにつき1MBまでです（このファイル: " + formatBytes(file.size) + "）。");
        return;
      }
      var used = soundListTotalBytes();
      if (used + file.size > MAX_TOTAL_BYTES) {
        alert("合計5MBの上限を超えるため追加できません。不要な音声を削除してください。");
        return;
      }
      if (typeof FileReader === "undefined") {
        alert("このブラウザはファイル読み込みに未対応です。");
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var entry = {
          id: "snd_" + (new Date()).getTime() + "_" + Math.floor(Math.random() * 1000000),
          name: file.name,
          size: file.size,
          dataUrl: reader.result,
          addedAt: (new Date()).getTime()
        };
        soundList.push(entry);
        if (persistSoundList()) {
          renderSoundPanel();
          refreshAllMotionSelects();
        } else {
          soundList.pop();
        }
      };
      reader.onerror = function () { alert("音声ファイルの読み込みに失敗しました。"); };
      reader.readAsDataURL(file);
    }
    function deleteSoundById(id) {
      var i;
      for (i = 0; i < soundList.length; i++) {
        if (soundList[i].id === id) { soundList.splice(i, 1); break; }
      }
      persistSoundList();
      renderSoundPanel();
      refreshAllMotionSelects();
    }

    function renderSoundPanel() {
      var usageEl = document.getElementById("soundUsage");
      if (!usageEl) { return; }
      var used = soundListTotalBytes();
      usageEl.innerHTML = "";
      usageEl.appendChild(document.createTextNode(
        "使用容量: " + formatBytes(used) + " / " + formatBytes(MAX_TOTAL_BYTES) + "（" + soundList.length + "件）"
      ));

      var container = document.getElementById("soundListContainer");
      container.innerHTML = "";
      if (!soundList.length) {
        var empty = document.createElement("div");
        empty.className = "hint";
        empty.appendChild(document.createTextNode("保存済みの音声はありません。"));
        container.appendChild(empty);
        return;
      }
      var i;
      for (i = 0; i < soundList.length; i++) {
        (function (snd) {
          var row = document.createElement("div");
          row.className = "soundRow";

          var nameSpan = document.createElement("span");
          nameSpan.className = "soundName";
          nameSpan.appendChild(document.createTextNode(snd.name + "（" + formatBytes(snd.size) + "）"));

          var testBtn = document.createElement("button");
          testBtn.type = "button";
          testBtn.appendChild(document.createTextNode("▶ 試聴"));
          testBtn.onclick = function () {
            var a = new Audio(snd.dataUrl);
            a.play();
          };

          var delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.appendChild(document.createTextNode("削除"));
          delBtn.onclick = function () {
            if (confirm("「" + snd.name + "」を削除しますか？")) { deleteSoundById(snd.id); }
          };

          row.appendChild(nameSpan);
          row.appendChild(testBtn);
          row.appendChild(delBtn);
          container.appendChild(row);
        })(soundList[i]);
      }
    }

    function populateSoundSelect(selectEl, selectedId) {
      selectEl.innerHTML = "";
      var noneOpt = document.createElement("option");
      noneOpt.value = "";
      noneOpt.appendChild(document.createTextNode("(音声未設定)"));
      selectEl.appendChild(noneOpt);
      var i;
      for (i = 0; i < soundList.length; i++) {
        var opt = document.createElement("option");
        opt.value = soundList[i].id;
        opt.appendChild(document.createTextNode(soundList[i].name));
        selectEl.appendChild(opt);
      }
      selectEl.value = selectedId || "";
    }

    function refreshAllMotionSelects() {
      var i;
      for (i = 0; i < motionSelects.length; i++) {
        if (motionSelects[i]) {
          var cam = config.cameras[i];
          populateSoundSelect(motionSelects[i], cam && cam.motion ? cam.motion.soundId : "");
        }
      }
    }

    /* ----- localStorage（file://では効かないことが多い。あくまで保険） ----- */
    function tryLoadStorage() {
      try { var s = cameraStorage.getItem(STORAGE_KEY); if (s) { return JSON.parse(s); } }
      catch (e) {}
      return null;
    }
    function trySaveStorage(obj) {
      try { cameraStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (e) {}
    }

    /* ----- タイマー全停止 ----- */
    function stopTimers() {
      var i;
      for (i = 0; i < timers.length; i++) { if (timers[i]) { clearTimeout(timers[i]); } }
      for (i = 0; i < extraTimers.length; i++) { if (extraTimers[i]) { clearTimeout(extraTimers[i]); } }
      timers = [];
      extraTimers = [];
    }

    /* ----- URLに認証情報(user:pass@)が埋め込まれているか -----
      現在のChromium/Firefoxは、クロスオリジンのサブリソース取得(img/video等。
      ナビゲーションではない)でURLにusername/passwordが埋め込まれていると、
      個々のカメラの実装や資格情報の中身に関係なく一律でリクエスト自体をブロックする
      (DevTools上は Status が "(blocked:origin)" と表示される。Referrer-Policyとは
      無関係で、strict-origin-when-cross-originのままでも起きる)。トップページの
      オリジン(toolbox.pusyuuwanko.com)とLAN内カメラのオリジンは常に別オリジンに
      なるため、直リンクである限りこのブロックは100%再現する仕様であり、
      「一部のカメラでたまたま通らない」ような個体差ではない。
      参照: Fetch Standard(https://fetch.spec.whatwg.org/) - main fetchのアルゴリズム
      内で、リクエストURLのusername/passwordが非空かつクロスオリジンの場合に
      ネットワークエラーとして扱う旨が規定されている。 */
    function camUrlHasEmbeddedCredentials(url) {
      if (!url) { return false; }
      var m = /^[a-z][a-z0-9+.\-]*:\/\/([^\/?#]*)/i.exec(url);
      return !!(m && m[1].indexOf("@") !== -1);
    }

    /* ----- このカメラ個別にcompanionリレーが必要か -----
      以前はcompanionState.available(=設定内のどれか1台でも動体検知が有効なら true)
      だけを見て「companionが動いているなら全カメラをリレー経由にする」実装だったため、
      動体検知を使っていない別のカメラ(例: 別タブで先にログインしておき、ブラウザの
      Cookieセッションで直接映すタイプ)まで巻き込んでリレー経由になってしまっていた。
      companionプロセスはブラウザのCookieを一切共有しない別プロセスなので、その巻き込み
      によって「別タブログインで映っていたカメラが動体検知を有効にした途端に映らなくなる」
      という退行が起きていた。ここでカメラ単位で本当にcompanionが要るかどうかを判定する。 */
    function camNeedsCompanion(cam) {
      if (cam.motion && cam.motion.enabled) { return true; }      // 動体検知にはCORSクリア済みのcanvas読み取りが要る
      if (cam.cookie) { return true; }                             // Cookieログインの中継はcompanion経由でしかできない
      if (cam.useCompanion) { return true; }                       // 明示的にリレー経由を指定
      if (camUrlHasEmbeddedCredentials(cam.url)) { return true; }  // 直リンクではブラウザに一律ブロックされるため自動判定
      return false;
    }

    /* ----- カメラの実取得先URL -----
      camNeedsCompanion()がtrueのカメラだけローカルリレー経由(CORSクリア済み)にし、
      それ以外は常にカメラURLへ直接アクセスする(companionが他のカメラのために
      起動していても、このカメラ自身が要らなければ巻き込まない)。いずれもキャッシュ
      回避のタイムスタンプを付与する。
      cam.cookie が設定されている場合のみ、Cookieログインをcompanion側で中継できるよう
      cookie パラメータを付与する（直リンク時はブラウザがJSからCookieヘッダーを設定
      できない）。
      URLに user:pass@ip 形式で埋め込んだBasic認証を持つカメラは、上のcamNeedsCompanion()
      が自動でcompanion経由に切り替える(companion側=relay.goがurl.Parse()した
      userinfoから SetBasicAuth() でヘッダーを組み立てて送るため、ブラウザの
      クロスオリジン埋め込み認証ブロックを迂回できる)。companionが未導入・未起動の
      場合はこの自動切り替えが働かず、直リンクのままブラウザに一律ブロックされる
      (startSnapshot/startMjpeg/startMp4側でその旨をステータス表示する)。 */
    function buildRequestUrl(cam) {
      if (companionState.available && camNeedsCompanion(cam)) {
        var url = companionState.baseUrl + "/relay?url=" + encodeURIComponent(cam.url) + "&t=" + (new Date()).getTime();
        if (cam.cookie) { url += "&cookie=" + encodeURIComponent(cam.cookie); }
        return url;
      }
      var sep = (cam.url.indexOf("?") >= 0) ? "&" : "?";
      return cam.url + sep + "t=" + (new Date()).getTime();
    }

    /* ----- 直リンクのままではブラウザに一律ブロックされることが確定しているか -----
      (embedded credentials + companion未導入/未起動)の組み合わせの時だけtrueになる。
      この場合は毎tickネットワークへ投げても無駄にブロックされるだけなので、
      呼び出し側でその旨を案内表示に留める。 */
    function camBlockedWithoutCompanion(cam) {
      return camUrlHasEmbeddedCredentials(cam.url) && !companionState.available;
    }

    /* ----- companionを必要とするカメラが1件でもあるか(camNeedsCompanion参照) -----
      以前は動体検知の有無だけで判定していたが、cookieログインやuseCompanion指定だけの
      カメラ(動体検知は使わない)でもcompanionの起動確認(detectCompanion)が必要なため、
      camNeedsCompanion()と同じ条件に揃えた。 */
    function configNeedsCompanion() {
      var i;
      for (i = 0; i < config.cameras.length; i++) {
        if (camNeedsCompanion(config.cameras[i])) { return true; }
      }
      return false;
    }

    /* ----- companion案内の対象プラットフォーム判定 -----
      Android は Termux(F-Droid配布の正規サードパーティ端末アプリ)経由でcompanionの
      linux/arm64バイナリを実行できるため案内対象に含める。iOSはサードパーティアプリが
      任意のローカルサーバーを常駐実行できる仕組みが無いため対象外。 */
    function detectDesktopOS() {
      var ua = navigator.userAgent || "";
      if (/iPhone|iPad|iPod|Windows Phone/i.test(ua)) { return null; }
      if (/Android/i.test(ua)) { return "android"; }
      if (/CrOS/i.test(ua)) { return null; } // ChromeOSはTermux相当の常駐実行手段が無いため対象外
      if (/Windows NT/i.test(ua)) { return "windows"; }
      if (/Macintosh|Mac OS X/i.test(ua)) { return "mac"; }
      if (/Linux/i.test(ua)) { return "linux"; }
      return null;
    }

    /* ----- companionの死活確認（候補ポートへ並列probe、タイムアウト付き） ----- */
    function probeCompanionPort(port, onDone) {
      if (!(window.fetch && window.AbortController)) { onDone(null); return; }
      var url = "http://127.0.0.1:" + port + "/status";
      var settled = false;
      var ctrl = new AbortController();

      var timer = setTimeout(function () {
        if (settled) { return; }
        settled = true;
        ctrl.abort();
        onDone(null);
      }, COMPANION_PROBE_TIMEOUT_MS);

      fetch(url, { signal: ctrl.signal, cache: "no-store" })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          if (settled) { return; }
          settled = true; clearTimeout(timer);
          onDone((data && data.ok && data.name === COMPANION_EXPECTED_NAME) ? port : null);
        })
        .catch(function () {
          if (settled) { return; }
          settled = true; clearTimeout(timer);
          onDone(null);
        });
    }

    function detectCompanion(callback) {
      companionState.os = detectDesktopOS();
      if (!companionState.os) { companionState.checked = true; callback(); return; }

      var remaining = COMPANION_PORTS.length, done = false, i;
      function finish(port) {
        if (done) { return; }
        if (port) {
          done = true;
          companionState.available = true;
          companionState.baseUrl = "http://127.0.0.1:" + port;
          companionState.checked = true;
          callback();
          return;
        }
        remaining--;
        if (remaining === 0) {
          done = true;
          companionState.available = false;
          companionState.checked = true;
          callback();
        }
      }
      for (i = 0; i < COMPANION_PORTS.length; i++) { probeCompanionPort(COMPANION_PORTS[i], finish); }
    }

    /* ----- companion未導入時のインストール案内バナー ----- */
    function osLabel(os) {
      if (os === "windows") { return "Windows"; }
      if (os === "mac") { return "macOS"; }
      if (os === "linux") { return "Linux"; }
      if (os === "android") { return "Android (Termux)"; }
      return "";
    }
    function companionDownloadLinks(os) {
      if (os === "windows") { return [["ipcam-companion-windows-amd64.exe", "Windows (64bit)"]]; }
      if (os === "mac") {
        return [
          ["ipcam-companion-darwin-arm64", "Mac (Apple Silicon)"],
          ["ipcam-companion-darwin-amd64", "Mac (Intel)"]
        ];
      }
      if (os === "linux") { return [["ipcam-companion-linux-amd64", "Linux (64bit)"]]; }
      if (os === "android") { return [["ipcam-companion-linux-arm64", "Android用 (Termuxで実行)"]]; }
      return [];
    }
    function isBannerDismissed() {
      try {
        var v = cameraStorage.getItem(COMPANION_DISMISS_KEY);
        return !!v && (new Date()).getTime() < parseInt(v, 10);
      } catch (e) { return false; }
    }
    function dismissBanner() {
      try { cameraStorage.setItem(COMPANION_DISMISS_KEY, "" + ((new Date()).getTime() + 86400000)); } catch (e) {}
    }

    function updateCompanionBanner() {
      var el = document.getElementById("companionBanner");
      if (!el) { return; }

      if (!companionState.os || companionState.available) { el.style.display = "none"; return; }

      var blockedCount = 0, i;
      for (i = 0; i < corsBlocked.length; i++) { if (corsBlocked[i]) { blockedCount++; } }
      if (blockedCount === 0 || isBannerDismissed()) { el.style.display = "none"; return; }

      el.innerHTML = "";
      el.style.display = "block";

      var msg = document.createElement("span");
      msg.appendChild(document.createTextNode(
        blockedCount + "件のカメラで、ブラウザの制限(CORS)により動体検知が行えません。" +
        "お使いのPC(" + osLabel(companionState.os) + ")向けの軽量な検知連携アプリをインストールすると解決します。 "
      ));
      el.appendChild(msg);

      var links = companionDownloadLinks(companionState.os), j;
      for (j = 0; j < links.length; j++) {
        (function (file, label) {
          var a = document.createElement("a");
          a.href = COMPANION_DOWNLOAD_BASE + file;
          a.appendChild(document.createTextNode(label));
          el.appendChild(a);
        })(links[j][0], links[j][1]);
      }

      var readme = document.createElement("a");
      readme.href = COMPANION_README_URL;
      readme.target = "_blank";
      readme.appendChild(document.createTextNode("説明を読む"));
      el.appendChild(readme);

      var dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.appendChild(document.createTextNode("後で(24時間非表示)"));
      dismiss.onclick = function () { dismissBanner(); el.style.display = "none"; };
      el.appendChild(dismiss);
    }

    /* ----- 設定を適用してグリッド再構築 ----- */
    function applyConfig(cfg) {
      if (!cfg || !cfg.cameras || !cfg.cameras.length) { alert("設定が不正です（cameras がありません）。"); return; }
      config = cfg;
      if (!config.columns) { config.columns = 3; }
      document.getElementById("cols").value = config.columns;
      document.getElementById("cfgText").value = JSON.stringify(config, null, 2);
      trySaveStorage(config);
      if (configNeedsCompanion() && !companionState.checked) {
        detectCompanion(function () { buildGrid(); });
      } else {
        buildGrid();
      }
    }

    function persistConfigSoft() {
      trySaveStorage(config);
      var cfgTextEl = document.getElementById("cfgText");
      if (cfgTextEl) { cfgTextEl.value = JSON.stringify(config, null, 2); }
    }

    function ensureCamMotion(idx) {
      if (!config.cameras[idx].motion) {
        config.cameras[idx].motion = { enabled: false, sensitivity: 3, soundId: "", volume: 100 };
      }
      return config.cameras[idx].motion;
    }

    function setMotionStatusText(idx, text) {
      if (motionStatusEls[idx] && motionStatusEls[idx].firstChild) {
        motionStatusEls[idx].firstChild.nodeValue = text;
      }
    }

    function ensureMotionCtx(idx, w, h) {
      var ctx = motionCtxArr[idx];
      if (!ctx) {
        var mc = document.createElement("canvas");
        mc.width = w; mc.height = h;
        motionCanvas[idx] = mc;
        /* getImageDataを毎回呼ぶため、都度読み取り前提の最適化ヒントを指定 */
        ctx = mc.getContext("2d", { willReadFrequently: true });
        motionCtxArr[idx] = ctx;
      }
      return ctx;
    }

    /* 既定は無効。毎tick(既定1秒間隔)ごとに出力され続けるため、DevToolsの
       Consoleを開いたまま長時間稼働させるとログが数十万件単位で溜まり、
       レンダラーのメインスレッドが詰まって全カメラが「応答なし」になる
       (実際にはカメラ側ではなくビューア側の描画が固まっているだけ)原因になる。
       デバッグ時のみ true にすること。 */
    var MOTION_DEBUG_LOG = false;
    function logMotion(msg) {
      if (MOTION_DEBUG_LOG && window.console && window.console.log) { window.console.log("[motion] " + msg); }
    }

    /* ----- 縮小フレーム同士の画素差分から動体を判定し、必要なら音声を再生 ----- */
    function runMotionDiff(idx, data, w, h, cam) {
      var prev = motionPrevFrame[idx];
      motionPrevFrame[idx] = data;
      if (!prev) {
        setMotionStatusText(idx, "基準取得中…");
        return;
      }

      var diffCount = 0;
      var total = w * h;
      var i, dr, dg, db;
      for (i = 0; i < data.length; i += 4) {
        dr = data[i] - prev[i]; if (dr < 0) { dr = -dr; }
        dg = data[i + 1] - prev[i + 1]; if (dg < 0) { dg = -dg; }
        db = data[i + 2] - prev[i + 2]; if (db < 0) { db = -db; }
        if ((dr + dg + db) > 60) { diffCount++; }
      }
      var ratio = (diffCount / total) * 100;
      var threshold = (cam.motion.sensitivity != null) ? cam.motion.sensitivity : 3;

      logMotion("cam" + idx + " 差分=" + ratio.toFixed(1) + "% 閾値=" + threshold + "%");

      if (ratio >= threshold) {
        setMotionStatusText(idx, "検知! (" + ratio.toFixed(1) + "%)");
        motionFlashUntil[idx] = (new Date()).getTime() + 1500;
        playMotionSound(idx, cam);
      } else if (!motionFlashUntil[idx] || (new Date()).getTime() > motionFlashUntil[idx]) {
        setMotionStatusText(idx, "差分" + ratio.toFixed(1) + "%");
      }
    }

    /* ----- 動体検知：カメラ画像/映像を縮小canvasに描画して比較 -----
      同一オリジンでない相手だとgetImageDataで例外になる（canvas汚染）。
      companion未導入・未対応OSの場合はそのままCORS非対応として表示するのみ。 */
    function processMotionFrame(idx, srcEl, cam) {
      if (!cam.motion || !cam.motion.enabled) { return; }

      /* まだ実フレームが無い（0x0）状態で読んでも無意味な比較になるためスキップ */
      if (srcEl.tagName === "IMG" && !srcEl.naturalWidth) { return; }
      if (srcEl.tagName === "VIDEO" && !srcEl.videoWidth) { return; }

      var w = 40, h = 30;
      var ctx = ensureMotionCtx(idx, w, h);
      var data;
      try {
        ctx.drawImage(srcEl, 0, 0, w, h);
        data = ctx.getImageData(0, 0, w, h).data;
      } catch (e) {
        if (!motionUnavailable[idx]) {
          motionUnavailable[idx] = true;
          corsBlocked[idx] = true;
          motionPrevFrame[idx] = null;
          setMotionStatusText(idx, companionState.available ? "検知不可" : "検知不可(CORS)");
          logMotion("cam" + idx + " 読み取り失敗: " + (e && e.name ? e.name : e) + " " + (e && e.message ? e.message : ""));
          updateCompanionBanner();
        }
        return;
      }
      motionUnavailable[idx] = false;
      runMotionDiff(idx, data, w, h, cam);
    }

    /* ----- 通知音の音量(カメラごと。motion.volume に 0〜100 で持つ) -----
      volume が無い設定(この機能より前に保存した設定・手書きのJSON)は 100 として扱う。
      【0 を「未設定」と見なさないこと】0 は利用者が選んだ「消音」なので、
      v || 100 のように書くと消音にしたカメラが最大音量で鳴り出す。
      数値でない・範囲外の値は、鳴らないより鳴る方が安全なので 100 / 端の値に倒す。 */
    function motionVolumeOf(motionCfg) {
      var v = motionCfg ? parseFloat(motionCfg.volume) : NaN;
      if (isNaN(v)) { v = 100; }
      if (v < 0) { v = 0; }
      if (v > 100) { v = 100; }
      return v;
    }

    /* ----- 検知時の音声再生：再生中なら先頭にシークして続行、停止中なら先頭から再生 ----- */
    function playMotionSound(idx, cam) {
      if (!cam.motion.soundId) { return; }
      var sound = getSoundById(cam.motion.soundId);
      if (!sound) { return; }

      var audio = motionAudios[idx];
      if (!audio || motionAudioSoundId[idx] !== cam.motion.soundId) {
        audio = new Audio(sound.dataUrl);
        motionAudios[idx] = audio;
        motionAudioSoundId[idx] = cam.motion.soundId;
      }
      try {
        /* 鳴らすたびに設定から入れ直す(再生中にスライダーを動かしても次の検知から効く) */
        audio.volume = motionVolumeOf(cam.motion) / 100;
        audio.currentTime = 0;
        var p = audio.play();
        if (p && p.catch) { p.catch(function () {}); }
      } catch (e) {}
    }

    /* ----- グリッド構築 ----- */
    function buildGrid() {
      stopTimers();
      motionCanvas = [];
      motionCtxArr = [];
      motionPrevFrame = [];
      motionUnavailable = [];
      motionFlashUntil = [];
      motionAudios = [];
      motionAudioSoundId = [];
      motionSelects = [];
      motionStatusEls = [];
      corsBlocked = [];

      var grid = document.getElementById("grid");
      grid.innerHTML = "";
      var cols = config.columns || 3;
      var wpct = 100 / cols;
      var i;
      for (i = 0; i < config.cameras.length; i++) {
        (function (idx) {
          var cam = config.cameras[idx];

          var cell = document.createElement("div");
          cell.className = "cell";
          cell.style.width = wpct + "%";

          var frame = document.createElement("div");
          frame.className = "frame";

          var mediaEl;
          if (cam.type === "mp4" || cam.type === "video") {
            mediaEl = document.createElement("video");
            mediaEl.muted = true;
            mediaEl.autoplay = true;
            mediaEl.playsInline = true;
          } else {
            mediaEl = document.createElement("img");
            mediaEl.alt = cam.name || ("cam" + idx);
          }
          /* このカメラが実際にcompanion経由になる時だけ付与する(camNeedsCompanion()と
             常に同じ条件にすること)。直リンクのカメラに付けるとCORS非対応カメラの
             表示自体が失敗する退行になる(crossOrigin指定はCORSモードでの取得を強制する
             ため、応答にAccess-Control-Allow-Originが無いLANカメラは読み込み自体が
             失敗する)。以前はcompanionState.availableだけで判定しており、他のカメラの
             動体検知のためにcompanionが起動しているだけで無関係なカメラまで巻き込んで
             表示不能にしていた。 */
          if (companionState.available && camNeedsCompanion(cam)) { mediaEl.crossOrigin = "anonymous"; }

          var label = document.createElement("div");
          label.className = "label";
          label.appendChild(document.createTextNode(cam.name || ("カメラ" + (idx + 1))));

          var status = document.createElement("div");
          status.className = "status wait";
          status.appendChild(document.createTextNode("接続中…"));

          var ts = document.createElement("div");
          ts.className = "ts";

          frame.appendChild(mediaEl);
          frame.appendChild(label);
          frame.appendChild(status);
          frame.appendChild(ts);
          cell.appendChild(frame);

          /* ----- 動体検知の操作行 ----- */
          var motionCfg = cam.motion || { enabled: false, sensitivity: 3, soundId: "", volume: 100 };

          var motionRow = document.createElement("div");
          motionRow.className = "motionCtrl";

          var motionChkId = "motionChk" + idx;
          var motionChk = document.createElement("input");
          motionChk.type = "checkbox";
          motionChk.id = motionChkId;
          motionChk.checked = !!motionCfg.enabled;

          var motionChkLabel = document.createElement("label");
          motionChkLabel.htmlFor = motionChkId;
          motionChkLabel.appendChild(document.createTextNode("動体検知"));

          var motionSel = document.createElement("select");
          populateSoundSelect(motionSel, motionCfg.soundId);
          motionSelects[idx] = motionSel;

          var motionThresh = document.createElement("input");
          motionThresh.type = "number";
          motionThresh.className = "motionThresh";
          motionThresh.min = "0.5";
          motionThresh.max = "50";
          motionThresh.step = "0.5";
          motionThresh.title = "感度(%)。小さいほど敏感";
          motionThresh.value = (motionCfg.sensitivity != null) ? motionCfg.sensitivity : 3;

          /* 音量スライダー。type=range の無い古いブラウザ(IE9)では数値の入力欄になるだけで、
             値の読み書きは同じように動く */
          var motionVol = document.createElement("input");
          motionVol.type = "range";
          motionVol.className = "motionVol";
          motionVol.min = "0";
          motionVol.max = "100";
          motionVol.step = "5";
          motionVol.value = motionVolumeOf(motionCfg);
          motionVol.title = "通知音の音量 " + motionVol.value + "%";

          var motionStatus = document.createElement("span");
          motionStatus.className = "motionStatus";
          motionStatus.appendChild(document.createTextNode(""));
          motionStatusEls[idx] = motionStatus;

          motionChk.onchange = function () {
            ensureCamMotion(idx).enabled = motionChk.checked;
            motionPrevFrame[idx] = null;
            persistConfigSoft();
            if (motionChk.checked && !companionState.checked) {
              detectCompanion(function () { buildGrid(); });
            }
          };
          motionSel.onchange = function () {
            ensureCamMotion(idx).soundId = motionSel.value;
            persistConfigSoft();
          };
          motionThresh.onchange = function () {
            var v = parseFloat(motionThresh.value);
            if (!(v > 0)) { v = 3; motionThresh.value = v; }
            ensureCamMotion(idx).sensitivity = v;
            persistConfigSoft();
          };
          /* 保存はつまみを離した時(change)だけ。動かしている最中(input)にも保存すると
             1回のドラッグで何十回も保存が走る */
          motionVol.oninput = function () {
            motionVol.title = "通知音の音量 " + motionVolumeOf({ volume: motionVol.value }) + "%";
          };
          motionVol.onchange = function () {
            var v = motionVolumeOf({ volume: motionVol.value });
            motionVol.value = v;
            motionVol.title = "通知音の音量 " + v + "%";
            ensureCamMotion(idx).volume = v;
            persistConfigSoft();
          };

          motionRow.appendChild(motionChk);
          motionRow.appendChild(motionChkLabel);
          motionRow.appendChild(motionSel);
          motionRow.appendChild(motionThresh);
          motionRow.appendChild(motionVol);
          motionRow.appendChild(motionStatus);
          cell.appendChild(motionRow);

          grid.appendChild(cell);

          if (cam.type === "mjpeg") {
            startMjpeg(idx, mediaEl, status, ts, cam);
          } else if (cam.type === "mp4" || cam.type === "video") {
            startMp4(idx, mediaEl, status, ts, cam);
          } else {
            startSnapshot(idx, mediaEl, status, ts, cam);
          }
        })(i);
      }
      updateCompanionBanner();
    }

    /* ----- スナップショット方式（本命） -----
      裏のImageに読み込み→成功したら表示imgへ差し替え（チラつき低減）
      ?t= でキャッシュ回避 / onerror・タイムアウトでも次tickで自動リトライ */
    function startSnapshot(idx, img, status, ts, cam) {
      var interval = cam.interval || 1000;

      function setStatus(cls, text) {
        status.className = "status " + cls;
        status.firstChild.nodeValue = text;
      }

      function tick() {
        if (paused) { timers[idx] = setTimeout(tick, 500); return; }

        /* companion未導入/未起動のまま認証情報埋め込みURLへ直リンクすると、
           ブラウザに毎回確実にブロックされるだけなので、無駄なリトライ表示
           ("エラー"連発で原因が伝わらない)にせず理由をそのまま案内する。
           companionが後から起動された場合に気付けるよう監視は継続する。 */
        if (camBlockedWithoutCompanion(cam)) {
          setStatus("ng", "認証URLは検知連携アプリの起動が必要です");
          timers[idx] = setTimeout(tick, interval);
          return;
        }

        var loader = new Image();
        var done = false;
        if (companionState.available && camNeedsCompanion(cam)) { loader.crossOrigin = "anonymous"; }

        var guard = setTimeout(function () {          /* 無応答の打ち切り */
          if (done) { return; }
          done = true;
          /* 読み込み中のImageを明示的に中断する。放置すると、たまたま応答が
             遅いだけのタイミングでtickのたびに裏で読み込みが残り続け、同一
             オリジンへのブラウザの同時接続数上限を静かに消費してしまう
             (limitに達すると新規リクエストが詰まり、全カメラが応答なしに
             見える原因になり得る)。 */
          loader.onload = null;
          loader.onerror = null;
          loader.src = "";
          setStatus("ng", "応答なし");
          timers[idx] = setTimeout(tick, interval);
        }, Math.max(interval, 4000));

        loader.onload = function () {
          if (done) { return; }
          done = true; clearTimeout(guard);
          img.src = loader.src;                        /* 読み終えてから差し替え */
          setStatus("ok", "受信");
          ts.innerHTML = "";
          ts.appendChild(document.createTextNode(nowStr()));
          processMotionFrame(idx, loader, cam);
          timers[idx] = setTimeout(tick, interval);
        };
        loader.onerror = function () {
          if (done) { return; }
          done = true; clearTimeout(guard);
          setStatus("ng", "エラー");
          timers[idx] = setTimeout(tick, interval);
        };

        loader.src = buildRequestUrl(cam);
      }
      tick();
    }

    /* ----- MJPEG方式（おまけ・IE非対応） -----
      ストリームをimgに直接。onerrorで貼り直し。watchdog>0 なら定期貼り直し（凍結対策）
      動体検知は連続ストリームのため一定間隔でサンプリングして差分をとる */
    function startMjpeg(idx, img, status, ts, cam) {
      function setStatus(cls, text) {
        status.className = "status " + cls;
        status.firstChild.nodeValue = text;
      }
      function attach() {
        if (camBlockedWithoutCompanion(cam)) {
          setStatus("ng", "認証URLは検知連携アプリの起動が必要です");
          timers[idx] = setTimeout(attach, 2000);
          return;
        }
        img.src = buildRequestUrl(cam);
        setStatus("ok", "配信中");
        ts.innerHTML = ""; ts.appendChild(document.createTextNode(nowStr()));
      }
      img.onerror = function () {
        setStatus("ng", "切断→再接続");
        timers[idx] = setTimeout(attach, 2000);
      };
      attach();

      var wd = cam.watchdog || 0; /* 秒。0で無効 */
      if (wd > 0) {
        (function loop() {
          extraTimers.push(setTimeout(function () {
            if (!paused) { attach(); }
            loop();
          }, wd * 1000));
        })();
      }

      (function motionLoop() {
        extraTimers.push(setTimeout(function () {
          if (!paused) { processMotionFrame(idx, img, cam); }
          motionLoop();
        }, 800));
      })();
    }

    /* ----- MP4/動画ストリーム方式（自動でリロードされ続けるタイプのカメラ向け） -----
      videoタグに直接再生させる。切断・停止時は貼り直して再接続する。
      動体検知は一定間隔で現在のフレームをサンプリングして差分をとる。 */
    function startMp4(idx, videoEl, status, ts, cam) {
      function setStatus(cls, text) {
        status.className = "status " + cls;
        status.firstChild.nodeValue = text;
      }
      function attach() {
        if (camBlockedWithoutCompanion(cam)) {
          setStatus("ng", "認証URLは検知連携アプリの起動が必要です");
          timers[idx] = setTimeout(attach, 2000);
          return;
        }
        videoEl.src = buildRequestUrl(cam);
        try { videoEl.load(); } catch (e) {}
        var p = videoEl.play();
        if (p && p.catch) { p.catch(function () {}); }
        setStatus("ok", "配信中");
        ts.innerHTML = ""; ts.appendChild(document.createTextNode(nowStr()));
      }
      function reconnect() {
        setStatus("ng", "切断→再接続");
        timers[idx] = setTimeout(attach, 2000);
      }
      videoEl.onerror = reconnect;
      videoEl.onstalled = reconnect;
      videoEl.onended = attach; /* ストリームが終端したら貼り直して再接続 */
      attach();

      var wd = cam.watchdog || 0;
      if (wd > 0) {
        (function loop() {
          extraTimers.push(setTimeout(function () {
            if (!paused) { attach(); }
            loop();
          }, wd * 1000));
        })();
      }

      (function motionLoop() {
        extraTimers.push(setTimeout(function () {
          if (!paused) { processMotionFrame(idx, videoEl, cam); }
          motionLoop();
        }, 800));
      })();
    }

    /* ----- 時刻表示 ----- */
    function nowStr() {
      var d = new Date();
      function p(n) { return (n < 10 ? "0" : "") + n; }
      return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    }

    /* ----- 設定の保存（IE10/11=msSaveBlob / モダン=aダウンロード / 古い=手動） ----- */
    function saveConfig() {
      var text = JSON.stringify(config, null, 2);
      try {
        var blob = new Blob([text], { type: "application/json" });
        if (window.navigator && window.navigator.msSaveBlob) {          /* IE10/11 */
          window.navigator.msSaveBlob(blob, "cameras.json"); return;
        }
        if (window.URL && window.URL.createObjectURL) {                 /* モダン */
          var a = document.createElement("a");
          a.href = window.URL.createObjectURL(blob);
          a.download = "cameras.json";
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          return;
        }
      } catch (e) {}
      alert("この環境では自動保存できません。設定欄のテキストをコピーして手動で保存してください。");
    }

    /* ----- 起動 ----- */
    function boot() {
      document.getElementById("toggleRead").onclick = function () {
        var read = document.getElementById("readme");
        read.style.display = (read.style.display === "block") ? "none" : "block";
      };
      document.getElementById("toggleCfg").onclick = function () {
        var p = document.getElementById("panel");
        p.style.display = (p.style.display === "block") ? "none" : "block";
      };
      document.getElementById("toggleSound").onclick = function () {
        var p = document.getElementById("soundPanel");
        p.style.display = (p.style.display === "block") ? "none" : "block";
      };
      document.getElementById("pauseBtn").onclick = function () {
        paused = !paused;
        this.firstChild.nodeValue = paused ? "再開" : "一時停止";
      };
      document.getElementById("applyCols").onclick = function () {
        var c = parseInt(document.getElementById("cols").value, 10);
        if (c > 0) { config.columns = c; applyConfig(config); }
      };
      document.getElementById("applyText").onclick = function () {
        try { applyConfig(JSON.parse(document.getElementById("cfgText").value)); }
        catch (e) { alert("JSON解析エラー: " + e.message); }
      };
      document.getElementById("saveBtn").onclick = saveConfig;

      document.getElementById("soundFile").onchange = function (e) {
        var files = (e && e.target && e.target.files) ? e.target.files : this.files;
        if (files && files[0]) { addSoundFile(files[0]); }
        this.value = "";
      };

      var fileEl = document.getElementById("file");
      fileEl.onchange = function (e) {
        var files = (e && e.target && e.target.files) ? e.target.files : this.files;
        if (!files || !files[0]) { return; }
        if (typeof FileReader === "undefined") {
          alert("このブラウザはファイル読み込みに未対応です。設定欄に貼り付けて『テキストを適用』を使ってください。");
          return;
        }
        var r = new FileReader();
        r.onload = function () {
          try { applyConfig(JSON.parse(r.result)); }
          catch (err) { alert("JSON解析エラー: " + err.message); }
        };
        r.readAsText(files[0]);
      };

      /* 時計 */
      setInterval(function () {
        document.getElementById("clock").innerHTML = "";
        document.getElementById("clock").appendChild(document.createTextNode(nowStr()));
      }, 1000);

      /* 前回設定の復元（file://では効かないことも多い） */
      var saved = tryLoadStorage();
      if (saved) { config = saved; }

      document.getElementById("cfgText").value = JSON.stringify(config, null, 2);
      document.getElementById("cols").value = config.columns || 3;
      renderSoundPanel();

      if (configNeedsCompanion()) {
        detectCompanion(function () { buildGrid(); });
      } else {
        buildGrid();
      }
    }

    if (window.addEventListener) { window.addEventListener("load", boot, false); }
    else if (window.attachEvent) { window.attachEvent("onload", boot); }  /* 一応IE8 */
  }
  setup();
});
