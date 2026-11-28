import { daysAgoOf, olderThan, renderSouieba, resetSouieba } from './souieba';
import { User } from 'firebase/auth';
import { onAuthChange, loginWithGoogle, logout } from './auth';
import { showToast, openOverlay, closeOverlay, textEl, button } from './ui';
import { submitFeedback } from './feedback';
import { todayKey, labelOf, monthKey, daysInMonth } from './dates';
import {
  subscribeParks, subscribeVisits, subscribeFinds, subscribeDays,
  createPark, updatePark, deletePark, saveWishes, saveSeasons,
  createVisit, updateVisit, deleteVisit, setVisitHeal, createFind, updateFind, deleteFind,
  saveDraw, setDrawDone, newId, MAX_WISHES, MAX_SEASONS, MAX_ITEM, VisitInput, FindInput,
} from './store';
import {
  daysBetween, visitsOf, countByPark, monthCount, weekStreak, lastVisitLabel, parkTitle, overallRank,
  doneOdaiIds, drawOdai, seasonsFor, healSummary, healRanking, formatAvg, unratedRecent,
} from './stats';
import {
  WITH_OPTIONS, WEATHER_OPTIONS, FIND_KINDS, PARK_EXAMPLES, WISH_EXAMPLES, ODAI, XP,
  optionLabel, odaiById, Option, HEAL_LEVELS, healLabel, healMeter,
} from './data';
import { compressPhoto } from './photo';
import { DayDraw, Find, Park, Visit } from './types';
import { initClickTracking, track } from './analytics';
import { initTextareas, autoGrow, renderMemoView } from './memo-ui';
import { RARITY, rarityLabelText, rarityOddsText, renderRankCard, announceRankUp, celebrate, showPopup } from './wakuwaku';

initClickTracking();

// ============================================================
// DOM
// ============================================================
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const loginScreen = $('login-screen');
const appEl = $('app');
const userInfo = $('user-info');
const userAvatar = $<HTMLImageElement>('user-avatar');
const userName = $('user-name');
const btnGoogleLogin = $<HTMLButtonElement>('btn-google-login');
const btnLogout = $<HTMLButtonElement>('btn-logout');

const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs__btn'));
const panels = Array.from(document.querySelectorAll<HTMLElement>('.panel'));
const btnFab = $<HTMLButtonElement>('btn-fab');

const parkOverlay = $('park-modal-overlay');
const parkForm = $<HTMLFormElement>('park-form');
const inputParkName = $<HTMLInputElement>('input-park-name');
const inputParkMemo = $<HTMLTextAreaElement>('input-park-memo');
const btnParkDelete = $<HTMLButtonElement>('btn-park-delete');
const btnParkSubmit = $<HTMLButtonElement>('btn-park-submit');

const visitOverlay = $('visit-modal-overlay');
const visitForm = $<HTMLFormElement>('visit-form');
const inputVisitPark = $<HTMLSelectElement>('input-visit-park');
const inputVisitDate = $<HTMLInputElement>('input-visit-date');
const inputVisitNote = $<HTMLTextAreaElement>('input-visit-note');
const btnVisitDelete = $<HTMLButtonElement>('btn-visit-delete');
const btnVisitSubmit = $<HTMLButtonElement>('btn-visit-submit');

const findOverlay = $('find-modal-overlay');
const findForm = $<HTMLFormElement>('find-form');
const inputFindName = $<HTMLInputElement>('input-find-name');
const inputFindPark = $<HTMLSelectElement>('input-find-park');
const inputFindDate = $<HTMLInputElement>('input-find-date');
const inputFindNote = $<HTMLTextAreaElement>('input-find-note');
const inputFindPhoto = $<HTMLInputElement>('input-find-photo');
const photoPreview = $('photo-preview');
const photoPreviewImg = $<HTMLImageElement>('photo-preview-img');
const btnPhotoRemove = $<HTMLButtonElement>('btn-photo-remove');
const btnFindDelete = $<HTMLButtonElement>('btn-find-delete');
const btnFindSubmit = $<HTMLButtonElement>('btn-find-submit');

const confirmOverlay = $('confirm-dialog-overlay');
const btnConfirmOk = $<HTMLButtonElement>('btn-confirm-ok');

const feedbackOverlay = $('feedback-modal-overlay');
const inputFeedbackMessage = $<HTMLTextAreaElement>('input-feedback-message');
const btnFeedbackSend = $<HTMLButtonElement>('btn-feedback-send');

// ============================================================
// State
// ============================================================
type View = 'home' | 'parks' | 'detail' | 'zukan' | 'log';

const now = new Date();
const state = {
  uid: null as string | null,
  parks: [] as Park[],
  visits: [] as Visit[],
  finds: [] as Find[],
  days: [] as DayDraw[],
  loaded: false,
  view: 'home' as View,
  detailId: null as string | null,
  calYear: now.getFullYear(),
  calMonth0: now.getMonth(),
  calSelected: '' as string,
  findFilter: 'all',
  pending: new Set<string>(),
  confirmAction: null as null | (() => Promise<void>),
  unsubscribers: [] as (() => void)[],
  parkEditingId: null as string | null,
  visitEditingId: null as string | null,
  visitWith: '',
  visitWeather: '',
  visitHeal: 0,
  findEditingId: null as string | null,
  findKind: 'flower',
  findPhoto: '',
  photoBusy: false,
};

// ============================================================
// Helpers
// ============================================================
/** 二重送信を防ぎつつ、失敗時はトーストで知らせる */
async function run(key: string, task: () => Promise<void>, errorMessage: string): Promise<boolean> {
  if (state.pending.has(key)) return false;
  state.pending.add(key);
  renderAll();
  try {
    await task();
    return true;
  } catch (err) {
    console.error(err);
    showToast(errorMessage);
    return false;
  } finally {
    state.pending.delete(key);
    renderAll();
  }
}

function askConfirm(title: string, text: string, okLabel: string, action: () => Promise<void>): void {
  $('confirm-dialog-title').textContent = title;
  $('confirm-dialog-text').textContent = text;
  btnConfirmOk.textContent = okLabel;
  state.confirmAction = action;
  openOverlay(confirmOverlay);
}

function el(tag: string, className: string, children: (Node | null)[] = []): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  children.forEach((c) => { if (c) e.appendChild(c); });
  return e;
}

function emptyState(text: string, action?: HTMLElement): HTMLElement {
  const box = el('div', 'empty-state', [textEl('p', '', text)]);
  if (action) box.appendChild(action);
  return box;
}

function shortDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return y === new Date().getFullYear() ? `${m}/${d}` : `${y}/${m}/${d}`;
}

const parkById = (id: string | null): Park | null => state.parks.find((p) => p.id === id) ?? null;
const parkName = (id: string): string => parkById(id)?.name ?? '（削除した公園）';

function photoEl(src: string, alt: string): HTMLElement {
  const img = document.createElement('img');
  img.src = src; // cleanPhoto で data:image/jpeg のみに限定済み
  img.alt = alt;
  img.loading = 'lazy';
  return el('div', 'photo', [img]);
}

/** 単一選択のチップ（もう一度押すと解除できる） */
function renderChips(box: HTMLElement, options: Option[], selected: string, onPick: (key: string) => void, allowEmpty = true): void {
  box.replaceChildren(...options.map((o) => {
    const b = button(o.label, `chip${o.key === selected ? ' is-active' : ''}`, () => {
      onPick(allowEmpty && o.key === selected ? '' : o.key);
    });
    b.setAttribute('aria-pressed', String(o.key === selected));
    return b;
  }));
}

function fillParkSelect(select: HTMLSelectElement, selected: string): void {
  select.replaceChildren(...state.parks.map((p) => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    o.selected = p.id === selected;
    return o;
  }));
}

// ============================================================
// 画面切り替え
// ============================================================
function switchView(view: View): void {
  state.view = view;
  const tab = view === 'detail' ? 'parks' : view;
  tabButtons.forEach((b) => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', String(active));
  });
  panels.forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== view));
  renderAll();
  window.scrollTo({ top: 0 });
}

function openDetail(id: string): void {
  state.detailId = id;
  switchView('detail');
}

// ============================================================
// 来園（ワンタップ）
// ============================================================
async function checkIn(park: Park): Promise<void> {
  const uid = state.uid;
  if (!uid) return;
  const before = visitsOf(state.visits, park.id).length;
  const ok = await run(`checkin:${park.id}`, async () => {
    await createVisit(uid, { parkId: park.id, date: todayKey(), withWho: '', weather: '', heal: 0, note: '' });
    track('visit_checkin');
  }, '記録に失敗しました。もう一度お試しください');
  if (!ok) return;
  const after = before + 1;
  const prevTitle = parkTitle(before);
  const nextTitle = parkTitle(after);
  if (nextTitle.index > prevTitle.index) {
    celebrate();
    showPopup(`${park.name}の「${nextTitle.rank.name}」に！`, `${after}回目の来園です。これからも通って、次の称号を目指しましょう。`);
  } else {
    showToast(`${park.name}、${after}回目の来園を記録しました`);
  }
}

// ============================================================
// きょう
// ============================================================
// しばらく行っていない公園を、1日1件だけ思い出す
function renderRecall(): void {
  const box = document.getElementById('souieba-box');
  const uid = state.uid;
  if (!box || !uid || !state.loaded) return;
  const lastDate = (id: string): string =>
    visitsOf(state.visits, id).reduce((latest, v) => (v.date > latest ? v.date : latest), '');
  const sinceVisit = (id: string): number | null => {
    const d = lastDate(id);
    return d ? daysBetween(d, todayKey()) : null;
  };
  renderSouieba({
    box,
    storageKey: `koen-souieba:${uid}`,
    heading: 'そういえば、この公園、しばらく行っていません',
    items: state.parks.filter((p) => {
      const days = sinceVisit(p.id);
      return days === null ? olderThan(p.createdAt, 7) : days >= 30;
    }),
    idOf: (p) => p.id,
    view: (p) => {
      const days = sinceVisit(p.id);
      const wish = p.wishes.find((w) => !w.doneDate);
      return {
        title: p.name,
        meta: days === null ? `登録して${daysAgoOf(p.createdAt)}日・まだ記録がありません` : `最後に行ったのは${days}日前・これまで${visitsOf(state.visits, p.id).length}回`,
        note: wish ? `やってみたいこと：${wish.text}` : p.memo,
      };
    },
    actions: [{
      label: '公園のページを見る',
      track: 'souieba_park',
      primary: true,
      run: (p) => {
        window.setTimeout(() => openDetail(p.id), 0);
        return '次のおさんぽの候補にどうぞ。';
      },
    }],
  });
}

function renderHome(): void {
  renderRecall();
  const checkinList = $('checkin-list');
  const counts = countByPark(state.visits);
  const today = todayKey();
  if (!state.loaded) {
    checkinList.replaceChildren(textEl('p', 'loading', '読み込み中…'));
  } else if (state.parks.length === 0) {
    checkinList.replaceChildren(emptyState(
      'まずは通っている公園を登録しましょう。',
      button('公園を追加', 'btn btn--primary', () => openParkModal(null)),
    ));
  } else {
    checkinList.replaceChildren(...state.parks.map((p) => {
      const count = counts.get(p.id) ?? 0;
      const visitedToday = state.visits.some((v) => v.parkId === p.id && v.date === today);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `checkin${visitedToday ? ' is-today' : ''}`;
      b.disabled = state.pending.has(`checkin:${p.id}`);
      b.dataset.track = 'checkin';
      b.append(
        textEl('span', 'checkin__name', p.name),
        textEl('span', 'checkin__meta', `${count}回・${parkTitle(count).rank.name}${visitedToday ? '・今日来た' : ''}`),
        textEl('span', 'checkin__go', state.pending.has(`checkin:${p.id}`) ? '記録中…' : '来た！'),
      );
      b.addEventListener('click', () => { void checkIn(p); });
      return b;
    }));
  }

  renderHealAsk();

  const t = new Date();
  $('stat-total').textContent = String(state.visits.length);
  $('stat-month').textContent = String(monthCount(state.visits, monthKey(t.getFullYear(), t.getMonth())));
  $('stat-streak').textContent = String(weekStreak(state.visits));

  const rank = overallRank(state.parks, state.visits, state.finds, state.days);
  renderRankCard($('rank-card'), rank, `来園${XP.visit}・お題${XP.odai}・やってみたい${XP.wish}・見つけたもの${XP.find}`);
  if (state.uid) {
    announceRankUp(`koen-kayoi:rank:${state.uid}`, rank, state.loaded, '公園に通うほど、公園での楽しみが増えていきます。');
  }

  renderOdai();
  renderSeasons();

  const recent = state.visits.slice(0, 5);
  $('recent-list').replaceChildren(...(recent.length
    ? recent.map(visitCard)
    : [textEl('p', 'muted-text', 'まだ来園の記録はありません')]));
}

function renderOdai(): void {
  const box = $('odai-box');
  const today = todayKey();
  const draw = state.days.find((d) => d.date === today);
  box.replaceChildren();
  if (!draw) {
    box.append(
      textEl('p', 'waku-gacha__lead', '公園でやってみることを、1つ引いてみましょう'),
      (() => {
        const b = button(state.pending.has('draw') ? '引いています…' : 'お題を引く', 'waku-gacha__draw', () => { void doDraw(); });
        b.disabled = !state.loaded || state.pending.has('draw');
        return b;
      })(),
      textEl('p', 'waku-gacha__odds', rarityOddsText()),
    );
    return;
  }
  const odai = odaiById(draw.odaiId);
  if (!odai) return;
  const card = el('div', `waku-card waku-card--${draw.rarity}`, [
    textEl('span', 'waku-card__rarity', rarityLabelText(draw.rarity)),
    textEl('div', 'waku-card__title', odai.title),
    textEl('p', 'waku-card__text', odai.text),
  ]);
  const doneBtn = button(draw.done ? 'やった！（取り消す）' : 'やった！', `btn ${draw.done ? 'btn--ghost' : 'btn--primary'}`, () => { void toggleDrawDone(draw); });
  doneBtn.disabled = state.pending.has('draw-done');
  box.append(card, el('div', 'odai-actions', [doneBtn]));
  if (draw.done) box.append(textEl('p', 'waku-gacha__odds', 'おつかれさまでした。明日もまた引けます'));
}

async function doDraw(): Promise<void> {
  const uid = state.uid;
  if (!uid || state.days.some((d) => d.date === todayKey())) return;
  const { odai, rarity } = drawOdai(state.days);
  const ok = await run('draw', async () => {
    await saveDraw(uid, { date: todayKey(), odaiId: odai.id, rarity, done: false });
    track('odai_draw', { rarity });
  }, 'お題を引けませんでした。もう一度お試しください');
  if (ok && rarity === 'super') celebrate();
}

async function toggleDrawDone(draw: DayDraw): Promise<void> {
  const uid = state.uid;
  if (!uid) return;
  const ok = await run('draw-done', async () => {
    await setDrawDone(uid, draw.date, !draw.done);
    if (!draw.done) track('odai_done');
  }, '保存に失敗しました');
  if (ok && !draw.done) {
    celebrate(18);
    showToast(`お題クリア！ +${XP.odai} XP`);
  }
}

function renderSeasons(): void {
  const m = new Date().getMonth() + 1;
  const next = m === 12 ? 1 : m + 1;
  const thisMonth = seasonsFor(state.parks, m);
  const nextMonth = seasonsFor(state.parks, next);
  const list = $('season-list');
  $('season-title').textContent = `${m}月の楽しみ`;
  const items: HTMLElement[] = [
    ...thisMonth.map((s) => seasonItem(`${m}月`, s.text, s.park, 'いまが楽しみどき')),
    ...nextMonth.map((s) => seasonItem(`${next}月`, s.text, s.park, 'そろそろ')),
  ];
  if (items.length === 0) {
    list.replaceChildren(textEl('p', 'muted-text', state.parks.length
      ? '公園の詳細画面で「季節の楽しみ」を登録すると、ここに出てきます'
      : '公園を登録すると、季節の楽しみも登録できます'));
  } else {
    list.replaceChildren(...items);
  }
}

function seasonItem(monthLabel: string, text: string, park: Park, badge: string): HTMLElement {
  const item = el('button', 'season-item', [
    textEl('span', 'season-item__month', monthLabel),
    el('span', 'season-item__body', [
      textEl('span', 'season-item__text', text),
      textEl('span', 'season-item__park', park.name),
    ]),
    textEl('span', `season-item__badge${badge === 'そろそろ' ? ' is-soon' : ''}`, badge),
  ]);
  (item as HTMLButtonElement).type = 'button';
  item.addEventListener('click', () => openDetail(park.id));
  return item;
}

function visitCard(v: Visit): HTMLElement {
  const meta = [optionLabel(WITH_OPTIONS, v.withWho), optionLabel(WEATHER_OPTIONS, v.weather)].filter(Boolean).join('・');
  const card = el('button', 'visit-card', [
    el('span', 'visit-card__head', [
      textEl('span', 'visit-card__date', labelOf(v.date)),
      textEl('span', 'visit-card__park', parkName(v.parkId)),
    ]),
    v.heal ? healBadge(v.heal) : null,
    meta ? textEl('span', 'visit-card__meta', meta) : null,
    v.note ? textEl('span', 'visit-card__note', v.note) : textEl('span', 'visit-card__add', 'タップして、ひとことを残す'),
  ]);
  (card as HTMLButtonElement).type = 'button';
  card.addEventListener('click', () => openVisitModal(v, null));
  return card;
}

// ============================================================
// 癒され度
// ============================================================
function healBadge(heal: number): HTMLElement {
  return el('span', `heal-badge heal-badge--${heal}`, [
    textEl('span', 'heal-badge__meter', healMeter(heal)),
    textEl('span', 'heal-badge__label', healLabel(heal)),
  ]);
}

/** 今日・きのうの来園で、まだ癒され度を記録していないものに「どれくらい癒された？」を出す */
function renderHealAsk(): void {
  const box = $('heal-ask');
  const targets = state.loaded ? unratedRecent(state.visits).slice(0, 3) : [];
  box.replaceChildren(...targets.map((v) => {
    const key = `heal:${v.id}`;
    const when = v.date === todayKey() ? '今日の' : 'きのうの';
    const buttons = HEAL_LEVELS.map((h) => {
      const b = el('button', 'heal-ask__btn', [
        textEl('span', 'heal-ask__num', String(h.value)),
        textEl('span', 'heal-ask__label', h.label),
      ]) as HTMLButtonElement;
      b.type = 'button';
      b.disabled = state.pending.has(key);
      b.setAttribute('aria-label', `${h.value}：${h.label}`);
      b.addEventListener('click', () => { void rateHeal(v, h.value); });
      return b;
    });
    return el('div', 'heal-ask', [
      textEl('p', 'heal-ask__q', `${when}${parkName(v.parkId)}、どれくらい癒された？`),
      el('div', 'heal-ask__scale', buttons),
    ]);
  }));
}

async function rateHeal(visit: Visit, heal: number): Promise<void> {
  const uid = state.uid;
  if (!uid) return;
  const ok = await run(`heal:${visit.id}`, async () => {
    await setVisitHeal(uid, visit.id, heal);
    track('heal_rate', { heal });
  }, '保存に失敗しました。もう一度お試しください');
  if (!ok) return;
  if (heal === 5) {
    celebrate(18);
    showToast(`とても癒された！ ${parkName(visit.parkId)}の記録に残しました`);
  } else {
    showToast(`癒され度「${healLabel(heal)}」を記録しました`);
  }
}

function renderHealStats(monthVisits: Visit[]): void {
  const month = healSummary(monthVisits);
  $('heal-month-avg').textContent = month.rated ? formatAvg(month.avg) : '-';
  $('heal-month-best').textContent = String(month.best);
  $('heal-month-rated').textContent = String(month.rated);

  const ranking = healRanking(state.parks, state.visits);
  const list = $('heal-ranking');
  if (ranking.length === 0) {
    list.replaceChildren(textEl('p', 'muted-text', '来園したら「どれくらい癒された？」を記録してみましょう。公園ごとの平均がここに並びます'));
    return;
  }
  list.replaceChildren(...ranking.map((r, i) => {
    const fill = textEl('span', 'heal-ranking__fill', '');
    fill.style.width = `${Math.round((r.summary.avg / 5) * 100)}%`;
    const row = el('button', 'heal-ranking__row', [
      textEl('span', 'heal-ranking__rank', `${i + 1}`),
      el('span', 'heal-ranking__body', [
        el('span', 'heal-ranking__top', [
          textEl('span', 'heal-ranking__name', r.park.name),
          textEl('span', 'heal-ranking__avg', formatAvg(r.summary.avg)),
        ]),
        el('span', 'heal-ranking__bar', [fill]),
        textEl('span', 'heal-ranking__meta', `${r.summary.rated}回記録・とても癒された ${r.summary.best}回`),
      ]),
    ]);
    (row as HTMLButtonElement).type = 'button';
    row.addEventListener('click', () => openDetail(r.park.id));
    return row;
  }));
}

// ============================================================
// 公園の一覧
// ============================================================
function renderParks(): void {
  const list = $('park-list');
  if (!state.loaded) {
    list.replaceChildren(textEl('p', 'loading', '読み込み中…'));
    return;
  }
  if (state.parks.length === 0) {
    list.replaceChildren(emptyState(
      '砧公園・馬事公苑など、よく行く公園を登録しましょう。',
      button('公園を追加', 'btn btn--primary', () => openParkModal(null)),
    ));
    return;
  }
  list.replaceChildren(...state.parks.map((p) => {
    const visits = visitsOf(state.visits, p.id);
    const title = parkTitle(visits.length);
    const wishDone = p.wishes.filter((w) => w.doneDate).length;
    const heal = healSummary(visits);
    const card = el('button', 'park-card', [
      el('span', 'park-card__top', [
        textEl('span', 'park-card__name', p.name),
        textEl('span', 'park-card__count', `${visits.length}回`),
      ]),
      el('span', 'park-card__chips', [
        textEl('span', 'pill pill--primary', title.rank.name),
        textEl('span', 'pill', lastVisitLabel(visits)),
        p.wishes.length ? textEl('span', 'pill', `やってみたい ${wishDone}/${p.wishes.length}`) : null,
        heal.rated ? textEl('span', 'pill pill--heal', `癒され度 ${formatAvg(heal.avg)}`) : null,
      ]),
      el('span', 'park-card__bar', [(() => {
        const f = textEl('span', 'park-card__fill', '');
        f.style.width = `${Math.round(title.ratio * 100)}%`;
        return f;
      })()]),
      textEl('span', 'park-card__next', title.next ? `あと${title.next.min - visits.length}回で「${title.next.name}」` : '最高の称号です'),
    ]);
    (card as HTMLButtonElement).type = 'button';
    card.addEventListener('click', () => openDetail(p.id));
    return card;
  }));
}

// ============================================================
// 公園の詳細
// ============================================================
function renderDetail(): void {
  const park = parkById(state.detailId);
  if (!park) {
    if (state.view === 'detail' && state.loaded) switchView('parks');
    return;
  }
  const visits = visitsOf(state.visits, park.id);
  const finds = state.finds.filter((f) => f.parkId === park.id);
  const detailHeal = healSummary(visits);
  $('detail-name').textContent = park.name;
  $('detail-meta').textContent = visits.length
    ? `${visits.length}回・最初に来た日 ${shortDate(visits[visits.length - 1].date)}・${lastVisitLabel(visits)}`
      + (detailHeal.rated ? `・癒され度 平均${formatAvg(detailHeal.avg)}` : '')
    : 'まだ来園の記録はありません';
  const memo = $('detail-memo');
  memo.classList.toggle('hidden', !park.memo);
  if (park.memo) renderMemoView(memo, park.memo, { clampLines: 3 });

  const title = parkTitle(visits.length);
  renderRankCard($('detail-title-card'), title, '1回の来園で1ずつ');
  // 称号カードは「XP」ではなく「回」で見せる
  const xpEl = $('detail-title-card').querySelector('.waku-rank__xp');
  if (xpEl) xpEl.textContent = `${visits.length}回`;
  const nextEl = $('detail-title-card').querySelector('.waku-rank__next');
  if (nextEl) nextEl.textContent = title.next ? `あと${title.next.min - visits.length}回で「${title.next.name}」` : '最高の称号です。いつもありがとう。';

  const btnCheck = $<HTMLButtonElement>('btn-detail-checkin');
  btnCheck.disabled = state.pending.has(`checkin:${park.id}`);
  btnCheck.textContent = btnCheck.disabled ? '記録中…' : 'この公園に来た！';

  renderWishes(park);
  renderSeasonEdit(park);

  $('detail-find-count').textContent = finds.length ? `${finds.length}` : '';
  $('detail-finds').replaceChildren(...(finds.length
    ? finds.map(findCard)
    : [textEl('p', 'muted-text', 'まだありません。花や鳥、木の実などを残してみましょう')]));

  $('detail-visit-count').textContent = visits.length ? `${visits.length}` : '';
  $('detail-visits').replaceChildren(...(visits.length
    ? visits.slice(0, 30).map(visitCard)
    : [textEl('p', 'muted-text', '「この公園に来た！」で記録できます')]));
}

function renderWishes(park: Park): void {
  const done = park.wishes.filter((w) => w.doneDate).length;
  $('wish-count').textContent = park.wishes.length ? `${done}/${park.wishes.length}` : '';
  const grid = $('wish-grid');
  if (park.wishes.length === 0) {
    grid.replaceChildren(textEl('p', 'muted-text', 'まだありません。下の例から選んだり、自由に書いたりできます'));
  } else {
    grid.replaceChildren(...park.wishes.map((w) => {
      const cell = el('div', `wish${w.doneDate ? ' is-done' : ''}`);
      const toggle = el('button', 'wish__toggle', [
        textEl('span', 'wish__mark', w.doneDate ? '✓' : ''),
        textEl('span', 'wish__text', w.text),
        w.doneDate ? textEl('span', 'wish__date', `${shortDate(w.doneDate)} できた`) : null,
      ]);
      (toggle as HTMLButtonElement).type = 'button';
      toggle.setAttribute('aria-pressed', String(Boolean(w.doneDate)));
      toggle.addEventListener('click', () => { void toggleWish(park, w.id); });
      const del = button('×', 'wish__remove', () => removeWish(park, w.id));
      del.setAttribute('aria-label', `「${w.text}」を消す`);
      cell.append(toggle, del);
      return cell;
    }));
  }
  const existing = new Set(park.wishes.map((w) => w.text));
  $('wish-examples').replaceChildren(...WISH_EXAMPLES.filter((t) => !existing.has(t)).slice(0, 6).map((t) =>
    button(`＋ ${t}`, 'chip chip--example', () => { void addWish(park, t); })));
}

async function addWish(park: Park, text: string): Promise<boolean> {
  const uid = state.uid;
  const t = text.trim().slice(0, MAX_ITEM);
  if (!uid || !t) return false;
  if (park.wishes.length >= MAX_WISHES) {
    showToast(`やってみたいことは${MAX_WISHES}個までです`);
    return false;
  }
  if (park.wishes.some((w) => w.text === t)) {
    showToast('同じものがすでにあります');
    return false;
  }
  return run(`wish:${park.id}`, async () => {
    await saveWishes(uid, park.id, [...park.wishes, { id: newId(), text: t, doneDate: '' }]);
    track('wish_add');
  }, '追加に失敗しました');
}

async function toggleWish(park: Park, id: string): Promise<void> {
  const uid = state.uid;
  const target = park.wishes.find((w) => w.id === id);
  if (!uid || !target) return;
  const willDone = !target.doneDate;
  const next = park.wishes.map((w) => (w.id === id ? { ...w, doneDate: willDone ? todayKey() : '' } : w));
  const ok = await run(`wish:${park.id}`, async () => {
    await saveWishes(uid, park.id, next);
    if (willDone) track('wish_done');
  }, '保存に失敗しました');
  if (ok && willDone) {
    const allDone = next.length >= 3 && next.every((w) => w.doneDate);
    celebrate(allDone ? 40 : 18);
    if (allDone) showPopup('ぜんぶ達成！', `${park.name}でやってみたいことを、ぜんぶやりました。新しい「やってみたい」も足してみましょう。`);
    else showToast(`やってみたいこと、ひとつ達成！ +${XP.wish} XP`);
  }
}

function removeWish(park: Park, id: string): void {
  const uid = state.uid;
  const target = park.wishes.find((w) => w.id === id);
  if (!uid || !target) return;
  askConfirm('やってみたいことを消しますか？', `「${target.text}」を消します。元に戻せません。`, '消す', async () => {
    await run(`wish:${park.id}`, () => saveWishes(uid, park.id, park.wishes.filter((w) => w.id !== id)), '削除に失敗しました');
  });
}

function renderSeasonEdit(park: Park): void {
  const list = $('season-edit-list');
  const sorted = [...park.seasons].sort((a, b) => a.month - b.month);
  if (sorted.length === 0) {
    list.replaceChildren(textEl('p', 'muted-text', 'まだありません'));
    return;
  }
  const thisMonth = new Date().getMonth() + 1;
  list.replaceChildren(...sorted.map((s) => {
    const del = button('×', 'season-item__remove', () => {
      const uid = state.uid;
      if (!uid) return;
      askConfirm('季節の楽しみを消しますか？', `「${s.month}月：${s.text}」を消します。元に戻せません。`, '消す', async () => {
        await run(`season:${park.id}`, () => saveSeasons(uid, park.id, park.seasons.filter((x) => x.id !== s.id)), '削除に失敗しました');
      });
    });
    del.setAttribute('aria-label', `「${s.text}」を消す`);
    return el('div', `season-item season-item--static${s.month === thisMonth ? ' is-now' : ''}`, [
      textEl('span', 'season-item__month', `${s.month}月`),
      el('span', 'season-item__body', [textEl('span', 'season-item__text', s.text)]),
      del,
    ]);
  }));
}

// ============================================================
// 図鑑
// ============================================================
function findCard(f: Find): HTMLElement {
  const card = el('button', 'find-card', [
    f.photo ? photoEl(f.photo, f.name) : el('div', 'find-card__noimg', [textEl('span', '', optionLabel(FIND_KINDS, f.kind))]),
    el('span', 'find-card__body', [
      textEl('span', 'find-card__name', f.name),
      textEl('span', 'find-card__meta', `${optionLabel(FIND_KINDS, f.kind)}・${shortDate(f.date)}`),
      textEl('span', 'find-card__park', parkName(f.parkId)),
    ]),
  ]);
  (card as HTMLButtonElement).type = 'button';
  card.addEventListener('click', () => openFindModal(f, null));
  return card;
}

function renderZukan(): void {
  const kindsUsed = new Set(state.finds.map((f) => f.kind));
  const filters: Option[] = [{ key: 'all', label: `すべて ${state.finds.length}` },
    ...FIND_KINDS.filter((k) => kindsUsed.has(k.key)).map((k) => ({
      key: k.key, label: `${k.label} ${state.finds.filter((f) => f.kind === k.key).length}`,
    }))];
  if (!filters.some((f) => f.key === state.findFilter)) state.findFilter = 'all';
  renderChips($('find-filter'), filters, state.findFilter, (key) => {
    state.findFilter = key || 'all';
    renderZukan();
  }, false);

  const list = $('find-list');
  const shown = state.findFilter === 'all' ? state.finds : state.finds.filter((f) => f.kind === state.findFilter);
  if (!state.loaded) {
    list.replaceChildren(textEl('p', 'loading', '読み込み中…'));
  } else if (state.finds.length === 0) {
    list.replaceChildren(emptyState(
      '公園で見つけた花・鳥・木の実・景色などを残していくと、自分だけの図鑑ができます。',
      button('見つけたものを追加', 'btn btn--primary', () => openFindModal(null, null)),
    ));
  } else {
    list.replaceChildren(...shown.map(findCard));
  }

  const done = doneOdaiIds(state.days);
  $('odai-count').textContent = `${done.size}/${ODAI.length}`;
  $('odai-list').replaceChildren(...ODAI.map((o) => {
    const got = done.has(o.id);
    return el('div', `odai-item odai-item--${o.rarity}${got ? ' is-got' : ''}`, [
      textEl('span', 'odai-item__rarity', '★'.repeat(RARITY[o.rarity].stars)),
      textEl('span', 'odai-item__title', got ? o.title : '？？？'),
    ]);
  }));
}

// ============================================================
// きろく（カレンダー）
// ============================================================
function renderLog(): void {
  const y = state.calYear;
  const m0 = state.calMonth0;
  const ym = monthKey(y, m0);
  $('cal-title').textContent = `${y}年${m0 + 1}月`;
  const monthVisits = state.visits.filter((v) => v.date.startsWith(ym));
  const byDay = new Map<string, Visit[]>();
  monthVisits.forEach((v) => byDay.set(v.date, [...(byDay.get(v.date) ?? []), v]));

  const cal = $('calendar');
  const cells: HTMLElement[] = ['月', '火', '水', '木', '金', '土', '日'].map((w) => textEl('div', 'calendar__dow', w));
  const firstDow = (new Date(y, m0, 1).getDay() + 6) % 7;
  for (let i = 0; i < firstDow; i++) cells.push(el('div', 'calendar__cell is-blank'));
  const today = todayKey();
  for (let d = 1; d <= daysInMonth(y, m0); d++) {
    const key = `${ym}-${String(d).padStart(2, '0')}`;
    const vs = byDay.get(key) ?? [];
    const dayHeal = Math.max(0, ...vs.map((v) => v.heal));
    const cell = el('button', `calendar__cell${vs.length ? ' has-visit' : ''}${dayHeal ? ` heal-${dayHeal}` : ''}${key === today ? ' is-today' : ''}${key === state.calSelected ? ' is-selected' : ''}`, [
      textEl('span', 'calendar__day', String(d)),
      vs.length ? textEl('span', 'calendar__dot', vs.length > 1 ? `${vs.length}` : '●') : null,
    ]);
    (cell as HTMLButtonElement).type = 'button';
    cell.setAttribute('aria-label', `${m0 + 1}月${d}日${vs.length ? ` ${vs.length}回来園` : ''}${dayHeal ? ` ${healLabel(dayHeal)}` : ''}`);
    cell.addEventListener('click', () => {
      state.calSelected = state.calSelected === key ? '' : key;
      renderLog();
    });
    cells.push(cell);
  }
  cal.replaceChildren(...cells);

  const counts = countByPark(monthVisits);
  $('month-parks').replaceChildren(...state.parks.filter((p) => counts.get(p.id)).map((p) =>
    textEl('span', 'pill pill--primary', `${p.name} ${counts.get(p.id)}回`)));

  renderHealStats(monthVisits);

  const shown = state.calSelected ? monthVisits.filter((v) => v.date === state.calSelected) : monthVisits;
  $('month-count').textContent = state.calSelected ? `${labelOf(state.calSelected)} ${shown.length}回` : `${monthVisits.length}回`;
  $('month-visits').replaceChildren(...(shown.length
    ? shown.map(visitCard)
    : [textEl('p', 'muted-text', state.calSelected ? 'この日の記録はありません' : 'この月の記録はありません')]));
}

function moveMonth(delta: number): void {
  const d = new Date(state.calYear, state.calMonth0 + delta, 1);
  state.calYear = d.getFullYear();
  state.calMonth0 = d.getMonth();
  state.calSelected = '';
  renderLog();
}

// ============================================================
// まとめて描画
// ============================================================
function renderFab(): void {
  const show = state.view === 'parks' || state.view === 'zukan' || state.view === 'log' || state.view === 'detail';
  btnFab.classList.toggle('hidden', !show || state.parks.length === 0 && state.view !== 'parks');
  const labels: Record<View, string> = {
    home: '', parks: '公園を追加', detail: '見つけたものを追加', zukan: '見つけたものを追加', log: '来園を追加',
  };
  btnFab.setAttribute('aria-label', labels[state.view]);
}

function renderAll(): void {
  if (!state.uid) return;
  if (state.view === 'home') renderHome();
  if (state.view === 'parks') renderParks();
  if (state.view === 'detail') renderDetail();
  if (state.view === 'zukan') renderZukan();
  if (state.view === 'log') renderLog();
  renderFab();
  btnParkSubmit.disabled = state.pending.has('park');
  btnVisitSubmit.disabled = state.pending.has('visit');
  btnFindSubmit.disabled = state.pending.has('find') || state.photoBusy;
}

// ============================================================
// 公園モーダル
// ============================================================
function openParkModal(park: Park | null): void {
  state.parkEditingId = park?.id ?? null;
  $('park-modal-title').textContent = park ? '公園を編集' : '公園を追加';
  inputParkName.value = park?.name ?? '';
  inputParkMemo.value = park?.memo ?? '';
  btnParkDelete.classList.toggle('hidden', !park);
  const existing = new Set(state.parks.map((p) => p.name));
  $('park-examples').replaceChildren(...(park ? [] : PARK_EXAMPLES.filter((n) => !existing.has(n)).map((n) =>
    button(n, 'chip chip--example', () => { inputParkName.value = n; inputParkName.focus(); }))));
  openOverlay(parkOverlay);
  autoGrow(inputParkMemo);
  window.setTimeout(() => inputParkName.focus(), 50);
}

parkForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const uid = state.uid;
  const name = inputParkName.value.trim();
  if (!uid) return;
  if (!name) {
    showToast('公園の名前を入力してください');
    inputParkName.focus();
    return;
  }
  const editingId = state.parkEditingId;
  if (state.parks.some((p) => p.name === name && p.id !== editingId)) {
    showToast('同じ名前の公園がすでにあります');
    return;
  }
  let newParkId = '';
  const ok = await run('park', async () => {
    if (editingId) {
      await updatePark(uid, editingId, { name, memo: inputParkMemo.value });
    } else {
      newParkId = await createPark(uid, { name, memo: inputParkMemo.value });
      track('park_create');
    }
  }, '保存に失敗しました');
  if (!ok) return;
  closeOverlay(parkOverlay);
  showToast(editingId ? '保存しました' : `${name}を追加しました`);
  if (newParkId && state.view === 'parks') openDetail(newParkId);
});

btnParkDelete.addEventListener('click', () => {
  const uid = state.uid;
  const park = parkById(state.parkEditingId);
  if (!uid || !park) return;
  const visitIds = visitsOf(state.visits, park.id).map((v) => v.id);
  const findIds = state.finds.filter((f) => f.parkId === park.id).map((f) => f.id);
  askConfirm(
    `${park.name}を削除しますか？`,
    `来園の記録${visitIds.length}件と見つけたもの${findIds.length}件もいっしょに削除されます。元に戻せません。`,
    '削除する',
    async () => {
      const ok = await run('park', async () => {
        await deletePark(uid, park.id, visitIds, findIds);
        track('park_delete');
      }, '削除に失敗しました');
      if (ok) {
        closeOverlay(parkOverlay);
        state.detailId = null;
        switchView('parks');
        showToast('削除しました');
      }
    },
  );
});

// ============================================================
// 来園モーダル
// ============================================================
function renderVisitChips(): void {
  renderChips($('visit-with'), WITH_OPTIONS, state.visitWith, (k) => { state.visitWith = k; renderVisitChips(); });
  renderChips($('visit-weather'), WEATHER_OPTIONS, state.visitWeather, (k) => { state.visitWeather = k; renderVisitChips(); });
  renderChips($('visit-heal'), HEAL_LEVELS.map((h) => ({ key: String(h.value), label: h.label })), state.visitHeal ? String(state.visitHeal) : '',
    (k) => { state.visitHeal = Number(k) || 0; renderVisitChips(); });
}

function openVisitModal(visit: Visit | null, parkId: string | null): void {
  if (state.parks.length === 0) {
    showToast('先に公園を登録してください');
    return;
  }
  state.visitEditingId = visit?.id ?? null;
  $('visit-modal-title').textContent = visit ? '来園の記録' : '来園を追加';
  fillParkSelect(inputVisitPark, visit?.parkId ?? parkId ?? state.parks[0].id);
  inputVisitDate.value = visit?.date ?? (state.calSelected || todayKey());
  inputVisitDate.max = todayKey();
  inputVisitNote.value = visit?.note ?? '';
  state.visitWith = visit?.withWho ?? '';
  state.visitWeather = visit?.weather ?? '';
  state.visitHeal = visit?.heal ?? 0;
  renderVisitChips();
  btnVisitDelete.classList.toggle('hidden', !visit);
  openOverlay(visitOverlay);
  autoGrow(inputVisitNote);
}

visitForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const uid = state.uid;
  if (!uid) return;
  const input: VisitInput = {
    parkId: inputVisitPark.value,
    date: inputVisitDate.value,
    withWho: state.visitWith,
    weather: state.visitWeather,
    heal: state.visitHeal,
    note: inputVisitNote.value,
  };
  if (!parkById(input.parkId)) {
    showToast('公園を選んでください');
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    showToast('行った日を入力してください');
    return;
  }
  if (input.date > todayKey()) {
    showToast('未来の日付は記録できません');
    return;
  }
  const editingId = state.visitEditingId;
  const ok = await run('visit', async () => {
    if (editingId) {
      await updateVisit(uid, editingId, input);
    } else {
      await createVisit(uid, input);
      track('visit_create');
    }
  }, '保存に失敗しました');
  if (!ok) return;
  closeOverlay(visitOverlay);
  showToast('保存しました');
});

btnVisitDelete.addEventListener('click', () => {
  const uid = state.uid;
  const visit = state.visits.find((v) => v.id === state.visitEditingId);
  if (!uid || !visit) return;
  askConfirm(`${labelOf(visit.date)}の来園を削除しますか？`, `${parkName(visit.parkId)}の来園回数が1回減ります。元に戻せません。`, '削除する', async () => {
    const ok = await run('visit', async () => {
      await deleteVisit(uid, visit.id);
      track('visit_delete');
    }, '削除に失敗しました');
    if (ok) {
      closeOverlay(visitOverlay);
      showToast('削除しました');
    }
  });
});

// ============================================================
// 見つけたものモーダル
// ============================================================
function setFindPhoto(photo: string): void {
  state.findPhoto = photo;
  photoPreview.classList.toggle('hidden', !photo);
  btnPhotoRemove.classList.toggle('hidden', !photo);
  if (photo) photoPreviewImg.src = photo;
  else photoPreviewImg.removeAttribute('src');
}

function renderFindKind(): void {
  renderChips($('find-kind'), FIND_KINDS, state.findKind, (k) => { state.findKind = k; renderFindKind(); }, false);
}

function openFindModal(find: Find | null, parkId: string | null): void {
  if (state.parks.length === 0) {
    showToast('先に公園を登録してください');
    return;
  }
  state.findEditingId = find?.id ?? null;
  $('find-modal-title').textContent = find ? '見つけたもの' : '見つけたものを追加';
  inputFindName.value = find?.name ?? '';
  const defaultPark = find?.parkId ?? parkId ?? state.visits[0]?.parkId ?? state.parks[0].id;
  fillParkSelect(inputFindPark, parkById(defaultPark) ? defaultPark : state.parks[0].id);
  inputFindDate.value = find?.date ?? todayKey();
  inputFindDate.max = todayKey();
  inputFindNote.value = find?.note ?? '';
  state.findKind = find?.kind ?? 'flower';
  renderFindKind();
  setFindPhoto(find?.photo ?? '');
  inputFindPhoto.value = '';
  btnFindDelete.classList.toggle('hidden', !find);
  openOverlay(findOverlay);
  autoGrow(inputFindNote);
}

inputFindPhoto.addEventListener('change', async () => {
  const file = inputFindPhoto.files?.[0];
  if (!file) return;
  state.photoBusy = true;
  renderAll();
  try {
    setFindPhoto(await compressPhoto(file));
  } catch (err) {
    console.error(err);
    showToast('写真を読み込めませんでした。別の写真をお試しください');
  } finally {
    state.photoBusy = false;
    inputFindPhoto.value = '';
    renderAll();
  }
});

btnPhotoRemove.addEventListener('click', () => setFindPhoto(''));

findForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const uid = state.uid;
  if (!uid || state.photoBusy) return;
  const input: FindInput = {
    parkId: inputFindPark.value,
    date: inputFindDate.value,
    kind: state.findKind,
    name: inputFindName.value,
    note: inputFindNote.value,
    photo: state.findPhoto,
  };
  if (!input.name.trim()) {
    showToast('名前を入力してください（わからなければ「青い花」などでOK）');
    inputFindName.focus();
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > todayKey()) {
    showToast('見つけた日を確認してください');
    return;
  }
  const editingId = state.findEditingId;
  const ok = await run('find', async () => {
    if (editingId) {
      await updateFind(uid, editingId, input);
    } else {
      await createFind(uid, input);
      track('find_create');
    }
  }, '保存に失敗しました。写真が大きすぎる場合は外してお試しください');
  if (!ok) return;
  closeOverlay(findOverlay);
  showToast(editingId ? '保存しました' : `図鑑に追加しました +${XP.find} XP`);
});

btnFindDelete.addEventListener('click', () => {
  const uid = state.uid;
  const find = state.finds.find((f) => f.id === state.findEditingId);
  if (!uid || !find) return;
  askConfirm(`「${find.name}」を削除しますか？`, '写真もいっしょに削除されます。元に戻せません。', '削除する', async () => {
    const ok = await run('find', async () => {
      await deleteFind(uid, find.id);
      track('find_delete');
    }, '削除に失敗しました');
    if (ok) {
      closeOverlay(findOverlay);
      showToast('削除しました');
    }
  });
});

// ============================================================
// 詳細画面のフォーム
// ============================================================
const inputWish = $<HTMLInputElement>('input-wish');
$('wish-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const park = parkById(state.detailId);
  if (!park) return;
  if (!inputWish.value.trim()) {
    showToast('やってみたいことを入力してください');
    return;
  }
  if (await addWish(park, inputWish.value)) inputWish.value = '';
});

const inputSeasonMonth = $<HTMLSelectElement>('input-season-month');
const inputSeasonText = $<HTMLInputElement>('input-season-text');
inputSeasonMonth.replaceChildren(...Array.from({ length: 12 }, (_, i) => {
  const o = document.createElement('option');
  o.value = String(i + 1);
  o.textContent = `${i + 1}月`;
  return o;
}));
inputSeasonMonth.value = String(new Date().getMonth() + 1);

$('season-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const uid = state.uid;
  const park = parkById(state.detailId);
  const text = inputSeasonText.value.trim().slice(0, MAX_ITEM);
  const month = Number(inputSeasonMonth.value);
  if (!uid || !park) return;
  if (!text) {
    showToast('季節の楽しみを入力してください');
    return;
  }
  if (park.seasons.length >= MAX_SEASONS) {
    showToast(`季節の楽しみは${MAX_SEASONS}個までです`);
    return;
  }
  const ok = await run(`season:${park.id}`, async () => {
    await saveSeasons(uid, park.id, [...park.seasons, { id: newId(), month, text }]);
    track('season_add');
  }, '追加に失敗しました');
  if (ok) inputSeasonText.value = '';
});

// ============================================================
// 確認ダイアログ・フィードバック
// ============================================================
function cancelConfirm(): void {
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
}
$('btn-confirm-cancel').addEventListener('click', cancelConfirm);
btnConfirmOk.addEventListener('click', () => {
  const action = state.confirmAction;
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
  if (action) void action();
});

$('feedback-btn').addEventListener('click', () => {
  openOverlay(feedbackOverlay);
  window.setTimeout(() => inputFeedbackMessage.focus(), 50);
});
$('btn-feedback-close').addEventListener('click', () => closeOverlay(feedbackOverlay));
feedbackOverlay.addEventListener('click', (e) => {
  if (e.target === feedbackOverlay) closeOverlay(feedbackOverlay);
});

btnFeedbackSend.addEventListener('click', async () => {
  const message = inputFeedbackMessage.value.trim();
  if (!message) {
    showToast('内容を入力してください');
    return;
  }
  if (btnFeedbackSend.disabled) return;
  btnFeedbackSend.disabled = true;
  btnFeedbackSend.textContent = '送信中…';
  const ok = await submitFeedback(message);
  btnFeedbackSend.disabled = false;
  btnFeedbackSend.textContent = '送信する';
  if (ok) {
    inputFeedbackMessage.value = '';
    closeOverlay(feedbackOverlay);
    showToast('送信しました。ありがとうございます！');
  } else {
    showToast('送信に失敗しました。時間をおいて再度お試しください');
  }
});

// ============================================================
// モーダルの開閉・ボタン
// ============================================================
[['btn-park-close', parkOverlay], ['btn-park-cancel', parkOverlay], ['btn-visit-close', visitOverlay],
  ['btn-visit-cancel', visitOverlay], ['btn-find-close', findOverlay], ['btn-find-cancel', findOverlay],
].forEach(([id, overlay]) => $(id as string).addEventListener('click', () => closeOverlay(overlay as HTMLElement)));

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (confirmOverlay.classList.contains('is-open')) {
    cancelConfirm();
    return;
  }
  [parkOverlay, visitOverlay, findOverlay, feedbackOverlay].forEach(closeOverlay);
});

tabButtons.forEach((b) => b.addEventListener('click', () => {
  const tab = b.dataset.tab as View;
  switchView(['home', 'parks', 'zukan', 'log'].includes(tab) ? tab : 'home');
}));
$('btn-back').addEventListener('click', () => switchView('parks'));
$('btn-add-park').addEventListener('click', () => openParkModal(null));
$('btn-edit-park').addEventListener('click', () => openParkModal(parkById(state.detailId)));
$('btn-detail-checkin').addEventListener('click', () => {
  const park = parkById(state.detailId);
  if (park) void checkIn(park);
});
$('btn-detail-find').addEventListener('click', () => openFindModal(null, state.detailId));
$('btn-add-find').addEventListener('click', () => openFindModal(null, null));
$('btn-add-visit').addEventListener('click', () => openVisitModal(null, null));
$('btn-prev-month').addEventListener('click', () => moveMonth(-1));
$('btn-next-month').addEventListener('click', () => moveMonth(1));
btnFab.addEventListener('click', () => {
  if (state.view === 'parks') openParkModal(null);
  else if (state.view === 'log') openVisitModal(null, null);
  else if (state.view === 'detail') openFindModal(null, state.detailId);
  else openFindModal(null, null);
});

// ============================================================
// Auth
// ============================================================
btnGoogleLogin.addEventListener('click', async () => {
  if (btnGoogleLogin.disabled) return;
  btnGoogleLogin.disabled = true;
  try {
    await loginWithGoogle();
    track('login');
  } catch (err) {
    console.error(err);
    const code = (err as { code?: string }).code;
    if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      showToast('ログインに失敗しました。もう一度お試しください');
    }
  } finally {
    btnGoogleLogin.disabled = false;
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    await logout();
  } catch (err) {
    console.error(err);
    showToast('ログアウトに失敗しました');
  }
});

function stopSubscriptions(): void {
  state.unsubscribers.forEach((u) => u());
  state.unsubscribers = [];
}

onAuthChange((user: User | null) => {
  stopSubscriptions();
  if (!user) {
    Object.assign(state, { uid: null, parks: [], visits: [], finds: [], days: [], loaded: false, detailId: null, view: 'home' });
    loginScreen.classList.remove('hidden');
    appEl.classList.add('hidden');
    userInfo.classList.add('hidden');
    [parkOverlay, visitOverlay, findOverlay, confirmOverlay, feedbackOverlay].forEach(closeOverlay);
    resetSouieba(document.getElementById('souieba-box'));
    return;
  }
  state.uid = user.uid;
  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  userInfo.classList.remove('hidden');
  userAvatar.src = user.photoURL ?? '';
  userAvatar.classList.toggle('hidden', !user.photoURL);
  userName.textContent = user.displayName ?? '';
  switchView('home');

  const onError = (err: Error): void => {
    console.error(err);
    showToast('データの読み込みに失敗しました。再読み込みしてください');
  };
  const waiting = new Set(['parks', 'visits', 'finds', 'days']);
  const loadedOne = (key: string): void => {
    if (waiting.delete(key) && waiting.size === 0) state.loaded = true;
  };
  state.unsubscribers.push(
    subscribeParks(user.uid, (items) => { state.parks = items; loadedOne('parks'); renderAll(); }, onError),
    subscribeVisits(user.uid, (items) => { state.visits = items; loadedOne('visits'); renderAll(); }, onError),
    subscribeFinds(user.uid, (items) => { state.finds = items; loadedOne('finds'); renderAll(); }, onError),
    subscribeDays(user.uid, (items) => { state.days = items; loadedOne('days'); renderAll(); }, onError),
  );
});

// 日付が変わったらお題や今日の表示を更新する
let lastDay = todayKey();
window.setInterval(() => {
  const t = todayKey();
  if (t !== lastDay) {
    lastDay = t;
    renderAll();
  }
}, 60 * 1000);

initTextareas();
