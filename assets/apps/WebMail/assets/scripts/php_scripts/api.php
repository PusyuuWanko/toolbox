<?php
/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 1.2.0     |
  |  © 2026 By PusyuuWanko/       |
  |  License: MIT License         |
  |  PusyuuWebMail - api          |
----------------------------------*
  接続情報(ホスト/ポート/暗号化/ユーザー名/パスワード)は
  リクエストの都度クライアントから受け取り、サーバー側では
  一切ファイルやセッションに保存しない。
******************************************/

header("Content-Type: application/json; charset=utf-8");

// ---------------------------------------------------------------------
// IMAP と SMTP の係(以前は同じフォルダの imap_client.php / smtp_client.php)。
// **どちらもこのファイルからしか使われていなかったので、ここへ入れました。**
// 3枚に分けておくと、1つの流れを追うのに3枚を開くことになります。受信と送信の
// 境目は、下の見出しコメントで分かるようにしてあります。
// ---------------------------------------------------------------------
/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 1.0.1     |
  |  © 2026 By PusyuuWanko/       |
  |  License: MIT License         |
  |  PusyuuWebMail - imap_client  |
----------------------------------*
  PHPのimap拡張(php.iniでの有効化が必要)を使わず、
  stream_socket_client によるIMAP4rev1プロトコルの
  最小限の自前実装。組み込み関数のみで完結する。
******************************************/

class ImapException extends Exception {}

class ImapClient {
  private $stream;
  private $tagCounter = 1;

  public function connect($host, $port, $encryption) {
    $transport = ($encryption === 'ssl') ? 'ssl' : 'tcp';
    $context = stream_context_create([
      "ssl" => [
        "verify_peer" => true,
        "verify_peer_name" => true
      ]
    ]);

    $this->stream = @stream_socket_client(
      "$transport://$host:$port",
      $errno,
      $errstr,
      15,
      STREAM_CLIENT_CONNECT,
      $context
    );

    if (!$this->stream) {
      throw new ImapException("IMAPサーバーへの接続に失敗しました: $errstr ($errno)");
    }

    stream_set_timeout($this->stream, 15);

    // 接続直後のグリーティングを読み捨てる
    fgets($this->stream, 8192);

    if ($encryption === 'starttls') {
      $resp = $this->command("STARTTLS");
      if ($resp['status'] !== 'OK') {
        throw new ImapException("STARTTLSに失敗しました。");
      }
      $this->enableCrypto();
    }
  }

  private function enableCrypto() {
    $methods = [];
    if (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT')) {
      $methods[] = STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
    }
    if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
      $methods[] = STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
    }
    $methods[] = STREAM_CRYPTO_METHOD_TLS_CLIENT;

    $ok = false;
    foreach ($methods as $method) {
      if (@stream_socket_enable_crypto($this->stream, true, $method)) {
        $ok = true;
        break;
      }
    }
    if (!$ok) {
      throw new ImapException("TLSの開始に失敗しました。");
    }
  }

  private function nextTag() {
    return "A" . ($this->tagCounter++);
  }

  private function quote($value) {
    return '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $value) . '"';
  }

  // タグ付きコマンドを送信し、完了行までを読み取る
  private function command($commandText) {
    $tag = $this->nextTag();
    $line = "$tag $commandText\r\n";
    if (fwrite($this->stream, $line) === false) {
      throw new ImapException("IMAPサーバーへの送信に失敗しました。");
    }

    $raw = '';
    $literals = [];
    $status = 'BAD';
    $statusLine = '';

    while (true) {
      $lineData = fgets($this->stream, 16384);
      if ($lineData === false) {
        break;
      }
      $raw .= $lineData;

      if (preg_match('/\{(\d+)\}\r?\n$/', $lineData, $m)) {
        $need = (int) $m[1];
        $data = '';
        while (strlen($data) < $need) {
          $chunk = fread($this->stream, $need - strlen($data));
          if ($chunk === false || $chunk === '') {
            break;
          }
          $data .= $chunk;
        }
        $raw .= $data;
        $literals[] = $data;
        continue;
      }

      if (preg_match('/^' . preg_quote($tag, '/') . ' (OK|NO|BAD)(.*)$/i', $lineData, $m)) {
        $status = strtoupper($m[1]);
        $statusLine = trim($m[2]);
        break;
      }
    }

    return [
      "raw" => $raw,
      "literals" => $literals,
      "status" => $status,
      "message" => $statusLine
    ];
  }

  public function login($username, $password) {
    $resp = $this->command("LOGIN " . $this->quote($username) . " " . $this->quote($password));
    if ($resp['status'] !== 'OK') {
      throw new ImapException("ログインに失敗しました。ユーザー名・パスワード・サーバー設定をご確認ください。");
    }
  }

  // 任意のフォルダを選択し、メッセージ総数を返す
  public function selectMailbox($mailboxName) {
    if (preg_match('/[\r\n]/', $mailboxName)) {
      throw new ImapException("フォルダ名が不正です。");
    }
    $target = (strtoupper($mailboxName) === 'INBOX') ? 'INBOX' : $this->quote($mailboxName);
    $resp = $this->command("SELECT $target");
    if ($resp['status'] !== 'OK') {
      throw new ImapException("フォルダの選択に失敗しました。");
    }
    $count = 0;
    if (preg_match('/\* (\d+) EXISTS/i', $resp['raw'], $m)) {
      $count = (int) $m[1];
    }
    return $count;
  }

  // INBOXを選択し、メッセージ総数を返す（後方互換）
  public function selectInbox() {
    return $this->selectMailbox('INBOX');
  }

  // フォルダ一覧を取得する。SPECIAL-USE拡張(RFC6154)に対応していれば
  // 送信済み/ゴミ箱等の属性も合わせて取得し、非対応サーバーには通常のLISTにフォールバックする
  public function listMailboxes() {
    $specialResp = $this->command('LIST (SPECIAL-USE) "" "*"');
    $specialByName = [];
    if ($specialResp['status'] === 'OK') {
      foreach (imapHelperParseListResponse($specialResp['raw']) as $f) {
        if ($f['specialUse'] !== null) {
          $specialByName[$f['name']] = $f['specialUse'];
        }
      }
    }

    $resp = $this->command('LIST "" "*"');
    if ($resp['status'] !== 'OK') {
      throw new ImapException("フォルダ一覧の取得に失敗しました。");
    }
    $folders = imapHelperParseListResponse($resp['raw']);
    foreach ($folders as &$folder) {
      if (isset($specialByName[$folder['name']])) {
        $folder['specialUse'] = $specialByName[$folder['name']];
      }
    }
    unset($folder);
    return $folders;
  }

  // 指定シーケンス番号のフラグを更新する（既読/未読の管理に使用）
  public function storeFlags($seq, $flags, $add = true) {
    $verb = $add ? '+FLAGS.SILENT' : '-FLAGS.SILENT';
    $resp = $this->command("STORE $seq $verb (" . implode(' ', $flags) . ")");
    if ($resp['status'] !== 'OK') {
      throw new ImapException("フラグの更新に失敗しました。");
    }
  }

  // \Deletedフラグが付いたメッセージを完全に削除する（EXPUNGE）
  public function expunge() {
    $resp = $this->command("EXPUNGE");
    if ($resp['status'] !== 'OK') {
      throw new ImapException("メッセージの削除に失敗しました。");
    }
  }

  // 1通ずつヘッダー(FROM/SUBJECT/DATE)とUIDを取得する（リテラルの扱いを単純化するため1通ずつ問い合わせる）
  public function fetchHeaderSummary($seq) {
    $resp = $this->command("FETCH $seq (UID FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])");
    if ($resp['status'] !== 'OK' || empty($resp['literals'])) {
      return null;
    }

    $uid = null;
    if (preg_match('/UID (\d+)/', $resp['raw'], $m)) {
      $uid = (int) $m[1];
    }

    $seen = (stripos($resp['raw'], '\\Seen') !== false);

    $headerText = $resp['literals'][0];
    $headers = imapHelperParseHeaders($headerText);

    return [
      "seq" => $seq,
      "uid" => $uid,
      "seen" => $seen,
      "from" => imapHelperDecodeMimeHeader($headers['from'] ?? ''),
      "subject" => imapHelperDecodeMimeHeader($headers['subject'] ?? '(件名なし)'),
      "date" => $headers['date'] ?? ''
    ];
  }

  // メッセージ本文全体を取得し、表示用にテキストパートを取り出す
  public function fetchMessage($seq) {
    $resp = $this->command("FETCH $seq (FLAGS UID BODY.PEEK[])");
    if ($resp['status'] !== 'OK' || empty($resp['literals'])) {
      throw new ImapException("メッセージの取得に失敗しました。");
    }
    $uid = null;
    if (preg_match('/UID (\d+)/', $resp['raw'], $m)) {
      $uid = (int) $m[1];
    }
    $seen = (stripos($resp['raw'], '\\Seen') !== false);

    $rawMessage = $resp['literals'][0];
    $message = imapHelperParseMessage($rawMessage);
    $message['seq'] = $seq;
    $message['uid'] = $uid;
    $message['seen'] = $seen;
    return $message;
  }

  // MIMEパート単体を取得する（添付ファイルのダウンロード用）。
  // メッセージ全体を再取得せず、対象パートのMIMEヘッダと本体だけを取得する
  public function fetchPart($seq, $partNumber) {
    if (!preg_match('/^[0-9]+(\.[0-9]+)*$/', $partNumber)) {
      throw new ImapException("パート番号が不正です。");
    }

    $mimeResp = $this->command("FETCH $seq (BODY.PEEK[$partNumber.MIME])");
    $bodyResp = $this->command("FETCH $seq (BODY.PEEK[$partNumber])");
    if ($bodyResp['status'] !== 'OK' || empty($bodyResp['literals'])) {
      throw new ImapException("添付ファイルの取得に失敗しました。");
    }

    $partHeaders = !empty($mimeResp['literals']) ? imapHelperParseHeaders($mimeResp['literals'][0]) : [];
    $rawBody = $bodyResp['literals'][0];
    $contentType = $partHeaders['content-type'] ?? 'application/octet-stream';
    $encoding = strtolower(trim($partHeaders['content-transfer-encoding'] ?? '7bit'));
    $disposition = $partHeaders['content-disposition'] ?? '';

    $filename = imapHelperExtractFilename($disposition, $contentType);
    if ($filename === '') {
      $filename = 'attachment';
    }
    $mimeType = trim(preg_replace('/;.*$/', '', $contentType));
    if ($mimeType === '') {
      $mimeType = 'application/octet-stream';
    }

    if ($encoding === 'base64') {
      $contentBase64 = preg_replace('/\s+/', '', $rawBody);
    } elseif ($encoding === 'quoted-printable') {
      $contentBase64 = base64_encode(quoted_printable_decode($rawBody));
    } else {
      $contentBase64 = base64_encode($rawBody);
    }

    return [
      "filename" => $filename,
      "mimeType" => $mimeType,
      "contentBase64" => $contentBase64
    ];
  }

  public function logout() {
    if ($this->stream) {
      @fwrite($this->stream, "Z1 LOGOUT\r\n");
      fclose($this->stream);
      $this->stream = null;
    }
  }
}

// ---- MIMEヘッダー・本文パース用ヘルパー関数群 ----

function imapHelperParseHeaders($headerText) {
  $headers = [];
  $lines = preg_split('/\r\n|\n/', $headerText);
  $currentKey = null;
  foreach ($lines as $line) {
    if ($line === '') {
      continue;
    }
    if (preg_match('/^\s/', $line) && $currentKey !== null) {
      $headers[$currentKey] .= ' ' . trim($line);
      continue;
    }
    if (preg_match('/^([A-Za-z\-]+):\s*(.*)$/', $line, $m)) {
      $currentKey = strtolower($m[1]);
      $headers[$currentKey] = $m[2];
    }
  }
  return $headers;
}

function imapHelperDecodeMimeHeader($value) {
  if ($value === '') {
    return '';
  }
  if (function_exists('mb_decode_mimeheader')) {
    $decoded = @mb_decode_mimeheader($value);
    if ($decoded !== false && $decoded !== null) {
      return $decoded;
    }
  }
  // mbstringが無い環境向けの手動フォールバック（=?UTF-8?B?...?= / =?UTF-8?Q?...?=）
  return preg_replace_callback(
    '/=\?([^?]+)\?(B|Q)\?([^?]*)\?=/i',
    function ($m) {
      $encoding = $m[1];
      $type = strtoupper($m[2]);
      $data = $m[3];
      if ($type === 'B') {
        $decoded = base64_decode($data);
      } else {
        $decoded = quoted_printable_decode(str_replace('_', ' ', $data));
      }
      if (function_exists('iconv') && strtoupper($encoding) !== 'UTF-8') {
        $converted = @iconv($encoding, 'UTF-8//IGNORE', $decoded);
        if ($converted !== false) {
          return $converted;
        }
      }
      return $decoded;
    },
    $value
  );
}

// 転送エンコードを解いたうえで、charset を UTF-8 に変換する
function imapHelperDecodeBody($body, $encoding, $charset = null) {
  $encoding = strtolower(trim($encoding));
  if ($encoding === 'base64') {
    $body = base64_decode(preg_replace('/\s+/', '', $body));
  } elseif ($encoding === 'quoted-printable') {
    $body = quoted_printable_decode($body);
  }
  // ここで文字コードを UTF-8 に寄せる
  return imapHelperToUtf8($body, $charset);
}

// charset 指定があればそれを優先し、無ければ日本語系を自動判定して UTF-8 へ
function imapHelperToUtf8($text, $charset = null) {
  if ($text === '' || $text === null) {
    return '';
  }

  // charset名の正規化（別名を吸収）
  $cs = strtoupper(trim((string) $charset));
  $aliases = [
    'ISO-2022-JP-MS' => 'ISO-2022-JP',
    'SHIFT_JIS'      => 'SJIS-WIN',
    'SHIFT-JIS'      => 'SJIS-WIN',
    'X-SJIS'         => 'SJIS-WIN',
    'WINDOWS-31J'    => 'SJIS-WIN',
    'CP932'          => 'SJIS-WIN',
    'EUC-JP'         => 'EUC-JP',
    'US-ASCII'       => 'ASCII',
  ];
  if (isset($aliases[$cs])) {
    $cs = $aliases[$cs];
  }

  // 既に UTF-8 として妥当なら、そのまま返す（二重変換防止）
  if ($cs === 'UTF-8' || $cs === '') {
    if (function_exists('mb_check_encoding') && mb_check_encoding($text, 'UTF-8')) {
      // charset未指定でUTF-8として妥当ならそのまま
      if ($cs === 'UTF-8') return $text;
    }
  }

  // mbstring があればそれで変換
  if (function_exists('mb_convert_encoding')) {
    if ($cs !== '' && $cs !== 'ASCII') {
      $out = @mb_convert_encoding($text, 'UTF-8', $cs);
      if ($out !== false && $out !== '') {
        return $out;
      }
    }
    // charset不明 or 変換失敗時は候補から自動判定
    $out = @mb_convert_encoding($text, 'UTF-8', 'ISO-2022-JP, UTF-8, SJIS-WIN, EUC-JP, JIS, ASCII');
    if ($out !== false && $out !== '') {
      return $out;
    }
  }

  // mbstringが無い環境は iconv でフォールバック
  if (function_exists('iconv') && $cs !== '' && $cs !== 'ASCII' && $cs !== 'UTF-8') {
    $out = @iconv($cs, 'UTF-8//IGNORE', $text);
    if ($out !== false) {
      return $out;
    }
  }

  // どうにもできなければ原文（最悪でも化けたまま返す＝欠落はさせない）
  return $text;
}

// Content-Type ヘッダから charset を取り出す
function imapHelperExtractCharset($contentType) {
  if ($contentType && preg_match('/charset\s*=\s*"?([^";\s]+)"?/i', $contentType, $m)) {
    return $m[1];
  }
  return null;
}

// Content-Disposition / Content-Type からファイル名を取り出す
// RFC2231(filename*=UTF-8''...)とRFC2047エンコードの両方に対応する
function imapHelperExtractFilename($disposition, $contentType) {
  $sources = [$disposition, $contentType];

  foreach ($sources as $source) {
    if (!$source) continue;
    if (preg_match('/filename\*\s*=\s*([^;]+)/i', $source, $m)) {
      $value = trim($m[1]);
      if (preg_match('/^([^\'\s]*)\'([^\'\s]*)\'(.+)$/', $value, $em)) {
        $decoded = @rawurldecode($em[3]);
        if ($decoded !== false && $decoded !== '') {
          return $decoded;
        }
      }
    }
  }

  foreach ($sources as $source) {
    if (!$source) continue;
    if (preg_match('/(?<!\*)filename\s*=\s*"([^"]*)"/i', $source, $m)) {
      return imapHelperDecodeMimeHeader($m[1]);
    }
    if (preg_match('/(?<!\*)filename\s*=\s*([^;\s]+)/i', $source, $m)) {
      return imapHelperDecodeMimeHeader(trim($m[1], '"'));
    }
  }

  if ($contentType) {
    if (preg_match('/;\s*name\s*=\s*"([^"]*)"/i', $contentType, $m)) {
      return imapHelperDecodeMimeHeader($m[1]);
    }
    if (preg_match('/;\s*name\s*=\s*([^;\s]+)/i', $contentType, $m)) {
      return imapHelperDecodeMimeHeader(trim($m[1], '"'));
    }
  }

  return '';
}

// IMAPの文字列トークン（クォート済み or NIL）を復元する。LIST応答のデリミタ/名前解析で使用
function imapHelperUnquoteImapString($token) {
  $token = trim($token);
  if ($token === 'NIL') {
    return null;
  }
  if (strlen($token) >= 2 && $token[0] === '"' && substr($token, -1) === '"') {
    $inner = substr($token, 1, -1);
    return str_replace(['\\"', '\\\\'], ['"', '\\'], $inner);
  }
  return $token;
}

// `* LIST (flags) "delim" name` 形式の応答行を解析する。
// 名前がIMAPリテラル({n}\r\n...)で返るケースは稀なため、クォート文字列/裸のアトムのみ対応する
function imapHelperParseListResponse($raw) {
  $folders = [];
  $lines = preg_split('/\r\n|\n/', $raw);
  foreach ($lines as $line) {
    $line = trim($line);
    if (!preg_match('/^\*\s+LIST\s+\(([^)]*)\)\s+(NIL|"(?:[^"\\\\]|\\\\.)*")\s+(.+)$/i', $line, $m)) {
      continue;
    }
    $flagsRaw = trim($m[1]);
    $flags = ($flagsRaw === '') ? [] : preg_split('/\s+/', $flagsRaw);
    $delimiter = imapHelperUnquoteImapString($m[2]);
    $name = imapHelperUnquoteImapString(trim($m[3]));
    if ($name === null || $name === '') {
      continue;
    }

    $selectable = true;
    $specialUse = null;
    foreach ($flags as $flag) {
      if (strcasecmp($flag, '\\Noselect') === 0) {
        $selectable = false;
      }
      if (in_array($flag, ['\\Sent', '\\Trash', '\\Drafts', '\\Junk', '\\All', '\\Archive', '\\Flagged'], true)) {
        $specialUse = $flag;
      }
    }

    $folders[] = [
      "name" => $name,
      "displayName" => imapHelperUtf7ImapDecode($name),
      "delimiter" => $delimiter,
      "flags" => $flags,
      "selectable" => $selectable,
      "specialUse" => $specialUse
    ];
  }
  return $folders;
}

// Unicodeコードポイント1つをUTF-8バイト列に変換する（mbstring不要）
function imapHelperCodepointToUtf8($cp) {
  if ($cp < 0x80) {
    return chr($cp);
  } elseif ($cp < 0x800) {
    return chr(0xC0 | ($cp >> 6)) . chr(0x80 | ($cp & 0x3F));
  } elseif ($cp < 0x10000) {
    return chr(0xE0 | ($cp >> 12)) . chr(0x80 | (($cp >> 6) & 0x3F)) . chr(0x80 | ($cp & 0x3F));
  }
  return chr(0xF0 | ($cp >> 18)) . chr(0x80 | (($cp >> 12) & 0x3F)) . chr(0x80 | (($cp >> 6) & 0x3F)) . chr(0x80 | ($cp & 0x3F));
}

// IMAPの Modified UTF-7 (RFC 3501 5.1.3) をUTF-8にデコードする。mbstring/iconvに依存しない自前実装。
// フォルダ名の表示用にのみ使う。フロントへは常に元のエンコード済み名前を返し、選択時もそれをそのまま送り返させるため
// JavaScript側でこの変換を扱う必要はない。
function imapHelperUtf7ImapDecode($mutf7) {
  if (strpos($mutf7, '&') === false) {
    return $mutf7;
  }

  $b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+,';
  $len = strlen($mutf7);
  $out = '';
  $i = 0;

  while ($i < $len) {
    $ch = $mutf7[$i];
    if ($ch !== '&') {
      $out .= $ch;
      $i++;
      continue;
    }

    $i++;
    if ($i < $len && $mutf7[$i] === '-') {
      $out .= '&';
      $i++;
      continue;
    }

    $b64 = '';
    while ($i < $len && strpos($b64chars, $mutf7[$i]) !== false) {
      $b64 .= $mutf7[$i];
      $i++;
    }
    if ($i < $len && $mutf7[$i] === '-') {
      $i++;
    }

    $std = str_replace(',', '/', $b64);
    $pad = strlen($std) % 4;
    if ($pad > 0) {
      $std .= str_repeat('=', 4 - $pad);
    }
    $bytes = @base64_decode($std);
    if ($bytes === false || $bytes === '') {
      continue;
    }

    $codeUnits = [];
    $blen = strlen($bytes);
    for ($j = 0; $j + 1 < $blen; $j += 2) {
      $codeUnits[] = (ord($bytes[$j]) << 8) | ord($bytes[$j + 1]);
    }

    $k = 0;
    $clen = count($codeUnits);
    while ($k < $clen) {
      $u = $codeUnits[$k];
      if ($u >= 0xD800 && $u <= 0xDBFF && $k + 1 < $clen && $codeUnits[$k + 1] >= 0xDC00 && $codeUnits[$k + 1] <= 0xDFFF) {
        $cp = 0x10000 + (($u - 0xD800) << 10) + ($codeUnits[$k + 1] - 0xDC00);
        $out .= imapHelperCodepointToUtf8($cp);
        $k += 2;
      } else {
        $out .= imapHelperCodepointToUtf8($u);
        $k++;
      }
    }
  }

  return $out;
}

// メッセージのMIME構造を再帰的に木構造として解析する。
// 各葉ノードにRFC3501のパート番号（"1", "1.1", "1.2"…）を割り当てる
function imapHelperParseMimeTree($headers, $body, $partPrefix = '') {
  $contentType = $headers['content-type'] ?? 'text/plain';

  if (stripos($contentType, 'multipart/') !== false && preg_match('/boundary\s*=\s*"?([^";]+)"?/i', $contentType, $bm)) {
    $boundary = $bm[1];
    $segments = explode('--' . $boundary, $body);
    $children = [];
    $idx = 0;
    foreach ($segments as $segment) {
      $segment = trim($segment, "\r\n");
      if ($segment === '' || $segment === '--') {
        continue;
      }
      $idx++;
      $segParts = preg_split('/\r\n\r\n|\n\n/', $segment, 2);
      $segHeaders = imapHelperParseHeaders($segParts[0] ?? '');
      $childNum = ($partPrefix === '') ? (string) $idx : ($partPrefix . '.' . $idx);
      $children[] = imapHelperParseMimeTree($segHeaders, $segParts[1] ?? '', $childNum);
    }
    return [
      "isMultipart" => true,
      "contentType" => $contentType,
      "children" => $children
    ];
  }

  return [
    "isMultipart" => false,
    "partNumber" => ($partPrefix === '') ? '1' : $partPrefix,
    "contentType" => $contentType,
    "encoding" => strtolower(trim($headers['content-transfer-encoding'] ?? '7bit')),
    "disposition" => $headers['content-disposition'] ?? '',
    "charset" => imapHelperExtractCharset($contentType),
    "filename" => imapHelperExtractFilename($headers['content-disposition'] ?? '', $contentType),
    "rawBody" => $body
  ];
}

// エンコードを解かずに（デコード前提知識だけで）おおよそのデコード後サイズを見積もる
function imapHelperEstimateDecodedSize($rawBody, $encoding) {
  $encoding = strtolower(trim($encoding));
  if ($encoding === 'base64') {
    $stripped = preg_replace('/\s+/', '', $rawBody);
    $len = strlen($stripped);
    if ($len === 0) {
      return 0;
    }
    $padding = 0;
    if (substr($stripped, -2) === '==') {
      $padding = 2;
    } elseif (substr($stripped, -1) === '=') {
      $padding = 1;
    }
    return max(0, (int) floor($len / 4) * 3 - $padding);
  }
  return strlen($rawBody);
}

// MIME木を巡回し、本文候補(プレーン/HTML)と添付ファイルの一覧を集める。
// multipart/related配下（HTML埋め込み画像など）の非添付パートは一覧に出さない
function imapHelperCollectMimeParts($node, &$plainCandidate, &$htmlCandidate, &$attachments, $insideRelated = false) {
  if ($node['isMultipart']) {
    $nowRelated = $insideRelated || (stripos($node['contentType'], 'multipart/related') !== false);
    foreach ($node['children'] as $child) {
      imapHelperCollectMimeParts($child, $plainCandidate, $htmlCandidate, $attachments, $nowRelated);
    }
    return;
  }

  $isDispositionAttachment = (stripos(trim($node['disposition']), 'attachment') === 0);
  $isText = (stripos($node['contentType'], 'text/plain') !== false) || (stripos($node['contentType'], 'text/html') !== false);

  if (!$isDispositionAttachment && stripos($node['contentType'], 'text/plain') !== false && $plainCandidate === null) {
    $plainCandidate = imapHelperDecodeBody($node['rawBody'], $node['encoding'], $node['charset']);
    return;
  }
  if (!$isDispositionAttachment && stripos($node['contentType'], 'text/html') !== false && $htmlCandidate === null) {
    $htmlCandidate = imapHelperDecodeBody($node['rawBody'], $node['encoding'], $node['charset']);
    return;
  }

  if ($insideRelated && !$isDispositionAttachment) {
    return;
  }

  if ($isDispositionAttachment || !$isText) {
    $mimeType = trim(preg_replace('/;.*$/', '', $node['contentType']));
    if ($mimeType === '') {
      $mimeType = 'application/octet-stream';
    }
    $filename = ($node['filename'] !== '') ? $node['filename'] : ('attachment_' . $node['partNumber']);
    $attachments[] = [
      "partNumber" => $node['partNumber'],
      "filename" => $filename,
      "mimeType" => $mimeType,
      "size" => imapHelperEstimateDecodedSize($node['rawBody'], $node['encoding']),
      "encoding" => $node['encoding']
    ];
  }
}

function imapHelperParseMessage($rawMessage) {
  $parts = preg_split('/\r\n\r\n|\n\n/', $rawMessage, 2);
  $headerText = $parts[0] ?? '';
  $body = $parts[1] ?? '';
  $headers = imapHelperParseHeaders($headerText);

  $from = imapHelperDecodeMimeHeader($headers['from'] ?? '');
  $subject = imapHelperDecodeMimeHeader($headers['subject'] ?? '(件名なし)');
  $date = $headers['date'] ?? '';
  $to = imapHelperDecodeMimeHeader($headers['to'] ?? '');

  $tree = imapHelperParseMimeTree($headers, $body);

  $plainCandidate = null;
  $htmlCandidate = null;
  $attachments = [];
  imapHelperCollectMimeParts($tree, $plainCandidate, $htmlCandidate, $attachments);

  $plainText = ($plainCandidate !== null) ? $plainCandidate : '';
  $htmlText = ($htmlCandidate !== null) ? $htmlCandidate : '';

  // プレーンが無くHTMLしか無い場合は、プレーン欄にはタグ落とし版を入れておく
  if ($plainText === '' && $htmlText !== '') {
    $plainText = trim(strip_tags($htmlText));
  }

  return [
    "from" => $from,
    "to" => $to,
    "subject" => $subject,
    "date" => $date,
    "body" => $plainText,
    "bodyHtml" => $htmlText,   // ← HTML本文を別フィールドで返す（サンドボックスiframe表示用）
    "attachments" => $attachments
  ];
}

/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 1.0.0     |
  |  © 2026 By PusyuuWanko/       |
  |  License: MIT License         |
  |  PusyuuWebMail - smtp_client  |
----------------------------------*
  PHPの拡張追加を必要とせず、stream_socket_client による
  SMTPプロトコルの自前実装でメール送信を行う。
******************************************/

class SmtpException extends Exception {}

class SmtpClient {
  private $stream;

  public function connect($host, $port, $encryption) {
    $transport = ($encryption === 'ssl') ? 'ssl' : 'tcp';
    $context = stream_context_create([
      "ssl" => [
        "verify_peer" => true,
        "verify_peer_name" => true
      ]
    ]);

    $this->stream = @stream_socket_client(
      "$transport://$host:$port",
      $errno,
      $errstr,
      15,
      STREAM_CLIENT_CONNECT,
      $context
    );

    if (!$this->stream) {
      throw new SmtpException("SMTPサーバーへの接続に失敗しました: $errstr ($errno)");
    }

    stream_set_timeout($this->stream, 15);
    $this->readResponse();

    $this->sendCommand("EHLO webmail.local");
    $this->readResponse();

    if ($encryption === 'starttls') {
      $this->sendCommand("STARTTLS");
      $resp = $this->readResponse();
      if ($resp['code'] !== 220) {
        throw new SmtpException("STARTTLSに失敗しました。");
      }
      $this->enableCrypto();
      $this->sendCommand("EHLO webmail.local");
      $this->readResponse();
    }
  }

  private function enableCrypto() {
    $methods = [];
    if (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT')) {
      $methods[] = STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
    }
    if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
      $methods[] = STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
    }
    $methods[] = STREAM_CRYPTO_METHOD_TLS_CLIENT;

    $ok = false;
    foreach ($methods as $method) {
      if (@stream_socket_enable_crypto($this->stream, true, $method)) {
        $ok = true;
        break;
      }
    }
    if (!$ok) {
      throw new SmtpException("TLSの開始に失敗しました。");
    }
  }

  private function sendCommand($command) {
    fwrite($this->stream, $command . "\r\n");
  }

  // 複数行応答(250-...)に対応した応答読み取り
  private function readResponse() {
    $fullText = '';
    $code = 0;
    while (true) {
      $line = fgets($this->stream, 4096);
      if ($line === false) {
        break;
      }
      $fullText .= $line;
      if (preg_match('/^(\d{3})([ -])/', $line, $m)) {
        $code = (int) $m[1];
        if ($m[2] === ' ') {
          break;
        }
      } else {
        break;
      }
    }
    return ["code" => $code, "text" => $fullText];
  }

  public function authLogin($username, $password) {
    $this->sendCommand("AUTH LOGIN");
    $resp = $this->readResponse();
    if ($resp['code'] !== 334) {
      throw new SmtpException("AUTH LOGINに対応していないサーバーです。");
    }

    $this->sendCommand(base64_encode($username));
    $resp = $this->readResponse();
    if ($resp['code'] !== 334) {
      throw new SmtpException("ユーザー名が受け付けられませんでした。");
    }

    $this->sendCommand(base64_encode($password));
    $resp = $this->readResponse();
    if ($resp['code'] !== 235) {
      throw new SmtpException("認証に失敗しました。ユーザー名・パスワードをご確認ください。");
    }
  }

  private function encodeHeaderWord($text) {
    if (preg_match('/^[\x20-\x7E]*$/', $text)) {
      return $text;
    }
    return "=?UTF-8?B?" . base64_encode($text) . "?=";
  }

  // MAIL FROM/RCPT TO/DATA の共通シーケンスを送り、DATA本文の書き込み前まで進める
  private function beginTransaction($fromAddress, $toAddress) {
    $this->sendCommand("MAIL FROM:<$fromAddress>");
    $resp = $this->readResponse();
    if ($resp['code'] !== 250) {
      throw new SmtpException("送信元アドレスが拒否されました。");
    }

    $this->sendCommand("RCPT TO:<$toAddress>");
    $resp = $this->readResponse();
    if ($resp['code'] !== 250 && $resp['code'] !== 251) {
      throw new SmtpException("宛先アドレスが拒否されました。");
    }

    $this->sendCommand("DATA");
    $resp = $this->readResponse();
    if ($resp['code'] !== 354) {
      throw new SmtpException("メール本文の送信を開始できませんでした。");
    }
  }

  // DATA本文を送信し、終端("."単独行)まで書き込んでサーバー応答を確認する。
  // 行頭が"."で始まる行は構造的にダブルドット化する（本文の種類に依存しない安全策）
  private function finishData($headers, $body) {
    $stuffedBody = preg_replace('/^\./m', '..', $body);
    $message = $headers . "\r\n" . $stuffedBody . "\r\n.\r\n";
    fwrite($this->stream, $message);

    $resp = $this->readResponse();
    if ($resp['code'] !== 250) {
      throw new SmtpException("メールの送信に失敗しました。");
    }
  }

  public function sendMail($fromAddress, $toAddress, $subject, $body) {
    $fromAddress = smtpHelperSanitizeHeaderValue($fromAddress);
    $toAddress = smtpHelperSanitizeHeaderValue($toAddress);
    $subject = smtpHelperSanitizeHeaderValue($subject);

    $this->beginTransaction($fromAddress, $toAddress);

    $date = date("r");
    $encodedSubject = $this->encodeHeaderWord($subject);
    $bodyChunked = chunk_split(base64_encode($body));

    $headers = "Date: $date\r\n" .
      "From: <$fromAddress>\r\n" .
      "To: <$toAddress>\r\n" .
      "Subject: $encodedSubject\r\n" .
      "MIME-Version: 1.0\r\n" .
      "Content-Type: text/plain; charset=UTF-8\r\n" .
      "Content-Transfer-Encoding: base64\r\n";

    $this->finishData($headers, $bodyChunked);
  }

  // HTML本文・添付ファイルに対応したMIME組み立て送信。
  // $attachments は [{filename, mimeType, contentBase64}, ...]
  public function sendMailMime($fromAddress, $toAddress, $subject, $plainBody, $htmlBody, $attachments) {
    if (($htmlBody === null || $htmlBody === '') && empty($attachments)) {
      $this->sendMail($fromAddress, $toAddress, $subject, $plainBody);
      return;
    }

    $fromAddress = smtpHelperSanitizeHeaderValue($fromAddress);
    $toAddress = smtpHelperSanitizeHeaderValue($toAddress);
    $subject = smtpHelperSanitizeHeaderValue($subject);

    $this->beginTransaction($fromAddress, $toAddress);

    $date = date("r");
    $encodedSubject = $this->encodeHeaderWord($subject);
    $headers = "Date: $date\r\n" .
      "From: <$fromAddress>\r\n" .
      "To: <$toAddress>\r\n" .
      "Subject: $encodedSubject\r\n" .
      "MIME-Version: 1.0\r\n";

    $bodyPart = $this->buildBodyPart($plainBody, $htmlBody);

    if (empty($attachments)) {
      $headers .= "Content-Type: " . $bodyPart['contentType'] . "\r\n";
      $this->finishData($headers, $bodyPart['content']);
      return;
    }

    $mixedBoundary = 'mixed_' . bin2hex(random_bytes(12));
    $headers .= "Content-Type: multipart/mixed; boundary=\"$mixedBoundary\"\r\n";

    $data = "--$mixedBoundary\r\n" .
      "Content-Type: " . $bodyPart['contentType'] . "\r\n\r\n" .
      $bodyPart['content'] . "\r\n";

    foreach ($attachments as $attachment) {
      $data .= "--$mixedBoundary\r\n" . $this->buildAttachmentPart($attachment) . "\r\n";
    }
    $data .= "--$mixedBoundary--\r\n";

    $this->finishData($headers, $data);
  }

  // プレーン本文のみ、またはプレーン+HTMLのmultipart/alternativeパートを組み立てる
  private function buildBodyPart($plainBody, $htmlBody) {
    if ($htmlBody === null || $htmlBody === '') {
      return [
        "contentType" => "text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64",
        "content" => chunk_split(base64_encode($plainBody))
      ];
    }

    $altBoundary = 'alt_' . bin2hex(random_bytes(12));
    $plainForFallback = ($plainBody !== '') ? $plainBody : trim(strip_tags($htmlBody));

    $content = "--$altBoundary\r\n" .
      "Content-Type: text/plain; charset=UTF-8\r\n" .
      "Content-Transfer-Encoding: base64\r\n\r\n" .
      chunk_split(base64_encode($plainForFallback)) . "\r\n" .
      "--$altBoundary\r\n" .
      "Content-Type: text/html; charset=UTF-8\r\n" .
      "Content-Transfer-Encoding: base64\r\n\r\n" .
      chunk_split(base64_encode($htmlBody)) . "\r\n" .
      "--$altBoundary--\r\n";

    return [
      "contentType" => "multipart/alternative; boundary=\"$altBoundary\"",
      "content" => $content
    ];
  }

  // 添付ファイル1件分のMIMEパート（ヘッダ+base64本体）を組み立てる
  private function buildAttachmentPart($attachment) {
    $filename = smtpHelperSanitizeHeaderValue((string) ($attachment['filename'] ?? 'attachment'));
    $mimeType = (string) ($attachment['mimeType'] ?? 'application/octet-stream');
    if (!preg_match('~^[A-Za-z0-9!#$&.+\-^_]+/[A-Za-z0-9!#$&.+\-^_]+$~', $mimeType)) {
      $mimeType = 'application/octet-stream';
    }
    $rawBytes = base64_decode(preg_replace('/\s+/', '', (string) ($attachment['contentBase64'] ?? '')), true);
    if ($rawBytes === false) {
      $rawBytes = '';
    }

    $filenameParam = smtpHelperEncodeFilenameParam($filename);

    return "Content-Type: $mimeType; name=\"" . smtpHelperAsciiFallback($filename) . "\"\r\n" .
      "Content-Transfer-Encoding: base64\r\n" .
      "Content-Disposition: attachment; $filenameParam\r\n\r\n" .
      chunk_split(base64_encode($rawBytes));
  }

  public function quit() {
    if ($this->stream) {
      $this->sendCommand("QUIT");
      $this->readResponse();
      fclose($this->stream);
      $this->stream = null;
    }
  }
}

// ---- ヘッダー/MIME組み立て用ヘルパー関数群 ----

// ヘッダーやSMTPコマンド行に展開する値からCR/LFを除去する（ヘッダインジェクション対策）
function smtpHelperSanitizeHeaderValue($value) {
  return str_replace(["\r", "\n"], '', (string) $value);
}

// 非ASCIIを含むファイル名の、宛先ヘッダのname=""用ASCIIフォールバック
function smtpHelperAsciiFallback($filename) {
  $ascii = preg_replace('/[^\x20-\x7E]/', '_', $filename);
  $ascii = str_replace('"', "'", $ascii);
  return ($ascii !== '') ? $ascii : 'attachment';
}

// RFC2231形式のfilenameパラメータを組み立てる（日本語ファイル名対応）
function smtpHelperEncodeFilenameParam($filename) {
  $asciiFallback = smtpHelperAsciiFallback($filename);
  $encoded = rawurlencode($filename);
  return "filename=\"$asciiFallback\"; filename*=UTF-8''$encoded";
}

// 添付ファイルはBase64でJSONに埋め込むため、ステートレス(永続ストレージ無し)な
// このスクリプトがメモリ上に複数コピーを同時に保持できる範囲で上限を設ける
define('PWM_MAX_ATTACHMENT_BYTES', 10 * 1024 * 1024);
define('PWM_MAX_TOTAL_ATTACHMENT_BYTES', 25 * 1024 * 1024);

function respondError($message, $httpCode = 400) {
  http_response_code($httpCode);
  echo json_encode(["error" => $message], JSON_UNESCAPED_UNICODE);
  exit;
}

function requiredField($data, $key) {
  if (!isset($data[$key]) || $data[$key] === '') {
    respondError("必須項目が不足しています: $key");
  }
  return $data[$key];
}

function validPort($port) {
  $port = (int) $port;
  if ($port < 1 || $port > 65535) {
    respondError("ポート番号が不正です。");
  }
  return $port;
}

function validEncryption($enc) {
  if (!in_array($enc, ['ssl', 'starttls', 'none'], true)) {
    respondError("暗号化方式が不正です。");
  }
  return $enc;
}

// php.ini の post_max_size 単位表記("8M"など)をバイト数に変換する
function pwmParseIniSize($value) {
  $value = trim((string) $value);
  if ($value === '') {
    return 0;
  }
  $last = strtolower(substr($value, -1));
  $num = (int) $value;
  switch ($last) {
    case 'g': return $num * 1024 * 1024 * 1024;
    case 'm': return $num * 1024 * 1024;
    case 'k': return $num * 1024;
    default:  return $num;
  }
}

// post_max_size超過時、PHPはユーザーコード実行前に$_POST/php://inputを黙って空にする。
// この場合「必須項目が不足しています」という紛らわしいエラーになるため、先に検知して専用エラーを出す
function pwmCheckPostSizeLimit() {
  $contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
  if ($contentLength <= 0) {
    return;
  }
  $limit = pwmParseIniSize(ini_get('post_max_size'));
  if ($limit > 0 && $contentLength > $limit) {
    respondError("送信データがサーバーの上限(post_max_size)を超えています。添付ファイルを減らしてください。", 413);
  }
}

// IMAP接続を確立してログインする共通ヘルパー
function pwmOpenImap($input) {
  $host = requiredField($input, 'imapHost');
  $port = validPort(requiredField($input, 'imapPort'));
  $encryption = validEncryption($input['imapEncryption'] ?? 'ssl');
  $username = requiredField($input, 'username');
  $password = requiredField($input, 'password');

  $imap = new ImapClient();
  $imap->connect($host, $port, $encryption);
  $imap->login($username, $password);
  return $imap;
}

// folder未指定時はINBOXを選択する共通ヘルパー
function pwmSelectFolder($imap, $input) {
  $folder = (isset($input['folder']) && $input['folder'] !== '') ? $input['folder'] : 'INBOX';
  return $imap->selectMailbox($folder);
}

pwmCheckPostSizeLimit();

$rawInput = file_get_contents("php://input");
$input = json_decode($rawInput, true);
if (!is_array($input)) {
  $input = $_POST;
}

$action = $input['action'] ?? ($_GET['action'] ?? '');

try {
  switch ($action) {

    case 'test': {
      $imap = pwmOpenImap($input);
      $total = $imap->selectInbox();
      $imap->logout();
      echo json_encode(["ok" => true, "total" => $total], JSON_UNESCAPED_UNICODE);
      break;
    }

    case 'folders': {
      $imap = pwmOpenImap($input);
      $folders = $imap->listMailboxes();
      $imap->logout();
      echo json_encode(["ok" => true, "folders" => $folders], JSON_UNESCAPED_UNICODE);
      break;
    }

    case 'list': {
      $imap = pwmOpenImap($input);
      $total = pwmSelectFolder($imap, $input);

      // ページネーション用パラメータ
      // offset = 新しい方から何件スキップするか（0 = 最新ページ）
      // limit  = 1ページに何件表示するか
      $limit = (int) ($input['limit'] ?? 20);
      if ($limit < 1)  $limit = 20;
      if ($limit > 100) $limit = 100;   // 取りすぎ防止の上限

      $offset = (int) ($input['offset'] ?? 0);
      if ($offset < 0) $offset = 0;
      if ($offset > $total) $offset = $total;

      // 新しい方から offset 件飛ばした位置を「ページ先頭(=最も新しいseq)」とする
      $topSeq = $total - $offset;              // このページで最も新しい seq
      $bottomSeq = max(1, $topSeq - $limit + 1); // このページで最も古い seq

      $messages = [];
      if ($topSeq >= 1) {
        for ($seq = $topSeq; $seq >= $bottomSeq; $seq--) {
          $summary = $imap->fetchHeaderSummary($seq);
          if ($summary !== null) {
            $messages[] = $summary;
          }
        }
      }
      $imap->logout();

      echo json_encode([
        "ok" => true,
        "total" => $total,
        "offset" => $offset,
        "limit" => $limit,
        "messages" => $messages
      ], JSON_UNESCAPED_UNICODE);
      break;
    }

    case 'message': {
      $imap = pwmOpenImap($input);
      pwmSelectFolder($imap, $input);
      $seq = (int) requiredField($input, 'seq');

      $message = $imap->fetchMessage($seq);

      // markSeen省略時は「開いたら既読にする」通常のメールクライアント挙動をデフォルトにする
      $markSeen = !array_key_exists('markSeen', $input) || $input['markSeen'];
      if ($markSeen && !$message['seen']) {
        $imap->storeFlags($seq, ['\\Seen'], true);
        $message['seen'] = true;
      }

      $imap->logout();
      echo json_encode(["ok" => true, "message" => $message], JSON_UNESCAPED_UNICODE);
      break;
    }

    case 'mark': {
      $imap = pwmOpenImap($input);
      pwmSelectFolder($imap, $input);
      $seq = (int) requiredField($input, 'seq');
      $seen = !empty($input['seen']);

      $imap->storeFlags($seq, ['\\Seen'], $seen);
      $imap->logout();

      echo json_encode(["ok" => true, "seen" => $seen], JSON_UNESCAPED_UNICODE);
      break;
    }

    case 'delete': {
      $imap = pwmOpenImap($input);
      pwmSelectFolder($imap, $input);
      $seq = (int) requiredField($input, 'seq');

      $imap->storeFlags($seq, ['\\Deleted'], true);
      $imap->expunge();
      $imap->logout();

      echo json_encode(["ok" => true], JSON_UNESCAPED_UNICODE);
      break;
    }

    case 'attachment': {
      $imap = pwmOpenImap($input);
      pwmSelectFolder($imap, $input);
      $seq = (int) requiredField($input, 'seq');
      $partNumber = (string) requiredField($input, 'partNumber');

      $result = $imap->fetchPart($seq, $partNumber);
      $imap->logout();

      $decodedSize = (int) (strlen($result['contentBase64']) * 3 / 4);
      if ($decodedSize > PWM_MAX_ATTACHMENT_BYTES) {
        respondError("添付ファイルが大きすぎるため表示できません。", 413);
      }

      echo json_encode(array_merge(["ok" => true], $result), JSON_UNESCAPED_UNICODE);
      break;
    }

    case 'send': {
      $host = requiredField($input, 'smtpHost');
      $port = validPort(requiredField($input, 'smtpPort'));
      $encryption = validEncryption($input['smtpEncryption'] ?? 'ssl');
      $username = requiredField($input, 'username');
      $password = requiredField($input, 'password');
      $to = requiredField($input, 'to');
      $subject = $input['subject'] ?? '(件名なし)';
      $body = $input['body'] ?? '';
      $htmlBody = (isset($input['bodyHtml']) && $input['bodyHtml'] !== '') ? $input['bodyHtml'] : null;
      $fromAddress = $input['fromAddress'] ?? $username;

      if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        respondError("宛先メールアドレスの形式が正しくありません。");
      }

      $attachmentsIn = is_array($input['attachments'] ?? null) ? $input['attachments'] : [];
      $attachments = [];
      $totalBytes = 0;
      foreach ($attachmentsIn as $att) {
        if (!is_array($att)) continue;
        $filename = (string) ($att['filename'] ?? 'attachment');
        $mimeType = (string) ($att['mimeType'] ?? 'application/octet-stream');
        $contentBase64 = (string) ($att['contentBase64'] ?? '');

        $approxBytes = (int) (strlen($contentBase64) * 3 / 4);
        if ($approxBytes > PWM_MAX_ATTACHMENT_BYTES) {
          respondError("添付ファイルが大きすぎます: $filename");
        }
        $totalBytes += $approxBytes;
        if ($totalBytes > PWM_MAX_TOTAL_ATTACHMENT_BYTES) {
          respondError("添付ファイルの合計サイズが大きすぎます。");
        }

        $attachments[] = ["filename" => $filename, "mimeType" => $mimeType, "contentBase64" => $contentBase64];
      }

      $smtp = new SmtpClient();
      $smtp->connect($host, $port, $encryption);
      $smtp->authLogin($username, $password);
      $smtp->sendMailMime($fromAddress, $to, $subject, $body, $htmlBody, $attachments);
      $smtp->quit();

      echo json_encode(["ok" => true], JSON_UNESCAPED_UNICODE);
      break;
    }

    default:
      respondError("不明なアクションです。");
  }
} catch (ImapException $e) {
  respondError($e->getMessage(), 502);
} catch (SmtpException $e) {
  respondError($e->getMessage(), 502);
} catch (Throwable $e) {
  respondError("予期しないエラーが発生しました: " . $e->getMessage(), 500);
}
