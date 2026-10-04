<?php
/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 4.0.0     |
  |  © 2021-2026 By ISAMI ABE     |
  |  License: MIT License         |
  |  toolbox                      |
----------------------------------*
  toolbox のサーバー側はこの1枚です。

  【入口は1つだけ】以前は、トップ(このファイル)・assets/api/index.php・
  assets/apps/Settings/index.php の3つの入口がありました。PHP は最初に呼ばれた
  ファイルの場所を基準に相対パスを解くので、入口ごとに基準がずれ、次の問題が
  起きていました。
    ・同じファイルを指すのに、入口ごとに違うパスが要る(__DIR__ や、上へ辿る探索で
      ごまかしていた)
    ・JS の通信先 "./assets/api/index.php" が、設定アプリの画面から呼ぶと
      assets/apps/Settings/assets/api/… という存在しない場所になり、設定アプリの
      「今すぐアップロード」「プシューメイキィから復元」が必ず404で失敗していた
  入口がここ1つなら基準は常にこのフォルダで、素の相対パスだけで書けます。
  【新しい入口(PHPファイル)を足さないこと】足すと上の問題がそのまま戻ります。
  画面を増やしたいときは、下の renderToolbox() に枝を足してください。

  【このファイルが返すもの】
    ?svc=catalog                        アプリ一覧(JSON・読み取り専用)
    ?svc=icon_order&action=get|save     アイコンの並び順(JSON)
    ?svc=installed_ids&action=get|save  導入済みアプリの一覧(JSON)
    ?svc=storage&action=…               各アプリの保存データのアップロード・復元(JSON)
    ?do_logout=1                        サインアウト(トップへ戻します)
    ?settings                           設定アプリの画面(ツールボックスの枠の中で開きます)
    (何も無し)                         ツールボックスのトップ

  【アカウント機能が無くても toolbox は動きます】読み込みはすべて file_exists() で
  囲んであり、下の関数も「使えるか」を先に確かめてから動きます。toolbox にはもともと
  ログイン画面が無く、未サインインは異常ではなく通常の状態です(並び順がブラウザの
  localStorage だけで管理される状態になります)。
******************************************/

// ---------------------------------------------------------------------
// 共有スクリプト
//
// 【固定の相対パス1つだけを見ます】以前は入口が3つあり、深さが入口ごとに違ったため、
// 「見つかるまで上へ辿る」探索をしていました。入口がこのファイルだけになったので、
// 探索は要りません(上へ辿ると、関係ない場所に置かれたときに無関係な同名フォルダを
// 掴む危険があるため、戻さないこと)。無ければ、その機能だけが畳まれます。
// ---------------------------------------------------------------------
$toolboxSharedDir = "../main/pusyuusystem/scripts/php_scripts/";

// 他のプロダクトの住所は台帳(pusyuu_registry)から受け取ります。無い環境では、
// 共有スクリプトや他のプロダクトへのリンクが「このホストの / から」に倒れ、
// 台帳のIDを持つ手動エントリが一覧に出ないだけです。
if (file_exists($toolboxSharedDir . "pusyuu_registry_client.php")) {
  require_once($toolboxSharedDir . "pusyuu_registry_client.php");
}
if (file_exists($toolboxSharedDir . "panic_handler.php")) {
  require_once($toolboxSharedDir . "panic_handler.php");
}
if (file_exists($toolboxSharedDir . "usage_tracker.php")) {
  require_once($toolboxSharedDir . "usage_tracker.php");
}
// アカウント機能(メイキィと話す係)。無ければアカウント機能が畳まれます。
if (file_exists($toolboxSharedDir . "meikiee_client.php")) {
  require_once($toolboxSharedDir . "meikiee_client.php");
}
// セッション(クッキー無しでも続く仕組み・機械の判定)。無ければPHP標準で動きます。
if (file_exists($toolboxSharedDir . "pusyuu_session.php")) {
  require_once($toolboxSharedDir . "pusyuu_session.php");
}
if (file_exists($toolboxSharedDir . "notation.php")) {
  require_once($toolboxSharedDir . "notation.php");
}

// 他のプロダクト(main 等)の住所の頭。台帳(pusyuu_registry)から決まります。
// 【ドメインを書き戻さないこと】以前はテンプレートに https://pusyuuwanko.com 等を固定で
// 書いていたため、IPやLAN、別のドメインから入った人の画面でも公開ドメインへ取りに
// 行っていました。$public は OGP のように、よそ(SNS)が取りに来るものだけ true。
// 台帳の係が無い・読めないときは空文字(=このページのホストの / から)に倒れます。
function toolboxSiteBase(string $id, bool $public = false): string {
  return class_exists('PusyuuRegistryClient') ? PusyuuRegistryClient::baseHtml($id, $public) : '';
}

// =====================================================================
// セッションの窓口(toolboxの「顔」)
//
// 共有スクリプトがあれば、そちらへ委ねます。**クッキーを切っている利用者にも、
// URLの引き換えコードでセッションが続きます**(サインインも保てます)。
// 【$_SESSION はこれまでどおり使えます】共有スクリプト側が $_SESSION と自分の
// 保存先を同期します(PusyuuSession::startWithSuperglobal())。
// 【PHPのセッション関数だけは置き換えが必要です】session_regenerate_id() /
// session_destroy() は「使われていないPHPのセッション」を相手にしてしまい、
// **黙って効かなくなります。** 下の ToolboxSession 経由で呼んでください。
// =====================================================================
class ToolboxSession {
  /** 共有スクリプトを通しているか。start() で1回だけ決まります。 */
  private static $viaLibrary = false;
  /** 既に始めたか(2回呼ばれても2回始めないため)。 */
  private static $started = false;

  /**
   * セッションを始めます。**出力より前に**呼んでください
   * (2回呼んでも2回目は何もしません)。
   */
  public static function start() {
    // 【始まったかどうかを、ライブラリに聞かないこと】PusyuuSession::id() を呼ぶと、
    // その場で「PHP標準の保存先」が作られて覚えられてしまい、直後の開始で自前の
    // 保存先が選べなくなります(クッキー無しの仕組みが黙って効かなくなる)。
    // 自分で数えるのが一番確かです。
    if (self::$started) {
      return;
    }
    self::$started = true;

    if (class_exists('PusyuuSession')) {
      self::$viaLibrary = true;
      // 保存先の選び方もCookieの属性も、共有スクリプト側が決めます。
      PusyuuSession::startWithSuperglobal();
    } else {
      self::$viaLibrary = false;
      // 共有スクリプトが無い環境。以前の toolbox とまったく同じ始め方です。
      //
      // 【SameSiteは必ずLax】Strictにすると、メイキィのログイン画面から戻ってきた
      // トップレベル遷移にCookieが送られず、毎回「別のセッション」として扱われます。
      // 往路で控えたstateごと消えるので照合が必ず外れ、サインインが永久に成立しません。
      //
      // 【secureは実際にHTTPSで来ているかで決める】無条件にtrueにすると、HTTPで
      // 配信されている環境ではブラウザがセッションCookieを一切保存できません。
      $https = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443')
        || (strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https');
      session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => $https,
        'httponly' => true,
        'samesite' => 'Lax',
      ]);
      session_cache_limiter("nocache");
      session_start();
    }
  }

  /** セッションIDを作り直します(サインイン=権限昇格のときのセッション固定化対策)。 */
  public static function regenerateId() {
    if (self::$viaLibrary) {
      PusyuuSession::regenerateId(true);
    } else {
      session_regenerate_id(true);
    }
  }

  /**
   * 中身を捨てて、新しいセッションで始め直します(サインアウト)。
   * 【捨てるだけで終わらないこと】この後も画面を出すので、書ける状態に戻しておきます。
   */
  public static function reset() {
    if (self::$viaLibrary) {
      // ライブラリ側は destroy() で中身と資格をまとめて失効させ、次の start() で
      // 新しいセッションになります(機密の外側の資格も一緒に失効します)。
      PusyuuSession::destroy();
      self::$started = false;
      self::$viaLibrary = false;
      self::start();
      PusyuuSession::regenerateId(true);
    } else {
      session_unset();
      session_destroy();
      session_start();
      session_regenerate_id(true);
    }
  }
}

/**
 * toolboxがアカウント機能を使える状態かどうか。
 *
 * 【この関数を通さずにアカウント機能を呼ばないこと】共有スクリプトが無い環境では
 * pusyuuAccount〜() という関数自体が存在しません。確かめずに呼ぶと
 * 「Call to undefined function」で致命的エラーになり、ツールボックスの画面が
 * まるごと真っ白になります。アイコンが1つ出ないのではなく、何も出ません。
 */
function toolboxAccountReady(): bool {
  $result = false;

  if (!function_exists('pusyuuAccountReady')) {
    $result = false;
  } else {
    $result = pusyuuAccountReady();
  }

  return $result;
}

/** 使えないときの理由(利用者に見せてよい1文)。使える場合や理由が無い場合は空文字。 */
function toolboxAccountUnavailableReason(): string {
  $result = '';

  if (!function_exists('pusyuuAccountUnavailableReason')) {
    $result = 'このツールボックスにはアカウント連携機能が設置されていません。設定はこのブラウザにのみ保存されます。';
  } else {
    $result = pusyuuAccountUnavailableReason();
  }

  return $result;
}

/** toolbox自身のセッションが持っているトークン。未サインインなら空文字。 */
function toolboxAccountToken(): string {
  return $_SESSION['accounts_token'] ?? '';
}

/**
 * 直近のサインインが失敗していれば、その理由を1度だけ返します(読んだら消えます)。
 * 失敗していなければ空文字。
 *
 * 【設定画面で必ず出すこと】toolboxにはログイン画面が無く、サインインは設定アプリの
 * ボタンからしか始まりません。ここを拾わないと、失敗しても利用者はツールボックスの
 * トップへ戻されるだけで、何が起きたのか分かりません。実際、設定アプリが戻り先に
 * 合言葉を付けずにURLを組み立てていたせいで、この状態が続いていました。
 */
function toolboxAccountTakeSignInError(): string {
  $result = '';

  if (!function_exists('pusyuuAccountTakeSignInError')) {
    $result = '';
  } else {
    $result = pusyuuAccountTakeSignInError();
  }

  return $result;
}

/**
 * 自動サインインの確認(フォームを見せずに、既にサインイン済みかだけ確かめる)。
 * サインイン済みならtoolboxでも自動でサインイン状態にし、そうでなければ何もしません
 * (toolbox自体にはサインインのボタンやフォームを一切追加しません)。
 *
 * toolbox固有なのは「サインイン中かどうかの判定」と「受け取ったトークンを自分の
 * セッションのどのキーへ入れるか」の2点だけなので、その2つだけを渡します。
 * 往復の手順そのものは共有スクリプトの持ち物です。
 */
function toolboxSilentSsoCheck(): void {
  if (!function_exists('pusyuuAccountHandleSignIn')) {
    // 共有スクリプトが無い環境。アカウント機能そのものが無いので何もしません。
  } else {
    pusyuuAccountHandleSignIn(
      static function (): bool {
        return !empty($_SESSION['accounts_token']);
      },
      static function (array $user, string $token): void {
        ToolboxSession::regenerateId(); // サインイン=権限昇格。セッション固定化を防ぐ
        $_SESSION['accounts_token'] = $token;
      }
    );
  }
}

/**
 * toolbox自身のサインアウト処理です。
 * (1) toolbox自身のトークンを失効させ、(2) toolbox自身のセッションを畳んだ上で、
 * (3) アカウント基盤側のサインイン状態も一緒に終了させます。
 *
 * 【(3)を省かないこと】省くと基盤側のサインイン状態が生きたままになり、次にtoolboxを
 * 開いたときに自動サインインがまたサインインさせてしまいます。「サインアウトしたのに
 * 戻ってくる」という、利用者から見て最も不気味な壊れ方です。
 *
 * この関数はheader()+exitで終わるため、呼び出し元で以降の処理は不要です。
 * ただしアカウント機能が使えない環境では、畳むものが無いのでトップへ戻すだけにします。
 */
function toolboxLogout(): void {
  $token = toolboxAccountToken();
  if ($token !== '' && function_exists('pusyuuAccountRevokeToken')) {
    pusyuuAccountRevokeToken($token);
  }

  ToolboxSession::reset();

  // サインアウト後は今いた画面ではなくtoolboxのトップへ戻します(設定アプリの中で
  // サインアウトしたあと、その画面へ戻っても意味が無いため)。
  //
  // toolbox のトップは、台帳(pusyuu_registry)の toolbox の顔のうち今の入口に合うもの。
  // 【ドメインを書き戻さないこと】台帳が読めないときは、このファイル自身(./)に倒します。
  // メイキィ経由のサインアウトは戻り先に絶対URLが要るので、台帳が読めないときは
  // メイキィを通さずに戻します。
  $toolboxTop = class_exists('PusyuuRegistryClient') ? PusyuuRegistryClient::url('toolbox', '/') : null;
  if (!function_exists('pusyuuAccountSignOutUrl') || $toolboxTop === null) {
    header('Location: ' . ($toolboxTop ?? './'));
    exit;
  } else {
    header('Location: ' . pusyuuAccountSignOutUrl($toolboxTop));
    exit;
  }
}

// =====================================================================
// アプリ一覧の組み立て
//
// assets/apps/* をGLOBで走査し、各アプリの meta.json(無ければindex系ファイルの
// <title>)からカタログ情報を組み立てます。
//
// 「インストール済みかどうか」はサーバー側では一切管理しません(利用者の端末の
// localStorage とアカウントの userData だけで管理する設計のため)。ここは純粋に
// 「存在するアプリの一覧」を返すだけです。assets/documents/appList.json は、
// GLOBで拾えない手動エントリ(外部リンクや、ストア自身のような常時表示アプリ)を
// 追加でマージするための補助データとして引き続き使います。
// =====================================================================
function pusyuuAppsDir() {
  return "./assets/apps";
}

function pusyuuAppListPath() {
  return "./assets/documents/appList.json";
}

function pusyuuReadAppList() {
  $path   = pusyuuAppListPath();
  $raw    = file_exists($path) ? @file_get_contents($path) : false;
  $data   = ($raw === false) ? null : json_decode($raw, true);
  $result = [];

  if (!is_array($data)) {
    // ファイルが無い・読めない・JSONとして壊れている。どれも「登録なし」と同じ扱いです。
    $result = [];
  } else {
    $result = $data;
  }

  return $result;
}

function pusyuuSlugify($name) {
  $slug = strtolower($name);
  $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
  $slug = trim($slug, '-');
  return $slug !== '' ? $slug : 'app';
}

// 明示的なentry指定があればそれを、無ければ index.html/htm/php の順で探す
function pusyuuFindEntryFile($folderPath, $explicitEntry) {
  $result = null;

  if ($explicitEntry !== null) {
    // 指定があるなら、それが実在するかどうかだけを見ます。
    // 無かった場合に候補で代用しないのは、指定した本人の意図(このファイルを開かせたい)を
    // 黙って別のファイルにすり替えないためです。
    $result = file_exists($folderPath . '/' . $explicitEntry) ? $explicitEntry : null;
  } else {
    $candidates = ['index.html', 'index.htm', 'index.php'];
    foreach ($candidates as $candidate) {
      if ($result === null && file_exists($folderPath . '/' . $candidate)) {
        $result = $candidate;
      }
    }
  }

  return $result;
}

function pusyuuExtractTitle($filePath) {
  $content = @file_get_contents($filePath);
  $matched = ($content === false) ? 0 : preg_match('/<title[^>]*>(.*?)<\/title>/is', $content, $m);
  $result  = null;

  if ($content === false) {
    $result = null;
  } else if ($matched !== 1) {
    $result = null;
  } else {
    $result = trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES, 'UTF-8'));
  }

  return $result;
}

// assets/apps配下をスキャンし、カタログ(全アプリ情報の配列)を返す。
// meta.jsonが無いアプリはindexファイルの<title>から自動補完する。
// 加えて appList.json 内の手動エントリ（GLOBで見つからないsrcのもの）もマージする。
function pusyuuBuildCatalog() {
  $appsDir = pusyuuAppsDir();
  $appsBaseUrl = "./assets/apps";
  $excludedFolders = ["AppStore"]; // ストア自身は一覧に出さない(常時表示は手動pinnedエントリで扱う)

  $catalog = [];
  $seenSrc = [];

  $folders = glob($appsDir . '/*', GLOB_ONLYDIR);
  if ($folders === false) {
    $folders = [];
  }

  foreach ($folders as $folderPath) {
    $folderName = basename($folderPath);
    if (in_array($folderName, $excludedFolders, true)) {
      continue;
    }

    $meta = [];
    $metaPath = $folderPath . '/meta.json';
    if (file_exists($metaPath)) {
      $decoded = json_decode(@file_get_contents($metaPath), true);
      if (is_array($decoded)) {
        $meta = $decoded;
      }
    }

    $explicitEntry = isset($meta['entry']) ? $meta['entry'] : null;
    $entryFile = pusyuuFindEntryFile($folderPath, $explicitEntry);
    if ($entryFile === null) {
      // エントリファイルが見つからないフォルダはカタログに出さない
      continue;
    }

    $title = (isset($meta['title']) && $meta['title'] !== '')
      ? $meta['title']
      : pusyuuExtractTitle($folderPath . '/' . $entryFile);
    if ($title === null || $title === '') {
      $title = $folderName;
    }

    $description = isset($meta['description']) ? $meta['description'] : '';
    $image = isset($meta['image']) ? $meta['image'] : './assets/images/img-1.png';
    $legacyCompatible = isset($meta['legacyCompatible']) ? (bool) $meta['legacyCompatible'] : false;
    $pinned = isset($meta['pinned']) ? (bool) $meta['pinned'] : false;

    $src = $appsBaseUrl . '/' . $folderName . '/' . $entryFile;

    $catalog[] = [
      "id" => "app-" . pusyuuSlugify($folderName),
      "title" => $title,
      "description" => $description,
      "image" => $image,
      "src" => $src,
      "legacyCompatible" => $legacyCompatible,
      "pinned" => $pinned
    ];
    $seenSrc[$src] = true;
  }

  // appList.json内の手動エントリをマージ（GLOBで既出のsrcは重複させない）
  //
  // 【プシューサービスのプロダクトは "registry" に台帳のIDを書くこと】その項目の src と、
  // 「/」で始まる image は、そのプロダクトの中のパスとして扱い、住所の頭は台帳
  // (pusyuu_registry)の、今の入口に合う顔から付けます。ドメインを src に書き戻さないこと
  // (以前はそうしていたため、IPやLAN、別のドメインから入った人も公開ドメインへ飛ばされました)。
  // 台帳が読めない・IDが無いときは、その項目を出しません(押しても開けないリンクになるため)。
  foreach (pusyuuReadAppList() as $item) {
    $registryId = isset($item['registry']) ? (string) $item['registry'] : '';
    $base = ($registryId !== '' && class_exists('PusyuuRegistryClient')) ? PusyuuRegistryClient::url($registryId) : null;
    $rawSrc = isset($item['src']) ? (string) $item['src'] : null;
    $rawImage = isset($item['image']) ? (string) $item['image'] : './assets/images/img-1.png';

    if ($rawSrc === null) {
      $src = null;
    } else if ($registryId === '') {
      $src = $rawSrc;
    } else if ($base === null) {
      $src = null;
    } else {
      $src = $base . $rawSrc;
    }

    if ($src === null || isset($seenSrc[$src])) {
      continue;
    }
    $catalog[] = [
      "id" => isset($item['id']) ? $item['id'] : ('app-' . pusyuuSlugify(isset($item['title']) ? $item['title'] : $src)),
      "title" => isset($item['title']) ? $item['title'] : '',
      "description" => isset($item['description']) ? $item['description'] : '',
      "image" => ($registryId !== '' && strncmp($rawImage, '/', 1) === 0 && strncmp($rawImage, '//', 2) !== 0) ? $base . $rawImage : $rawImage,
      "src" => $src,
      "legacyCompatible" => isset($item['legacyCompatible']) ? (bool) $item['legacyCompatible'] : false,
      "pinned" => isset($item['pinned']) ? (bool) $item['pinned'] : false
    ];
    $seenSrc[$src] = true;
  }

  return $catalog;
}

// =====================================================================
// API(?svc=)
// =====================================================================

/** JSONを返して終わります。**戻りません。** */
function toolboxApiRespond(bool $ok, array $payload = []): void {
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(array_merge(['ok' => $ok], $payload), JSON_UNESCAPED_UNICODE);
  exit;
}

/**
 * 並び順(icon_order)と導入済み一覧(installed_ids)の読み書き。
 *
 * 【1つの関数にした理由】この2つは、アカウントに預けるキーの名前と、応答に載せる
 * 項目名以外、まったく同じ処理でした。以前は2枚のファイルに同じものが書かれていて、
 * 片方だけ直せば食い違う状態でした。
 *
 * @param string $key   アカウント(userData['toolbox'])の中のキー
 * @param string $field 応答のJSONに載せる項目名
 */
function toolboxApiUserList(string $key, string $field): void {
  // 1回の要求で保存できる件数の上限。異常に大きい配列を送りつけられて、アカウント側の
  // userData の容量を無駄に消費されないための軽い安全策です。
  $max = 300;
  $token = toolboxAccountToken();
  $action = (string)($_GET['action'] ?? '');

  // 未サインインも、アカウント機能そのものが無い・届かないのも、toolboxにとっては
  // 同じ「この一覧はこのブラウザにだけ保存する」状態です。異常系ではなく通常の利用形態
  // なので、エラーにはせず null を返すだけにします。
  // 【ここを通さずに下の関数を呼ばないこと】共有スクリプトが無い環境では
  // pusyuuAccount〜() が存在せず、致命的エラーになります。
  if ($token === '' || !toolboxAccountReady()) {
    toolboxApiRespond(true, [$field => null]);
  }

  if ($action === 'get') {
    $result = pusyuuAccountDataGet($token, 'toolbox', $key);
    $value = (!empty($result['ok']) && is_array($result['value'] ?? null)) ? $result['value'] : null;
    toolboxApiRespond(true, [$field => $value]);
  }

  if ($action === 'save' && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $raw = file_get_contents('php://input');
    $body = json_decode(is_string($raw) ? $raw : '', true);
    $list = is_array($body) ? ($body[$field] ?? null) : null;

    if (!is_array($list) || count($list) > $max) {
      toolboxApiRespond(false, ['error' => 'invalid_input', 'message' => $field . 'は文字列配列(' . $max . '件まで)で指定してください。']);
    }
    // 念のため中身も文字列だけに揃えます(アプリIDは文字列のため)。
    $list = array_values(array_map('strval', $list));

    $result = pusyuuAccountDataSet($token, 'toolbox', $key, $list);
    if (!empty($result['ok'])) {
      toolboxApiRespond(true, []);
    } else {
      toolboxApiRespond(false, ['message' => $result['message'] ?? '保存に失敗しました。']);
    }
  }

  toolboxApiRespond(false, ['error' => 'unknown_action', 'message' => '不明なアクションです。']);
}

/**
 * 各アプリの保存データ(ブラウザの保存の窓口 storage-hub.js が持つもの)を、メイキィの
 * userData['toolbox'] と行き来させます。段取り(どの順で何を書くか)は設定アプリの
 * assets/scripts/settings-sync.js が持ち、ここはメイキィへの読み書きを取り次ぐだけです。
 *
 * 【置き場所は2つ(A・B)と目次(manifest)】
 *   A_<アプリID> / B_<アプリID> … アプリ1つぶんの保存データ({gen, title, mode, labels, data})
 *   manifest                  … 今そろっている方の置き場所と、その回の印・アプリの一覧
 * アップロードは今使っていない方へ書き、全部書けてから目次を切り替えます。
 * 【目次を先に書かないこと】先に書くと、途中で失敗したときに目次が書きかけの置き場所を
 * 指し、復元すると一部のアプリだけ新しく、残りは空、という中身が戻ります。
 *
 * メイキィが返す error(too_large=1件の上限超え / quota_exceeded=全体の上限超え)は、
 * そのまま JS へ渡します(案内の出し分けに使うため)。
 */
function toolboxApiStorage(): void {
  $token = toolboxAccountToken();
  $action = (string)($_GET['action'] ?? '');
  $isPost = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
  $raw = $isPost ? file_get_contents('php://input') : '';
  $body = $isPost ? json_decode(is_string($raw) ? $raw : '', true) : null;
  $body = is_array($body) ? $body : [];

  // 【ここを通さずに下の関数を呼ばないこと】共有スクリプトが無い環境では
  // pusyuuAccount〜() が存在せず、致命的エラーになります。
  if ($token === '' || !toolboxAccountReady()) {
    toolboxApiRespond(false, ['error' => 'signed_out', 'message' => 'プシューメイキィにログインしていません。']);
  }

  // 置き場所とアプリIDから、メイキィのキーを作ります。メイキィのキーは英数字・_・- の
  // 64文字までなので、それを超えるIDは扱えません(空文字を返します)。
  $slotKey = static function ($slot, $app): string {
    $key = '';
    if (($slot === 'A' || $slot === 'B') && is_string($app) && preg_match('/^[A-Za-z0-9_-]{1,62}$/', $app)) {
      $key = $slot . '_' . $app;
    }
    return $key;
  };

  if ($action === 'manifest') {
    $result = pusyuuAccountDataGet($token, 'toolbox', 'manifest');
    $value = (!empty($result['ok']) && is_array($result['value'] ?? null)) ? $result['value'] : null;
    toolboxApiRespond(true, ['manifest' => $value]);
  }

  if ($action === 'get_app') {
    $key = $slotKey((string)($_GET['slot'] ?? ''), (string)($_GET['app'] ?? ''));
    if ($key === '') {
      toolboxApiRespond(false, ['error' => 'invalid_input', 'message' => '置き場所かアプリIDの指定が不正です。']);
    }
    $result = pusyuuAccountDataGet($token, 'toolbox', $key);
    $value = (!empty($result['ok']) && is_array($result['value'] ?? null)) ? $result['value'] : null;
    toolboxApiRespond(true, ['entry' => $value]);
  }

  if ($action === 'put_app' && $isPost) {
    $key = $slotKey($body['slot'] ?? '', $body['app'] ?? '');
    $entry = $body['entry'] ?? null;
    if ($key === '' || !is_array($entry) || !is_array($entry['data'] ?? null)) {
      toolboxApiRespond(false, ['error' => 'invalid_input', 'message' => '保存データの形が不正です。']);
    }
    $result = pusyuuAccountDataSet($token, 'toolbox', $key, $entry);
    toolboxApiRespond(!empty($result['ok']), ['error' => $result['error'] ?? '', 'message' => $result['message'] ?? '']);
  }

  if ($action === 'put_manifest' && $isPost) {
    $manifest = $body['manifest'] ?? null;
    if (!is_array($manifest) || !in_array($manifest['slot'] ?? '', ['A', 'B'], true) || !is_array($manifest['apps'] ?? null)) {
      toolboxApiRespond(false, ['error' => 'invalid_input', 'message' => '目次の形が不正です。']);
    }
    $result = pusyuuAccountDataSet($token, 'toolbox', 'manifest', $manifest);
    toolboxApiRespond(!empty($result['ok']), ['error' => $result['error'] ?? '', 'message' => $result['message'] ?? '']);
  }

  if ($action === 'delete_app' && $isPost) {
    $key = $slotKey($body['slot'] ?? '', $body['app'] ?? '');
    if ($key === '') {
      toolboxApiRespond(false, ['error' => 'invalid_input', 'message' => '置き場所かアプリIDの指定が不正です。']);
    }
    $result = pusyuuAccountDataDelete($token, 'toolbox', $key);
    toolboxApiRespond(!empty($result['ok']), ['error' => $result['error'] ?? '', 'message' => $result['message'] ?? '']);
  }

  toolboxApiRespond(false, ['error' => 'unknown_action', 'message' => '不明なアクションです。']);
}

/** ?svc= の振り分け。**戻りません。** */
function toolboxApiServe(string $svc): void {
  if ($svc === 'catalog') {
    // 【一覧はセッションを始めません】ログインに関係のない読み取り専用の一覧です。
    // ここでセッションを始めると、JSONの応答にCookieや引き換えコードが付いてきます。
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['apps' => pusyuuBuildCatalog()], JSON_UNESCAPED_UNICODE);
    exit;
  }
  if ($svc === 'icon_order') {
    ToolboxSession::start();
    toolboxApiUserList('icon_order', 'order');
  }
  if ($svc === 'installed_ids') {
    ToolboxSession::start();
    toolboxApiUserList('installed_ids', 'installed_ids');
  }
  if ($svc === 'storage') {
    ToolboxSession::start();
    toolboxApiStorage();
  }

  http_response_code(404);
  toolboxApiRespond(false, ['error' => 'unknown_service', 'message' => '不明な窓口です(?svc= を確かめてください)。']);
}

// =====================================================================
// 画面
// =====================================================================

/**
 * ページの描画。各枝が自分に要る準備を自分で行い、HTMLを $html に組み立てます。
 * 【枝の中身を別関数へ追い出さないこと】どの枝で何が出るのかが、ここを見て分かる
 * ことを優先しています。
 */
function renderToolbox() {
  $assetVersion = [
    "legacyUtils" => @filemtime("./assets/scripts/legacy-utils.js"),
    "storageHub" => @filemtime("./assets/scripts/storage-hub.js"),
    "script" => @filemtime("./assets/scripts/script.js"),
    "settingsStyle" => @filemtime("./assets/styles/settings.css"),
    "settingsStorage" => @filemtime("./assets/scripts/settings-storage.js"),
    "settingsSync" => @filemtime("./assets/scripts/settings-sync.js"),
  ];

  if (isset($_GET["settings"])) {
    // ---------------------------------------------------------------
    // 設定アプリ(ツールボックスの枠の中で開かれます)
    //
    // 画面はここだけで描きます。見た目は assets/styles/settings.css、動きは
    // assets/scripts/settings-*.js です(assets/apps の下にフォルダはありません)。
    // アプリ一覧への登録は assets/documents/appList.json の "app-settings" です。
    //
    // サインイン/サインアウトのリンクは target="_top" でページ全体を移動させます
    // (枠の中で他ドメインのサインイン画面を開くと、埋め込み制限で表示できない場合が
    // あるため)。サインイン/サインアウト後は設定アプリではなく、トップへ戻ります。
    // この画面もこのファイルが出しているので、トップは「./」です。
    // ---------------------------------------------------------------
    $toolboxRootUrl = "./";

    // 【URLを自前で組み立てないこと】以前ここは、サインイン画面のホスト名と
    // "?account=login&return_to=..." を文字列連結して手で組み立てていました。
    // この形だと、往路を始めたブラウザだけが復路を完了できる
    // ようにするための使い捨ての合言葉が戻り先に付きません。その結果、サインインして
    // 戻ってきても引き渡しコードが必ず捨てられ、**何のエラーも出さずにサインインされない**
    // という状態になっていました。戻り先を変えたいときは、URLではなく戻り先そのものを
    // 窓口へ渡してください。
    $accountReady = toolboxAccountReady();
    $accountUser = null;
    $accountsLoginUrl = "";
    $accountsEditUrl = "";
    $accountUnavailableReason = "";

    // サインインに失敗して戻ってきた場合の理由。読めるのは1度だけなので、必ず変数へ
    // 受けてから使ってください(2回呼ぶと2回目は空になります)。
    $accountSignInError = toolboxAccountTakeSignInError();

    if (!$accountReady) {
      // アカウント機能が無い/届かない環境。ここでリンクを作っても行き止まりにしか
      // ならないので作らず、理由だけを画面に出します(JSは使わずPHPが出します)。
      $accountUnavailableReason = toolboxAccountUnavailableReason();
    } else {
      $accountsLoginUrl = pusyuuAccountSignInUrl($toolboxRootUrl);
      // アカウントの管理(名前・メール・ユーザー名・bio・パスワードの編集)は
      // toolbox自身にフォームを持たず、基盤側の編集画面へ誘導するだけにします。
      $accountsEditUrl = pusyuuAccountManageUrl($toolboxRootUrl);

      $accountsToken = toolboxAccountToken();
      if ($accountsToken !== "") {
        $selfResult = pusyuuAccountSelf($accountsToken);
        if (!empty($selfResult["ok"])) {
          $accountUser = $selfResult["user"];
        } else if (!empty($selfResult["rejected"])) {
          // 基盤が「そのトークンはもう無効だ」と答えた場合だけ、手元の控えを捨てます。
          // 届かなかっただけのときに捨てると、基盤が復旧しても未サインイン扱いのまま
          // になり、利用者は理由も分からず同期を失います。
          unset($_SESSION["accounts_token"]);
        } else {
          $accountUnavailableReason = $selfResult["message"];
        }
      }
    }

    // サインインの失敗理由は、下のどの状態でも同じ場所に出します。
    if ($accountSignInError !== "") {
      $signInErrorHtml = '
      <p class="note">ログインできませんでした：' . htmlspecialchars($accountSignInError, ENT_QUOTES, 'UTF-8') . '</p>';
    } else {
      $signInErrorHtml = '';
    }

    // アカウント欄と、保存データの持ち運び欄(settings-sync.js が組み立てる)へ渡す状態は、
    // 同じ3つの状態(ログイン中/ログイン前/連携できない)で出し分けます。
    // 【枝を欄ごとに分けないこと】状態を足したり条件を変えたりしたとき、片方だけ直って、
    // アカウント欄は「ログイン中」なのにアップロードのボタンは押せない、のような食い違いが
    // 起きます。各枝がアカウント欄と $syncConfig を両方決め切ってください。
    if ($accountUser !== null) {
      $accountHtml = '
      <p>
        ' . htmlspecialchars($accountUser['name'] ?? '', ENT_QUOTES, 'UTF-8') . 'さん（@' . htmlspecialchars($accountUser['username'] ?? '', ENT_QUOTES, 'UTF-8') . '）としてログイン中です。
      </p>
      <p class="note">アイコンの並び・追加したアプリは、ツールボックスを開いたときにこのプシューメイキィから自動で取り込みます。</p>
      <a class="account_login_button" href="' . htmlspecialchars($accountsEditUrl, ENT_QUOTES, 'UTF-8') . '" target="_top">プシューメイキィの管理</a>
      <a class="account_login_button" href="./?do_logout=1" target="_top">ログアウト</a>';
      $syncConfig = ['signedIn' => true, 'reason' => '', 'manageUrl' => $accountsEditUrl];
    } else if ($accountReady) {
      $accountHtml = '
      <p>ログインすると、アイコンの並びや各アプリの保存データをこのプシューメイキィに保存できるようになります。</p>
      <a class="account_login_button" href="' . htmlspecialchars($accountsLoginUrl, ENT_QUOTES, 'UTF-8') . '" target="_top">プシューメイキィでログイン</a>';
      $syncConfig = ['signedIn' => false, 'reason' => 'ログインすると、プシューメイキィへのアップロード・復元ができるようになります。', 'manageUrl' => ''];
    } else {
      $accountHtml = '
      <p>いまプシューメイキィと連携できないため、ログインできません。</p>
      <p class="note">' . htmlspecialchars($accountUnavailableReason, ENT_QUOTES, 'UTF-8') . '</p>
      <p class="note">アイコンの並び・追加したアプリ・各アプリの保存データは、このブラウザの中には今まで通り保存されます。</p>';
      $syncConfig = ['signedIn' => false, 'reason' => 'プシューメイキィと連携できないため、アップロード・復元は行えません。ファイルへの書き出し・読み込みは使えます。', 'manageUrl' => ''];
    }
    // JSへ渡す材料。<script type="application/json"> の中に置くので、< > & ' " を
    // エスケープして、中身の文字列でタグが閉じられないようにします。
    $syncConfigJson = json_encode($syncConfig, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

    $mainBase = toolboxSiteBase('main');

    $html = '<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="robots" content="noindex,nofollow" />
    <meta name="viewport" content="width=device-width, user-scalable=yes, maximum-scale=1.0, minimum-scale=1.0" />
    <title>settings</title>
    <script src="' . $mainBase . '/pusyuusystem/scripts/pusyuuWallpaper.js"></script>
    <script src="./assets/scripts/legacy-utils.js?v=' . $assetVersion["legacyUtils"] . '"></script>
    <script src="./assets/scripts/storage-hub.js?v=' . $assetVersion["storageHub"] . '"></script>
    <link href="./assets/styles/settings.css?v=' . $assetVersion["settingsStyle"] . '" rel="stylesheet" />
  </head>
  <body>
    <h3>プシューメイキィ</h3>
    <div class="account_status">' . $signInErrorHtml . $accountHtml . '
    </div>
    <h3>保存データの持ち運び</h3>
    <!-- 中身は settings-sync.js が組み立てます(プシューメイキィへのアップロード・復元と、
         ファイルへの書き出し・読み込み)。JSが無い時はこの案内だけが残ります -->
    <div class="sync_settings" id="sync_manager">
      <p class="note">プシューメイキィやファイルとの保存データのやり取りにはJavaScriptが必要です。</p>
    </div>
    <script type="application/json" id="sync_config">' . $syncConfigJson . '</script>
    <h3>アプリの保存データ</h3>
    <!-- 中身は settings-storage.js が組み立てます。JSが無い時はこの案内だけが残ります -->
    <div class="storage_settings" id="storage_manager">
      <p class="note">保存データの確認・削除にはJavaScriptが必要です。</p>
    </div>
    <h3>アプリの詳細情報</h3>
    <div>
      <h4>利用条件</h4>
      <div style="display: flex; flex-wrap: wrap;">
        <a style="padding: 5px;" href="' . $mainBase . '/rules" target="_blank">ルールズ</a>
      </div>
      <h3>壁紙変更はこちらからできます</h3>
      <p>※ブラウザキャッシュを削除すると戻ってしまうのでご注意ください。</p>
      <h5>あなたの好きな画像を壁紙を追加↓</h5>
      <pusyuuWallpaper service-name="PusyuuMultiApp_selectedImage" p-wall-option="thisNonSetWall">現在JavaScriptが古いか無効になっているためプシュー壁紙を読み込めませんでした。</pusyuuWallpaper>
    </div>
    <script src="./assets/scripts/settings-storage.js?v=' . $assetVersion["settingsStorage"] . '"></script>
    <script src="./assets/scripts/settings-sync.js?v=' . $assetVersion["settingsSync"] . '"></script>
  </body>
</html>
';

  } else {
    // ---------------------------------------------------------------
    // ツールボックスのトップ
    // ---------------------------------------------------------------
    if (function_exists('pusyuuRecordProductUsage')) {
      pusyuuRecordProductUsage('toolbox');
    }

    // アイコン並び順をアカウントに同期するための自動サインイン(ログインボタン等は
    // 追加せず、他サービスで既にサインイン済みならブラウザ経由で自動的に連携します)。
    // 設定アプリのサインインのリンクもここへ戻ってきて、ここから出発します。
    // アカウント機能が無い環境では何も起きず、並び順はこのブラウザにだけ保存されます。
    toolboxSilentSsoCheck();

    $title = "プシューサービス - ツールボックス";
    $description = "このアプリは便利な機能が沢山詰まったツールボックスで、日所生活、仕事、勉強で説明書も読まず楽にかつ簡単に使える手軽ツールがあり、それらがアプリアイコンとして表示されててスマホでもパソコンでも同じ環境で実行可能です、更になんと、このツールボックスは壁紙の変更機能はもちろん、ブラウザで実行可能で、バックグラウンド実行も可能なのです！！";
    $mainBase = toolboxSiteBase('main');
    $notationHtml = function_exists('notationDisp') ? notationDisp() . notationDisp("copyright") : '';

    $html = '<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, user-scalable=yes, maximum-scale=1.0, minimum-scale=1.0" />
    <meta name="copyright" content="© 2020-2024 created by PusyuuWanko/" />
    <meta name="description" content="' . $description . '" />
    <meta name="keywords" content="" />
    <meta property="og:title" content="' . $title . '" />
    <meta property="og:site_name" content="' . $title . '" />
    <meta property="og:description" content="' . $description . '" />
    <meta property="og:image" content="' . toolboxSiteBase('main', true) . '/pusyuusystem/images/NanimoyakunitatanaiPage.png" />
    <meta property="og:type" content="application" />
    <title>' . $title . '</title>
    <link rel="stylesheet" href="./assets/styles/Style.css" />
    <link rel="shortcut icon" href="./assets/images/favicon.ico" />
    <link rel="manifest" href="./assets/documents/manifest.json" />
    <script type="text/javascript" src="./assets/scripts/legacy-utils.js?v=' . $assetVersion["legacyUtils"] . '"></script>
    <!-- 保存の窓口。アプリの枠(iframe)はこの画面の窓口を使うので、アプリより先に読み込むこと -->
    <script type="text/javascript" src="./assets/scripts/storage-hub.js?v=' . $assetVersion["storageHub"] . '"></script>
    <script type="text/javascript" src="./assets/scripts/script.js?v=' . $assetVersion["script"] . '"></script>
    <!-- <script src="' . $mainBase . '/pusyuusystem/scripts/internet_checker.js"></script> タグを無効化したが変化なし少なくともログインできない理由の原因ではないらしい-->
    <script src="' . $mainBase . '/pusyuusystem/scripts/touch-device-tool-tip.js"></script>
    <script src="' . $mainBase . '/pusyuusystem/scripts/pusyuuWallpaper.js"></script>
    <!-- privacy_notice.js の script タグより前に置く -->
    <script>
      window.PusyuuPrivacyNoticeConfig = {
        // ---- 機能1(初回アクセス時の自動お知らせ)のカスタマイズ ----
        title: "プライバシーに関するお知らせ",
        // bodyHtml: "<p>...</p>", // 本文を丸ごと差し替えたい場合のみ指定(指定すると下のserviceNameは使われなくなる)
        serviceName: "プシューサービス", // 省略時は特定サービス名を出さず一般論の文章になる
        closeButtonText: "同意する",
        hostsIntroText: "このページ読み込み時に検出した外部の通信先：",
        hostsNoneText: "このページ読み込み時には、外部への通信は検出されませんでした。",
        storageKey: "pusyuu_privacy_notice_dismissed", // 表示済みフラグの保存キー名

        // ---- "js-dependency"プリセット(機能2)のカスタマイズ ----
        jsDependency: {
          level: "high", // このページの実情に合わせて "none" | "low" | "medium" | "high"
          brokenFeatures: [
            "このツールボックスの全機能"
          ],
          fallbackNote:
            "詳しい方針は<a href=\"' . $mainBase . '/rules/javascript/\" " +
            "target=\"_blank\">JavaScriptの取り扱いに関する方針</a>をご覧ください。"
        },

        triggerCloseButtonText: "閉じる" // 機能2のモーダルの閉じるボタン文言
      };
    </script>
    <script src="' . $mainBase . '/pusyuusystem/scripts/privacy_notice.js"></script>
    <!--
        *----------------------------------
        |  ThisPageVersion: 3.21.2      |
        |  © 2021-2026 By ISAMI ABE     |
        |  LastUpdate: 2025-01-15       |
        |  License: MIT License         |
        |  toolbox                      |
      ----------------------------------*
      -->
  </head>
  <body id="target-element">
    <!--壁紙の表示を行うために記述-->
    <div style="display: none;">
      <pusyuuWallpaper service-name="PusyuuMultiApp_selectedImage">現在JavaScriptが古いか無効になっているためプシュー壁紙を読み込めませんでした。</pusyuuWallpaper>
    </div>
    <!--rightクリックのカスタムメニュー-->
    <div id="custom-menu">
      <ul>
        <li><a href="' . $mainBase . '#products" target="_blank">その他プロダクト一覧を見る</a></li>
        <li><a onclick="window.location.href = \'./\';" href="#">ツールボックスを再起動</a></li>
        <li><a href="' . $mainBase . '/pusyuusystem/pages/contact" target="_blank">開発者に問い合わせる</a></li>
      </ul>
      ' . $notationHtml . '
    </div>
    <main class="main">
      <div class="main_wrapper">
        <div class="yokoori" id="app_list_wrapper">
          <p style="color: #ff0000; display: flex; justify-content: center;">あなたの環境ではJSが有効になっていないか、ブラウザが古い可能性があります。</p>
        </div>
        <div id="modal_wrapper">
        </div>
      </div>
    </main>
  </body>
</html>
';
  }

  return $html;
}

// =====================================================================
// 振り分け
//
// 【この順番を変えないこと】
//   1. ?svc= … JSONを返して終わる。アプリ一覧はセッションを始めない(上の
//      toolboxApiServe() のコメント参照)ので、セッション開始より前に置きます。
//   2. セッション開始 … 出力より前であること(Cookieの発行とクッキー無しの試験のため)。
//   3. ?do_logout= … header()+exit で終わる。セッションが要るので2の後。
//   4. 画面 … renderToolbox() は文字列を返すだけなので、最後の1行で出すまで
//      ヘッダを送れます(自動サインインの転送もその中で行われます)。
// =====================================================================
if (isset($_GET['svc'])) {
  toolboxApiServe((string)$_GET['svc']);
}

ToolboxSession::start();

if (isset($_GET['do_logout'])) {
  toolboxLogout();
}

// 古いInternet Explorerは、クロスドメインのSSOリダイレクト後に戻ってきた
// 側でCookie(セッション)が保持されない場合がある。IEはP3Pポリシーの宣言が
// 無いCookieを"サードパーティ的"とみなして拒否することがあるための既知の
// 挙動で、この宣言はその互換性のためだけのものです(実際のプライバシー
// ポリシーの内容を表すものではありません)。accounts側のログイン画面にも
// 同じ宣言を入れています。
header('P3P: CP="CAO PSA OUR"');
?>
<?= renderToolbox() ?>
