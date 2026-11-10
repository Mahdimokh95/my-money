/* My Money — a personal finance web app.
   All data stays on this device (IndexedDB). Nothing is sent anywhere. */
'use strict';

/* ================= Helpers ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
let _n = 0;
const uid = () => Date.now().toString(36) + (_n++).toString(36) + Math.random().toString(36).slice(2, 6);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
const today = () => iso(new Date());
const curYM = () => today().slice(0, 7);
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const daysInMonth = (y, m0) => new Date(y, m0 + 1, 0).getDate();
function addMonths(s, n, anchorDay) {
  const d = parseISO(s);
  let y = d.getFullYear(), m = d.getMonth() + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return iso(new Date(y, m, Math.min(anchorDay || d.getDate(), daysInMonth(y, m))));
}
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const shiftMonth = (ym, n) => addMonths(ym + '-01', n).slice(0, 7);

const moneyFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fm = c => moneyFmt.format((c || 0) / 100);
const fmtDate = s => parseISO(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDay = s => {
  const d = daysBetween(s, today());
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return parseISO(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: s.slice(0, 4) === today().slice(0, 4) ? undefined : 'numeric' });
};
const monthLabel = ym => parseISO(ym + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const monthShort = ym => parseISO(ym + '-01').toLocaleDateString('en-GB', { month: 'short' });
const centsToInput = c => (c / 100).toFixed(2).replace('.', ',');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Accepts "12,50", "12.50", "1.234,56", "1,234.56", "1.500" (=1500) — returns cents or NaN */
function parseAmount(input) {
  let s = String(input ?? '').trim().replace(/[€\s]/g, '');
  if (!s) return NaN;
  const neg = s.startsWith('-');
  s = s.replace(/^[-+]/, '');
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) {
    const d = Math.max(lc, ld);
    s = s.slice(0, d).replace(/[.,]/g, '') + '.' + s.slice(d + 1);
  } else if (lc > -1) {
    const p = s.split(',');
    s = p.length > 2 ? p.join('') : p[0] + '.' + p[1];
  } else if (ld > -1) {
    const p = s.split('.');
    if (p.length > 2 || p[1].length === 3) s = p.join('');
  }
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return NaN;
  const n = Number(s);
  return isFinite(n) ? Math.round(n * 100) * (neg ? -1 : 1) : NaN;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ================= Storage ================= */
const DB_NAME = 'my-money', STORE = 'kv', KEY = 'state', LS_KEY = 'my-money-state';
let _db = null;
function getDB() {
  return _db ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function loadState() {
  try {
    const db = await getDB();
    const v = await new Promise((res, rej) => {
      const q = db.transaction(STORE).objectStore(STORE).get(KEY);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    if (v) return v;
  } catch (e) { console.warn('IndexedDB unavailable', e); }
  try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
let _warned = false;
async function persist() {
  try {
    const db = await getDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(S, KEY);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    return;
  } catch (e) { console.warn(e); }
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); }
  catch { if (!_warned) { _warned = true; toast('⚠️ Could not save on this device'); } }
}

/* ================= Data model ================= */
let S; // the whole app state

function defaultState() {
  const cats = [];
  const add = (type, icon, name, subs = [], extra = {}) => {
    const id = uid();
    cats.push({ id, type, icon, name, parent: null, ...extra });
    subs.forEach(n => cats.push({ id: uid(), type, icon, name: n, parent: id }));
  };
  add('expense', '🛒', 'Groceries', ['Supermarket', 'Bakery', 'Drugstore']);
  add('expense', '🏠', 'Home', ['Rent', 'Nebenkosten', 'Electricity', 'Gas / Heating', 'Internet & Phone', 'Rundfunkbeitrag', 'Furniture & repairs']);
  add('expense', '🚗', 'Car', ['Fuel', 'Maintenance & repairs', 'Insurance', 'Kfz-Steuer', 'TÜV / HU', 'Tires', 'Parking & tolls', 'Car wash'], { odo: true });
  add('expense', '🚆', 'Transport', ['Deutschlandticket', 'Train', 'Taxi']);
  add('expense', '🛡️', 'Insurance', ['Health', 'Haftpflicht', 'Hausrat', 'Other insurance']);
  add('expense', '🍽️', 'Eating out', ['Restaurant', 'Coffee & snacks', 'Delivery']);
  add('expense', '🛍️', 'Shopping', ['Clothes', 'Electronics', 'Household items']);
  add('expense', '💊', 'Health', ['Pharmacy', 'Doctor', 'Sports']);
  add('expense', '🎬', 'Leisure', ['Subscriptions', 'Hobbies', 'Travel', 'Events']);
  add('expense', '🎁', 'Gifts & donations');
  add('expense', '📚', 'Education');
  add('expense', '🏦', 'Fees & taxes', ['Bank fees', 'Taxes']);
  add('expense', '📦', 'Other');
  add('income', '💼', 'Salary');
  add('income', '💻', 'Side job / Freelance');
  add('income', '🏛️', 'Benefits', ['Kindergeld', 'Other benefits']);
  add('income', '💸', 'Refunds', ['Tax refund', 'Other refunds']);
  add('income', '📈', 'Interest & investments');
  add('income', '🎁', 'Gifts received');
  add('income', '➕', 'Other income');
  return {
    version: 1,
    settings: { lastBackup: null, created: today() },
    accounts: [
      { id: uid(), name: 'Cash', type: 'cash', opening: 0 },
      { id: uid(), name: 'Girokonto', type: 'bank', opening: 0 },
    ],
    categories: cats, transactions: [], loans: [], recurring: [], budgets: {},
  };
}
function migrate() {
  for (const k of ['accounts', 'categories', 'transactions', 'loans', 'recurring']) if (!Array.isArray(S[k])) S[k] = [];
  if (!S.budgets) S.budgets = {};
  if (!S.settings) S.settings = { lastBackup: null };
}

const acc = id => S.accounts.find(a => a.id === id);
const cat = id => S.categories.find(c => c.id === id);
const loan = id => S.loans.find(l => l.id === id);
const rec = id => S.recurring.find(r => r.id === id);
const topCat = id => { const c = cat(id); return c && c.parent ? cat(c.parent) : c; };
const catName = id => { const c = cat(id); if (!c) return 'Uncategorized'; const p = c.parent && cat(c.parent); return p ? `${p.name} › ${c.name}` : c.name; };
const catIcon = id => topCat(id)?.icon || '•';
const activeAccounts = () => S.accounts.filter(a => !a.archived);
const ACC_ICON = { cash: '💶', bank: '🏦', card: '💳', savings: '🐷' };

const sortedTx = () => [...S.transactions].sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
const lastAccountId = () => sortedTx().find(t => acc(t.accountId) && !acc(t.accountId).archived)?.accountId || activeAccounts()[0]?.id || '';

function accountBalance(id) {
  let b = acc(id)?.opening || 0;
  for (const t of S.transactions) {
    if (t.type === 'income' && t.accountId === id) b += t.amount;
    else if (t.type === 'expense' && t.accountId === id) b -= t.amount;
    else if (t.type === 'transfer') { if (t.accountId === id) b -= t.amount; if (t.toAccountId === id) b += t.amount; }
    else if (t.type === 'loan' && t.accountId === id) b += t.flow === 'in' ? t.amount : -t.amount;
  }
  return b;
}
/* Cash-flow sign of a transaction (for daily totals) */
const txSigned = t => t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount
  : t.type === 'loan' ? (t.flow === 'in' ? t.amount : -t.amount) : 0;

/* Income & expenses of a month. Transfers and loan principal are NOT income/expense; loan interest is. */
function monthStats(ym) {
  let income = 0, expense = 0;
  const byCat = {}, byInc = {};
  for (const t of S.transactions) {
    if (!t.date.startsWith(ym)) continue;
    if (t.type === 'income') { income += t.amount; const k = topCat(t.categoryId)?.id || 'none'; byInc[k] = (byInc[k] || 0) + t.amount; }
    else if (t.type === 'expense') { expense += t.amount; const k = topCat(t.categoryId)?.id || 'none'; byCat[k] = (byCat[k] || 0) + t.amount; }
    else if (t.type === 'loan' && t.interest) {
      if (t.flow === 'out') { expense += t.interest; byCat.interest = (byCat.interest || 0) + t.interest; }
      else { income += t.interest; byInc.interest = (byInc.interest || 0) + t.interest; }
    }
  }
  return { income, expense, net: income - expense, byCat, byInc };
}
const statLabel = (k, type) => k === 'interest' ? (type === 'expense' ? '🏦 Loan interest' : '🏦 Loan interest received')
  : k === 'none' ? '• Uncategorized' : `${cat(k)?.icon || ''} ${cat(k)?.name || '?'}`;

/* Loans */
const loanFlow = l => l.direction === 'borrowed' ? 'out' : 'in'; // direction of repayments
const loanTxs = l => S.transactions.filter(t => t.type === 'loan' && t.loanId === l.id);
const loanPaid = l => loanTxs(l).filter(t => !t.initial && t.flow === loanFlow(l)).reduce((s, t) => s + t.amount - (t.interest || 0), 0);
const loanRemaining = l => Math.max(0, l.principal - loanPaid(l));
function loanTxTitle(t, l) {
  if (!l) return 'Loan';
  if (t.initial) return l.direction === 'borrowed' ? `Loan from ${l.person}` : `Lent to ${l.person}`;
  return l.direction === 'borrowed' ? `Repayment to ${l.person}` : `Repayment from ${l.person}`;
}

/* Recurring bills */
function nextOcc(r) {
  switch (r.freq) {
    case 'weekly': return addDays(r.nextDate, 7);
    case 'quarterly': return addMonths(r.nextDate, 3, r.day);
    case 'yearly': return addMonths(r.nextDate, 12, r.day);
    default: return addMonths(r.nextDate, 1, r.day);
  }
}
const FREQ = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Every 3 months', yearly: 'Yearly' };
const perMonth = r => r.freq === 'weekly' ? r.amount * 52 / 12 : r.freq === 'quarterly' ? r.amount / 3 : r.freq === 'yearly' ? r.amount / 12 : r.amount;

function processRecurring() {
  const td = today();
  let added = 0;
  for (const r of S.recurring) {
    if (!r.active || !r.autoAdd) continue;
    let guard = 0;
    while (r.nextDate <= td && guard++ < 200) {
      S.transactions.push({ id: uid(), type: r.type, amount: r.amount, date: r.nextDate, accountId: r.accountId,
        categoryId: r.categoryId, note: r.name, recurringId: r.id, created: Date.now() });
      r.nextDate = nextOcc(r);
      added++;
    }
  }
  return added;
}

/* Things due in the next `horizon` days (manual bills + loan installments) */
function dueItems(horizon = 7) {
  const td = today(), lim = addDays(td, horizon), out = [];
  for (const r of S.recurring) {
    if (r.active && !r.autoAdd && r.nextDate <= lim) out.push({ kind: 'bill', id: r.id, name: r.name, amount: r.amount, date: r.nextDate, type: r.type, icon: catIcon(r.categoryId) });
  }
  const ym = td.slice(0, 7), [y, m] = ym.split('-').map(Number);
  for (const l of S.loans) {
    if (l.closed || !l.dueDay || loanRemaining(l) <= 0) continue;
    const dd = iso(new Date(y, m - 1, Math.min(l.dueDay, daysInMonth(y, m - 1))));
    if (l.startDate && dd <= l.startDate) continue;
    const paid = loanTxs(l).some(t => !t.initial && t.flow === loanFlow(l) && t.date.startsWith(ym));
    if (!paid && dd <= lim) out.push({ kind: 'loan', id: l.id, name: l.direction === 'borrowed' ? `Loan payment · ${l.person}` : `Expected from ${l.person}`,
      amount: l.monthlyPayment || 0, date: dd, type: l.direction === 'borrowed' ? 'expense' : 'income', icon: '🤝' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* Budgets */
function budgetRows(ym) {
  const st = monthStats(ym);
  return Object.entries(S.budgets).filter(([id, b]) => b > 0 && cat(id)).map(([id, b]) => {
    const spent = st.byCat[id] || 0;
    return { id, budget: b, spent, pct: Math.round(spent / b * 100) };
  });
}
const barCls = pct => pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';

/* ================= Rendering ================= */
let view = 'home', viewArg = null;
const PARENT = { loans: 'more', loan: 'loans', recurring: 'more', budgets: 'more', accounts: 'more', categories: 'more', backup: 'more' };
const TAB = v => PARENT[v] ? 'more' : v;

function go(v, arg = null) { view = v; viewArg = arg; render(); window.scrollTo(0, 0); }
function render() {
  const out = VIEWS[view](viewArg);
  $('#title').textContent = out.title;
  $('#back').hidden = !PARENT[view];
  const a = $('#hdrAction');
  a.hidden = !out.action;
  if (out.action) { a.textContent = out.action.label; a.dataset.act = out.action.act; a.dataset.id = out.action.id || ''; }
  $('#main').innerHTML = out.html;
  $$('nav.bottom [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === TAB(view)));
  out.after?.();
}

function txRow(t, showDate = false) {
  const a = acc(t.accountId);
  let icon, title, sub, cls = '', sign = '';
  if (t.type === 'transfer') {
    icon = '🔁'; title = t.note || 'Transfer'; sub = `${a?.name || '?'} → ${acc(t.toAccountId)?.name || '?'}`;
  } else if (t.type === 'loan') {
    const l = loan(t.loanId);
    icon = '🤝'; title = loanTxTitle(t, l); sub = (t.note ? t.note + ' · ' : '') + (a?.name || '');
    if (t.interest) sub += ` · interest ${fm(t.interest)}`;
    cls = t.flow === 'in' ? 'pos' : ''; sign = t.flow === 'in' ? '+' : '−';
  } else {
    icon = catIcon(t.categoryId); title = t.note || catName(t.categoryId);
    sub = (t.note ? catName(t.categoryId) + ' · ' : '') + (a?.name || '');
    if (t.odometer) sub += ` · ${t.odometer.toLocaleString('de-DE')} km`;
    cls = t.type === 'income' ? 'pos' : ''; sign = t.type === 'income' ? '+' : '−';
  }
  if (showDate) sub = fmtDay(t.date) + ' · ' + sub;
  return `<div class="item" data-act="editTx" data-id="${t.id}"><div class="ic">${icon}</div>
    <div class="grow"><div class="t1">${esc(title)}</div><div class="t2">${esc(sub)}</div></div>
    <div class="amt ${cls}">${sign}${fm(t.amount)}</div></div>`;
}
const statsHtml = st => `<div class="stats">
  <div class="stat"><div class="l">Income</div><div class="v pos">${fm(st.income)}</div></div>
  <div class="stat"><div class="l">Spent</div><div class="v">${fm(st.expense)}</div></div>
  <div class="stat"><div class="l">Left</div><div class="v ${st.net < 0 ? 'neg' : ''}">${fm(st.net)}</div></div></div>`;

const VIEWS = {
  home() {
    const ym = curYM(), st = monthStats(ym), accs = activeAccounts();
    const total = accs.reduce((s, a) => s + accountBalance(a.id), 0);
    const due = dueItems(7);
    const openLoans = S.loans.filter(l => !l.closed);
    const owe = openLoans.filter(l => l.direction === 'borrowed').reduce((s, l) => s + loanRemaining(l), 0);
    const owed = openLoans.filter(l => l.direction === 'lent').reduce((s, l) => s + loanRemaining(l), 0);
    const warn = budgetRows(ym).filter(b => b.pct >= 80);
    const recent = sortedTx().slice(0, 8);
    const lb = S.settings.lastBackup;
    let h = '';

    if (!S.transactions.length) {
      h += `<div class="card notice" data-act="newTx">👋 <b>Welcome!</b> Tap <b>＋</b> to add your first expense or income.
        You can set your account balances under <b>More › Accounts</b>.</div>`;
    } else if (S.transactions.length >= 5 && (!lb || daysBetween(lb, today()) > 14)) {
      h += `<div class="card notice" data-act="go" data-v="backup">💾 ${lb ? `Last backup was ${daysBetween(lb, today())} days ago.` : 'You have no backup yet.'} Tap to back up your data.</div>`;
    }

    h += `<div class="card tap" data-act="go" data-v="accounts"><h2>Total balance</h2><div class="big ${total < 0 ? 'neg' : ''}">${fm(total)}</div>
      <div class="pills">${accs.map(a => `<span class="pill">${ACC_ICON[a.type] || ''} ${esc(a.name)}: <b>${fm(accountBalance(a.id))}</b></span>`).join('')}</div></div>`;

    h += `<div class="card tap" data-act="go" data-v="reports"><h2>${monthLabel(ym)} <span class="link">Report ›</span></h2>${statsHtml(st)}</div>`;

    if (due.length) {
      h += `<div class="card"><h2>Due soon</h2><div class="list">${due.map(d => {
        const diff = daysBetween(today(), d.date);
        const when = diff < 0 ? `<span class="badge red">${-diff}d overdue</span>` : diff === 0 ? '<span class="badge red">today</span>' : `in ${diff} day${diff > 1 ? 's' : ''} · ${fmtDate(d.date)}`;
        return `<div class="item" data-act="payDue" data-kind="${d.kind}" data-id="${d.id}"><div class="ic">${d.icon}</div>
          <div class="grow"><div class="t1">${esc(d.name)}</div><div class="t2">${when}</div></div>
          <div class="amt ${d.type === 'income' ? 'pos' : ''}">${d.amount ? fm(d.amount) : ''}</div>
          ${d.kind === 'bill' ? `<button class="link" data-act="skipDue" data-id="${d.id}">Skip</button>` : ''}
          <button class="link strong" data-act="payDue" data-kind="${d.kind}" data-id="${d.id}">${d.type === 'income' ? 'Got it' : 'Paid'}</button></div>`;
      }).join('')}</div></div>`;
    }

    if (warn.length) {
      h += `<div class="card warn-card tap" data-act="go" data-v="budgets"><h2>Budget alerts</h2>${warn.map(b =>
        `<div style="margin:8px 0"><div class="row between"><span>${cat(b.id).icon} ${esc(cat(b.id).name)}</span>
         <span class="${b.pct >= 100 ? 'neg' : 'warn'}">${fm(b.spent)} / ${fm(b.budget)}</span></div>
         <div class="bar"><i class="${barCls(b.pct)}" style="width:${Math.min(100, b.pct)}%"></i></div></div>`).join('')}</div>`;
    }

    if (openLoans.length) {
      h += `<div class="card tap" data-act="go" data-v="loans"><h2>Loans <span class="link">Open ›</span></h2><div class="two">
        <div class="stat"><div class="l">I owe</div><div class="v ${owe ? 'neg' : ''}">${fm(owe)}</div></div>
        <div class="stat"><div class="l">Owed to me</div><div class="v ${owed ? 'pos' : ''}">${fm(owed)}</div></div></div></div>`;
    }

    if (recent.length) {
      h += `<div class="card"><h2>Recent <button class="link" data-act="go" data-v="history">See all ›</button></h2>
        <div class="list">${recent.map(t => txRow(t, true)).join('')}</div></div>`;
    }
    return { title: 'My Money', html: h };
  },

  history() {
    const months = [...new Set(S.transactions.map(t => t.date.slice(0, 7)))].sort().reverse();
    const types = [['all', 'All types'], ['expense', 'Expenses'], ['income', 'Income'], ['transfer', 'Transfers'], ['loan', 'Loans']];
    return {
      title: 'History',
      html: `<div class="filters">
        <input id="hq" type="search" placeholder="Search note, category, amount…" value="${esc(hist.q)}" autocomplete="off">
        <div class="row gap">
          <select id="hm"><option value="all">All months</option>${months.map(m => `<option value="${m}" ${hist.month === m ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}</select>
          <select id="ht">${types.map(([v, l]) => `<option value="${v}" ${hist.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div></div><div id="histList">${histList()}</div>`,
    };
  },

  reports(ym) {
    ym = ym || curYM();
    const st = monthStats(ym);
    const rate = st.income > 0 ? Math.round(st.net / st.income * 100) : null;
    const exp = Object.entries(st.byCat).sort((a, b) => b[1] - a[1]);
    const inc = Object.entries(st.byInc).sort((a, b) => b[1] - a[1]);
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(ym, i - 5));
    const ms = months.map(m => ({ m, ...monthStats(m) }));
    const max = Math.max(1, ...ms.flatMap(x => [x.income, x.expense]));

    let h = `<div class="monthnav"><button data-act="repMonth" data-n="-1" aria-label="Previous month">‹</button><b>${monthLabel(ym)}</b>
      <button data-act="repMonth" data-n="1" aria-label="Next month">›</button></div>`;
    h += `<div class="card">${statsHtml(st)}${rate !== null ? `<div class="hint">You saved <b class="${rate < 0 ? 'neg' : 'pos'}">${rate}%</b> of your income this month.</div>` : ''}</div>`;

    h += `<div class="card"><h2>Spending by category</h2>${exp.length ? exp.map(([k, v]) => {
      const pct = st.expense ? Math.round(v / st.expense * 100) : 0;
      const open = expanded.has(k);
      let subs = '';
      if (open && k !== 'interest' && k !== 'none') {
        const bySub = {};
        for (const t of S.transactions) if (t.type === 'expense' && t.date.startsWith(ym) && topCat(t.categoryId)?.id === k) bySub[t.categoryId] = (bySub[t.categoryId] || 0) + t.amount;
        subs = `<div class="subrows">${Object.entries(bySub).sort((a, b) => b[1] - a[1]).map(([id, a]) =>
          `<div class="row between"><span>${esc(cat(id)?.parent ? cat(id).name : '(general)')}</span><span>${fm(a)}</span></div>`).join('')}</div>`;
      }
      const budget = S.budgets[k];
      return `<div style="margin:10px 0" data-act="toggleCat" data-id="${k}" class="tap"><div class="row between"><span>${esc(statLabel(k, 'expense'))} <span class="t2">${pct}%</span></span>
        <b>${fm(v)}</b></div><div class="bar"><i style="width:${pct}%"></i></div>
        ${budget ? `<div class="t2">Budget ${fm(budget)} · ${v > budget ? `<span class="neg">${fm(v - budget)} over</span>` : `${fm(budget - v)} left`}</div>` : ''}${subs}</div>`;
    }).join('') : '<div class="t2">No expenses this month.</div>'}</div>`;

    h += `<div class="card"><h2>Income by source</h2>${inc.length ? inc.map(([k, v]) =>
      `<div class="row between" style="margin:8px 0"><span>${esc(statLabel(k, 'income'))}</span><b class="pos">${fm(v)}</b></div>`).join('')
      : '<div class="t2">No income this month.</div>'}</div>`;

    h += `<div class="card"><h2>Last 6 months</h2><div class="trend">${ms.map(x => `<div class="col ${x.m === ym ? 'cur' : ''}" data-act="go" data-v="reports" data-id="${x.m}">
        <div class="bars"><i class="in" style="height:${x.income / max * 100}%"></i><i class="out" style="height:${x.expense / max * 100}%"></i></div>
        <div class="lbl">${monthShort(x.m)}</div></div>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--green)"></i>Income</span><span><i style="background:var(--red)"></i>Spent</span></div>
      <div class="list mt">${ms.slice().reverse().map(x => `<div class="row between t2" style="padding:3px 0"><span>${monthLabel(x.m)}</span>
        <span class="${x.net < 0 ? 'neg' : x.net > 0 ? 'pos' : ''}">${x.net > 0 ? '+' : ''}${fm(x.net)}</span></div>`).join('')}</div></div>`;
    return { title: 'Reports', html: h };
  },

  more() {
    const openLoans = S.loans.filter(l => !l.closed).length;
    const items = [
      ['loans', '🤝', 'Loans & debts', openLoans ? `${openLoans} open` : 'Money you owe or lent'],
      ['recurring', '🔁', 'Bills & recurring', `${S.recurring.filter(r => r.active).length} active`],
      ['budgets', '🎯', 'Budgets', 'Monthly limits per category'],
      ['accounts', '🏦', 'Accounts', 'Cash, bank, cards'],
      ['categories', '🏷️', 'Categories', 'Edit or add categories'],
      ['backup', '💾', 'Backup & data', S.settings.lastBackup ? `Last backup ${fmtDate(S.settings.lastBackup)}` : 'No backup yet'],
    ];
    return {
      title: 'More',
      html: `<div class="card list menu">${items.map(([v, i, t, s]) => `<div class="item" data-act="go" data-v="${v}"><div class="ic">${i}</div>
        <div class="grow"><div class="t1">${t}</div><div class="t2">${esc(s)}</div></div><span class="chev">›</span></div>`).join('')}</div>
        <p class="hint" style="text-align:center">All data is stored only on this iPhone.<br>Back up regularly.</p>`,
    };
  },

  loans() {
    const open = S.loans.filter(l => !l.closed), closed = S.loans.filter(l => l.closed);
    const owe = open.filter(l => l.direction === 'borrowed').reduce((s, l) => s + loanRemaining(l), 0);
    const owed = open.filter(l => l.direction === 'lent').reduce((s, l) => s + loanRemaining(l), 0);
    const row = l => {
      const rem = loanRemaining(l), pct = l.principal ? Math.round((l.principal - rem) / l.principal * 100) : 0;
      return `<div class="item" data-act="go" data-v="loan" data-id="${l.id}" style="display:block">
        <div class="row"><div class="ic">${l.direction === 'borrowed' ? '📥' : '📤'}</div><div class="grow">
        <div class="t1">${esc(l.person)} ${rem <= 0 ? '<span class="badge green">paid off</span>' : ''}</div>
        <div class="t2">${l.direction === 'borrowed' ? 'I borrowed' : 'I lent'} ${fm(l.principal)} · ${fmtDate(l.startDate)}</div></div>
        <div class="amt ${l.direction === 'borrowed' ? 'neg' : 'pos'}">${fm(rem)}</div></div>
        <div class="bar"><i class="good" style="width:${pct}%"></i></div></div>`;
    };
    let h = `<div class="card"><div class="two"><div class="stat"><div class="l">I owe</div><div class="v ${owe ? 'neg' : ''}">${fm(owe)}</div></div>
      <div class="stat"><div class="l">Owed to me</div><div class="v ${owed ? 'pos' : ''}">${fm(owed)}</div></div></div></div>`;
    h += open.length ? `<div class="card list">${open.map(row).join('')}</div>` : `<div class="empty">No open loans.<br>Tap <b>+ New</b> to add a bank loan or money you lent to someone.</div>`;
    if (closed.length) h += `<div class="day"><span>Closed</span></div><div class="card list">${closed.map(row).join('')}</div>`;
    return { title: 'Loans & debts', html: h, action: { label: '+ New', act: 'newLoan' } };
  },

  loan(id) {
    const l = loan(id);
    if (!l) return VIEWS.loans();
    const rem = loanRemaining(l), paid = loanPaid(l);
    const pct = l.principal ? Math.round(paid / l.principal * 100) : 0;
    const txs = loanTxs(l).sort((a, b) => b.date.localeCompare(a.date));
    const interest = txs.reduce((s, t) => s + (t.interest || 0), 0);
    const info = [
      ['Type', l.direction === 'borrowed' ? 'I borrowed (I owe)' : 'I lent (owed to me)'],
      ['Amount', fm(l.principal)], ['Start date', fmtDate(l.startDate)],
      l.monthlyPayment ? ['Monthly payment', fm(l.monthlyPayment)] : null,
      l.dueDay ? ['Due day', `${l.dueDay}. of each month`] : null,
      l.rate ? ['Interest rate', `${String(l.rate).replace('.', ',')} %`] : null,
      interest ? ['Interest paid so far', fm(interest)] : null,
      l.monthlyPayment && rem > 0 ? ['Payments left (approx.)', String(Math.ceil(rem / l.monthlyPayment))] : null,
      l.note ? ['Note', esc(l.note)] : null,
    ].filter(Boolean);
    let h = `<div class="card"><h2>${esc(l.person)} ${l.closed ? '<span class="badge">closed</span>' : ''}</h2>
      <div class="t2">Remaining</div><div class="big ${l.direction === 'borrowed' ? 'neg' : 'pos'}">${fm(rem)}</div>
      <div class="bar"><i class="good" style="width:${pct}%"></i></div><div class="t2 mt">${fm(paid)} repaid (${pct}%)</div></div>`;
    h += `<div class="btns"><button class="btn primary" data-act="loanPay" data-id="${l.id}">${l.direction === 'borrowed' ? 'Record payment' : 'Record repayment'}</button>
      <button class="btn" data-act="editLoan" data-id="${l.id}">Edit loan</button></div>`;
    h += `<div class="card">${info.map(([k, v]) => `<div class="row between" style="padding:4px 0"><span class="t2">${k}</span><span>${v}</span></div>`).join('')}</div>`;
    h += `<div class="card"><h2>History</h2>${txs.length ? `<div class="list">${txs.map(t => txRow(t, true)).join('')}</div>` : '<div class="t2">No payments yet.</div>'}</div>`;
    return { title: 'Loan', html: h };
  },

  recurring() {
    const act = S.recurring.filter(r => r.active).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    const off = S.recurring.filter(r => !r.active);
    const fixedOut = act.filter(r => r.type === 'expense').reduce((s, r) => s + perMonth(r), 0);
    const fixedIn = act.filter(r => r.type === 'income').reduce((s, r) => s + perMonth(r), 0);
    const row = r => `<div class="item ${r.active ? '' : 'dim'}" data-act="editRec" data-id="${r.id}"><div class="ic">${catIcon(r.categoryId)}</div>
      <div class="grow"><div class="t1">${esc(r.name)}</div><div class="t2">${FREQ[r.freq]} · next ${fmtDate(r.nextDate)} · ${r.autoAdd ? 'auto-add' : 'remind me'}</div></div>
      <div class="amt ${r.type === 'income' ? 'pos' : ''}">${fm(r.amount)}</div></div>`;
    let h = `<div class="card"><div class="two"><div class="stat"><div class="l">Fixed costs / month</div><div class="v">${fm(Math.round(fixedOut))}</div></div>
      <div class="stat"><div class="l">Regular income / month</div><div class="v pos">${fm(Math.round(fixedIn))}</div></div></div></div>`;
    h += act.length ? `<div class="card list">${act.map(row).join('')}</div>`
      : `<div class="empty">No recurring items yet.<br>Add rent, phone, insurance, subscriptions, salary… They will be added automatically or remind you when due.</div>`;
    if (off.length) h += `<div class="day"><span>Paused</span></div><div class="card list">${off.map(row).join('')}</div>`;
    return { title: 'Bills & recurring', html: h, action: { label: '+ New', act: 'newRec' } };
  },

  budgets() {
    const ym = curYM(), st = monthStats(ym);
    const tops = S.categories.filter(c => c.type === 'expense' && !c.parent);
    const totalB = tops.reduce((s, c) => s + (S.budgets[c.id] || 0), 0);
    const totalS = tops.reduce((s, c) => s + (S.budgets[c.id] ? st.byCat[c.id] || 0 : 0), 0);
    let h = `<p class="hint">Set a monthly limit for any category (leave empty for none). Progress shows ${monthLabel(ym)}.</p>`;
    if (totalB) h += `<div class="card"><h2>Total budgeted</h2><div class="row between"><b>${fm(totalS)} of ${fm(totalB)}</b><span class="t2">${Math.round(totalS / totalB * 100)}%</span></div>
      <div class="bar"><i class="${barCls(totalS / totalB * 100)}" style="width:${Math.min(100, totalS / totalB * 100)}%"></i></div></div>`;
    h += `<div class="card">${tops.map(c => {
      const b = S.budgets[c.id] || 0, sp = st.byCat[c.id] || 0, pct = b ? sp / b * 100 : 0;
      return `<div style="margin:10px 0"><div class="row between"><span>${c.icon} ${esc(c.name)}</span>
        <input class="budget-in" data-budget="${c.id}" inputmode="decimal" placeholder="no limit" value="${b ? centsToInput(b) : ''}"></div>
        <div class="t2">Spent ${fm(sp)}${b ? ` · ${sp > b ? `<span class="neg">${fm(sp - b)} over</span>` : `${fm(b - sp)} left`}` : ''}</div>
        ${b ? `<div class="bar"><i class="${barCls(pct)}" style="width:${Math.min(100, pct)}%"></i></div>` : ''}</div>`;
    }).join('')}</div>`;
    return { title: 'Budgets', html: h };
  },

  accounts() {
    const total = activeAccounts().reduce((s, a) => s + accountBalance(a.id), 0);
    const row = a => `<div class="item ${a.archived ? 'dim' : ''}" data-act="editAcc" data-id="${a.id}"><div class="ic">${ACC_ICON[a.type] || '💰'}</div>
      <div class="grow"><div class="t1">${esc(a.name)}</div><div class="t2">${{ cash: 'Cash', bank: 'Bank account', card: 'Credit card', savings: 'Savings' }[a.type] || ''}${a.archived ? ' · archived' : ''}</div></div>
      <div class="amt ${accountBalance(a.id) < 0 ? 'neg' : ''}">${fm(accountBalance(a.id))}</div></div>`;
    return {
      title: 'Accounts', action: { label: '+ New', act: 'newAcc' },
      html: `<div class="card"><h2>Total</h2><div class="big">${fm(total)}</div></div>
        <div class="card list">${S.accounts.map(row).join('')}</div>
        <p class="hint">Tip: set each account's <b>starting balance</b> to what your bank shows today, so balances match reality.</p>`,
    };
  },

  categories() {
    const tops = S.categories.filter(c => c.type === catTab && !c.parent);
    return {
      title: 'Categories', action: { label: '+ New', act: 'newCat' },
      html: `<div class="seg"><button class="${catTab === 'expense' ? 'on' : ''}" data-act="catTab" data-type="expense">Expenses</button>
        <button class="${catTab === 'income' ? 'on' : ''}" data-act="catTab" data-type="income">Income</button></div>
        ${tops.map(c => {
          const subs = S.categories.filter(s => s.parent === c.id);
          return `<div class="card list"><div class="item" data-act="editCat" data-id="${c.id}"><div class="ic">${c.icon}</div>
            <div class="grow"><div class="t1">${esc(c.name)}</div>${c.odo ? '<div class="t2">asks for odometer</div>' : ''}</div><span class="chev t2">Edit</span></div>
            ${subs.map(s => `<div class="item" data-act="editCat" data-id="${s.id}" style="padding-left:50px"><div class="grow">${esc(s.name)}</div></div>`).join('')}
            <div class="item" data-act="newCat" data-parent="${c.id}" style="padding-left:50px"><span class="link" style="padding:0">+ Add subcategory</span></div></div>`;
        }).join('')}`,
    };
  },

  backup() {
    const lb = S.settings.lastBackup;
    return {
      title: 'Backup & data',
      html: `<div class="card"><h2>Your data</h2>
        <div class="row between"><span class="t2">Transactions</span><b>${S.transactions.length}</b></div>
        <div class="row between"><span class="t2">Last backup</span><b>${lb ? fmtDate(lb) : 'never'}</b></div>
        <div class="row between"><span class="t2">Protected from deletion</span><b id="persisted">…</b></div></div>
        <div class="card"><h2>Backup</h2><p class="hint" style="margin-top:0">Saves a file with all your data. Choose <b>“Save to Files”</b> (e.g. iCloud Drive) in the share menu.
          Do this every week or two — if you delete the app or lose your phone, a backup is the only way to get your data back.</p>
          <button class="btn primary" data-act="exportJSON">💾 Back up now</button>
          <button class="btn" data-act="importJSON">📂 Restore from backup</button></div>
        <div class="card"><h2>Export</h2><p class="hint" style="margin-top:0">CSV file for Excel / Numbers (German format: ; and decimal comma).</p>
          <button class="btn" data-act="exportCSV">📄 Export transactions (CSV)</button></div>
        <div class="card"><h2>Danger zone</h2><button class="btn danger" data-act="eraseAll">Erase all data</button></div>`,
      after: async () => {
        let p = false;
        try { p = await navigator.storage?.persisted?.(); } catch { }
        const el = $('#persisted'); if (el) el.textContent = p ? 'yes' : 'not confirmed';
      },
    };
  },
};

/* History list (re-rendered on filter change without losing input focus) */
const hist = { q: '', month: 'all', type: 'all' };
const txSearchText = t => [t.note, t.type === 'loan' ? loanTxTitle(t, loan(t.loanId)) : catName(t.categoryId), acc(t.accountId)?.name,
  acc(t.toAccountId)?.name, centsToInput(t.amount), fm(t.amount), fmtDate(t.date)].join(' ').toLowerCase();
function histList() {
  const q = hist.q.trim().toLowerCase();
  const list = sortedTx().filter(t => (hist.month === 'all' || t.date.startsWith(hist.month)) && (hist.type === 'all' || t.type === hist.type) && (!q || txSearchText(t).includes(q)));
  if (!list.length) return `<div class="empty">${S.transactions.length ? 'Nothing matches your filters.' : 'No transactions yet — tap ＋ to add one.'}</div>`;
  const inc = list.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const exp = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  let h = `<div class="card"><div class="stats"><div class="stat"><div class="l">${list.length} items</div><div class="v"></div></div>
    <div class="stat"><div class="l">Income</div><div class="v pos">${fm(inc)}</div></div><div class="stat"><div class="l">Spent</div><div class="v">${fm(exp)}</div></div></div></div>`;
  const groups = new Map();
  for (const t of list.slice(0, 600)) { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); }
  for (const [d, ts] of groups) {
    const net = ts.reduce((s, t) => s + txSigned(t), 0);
    h += `<div class="day"><span>${fmtDay(d)}${daysBetween(d, today()) > 1 ? ' · ' + fmtDate(d) : ''}</span><span>${net ? fm(net) : ''}</span></div>
      <div class="card list tight">${ts.map(t => txRow(t)).join('')}</div>`;
  }
  if (list.length > 600) h += '<p class="hint" style="text-align:center">Showing the newest 600 — use filters to see more.</p>';
  return h;
}

let catTab = 'expense';
const expanded = new Set();

/* ================= Sheets (forms) ================= */
let sheet = null;
function openSheet(build) {
  closeSheet();
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = '<div class="sheet"></div>';
  document.body.appendChild(bg);
  bg.addEventListener('click', e => { if (e.target === bg) closeSheet(); });
  sheet = { bg, el: bg.firstChild, actions: { close: closeSheet } };
  document.body.classList.add('noscroll');
  build(sheet);
}
function closeSheet() {
  if (!sheet) return;
  sheet.bg.remove(); sheet = null;
  document.body.classList.remove('noscroll');
}
const sheetHead = (title, save = 'Save') => `<div class="sheet-head"><button class="link" data-act="close">Cancel</button><b>${title}</b>
  <button class="link strong" data-act="save">${save}</button></div>`;
const val = id => $('#' + id, sheet.el)?.value ?? '';
const checked = id => !!$('#' + id, sheet.el)?.checked;
function accountOptions(selected, includeId) {
  return S.accounts.filter(a => !a.archived || a.id === selected || a.id === includeId)
    .map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${ACC_ICON[a.type] || ''} ${esc(a.name)}</option>`).join('');
}
function recentCats(type) {
  const seen = new Set(), out = [];
  for (const t of sortedTx()) {
    if (t.type !== type || !t.categoryId || seen.has(t.categoryId) || !cat(t.categoryId)) continue;
    seen.add(t.categoryId); out.push(t.categoryId);
    if (out.length >= 5) break;
  }
  return out;
}
function catPicker(type, selId, showRecent) {
  const tops = S.categories.filter(c => c.type === type && !c.parent);
  const selTop = selId ? topCat(selId) : null;
  const subs = selTop ? S.categories.filter(c => c.parent === selTop.id) : [];
  const recent = showRecent ? recentCats(type).filter(id => id !== selId) : [];
  return `${recent.length ? `<div class="mini">Recent</div><div class="chips">${recent.map(id =>
      `<button class="chip" data-act="pickCat" data-id="${id}">${catIcon(id)} ${esc(catName(id))}</button>`).join('')}</div><div class="mini">All</div>` : ''}
    <div class="chips">${tops.map(c => `<button class="chip ${selTop?.id === c.id ? 'on' : ''}" data-act="pickCat" data-id="${c.id}">${c.icon} ${esc(c.name)}</button>`).join('')}</div>
    ${subs.length ? `<div class="chips sub">${subs.map(c => `<button class="chip ${selId === c.id ? 'on' : ''}" data-act="pickCat" data-id="${c.id}">${esc(c.name)}</button>`).join('')}</div>` : ''}`;
}
function afterSave(msg = 'Saved') { persist(); closeSheet(); render(); toast(msg); }

/* ---- Transaction form ---- */
function openTxForm(t, pre = {}) {
  if (t?.type === 'loan') return openLoanPayment(loan(t.loanId), t);
  openSheet(sh => {
    const isEdit = !!t;
    const f = t ? { ...t, _amt: centsToInput(t.amount) }
      : { type: 'expense', _amt: '', date: today(), accountId: lastAccountId(), categoryId: null, note: '', ...pre };
    if (!f.toAccountId) f.toAccountId = activeAccounts().find(a => a.id !== f.accountId)?.id || '';
    const sync = () => {
      f._amt = val('fAmount'); f.accountId = val('fAcc'); f.date = val('fDate') || today(); f.note = val('fNote').trim();
      if ($('#fTo', sh.el)) f.toAccountId = val('fTo');
      if ($('#fOdo', sh.el)) f.odometer = val('fOdo') ? Number(val('fOdo').replace(/\D/g, '')) : null;
    };
    const draw = () => {
      const isT = f.type === 'transfer', odo = !isT && topCat(f.categoryId)?.odo;
      sh.el.innerHTML = `${sheetHead(isEdit ? 'Edit' : 'New entry')}
        <div class="seg">${[['expense', 'Expense', 'exp'], ['income', 'Income', 'inc'], ['transfer', 'Transfer', '']].map(([v, l, c]) =>
          `<button class="${f.type === v ? 'on ' + c : ''}" data-act="setType" data-type="${v}">${l}</button>`).join('')}</div>
        <input id="fAmount" class="amount" inputmode="decimal" placeholder="0,00 €" value="${esc(f._amt)}" autocomplete="off">
        ${isT ? '' : `<label class="f">Category</label>${catPicker(f.type, f.categoryId, true)}`}
        ${isT ? `<div class="two"><div><label class="f">From</label><select id="fAcc">${accountOptions(f.accountId)}</select></div>
                 <div><label class="f">To</label><select id="fTo">${accountOptions(f.toAccountId)}</select></div></div>`
              : `<label class="f">Account</label><select id="fAcc">${accountOptions(f.accountId)}</select>`}
        <div class="${odo ? 'two' : ''}"><div><label class="f">Date</label><input id="fDate" type="date" value="${f.date}"></div>
        ${odo ? `<div><label class="f">Odometer (km)</label><input id="fOdo" inputmode="numeric" placeholder="optional" value="${f.odometer || ''}"></div>` : ''}</div>
        <label class="f">Note</label><input id="fNote" placeholder="${isT ? 'e.g. Cash withdrawal' : 'e.g. Rewe, Aral, Dr. Müller…'}" value="${esc(f.note)}" autocomplete="off">
        <button class="btn primary" data-act="save">Save</button>
        ${isEdit ? '<button class="btn danger" data-act="del">Delete</button>' : ''}`;
    };
    sh.actions.setType = el => { sync(); if (f.type !== el.dataset.type) { f.type = el.dataset.type; f.categoryId = null; } draw(); };
    sh.actions.pickCat = el => { sync(); f.categoryId = el.dataset.id; draw(); };
    sh.actions.save = () => {
      sync();
      const amount = parseAmount(f._amt);
      if (!(amount > 0)) return toast('Please enter an amount');
      if (f.type !== 'transfer' && !f.categoryId) return toast('Please choose a category');
      if (!f.accountId) return toast('Please add an account first');
      if (f.type === 'transfer' && f.accountId === f.toAccountId) return toast('Choose two different accounts');
      const data = { type: f.type, amount, date: f.date, accountId: f.accountId, note: f.note };
      if (f.type === 'transfer') data.toAccountId = f.toAccountId; else data.categoryId = f.categoryId;
      if (f.type !== 'transfer' && topCat(f.categoryId)?.odo && f.odometer) data.odometer = f.odometer;
      if (isEdit) {
        delete t.toAccountId; delete t.categoryId; delete t.odometer;
        Object.assign(t, data);
      } else {
        S.transactions.push({ id: uid(), created: Date.now(), ...data, ...(f.recurringId ? { recurringId: f.recurringId } : {}) });
        const r = f.recurringId && rec(f.recurringId);
        if (r) r.nextDate = nextOcc(r);
      }
      afterSave(isEdit ? 'Updated' : 'Saved ✓');
    };
    sh.actions.del = () => {
      if (!confirm('Delete this entry?')) return;
      S.transactions = S.transactions.filter(x => x.id !== t.id);
      afterSave('Deleted');
    };
    draw();
    if (!isEdit && !f._amt) $('#fAmount', sh.el).focus();
  });
}

/* ---- Loan form ---- */
function openLoanForm(l) {
  openSheet(sh => {
    const isEdit = !!l;
    const f = l ? { ...l, _amt: centsToInput(l.principal), _mp: l.monthlyPayment ? centsToInput(l.monthlyPayment) : '' }
      : { direction: 'borrowed', person: '', _amt: '', startDate: today(), _mp: '', dueDay: '', rate: '', note: '', record: true, accountId: lastAccountId() };
    const sync = () => {
      f.person = val('lPerson').trim(); f._amt = val('lAmt'); f.startDate = val('lStart') || today(); f._mp = val('lMp');
      f.dueDay = val('lDue'); f.rate = val('lRate'); f.note = val('lNote').trim();
      if ($('#lRec', sh.el)) { f.record = checked('lRec'); f.accountId = val('lAcc'); }
      if ($('#lClosed', sh.el)) f.closed = checked('lClosed');
    };
    const draw = () => {
      const b = f.direction === 'borrowed';
      sh.el.innerHTML = `${sheetHead(isEdit ? 'Edit loan' : 'New loan')}
        <div class="seg"><button class="${b ? 'on exp' : ''}" data-act="setDir" data-d="borrowed">I borrowed</button>
          <button class="${!b ? 'on inc' : ''}" data-act="setDir" data-d="lent">I lent</button></div>
        <label class="f">${b ? 'Lender (bank or person)' : 'Borrower (who owes you)'}</label>
        <input id="lPerson" value="${esc(f.person)}" placeholder="${b ? 'e.g. Sparkasse, Ali' : 'e.g. Sara'}" autocomplete="off">
        <label class="f">Loan amount</label><input id="lAmt" class="amount" inputmode="decimal" placeholder="0,00 €" value="${esc(f._amt)}">
        <div class="hint">For bank loans, enter the amount still owed today if the loan started earlier.</div>
        <div class="two"><div><label class="f">Start date</label><input id="lStart" type="date" value="${f.startDate}"></div>
          <div><label class="f">Interest rate % (optional)</label><input id="lRate" inputmode="decimal" placeholder="e.g. 4,5" value="${esc(f.rate)}"></div></div>
        <div class="two"><div><label class="f">Monthly payment (optional)</label><input id="lMp" inputmode="decimal" placeholder="0,00" value="${esc(f._mp)}"></div>
          <div><label class="f">Due day of month</label><input id="lDue" inputmode="numeric" placeholder="e.g. 1" value="${esc(f.dueDay)}"></div></div>
        <div class="hint">With a due day you'll get a reminder on the home screen each month.</div>
        <label class="f">Note</label><input id="lNote" value="${esc(f.note)}" placeholder="optional">
        ${isEdit ? `<label class="check"><input type="checkbox" id="lClosed" ${f.closed ? 'checked' : ''}> Loan is closed / settled</label>`
          : `<label class="check"><input type="checkbox" id="lRec" ${f.record ? 'checked' : ''}> ${b ? 'I received this money into an account' : 'This money left one of my accounts'}</label>
             <select id="lAcc" style="margin-top:8px">${accountOptions(f.accountId)}</select>`}
        <button class="btn primary" data-act="save">Save</button>
        ${isEdit ? '<button class="btn danger" data-act="del">Delete loan</button>' : ''}`;
    };
    sh.actions.setDir = el => { sync(); f.direction = el.dataset.d; draw(); };
    sh.actions.save = () => {
      sync();
      const principal = parseAmount(f._amt);
      if (!f.person) return toast('Please enter a name');
      if (!(principal > 0)) return toast('Please enter the loan amount');
      const mp = parseAmount(f._mp), due = parseInt(f.dueDay, 10);
      const data = { direction: f.direction, person: f.person, principal, startDate: f.startDate,
        monthlyPayment: mp > 0 ? mp : null, dueDay: due >= 1 && due <= 31 ? due : null,
        rate: f.rate ? String(f.rate).replace(',', '.') : '', note: f.note };
      if (isEdit) {
        Object.assign(l, data, { closed: !!f.closed });
        afterSave('Loan updated');
      } else {
        const nl = { id: uid(), closed: false, ...data };
        S.loans.push(nl);
        if (f.record && f.accountId) S.transactions.push({ id: uid(), created: Date.now(), type: 'loan', loanId: nl.id, initial: true,
          flow: f.direction === 'borrowed' ? 'in' : 'out', amount: principal, accountId: f.accountId, date: f.startDate, note: '' });
        persist(); closeSheet(); go('loan', nl.id); toast('Loan added');
      }
    };
    sh.actions.del = () => {
      const n = loanTxs(l).length;
      if (!confirm(`Delete this loan${n ? ` and its ${n} payment record${n > 1 ? 's' : ''}` : ''}?`)) return;
      S.transactions = S.transactions.filter(t => t.loanId !== l.id);
      S.loans = S.loans.filter(x => x.id !== l.id);
      persist(); closeSheet(); go('loans'); toast('Loan deleted');
    };
    draw();
  });
}

/* ---- Loan payment form ---- */
function openLoanPayment(l, t) {
  if (!l) return toast('This loan no longer exists');
  openSheet(sh => {
    const isEdit = !!t, initial = !!t?.initial, b = l.direction === 'borrowed';
    const f = t ? { ...t, _amt: centsToInput(t.amount), _int: t.interest ? centsToInput(t.interest) : '' }
      : { _amt: l.monthlyPayment ? centsToInput(l.monthlyPayment) : '', _int: '', accountId: lastAccountId(), date: today(), note: '' };
    const title = initial ? (b ? `Loan from ${l.person}` : `Lent to ${l.person}`) : (b ? `Payment to ${l.person}` : `Repayment from ${l.person}`);
    sh.el.innerHTML = `${sheetHead(esc(title))}
      <input id="pAmt" class="amount" inputmode="decimal" placeholder="0,00 €" value="${esc(f._amt)}">
      <div class="hint" style="text-align:center">Remaining: ${fm(loanRemaining(l))}</div>
      ${initial ? '' : `<label class="f">Of which interest / fees (optional)</label><input id="pInt" inputmode="decimal" placeholder="0,00" value="${esc(f._int)}">
        <div class="hint">Only the part without interest reduces the remaining amount. Interest counts as an expense in reports.</div>`}
      <label class="f">${(initial ? !b : b) ? 'Paid from account' : 'Received into account'}</label><select id="pAcc">${accountOptions(f.accountId)}</select>
      <label class="f">Date</label><input id="pDate" type="date" value="${f.date}">
      <label class="f">Note</label><input id="pNote" value="${esc(f.note || '')}" placeholder="optional">
      <button class="btn primary" data-act="save">Save</button>
      ${isEdit ? '<button class="btn danger" data-act="del">Delete</button>' : ''}`;
    sh.actions.save = () => {
      const amount = parseAmount(val('pAmt'));
      const interest = initial ? 0 : (parseAmount(val('pInt')) || 0);
      if (!(amount > 0)) return toast('Please enter an amount');
      if (interest < 0 || interest > amount) return toast('Interest must be between 0 and the amount');
      const data = { amount, interest: interest || 0, accountId: val('pAcc'), date: val('pDate') || today(), note: val('pNote').trim() };
      if (isEdit) Object.assign(t, data);
      else S.transactions.push({ id: uid(), created: Date.now(), type: 'loan', loanId: l.id, flow: loanFlow(l), ...data });
      if (!isEdit && !l.closed && loanRemaining(l) <= 0 && confirm('🎉 This loan is fully repaid. Mark it as closed?')) l.closed = true;
      afterSave('Saved ✓');
    };
    sh.actions.del = () => {
      if (!confirm('Delete this payment?')) return;
      S.transactions = S.transactions.filter(x => x.id !== t.id);
      afterSave('Deleted');
    };
    if (!isEdit && !f._amt) $('#pAmt', sh.el).focus();
  });
}

/* ---- Recurring form ---- */
function openRecurringForm(r) {
  openSheet(sh => {
    const isEdit = !!r;
    const f = r ? { ...r, _amt: centsToInput(r.amount) }
      : { name: '', type: 'expense', _amt: '', categoryId: null, accountId: lastAccountId(), freq: 'monthly', nextDate: today(), autoAdd: false, active: true };
    const sync = () => {
      f.name = val('rName').trim(); f._amt = val('rAmt'); f.accountId = val('rAcc'); f.freq = val('rFreq');
      f.nextDate = val('rDate') || today(); f.autoAdd = checked('rAuto');
      if ($('#rActive', sh.el)) f.active = checked('rActive');
    };
    const draw = () => {
      sh.el.innerHTML = `${sheetHead(isEdit ? 'Edit recurring' : 'New recurring')}
        <div class="seg"><button class="${f.type === 'expense' ? 'on exp' : ''}" data-act="setType" data-type="expense">Bill / Expense</button>
          <button class="${f.type === 'income' ? 'on inc' : ''}" data-act="setType" data-type="income">Income</button></div>
        <label class="f">Name</label><input id="rName" value="${esc(f.name)}" placeholder="${f.type === 'expense' ? 'e.g. Rent, Vodafone, Netflix' : 'e.g. Salary'}" autocomplete="off">
        <label class="f">Amount</label><input id="rAmt" class="amount" style="margin-top:0" inputmode="decimal" placeholder="0,00 €" value="${esc(f._amt)}">
        <label class="f">Category</label>${catPicker(f.type, f.categoryId, false)}
        <label class="f">Account</label><select id="rAcc">${accountOptions(f.accountId)}</select>
        <div class="two"><div><label class="f">How often</label><select id="rFreq">${Object.entries(FREQ).map(([k, v]) => `<option value="${k}" ${f.freq === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div><label class="f">Next due date</label><input id="rDate" type="date" value="${f.nextDate}"></div></div>
        <label class="check"><input type="checkbox" id="rAuto" ${f.autoAdd ? 'checked' : ''}>
          <span>Add automatically on the due date<div class="hint" style="margin:2px 0 0">Good for fixed amounts (rent, salary). If off, it shows under “Due soon” and you confirm it.</div></span></label>
        ${isEdit ? `<label class="check"><input type="checkbox" id="rActive" ${f.active ? 'checked' : ''}> Active</label>` : ''}
        <button class="btn primary" data-act="save">Save</button>
        ${isEdit ? '<button class="btn danger" data-act="del">Delete</button>' : ''}`;
    };
    sh.actions.setType = el => { sync(); if (f.type !== el.dataset.type) { f.type = el.dataset.type; f.categoryId = null; } draw(); };
    sh.actions.pickCat = el => { sync(); f.categoryId = el.dataset.id; draw(); };
    sh.actions.save = () => {
      sync();
      const amount = parseAmount(f._amt);
      if (!f.name) return toast('Please enter a name');
      if (!(amount > 0)) return toast('Please enter an amount');
      if (!f.categoryId) return toast('Please choose a category');
      const data = { name: f.name, type: f.type, amount, categoryId: f.categoryId, accountId: f.accountId, freq: f.freq,
        nextDate: f.nextDate, day: parseISO(f.nextDate).getDate(), autoAdd: f.autoAdd, active: f.active };
      if (isEdit) Object.assign(r, data); else S.recurring.push({ id: uid(), ...data });
      const n = processRecurring();
      afterSave(n ? `Saved · ${n} past entr${n > 1 ? 'ies' : 'y'} added` : 'Saved ✓');
    };
    sh.actions.del = () => {
      if (!confirm('Delete this recurring item? (Past entries stay in your history.)')) return;
      S.recurring = S.recurring.filter(x => x.id !== r.id);
      afterSave('Deleted');
    };
    draw();
  });
}

/* ---- Account form ---- */
function openAccountForm(a) {
  openSheet(sh => {
    const isEdit = !!a;
    const types = { cash: 'Cash', bank: 'Bank account', card: 'Credit card', savings: 'Savings' };
    sh.el.innerHTML = `${sheetHead(isEdit ? 'Edit account' : 'New account')}
      <label class="f">Name</label><input id="aName" value="${esc(a?.name || '')}" placeholder="e.g. Sparkasse, N26, Visa" autocomplete="off">
      <label class="f">Type</label><select id="aType">${Object.entries(types).map(([k, v]) => `<option value="${k}" ${a?.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label class="f">Starting balance</label><input id="aOpen" inputmode="decimal" placeholder="0,00" value="${a?.opening ? centsToInput(a.opening) : ''}">
      <div class="hint">The balance before your first entry in this app. Use a minus (−) for credit card debt.</div>
      ${isEdit ? `<div class="hint">Current balance: <b>${fm(accountBalance(a.id))}</b></div>
        <label class="check"><input type="checkbox" id="aArch" ${a.archived ? 'checked' : ''}> Archived (hide from lists)</label>` : ''}
      <button class="btn primary" data-act="save">Save</button>
      ${isEdit ? '<button class="btn danger" data-act="del">Delete account</button>' : ''}`;
    sh.actions.save = () => {
      const name = val('aName').trim();
      if (!name) return toast('Please enter a name');
      const opening = val('aOpen').trim() ? parseAmount(val('aOpen')) : 0;
      if (Number.isNaN(opening)) return toast('Starting balance is not a valid number');
      const data = { name, type: val('aType'), opening };
      if (isEdit) Object.assign(a, data, { archived: checked('aArch') }); else S.accounts.push({ id: uid(), ...data });
      afterSave();
    };
    sh.actions.del = () => {
      const used = S.transactions.some(t => t.accountId === a.id || t.toAccountId === a.id) || S.recurring.some(r => r.accountId === a.id);
      if (used) return alert('This account has transactions or recurring items. Archive it instead, so your history stays correct.');
      if (!confirm('Delete this account?')) return;
      S.accounts = S.accounts.filter(x => x.id !== a.id);
      afterSave('Deleted');
    };
  });
}

/* ---- Category form ---- */
function openCategoryForm(c, parentId) {
  openSheet(sh => {
    const isEdit = !!c;
    const parent = cat(isEdit ? c.parent : parentId);
    const isTop = !parent;
    const type = isEdit ? c.type : parent ? parent.type : catTab;
    sh.el.innerHTML = `${sheetHead(isEdit ? 'Edit category' : parent ? `New in ${esc(parent.name)}` : 'New category')}
      <label class="f">Name</label><input id="cName" value="${esc(c?.name || '')}" autocomplete="off">
      ${isTop ? `<label class="f">Icon (an emoji)</label><input id="cIcon" value="${esc(c?.icon || '📁')}" maxlength="4">` : ''}
      ${isTop && type === 'expense' ? `<label class="check"><input type="checkbox" id="cOdo" ${c?.odo ? 'checked' : ''}> Ask for odometer (for vehicle costs)</label>` : ''}
      <button class="btn primary" data-act="save">Save</button>
      ${isEdit ? '<button class="btn danger" data-act="del">Delete</button>' : ''}`;
    sh.actions.save = () => {
      const name = val('cName').trim();
      if (!name) return toast('Please enter a name');
      const data = { name };
      if (isTop) { data.icon = val('cIcon').trim() || '📁'; data.odo = checked('cOdo'); }
      if (isEdit) Object.assign(c, data);
      else S.categories.push({ id: uid(), type, parent: parent?.id || null, icon: parent?.icon || data.icon, ...data });
      afterSave();
    };
    sh.actions.del = () => {
      const ids = [c.id, ...S.categories.filter(x => x.parent === c.id).map(x => x.id)];
      const used = S.transactions.some(t => ids.includes(t.categoryId)) || S.recurring.some(r => ids.includes(r.categoryId));
      if (used) return alert('This category is used by transactions or recurring items, so it can’t be deleted. You can rename it instead.');
      if (!confirm(ids.length > 1 ? 'Delete this category and its subcategories?' : 'Delete this category?')) return;
      S.categories = S.categories.filter(x => !ids.includes(x.id));
      delete S.budgets[c.id];
      afterSave('Deleted');
    };
  });
}

/* ================= Backup / export ================= */
async function shareFile(name, text, mime) {
  const file = new File([text], name, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return true;
}
function csvCell(v) { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

/* ================= Actions (event delegation) ================= */
const ACTIONS = {
  go: el => go(el.dataset.v, el.dataset.id || null),
  back: () => go(PARENT[view] || 'home'),
  newTx: () => openTxForm(null),
  editTx: el => { const t = S.transactions.find(x => x.id === el.dataset.id); if (t) openTxForm(t); },
  payDue: el => {
    if (el.dataset.kind === 'loan') return openLoanPayment(loan(el.dataset.id));
    const r = rec(el.dataset.id); if (!r) return;
    openTxForm(null, { type: r.type, _amt: centsToInput(r.amount), categoryId: r.categoryId, accountId: r.accountId, note: r.name, recurringId: r.id });
  },
  skipDue: el => { const r = rec(el.dataset.id); if (!r) return; r.nextDate = nextOcc(r); persist(); render(); toast(`Skipped · next ${fmtDate(r.nextDate)}`); },
  newLoan: () => openLoanForm(null),
  editLoan: el => openLoanForm(loan(el.dataset.id)),
  loanPay: el => openLoanPayment(loan(el.dataset.id)),
  newRec: () => openRecurringForm(null),
  editRec: el => openRecurringForm(rec(el.dataset.id)),
  newAcc: () => openAccountForm(null),
  editAcc: el => openAccountForm(acc(el.dataset.id)),
  newCat: el => openCategoryForm(null, el.dataset.parent || null),
  editCat: el => openCategoryForm(cat(el.dataset.id)),
  catTab: el => { catTab = el.dataset.type; render(); },
  repMonth: el => go('reports', shiftMonth(viewArg || curYM(), Number(el.dataset.n))),
  toggleCat: el => { const k = el.dataset.id; expanded.has(k) ? expanded.delete(k) : expanded.add(k); render(); },
  exportJSON: async () => {
    const ok = await shareFile(`my-money-backup-${today()}.json`, JSON.stringify(S), 'application/json');
    if (ok) { S.settings.lastBackup = today(); persist(); render(); toast('Backup created'); }
  },
  importJSON: () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      try {
        const data = JSON.parse(await inp.files[0].text());
        if (!Array.isArray(data.accounts) || !Array.isArray(data.categories) || !Array.isArray(data.transactions)) throw new Error('bad');
        if (!confirm(`Restore this backup with ${data.transactions.length} transactions?\nThis REPLACES all current data on this phone.`)) return;
        S = data; migrate(); processRecurring(); await persist(); go('home'); toast('Backup restored ✓');
      } catch { alert('This file is not a valid My Money backup.'); }
    };
    inp.click();
  },
  exportCSV: () => {
    const rows = [['Date', 'Type', 'Amount', 'Account', 'To account', 'Category', 'Subcategory', 'Note', 'Interest', 'Odometer']];
    for (const t of sortedTx()) {
      const c = cat(t.categoryId), top = topCat(t.categoryId);
      rows.push([fmtDate(t.date), t.type === 'loan' ? loanTxTitle(t, loan(t.loanId)) : t.type,
        ((t.type === 'transfer' ? t.amount : txSigned(t)) / 100).toFixed(2).replace('.', ','), acc(t.accountId)?.name || '', acc(t.toAccountId)?.name || '',
        top?.name || '', c?.parent ? c.name : '', t.note || '', t.interest ? (t.interest / 100).toFixed(2).replace('.', ',') : '', t.odometer || '']);
    }
    shareFile(`my-money-${today()}.csv`, '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n'), 'text/csv');
  },
  eraseAll: async () => {
    if (!confirm('Erase ALL data on this phone? This cannot be undone.')) return;
    if (!confirm('Are you really sure? Make a backup first if you might need the data.')) return;
    S = defaultState(); await persist(); go('home'); toast('All data erased');
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (sheet && el.closest('.sheet')) {
    const fn = sheet.actions[act];
    if (fn) { e.preventDefault(); fn(el); }
    return;
  }
  const fn = ACTIONS[act];
  if (fn) { e.preventDefault(); e.stopPropagation(); fn(el); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'hq') { hist.q = e.target.value; $('#histList').innerHTML = histList(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'hm') { hist.month = t.value; $('#histList').innerHTML = histList(); }
  else if (t.id === 'ht') { hist.type = t.value; $('#histList').innerHTML = histList(); }
  else if (t.dataset.budget) {
    const v = t.value.trim() ? parseAmount(t.value) : 0;
    if (Number.isNaN(v) || v < 0) { toast('Not a valid amount'); return; }
    if (v) S.budgets[t.dataset.budget] = v; else delete S.budgets[t.dataset.budget];
    persist(); render(); toast('Budget saved');
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && sheet && e.target.tagName === 'INPUT') { e.preventDefault(); sheet.actions.save?.(); }
  if (e.key === 'Escape' && sheet) closeSheet();
});

/* ================= Start ================= */
(async function init() {
  S = await loadState();
  if (!S) { S = defaultState(); await persist(); }
  migrate();
  if (processRecurring()) persist();
  render();
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
  // When reopening the app on a new day, add due automatic entries and refresh
  let lastDay = today();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const n = processRecurring();
    if (n) persist();
    if (n || lastDay !== today()) { lastDay = today(); if (!sheet) render(); }
  });
})();
