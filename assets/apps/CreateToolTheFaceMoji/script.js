/*****************************************
  *----------------------------------
  |  ThisJsVersion: 1.2.1         |
  |  © 2021-2024 By PusyuuWanko/  |
  |  LastUpdate: 2023-11-29       |
  |  License: MIT License         |
  |  (^U^)KaomjiJsDesu            |
----------------------------------*
******************************************/

// 入力フィールドのIDのリスト
const inputFieldIds = ["lefthand", "outline", "lefteyes", "nose", "righteyes", "righthand", "comment"];

// 入力フィールドの要素を格納するオブジェクト
const inputFields = {};

// 各入力フィールドの要素を取得し、イベントリスナーを設定
for (let i = 0; i < inputFieldIds.length; i++) {
  const inputFieldId = inputFieldIds[i];
  inputFields[inputFieldId] = document.getElementById(inputFieldId);
}

// スペースのチェックボックスを取得
const spaceCheckbox = document.getElementById("space");

const button = document.getElementById("createButton");

const faceFromated = document.getElementById("faceContainer");
faceFromated.readOnly = true;

// 顔を生成する関数
function createFace() {
  const lefthand = inputFields["lefthand"].value;
  const outline = inputFields["outline"].value;
  const lefteyes = inputFields["lefteyes"].value;
  const nose = inputFields["nose"].value;
  const righteyes = inputFields["righteyes"].value;
  const righthand = inputFields["righthand"].value;
  const space = spaceCheckbox.checked ? " " : "";
  const comment = inputFields["comment"].value;
  faceFromated.innerText = lefthand + outline.substring(0, 1) + lefteyes + nose + righteyes + outline.substring(1) + righthand + space + comment;
}

button.addEventListener('click', function() {
  location.hash = "mc";
  faceFromated.innerText = "";
  createFace();
});
