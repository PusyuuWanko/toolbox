/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 1.0.3     |
  |  © 2026 By PusyuuWanko/       |
  |  License: MIT License         |
  |  PusyuuWebMail                |
----------------------------------*
******************************************/

/* PusyuuWebMail script.js — 旧ブラウザ(IE)対応版
   - アロー関数/テンプレートリテラル/async-await/fetch/?? を排除
   - Promiseは最小ポリフィルを内蔵
   - ページネーション維持 */

/* ---- 最小Promiseポリフィル（IE用。ネイティブがあれば使わない） ---- */
(function () {
  if (typeof window.Promise === "function") return;
  function P(executor) {
    var self = this;
    self._state = 0; // 0 pending, 1 fulfilled, 2 rejected
    self._val = undefined;
    self._cbs = [];
    function settle(state, val) {
      if (self._state !== 0) return;
      self._state = state;
      self._val = val;
      for (var i = 0; i < self._cbs.length; i++) self._cbs[i]();
      self._cbs = [];
    }
    try {
      executor(function (v) { settle(1, v); }, function (e) { settle(2, e); });
    } catch (e) { settle(2, e); }
  }
  P.prototype.then = function (onF, onR) {
    var self = this;
    return new P(function (resolve, reject) {
      function handle() {
        try {
          if (self._state === 1) {
            resolve(typeof onF === "function" ? onF(self._val) : self._val);
          } else {
            if (typeof onR === "function") resolve(onR(self._val));
            else reject(self._val);
          }
        } catch (e) { reject(e); }
      }
      if (self._state === 0) self._cbs.push(handle);
      else setTimeout(handle, 0);
    });
  };
  P.prototype["catch"] = function (onR) { return this.then(null, onR); };
  P.resolve = function (v) { return new P(function (r) { r(v); }); };
  P.reject = function (e) { return new P(function (_, rj) { rj(e); }); };
  window.Promise = P;
})();

/* ---- 保存係 ----
  ツールボックスの中で使うときは、ツールボックスの保存の窓口(storage-hub.js)に預けます。
  窓口が無い場所では、今までどおり localStorage に直接保存します。
  【パスワードをここに渡さないこと】ここに保存したものは、設定アプリからファイルへ書き出され、
  メイキィへもアップロードされます。パスワードは sessionStorage(タブを閉じると消える)だけに
  置きます(下の CREDS_KEY)。保存したアカウントは pwmAccountProfile() で項目を選んで作ります。
  【このアプリの中で localStorage を直接触らないこと】窓口を通らない保存は、設定アプリの
  一覧にも書き出しにも出ません。 */
var pwmStorage = (function () {
  var store = (typeof PusyuuToolboxStorage !== "undefined")
    ? PusyuuToolboxStorage.app("WebMail", "プシューメール")
    : null;
  var labels = {
    PusyuuWebMail_accounts: "保存したアカウント(パスワードは含みません)",
    PusyuuWebMail_autoSyncIntervalSec: "自動更新の間隔",
    PusyuuWebMail_autoSyncEnabled: "自動更新のON/OFF"
  };
  var result = null;

  if (store) {
    result = {
      getItem: store.get,
      setItem: function (key, value) {
        return store.set(key, value, labels.hasOwnProperty(key) ? labels[key] : key);
      },
      removeItem: store.remove
    };
    /* 設定アプリで削除された・ファイルから読み込まれたときは、画面を読み直します
       (ログイン中ならタブの中の認証情報で、そのまま受信箱に戻ります)。 */
    store.onChange(function () {
      window.location.reload();
    }, window);
  } else {
    result = {
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

/* ---- 起動（DOMContentLoaded 相当。IE8保険つき） ---- */
function pwmReady(fn) {
  if (document.addEventListener) {
    document.addEventListener("DOMContentLoaded", fn, false);
  } else if (document.attachEvent) {
    document.attachEvent("onreadystatechange", function () {
      if (document.readyState === "complete") fn();
    });
  } else {
    window.onload = fn;
  }
}

pwmReady(function () {
  var CREDS_KEY = "PusyuuWebMail_creds";

  var loginScreen = document.getElementById("login-screen");
  var inboxScreen = document.getElementById("inbox-screen");
  var messageScreen = document.getElementById("message-screen");
  var composeModal = document.getElementById("compose-modal");

  var loginForm = document.getElementById("login-form");
  var loginStatus = document.getElementById("login-status");
  var imapHostInput = document.getElementById("imap-host");
  var imapPortInput = document.getElementById("imap-port");
  var imapEncryptionSelect = document.getElementById("imap-encryption");
  var smtpHostInput = document.getElementById("smtp-host");
  var smtpPortInput = document.getElementById("smtp-port");
  var smtpEncryptionSelect = document.getElementById("smtp-encryption");
  var usernameInput = document.getElementById("mail-username");
  var passwordInput = document.getElementById("mail-password");

  var accountLabel = document.getElementById("account-label");
  var inboxStatus = document.getElementById("inbox-status");
  var messageList = document.getElementById("message-list");
  var messageDetail = document.getElementById("message-detail");
  var folderList = document.getElementById("folder-list");
  var attachmentList = document.getElementById("attachment-list");
  var toggleSeenBtn = document.getElementById("toggle-seen-btn");
  var deleteBtn = document.getElementById("delete-btn");

  var presets = {
    gmail: { imapHost: "imap.gmail.com", imapPort: 993, imapEncryption: "ssl", smtpHost: "smtp.gmail.com", smtpPort: 587, smtpEncryption: "starttls" },
    outlook: { imapHost: "outlook.office365.com", imapPort: 993, imapEncryption: "ssl", smtpHost: "smtp.office365.com", smtpPort: 587, smtpEncryption: "starttls" },
    yahoo: { imapHost: "imap.mail.yahoo.com", imapPort: 993, imapEncryption: "ssl", smtpHost: "smtp.mail.yahoo.com", smtpPort: 465, smtpEncryption: "ssl" },
    disroot: { imapHost: "disroot.org", imapPort: 993, imapEncryption: "ssl", smtpHost: "disroot.org", smtpPort: 465, smtpEncryption: "ssl" }
  };

  // NodeList.forEach 非対応対策
  var presetBtns = document.querySelectorAll(".preset-btn");
  for (var i = 0; i < presetBtns.length; i++) {
    (function (btn) {
      pwmOn(btn, "click", function () {
        var preset = presets[btn.getAttribute("data-preset")];
        if (!preset) return;
        imapHostInput.value = preset.imapHost;
        imapPortInput.value = preset.imapPort;
        imapEncryptionSelect.value = preset.imapEncryption;
        smtpHostInput.value = preset.smtpHost;
        smtpPortInput.value = preset.smtpPort;
        smtpEncryptionSelect.value = preset.smtpEncryption;
      });
    })(presetBtns[i]);
  }

  // ---- 保存したアカウント（パスワードは保存しない） ----
  // ログインに成功したアカウントの設定を保存し、ログイン画面から選べるようにする。
  // 画面の部品(並び・チェック)はJSが無いと意味が無いので、ここで組み立てる。
  var ACCOUNTS_KEY = "PusyuuWebMail_accounts";
  var loginSubmit = document.getElementById("login-submit");
  var presetRow = document.querySelector(".preset-row");
  var savedAccountsRow = null;
  var saveAccountCheckbox = null;

  // 保存するアカウントの中身。
  // 【項目は1つずつ書き出すこと】creds を丸ごと渡したりコピーしたりすると、パスワードも
  // 一緒に保存され、ファイルへの書き出しやメイキィへのアップロードに乗って外へ出ます。
  function pwmAccountProfile(creds) {
    return {
      imapHost: creds.imapHost,
      imapPort: String(creds.imapPort),
      imapEncryption: creds.imapEncryption,
      smtpHost: creds.smtpHost,
      smtpPort: String(creds.smtpPort),
      smtpEncryption: creds.smtpEncryption,
      username: creds.username
    };
  }

  function getSavedAccounts() {
    var list = [];
    try {
      var parsed = JSON.parse(pwmStorage.getItem(ACCOUNTS_KEY) || "[]");
      if (parsed && parsed.length !== undefined) {
        for (var ai = 0; ai < parsed.length; ai++) {
          if (parsed[ai] && typeof parsed[ai].username === "string") list.push(parsed[ai]);
        }
      }
    } catch (e) {
      list = [];
    }
    return list;
  }

  // 同じユーザー名・同じ受信サーバーのアカウントは1件にまとめる(設定を直してログインし直すと上書き)。
  function rememberAccount(creds) {
    var profile = pwmAccountProfile(creds);
    var list = getSavedAccounts();
    var next = [];
    for (var ai = 0; ai < list.length; ai++) {
      if (!(list[ai].username === profile.username && list[ai].imapHost === profile.imapHost)) next.push(list[ai]);
    }
    next.push(profile);
    pwmStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
    renderSavedAccounts();
  }

  function forgetAccount(target) {
    var list = getSavedAccounts();
    var next = [];
    for (var ai = 0; ai < list.length; ai++) {
      if (!(list[ai].username === target.username && list[ai].imapHost === target.imapHost)) next.push(list[ai]);
    }
    if (next.length > 0) {
      pwmStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
    } else {
      pwmStorage.removeItem(ACCOUNTS_KEY);
    }
    renderSavedAccounts();
  }

  function useAccount(account) {
    imapHostInput.value = account.imapHost || "";
    imapPortInput.value = account.imapPort || 993;
    imapEncryptionSelect.value = account.imapEncryption || "ssl";
    smtpHostInput.value = account.smtpHost || "";
    smtpPortInput.value = account.smtpPort || 587;
    smtpEncryptionSelect.value = account.smtpEncryption || "starttls";
    usernameInput.value = account.username || "";
    passwordInput.value = "";
    loginStatus.textContent = "パスワードを入力してログインしてください。";
    try { passwordInput.focus(); } catch (e) {}
  }

  function renderSavedAccounts() {
    if (!savedAccountsRow) {
      savedAccountsRow = document.createElement("div");
      savedAccountsRow.className = "preset-row";
      if (presetRow && presetRow.parentNode) presetRow.parentNode.insertBefore(savedAccountsRow, presetRow);
    }
    savedAccountsRow.innerHTML = "";

    var accounts = getSavedAccounts();
    savedAccountsRow.style.display = accounts.length > 0 ? "" : "none";
    if (accounts.length === 0) return;

    var caption = document.createElement("span");
    caption.appendChild(document.createTextNode("保存したアカウント:"));
    savedAccountsRow.appendChild(caption);

    for (var ai = 0; ai < accounts.length; ai++) {
      (function (account) {
        var useBtn = document.createElement("button");
        useBtn.type = "button";
        useBtn.className = "preset-btn";
        useBtn.appendChild(document.createTextNode(account.username));
        pwmOn(useBtn, "click", function () { useAccount(account); });
        savedAccountsRow.appendChild(useBtn);

        var forgetBtn = document.createElement("button");
        forgetBtn.type = "button";
        forgetBtn.className = "preset-btn";
        forgetBtn.title = "このアカウントの保存を削除";
        forgetBtn.appendChild(document.createTextNode("✕"));
        pwmOn(forgetBtn, "click", function () {
          if (confirm("「" + account.username + "」の保存を削除しますか？\n(メールサーバー上のメールには影響しません)")) forgetAccount(account);
        });
        savedAccountsRow.appendChild(forgetBtn);
      })(accounts[ai]);
    }
  }

  (function buildSaveAccountOption() {
    var label = document.createElement("label");
    saveAccountCheckbox = document.createElement("input");
    saveAccountCheckbox.type = "checkbox";
    saveAccountCheckbox.checked = true;
    label.appendChild(saveAccountCheckbox);
    label.appendChild(document.createTextNode(" このアカウントの設定を保存する（パスワードは保存しません）"));
    if (loginSubmit && loginSubmit.parentNode) loginSubmit.parentNode.insertBefore(label, loginStatus);
  })();

  renderSavedAccounts();

  // ---- ページネーション状態 ----
  var PAGE_SIZE = 20;
  var pageOffset = 0;
  var totalMessages = 0;

  // ---- フォルダ状態 ----
  var currentFolder = "INBOX";
  var messageItemsBySeq = {};

  function formatBytes(n) {
    if (!n || n <= 0) return "0B";
    var units = ["B", "KB", "MB", "GB"];
    var i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n = n / 1024;
      i++;
    }
    return (Math.round(n * 10) / 10) + units[i];
  }

  function getCreds() {
    var raw = sessionStorage.getItem(CREDS_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  function saveCreds(creds) {
    sessionStorage.setItem(CREDS_KEY, JSON.stringify(creds));
  }
  function clearCreds() {
    sessionStorage.removeItem(CREDS_KEY);
  }

  // イベント登録の互換ラッパ
  function pwmOn(el, evt, fn) {
    if (!el) return;
    if (el.addEventListener) el.addEventListener(evt, fn, false);
    else if (el.attachEvent) el.attachEvent("on" + evt, fn);
  }

  // Object.assign 代替
  function pwmAssign(target) {
    for (var a = 1; a < arguments.length; a++) {
      var src = arguments[a];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
      }
    }
    return target;
  }

  // fetch の代わりに XMLHttpRequest で JSON POST。Promiseを返す
  function callApi(action, extra) {
    var creds = getCreds();
    var payload = pwmAssign({ action: action }, creds, extra || {});
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "./assets/scripts/php_scripts/api.php", true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        var data = null;
        try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
        if (xhr.status >= 200 && xhr.status < 300 && data && !data.error) {
          resolve(data);
        } else {
          var msg = (data && data.error) ? data.error : "サーバーエラーが発生しました。";
          reject(new Error(msg));
        }
      };
      xhr.onerror = function () { reject(new Error("通信に失敗しました。")); };
      xhr.send(JSON.stringify(payload));
    });
  }

  function showScreen(screen) {
    var arr = [loginScreen, inboxScreen, messageScreen];
    for (var i = 0; i < arr.length; i++) arr[i].style.display = "none";
    screen.style.display = "block";
  }

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = (text === null || text === undefined) ? "" : text;
    return div.innerHTML;
  }

  // HTMLメール内のリンクは、既定だとiframe自身の中でナビゲートしてしまい
  // (見た目上「壊れた」ように見える)、sandbox="" では新しいタブを開く権限も
  // 無いため何も起きない。<base target="_blank"> を差し込むことでリンクの
  // 既定遷移先を新しいタブに変える(iframe側のsandboxにallow-popups /
  // allow-popups-to-escape-sandboxを付与することとセットで有効になる)。
  function pwmForceLinksNewTab(html) {
    var baseTag = '<base target="_blank">';
    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/<head[^>]*>/i, function (m) { return m + baseTag; });
    }
    return baseTag + html;
  }

  pwmOn(loginForm, "submit", function (event) {
    if (event && event.preventDefault) event.preventDefault();
    else if (window.event) window.event.returnValue = false;

    loginStatus.textContent = "接続を確認しています...";

    var creds = {
      imapHost: imapHostInput.value.replace(/^\s+|\s+$/g, ""),
      imapPort: imapPortInput.value,
      imapEncryption: imapEncryptionSelect.value,
      smtpHost: smtpHostInput.value.replace(/^\s+|\s+$/g, ""),
      smtpPort: smtpPortInput.value,
      smtpEncryption: smtpEncryptionSelect.value,
      username: usernameInput.value.replace(/^\s+|\s+$/g, ""),
      password: passwordInput.value
    };

    saveCreds(creds);

    callApi("test").then(function () {
      loginStatus.textContent = "";
      // 保存はログインに成功してから(打ち間違えた設定を残さないため)。
      if (saveAccountCheckbox && saveAccountCheckbox.checked) rememberAccount(creds);
      accountLabel.textContent = creds.username;
      pageOffset = 0;
      currentFolder = "INBOX";
      showScreen(inboxScreen);
      loadFolders();
      return loadInbox();
    }).then(function () {
      startAutoSync();
    })["catch"](function (error) {
      clearCreds();
      loginStatus.textContent = "ログインに失敗しました: " + error.message;
    });

    return false;
  });

  function loadFolders() {
    return callApi("folders").then(function (data) {
      renderFolderList(data.folders || []);
    })["catch"](function () {
      // フォルダ一覧の取得に失敗してもINBOXでの閲覧は継続できるようにする（サイレントに諦める）
    });
  }

  function renderFolderList(folders) {
    folderList.innerHTML = "";
    for (var i = 0; i < folders.length; i++) {
      (function (folder) {
        if (folder.selectable === false) return;
        var li = document.createElement("li");
        li.className = "folder-item" + (folder.name === currentFolder ? " active" : "");
        li.setAttribute("data-folder-name", folder.name);
        li.appendChild(document.createTextNode(folder.displayName || folder.name));
        pwmOn(li, "click", function () {
          if (currentFolder === folder.name) return;
          currentFolder = folder.name;
          pageOffset = 0;
          highlightActiveFolder();
          loadInbox();
        });
        folderList.appendChild(li);
      })(folders[i]);
    }
  }

  function highlightActiveFolder() {
    var items = folderList.childNodes;
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      if (!el.getAttribute) continue;
      el.className = (el.getAttribute("data-folder-name") === currentFolder) ? "folder-item active" : "folder-item";
    }
  }

  function loadInbox() {
    inboxStatus.textContent = "受信箱を読み込み中...";
    messageList.innerHTML = "";
    return callApi("list", { folder: currentFolder, offset: pageOffset, limit: PAGE_SIZE }).then(function (data) {
      totalMessages = data.total || 0;
      if (typeof data.offset === "number") pageOffset = data.offset;

      var shownCount = data.messages.length;
      var newestIndex = totalMessages - pageOffset;
      var oldestIndex = Math.max(1, newestIndex - shownCount + 1);
      if (shownCount > 0) {
        inboxStatus.textContent = "全" + totalMessages + "件中 " + oldestIndex + "〜" + newestIndex + "件目を表示";
      } else {
        inboxStatus.textContent = "全" + totalMessages + "件";
      }
      renderMessageList(data.messages);
      renderPager();
    })["catch"](function (error) {
      inboxStatus.textContent = "受信箱の読み込みに失敗しました: " + error.message;
    });
  }

  function renderPager() {
    var pager = document.getElementById("pager");
    if (!pager) {
      pager = document.createElement("div");
      pager.id = "pager";

      var newer = document.createElement("button");
      newer.type = "button";
      newer.id = "pager-newer";
      newer.appendChild(document.createTextNode("← 新しい"));
      pwmOn(newer, "click", function () {
        pageOffset = Math.max(0, pageOffset - PAGE_SIZE);
        loadInbox();
      });

      var info = document.createElement("span");
      info.id = "pager-info";

      var older = document.createElement("button");
      older.type = "button";
      older.id = "pager-older";
      older.appendChild(document.createTextNode("古い →"));
      pwmOn(older, "click", function () {
        pageOffset = pageOffset + PAGE_SIZE;
        loadInbox();
      });

      pager.appendChild(newer);
      pager.appendChild(info);
      pager.appendChild(older);
      // messageList の直後に置く。親が取れない場合は inbox-screen 末尾に落とす
      if (messageList.parentNode) {
        if (messageList.nextSibling) {
          messageList.parentNode.insertBefore(pager, messageList.nextSibling);
        } else {
          messageList.parentNode.appendChild(pager);
        }
      } else if (inboxScreen) {
        inboxScreen.appendChild(pager);
      }
    }

    var totalPages = Math.max(1, Math.ceil(totalMessages / PAGE_SIZE));
    var currentPage = Math.floor(pageOffset / PAGE_SIZE) + 1;

    var newerBtn = document.getElementById("pager-newer");
    var olderBtn = document.getElementById("pager-older");
    var info2 = document.getElementById("pager-info");

    newerBtn.disabled = pageOffset <= 0;
    olderBtn.disabled = (pageOffset + PAGE_SIZE) >= totalMessages;
    info2.textContent = " " + currentPage + " / " + totalPages + " ページ ";
  }

  function renderMessageList(messages) {
    messageList.innerHTML = "";
    messageItemsBySeq = {};
    for (var i = 0; i < messages.length; i++) {
      (function (msg) {
        var li = document.createElement("li");
        li.className = "message-item" + (msg.seen ? "" : " unread");
        // テンプレートリテラルを使わず組み立て
        li.innerHTML =
          '<div class="message-from">' + escapeHtml(msg.from) + '</div>' +
          '<div class="message-subject">' + escapeHtml(msg.subject) + '</div>' +
          '<div class="message-date">' + escapeHtml(msg.date) + '</div>';
        pwmOn(li, "click", function () { openMessage(msg.seq); });
        messageList.appendChild(li);
        messageItemsBySeq[msg.seq] = li;
      })(messages[i]);
    }
  }

  var currentMessage = null;

  function openMessage(seq) {
    showScreen(messageScreen);
    messageDetail.innerHTML = "読み込み中...";
    attachmentList.innerHTML = "";
    callApi("message", { folder: currentFolder, seq: seq }).then(function (data) {
      currentMessage = data.message;
      currentMessage.folder = currentFolder;

      var hasHtml = currentMessage.bodyHtml && currentMessage.bodyHtml.replace(/^\s+|\s+$/g, "") !== "";

      // ヘッダ部分は常にプレーンで安全に組む
      var head =
        '<p class="detail-subject">' + escapeHtml(currentMessage.subject) + '</p>' +
        '<p class="detail-meta">差出人: ' + escapeHtml(currentMessage.from) +
        '<br>日時: ' + escapeHtml(currentMessage.date) + '</p>';

      if (hasHtml) {
        // HTMLメールは sandbox iframe に隔離して表示
        messageDetail.innerHTML = head + '<iframe id="mail-body-frame" style="width:100%;border:0;min-height:400px;"></iframe>';
        var frame = document.getElementById("mail-body-frame");
        var frameHtml = pwmForceLinksNewTab(currentMessage.bodyHtml);
        // scriptを許可しない = allow-scripts を付けない。これが安全の要。
        // allow-popups / allow-popups-to-escape-sandbox は「新しいタブを開く」ことだけを
        // 許可するもので、iframe自体のスクリプト実行・親ページへのアクセス・トップページの
        // 乗っ取りは引き続き一切できない(開いた先のタブがサンドボックスを継承しないように
        // allow-popups-to-escape-sandboxも付けている。付けないと新タブ側もスクリプト禁止に
        // なり、リンク先の普通のサイトが正しく動かなくなるため)。
        frame.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
        if ("srcdoc" in frame) {
          frame.srcdoc = frameHtml;
        } else {
          // 古いブラウザ(IE)は srcdoc 非対応 → document.write で流し込む
          try {
            var doc = frame.contentWindow.document;
            doc.open();
            doc.write(frameHtml);
            doc.close();
          } catch (e) {
            // それも無理ならタグを落としたプレーンにフォールバック
            messageDetail.innerHTML = head +
              '<div class="detail-body">' + escapeHtml(currentMessage.body) + '</div>';
          }
        }
      } else {
        // プレーンメールは今まで通り
        messageDetail.innerHTML = head +
          '<div class="detail-body">' + escapeHtml(currentMessage.body) + '</div>';
      }

      renderAttachmentList(currentMessage.attachments || []);
      updateSeenToggleButton();

      // 開いた時点でサーバー側は既読化されているので、一覧側の見た目もその場で更新する
      var li = messageItemsBySeq[seq];
      if (li && currentMessage.seen) {
        li.className = li.className.replace(/\s*\bunread\b/, "");
      }
    })["catch"](function (error) {
      messageDetail.textContent = "メッセージの読み込みに失敗しました: " + error.message;
    });
  }

  function renderAttachmentList(attachments) {
    attachmentList.innerHTML = "";
    for (var i = 0; i < attachments.length; i++) {
      (function (att) {
        var li = document.createElement("li");
        li.className = "attachment-item";
        var label = document.createElement("span");
        label.appendChild(document.createTextNode(att.filename + " (" + formatBytes(att.size) + ")"));
        var btn = document.createElement("button");
        btn.type = "button";
        btn.appendChild(document.createTextNode("ダウンロード"));
        pwmOn(btn, "click", function () { downloadAttachment(att); });
        li.appendChild(label);
        li.appendChild(btn);
        attachmentList.appendChild(li);
      })(attachments[i]);
    }
  }

  function downloadAttachment(att) {
    callApi("attachment", { folder: currentMessage.folder, seq: currentMessage.seq, partNumber: att.partNumber }).then(function (data) {
      var dataUri = "data:" + data.mimeType + ";base64," + data.contentBase64;

      if (window.navigator && window.navigator.msSaveOrOpenBlob) {
        var byteChars = window.atob(data.contentBase64);
        var byteNumbers = new Array(byteChars.length);
        for (var i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        var blob = new Blob([new Uint8Array(byteNumbers)], { type: data.mimeType });
        window.navigator.msSaveOrOpenBlob(blob, data.filename);
        return;
      }

      var link = document.createElement("a");
      if ("download" in link) {
        link.href = dataUri;
        link.download = data.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        window.open(dataUri, "_blank");
      }
    })["catch"](function (error) {
      window.alert("添付ファイルのダウンロードに失敗しました: " + error.message);
    });
  }

  function updateSeenToggleButton() {
    if (!currentMessage) return;
    toggleSeenBtn.textContent = currentMessage.seen ? "未読にする" : "既読にする";
  }

  pwmOn(toggleSeenBtn, "click", function () {
    if (!currentMessage) return;
    var newSeen = !currentMessage.seen;
    callApi("mark", { folder: currentMessage.folder, seq: currentMessage.seq, seen: newSeen }).then(function () {
      currentMessage.seen = newSeen;
      updateSeenToggleButton();
      var li = messageItemsBySeq[currentMessage.seq];
      if (li) {
        if (newSeen) {
          li.className = li.className.replace(/\s*\bunread\b/, "");
        } else if (li.className.indexOf("unread") === -1) {
          li.className += " unread";
        }
      }
    })["catch"](function (error) {
      window.alert("既読状態の更新に失敗しました: " + error.message);
    });
  });

  pwmOn(deleteBtn, "click", function () {
    if (!currentMessage) return;
    if (!window.confirm("このメールを削除しますか？この操作は取り消せません。")) return;
    callApi("delete", { folder: currentMessage.folder, seq: currentMessage.seq }).then(function () {
      showScreen(inboxScreen);
      loadInbox();
    })["catch"](function (error) {
      window.alert("メールの削除に失敗しました: " + error.message);
    });
  });

  pwmOn(document.getElementById("back-btn"), "click", function () {
    showScreen(inboxScreen);
  });

  pwmOn(document.getElementById("refresh-btn"), "click", function () {
    pageOffset = 0;
    loadInbox();
  });

  pwmOn(document.getElementById("logout-btn"), "click", function () {
    clearCreds();
    loginForm.reset();
    loginStatus.textContent = "";
    pageOffset = 0;
    totalMessages = 0;
    stopAutoSync();
    showScreen(loginScreen);
  });

  // ---- 自動同期 ----
  var AUTOSYNC_INTERVAL_KEY = "PusyuuWebMail_autoSyncIntervalSec";
  var AUTOSYNC_ENABLED_KEY = "PusyuuWebMail_autoSyncEnabled";
  var autosyncToggle = document.getElementById("autosync-toggle");
  var autosyncIntervalInput = document.getElementById("autosync-interval");
  var autosyncLastCheck = document.getElementById("autosync-lastcheck");

  // 間隔・ON/OFFは機微情報ではないため保存係(pwmStorage)に保存する（認証情報のsessionStorageとは別扱い）
  var autoSyncIntervalSec = parseInt(pwmStorage.getItem(AUTOSYNC_INTERVAL_KEY), 10);
  if (!autoSyncIntervalSec || autoSyncIntervalSec < 15) autoSyncIntervalSec = 60;
  var autoSyncEnabled = pwmStorage.getItem(AUTOSYNC_ENABLED_KEY) !== "false";

  autosyncToggle.checked = autoSyncEnabled;
  autosyncIntervalInput.value = autoSyncIntervalSec;

  var autoSyncTimer = null;
  var autoSyncInFlight = false;

  function isInboxIdleAndVisible() {
    return inboxScreen.style.display === "block" && composeModal.style.display !== "flex";
  }

  function autoSyncTick() {
    if (autoSyncInFlight || !autoSyncEnabled || !isInboxIdleAndVisible()) return;
    autoSyncInFlight = true;
    callApi("list", { folder: currentFolder, offset: pageOffset, limit: PAGE_SIZE }).then(function (data) {
      autoSyncInFlight = false;
      totalMessages = data.total || 0;
      if (typeof data.offset === "number") pageOffset = data.offset;
      renderMessageList(data.messages);
      renderPager();
      var now = new Date();
      var mm = now.getMinutes();
      autosyncLastCheck.textContent = "最終確認 " + now.getHours() + ":" + (mm < 10 ? "0" : "") + mm;
    })["catch"](function () {
      autoSyncInFlight = false;
      // バックグラウンドの失敗はステータス欄を汚さず黙って無視する（手動更新は従来通りエラー表示）
    });
  }

  function startAutoSync() {
    stopAutoSync();
    if (autoSyncEnabled) {
      autoSyncTimer = setInterval(autoSyncTick, autoSyncIntervalSec * 1000);
    }
  }

  function stopAutoSync() {
    if (autoSyncTimer) {
      clearInterval(autoSyncTimer);
      autoSyncTimer = null;
    }
  }

  pwmOn(autosyncToggle, "change", function () {
    autoSyncEnabled = autosyncToggle.checked;
    pwmStorage.setItem(AUTOSYNC_ENABLED_KEY, autoSyncEnabled ? "true" : "false");
    startAutoSync();
  });

  pwmOn(autosyncIntervalInput, "change", function () {
    var val = parseInt(autosyncIntervalInput.value, 10);
    if (!val || val < 15) val = 15;
    if (val > 3600) val = 3600;
    autoSyncIntervalSec = val;
    autosyncIntervalInput.value = val;
    pwmStorage.setItem(AUTOSYNC_INTERVAL_KEY, String(val));
    startAutoSync();
  });

  // ---- メール作成（リッチテキスト・添付ファイル） ----
  var composeTo = document.getElementById("compose-to");
  var composeSubject = document.getElementById("compose-subject");
  var composeBodyEl = document.getElementById("compose-body");
  var composeBodyFallback = document.getElementById("compose-body-fallback");
  var composeStatus = document.getElementById("compose-status");
  var composeAttachmentInput = document.getElementById("compose-attachment-input");
  var composeAttachmentListEl = document.getElementById("compose-attachment-list");
  var pendingAttachments = [];

  // execCommandが使えない古い/特殊な環境ではプレーンtextareaにフォールバックする
  var canRichText = ("contentEditable" in document.createElement("div")) && !!document.execCommand;
  if (!canRichText) {
    composeBodyEl.style.display = "none";
    composeBodyFallback.style.display = "block";
    var toolbarEl = document.getElementById("compose-toolbar");
    if (toolbarEl) toolbarEl.style.display = "none";
  }

  var toolbarCmdBtns = document.querySelectorAll("#compose-toolbar button[data-cmd]");
  for (var tbi = 0; tbi < toolbarCmdBtns.length; tbi++) {
    (function (btn) {
      pwmOn(btn, "click", function (e) {
        if (e && e.preventDefault) e.preventDefault();
        composeBodyEl.focus();
        document.execCommand(btn.getAttribute("data-cmd"), false, null);
      });
    })(toolbarCmdBtns[tbi]);
  }

  var composeColorInput = document.getElementById("compose-color");
  pwmOn(composeColorInput, "input", function () {
    composeBodyEl.focus();
    document.execCommand("foreColor", false, composeColorInput.value);
  });

  pwmOn(document.getElementById("compose-link-btn"), "click", function () {
    var url = window.prompt("リンク先URLを入力してください:", "https://");
    if (url) {
      composeBodyEl.focus();
      document.execCommand("createLink", false, url);
    }
  });

  pwmOn(document.getElementById("compose-clear-format-btn"), "click", function () {
    composeBodyEl.focus();
    document.execCommand("removeFormat", false, null);
  });

  function pwmHtmlToPlainText(html) {
    var withBreaks = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "");
    var tmp = document.createElement("div");
    tmp.innerHTML = withBreaks;
    return tmp.textContent || tmp.innerText || "";
  }

  function pwmReadFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = reader.result, idx = result.indexOf(",");
        resolve(idx >= 0 ? result.substring(idx + 1) : result);
      };
      reader.onerror = function () { reject(new Error("ファイルの読み込みに失敗しました。")); };
      reader.readAsDataURL(file);
    });
  }

  // 手製Promiseポリフィルには.allが無いため、複数ファイルの読み込み待ちに使う
  function pwmAll(promises) {
    return new Promise(function (resolve, reject) {
      if (!promises.length) { resolve([]); return; }
      var results = new Array(promises.length), remaining = promises.length;
      for (var i = 0; i < promises.length; i++) {
        (function (idx) {
          promises[idx].then(function (v) {
            results[idx] = v;
            if (--remaining === 0) resolve(results);
          }, reject);
        })(i);
      }
    });
  }

  function renderComposeAttachmentList() {
    composeAttachmentListEl.innerHTML = "";
    for (var i = 0; i < pendingAttachments.length; i++) {
      (function (file, idx) {
        var li = document.createElement("li");
        var label = document.createElement("span");
        label.appendChild(document.createTextNode(file.name + " (" + formatBytes(file.size) + ")"));
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.appendChild(document.createTextNode("×"));
        pwmOn(removeBtn, "click", function () {
          pendingAttachments.splice(idx, 1);
          renderComposeAttachmentList();
        });
        li.appendChild(label);
        li.appendChild(removeBtn);
        composeAttachmentListEl.appendChild(li);
      })(pendingAttachments[i], i);
    }
  }

  pwmOn(composeAttachmentInput, "change", function () {
    var files = composeAttachmentInput.files;
    if (files) {
      for (var i = 0; i < files.length; i++) {
        pendingAttachments.push(files[i]);
      }
    }
    // ネイティブのfile inputは個別除去ができないため、選択後は独自配列で管理し直す
    composeAttachmentInput.value = "";
    renderComposeAttachmentList();
  });

  function openCompose(prefill) {
    composeTo.value = (prefill && prefill.to) || "";
    composeSubject.value = (prefill && prefill.subject) || "";

    var bodyText = (prefill && prefill.body) || "";
    if (canRichText) {
      // 先にescapeHtmlしてから改行を<br>にする。原文に山括弧が含まれていてもタグとして解釈されないようにするため
      composeBodyEl.innerHTML = escapeHtml(bodyText).replace(/\n/g, "<br>");
    } else {
      composeBodyFallback.value = bodyText;
    }

    pendingAttachments = [];
    renderComposeAttachmentList();
    composeAttachmentInput.value = "";
    composeStatus.textContent = "";
    composeModal.style.display = "flex";
  }

  pwmOn(document.getElementById("compose-btn"), "click", function () { openCompose(); });

  pwmOn(document.getElementById("reply-btn"), "click", function () {
    if (!currentMessage) return;
    var fromMatch = currentMessage.from.match(/<([^>]+)>/);
    var replyTo = fromMatch ? fromMatch[1] : currentMessage.from;
    var subject = /^re:/i.test(currentMessage.subject) ? currentMessage.subject : "Re: " + currentMessage.subject;
    var quoted = "\n\n--- 元のメッセージ ---\n" + currentMessage.body;
    openCompose({ to: replyTo, subject: subject, body: quoted });
  });

  pwmOn(document.getElementById("cancel-compose-btn"), "click", function () {
    composeModal.style.display = "none";
  });

  pwmOn(document.getElementById("send-btn"), "click", function () {
    var to = composeTo.value.replace(/^\s+|\s+$/g, "");
    if (!to) {
      composeStatus.textContent = "宛先を入力してください。";
      return;
    }

    var htmlBody = canRichText ? composeBodyEl.innerHTML : "";
    var hasHtmlContent = canRichText && composeBodyEl.textContent.replace(/^\s+|\s+$/g, "") !== "";
    var plainBody = canRichText ? pwmHtmlToPlainText(htmlBody) : composeBodyFallback.value;

    composeStatus.textContent = "送信中...";

    var readPromises = [];
    for (var i = 0; i < pendingAttachments.length; i++) {
      readPromises.push(pwmReadFileAsBase64(pendingAttachments[i]));
    }

    pwmAll(readPromises).then(function (base64List) {
      var attachments = [];
      for (var i = 0; i < pendingAttachments.length; i++) {
        attachments.push({
          filename: pendingAttachments[i].name,
          mimeType: pendingAttachments[i].type || "application/octet-stream",
          contentBase64: base64List[i]
        });
      }

      var payload = {
        to: to,
        subject: composeSubject.value.replace(/^\s+|\s+$/g, ""),
        body: plainBody,
        attachments: attachments
      };
      if (hasHtmlContent) {
        payload.bodyHtml = htmlBody;
      }

      return callApi("send", payload);
    }).then(function () {
      composeStatus.textContent = "送信しました。";
      setTimeout(function () { composeModal.style.display = "none"; }, 800);
    })["catch"](function (error) {
      composeStatus.textContent = "送信に失敗しました: " + error.message;
    });
  });

  // 既存セッションがあれば自動的に受信箱を開く
  (function init() {
    var creds = getCreds();
    if (creds) {
      imapHostInput.value = creds.imapHost || "";
      imapPortInput.value = creds.imapPort || 993;
      imapEncryptionSelect.value = creds.imapEncryption || "ssl";
      smtpHostInput.value = creds.smtpHost || "";
      smtpPortInput.value = creds.smtpPort || 587;
      smtpEncryptionSelect.value = creds.smtpEncryption || "starttls";
      usernameInput.value = creds.username || "";
      accountLabel.textContent = creds.username || "";
      pageOffset = 0;
      currentFolder = "INBOX";
      showScreen(inboxScreen);
      loadFolders();
      loadInbox().then(function () {
        startAutoSync();
      })["catch"](function () {
        clearCreds();
        showScreen(loginScreen);
      });
    } else {
      showScreen(loginScreen);
    }
  })();
});