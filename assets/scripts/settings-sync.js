/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 2.0.0     |
  |  © 2026 By PusyuuWanko/       |
  |  License: MIT License         |
  |  設定: 保存データの持ち運び (ES5) |
----------------------------------*
  画面は toolbox/index.php の ?settings が出します。このファイルは「保存データの持ち運び」
  の欄を組み立てて動かします。
    ・プシューメイキィへアップロード / プシューメイキィから復元(ログイン中のみ)
    ・ファイルに書き出す / ファイルから読み込む(いつでも)
  どれもボタンを押したときだけ動きます(自動同期は廃止しました。開いたときに自動で
  取り込むのは、アイコンの並び・追加したアプリだけで、それは legacy-utils.js が行います)。

  【メイキィ上の置き方】各アプリの保存データを、置き場所A・Bのどちらかにアプリごとに置き、
  目次(manifest)が「今そろっているのはどちらか」を指します(toolbox/index.php の
  toolboxApiStorage() を参照)。アップロードは今使っていない方へ書き、全部書けてから目次を
  切り替え、最後に古い方を消します。
  【この順番を変えないこと】目次を先に書いたり、古い方を先に消したりすると、途中で失敗
  したときに「前回そろった状態」が残らず、復元で一部のアプリだけ戻る・空になる、が起きます。
  その代わり、アップロードの最中だけは、前回の分と今回の分の両方ぶんの容量を使います。

  ホーム画面(アイコンの並び・追加したアプリ)は、開いたときの自動取り込みに使う専用の
  置き場所(icon_order / installed_ids)でやり取りするので、A・Bには入れません。
******************************************/

(function () {
  var mount = document.getElementById("sync_manager");
  var configElement = document.getElementById("sync_config");

  if (!mount || typeof PusyuuToolboxStorage === "undefined") {
    return;
  }

  var hub = PusyuuToolboxStorage;
  var config = { signedIn: false, reason: "", manageUrl: "" };
  try {
    var parsed = JSON.parse(configElement ? configElement.textContent : "null");
    if (parsed && typeof parsed === "object") {
      config = parsed;
    }
  } catch (e) {
    // 材料が読めないときは「ログインしていない」扱い(ファイルだけ使えます)。
  }

  // ホーム画面は専用の置き場所でやり取りするので、A・Bには入れません(上の説明を参照)。
  var HOME_APP_ID = "toolbox";
  var buttons = [];
  var statusMessage = null;
  var manageLink = null;

  function setStatus(text, showManageLink) {
    statusMessage.textContent = text;
    manageLink.style.display = (showManageLink && config.manageUrl) ? "" : "none";
  }

  function setBusy(busy) {
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].element.disabled = busy || (buttons[i].needsAccount && !config.signedIn);
    }
  }

  function createButton(text, needsAccount, onClick) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "account_login_button";
    button.textContent = text;
    button.disabled = needsAccount && !config.signedIn;
    button.addEventListener("click", onClick);
    buttons.push({ element: button, needsAccount: needsAccount });
    return button;
  }

  function api(method, action, query, body, done) {
    ajaxRequest(method, "./?svc=storage&action=" + action + query, body, function (data) {
      done(data || { ok: false, error: "", message: "応答が読めませんでした。" });
    }, function (message) {
      done({ ok: false, error: "network", message: message });
    });
  }

  function refreshHomeScreen() {
    // ホーム画面(アイコン一覧)はツールボックス画面(親)が描いています。
    if (window.parent && window.parent !== window && window.parent.refreshAppList) {
      window.parent.refreshAppList();
    }
  }

  // ---------------------------------------------------------------------
  // プシューメイキィへアップロード
  // ---------------------------------------------------------------------
  function uploadToAccount() {
    if (!confirm("この端末の保存データで、プシューメイキィ上の保存データを置き換えます。よろしいですか？")) {
      return;
    }
    setBusy(true);
    setStatus("アップロード中...", false);

    api("GET", "manifest", "", null, function (manifestResult) {
      if (!manifestResult.ok) {
        finishUpload(manifestResult, [], []);
        return;
      }
      var oldManifest = manifestResult.manifest;
      var oldSlot = oldManifest ? oldManifest.slot : "";
      var target = oldSlot === "A" ? "B" : "A";
      var snapshot = hub.snapshot();
      var gen = String(new Date().getTime()) + "-" + Math.floor(Math.random() * 1000000);
      var ids = [];
      var uploaded = [];
      var skipped = [];

      for (var appId in snapshot.apps) {
        if (Object.prototype.hasOwnProperty.call(snapshot.apps, appId) && appId !== HOME_APP_ID) {
          ids.push(appId);
        }
      }

      // 書いた分を消して、前回そろった状態だけを残します(途中で失敗したとき)。
      function rollback(failure) {
        var remaining = uploaded.slice();
        function next() {
          if (remaining.length === 0) {
            finishUpload(failure, [], []);
            return;
          }
          api("POST", "delete_app", "", { slot: target, app: remaining.shift() }, next);
        }
        next();
      }

      // 目次を切り替えたあと、古い方の置き場所を片付けます。失敗しても目次は新しい方を
      // 指しているので、復元には影響しません(次のアップロードで上書きされます)。
      function cleanup(done) {
        var remaining = (oldManifest && oldManifest.apps) ? oldManifest.apps.slice() : [];
        function next() {
          if (remaining.length === 0 || oldSlot === "") {
            done();
            return;
          }
          api("POST", "delete_app", "", { slot: oldSlot, app: remaining.shift() }, next);
        }
        next();
      }

      function step(index) {
        if (index >= ids.length) {
          var manifest = { slot: target, gen: gen, apps: uploaded.slice(), uploadedAt: new Date().toISOString() };
          api("POST", "put_manifest", "", { manifest: manifest }, function (result) {
            if (!result.ok) {
              rollback(result);
              return;
            }
            cleanup(function () {
              pusyuuUploadHomeToAccount(function (homeError) {
                finishUpload(homeError ? { ok: false, error: "", message: homeError } : { ok: true }, uploaded, skipped);
              });
            });
          });
          return;
        }

        var id = ids[index];
        var source = snapshot.apps[id];
        var entry = { gen: gen, title: source.title, mode: source.mode, labels: source.labels, data: source.data };
        api("POST", "put_app", "", { slot: target, app: id, entry: entry }, function (result) {
          if (result.ok) {
            uploaded.push(id);
            step(index + 1);
          } else if (result.error === "too_large" || result.error === "invalid_input") {
            // 1件の上限を超えるアプリは飛ばして、残りはアップロードします。
            skipped.push(source.title);
            step(index + 1);
          } else {
            rollback(result);
          }
        });
      }

      step(0);
    });
  }

  function finishUpload(result, uploaded, skipped) {
    var text = "";
    var showManage = false;

    if (result.ok && skipped.length === 0) {
      text = "プシューメイキィへアップロードしました。";
    } else if (result.ok) {
      text = "プシューメイキィへアップロードしました。ただし「" + skipped.join("」「") + "」は保存データが大きすぎるため(1件あたりの上限を超えるため)アップロードしていません。ファイルへの書き出しをご利用ください。";
    } else if (result.error === "quota_exceeded") {
      text = "プシューメイキィの保存容量がいっぱいのため、アップロードできませんでした。プシューメイキィの管理画面で不要なデータを整理してください(アップロードの間は、前回アップロードした分と今回の分を一時的に両方保存するため、その分の空きが必要です)。前回アップロードした内容はそのまま残っています。";
      showManage = true;
    } else if (result.error === "signed_out") {
      text = "プシューメイキィにログインしていないため、アップロードできませんでした。";
    } else {
      text = "アップロードできませんでした(" + (result.message || "原因不明") + ")。前回アップロードした内容はそのまま残っています。";
    }

    setStatus(text, showManage);
    setBusy(false);
  }

  // ---------------------------------------------------------------------
  // プシューメイキィから復元
  // ---------------------------------------------------------------------
  function restoreFromAccount() {
    if (!confirm("プシューメイキィ上の保存データで、この端末の保存データを置き換えます。\n(プシューメイキィに無いアプリの保存データは、この端末のまま残ります)\nよろしいですか？")) {
      return;
    }
    setBusy(true);
    setStatus("復元中...", false);

    api("GET", "manifest", "", null, function (manifestResult) {
      var manifest = manifestResult.ok ? manifestResult.manifest : null;

      if (!manifestResult.ok) {
        finishRestore(manifestResult, []);
        return;
      }
      if (!manifest || !manifest.apps) {
        // 各アプリの分はまだ無くても、ホーム画面の分はあるかもしれないので、そちらだけ戻します。
        pusyuuRestoreHomeFromAccount(function (homeError) {
          refreshHomeScreen();
          finishRestore(homeError ? { ok: false, error: "", message: homeError } : { ok: true, empty: true }, []);
        });
        return;
      }

      var file = { format: hub.fileFormat.format, version: hub.fileFormat.version, apps: {} };
      var ids = manifest.apps.slice();

      function step(index) {
        if (index >= ids.length) {
          var result = hub.importAll(file, true);
          pusyuuRestoreHomeFromAccount(function (homeError) {
            refreshHomeScreen();
            if (!result.ok) {
              finishRestore(result, []);
            } else {
              finishRestore(homeError ? { ok: false, error: "", message: homeError } : { ok: true }, result.movedToMemory);
            }
          });
          return;
        }
        api("GET", "get_app", "&slot=" + encodeURIComponent(manifest.slot) + "&app=" + encodeURIComponent(ids[index]), null, function (result) {
          var entry = result.ok ? result.entry : null;
          // 目次と同じ回の印が付いていないものは、そろっていない中身です。混ぜずに止めます。
          if (!entry || entry.gen !== manifest.gen) {
            finishRestore({ ok: false, error: "", message: "プシューメイキィ上の保存データがそろっていません。もう一度アップロードし直してください" }, []);
            return;
          }
          file.apps[ids[index]] = { title: entry.title, mode: entry.mode, labels: entry.labels || {}, data: entry.data || {} };
          step(index + 1);
        });
      }

      step(0);
    });
  }

  function finishRestore(result, movedToMemory) {
    var text = "";

    if (result.ok && result.empty) {
      text = "プシューメイキィには、まだ各アプリの保存データがアップロードされていません(アイコンの並び・追加したアプリだけ復元しました)。";
    } else if (result.ok && movedToMemory.length > 0) {
      text = "復元しました。ただし「" + movedToMemory.join("」「") + "」は、この端末の保存できる容量に入りきらなかったため、保存先を「メモリ上だけ」にしています(ツールボックスを閉じると消えます)。";
    } else if (result.ok) {
      text = "プシューメイキィから復元しました。";
    } else if (result.error === "signed_out") {
      text = "プシューメイキィにログインしていないため、復元できませんでした。";
    } else {
      text = "復元できませんでした(" + (result.message || "原因不明") + ")。この端末の保存データは変わっていません。";
    }

    setStatus(text, false);
    setBusy(false);
  }

  // ---------------------------------------------------------------------
  // ファイル
  // ---------------------------------------------------------------------
  function pad2(number) {
    return (number < 10 ? "0" : "") + number;
  }

  function exportToFile() {
    var text = JSON.stringify(hub.exportAll());
    var blob = new Blob([text], { type: "application/json" });
    var now = new Date();
    var name = "toolbox-storage-" + now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate()) +
      "-" + pad2(now.getHours()) + pad2(now.getMinutes()) + ".json";
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");

    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // すぐに無効にすると、ブラウザによっては保存が始まる前に消えてしまうので少し待ちます。
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 10000);
    setStatus("ファイルに書き出しました(" + name + ")。", false);
  }

  function importFromFile() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) {
        return;
      }
      if (!confirm("「" + file.name + "」を読み込みます。\n今の保存データ(アイコンの並び・追加したアプリを含む)は丸ごと置き換えられ、元には戻せません。読み込みますか？")) {
        return;
      }
      setStatus("読み込み中...", false);
      var reader = new FileReader();
      reader.onload = function () {
        var parsedFile = null;
        try {
          parsedFile = JSON.parse(reader.result);
        } catch (e) {
          parsedFile = null;
        }
        var result = hub.importAll(parsedFile);
        if (!result.ok) {
          setStatus(result.message, false);
        } else if (result.movedToMemory.length > 0) {
          setStatus("読み込みました。ただし「" + result.movedToMemory.join("」「") + "」は、この端末の保存できる容量に入りきらなかったため、保存先を「メモリ上だけ」にしています(ツールボックスを閉じると消えます)。", false);
        } else {
          setStatus("読み込みました。", false);
        }
      };
      reader.onerror = function () {
        setStatus("ファイルを読み込めませんでした。", false);
      };
      reader.readAsText(file);
    });
    input.click();
  }

  // ---------------------------------------------------------------------
  // 組み立て
  // ---------------------------------------------------------------------
  function build() {
    while (mount.firstChild) {
      mount.removeChild(mount.firstChild);
    }

    var accountHeading = document.createElement("h4");
    accountHeading.textContent = "プシューメイキィ";
    mount.appendChild(accountHeading);

    var accountActions = document.createElement("div");
    accountActions.className = "sync_manual_actions";
    accountActions.appendChild(createButton("プシューメイキィへアップロード", true, uploadToAccount));
    accountActions.appendChild(createButton("プシューメイキィから復元", true, restoreFromAccount));
    mount.appendChild(accountActions);

    var accountNote = document.createElement("p");
    accountNote.className = "note";
    accountNote.textContent = config.signedIn
      ? "ボタンを押したときだけ、この端末の保存データ(各アプリの分とアイコンの並び・追加したアプリ)をプシューメイキィと行き来します。"
      : config.reason;
    mount.appendChild(accountNote);

    var fileHeading = document.createElement("h4");
    fileHeading.textContent = "ファイル";
    mount.appendChild(fileHeading);

    var fileActions = document.createElement("div");
    fileActions.className = "sync_manual_actions";
    fileActions.appendChild(createButton("ファイルに書き出す", false, exportToFile));
    fileActions.appendChild(createButton("ファイルから読み込む", false, importFromFile));
    mount.appendChild(fileActions);

    var fileNote = document.createElement("p");
    fileNote.className = "note";
    fileNote.textContent = "保存データを1つのファイルにまとめて書き出します。プシューメイキィに入らない大きな保存データや、「メモリ上だけ」のアプリの中身も、ファイルになら残せます。読み込むと、今の保存データは丸ごと置き換えられます。";
    mount.appendChild(fileNote);

    statusMessage = document.createElement("p");
    statusMessage.className = "note";
    statusMessage.setAttribute("aria-live", "polite");
    mount.appendChild(statusMessage);

    manageLink = document.createElement("a");
    manageLink.className = "account_login_button";
    manageLink.href = config.manageUrl || "#";
    manageLink.target = "_top";
    manageLink.textContent = "プシューメイキィの管理画面を開く";
    manageLink.style.display = "none";
    mount.appendChild(manageLink);
  }

  build();
})();
