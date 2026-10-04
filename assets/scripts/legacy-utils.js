/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 1.0.0     |
  |  © 2026 By PusyuuWanko/       |
  |  License: MIT License         |
  |  legacy-utils (ES5 only)      |
----------------------------------*
  IEのような古いブラウザでもパースできるよう、このファイルは
  意図的にES5構文のみで書く（const/let、アロー関数、テンプレート
  リテラル、async/awaitは使用しない）。fetch/Promiseにも依存せず
  XMLHttpRequestのコールバック形式のみで完結させる。

  【通信先 "./?svc=" は、呼んだページの位置から解決されます】ツールボックスの
  トップと設定アプリは、どちらも toolbox/index.php が出す画面(設定は ./?settings)
  なので、同じ場所に届きます。フォルダの中の別の画面からここの通信関数を呼ぶと、
  その画面の位置から解決されて届きません。以前、設定アプリが自分のフォルダの
  index.php だった頃は、これで同期のボタンが必ず404になっていました。
******************************************/

// XMLHttpRequestベースの簡易Ajaxヘルパー。
// method: "GET" または "POST"
// data: POST時にJSONとして送信するオブジェクト（GET時はnull可）
// onSuccess(parsedJson) / onError(message) はどちらも関数
function ajaxRequest(method, url, data, onSuccess, onError) {
  var xhr = null;

  if (window.XMLHttpRequest) {
    xhr = new XMLHttpRequest();
  } else if (window.ActiveXObject) {
    try {
      xhr = new ActiveXObject("Microsoft.XMLHTTP");
    } catch (e) {
      xhr = null;
    }
  }

  if (!xhr) {
    onError("このブラウザは通信機能(XMLHttpRequest)に対応していません。");
    return;
  }

  xhr.open(method, url, true);

  if (method === "POST") {
    xhr.setRequestHeader("Content-Type", "application/json");
  }

  if ("timeout" in xhr) {
    xhr.timeout = 15000;
    xhr.ontimeout = function () {
      onError("通信がタイムアウトしました。");
    };
  }

  xhr.onreadystatechange = function () {
    if (xhr.readyState !== 4) {
      return;
    }
    if (xhr.status < 200 || xhr.status >= 300) {
      onError("サーバー応答エラー (HTTP " + xhr.status + ")");
      return;
    }
    var parsed = null;
    try {
      parsed = JSON.parse(xhr.responseText);
    } catch (parseError) {
      onError("応答の解析に失敗しました。");
      return;
    }
    onSuccess(parsed);
  };

  try {
    if (method === "POST") {
      xhr.send(JSON.stringify(data || {}));
    } else {
      xhr.send();
    }
  } catch (sendError) {
    onError("通信の送信に失敗しました。");
  }
}

// 現在のブラウザがES6構文(アロー関数・テンプレートリテラル)を
// パースできるかどうかを判定する。古いブラウザ向けアプリの
// インストール可否判定に利用する。
function detectModernJs() {
  try {
    var testFn = new Function("var t = (x) => `value:${x}`; return t(1);");
    return testFn() === "value:1";
  } catch (e) {
    return false;
  }
}


// =====================================================================
// ホーム画面(追加したアプリ・アイコンの並び)
//
// この2つは、ツールボックスの保存の窓口(storage-hub.js)に「ホーム画面」というアプリとして
// 預けます。設定アプリの一覧・ファイルへの書き出しにも出ます。
// メイキィとは、各アプリの保存データとは別の置き場所(icon_order / installed_ids)で
// やり取りします。開いたときに自動で取り込むのはこの2つだけだからです(各アプリの
// 保存データは、設定アプリのボタンを押したときだけ行き来します)。
// =====================================================================

// 【"app-settings" の id を変えないこと】設定アプリは assets/apps にフォルダを持たず、
// assets/documents/appList.json に手で登録しています(画面は toolbox/index.php の
// ?settings)。そちらの id とここが食い違うと、初めて開いた人のホーム画面に設定アプリが
// 出なくなり、利用者が同期や保存データを管理する手段を失います。
// アプリストア自身は常時表示(pinned)のため、この一覧には含めない。
var PUSYUU_DEFAULT_INSTALLED_IDS = ["app-settings", "app-webmail"];

// 「前回メイキィとそろえた時点のメイキィ側の値」の控え。開いたときの自動取り込みで、
// この端末とメイキィのどちらが変わったのかを見分けるために使います。
// 【控えは窓口に預けないこと】この端末とメイキィの関係を覚えているだけの、端末ごとの
// 帳簿です。窓口に預けるとファイルへの書き出しに乗り、別の端末で読み込んだときに、
// その端末の帳簿として誤って使われます。
// 【控えにはメイキィ側の値を書くこと】混ぜた結果を書くと、この端末でまだアップロード
// していない変更が「変わっていない」扱いになり、次に開いたときメイキィの古い値で
// 消されます(自動アップロードを廃止したので、アップロードは利用者がボタンを押すまで
// 起きません)。
var PUSYUU_INSTALLED_BASE_KEY = "PusyuuToolbox#base:installedIds";
var PUSYUU_ICON_ORDER_BASE_KEY = "PusyuuToolbox#base:iconOrder";

// 窓口の取っ手(ホーム画面の分)。窓口は legacy-utils.js より後に読み込まれるので、
// 初めて使う時に作ります。窓口が無いページ(古い入口など)では localStorage に倒れます。
var pusyuuHomeStorageHandle = null;

function pusyuuHomeStorage() {
  var labels = { installedIds: "追加したアプリ", iconOrder: "アイコンの並び" };

  if (pusyuuHomeStorageHandle === null) {
    if (typeof PusyuuToolboxStorage !== "undefined") {
      var store = PusyuuToolboxStorage.app("toolbox", "ホーム画面(追加したアプリ・アイコンの並び)");
      pusyuuHomeStorageHandle = {
        getItem: store.get,
        setItem: function (key, value) {
          return store.set(key, value, labels.hasOwnProperty(key) ? labels[key] : key);
        },
        onChange: store.onChange
      };
    } else {
      pusyuuHomeStorageHandle = {
        getItem: function (key) {
          try { return localStorage.getItem("PusyuuToolbox:toolbox:" + key); } catch (e) { return null; }
        },
        setItem: function (key, value) {
          try { localStorage.setItem("PusyuuToolbox:toolbox:" + key, value); return true; } catch (e) { return false; }
        },
        onChange: function () {}
      };
    }
  }

  return pusyuuHomeStorageHandle;
}

// JSONの配列を読みます。無い・壊れているときは null。
function pusyuuReadArray(raw) {
  var result = null;
  try {
    var parsed = JSON.parse(raw);
    result = Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    result = null;
  }
  return result;
}

function pusyuuReadBase(key) {
  var raw = null;
  try {
    raw = localStorage.getItem(key);
  } catch (e) {
    raw = null;
  }
  return raw === null ? null : pusyuuReadArray(raw);
}

function pusyuuWriteBase(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // 使えない環境では控えを持てません(毎回「初めて」として扱われるだけです)。
  }
}

function getInstalledAppIds() {
  var list = pusyuuReadArray(pusyuuHomeStorage().getItem("installedIds"));

  if (list === null) {
    // 初回(または壊れている)ときは、プリインストール構成を保存しておく
    setInstalledAppIds(PUSYUU_DEFAULT_INSTALLED_IDS);
    list = PUSYUU_DEFAULT_INSTALLED_IDS.slice();
  }

  return list;
}

function setInstalledAppIds(ids) {
  pusyuuHomeStorage().setItem("installedIds", JSON.stringify(ids));
}

function getIconOrder() {
  return pusyuuReadArray(pusyuuHomeStorage().getItem("iconOrder"));
}

function setIconOrder(order) {
  pusyuuHomeStorage().setItem("iconOrder", JSON.stringify(order));
}

function pusyuuSameArray(a, b) {
  return a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 開いたときの自動取り込み(追加したアプリ)。ログイン中ならメイキィの一覧と、この端末の
 * 一覧を「3-wayマージ」してから callback() を呼びます。未ログイン・未保存・通信失敗の
 * 場合は、この端末の一覧のまま callback() を呼びます。
 *
 * 「前回そろえた時点のメイキィ側の一覧」(base)から見て、ローカル・メイキィのそれぞれが
 * 変わったかどうかでアプリごとに判定します:
 *   - どちらも変化なし → そのまま
 *   - ローカルだけ変化 → ローカルを残す(まだアップロードしていない変更を消さない)
 *   - メイキィだけ変化 → メイキィを採用する(他の端末での追加・削除を反映する)
 *   - 両方変化         → 追加済み扱い(誤って消さない)
 * base が無い(この端末でまだ一度もそろえていない)ときは、和集合にします。
 */
function loadInstalledAppIds(callback) {
  ajaxRequest(
    "GET",
    "./?svc=installed_ids&action=get",
    null,
    function (data) {
      var serverIds = (data && data.ok && Array.isArray(data.installed_ids)) ? data.installed_ids : null;
      if (serverIds === null) {
        callback();
        return;
      }

      var localIds = getInstalledAppIds();
      var baseIds = pusyuuReadBase(PUSYUU_INSTALLED_BASE_KEY);

      var allIds = [];
      var seen = {};
      function collect(arr) {
        for (var i = 0; i < arr.length; i++) {
          if (!seen[arr[i]]) {
            seen[arr[i]] = true;
            allIds.push(arr[i]);
          }
        }
      }
      collect(localIds);
      collect(serverIds);
      if (baseIds !== null) {
        collect(baseIds);
      }

      var merged = [];
      for (var i = 0; i < allIds.length; i++) {
        var id = allIds[i];
        var inLocal = localIds.indexOf(id) !== -1;
        var inServer = serverIds.indexOf(id) !== -1;
        var include;

        if (baseIds === null) {
          include = inLocal || inServer;
        } else {
          var inBase = baseIds.indexOf(id) !== -1;
          var localChanged = inLocal !== inBase;
          var serverChanged = inServer !== inBase;
          if (!localChanged && !serverChanged) {
            include = inBase;
          } else if (localChanged && !serverChanged) {
            include = inLocal;
          } else if (!localChanged && serverChanged) {
            include = inServer;
          } else {
            include = inLocal || inServer;
          }
        }

        if (include) {
          merged.push(id);
        }
      }

      setInstalledAppIds(merged);
      pusyuuWriteBase(PUSYUU_INSTALLED_BASE_KEY, serverIds);
      callback();
    },
    function () {
      callback();
    }
  );
}

/**
 * 開いたときの自動取り込み(アイコンの並び)。callback(order) に、この端末で使う並びを
 * 渡します(並びが無ければ null)。並びは丸ごと1つの値なので、アプリごとではなく全体で:
 *   - メイキィに無い・未ログイン・通信失敗 → この端末の並び
 *   - この端末でまだ一度もそろえていない   → メイキィの並び
 *   - この端末で変えていない               → メイキィの並び
 *   - この端末だけ変えた                   → この端末の並び
 *   - 両方変えた                           → この端末の並び(メイキィの並びは「復元」で取れる)
 */
function loadIconOrder(callback) {
  ajaxRequest(
    "GET",
    "./?svc=icon_order&action=get",
    null,
    function (data) {
      var serverOrder = (data && data.ok && Array.isArray(data.order) && data.order.length) ? data.order : null;
      var localOrder = getIconOrder();
      var baseOrder = pusyuuReadBase(PUSYUU_ICON_ORDER_BASE_KEY);
      var useOrder = localOrder;

      if (serverOrder === null) {
        useOrder = localOrder;
      } else if (baseOrder === null || localOrder === null || pusyuuSameArray(localOrder, baseOrder)) {
        useOrder = serverOrder;
        setIconOrder(serverOrder);
        pusyuuWriteBase(PUSYUU_ICON_ORDER_BASE_KEY, serverOrder);
      } else {
        useOrder = localOrder;
      }

      callback(useOrder);
    },
    function () {
      callback(getIconOrder());
    }
  );
}

/**
 * ホーム画面(並び・追加したアプリ)をメイキィへアップロードします(設定アプリのボタン用)。
 * callback(errorMessageOrNull) は両方終わってから1回だけ呼ばれます。
 */
function pusyuuUploadHomeToAccount(callback) {
  var order = getIconOrder() || [];
  var installedIds = getInstalledAppIds();
  var pending = 2;
  var firstError = null;

  function settle(errorMessage) {
    if (errorMessage && !firstError) {
      firstError = errorMessage;
    }
    pending--;
    if (pending <= 0 && callback) {
      callback(firstError);
    }
  }

  ajaxRequest("POST", "./?svc=icon_order&action=save", { order: order }, function (data) {
    if (data && data.ok) {
      pusyuuWriteBase(PUSYUU_ICON_ORDER_BASE_KEY, order);
    }
    settle(data && data.ok ? null : ((data && data.message) || "アイコンの並びのアップロードに失敗しました。"));
  }, function (message) {
    settle(message || "アイコンの並びのアップロードに失敗しました。");
  });

  ajaxRequest("POST", "./?svc=installed_ids&action=save", { installed_ids: installedIds }, function (data) {
    if (data && data.ok) {
      pusyuuWriteBase(PUSYUU_INSTALLED_BASE_KEY, installedIds);
    }
    settle(data && data.ok ? null : ((data && data.message) || "追加したアプリのアップロードに失敗しました。"));
  }, function (message) {
    settle(message || "追加したアプリのアップロードに失敗しました。");
  });
}

/**
 * メイキィのホーム画面(並び・追加したアプリ)で、この端末の分を置き換えます(設定アプリの
 * 復元ボタン用)。ボタンを押すこと自体が「メイキィの方を使う」という選択なので、混ぜずに
 * そのまま置き換えます。メイキィに無いものは、この端末の値を残します。
 * callback(errorMessageOrNull) は両方終わってから1回だけ呼ばれます。
 */
function pusyuuRestoreHomeFromAccount(callback) {
  var pending = 2;
  var firstError = null;

  function settle(errorMessage) {
    if (errorMessage && !firstError) {
      firstError = errorMessage;
    }
    pending--;
    if (pending <= 0 && callback) {
      callback(firstError);
    }
  }

  ajaxRequest("GET", "./?svc=icon_order&action=get", null, function (data) {
    if (data && data.ok && Array.isArray(data.order) && data.order.length) {
      setIconOrder(data.order);
      pusyuuWriteBase(PUSYUU_ICON_ORDER_BASE_KEY, data.order);
    }
    settle(data && data.ok ? null : ((data && data.message) || "アイコンの並びの取得に失敗しました。"));
  }, function (message) {
    settle(message || "アイコンの並びの取得に失敗しました。");
  });

  ajaxRequest("GET", "./?svc=installed_ids&action=get", null, function (data) {
    if (data && data.ok && Array.isArray(data.installed_ids)) {
      setInstalledAppIds(data.installed_ids);
      pusyuuWriteBase(PUSYUU_INSTALLED_BASE_KEY, data.installed_ids);
    }
    settle(data && data.ok ? null : ((data && data.message) || "追加したアプリの取得に失敗しました。"));
  }, function (message) {
    settle(message || "追加したアプリの取得に失敗しました。");
  });
}
