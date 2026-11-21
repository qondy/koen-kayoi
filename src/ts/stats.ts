import { DayDraw, Find, Park, Visit } from './types';
import { addDays, parseKey, todayKey, weekStart } from './dates';
import { ODAI, Odai, PARK_TITLES, RANKS, XP } from './data';
import { RankState, Rarity, rankOf, rollRarity, pickOne } from './wakuwaku';

export function daysBetween(from: string, to: string): number {
  return Math.round((parseKey(to).getTime() - parseKey(from).getTime()) / 86_400_000);
}

export function visitsOf(visits: Visit[], parkId: string): Visit[] {
  return visits.filter((v) => v.parkId === parkId);
}

export function countByPark(visits: Visit[]): Map<string, number> {
  const m = new Map<string, number>();
  visits.forEach((v) => m.set(v.parkId, (m.get(v.parkId) ?? 0) + 1));
  return m;
}

export function monthCount(visits: Visit[], ym: string): number {
  return visits.filter((v) => v.date.startsWith(ym)).length;
}

/** 1週間に1回以上行った週が、今週（または先週）から何週続いているか */
export function weekStreak(visits: Visit[]): number {
  const weeks = new Set(visits.map((v) => weekStart(v.date)));
  let w = weekStart(todayKey());
  if (!weeks.has(w)) w = addDays(w, -7); // 今週まだ行っていなくても、先週まで続いていれば数える
  let n = 0;
  while (weeks.has(w)) {
    n += 1;
    w = addDays(w, -7);
  }
  return n;
}

export function lastVisitLabel(visits: Visit[]): string {
  if (visits.length === 0) return 'まだ記録なし';
  const d = daysBetween(visits[0].date, todayKey());
  if (d <= 0) return '今日行った';
  if (d === 1) return 'きのう行った';
  return `${d}日ぶり`;
}

export function parkTitle(count: number): RankState {
  return rankOf(count, PARK_TITLES);
}

export function xpOf(parks: Park[], visits: Visit[], finds: Find[], days: DayDraw[]): number {
  const wishes = parks.reduce((n, p) => n + p.wishes.filter((w) => w.doneDate).length, 0);
  const odai = days.filter((d) => d.done).length;
  return visits.length * XP.visit + odai * XP.odai + wishes * XP.wish + finds.length * XP.find;
}

export function overallRank(parks: Park[], visits: Visit[], finds: Find[], days: DayDraw[]): RankState {
  return rankOf(xpOf(parks, visits, finds, days), RANKS);
}

/** やったことのあるお題ID */
export function doneOdaiIds(days: DayDraw[]): Set<string> {
  return new Set(days.filter((d) => d.done).map((d) => d.odaiId));
}

/** お題を引く：レア度を抽選し、その中でまだやっていないお題を優先する */
export function drawOdai(days: DayDraw[], rand: () => number = Math.random): { odai: Odai; rarity: Rarity } {
  const rarity = rollRarity(rand);
  const done = doneOdaiIds(days);
  const recent = new Set(days.slice(0, 7).map((d) => d.odaiId)); // 最近出たものは避ける
  const pool = ODAI.filter((o) => o.rarity === rarity);
  const fresh = pool.filter((o) => !done.has(o.id) && !recent.has(o.id));
  const notRecent = pool.filter((o) => !recent.has(o.id));
  const odai = pickOne(fresh.length ? fresh : notRecent.length ? notRecent : pool, rand) ?? ODAI[0];
  return { odai, rarity };
}

/** その月（または次の月）の季節の楽しみ */
export function seasonsFor(parks: Park[], month: number): { park: Park; text: string; id: string }[] {
  const out: { park: Park; text: string; id: string }[] = [];
  parks.forEach((p) => p.seasons.forEach((s) => {
    if (s.month === month) out.push({ park: p, text: s.text, id: s.id });
  }));
  return out;
}
