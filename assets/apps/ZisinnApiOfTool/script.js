/*****************************************
  *----------------------------------
  |  ThisJsVersion: 2.0.5         |
  |  © 2021-2024 By PusyuuWanko/  |
  |  LastUpdate: 2024-02-16       |
  |  License: MIT License         |
  |  PusyuuZisin                  |
----------------------------------*
******************************************/

document.addEventListener("DOMContentLoaded", function() {
  let reloadButton = document.getElementById("reload");
  if (reloadButton) {
    reloadButton.addEventListener("click", function() {
      // リロードボタンがクリックされたときにJSONデータを再取得して表示
      fetchDataAndUpdate();
    });
  }

  function fetchDataAndUpdate() {
    fetch('https://dev.narikakun.net/webapi/earthquake/post_data.json')
      .then(response => response.json())
      .then(data => {
        // 地域ごとの震度情報を取得
        let prefList = document.getElementById('prefList');
        prefList.innerHTML = '';
        data.Body.Intensity.Observation.Pref.forEach(pref => {
          let prefItem = document.createElement('li');
          prefItem.textContent = `${pref.Name}: Max Intensity ${pref.MaxInt}`;
          prefList.appendChild(prefItem);
        });
        // 必要な情報を取得してHTMLに表示;
        document.getElementById('dateTime').textContent = 'Delivery time: ' + data.Control.DateTime;
        document.getElementById('title').textContent = data.Control.Title;
        document.getElementById('status').textContent = 'Status: ' + data.Control.Status;
        document.getElementById('editorialOffice').textContent = 'Editorial Office: ' + data.Control.EditorialOffice;
        document.getElementById('publishingOffice').textContent = 'Publishing Office: ' + data.Control.PublishingOffice;
        document.getElementById('headline').textContent = data.Head.Headline;
        document.getElementById('observation').textContent = 'Observation: Max Intensity ' + data.Body.Intensity.Observation.MaxInt;
        document.getElementById('comments').textContent = data.Body.Comments.Observation;
      })
      .catch(error => {
        alert("地震APIの読み込みにエラーが発生しました。", error);
      });
    // JSONデータのURL
    const jsonUrl = "https://dog.ceo/api/breeds/image/random";
    // 画像要素の取得
    const dogImage = document.getElementById("dogImage");
    // JSONデータを取得し、画像要素のsrcに設定する
    fetch(jsonUrl)
      .then(response => response.json())
      .then(data => {
        if (data.status === "success") {
          dogImage.src = data.message;
        } else {
          alert("画像の取得に失敗しました。");
        }
      })
      .catch(error => {
        alert("犬APIの読み込みにエラーが発生しました。", error);
      });
  }
  fetchDataAndUpdate();
});