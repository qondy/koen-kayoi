import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { DayDraw, Find, Park, SeasonNote, Visit, Wish } from './types';
import { FIND_KINDS, WEATHER_OPTIONS, WITH_OPTIONS, odaiById } from './data';
import { Rarity } from './wakuwaku';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHOTO_PREFIX = 'data:image/jpeg;base64,';
const RARITIES: Rarity[] = ['common', 'rare', 'super'];

export const MAX_NAME = 30;
export const MAX_MEMO = 500;
export const MAX_ITEM = 40;
export const MAX_WISHES = 24;
export const MAX_SEASONS = 24;
export const MAX_FIND_NAME = 30;
export const MAX_NOTE = 500;
export const MAX_PHOTO = 700_000; // data URL の文字数上限（Firestore 1MB制限に余裕を残す）

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const dateStr = (v: unknown): string => (typeof v === 'string' && DATE_RE.test(v) ? v : '');
const millis = (v: unknown): number =>
  (v && typeof (v as { toMillis?: unknown }).toMillis === 'function'
    ? (v as { toMillis: () => number }).toMillis() : Date.now());
const clip = (s: string, max: number): string => s.trim().slice(0, max);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});
const oneOf = (v: unknown, keys: string[]): string => (typeof v === 'string' && keys.includes(v) ? v : '');

const WITH_KEYS = WITH_OPTIONS.map((o) => o.key);
const WEATHER_KEYS = WEATHER_OPTIONS.map((o) => o.key);
const KIND_KEYS = FIND_KINDS.map((o) => o.key);

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const col = (uid: string, name: string) => collection(db, 'users', uid, name);
const ref = (uid: string, name: string, id: string) => doc(db, 'users', uid, name, id);

type OnError = (err: Error) => void;

// ============================================================
// 正規化（読み込み時・保存時の両方で使う）
// ============================================================
function cleanWishes(v: unknown): Wish[] {
  return arr(v).map((w) => {
    const o = obj(w);
    return { id: str(o.id) || newId(), text: clip(str(o.text), MAX_ITEM), doneDate: dateStr(o.doneDate) };
  }).filter((w) => w.text).slice(0, MAX_WISHES);
}

function cleanSeasons(v: unknown): SeasonNote[] {
  return arr(v).map((s) => {
    const o = obj(s);
    const month = typeof o.month === 'number' && o.month >= 1 && o.month <= 12 ? Math.floor(o.month) : 0;
    return { id: str(o.id) || newId(), month, text: clip(str(o.text), MAX_ITEM) };
  }).filter((s) => s.text && s.month).slice(0, MAX_SEASONS);
}

function cleanPhoto(v: unknown): string {
  const s = str(v);
  return s.startsWith(PHOTO_PREFIX) && s.length <= MAX_PHOTO ? s : '';
}

// ============================================================
// 購読
// ============================================================
export function subscribeParks(uid: string, onData: (items: Park[]) => void, onError: OnError): () => void {
  return onSnapshot(col(uid, 'parks'), (snap) => {
    const list: Park[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const name = clip(str(data.name), MAX_NAME);
      if (!name) return;
      list.push({
        id: d.id,
        name,
        memo: str(data.memo).slice(0, MAX_MEMO),
        wishes: cleanWishes(data.wishes),
        seasons: cleanSeasons(data.seasons),
        createdAt: millis(data.createdAt),
      });
    });
    list.sort((a, b) => a.createdAt - b.createdAt);
    onData(list);
  }, onError);
}

export function subscribeVisits(uid: string, onData: (items: Visit[]) => void, onError: OnError): () => void {
  return onSnapshot(col(uid, 'visits'), (snap) => {
    const list: Visit[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const parkId = str(data.parkId);
      const date = dateStr(data.date);
      if (!parkId || !date) return;
      list.push({
        id: d.id,
        parkId,
        date,
        withWho: oneOf(data.withWho, WITH_KEYS),
        weather: oneOf(data.weather, WEATHER_KEYS),
        note: str(data.note).slice(0, MAX_NOTE),
        createdAt: millis(data.createdAt),
      });
    });
    list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    onData(list);
  }, onError);
}

export function subscribeFinds(uid: string, onData: (items: Find[]) => void, onError: OnError): () => void {
  return onSnapshot(col(uid, 'finds'), (snap) => {
    const list: Find[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const name = clip(str(data.name), MAX_FIND_NAME);
      const date = dateStr(data.date);
      if (!name || !date) return;
      list.push({
        id: d.id,
        parkId: str(data.parkId),
        date,
        kind: oneOf(data.kind, KIND_KEYS) || 'other',
        name,
        note: str(data.note).slice(0, MAX_NOTE),
        photo: cleanPhoto(data.photo),
        createdAt: millis(data.createdAt),
      });
    });
    list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    onData(list);
  }, onError);
}

export function subscribeDays(uid: string, onData: (items: DayDraw[]) => void, onError: OnError): () => void {
  return onSnapshot(col(uid, 'days'), (snap) => {
    const list: DayDraw[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const date = dateStr(d.id);
      const odaiId = str(data.odaiId);
      if (!date || !odaiById(odaiId)) return;
      const rarity = RARITIES.includes(data.rarity as Rarity) ? data.rarity as Rarity : 'common';
      list.push({ date, odaiId, rarity, done: data.done === true });
    });
    list.sort((a, b) => b.date.localeCompare(a.date));
    onData(list);
  }, onError);
}

// ============================================================
// 公園
// ============================================================
export interface ParkInput {
  name: string;
  memo: string;
}

export async function createPark(uid: string, input: ParkInput): Promise<string> {
  const r = await addDoc(col(uid, 'parks'), {
    name: clip(input.name, MAX_NAME),
    memo: clip(input.memo, MAX_MEMO),
    wishes: [],
    seasons: [],
    createdAt: serverTimestamp(),
  });
  return r.id;
}

export function updatePark(uid: string, id: string, input: ParkInput): Promise<void> {
  return updateDoc(ref(uid, 'parks', id), { name: clip(input.name, MAX_NAME), memo: clip(input.memo, MAX_MEMO) });
}

export function saveWishes(uid: string, id: string, wishes: Wish[]): Promise<void> {
  return updateDoc(ref(uid, 'parks', id), { wishes: cleanWishes(wishes) });
}

export function saveSeasons(uid: string, id: string, seasons: SeasonNote[]): Promise<void> {
  return updateDoc(ref(uid, 'parks', id), { seasons: cleanSeasons(seasons) });
}

/** 公園とその来園記録・見つけたものをまとめて削除する（バッチは500件までなので分割） */
export async function deletePark(uid: string, id: string, visitIds: string[], findIds: string[]): Promise<void> {
  const refs = [
    ...visitIds.map((v) => ref(uid, 'visits', v)),
    ...findIds.map((f) => ref(uid, 'finds', f)),
    ref(uid, 'parks', id),
  ];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

// ============================================================
// 来園
// ============================================================
export interface VisitInput {
  parkId: string;
  date: string;
  withWho: string;
  weather: string;
  note: string;
}

function visitPayload(input: VisitInput) {
  return {
    parkId: input.parkId,
    date: dateStr(input.date),
    withWho: oneOf(input.withWho, WITH_KEYS),
    weather: oneOf(input.weather, WEATHER_KEYS),
    note: clip(input.note, MAX_NOTE),
  };
}

export async function createVisit(uid: string, input: VisitInput): Promise<void> {
  await addDoc(col(uid, 'visits'), { ...visitPayload(input), createdAt: serverTimestamp() });
}

export function updateVisit(uid: string, id: string, input: VisitInput): Promise<void> {
  return updateDoc(ref(uid, 'visits', id), visitPayload(input));
}

export function deleteVisit(uid: string, id: string): Promise<void> {
  return deleteDoc(ref(uid, 'visits', id));
}

// ============================================================
// 見つけたもの
// ============================================================
export interface FindInput {
  parkId: string;
  date: string;
  kind: string;
  name: string;
  note: string;
  photo: string;
}

function findPayload(input: FindInput) {
  return {
    parkId: input.parkId,
    date: dateStr(input.date),
    kind: oneOf(input.kind, KIND_KEYS) || 'other',
    name: clip(input.name, MAX_FIND_NAME),
    note: clip(input.note, MAX_NOTE),
    photo: cleanPhoto(input.photo),
  };
}

export async function createFind(uid: string, input: FindInput): Promise<void> {
  await addDoc(col(uid, 'finds'), { ...findPayload(input), createdAt: serverTimestamp() });
}

export function updateFind(uid: string, id: string, input: FindInput): Promise<void> {
  return updateDoc(ref(uid, 'finds', id), findPayload(input));
}

export function deleteFind(uid: string, id: string): Promise<void> {
  return deleteDoc(ref(uid, 'finds', id));
}

// ============================================================
// 今日のお題
// ============================================================
export function saveDraw(uid: string, draw: DayDraw): Promise<void> {
  return setDoc(ref(uid, 'days', draw.date), {
    odaiId: draw.odaiId, rarity: draw.rarity, done: draw.done, updatedAt: serverTimestamp(),
  });
}

export function setDrawDone(uid: string, date: string, done: boolean): Promise<void> {
  return updateDoc(ref(uid, 'days', date), { done, updatedAt: serverTimestamp() });
}
