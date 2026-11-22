import { RankDef, Rarity } from './wakuwaku';

export interface Option {
  key: string;
  label: string;
}

export const WITH_OPTIONS: Option[] = [
  { key: 'solo', label: 'ひとり' },
  { key: 'family', label: '家族' },
  { key: 'kids', label: 'こどもと' },
  { key: 'partner', label: 'パートナー' },
  { key: 'friends', label: '友だち' },
  { key: 'dog', label: 'いぬと' },
];

export const WEATHER_OPTIONS: Option[] = [
  { key: 'sunny', label: 'はれ' },
  { key: 'cloudy', label: 'くもり' },
  { key: 'rainy', label: 'あめ' },
  { key: 'snowy', label: 'ゆき' },
];

/** 癒され度（1〜5）。0 は「まだ記録していない」 */
export const HEAL_LEVELS = [
  { value: 1, label: 'あまり' },
  { value: 2, label: 'すこし' },
  { value: 3, label: 'まあまあ' },
  { value: 4, label: '癒された' },
  { value: 5, label: 'とても癒された' },
];

export const healLabel = (v: number): string => HEAL_LEVELS.find((h) => h.value === v)?.label ?? '';

/** ●●●○○ のような5段階の表示 */
export const healMeter = (v: number): string => '●'.repeat(Math.round(v)) + '○'.repeat(5 - Math.round(v));

export const FIND_KINDS: Option[] = [
  { key: 'flower', label: '花' },
  { key: 'tree', label: '木・葉っぱ' },
  { key: 'nut', label: '木の実' },
  { key: 'bird', label: '鳥' },
  { key: 'bug', label: '虫' },
  { key: 'animal', label: '生きもの' },
  { key: 'view', label: '景色' },
  { key: 'event', label: 'できごと' },
  { key: 'other', label: 'その他' },
];

export const PARK_EXAMPLES = ['砧公園', '馬事公苑', '駒沢オリンピック公園', '代々木公園', '昭和記念公園', '近所の公園'];

export const WISH_EXAMPLES = [
  'ピクニックをする', '芝生で昼寝', 'ベンチでコーヒー', '一周歩く', '朝いちばんに行く',
  'お弁当を食べる', 'バドミントン', 'スケッチする', '夕焼けを見る',
];

export const optionLabel = (list: Option[], key: string): string => list.find((o) => o.key === key)?.label ?? '';

// ============================================================
// 今日のおさんぽお題（id は保存に使うので変えないこと）
// ============================================================
export interface Odai {
  id: string;
  rarity: Rarity;
  title: string;
  text: string;
}

export const ODAI: Odai[] = [
  // コモン：気軽にできる
  { id: 'c01', rarity: 'common', title: 'いつもと逆回りで歩く', text: 'いつもの順路を反対から。見える景色が変わります。' },
  { id: 'c02', rarity: 'common', title: '空を3回見上げる', text: '雲の形や木のすき間の空を、ゆっくり眺めてみましょう。' },
  { id: 'c03', rarity: 'common', title: 'ベンチで5分ぼーっとする', text: 'スマホをしまって、ただ座ってみる5分間。' },
  { id: 'c04', rarity: 'common', title: '鳥の声を3種類聞き分ける', text: '高い声・低い声・くり返す声。姿が見えなくてもOK。' },
  { id: 'c05', rarity: 'common', title: '落ち葉や木の実をひとつ拾う', text: 'いちばん形のいいものを探してみましょう。' },
  { id: 'c06', rarity: 'common', title: 'いちばん大きな木を探す', text: '幹に手を当てて、大きさを感じてみましょう。' },
  { id: 'c07', rarity: 'common', title: '深呼吸を10回する', text: '木の多い場所で、ゆっくり吸ってゆっくり吐く。' },
  { id: 'c08', rarity: 'common', title: '入ったことのない小道を歩く', text: 'いつも素通りしていた道へ、一歩だけ。' },
  { id: 'c09', rarity: 'common', title: '今日の空を1枚撮る', text: '同じ公園でも、空は毎回ちがう顔をしています。' },
  { id: 'c10', rarity: 'common', title: '季節の花をひとつ見つける', text: '名前がわからなくても大丈夫。色と形を覚えておこう。' },
  { id: 'c11', rarity: 'common', title: '裸足になれる場所を探す', text: '芝生の感触を足の裏で。むずかしければ手のひらで。' },
  { id: 'c12', rarity: 'common', title: '1万歩をめざして歩く', text: '公園の外周を使って、いつもより少し長く。' },
  { id: 'c13', rarity: 'common', title: '水のある場所に行く', text: '池・噴水・小川。水の音をしばらく聞いてみましょう。' },
  { id: 'c14', rarity: 'common', title: '木陰で休む', text: '日なたと木陰の温度のちがいを感じてみる。' },
  { id: 'c15', rarity: 'common', title: 'ゆっくり歩きの日', text: 'いつもの半分の速さで。気づくものが増えます。' },
  { id: 'c16', rarity: 'common', title: '音を5つ数える', text: '目を閉じて、聞こえる音をひとつずつ数えてみましょう。' },
  { id: 'c17', rarity: 'common', title: '好きなベンチを決める', text: 'この公園での「自分の席」を見つけよう。' },
  { id: 'c18', rarity: 'common', title: '温かい飲み物を持っていく', text: '寒い日も暑い日も、外で飲む一杯は格別です。' },
  // レア：ちょっと特別
  { id: 'r01', rarity: 'rare', title: '朝いちばんの公園へ', text: '人の少ない朝の空気は、昼とはまるで別の場所。' },
  { id: 'r02', rarity: 'rare', title: '夕焼けの時間に行く', text: '日の入りの30分前に着くのがおすすめです。' },
  { id: 'r03', rarity: 'rare', title: 'ピクニックをする', text: 'レジャーシートとおにぎりだけでも立派なピクニック。' },
  { id: 'r04', rarity: 'rare', title: '公園の地図をよく見る', text: '案内板で、まだ行ったことのないエリアを見つけよう。' },
  { id: 'r05', rarity: 'rare', title: '木の葉っぱを3種類くらべる', text: '形・手ざわり・においのちがいを見てみましょう。' },
  { id: 'r06', rarity: 'rare', title: 'スケッチを1枚かく', text: '上手でなくてOK。見たものを線でなぞるだけ。' },
  { id: 'r07', rarity: 'rare', title: '本を1章読む', text: 'お気に入りのベンチで、外で読む読書を。' },
  { id: 'r08', rarity: 'rare', title: '虫や生きものを探す', text: '石の下、花のまわり、池のふち。そっと観察。' },
  { id: 'r09', rarity: 'rare', title: '公園のいちばん端まで行く', text: '敷地のはしっこには、意外な景色があるかも。' },
  { id: 'r10', rarity: 'rare', title: '誰かを誘って行く', text: '家族や友だちと。ひとりとは違う楽しみ方が見つかります。' },
  { id: 'r11', rarity: 'rare', title: 'いつもと違う入口から入る', text: '入口がちがうだけで、知らない公園みたいに。' },
  { id: 'r12', rarity: 'rare', title: '雨上がりの公園へ', text: '濡れた葉っぱと土のにおい。水たまりに空が映ります。' },
  // スーパーレア：記念になる
  { id: 's01', rarity: 'super', title: 'ひとつの木を定点観測する', text: '同じ場所から同じ木を撮っておこう。季節ごとに見比べられます。' },
  { id: 's02', rarity: 'super', title: '公園で朝ごはん', text: 'パンとコーヒーを持って、朝の公園でいただきます。' },
  { id: 's03', rarity: 'super', title: '公園を端から端まで一周', text: 'ぐるっと一周。かかった時間も記録しておこう。' },
  { id: 's04', rarity: 'super', title: '別の公園へ遠征する', text: 'いつもの公園とくらべると、それぞれの良さがわかります。' },
  { id: 's05', rarity: 'super', title: '星や月を見に行く', text: '開いている時間に、夜空を見上げてみましょう。' },
  { id: 's06', rarity: 'super', title: '公園のイベントに参加する', text: 'マルシェ・観察会・季節のお祭りなど、掲示板をチェック。' },
];

export const odaiById = (id: string): Odai | undefined => ODAI.find((o) => o.id === id);

// ============================================================
// 称号・ランク
// ============================================================
/** 公園ごとの称号（来園回数で上がる） */
export const PARK_TITLES: RankDef[] = [
  { name: 'まだ行ってない', min: 0 },
  { name: 'はじめまして', min: 1 },
  { name: '顔なじみ', min: 3 },
  { name: '常連さん', min: 10 },
  { name: '公園の主', min: 30 },
  { name: '公園の守り神', min: 100 },
];

/** 全体のランク（経験値：来園10・お題10・やってみたい10・見つけたもの5） */
export const RANKS: RankDef[] = [
  { name: '公園デビュー', min: 0 },
  { name: 'おさんぽ見習い', min: 50 },
  { name: '公園さんぽ人', min: 150 },
  { name: 'みどりの常連', min: 350 },
  { name: '公園マイスター', min: 700 },
  { name: 'みどりの達人', min: 1200 },
  { name: '公園の賢者', min: 2000 },
];

export const XP = { visit: 10, odai: 10, wish: 10, find: 5 };
