/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 1.1.1     |
  |  © 2026 By PusyuuWanko/       |
  |  License: MIT License         |
  |  PusyuuAppStore (ES5 only)    |
----------------------------------*
  古いブラウザでも動作させる必要があるため、意図的にES5構文
  のみで書く（const/let、アロー関数、テンプレートリテラルは
  使用しない）。fetch/Promiseにも依存せず、legacy-utils.jsの
  ajaxRequest/detectModernJsのみを利用する。

  インストール/アンインストールはサーバーを一切書き換えず、
  この端末の保存の窓口（legacy-utils.jsのgetInstalledAppIds/
  setInstalledAppIds）だけで完結させる。?svc=catalogは「存在する
  アプリの一覧(カタログ)」を返すだけの読み取り専用API。
******************************************/

// startsWithがないため存在しない場合prototypeを用いて上書きで追加
if (!String.prototype.startsWith) {
  Object.defineProperty(String.prototype, 'startsWith', {
    value: function (search, rawPos) {
      var pos = rawPos > 0 ? (rawPos | 0) : 0;
      return this.substring(pos, pos + search.length) === search;
    },
    writable: true,
    configurable: true
  });
}

document.addEventListener("DOMContentLoaded", function () {
  var statusEl = document.getElementById("store-status");
  var listEl = document.getElementById("app-list");
  var isLegacyBrowser = !detectModernJs();

  function createAppCard(app) {
    var card = document.createElement("div");
    card.className = "store-card";

    var img = document.createElement("img");
    var image = app.image.startsWith("./") ? "../../../" + app.image : app.image;
    img.className = "store-icon";
    img.src = image;
    img.alt = "";
    card.appendChild(img);

    var infoWrap = document.createElement("div");
    infoWrap.className = "store-info";

    var titleEl = document.createElement("p");
    titleEl.className = "store-title";
    titleEl.textContent = app.title;
    infoWrap.appendChild(titleEl);

    var descEl = document.createElement("p");
    descEl.className = "store-description";
    descEl.textContent = app.description;
    infoWrap.appendChild(descEl);

    var blocked = isLegacyBrowser && !app.legacyCompatible;

    if (blocked) {
      var warnEl = document.createElement("p");
      warnEl.className = "store-warning";
      warnEl.textContent = "このブラウザは古いため、このアプリはインストールできません。";
      infoWrap.appendChild(warnEl);
    }

    card.appendChild(infoWrap);

    var actionWrap = document.createElement("div");
    actionWrap.className = "store-action";

    var button = document.createElement("button");
    button.type = "button";

    if (app.installed) {
      button.textContent = "アンインストール";
      button.className = "store-btn store-btn-uninstall";
      button.addEventListener("click", function () {
        performAction("uninstall", app.id);
      });
    } else {
      button.textContent = "インストール";
      button.className = "store-btn store-btn-install";
      if (blocked) {
        button.disabled = true;
      } else {
        button.addEventListener("click", function () {
          performAction("install", app.id);
        });
      }
    }

    actionWrap.appendChild(button);
    card.appendChild(actionWrap);

    return card;
  }

  function renderApps(apps) {
    listEl.innerHTML = "";

    // ストア自身のような常時表示(pinned)アプリは、ここでは
    // 管理対象として出さない（自分自身をアンインストールできて
    // しまうと詰むため）
    var manageable = [];
    for (var i = 0; i < apps.length; i++) {
      if (!apps[i].pinned) {
        manageable.push(apps[i]);
      }
    }

    if (manageable.length === 0) {
      statusEl.textContent = "利用可能なアプリがありません。";
      return;
    }

    statusEl.textContent = manageable.length + "件のアプリがあります。";

    var installedIds = getInstalledAppIds();
    for (var j = 0; j < manageable.length; j++) {
      var app = manageable[j];
      app.installed = false;
      for (var k = 0; k < installedIds.length; k++) {
        if (installedIds[k] === app.id) {
          app.installed = true;
          break;
        }
      }
      listEl.appendChild(createAppCard(app));
    }
  }

  function performAction(action, id) {
    var ids = getInstalledAppIds();

    if (action === "install") {
      var alreadyIn = false;
      for (var i = 0; i < ids.length; i++) {
        if (ids[i] === id) {
          alreadyIn = true;
          break;
        }
      }
      if (!alreadyIn) {
        ids.push(id);
      }
    } else {
      var filtered = [];
      for (var j = 0; j < ids.length; j++) {
        if (ids[j] !== id) {
          filtered.push(ids[j]);
        }
      }
      ids = filtered;
    }

    setInstalledAppIds(ids);
    statusEl.textContent = action === "install" ? "インストールしました。" : "アンインストールしました。";

    if (window.parent && window.parent.refreshAppList) {
      window.parent.refreshAppList();
    }

    loadCatalog();
  }

  function loadCatalog() {
    statusEl.textContent = "読み込み中...";
    ajaxRequest("GET", "../../../?svc=catalog", null, function (result) {
      renderApps(result.apps || []);
    }, function (message) {
      statusEl.textContent = "読み込みに失敗しました: " + message;
    });
  }

  loadCatalog();
});
