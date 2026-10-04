/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 1.0.0     |
  |  © 2026 By PusyuuWanko/       |
  |  License: MIT License         |
  |  toolbox 保存の窓口 (ES5 only)  |
----------------------------------*
  ツールボックスの各アプリの保存を取りまとめる窓口です。アプリは localStorage を
  直接触らず、ここで受け取る「取っ手」に保存・読み込み・削除を頼みます。

  【使い方(アプリ側)】
    var store = PusyuuToolboxStorage.app("ClockWithTimeSignal", "時報時計");
    store.set("alarms", JSON.stringify(list), "アラームの一覧"); // 成功で true
    var raw = store.get("alarms");                                // 無ければ null
    store.remove("alarms");
    store.onChange(function () { ... }, window);  // 設定アプリでの削除・ファイル読み込みの後に呼ばれる
  値は localStorage と同じく文字列だけを扱います(付け替えを置き換えだけで済ませるため)。
  第3引数の名札は、設定アプリの削除一覧に出す「この項目は何か」です。省略すると
  前回の名札を保ち、一度も付けていなければキー名がそのまま出ます。

  【窓口は1つだけ】ツールボックスの中で開いたアプリ(iframe)は、親のツールボックス
  画面の窓口をそのまま使います。アプリを直接開いたときだけ、そのページに窓口を作ります。
  「メモリ上だけ」のデータは窓口のあるページが持つので、アプリの枠を閉じても消えず、
  ツールボックスそのものを閉じたときに消えます。
  【アプリ側で窓口を作り直さないこと】各枠が自分の窓口を持つと、メモリ上のデータが
  枠を閉じた瞬間に消え、設定アプリからも見えなくなります。

  古いブラウザでも読めるよう、ES5構文のみで書きます(legacy-utils.js と同じ方針)。
******************************************/

var PusyuuToolboxStorage = (function () {
  var parentHub = null;

  // 親(ツールボックス画面)に窓口があれば、それを使います。別ドメインの親を覗くと
  // 例外になるので try で囲みます(その場合は単体で開かれたのと同じ扱い)。
  try {
    if (window.parent && window.parent !== window && window.parent.PusyuuToolboxStorage && window.parent.PusyuuToolboxStorage.isHub) {
      parentHub = window.parent.PusyuuToolboxStorage;
    }
  } catch (e) {
    parentHub = null;
  }

  if (parentHub) {
    return parentHub;
  }

  // -------------------------------------------------------------------
  // ここから下は、窓口を持つページ(ツールボックス画面か、単体で開いたアプリ)
  // でだけ動きます。
  // -------------------------------------------------------------------

  // 【名札(接頭辞)を外さないこと】localStorage はドメイン単位で1つしか無く、
  // pusyuuwanko.com/toolbox と同じドメインの他のページが同じ入れ物を使っています。
  // 窓口が「自分の分」を見分けられるのはこの接頭辞だけです。外したり、接頭辞を見ずに
  // localStorage.key() の全件を扱ったりすると、他のページのデータまで一覧・削除・
  // 書き出しの対象に巻き込みます。localStorage.clear() も同じ理由で使いません。
  // 同じドメインにツールボックスを2つ置いた場合は、同じデータを共有します(意図どおり。
  // 置き場所ごとに変えると、フォルダを移しただけでデータが見えなくなるため)。
  var DATA_PREFIX = "PusyuuToolbox:";
  var META_KEY = "PusyuuToolbox#meta";
  var APP_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

  // 書き出すファイルの印と形式の版。読み込みはこの2つが合うものだけを受け付けます。
  // 【形式を変えたら版を上げること】古い版のファイルも読めるようにしておくため、
  // 読み込み側で版ごとに扱いを分けます(今は版1だけ)。
  var FILE_FORMAT = "pusyuu-toolbox-storage";
  var FILE_VERSION = 1;

  var hubWindow = window;
  var memoryStore = {};
  // アプリごとの「中身が外から変わった」知らせ先(読み込み・削除・切り替えの後に呼ぶ)。
  var changeListeners = {};
  // メモリ上のデータに、まだファイルへ書き出していない変更があるか。
  var memoryDirty = false;
  var noticeElement = null;

  function dataKey(appId, key) {
    return DATA_PREFIX + appId + ":" + key;
  }

  // 保存の失敗を2種類に分けます。案内の中身が違うためです。
  //   quota       … 容量がいっぱい(不要なデータを消せば入る可能性がある)
  //   unavailable … 保存そのものが禁止・使えない(消しても入らない)
  // 容量超過の例外名はブラウザごとに違います(Firefox は NS_ERROR_DOM_QUOTA_REACHED、
  // 古いブラウザは名前が無く code 22 / 1014 だけ)。
  function classifyError(error) {
    var kind = "unavailable";

    if (error && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || error.code === 22 || error.code === 1014)) {
      kind = "quota";
    }

    return kind;
  }

  function readMeta() {
    var meta = { apps: {} };

    try {
      var parsed = JSON.parse(localStorage.getItem(META_KEY) || "null");
      if (parsed && typeof parsed === "object" && parsed.apps && typeof parsed.apps === "object") {
        meta = parsed;
      }
    } catch (e) {
      // 壊れている・読めない場合は空として扱います。
    }

    return meta;
  }

  function writeMeta(meta) {
    var result = { ok: true, error: "" };

    try {
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (e) {
      result = { ok: false, error: classifyError(e) };
    }

    return result;
  }

  function modeOf(meta, appId) {
    return (meta.apps[appId] && meta.apps[appId].mode === "memory") ? "memory" : "local";
  }

  function titleOf(meta, appId) {
    return (meta.apps[appId] && meta.apps[appId].title) ? meta.apps[appId].title : appId;
  }

  function localKeysOf(appId) {
    var prefix = DATA_PREFIX + appId + ":";
    var keys = [];

    try {
      for (var i = 0; i < localStorage.length; i++) {
        var fullKey = localStorage.key(i);
        if (fullKey !== null && fullKey.indexOf(prefix) === 0) {
          keys.push(fullKey.substring(prefix.length));
        }
      }
    } catch (e) {
      keys = [];
    }

    return keys;
  }

  function memoryKeysOf(appId) {
    var keys = [];
    var bucket = memoryStore[appId];

    if (bucket) {
      for (var key in bucket) {
        if (Object.prototype.hasOwnProperty.call(bucket, key)) {
          keys.push(key);
        }
      }
    }

    return keys;
  }

  // 設定アプリ側の操作(削除・切り替え・読み込み)で中身が変わったことを、そのアプリに
  // 知らせます。閉じた枠の関数を呼ぶと例外になることがあるので、失敗した知らせ先は外します。
  //
  // 【登録したページが残っているかを必ず確かめること】アプリの枠は閉じられたり読み直され
  // たりします。閉じた枠の関数は例外にならずに動いてしまうことがあり、確かめずに呼ぶと、
  // もう無い画面に対して読み直しが走り、知らせ先も開き直すたびに増え続けます。
  // 登録時のページ(owner)と文書(document)を控え、閉じた・別の文書になったものは外します。
  function listenerAlive(listener) {
    var alive = true;

    if (listener.owner) {
      try {
        alive = !listener.owner.closed && listener.owner.document === listener.ownerDocument;
      } catch (e) {
        alive = false;
      }
    }

    return alive;
  }

  function notifyChange(appId) {
    var listeners = changeListeners[appId] || [];
    var alive = [];

    for (var i = 0; i < listeners.length; i++) {
      if (listenerAlive(listeners[i])) {
        try {
          listeners[i].callback();
          alive.push(listeners[i]);
        } catch (e) {
          // 呼べなかった知らせ先。以後は呼びません。
        }
      }
    }
    changeListeners[appId] = alive;
  }

  // どのアプリの保存が変わっても呼ぶ知らせ先(設定アプリの一覧の描き直し用)。
  // 【保存・削除・切り替え・読み込みのどこかを足したら、ここも呼ぶこと】呼び忘れた経路で
  // 変わった中身は、設定アプリを開き直すまで一覧に出ません。
  // 知らせは少し待ってから1回にまとめます(時計のように細かく何度も保存するアプリがあり、
  // そのたびに一覧を組み直すと設定アプリが重くなるため)。
  var anyChangeListeners = [];
  var anyChangeTimer = null;

  function notifyAnyChange() {
    if (anyChangeTimer !== null) {
      return;
    }
    anyChangeTimer = setTimeout(function () {
      var alive = [];
      anyChangeTimer = null;
      for (var i = 0; i < anyChangeListeners.length; i++) {
        if (listenerAlive(anyChangeListeners[i])) {
          try {
            anyChangeListeners[i].callback();
            alive.push(anyChangeListeners[i]);
          } catch (e) {
            // 呼べなかった知らせ先。以後は呼びません。
          }
        }
      }
      anyChangeListeners = alive;
    }, 300);
  }

  function hasMemoryData() {
    var found = false;

    for (var appId in memoryStore) {
      if (Object.prototype.hasOwnProperty.call(memoryStore, appId) && memoryKeysOf(appId).length > 0) {
        found = true;
      }
    }

    return found;
  }

  // ---------------------------------------------------------------------
  // 案内の表示
  //
  // 【仕組みの話を出さないこと】利用者に伝えるのは「容量がいっぱい」「保存が使えない」
  // という分類までです。キー名・接頭辞・例外名は出しません。
  // 窓口のあるページ(ツールボックス画面)の上端に出すので、どのアプリの枠から
  // 保存しても同じ場所に出ます。同じ案内が既に出ていれば文面を差し替えるだけです。
  // ---------------------------------------------------------------------
  function showNotice(text) {
    var doc = hubWindow.document;

    if (!doc.body) {
      hubWindow.addEventListener("DOMContentLoaded", function () {
        showNotice(text);
      });
      return;
    }

    if (!noticeElement || !noticeElement.parentNode) {
      noticeElement = doc.createElement("div");
      noticeElement.setAttribute("role", "alert");
      noticeElement.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#fff3cd;color:#000;padding:10px 40px 10px 12px;font-size:13px;line-height:1.5;box-shadow:0 2px 6px rgba(0,0,0,0.3);";

      var message = doc.createElement("p");
      message.style.margin = "0";
      noticeElement.appendChild(message);

      var closeButton = doc.createElement("button");
      closeButton.type = "button";
      closeButton.textContent = "×";
      closeButton.setAttribute("aria-label", "閉じる");
      closeButton.style.cssText = "position:absolute;top:6px;right:8px;border:none;background:none;font-size:18px;cursor:pointer;";
      closeButton.addEventListener("click", function () {
        if (noticeElement && noticeElement.parentNode) {
          noticeElement.parentNode.removeChild(noticeElement);
        }
      });
      noticeElement.appendChild(closeButton);

      doc.body.appendChild(noticeElement);
    }

    noticeElement.firstChild.textContent = text;
  }

  function noticeForSaveFailure(kind, title) {
    var text = "";

    if (kind === "quota") {
      text = "保存できる容量がいっぱいのため、「" + title + "」の内容を保存できませんでした。設定アプリから不要なデータを削除してください。" +
        "※ブラウザの仕様により、どれだけ削除すればどれだけ保存できるようになるかは保証できません。";
    } else {
      text = "このブラウザでは保存が使えない状態のため、「" + title + "」の内容を保存できませんでした。" +
        "ブラウザの設定で、このサイトのデータの保存が許可されているかご確認ください。";
    }

    showNotice(text);
  }

  function removeItemQuietly(appId, key) {
    var meta = readMeta();

    if (modeOf(meta, appId) === "memory") {
      if (memoryStore[appId]) {
        delete memoryStore[appId][key];
        memoryDirty = true;
      }
    } else {
      try {
        localStorage.removeItem(dataKey(appId, key));
      } catch (e) {
        // 読めない環境では消すものもありません。
      }
    }

    if (meta.apps[appId] && meta.apps[appId].labels && Object.prototype.hasOwnProperty.call(meta.apps[appId].labels, key)) {
      delete meta.apps[appId].labels[key];
      writeMeta(meta);
    }
    notifyAnyChange();
  }

  // ---------------------------------------------------------------------
  // 取っ手(アプリ側が使うもの)
  // ---------------------------------------------------------------------
  function createHandle(appId, title) {
    var meta = readMeta();
    var entry = meta.apps[appId];

    // 表示名は毎回アプリから教えてもらい、変わっていれば控えを更新します。
    // 失敗しても(容量がいっぱい等)表示名が古いままになるだけなので、案内は出しません。
    if (!entry || entry.title !== title) {
      meta.apps[appId] = {
        title: title,
        mode: entry ? entry.mode : "local",
        labels: (entry && entry.labels) ? entry.labels : {}
      };
      writeMeta(meta);
      notifyAnyChange();
    }

    function get(key) {
      var value = null;
      var currentMeta = readMeta();

      if (modeOf(currentMeta, appId) === "memory") {
        value = (memoryStore[appId] && Object.prototype.hasOwnProperty.call(memoryStore[appId], key)) ? memoryStore[appId][key] : null;
      } else {
        try {
          value = localStorage.getItem(dataKey(appId, key));
        } catch (e) {
          value = null;
        }
      }

      return value;
    }

    // 成功で true。失敗したら窓口が案内を出し、false を返します。
    // 【失敗してもアプリを止めないこと】false を受けたアプリは、画面の状態をそのまま
    // 保ってください。保存が使えない環境でも、アプリ自体は保存無しで動き続けます。
    function set(key, value, label) {
      var saved = false;
      var currentMeta = readMeta();
      var text = String(value);

      if (modeOf(currentMeta, appId) === "memory") {
        if (!memoryStore[appId]) {
          memoryStore[appId] = {};
        }
        memoryStore[appId][key] = text;
        memoryDirty = true;
        saved = true;
      } else {
        try {
          localStorage.setItem(dataKey(appId, key), text);
          saved = true;
        } catch (e) {
          noticeForSaveFailure(classifyError(e), titleOf(currentMeta, appId));
          saved = false;
        }
      }

      // 名札は中身の保存が済んでから書きます。名札だけ書けなかった場合は、削除一覧に
      // キー名が出るだけなので、案内は出しません(中身は保存できているため)。
      if (saved && typeof label === "string" && label !== "") {
        if (!currentMeta.apps[appId]) {
          currentMeta.apps[appId] = { title: title, mode: "local", labels: {} };
        }
        if (!currentMeta.apps[appId].labels) {
          currentMeta.apps[appId].labels = {};
        }
        if (currentMeta.apps[appId].labels[key] !== label) {
          currentMeta.apps[appId].labels[key] = label;
          writeMeta(currentMeta);
        }
      }
      if (saved) {
        notifyAnyChange();
      }

      return saved;
    }

    // アプリ自身が消すときは知らせません(自分で消したものを、自分に知らせる必要は無いため)。
    function remove(key) {
      removeItemQuietly(appId, key);
    }

    function keys() {
      return modeOf(readMeta(), appId) === "memory" ? memoryKeysOf(appId) : localKeysOf(appId);
    }

    // 設定アプリでの削除・ファイルからの読み込みで、このアプリの中身が変わったときに
    // 呼ばれます。画面に読み込み済みの内容を持つアプリは、ここで読み直してください。
    // 第2引数には、呼ぶ側のページ(window)を渡してください。そのページが閉じた・読み直された
    // あとは呼ばれなくなります(上の listenerAlive() を参照)。
    function onChange(listener, ownerWindow) {
      var owner = ownerWindow || null;
      var ownerDocument = null;

      try {
        ownerDocument = owner ? owner.document : null;
      } catch (e) {
        ownerDocument = null;
      }
      if (!changeListeners[appId]) {
        changeListeners[appId] = [];
      }
      changeListeners[appId].push({ callback: listener, owner: owner, ownerDocument: ownerDocument });
    }

    return {
      appId: appId,
      get: get,
      set: set,
      remove: remove,
      keys: keys,
      onChange: onChange
    };
  }

  var hub = {
    // 親の窓口かどうかを見分ける印です(上の parentHub の判定が使います)。
    isHub: true,

    // 保存データの形式の印と版(メイキィから復元した中身を importAll() に渡すときに使います)。
    fileFormat: { format: FILE_FORMAT, version: FILE_VERSION },

    // どのアプリの保存が変わっても呼ばれます(設定アプリの一覧用)。第2引数は呼ぶ側のページ。
    onAnyChange: function (listener, ownerWindow) {
      var owner = ownerWindow || null;
      var ownerDocument = null;

      try {
        ownerDocument = owner ? owner.document : null;
      } catch (e) {
        ownerDocument = null;
      }
      anyChangeListeners.push({ callback: listener, owner: owner, ownerDocument: ownerDocument });
    },

    app: function (appId, title) {
      if (!APP_ID_PATTERN.test(String(appId))) {
        throw new Error("PusyuuToolboxStorage.app(): アプリIDは英数字・_・- の64文字以内で指定してください。");
      }
      return createHandle(String(appId), (typeof title === "string" && title !== "") ? title : String(appId));
    },

    // 設定アプリの一覧用。保存しているアプリと、その中身(キーと名札)を返します。
    listApps: function () {
      var meta = readMeta();
      var list = [];

      for (var appId in meta.apps) {
        if (!Object.prototype.hasOwnProperty.call(meta.apps, appId)) {
          continue;
        }
        var mode = modeOf(meta, appId);
        var labels = meta.apps[appId].labels || {};
        var keys = mode === "memory" ? memoryKeysOf(appId) : localKeysOf(appId);
        var items = [];
        for (var i = 0; i < keys.length; i++) {
          items.push({ key: keys[i], label: labels[keys[i]] || keys[i] });
        }
        list.push({ id: appId, title: titleOf(meta, appId), mode: mode, items: items });
      }

      list.sort(function (a, b) {
        return a.title < b.title ? -1 : (a.title > b.title ? 1 : 0);
      });

      return list;
    },

    // 設定アプリからの項目の削除。そのアプリに中身が変わったことを知らせます。
    removeItem: function (appId, key) {
      removeItemQuietly(appId, key);
      notifyChange(appId);
    },

    // アプリの保存を丸ごと消します。保存先の選択と表示名の控えも消えます
    // (次にそのアプリを開いた時に、ローカルストレージの既定で登録し直されます)。
    removeApp: function (appId) {
      var meta = readMeta();
      var keys = localKeysOf(appId);

      for (var i = 0; i < keys.length; i++) {
        try {
          localStorage.removeItem(dataKey(appId, keys[i]));
        } catch (e) {
          // 読めない環境では消すものもありません。
        }
      }
      if (memoryStore[appId]) {
        delete memoryStore[appId];
        memoryDirty = true;
      }
      if (meta.apps[appId]) {
        delete meta.apps[appId];
        writeMeta(meta);
      }
      notifyChange(appId);
      notifyAnyChange();
    },

    // 保存先の切り替え。中身ごと引っ越します。
    // 戻り値 { ok, message }。失敗した場合は元の保存先に中身が残ります。
    //
    // 【引っ越しの順番を変えないこと】
    //   ローカル → メモリ … 先にメモリへ写し、ローカルを消してから保存先の控えを書く。
    //     控えを書けなかったら、消したローカルを書き戻して元に戻す(消した直後なので入る)。
    //   メモリ → ローカル … 1件ずつローカルへ書き、1件でも溢れたら書いた分を消して中止。
    //     メモリ側は、控えを書き終えるまで消さない。
    // どちらも「途中で失敗しても、どちらか一方に全部が残っている」ための順番です。
    // 入れ替えると、失敗した時に半分ずつ別の場所に残り、アプリからは片方しか見えません。
    setMode: function (appId, mode) {
      var meta = readMeta();
      var current = modeOf(meta, appId);
      var result = { ok: true, message: "" };
      var i;

      if (!meta.apps[appId]) {
        result = { ok: false, message: "このアプリの保存は見つかりませんでした。" };
      } else if (mode !== "local" && mode !== "memory") {
        result = { ok: false, message: "保存先の指定が不正です。" };
      } else if (mode === current) {
        result = { ok: true, message: "" };
      } else if (mode === "memory") {
        var keys = localKeysOf(appId);
        var copied = {};
        for (i = 0; i < keys.length; i++) {
          try {
            copied[keys[i]] = localStorage.getItem(dataKey(appId, keys[i]));
          } catch (e) {
            copied[keys[i]] = null;
          }
        }
        for (i = 0; i < keys.length; i++) {
          try {
            localStorage.removeItem(dataKey(appId, keys[i]));
          } catch (e) {
            // 読めない環境では消すものもありません。
          }
        }
        meta.apps[appId].mode = "memory";
        var written = writeMeta(meta);
        if (written.ok) {
          memoryStore[appId] = {};
          for (i = 0; i < keys.length; i++) {
            if (copied[keys[i]] !== null) {
              memoryStore[appId][keys[i]] = copied[keys[i]];
            }
          }
          memoryDirty = true;
        } else {
          for (i = 0; i < keys.length; i++) {
            if (copied[keys[i]] !== null) {
              try {
                localStorage.setItem(dataKey(appId, keys[i]), copied[keys[i]]);
              } catch (e) {
                // 直前に消した分を書き戻すだけなので、ここで溢れることは通常ありません。
              }
            }
          }
          result = { ok: false, message: "保存先を切り替えられませんでした。" };
        }
      } else {
        var memoryKeys = memoryKeysOf(appId);
        var writtenKeys = [];
        var failure = "";
        for (i = 0; i < memoryKeys.length && failure === ""; i++) {
          try {
            localStorage.setItem(dataKey(appId, memoryKeys[i]), memoryStore[appId][memoryKeys[i]]);
            writtenKeys.push(memoryKeys[i]);
          } catch (e) {
            failure = classifyError(e);
          }
        }
        if (failure === "") {
          meta.apps[appId].mode = "local";
          var metaWritten = writeMeta(meta);
          if (!metaWritten.ok) {
            failure = metaWritten.error;
          }
        }
        if (failure === "") {
          delete memoryStore[appId];
        } else {
          for (i = 0; i < writtenKeys.length; i++) {
            try {
              localStorage.removeItem(dataKey(appId, writtenKeys[i]));
            } catch (e) {
              // 書けた分を消すだけです。
            }
          }
          result = {
            ok: false,
            message: failure === "quota"
              ? "保存できる容量がいっぱいのため、ローカルストレージへ切り替えられませんでした。不要なデータを削除してください。※ブラウザの仕様により、どれだけ削除すればどれだけ保存できるようになるかは保証できません。"
              : "このブラウザでは保存が使えない状態のため、ローカルストレージへ切り替えられませんでした。"
          };
        }
      }

      notifyAnyChange();
      return result;
    },

    // メモリ上に、まだファイルへ書き出していない変更があるか。
    hasUnsavedMemory: function () {
      return memoryDirty && hasMemoryData();
    },

    // ファイルへ書き出す内容(下の snapshot() と同じ)。書き出した時点で、メモリ上の分は
    // 「ファイルに残った」ことになるので、閉じる前の確認は出なくなります。
    exportAll: function () {
      var file = hub.snapshot();
      memoryDirty = false;
      return file;
    },

    // 窓口を通して保存したもの全部(ローカルストレージの分もメモリ上の分も)を、アプリごとに
    // 表示名・保存先・名札と一緒にまとめます。ファイルと同じ形です。
    // 【メイキィへのアップロードはこちらを使うこと】exportAll() を使うと「ファイルに残した」
    // 扱いになり、メモリ上の分を書き出さないまま閉じても確認が出なくなります。
    snapshot: function () {
      var meta = readMeta();
      var apps = {};

      for (var appId in meta.apps) {
        if (!Object.prototype.hasOwnProperty.call(meta.apps, appId)) {
          continue;
        }
        var mode = modeOf(meta, appId);
        var keys = mode === "memory" ? memoryKeysOf(appId) : localKeysOf(appId);
        var data = {};
        for (var i = 0; i < keys.length; i++) {
          var value = null;
          if (mode === "memory") {
            value = memoryStore[appId][keys[i]];
          } else {
            try {
              value = localStorage.getItem(dataKey(appId, keys[i]));
            } catch (e) {
              value = null;
            }
          }
          if (value !== null) {
            data[keys[i]] = value;
          }
        }
        apps[appId] = {
          title: titleOf(meta, appId),
          mode: mode,
          labels: meta.apps[appId].labels || {},
          data: data
        };
      }

      return {
        format: FILE_FORMAT,
        version: FILE_VERSION,
        exportedAt: new Date().toISOString(),
        apps: apps
      };
    },

    // ファイルから読み込みます。今の中身を丸ごと置き換えます。
    // onlyListed が true のときは、file.apps に載っているアプリだけを置き換え、他のアプリは
    // そのまま残します(メイキィからの復元用。大きすぎてアップロードされなかったアプリの
    // 中身を、復元で消さないため)。
    // 戻り値 { ok, message, movedToMemory: [表示名…] }。
    //
    // 【中身を確かめ終えるまで、今の中身を消さないこと】壊れたファイルや別物のファイルを
    // 選んだだけで、今の保存が消えてしまいます。形式・版・各値の型を全部確かめてから消します。
    // 【入りきらないアプリは捨てずにメモリ上だけへ】ファイルの中でローカルストレージ保存の
    // アプリでも、この端末の容量に入りきらなければ、そのアプリだけメモリ上だけに切り替えて
    // 読み込みます(movedToMemory で呼び出し側へ伝えます)。途中で止めると、置き換え前の
    // 中身は既に消えているので、何も残らなくなります。
    importAll: function (file, onlyListed) {
      var result = { ok: true, message: "", movedToMemory: [] };
      var appId;
      var key;
      var valid = !!file && typeof file === "object" && file.format === FILE_FORMAT && file.version === FILE_VERSION &&
        !!file.apps && typeof file.apps === "object";

      if (valid) {
        for (appId in file.apps) {
          if (!Object.prototype.hasOwnProperty.call(file.apps, appId)) {
            continue;
          }
          var entry = file.apps[appId];
          if (!APP_ID_PATTERN.test(appId) || !entry || typeof entry !== "object" || !entry.data || typeof entry.data !== "object") {
            valid = false;
          } else {
            for (key in entry.data) {
              if (Object.prototype.hasOwnProperty.call(entry.data, key) && typeof entry.data[key] !== "string") {
                valid = false;
              }
            }
          }
        }
      }

      // 控えが書けない環境(保存が禁止されている等)では、読み込んでも保存先を覚えられません。
      // 今の中身を消す前に、書けることを確かめます。
      var probe = valid ? writeMeta(readMeta()) : { ok: false, error: "" };

      if (!valid) {
        result = { ok: false, message: "このファイルはツールボックスの保存データとして読み込めませんでした。", movedToMemory: [] };
      } else if (!probe.ok) {
        result = { ok: false, message: "このブラウザでは保存が使えない状態のため、読み込めませんでした。", movedToMemory: [] };
      } else {
        // 今の中身を消します(窓口の名札が付いたものだけ。他のページのデータには触れません)。
        // onlyListed のときは、読み込むアプリの分だけを消します。
        var oldMeta = readMeta();
        var touched = {};
        var restoredToMemory = false;
        var replaces = function (id) {
          return !onlyListed || Object.prototype.hasOwnProperty.call(file.apps, id);
        };
        for (appId in oldMeta.apps) {
          if (Object.prototype.hasOwnProperty.call(oldMeta.apps, appId) && replaces(appId)) {
            var oldKeys = localKeysOf(appId);
            for (var i = 0; i < oldKeys.length; i++) {
              try {
                localStorage.removeItem(dataKey(appId, oldKeys[i]));
              } catch (e) {
                // 読めない環境では消すものもありません。
              }
            }
            touched[appId] = true;
          }
        }
        for (appId in memoryStore) {
          if (Object.prototype.hasOwnProperty.call(memoryStore, appId) && replaces(appId)) {
            touched[appId] = true;
            delete memoryStore[appId];
          }
        }

        // 残すアプリの控えは引き継ぎます(onlyListed でないときは何も残りません)。
        var newMeta = { apps: {} };
        for (appId in oldMeta.apps) {
          if (Object.prototype.hasOwnProperty.call(oldMeta.apps, appId) && !replaces(appId)) {
            newMeta.apps[appId] = oldMeta.apps[appId];
          }
        }
        for (appId in file.apps) {
          if (!Object.prototype.hasOwnProperty.call(file.apps, appId)) {
            continue;
          }
          var source = file.apps[appId];
          var title = (typeof source.title === "string" && source.title !== "") ? source.title : appId;
          var mode = source.mode === "memory" ? "memory" : "local";
          var labels = {};
          if (source.labels && typeof source.labels === "object") {
            for (key in source.labels) {
              if (Object.prototype.hasOwnProperty.call(source.labels, key) && typeof source.labels[key] === "string") {
                labels[key] = source.labels[key];
              }
            }
          }

          if (mode === "local") {
            var written = [];
            var overflowed = false;
            for (key in source.data) {
              if (Object.prototype.hasOwnProperty.call(source.data, key) && !overflowed) {
                try {
                  localStorage.setItem(dataKey(appId, key), source.data[key]);
                  written.push(key);
                } catch (e) {
                  overflowed = true;
                }
              }
            }
            if (overflowed) {
              for (var w = 0; w < written.length; w++) {
                try {
                  localStorage.removeItem(dataKey(appId, written[w]));
                } catch (e) {
                  // 書けた分を消すだけです。
                }
              }
              mode = "memory";
              result.movedToMemory.push(title);
            }
          }

          if (mode === "memory") {
            restoredToMemory = true;
            memoryStore[appId] = {};
            for (key in source.data) {
              if (Object.prototype.hasOwnProperty.call(source.data, key)) {
                memoryStore[appId][key] = source.data[key];
              }
            }
          }

          newMeta.apps[appId] = { title: title, mode: mode, labels: labels };
          touched[appId] = true;
        }

        writeMeta(newMeta);
        // ファイルから丸ごと読み込んだ中身はファイルと同じなので、まだ書き出していない変更は
        // ありません(入りきらずにメモリ上へ移したアプリも、ファイルには残っています)。
        // メイキィから復元した(onlyListed)ときは、メモリ上の分がファイルに無いので、
        // 閉じる前の確認が出るようにします。
        if (!onlyListed) {
          memoryDirty = false;
        } else if (restoredToMemory) {
          memoryDirty = true;
        }

        for (appId in touched) {
          if (Object.prototype.hasOwnProperty.call(touched, appId)) {
            notifyChange(appId);
          }
        }
      }

      notifyAnyChange();
      return result;
    }
  };

  // メモリ上に書き出していない変更があるままページを閉じようとしたら、ブラウザ標準の
  // 確認を出します。文面はブラウザが決めるので、ここで渡す文字列は表示されません。
  // 【窓口のあるページにだけ付けること】アプリの枠(iframe)の側に付けても、ツールボックス
  // 画面を閉じる操作では呼ばれません。
  hubWindow.addEventListener("beforeunload", function (event) {
    if (hub.hasUnsavedMemory()) {
      event.preventDefault();
      event.returnValue = "";
      return "";
    }
  });

  return hub;
})();
