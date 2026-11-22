import { Rarity } from './wakuwaku';

/** 公園で「やってみたいこと」（やったら doneDate が入る） */
export interface Wish {
  id: string;
  text: string;
  doneDate: string; // 空文字 = まだ
}

/** 季節の楽しみ（月ごとに自分で登録する） */
export interface SeasonNote {
  id: string;
  month: number; // 1〜12
  text: string;
}

/** 公園（Firestore: users/{uid}/parks） */
export interface Park {
  id: string;
  name: string;
  memo: string;
  wishes: Wish[];
  seasons: SeasonNote[];
  createdAt: number;
}

/** 来園の記録（Firestore: users/{uid}/visits） */
export interface Visit {
  id: string;
  parkId: string;
  date: string; // YYYY-MM-DD
  withWho: string; // WITH_OPTIONS の key（空文字 = 未選択）
  weather: string; // WEATHER_OPTIONS の key（空文字 = 未選択）
  heal: number; // 癒され度 1〜5（0 = まだ記録していない）
  note: string;
  createdAt: number;
}

/** 見つけたもの（Firestore: users/{uid}/finds） */
export interface Find {
  id: string;
  parkId: string;
  date: string;
  kind: string; // FIND_KINDS の key
  name: string;
  note: string;
  photo: string; // JPEG の data URL（なしは空文字）
  createdAt: number;
}

/** その日のおさんぽお題（Firestore: users/{uid}/days/{YYYY-MM-DD}） */
export interface DayDraw {
  date: string;
  odaiId: string;
  rarity: Rarity;
  done: boolean;
}
