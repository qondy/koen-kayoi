// 「そういえば、これ」：忘れていた登録を、1日1件だけ聞き返すカード（共通部品）。
// ・どれを出したか／今日答えたか／しばらく出さない物は、端末内（localStorage）に保存する
//   （保存できない環境では、画面を開いている間だけ有効）。アプリの保存データは変えない
// ・画面は textContent で組み立てる（ユーザーの入力を HTML として扱わない）
// ・何度描き直しても、同じ日は同じ1件が出る
// スタイルは _souieba.scss。色はアプリ側で --souieba-accent を指定する。

export interface SouiebaView {
  title: string;
  meta?: string;
  note?: string;
  thumb?: string; // 検証済みの画像URL（data URL）だけを渡す
}

export interface SouiebaAction<T> {
  label: string;
  /** GA4 の click_label になる固定の名前 */
  track: string;
  primary?: boolean;
  /** 押した直後に出す結果の文。失敗は例外にすると、カードが元に戻る */
  run: (item: T, button: HTMLButtonElement) => string | Promise<string>;
}

export interface SouiebaOptions<T> {
  box: HTMLElement;
  /** 例: `zatsudan-souieba:${uid}` */
  storageKey: string;
  heading: string;
  /** アプリ側の条件（古さなど）で絞った候補 */
  items: T[];
  idOf: (item: T) => string;
  view: (item: T) => SouiebaView;
  open?: (item: T) => void;
  actions: SouiebaAction<T>[];
  /** 操作した物を次に出すまでの日数 */
  snoozeDays?: number;
  onError?: (err: unknown) => void;
}

const DAY = 86_400_000;
const SKIP_SNOOZE_DAYS = 3;

interface Saved {
  date: string;
  id: string;
  answered: boolean;
  snooze: Record<string, number>; // id → この時刻まで出さない
}

const memory = new Map<string, Saved>();
const results = new WeakMap<HTMLElement, { key: string; text: string; busy: boolean }>();

/** ms で表した日時が、days 日以上前か */
export const olderThan = (ms: number, days: number, now = Date.now()): boolean => ms > 0 && now - ms >= days * DAY;

export const daysAgoOf = (ms: number, now = Date.now()): number => Math.max(0, Math.floor((now - ms) / DAY));

function todayKey(now = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function load(key: string): Saved {
  const empty: Saved = { date: '', id: '', answered: false, snooze: {} };
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<Saved> | null;
    if (v && typeof v.date === 'string' && typeof v.id === 'string') {
      const snooze: Record<string, number> = {};
      Object.entries(v.snooze ?? {}).forEach(([id, until]) => {
        if (typeof until === 'number' && until > Date.now()) snooze[id] = until;
      });
      return { date: v.date, id: v.id, answered: v.answered === true, snooze };
    }
  } catch {
    // 読めない場合はメモリの値を使う
  }
  return memory.get(key) ?? empty;
}

function save(key: string, value: Saved): void {
  memory.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できない環境
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** ログアウト時などに、カードと表示中の結果を消す */
export function resetSouieba(box: HTMLElement | null): void {
  if (!box) return;
  results.delete(box);
  box.replaceChildren();
  box.classList.add('hidden');
}

export function renderSouieba<T>(o: SouiebaOptions<T>): void {
  const { box } = o;
  box.classList.add('souieba');

  const result = results.get(box);
  if (result && result.key === o.storageKey) {
    box.classList.remove('hidden');
    box.replaceChildren(el('p', 'souieba__result', result.text));
    return;
  }

  const saved = load(o.storageKey);
  const today = todayKey();
  const now = Date.now();
  const answeredToday = saved.date === today && saved.answered;
  const candidates = answeredToday ? [] : o.items.filter((i) => (saved.snooze[o.idOf(i)] ?? 0) <= now);
  if (candidates.length === 0) {
    box.replaceChildren();
    box.classList.add('hidden');
    return;
  }

  let item = saved.date === today ? candidates.find((i) => o.idOf(i) === saved.id) : undefined;
  if (!item) {
    item = candidates[Math.floor(Math.random() * candidates.length)];
    save(o.storageKey, { ...saved, date: today, id: o.idOf(item), answered: false });
  }
  const picked = item;
  const id = o.idOf(picked);
  const view = o.view(picked);

  const answer = (action: SouiebaAction<T> | null, button: HTMLButtonElement): void => {
    if (results.get(box)?.busy) return;
    const before = load(o.storageKey);
    const days = action ? o.snoozeDays ?? 30 : SKIP_SNOOZE_DAYS;
    // 保存中の描き直しで別の物が出ないように、先に「今日は回答済み」にする
    save(o.storageKey, { date: today, id, answered: true, snooze: { ...before.snooze, [id]: Date.now() + days * DAY } });
    const show = (text: string, busy: boolean): void => {
      results.set(box, { key: o.storageKey, text, busy });
      box.replaceChildren(el('p', 'souieba__result', text));
    };
    const fail = (err: unknown): void => {
      save(o.storageKey, before);
      results.delete(box);
      renderSouieba(o);
      o.onError?.(err);
    };
    let outcome: string | Promise<string>;
    try {
      // コピーなどはクリックした直後でないと動かないので、ここで同期的に呼ぶ
      outcome = action ? action.run(picked, button) : 'わかりました。また今度出します。';
    } catch (err) {
      fail(err);
      return;
    }
    if (typeof outcome === 'string') {
      show(outcome, false);
      return;
    }
    show('少しお待ちください…', true);
    outcome.then((text) => {
      if (results.get(box)?.key === o.storageKey) show(text, false);
    }, fail);
  };

  const body = el(o.open ? 'button' : 'div', 'souieba__item');
  if (o.open) {
    (body as HTMLButtonElement).type = 'button';
    body.dataset.track = 'souieba_open';
    body.addEventListener('click', () => o.open?.(picked));
  }
  if (view.thumb) {
    const img = el('img', 'souieba__thumb');
    img.src = view.thumb;
    img.alt = '';
    body.append(img);
  }
  const text = el('span', 'souieba__text');
  text.append(el('span', 'souieba__title', view.title));
  if (view.meta) text.append(el('span', 'souieba__meta', view.meta));
  if (view.note) text.append(el('span', 'souieba__note', view.note));
  body.append(text);

  const actions = el('div', 'souieba__actions');
  const addButton = (label: string, trackName: string, primary: boolean, action: SouiebaAction<T> | null): void => {
    const b = el('button', `souieba__btn${primary ? ' souieba__btn--primary' : ''}`, label);
    b.type = 'button';
    b.dataset.track = trackName;
    b.addEventListener('click', () => answer(action, b));
    actions.append(b);
  };
  o.actions.forEach((a) => addButton(a.label, a.track, a.primary === true, a));
  addButton('今日はスルー', 'souieba_skip', false, null);

  box.classList.remove('hidden');
  box.replaceChildren(el('h2', 'souieba__heading', o.heading), body, actions);
}
