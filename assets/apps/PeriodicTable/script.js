/*****************************************
  *----------------------------------
  |  ThisScriptVersion: 1.4.1     |
  |  © 2021-2024 By PusyuuWanko/  |
  |  LastUpdate: 2024-02-18       |
  |  License: MIT License         |
  |  PeriodicTable                |
----------------------------------*
******************************************/

const periodicTableData = [
  ["1 H", ...Array(16).fill(""), "2 He"],
  ["3 Li", "4 Be", ...Array(10).fill(""), "5 B", "6 C", "7 N", "8 O", "9 F", "10 Ne"],
  ["11 Na", "12 Mg", ...Array(10).fill(""), "13 Al", "14 Si", "15 P", "16 S", "17 Cl", "18 Ar"],
  ["19 K", "20 Ca", "21 Sc", "22 Ti", "23 V", "24 Cr", "25 Mn", "26 Fe", "27 Co", "28 Ni", "29 Cu", "30 Zn", "31 Ga", "32 Ge", "33 As", "34 Se", "35 Br", "36 Kr"],
  ["37 Rb", "38 Sr", "39 Y", "40 Zr", "41 Nb", "42 Mo", "43 Tc", "44 Ru", "45 Rh", "46 Pd", "47 Ag", "48 Cd", "49 In", "50 Sn", "51 Sb", "52 Te", "53 I", "54 Xe"],
  ["55 Cs", "56 Ba", "La", "72 Hf", "73 Ta", "74 W", "75 Re", "76 Os", "77 Ir", "78 Pt", "79 Au", "80 Hg", "81 Tl", "82 Pb", "83 Bi", "84 Po", "85 At", "86 Rn"],
  ["87 Fr", "88 Ra", "Ac", "104 Rf", "105 Db", "106 Sg", "107 Bh", "108 Hs", "109 Mt", "110 Ds", "111 Rg", "112 Cn", "113 Nh", "114 Fl", "115 Mc", "116 Lv", "117 Ts", "118 Og"],
  [...Array(3).fill(""),"57 La", "58 Ce", "59 Pr", "60 Nd", "61 Pm", "62 Sm", "63 Eu", "64 Gd", "65 Tb", "66 Dy", "67 Ho", "68 Er", "69 Tm", "70 Yb", "71 Lu"],
  [...Array(3).fill(""),"89 Ac", "90 Th", "91 Pa", "92 U", "93 Np", "94 Pu", "95 Am", "96 Cm", "97 Bk", "98 Cf", "99 Es", "100 Fm", "101 Md", "102 No", "103 Lr"]
];
function generatePeriodicTable(data) {
  const divwrap = document.createElement("div");
  divwrap.classList.add("wrapper");
  const table = document.createElement("table");
  const headerRow = document.createElement("tr");
  headerRow.innerHTML = "<th>族＼周</th>" + Array(18).fill("").map((_, i) => `<th>${i + 1}</th>`).join("");
  table.appendChild(headerRow);
  for (let row = 0; row < data.length; row++) {
    const tr = document.createElement("tr");
    const familyCell = document.createElement("td");
    familyCell.textContent = `${row + 1}`;
    tr.appendChild(familyCell);

    for (let col = 0; col < data[row].length; col++) {
      const td = document.createElement("td");
      td.textContent = data[row][col];
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  divwrap.appendChild(table);
  document.body.appendChild(divwrap);
}
generatePeriodicTable(periodicTableData);

function load() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'text/plain';
  fileInput.addEventListener('change', loadFile);
  fileInput.click();
}

// ---------------------------------------------------------------------
// 保存係
//
// ツールボックスの中で使うときは、ツールボックスの保存の窓口(storage-hub.js)に預けます。
// 窓口が無い場所では、今までどおり localStorage に直接保存します。
// 【このアプリの中で localStorage を直接触らないこと】窓口を通らない保存は、設定アプリの
// 一覧にも書き出しにも出ず、保存先を「メモリ上だけ」にしても localStorage に残り続けます。
// ---------------------------------------------------------------------
const periodicStorage = (() => {
  const store = (typeof PusyuuToolboxStorage !== 'undefined')
    ? PusyuuToolboxStorage.app('PeriodicTable', '周期表')
    : null;

  // 設定アプリの削除一覧に出す名札。
  const labelFor = (key) => {
    let label = key;
    if (key === 'SyuukiHyou_selectedImage') {
      label = '選んでいる壁紙';
    } else if (key.startsWith('Your wallpaper')) {
      label = '追加した壁紙: ' + key;
    }
    return label;
  };

  let result = null;
  if (store) {
    result = {
      getItem: store.get,
      setItem: (key, value) => store.set(key, value, labelFor(key)),
      removeItem: store.remove,
      keys: store.keys
    };
    // 設定アプリで削除された・ファイルから読み込まれたときは、画面を読み直します。
    store.onChange(() => window.location.reload(), window);
  } else {
    result = {
      getItem: (key) => {
        try {
          return localStorage.getItem(key);
        } catch (e) {
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          localStorage.setItem(key, value);
          return true;
        } catch (e) {
          return false;
        }
      },
      removeItem: (key) => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          // 使えない環境では消すものもありません。
        }
      },
      keys: () => {
        const list = [];
        try {
          for (let i = 0; i < localStorage.length; i++) {
            list.push(localStorage.key(i));
          }
        } catch (e) {
          // 使えない環境では何もありません。
        }
        return list;
      }
    };
  }
  return result;
})();

document.addEventListener('DOMContentLoaded', function() {
  const select = document.getElementById('background-select');
  const body = document.body;
  const uploadInput = document.getElementById('upload-input');
  const maxFileSize = 1 * 1024 * 1024; // 1MB in bytes

  const selectedImage = periodicStorage.getItem('SyuukiHyou_selectedImage');
  if (selectedImage) {
    body.style.backgroundImage = `url(${selectedImage})`;
    select.value = selectedImage;
  }

  select.addEventListener('change', function() {
    const selectedImage = select.value;
    body.style.backgroundImage = `url(${selectedImage})`;
    periodicStorage.setItem('SyuukiHyou_selectedImage', selectedImage);
  });

  uploadInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    const reader = new FileReader();

    if (file.size > maxFileSize) {
      alert('The file size exceeds the maximum limit of 1MB.');
      return;
    }

    reader.onload = function() {
      const uploadedImage = reader.result;
      const randomThreeDigitNumber = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const imageName = 'Your wallpaper' + randomThreeDigitNumber;
      periodicStorage.setItem(imageName, uploadedImage);
      addImageOption(imageName, uploadedImage);
    };
    reader.readAsDataURL(file);
  });

  // 追加した壁紙は、このアプリの保存の中から拾います(以前は localStorage 全体から拾って
  // いたため、同じ名前の付け方をしていた時計の壁紙まで混ざって出ていました)。
  periodicStorage.keys().forEach((key) => {
    if (key !== null && key.startsWith('Your wallpaper')) {
      addImageOption(key, periodicStorage.getItem(key));
    }
  });

  function addImageOption(imageName, uploadedImage) {
    const option = document.createElement('option');
    option.value = uploadedImage;
    option.text = imageName;
    select.add(option);

    if (uploadedImage === selectedImage) {
      option.selected = true;
    }
  }

  function applyBackgroundStyles() {
    body.style.backgroundSize = 'cover';
    body.style.backgroundRepeat = 'no-repeat';
    body.style.backgroundPosition = 'center';
    body.style.backgroundAttachment = 'fixed';
  }

  applyBackgroundStyles();

  function addPreloadedImages() {
    const preloadedImages = [
      './sys_wallpaper/1.png',
      './sys_wallpaper/2.jpg',
      './sys_wallpaper/3.JPG'
    ];

    preloadedImages.forEach(function(image, index) {
      const wallpaperNumber = (index + 1).toString();
      const imageName = 'wallpaper ' + wallpaperNumber;
      addImageOption(imageName, image);
    });
  }

  addPreloadedImages();
});