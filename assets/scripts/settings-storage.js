/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 1.0.0     |
  |  © 2026 By PusyuuWanko/       |
  |  License: MIT License         |
  |  設定: アプリの保存データ (ES5) |
----------------------------------*
  窓口(storage-hub.js)を通して保存しているアプリの一覧を出し、アプリごとの
  保存先の切り替えと、項目ごと・アプリごとの削除を行います。
  使用量は出しません(ブラウザがローカルストレージの上限を教えないため、
  正しい値を出せない)。溢れた時の案内は窓口が出します。

  【ここで localStorage を直接触らないこと】一覧・削除・切り替えは必ず窓口の
  関数を通します。ここで直接消すと、メモリ上のデータや名札の控えが取り残され、
  窓口と食い違います。
******************************************/

(function () {
  var mount = document.getElementById("storage_manager");

  if (!mount || typeof PusyuuToolboxStorage === "undefined") {
    return;
  }

  var hub = PusyuuToolboxStorage;
  var statusMessage = null;

  function setStatus(text) {
    if (statusMessage) {
      statusMessage.textContent = text;
    }
  }

  function createButton(text, onClick) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "account_login_button";
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
  }

  function createModeRadio(app, mode, labelText) {
    var label = document.createElement("label");
    label.className = "storage_mode_option";

    var radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "storage_mode_" + app.id;
    radio.value = mode;
    radio.checked = app.mode === mode;
    radio.addEventListener("change", function () {
      if (!radio.checked) {
        return;
      }
      if (mode === "memory" && !confirm("「" + app.title + "」の保存先を「メモリ上だけ」にします。\nツールボックスを閉じると中身が消えるため、使うたびにファイルから読み込む必要があります。切り替えますか？")) {
        render();
        return;
      }
      var result = hub.setMode(app.id, mode);
      setStatus(result.ok ? "「" + app.title + "」の保存先を切り替えました。" : result.message);
      render();
    });

    label.appendChild(radio);
    label.appendChild(document.createTextNode(labelText));
    return label;
  }

  function createAppSection(app) {
    var section = document.createElement("div");
    section.className = "storage_app";

    var heading = document.createElement("h4");
    heading.textContent = app.title;
    section.appendChild(heading);

    var modeRow = document.createElement("div");
    modeRow.className = "storage_mode_row";
    modeRow.appendChild(document.createTextNode("保存先: "));
    modeRow.appendChild(createModeRadio(app, "local", "ローカルストレージ"));
    modeRow.appendChild(createModeRadio(app, "memory", "メモリ上だけ"));
    section.appendChild(modeRow);

    if (app.mode === "memory") {
      var memoryNote = document.createElement("p");
      memoryNote.className = "note";
      memoryNote.textContent = "ツールボックスを閉じると消えます。使うたびにファイルから読み込んでください。";
      section.appendChild(memoryNote);
    }

    if (app.items.length === 0) {
      var empty = document.createElement("p");
      empty.className = "note";
      empty.textContent = "保存している項目はありません。";
      section.appendChild(empty);
    } else {
      var list = document.createElement("ul");
      list.className = "storage_item_list";
      for (var i = 0; i < app.items.length; i++) {
        (function (item) {
          var row = document.createElement("li");
          var name = document.createElement("span");
          name.textContent = item.label;
          row.appendChild(name);
          row.appendChild(createButton("削除", function () {
            if (confirm("「" + app.title + "」の「" + item.label + "」を削除しますか？\nこの操作は取り消せません。")) {
              hub.removeItem(app.id, item.key);
              setStatus("「" + item.label + "」を削除しました。");
              render();
            }
          }));
          list.appendChild(row);
        })(app.items[i]);
      }
      section.appendChild(list);
    }

    section.appendChild(createButton("このアプリの保存を丸ごと削除", function () {
      if (confirm("「" + app.title + "」の保存を丸ごと削除しますか？\n保存先の選択も初期状態(ローカルストレージ)に戻ります。この操作は取り消せません。")) {
        hub.removeApp(app.id);
        setStatus("「" + app.title + "」の保存を削除しました。");
        render();
      }
    }));

    return section;
  }

  function render() {
    var apps = hub.listApps();

    while (mount.firstChild) {
      mount.removeChild(mount.firstChild);
    }

    var intro = document.createElement("p");
    intro.className = "note";
    intro.textContent = "アプリごとに保存先を選び、不要な項目を削除できます。保存できる量には上限がありますが、ブラウザの仕様により、どれだけ削除すればどれだけ保存できるようになるかは保証できません。";
    mount.appendChild(intro);

    if (apps.length === 0) {
      var none = document.createElement("p");
      none.className = "note";
      none.textContent = "まだ保存しているアプリはありません。";
      mount.appendChild(none);
    } else {
      for (var i = 0; i < apps.length; i++) {
        mount.appendChild(createAppSection(apps[i]));
      }
    }

    // 状態の文言は描き直しても残します(削除直後に「削除しました」が消えないように)。
    var previous = statusMessage ? statusMessage.textContent : "";
    statusMessage = document.createElement("p");
    statusMessage.className = "note";
    statusMessage.setAttribute("aria-live", "polite");
    statusMessage.textContent = previous;
    mount.appendChild(statusMessage);
  }

  render();
  // 設定アプリを開いたまま別のアプリで保存・追加・削除した場合も、窓口の知らせを受けて
  // 一覧を描き直します。
  // 【focus で描き直す形に戻さないこと】以前はそうしていましたが、focus は設定の枠の中を
  // クリックするまで届かないため、ツールボックスの窓を切り替えただけでは古い一覧のままでした。
  hub.onAnyChange(render, window);
})();
