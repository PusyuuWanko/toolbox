const VueAPlayer = window['VueAPlayer'];
Vue.component('aplayer', VueAPlayer);

// 最初から入っているラジオ局。保存はせず、毎回ここから並べます(利用者が追加した曲は
// この後ろに続きます)。
const DEFAULT_LIST = [
  {
    title: "ON Popラジオ",
    artist: "不明",
    src: "https://0n-pop.radionetz.de/0n-pop.mp3",
    pic: "",
    lrc: ""
  },
  {
    title: "Metal Rock Radio",
    artist: "不明",
    src: "https://kathy.torontocast.com:2800/;",
    pic: "",
    lrc: ""
  },
  {
    title: "90s90s BEATラジオ",
    artist: "不明",
    src: "https://regiocast.streamabc.net/regc-90s90smain4920117-mp3-192-6232809",
    pic: "",
    lrc: ""
  },
  {
    title: "Wave Anime Radioラジオ",
    artist: "不明",
    src: "https://channel_1.waveani.fun/stream",
    pic: "",
    lrc: ""
  },
  {
    title: "J-Pop Powerplayラジオ",
    artist: "不明",
    src: "https://kathy.torontocast.com:3560/;",
    pic: "",
    lrc: ""
  },
  {
    title: "J-Pop Sakura Natuskasiiラジオ",
    artist: "不明",
    src: "https://quincy.torontocast.com:2070/;",
    pic: "",
    lrc: ""
  },
  {
    title: "J-Rock Powerplayラジオ",
    artist: "不明",
    src: "https://kathy.torontocast.com:3340/;",
    pic: "",
    lrc: ""
  },
  {
    title: "Japan Hitsラジオ",
    artist: "不明",
    src: "https://quincy.torontocast.com:2020/;",
    pic: "",
    lrc: ""
  }
];

// ---------------------------------------------------------------------
// 保存(ツールボックスの保存の窓口 storage-hub.js を通します)
//
// 保存するのは次の2種類です。
//   "songs"          … 追加した曲の一覧(JSON)。[{ id, type: "url"|"file", title, artist, url }]
//   "file:<曲のid>"  … 端末内のファイルから追加した曲の中身(データURLの文字列)
// 【一覧と中身を分けている理由】曲の中身は大きく、ローカルストレージに入りきらないことが
// よくあります。1つにまとめると、1曲溢れただけで一覧ごと保存できなくなります。
// 中身が保存できなかった曲は一覧にも載せません(次に開いたとき、中身の無い曲が並ぶため)。
// 設定アプリで中身だけ消された曲も、読み込み時に一覧から外して表示します。
// 窓口が無い(このファイルだけを別の場所で開いた)場合は、今までどおり保存しません。
// ---------------------------------------------------------------------
const musicStore = (typeof PusyuuToolboxStorage !== 'undefined')
  ? PusyuuToolboxStorage.app('VueMusicPlayer', 'ミュージックステーション')
  : null;
const SONGS_KEY = 'songs';
const FILE_KEY_PREFIX = 'file:';

function readSavedSongs() {
  let songs = [];
  if (musicStore) {
    try {
      const parsed = JSON.parse(musicStore.get(SONGS_KEY) || '[]');
      songs = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      songs = [];
    }
  }
  return songs;
}

// データURLを、再生用のblob URLに変えます。長い曲のデータURLをそのまま src に渡すより、
// ブラウザが扱いやすいためです(作ったURLは読み直しのたびに捨てます)。
function dataUrlToObjectUrl(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.substring(0, comma);
  const mimeMatch = header.match(/^data:([^;]*)/);
  const binary = atob(dataUrl.substring(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeMatch ? mimeMatch[1] : 'audio/mpeg' }));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function createSongId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

new Vue({
  el: '#app',
  data: {
    music: DEFAULT_LIST[0],
    list: DEFAULT_LIST.slice(),
    // 保存から作った再生用のblob URL。読み直す前に捨てます。
    savedObjectUrls: [],
    showAddModal: false,
    newSongType: 'url',
    newSongUrl: '',
    newSongFile: null,
    newSongTitle: '',
    newSongArtist: '',
    addError: '',
    adding: false
  },
  created() {
    this.loadSavedSongs();
    if (musicStore) {
      // 設定アプリで削除された・ファイルから読み込まれたときに並べ直します。
      musicStore.onChange(() => this.loadSavedSongs(), window);
    }
  },
  methods: {
    loadSavedSongs() {
      this.savedObjectUrls.forEach((url) => URL.revokeObjectURL(url));
      this.savedObjectUrls = [];

      const restored = [];
      readSavedSongs().forEach((saved) => {
        let src = null;
        if (saved.type === 'url' && typeof saved.url === 'string') {
          src = saved.url;
        } else if (saved.type === 'file') {
          const dataUrl = musicStore.get(FILE_KEY_PREFIX + saved.id);
          if (dataUrl) {
            src = dataUrlToObjectUrl(dataUrl);
            this.savedObjectUrls.push(src);
          }
        }
        if (src !== null) {
          restored.push({ title: saved.title, artist: saved.artist, src: src, pic: '', lrc: '' });
        }
      });

      const nextList = DEFAULT_LIST.concat(restored);
      // 選んでいた曲が消えた場合は先頭に戻します(消えた曲を指したままだと再生できません)。
      if (!nextList.some((song) => song.src === this.music.src)) {
        this.music = nextList[0];
      }
      this.list = nextList;
    },
    saveSongList(songs) {
      musicStore.set(SONGS_KEY, JSON.stringify(songs), '追加した曲の一覧');
    },
    openAddModal() {
      this.newSongType = 'url';
      this.newSongUrl = '';
      this.newSongFile = null;
      this.newSongTitle = '';
      this.newSongArtist = '';
      this.addError = '';
      this.showAddModal = true;
    },
    closeAddModal() {
      this.showAddModal = false;
    },
    onFileSelected(event) {
      this.newSongFile = event.target.files[0] || null;
    },
    async addSong() {
      if (this.adding) {
        return;
      }
      const id = createSongId();
      let src = '';
      let defaultTitle = '';

      if (this.newSongType === 'url') {
        src = this.newSongUrl.trim();
        if (src === '') {
          this.addError = 'ストリーミングURLを入力してください。';
          return;
        }
        defaultTitle = src;
      } else {
        if (!this.newSongFile) {
          this.addError = '端末内のファイルを選択してください。';
          return;
        }
        // 端末内ファイルはアップロードせず、ブラウザ内だけで再生できるblob URLに変換します。
        src = URL.createObjectURL(this.newSongFile);
        defaultTitle = this.newSongFile.name.replace(/\.[^/.]+$/, '');
      }

      const song = {
        title: this.newSongTitle.trim() || defaultTitle,
        artist: this.newSongArtist.trim() || '不明',
        src: src,
        pic: '',
        lrc: ''
      };

      if (musicStore) {
        const saved = { id: id, type: this.newSongType, title: song.title, artist: song.artist, url: this.newSongType === 'url' ? src : '' };
        let contentSaved = true;

        if (this.newSongType === 'file') {
          this.adding = true;
          this.addError = '曲を読み込んでいます...';
          try {
            const dataUrl = await readFileAsDataUrl(this.newSongFile);
            // 溢れた場合は窓口が案内を出し、false が返ります。その曲はこの場限りで再生できます。
            contentSaved = musicStore.set(FILE_KEY_PREFIX + id, dataUrl, '曲ファイル: ' + song.title);
          } catch (e) {
            contentSaved = false;
          }
          this.adding = false;
          this.addError = '';
        }

        if (contentSaved) {
          this.saveSongList(readSavedSongs().concat([saved]));
        }
      }

      this.list.push(song);
      // 追加した曲をそのまま選択状態にします（再生はプレイヤー側の再生ボタンから行います）。
      this.music = song;
      this.closeAddModal();
    }
  },
  components: {
    'nested-component': {
      template: `
        <div>
          <h2>Nested Component</h2>
          <aplayer :music="music" :list="list"></aplayer>
        </div>
      `,
      data() {
        return {
          music: this.$parent.music,
          list: this.$parent.list
        };
      }
    }
  }
});
