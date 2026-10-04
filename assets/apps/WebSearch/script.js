/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 1.0.0     |
  |  © 2026 By PusyuuWanko/       |
  |  License: MIT License         |
  |  PusyuuWebSearch              |
----------------------------------*
******************************************/

window.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const statusEl = document.getElementById("search-status");
  const resultsEl = document.getElementById("search-results");

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function renderResults(results) {
    resultsEl.innerHTML = "";
    results.forEach((item) => {
      const div = document.createElement("div");
      div.className = "result-item";
      div.innerHTML = `
        <a class="result-title" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
        <span class="result-url">${escapeHtml(item.url)}</span>
        <p class="result-snippet">${escapeHtml(item.snippet)}</p>
      `;
      resultsEl.appendChild(div);
    });
  }

  async function doSearch(query) {
    statusEl.textContent = "検索中...";
    resultsEl.innerHTML = "";

    try {
      const res = await fetch(`./search.php?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (data.error) {
        statusEl.textContent = data.error;
        return;
      }

      if (!data.results || data.results.length === 0) {
        statusEl.textContent = "検索結果が見つかりませんでした。";
        return;
      }

      const sourceLabel = data.source === "duckduckgo" ? "DuckDuckGo" : "Bing";
      statusEl.textContent = `${data.results.length}件の検索結果（${sourceLabel}）`;
      renderResults(data.results);
    } catch (error) {
      statusEl.textContent = "検索中にエラーが発生しました。エラー: " + error.message;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (query === "") {
      return;
    }
    doSearch(query);
  });
});
