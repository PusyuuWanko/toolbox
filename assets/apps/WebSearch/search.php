<?php
/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 1.1.0     |
  |  © 2026 By PusyuuWanko/       |
  |  License: MIT License         |
  |  PusyuuWebSearch (scraping proxy)
----------------------------------*
  組み込み関数のみで動作させるため、php.iniの拡張追加が
  必要な検索APIクライアント等は使わず、curl（有効な場合）
  または file_get_contents によるスクレイピングで実現する。

  Bingは検索結果がJS側でしか描画されなくなっており、生HTMLに
  結果が含まれないケースが確認できたため、まずBingを試し、
  結果が0件だった場合はDuckDuckGo(html.duckduckgo.com)へ
  フォールバックする。両方とも非公式なスクレイピングのため、
  相手側の仕様変更やボット対策により結果が取得できなくなる
  可能性が常にある点に留意すること。
******************************************/

header("Content-Type: application/json; charset=utf-8");

$query = isset($_GET['q']) ? trim($_GET['q']) : '';

if ($query === '') {
  echo json_encode(["error" => "検索キーワードを入力してください。"], JSON_UNESCAPED_UNICODE);
  exit;
}

$userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function fetchUrl($url, $userAgent, $postFields = null) {
  // curlで取れたら、その本文をそのまま答えにします。curlが無い環境や失敗した場合だけ
  // file_get_contents で取り直します。$resultがまだnullかどうかが、そのまま
  // 「1つ目の手段で取れたか」の印になります。
  $result = null;

  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    $headers = [
      "User-Agent: " . $userAgent,
      "Accept-Language: ja,en-US;q=0.9,en;q=0.8"
    ];
    if ($postFields !== null) {
      curl_setopt($ch, CURLOPT_POST, true);
      curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
      $headers[] = "Content-Type: application/x-www-form-urlencoded";
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $body  = curl_exec($ch);
    $errno = curl_errno($ch);
    curl_close($ch);

    if ($errno === 0 && $body !== false) {
      $result = $body;
    } else {
      $result = null;
    }
  }

  if ($result !== null) {
    // curlで取れています。
  } else {
    // curlが無い、または失敗した場合は file_get_contents にフォールバック
    $header = "User-Agent: " . $userAgent . "\r\n" .
      "Accept-Language: ja,en-US;q=0.9,en;q=0.8\r\n";
    $options = [
      "method" => $postFields !== null ? "POST" : "GET",
      "header" => $header,
      "timeout" => 10
    ];
    if ($postFields !== null) {
      $options["header"] .= "Content-Type: application/x-www-form-urlencoded\r\n";
      $options["content"] = $postFields;
    }
    $context = stream_context_create(["http" => $options]);
    $body    = @file_get_contents($url, false, $context);
    $result  = ($body === false) ? null : $body;
  }

  return $result;
}

function loadDom($html) {
  libxml_use_internal_errors(true);
  $dom = new DOMDocument();
  if (function_exists('mb_convert_encoding')) {
    $html = mb_convert_encoding($html, 'HTML-ENTITIES', 'UTF-8');
  }
  $dom->loadHTML('<?xml encoding="utf-8">' . $html);
  libxml_clear_errors();
  return $dom;
}

// Bing: 生HTMLに結果が含まれている場合のみ拾える(現状は空のことが多い)
function fetchFromBing($query, $userAgent) {
  $url     = "https://www.bing.com/search?q=" . urlencode($query) . "&count=20&setmkt=ja-JP&mkt=ja-JP";
  $html    = fetchUrl($url, $userAgent);
  $results = [];

  if ($html === null) {
    // 取得できなかった。呼び出し元から見ると「0件」と同じ扱いになり、
    // 次の検索先(DuckDuckGo)へ進みます。
    $results = [];
  } else {
    $dom   = loadDom($html);
    $xpath = new DOMXPath($dom);
    $nodes = $xpath->query("//li[contains(concat(' ', normalize-space(@class), ' '), ' b_algo ')]");

    foreach ($nodes as $node) {
      $titleNode = $xpath->query(".//h2/a", $node)->item(0);
      if (!$titleNode) {
        continue;
      }
      $title = trim($titleNode->textContent);
      $url2  = $titleNode->getAttribute('href');

      $snippetNode = $xpath->query(".//div[contains(@class,'b_caption')]//p", $node)->item(0);
      if (!$snippetNode) {
        $snippetNode = $xpath->query(".//p", $node)->item(0);
      }
      $snippet = $snippetNode ? trim($snippetNode->textContent) : '';

      if ($title !== '' && $url2 !== '') {
        $results[] = ["title" => $title, "url" => $url2, "snippet" => $snippet];
      }
    }
  }

  return $results;
}

// DuckDuckGo(非JS版): ボット判定によりCAPTCHAページが返る場合がある
function fetchFromDuckDuckGo($query, $userAgent) {
  $url     = "https://html.duckduckgo.com/html/";
  $html    = fetchUrl($url, $userAgent, "q=" . urlencode($query));
  $blocked = ($html !== null)
    && (strpos($html, 'anomaly-modal') !== false || strpos($html, 'challenge-form') !== false);
  $result  = [];

  if ($html === null) {
    // 取得できなかった。「弾かれた」とは違うので blocked は false のままにします
    // (画面側は blocked=true のときだけ「しばらく待ってください」と出します)。
    $result = ["blocked" => false, "results" => []];
  } else if ($blocked) {
    $result = ["blocked" => true, "results" => []];
  } else {
    $dom   = loadDom($html);
    $xpath = new DOMXPath($dom);
    $nodes = $xpath->query("//div[contains(concat(' ', normalize-space(@class), ' '), ' result ') and contains(@class,'web-result')]");

    $results = [];
    foreach ($nodes as $node) {
      $titleNode = $xpath->query(".//a[contains(concat(' ', normalize-space(@class), ' '), ' result__a ')]", $node)->item(0);
      if (!$titleNode) {
        continue;
      }
      $title = trim($titleNode->textContent);
      $url2  = $titleNode->getAttribute('href');

      $snippetNode = $xpath->query(".//*[contains(concat(' ', normalize-space(@class), ' '), ' result__snippet ')]", $node)->item(0);
      $snippet     = $snippetNode ? trim($snippetNode->textContent) : '';

      if ($title !== '' && $url2 !== '') {
        $results[] = ["title" => $title, "url" => $url2, "snippet" => $snippet];
      }
    }

    $result = ["blocked" => false, "results" => $results];
  }

  return $result;
}

$bingResults = fetchFromBing($query, $userAgent);

if (!empty($bingResults)) {
  echo json_encode(["results" => $bingResults, "source" => "bing"], JSON_UNESCAPED_UNICODE);
  exit;
}

$ddg = fetchFromDuckDuckGo($query, $userAgent);

if ($ddg["blocked"]) {
  http_response_code(503);
  echo json_encode([
    "error" => "検索元サイトにボットアクセスとして拒否されました（画像認証が要求されています）。しばらく時間をおいてから再度お試しください。",
    "results" => []
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

if (!empty($ddg["results"])) {
  echo json_encode(["results" => $ddg["results"], "source" => "duckduckgo"], JSON_UNESCAPED_UNICODE);
  exit;
}

echo json_encode([
  "error" => "検索結果が見つかりませんでした。検索元サイトの構造が変わったか、一時的にアクセスが制限されている可能性があります。",
  "results" => []
], JSON_UNESCAPED_UNICODE);
