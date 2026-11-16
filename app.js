/* 365 Journal: a plan that re-flows around what you actually did.
   All data stays in this browser (localStorage). Use Settings > Export to back it up. */
(function () {
  'use strict';
  var KEY = 'imakemu5ic-journal-v1';
  var PLAN = window.PLAN;
  var ROWS = {};
  PLAN.rows.forEach(function (r) { ROWS['p' + r.d] = r; });
  var MONTHS = {};
  PLAN.months.forEach(function (m) { MONTHS[m.n] = m; });
  var SERIES = ['Moment', 'Theory', 'Push', 'Stack', 'Finish', 'Your Turn', 'Still'];
  var OUTCOMES = { posted: 'Posted', filmed: 'Filmed, not posted', practised: 'Only practised', skipped: "Didn't get to it" };
  var TARGETS = [[30, 500], [90, 5000], [180, 25000], [365, 100000]];

  /* ---------- dates ---------- */
  function z(n) { return String(n).padStart(2, '0'); }
  function fmt(d) { return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function parse(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return fmt(d); }
  function diff(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  function today() { return fmt(new Date()); }
  function nice(s, long) {
    return parse(s).toLocaleDateString(undefined, long ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' });
  }

  /* ---------- state ---------- */
  function fresh() {
    return { v: 1, start: today(), activeDays: [true, true, true, true, true, true, true],
      queue: PLAN.rows.map(function (r) { return 'p' + r.d; }), custom: {}, entries: {}, progress: {}, dropped: [], seq: 1 };
  }
  var state;
  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) { var s = JSON.parse(raw); if (s && s.queue && s.entries) return s; } } catch (e) {}
    return fresh();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Could not save in this browser. Export a backup from Settings.'); } }
  state = load();

  /* ---------- plan logic ---------- */
  function item(id) { return ROWS[id] || state.custom[id] || null; }
  function doneMap() {
    var m = {};
    Object.keys(state.entries).forEach(function (d) { (state.entries[d].done || []).forEach(function (id) { m[id] = d; }); });
    return m;
  }
  function remaining() { var dm = doneMap(); return state.queue.filter(function (id) { return !dm[id] && item(id); }); }
  function isActive(dateStr) { return !!state.activeDays[parse(dateStr).getDay()]; }
  function anyActive() { return state.activeDays.some(Boolean); }
  /* The remaining ideas laid onto calendar days from today onward. */
  function schedule() {
    var rem = remaining(), out = [], t = today();
    var d = t < state.start ? state.start : t;
    var e = state.entries[d];
    if (e && e.done && e.done.length) d = addDays(d, 1); // today already has a finished idea
    if (!anyActive()) return out;
    var i = 0, guard = 0;
    while (i < rem.length && guard < 5000) {
      if (isActive(d)) { out.push({ date: d, id: rem[i] }); i++; }
      d = addDays(d, 1); guard++;
    }
    return out;
  }
  function entry(d) { if (!state.entries[d]) state.entries[d] = { done: [], log: [] }; var e = state.entries[d]; e.done = e.done || []; e.log = e.log || []; return e; }
  function hasContent(e) { return e && ((e.log && e.log.length) || e.note || e.minutes || e.followers); }
  function worked(e) { return e && ((e.log || []).some(function (l) { return l.outcome !== 'skipped'; }) || e.minutes > 0); }
  function missedDays() {
    var out = [], t = today(), d = state.start;
    while (d < t) { if (isActive(d) && !hasContent(state.entries[d])) out.push(d); d = addDays(d, 1); }
    return out;
  }
  function streak() {
    var d = today(), n = 0;
    if (!worked(state.entries[d])) d = addDays(d, -1);
    while (d >= state.start && (worked(state.entries[d]) || !isActive(d))) { if (worked(state.entries[d])) n++; d = addDays(d, -1); if (n > 4000) break; }
    return n;
  }
  function summary() {
    var dm = doneMap(), done = Object.keys(dm).length, sch = schedule();
    var total = done + remaining().length;
    var finish = sch.length ? sch[sch.length - 1].date : null;
    var original = addDays(state.start, 364);
    var mins = 0; Object.keys(state.entries).forEach(function (d) { mins += Number(state.entries[d].minutes) || 0; });
    return { done: done, total: total, finish: finish, original: original, slip: finish ? diff(original, finish) : 0, minutes: mins, streak: streak() };
  }
  function logOutcome(date, id, outcome, opts) {
    opts = opts || {};
    var e = entry(date);
    e.log.push({ id: id, outcome: outcome, link: opts.link || '' });
    if (outcome === 'posted') { if (e.done.indexOf(id) < 0) e.done.push(id); delete state.progress[id]; }
    else if (outcome === 'filmed') state.progress[id] = 'filmed';
    else if (outcome === 'practised' && !state.progress[id]) state.progress[id] = 'practised';
    if (outcome !== 'posted' && outcome !== 'filmed' && opts.drop) drop(id);
    save();
  }
  function undoLog(date, idx) {
    var e = entry(date), l = e.log[idx]; if (!l) return;
    e.log.splice(idx, 1);
    if (l.outcome === 'posted') e.done = e.done.filter(function (x) { return x !== l.id; });
    if (l.outcome === 'filmed' || l.outcome === 'practised') delete state.progress[l.id];
    if (l.winner) state.queue = state.queue.filter(function (x) { return !(state.custom[x] && state.custom[x].from === l.id); });
    save();
  }
  function drop(id) { state.queue = state.queue.filter(function (x) { return x !== id; }); if (state.dropped.indexOf(id) < 0) state.dropped.push(id); delete state.progress[id]; save(); }
  function restore(id) { state.dropped = state.dropped.filter(function (x) { return x !== id; }); var rem = remaining(); insertBefore(id, rem[0]); save(); }
  function insertBefore(id, beforeId) {
    state.queue = state.queue.filter(function (x) { return x !== id; });
    var i = beforeId ? state.queue.indexOf(beforeId) : -1;
    if (i < 0) state.queue.push(id); else state.queue.splice(i, 0, id);
  }
  function moveToFront(id) { var rem = remaining(); if (rem[0] !== id) insertBefore(id, rem[0]); save(); }
  function moveLater(id, by) {
    var rem = remaining(), i = rem.indexOf(id); if (i < 0) return;
    var target = rem[Math.min(rem.length - 1, i + by) + 1]; // insert before the idea after the target slot
    insertBefore(id, target); save();
  }
  function addCustom(obj, where) {
    var id = 'c' + (state.seq++); state.custom[id] = obj;
    var rem = remaining();
    if (where === 'end') state.queue.push(id);
    else insertBefore(id, typeof where === 'number' ? rem[where] : rem[0]);
    save(); return id;
  }
  /* Winner rule from the manual: a post that takes off earns three new versions within a week. */
  function markWinner(date, idx) {
    var e = entry(date), l = e.log[idx]; if (!l || l.winner) return;
    var it = item(l.id); l.winner = true;
    [1, 3, 5].forEach(function (pos, n) {
      addCustom({ s: it.s, remix: true, from: l.id,
        make: 'Version ' + (n + 2) + ' of a format that worked. Keep the mechanic of "' + it.hook + '" and change the material: a new object, tune, word or person. Original brief: ' + it.make,
        hook: 'Write a fresh hook in the same shape as: ' + it.hook }, pos);
    });
    save();
  }

  /* ---------- rendering helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
  function tag(it) {
    var name = it.remix ? 'Remix · ' + it.s : it.own ? 'Yours · ' + it.s : it.s;
    var col = it.remix ? 'Remix' : it.own ? 'Own' : it.s.replace(' ', '');
    return '<span class="tag" style="color:var(--' + col + ')">' + esc(name) + '</span>';
  }
  function origin(it) { return it.d ? 'Idea ' + it.d + ' of 365 · Month ' + it.m + ': ' + MONTHS[it.m].title : it.remix ? 'Added because a post took off' : 'Your own idea'; }
  var toastTimer;
  function toast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600); }

  var view = 'day', viewDate = null, showAll = false;
  var app = document.getElementById('app');

  function render() {
    var s = summary();
    document.getElementById('sub').textContent = s.done + ' of ' + s.total + ' done';
    Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function (b) { b.classList.toggle('on', b.dataset.view === view); });
    app.innerHTML = ({ day: renderDay, plan: renderPlan, journal: renderJournal, stats: renderStats, settings: renderSettings })[view](s);
    window.scrollTo(0, 0);
  }

  function slipText(s) {
    if (!s.finish) return 'Every idea is done.';
    if (s.slip > 0) return 'Finishing ' + nice(s.finish, true) + ', ' + s.slip + ' day' + (s.slip === 1 ? '' : 's') + ' later than a straight 365.';
    if (s.slip < 0) return 'Finishing ' + nice(s.finish, true) + ', ' + (-s.slip) + ' day' + (s.slip === -1 ? '' : 's') + ' ahead of a straight 365.';
    return 'Finishing ' + nice(s.finish, true) + ', exactly on schedule.';
  }

  function renderDay(s) {
    var t = today(), d = viewDate || t, isToday = d === t;
    var e = state.entries[d] || { done: [], log: [] };
    var rem = remaining(), id = rem[0], it = id ? item(id) : null;
    var h = '';
    if (!isToday) h += '<div class="banner">Editing ' + esc(nice(d, true)) + '. <button class="link" data-act="goto-today">Back to today</button></div>';
    if (t < state.start) h += '<div class="banner ok">Your year starts on ' + esc(nice(state.start, true)) + '. You can still log a head start.</div>';
    var missed = missedDays();
    if (isToday && missed.length) h += '<div class="banner">' + missed.length + ' day' + (missed.length === 1 ? '' : 's') + ' without an entry. The plan has moved forward to match, so nothing is lost. <button class="link" data-act="view" data-view="journal">Fill them in</button></div>';

    var dayNo = diff(state.start, d) + 1;
    h += '<div class="card"><div class="muted small">' + esc(nice(d, true)) + (dayNo > 0 ? ' · Day ' + dayNo + ' on the calendar' : '') + '</div>';
    h += '<div class="progress"><i style="width:' + (s.total ? (100 * s.done / s.total) : 0).toFixed(1) + '%"></i></div>';
    h += '<div class="small muted">' + s.done + ' of ' + s.total + ' ideas posted. ' + esc(slipText(s)) + '</div></div>';

    if (e.log && e.log.length) {
      h += '<div class="card"><h3>Logged this day</h3>';
      e.log.forEach(function (l, i) {
        var li = item(l.id) || { s: '', hook: '(removed idea)' };
        h += '<div class="item"><div class="top">' + (li.s ? tag(li) : '') + '<span>' + esc(OUTCOMES[l.outcome]) + (l.winner ? ' · took off' : '') + '</span></div>';
        h += '<div class="h">' + esc(li.hook) + '</div><div class="acts">';
        if (safeUrl(l.link)) h += '<a href="' + esc(safeUrl(l.link)) + '" target="_blank" rel="noopener" style="color:var(--accent)">Open post</a>';
        if (l.outcome === 'posted' && !l.winner) h += '<button class="link" data-act="winner" data-i="' + i + '">This one took off: add 3 remixes</button>';
        h += '<button class="link" data-act="undo" data-i="' + i + '">Undo</button></div></div>';
      });
      h += '</div>';
    }

    if (it) {
      var again = e.done && e.done.length;
      var rest = isToday && !isActive(d) && !again;
      h += '<div class="card">';
      h += '<div class="muted small" style="margin-bottom:8px">' + (again ? 'Next up, if you have time for another' : rest ? 'Rest day in your settings. Next up, if you feel like it' : isToday ? "Today's idea" : 'Next unfinished idea') + '</div>';
      h += tag(it) + ' <span class="muted small">' + esc(origin(it)) + '</span>';
      h += '<div class="label">Hook, first two seconds</div><div class="hook">' + esc(it.hook) + '</div>';
      h += '<div class="label">Make this</div><div>' + esc(it.make) + '</div>';
      if (state.progress[id] === 'filmed') h += '<div class="banner ok" style="margin:14px 0 0">Already filmed. Today is only edit and post.</div>';
      if (state.progress[id] === 'practised') h += '<div class="banner ok" style="margin:14px 0 0">You have practised this one. Today is filming.</div>';
      if (it.m) h += '<details><summary>Month ' + it.m + ' focus and how-to</summary><p>' + esc(MONTHS[it.m].intro) + '</p><p>' + esc(MONTHS[it.m].howto) + '</p></details>';
      h += '<div class="label">What happened?</div><div class="row">';
      h += '<button class="b primary" data-act="log" data-o="posted">Posted it</button><button class="b" data-act="log" data-o="filmed">Filmed, not posted</button>';
      h += '<button class="b" data-act="log" data-o="practised">Only practised</button><button class="b" data-act="log" data-o="skipped">Didn\'t get to it</button></div>';
      h += '<label for="f-link">Link to the post (optional)</label><input id="f-link" type="url" inputmode="url" placeholder="https://www.instagram.com/reel/...">';
      h += '<label class="check"><input type="checkbox" id="f-drop"> If I did not finish it, let this idea go instead of carrying it to the next day.</label>';
      h += '</div>';
    } else {
      h += '<div class="card"><h2>Every idea is done.</h2><p class="muted">Add your own ideas from the Plan tab, or restore anything you let go.</p></div>';
    }

    h += '<div class="card"><h3>Journal entry</h3>';
    h += '<div class="row"><div><label for="f-min">Minutes practised</label><input id="f-min" type="number" min="0" inputmode="numeric" value="' + esc(e.minutes || '') + '"></div>';
    h += '<div><label for="f-fol">Followers today (optional)</label><input id="f-fol" type="number" min="0" inputmode="numeric" value="' + esc(e.followers || '') + '"></div></div>';
    h += '<label for="f-note">What happened, what you learned, what to try next</label><textarea id="f-note" placeholder="Honest notes. Nobody else sees these.">' + esc(e.note || '') + '</textarea>';
    h += '<div class="row" style="margin-top:12px"><button class="b" data-act="save-fields">Save entry</button></div></div>';
    return h;
  }

  function renderPlan(s) {
    var sch = schedule(), h = '';
    h += '<div class="card"><h2>The plan, as it stands today</h2><p class="muted small">' + esc(slipText(s)) + ' Each unfinished idea waits its turn; skipped days push everything back, extra posts pull it forward.</p></div>';
    if (!anyActive()) h += '<div class="banner">No posting days are switched on. Choose some in Settings.</div>';
    var list = showAll ? sch : sch.slice(0, 30), lastMonth = null;
    h += '<div class="card">';
    list.forEach(function (x, i) {
      var it = item(x.id);
      if (it.m && it.m !== lastMonth) { lastMonth = it.m; h += '<div class="label" style="margin-top:' + (i ? 18 : 0) + 'px">Month ' + it.m + ': ' + esc(MONTHS[it.m].title) + '</div>'; }
      h += '<div class="item"><div class="top"><b style="color:var(--text)">' + esc(nice(x.date)) + '</b>' + tag(it) + (state.progress[x.id] ? '<span>' + (state.progress[x.id] === 'filmed' ? 'filmed' : 'practised') + '</span>' : '') + '</div>';
      h += '<div class="h">' + esc(it.hook) + '</div><div class="small muted">' + esc(it.make) + '</div><div class="acts">';
      if (i > 0) h += '<button class="link" data-act="front" data-id="' + x.id + '">Do next</button>';
      h += '<button class="link" data-act="later" data-id="' + x.id + '">Push a week</button><button class="link" data-act="drop" data-id="' + x.id + '">Let go</button></div></div>';
    });
    if (!sch.length) h += '<p class="muted">Nothing left in the queue.</p>';
    h += '</div>';
    if (sch.length > 30) h += '<div class="row" style="margin-bottom:16px"><button class="b ghost" data-act="toggle-all">' + (showAll ? 'Show the next 30 only' : 'Show all ' + sch.length + ' remaining days') + '</button></div>';

    h += '<div class="card"><h3>Add your own idea</h3><div class="row"><div><label for="c-s">Series</label><select id="c-s">' + SERIES.map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select></div>';
    h += '<div><label for="c-w">Where</label><select id="c-w"><option value="next">Do next</option><option value="end">End of the plan</option></select></div></div>';
    h += '<label for="c-h">Hook</label><input id="c-h" maxlength="120"><label for="c-m">What to make</label><textarea id="c-m" style="min-height:80px"></textarea>';
    h += '<div class="row" style="margin-top:12px"><button class="b" data-act="add-custom">Add to plan</button></div></div>';

    if (state.dropped.length) {
      h += '<div class="card"><h3>Let go (' + state.dropped.length + ')</h3>';
      state.dropped.forEach(function (id) { var it = item(id); if (!it) return; h += '<div class="item"><div class="top">' + tag(it) + '</div><div class="h">' + esc(it.hook) + '</div><div class="acts"><button class="link" data-act="restore" data-id="' + id + '">Bring back</button></div></div>'; });
      h += '</div>';
    }
    return h;
  }

  function renderJournal() {
    var t = today(), h = '', d = t, first = state.start, n = 0;
    Object.keys(state.entries).forEach(function (k) { if (k < first && hasContent(state.entries[k])) first = k; });
    h += '<div class="card"><h2>Journal</h2><p class="muted small">Newest first. Open any day to add or change its entry; the plan re-flows when you do.</p></div><div class="card">';
    while (d >= first && n < 800) {
      var e = state.entries[d], has = hasContent(e);
      if (has || isActive(d)) {
        h += '<div class="item"><div class="top"><b style="color:var(--text)">' + esc(nice(d, true)) + '</b>';
        if (!has) h += '<span style="color:var(--warn)">' + (d === t ? 'not logged yet' : 'no entry') + '</span>';
        if (has && e.minutes) h += '<span>' + esc(e.minutes) + ' min</span>';
        if (has && e.followers) h += '<span>' + esc(e.followers) + ' followers</span>';
        h += '</div>';
        if (has) {
          (e.log || []).forEach(function (l) { var it = item(l.id); h += '<div class="small" style="margin-top:6px">' + (it ? tag(it) + ' ' : '') + esc(OUTCOMES[l.outcome]) + (it ? ': ' + esc(it.hook) : '') + '</div>'; });
          if (e.note) h += '<div style="margin-top:8px;white-space:pre-wrap">' + esc(e.note) + '</div>';
        }
        h += '<div class="acts"><button class="link" data-act="open-day" data-d="' + d + '">' + (has ? 'Edit' : 'Add entry') + '</button></div></div>';
      }
      d = addDays(d, -1); n++;
    }
    h += '</div>';
    return h;
  }

  function renderStats(s) {
    var h = '<div class="stats">';
    h += '<div class="stat"><b>' + s.done + '</b><span>ideas posted of ' + s.total + '</span></div>';
    h += '<div class="stat"><b>' + s.streak + '</b><span>day streak</span></div>';
    h += '<div class="stat"><b>' + (s.minutes >= 120 ? (s.minutes / 60).toFixed(1) + ' h' : s.minutes + ' min') + '</b><span>practised</span></div>';
    h += '<div class="stat"><b>' + (s.slip > 0 ? '+' + s.slip : s.slip) + '</b><span>days against a straight 365</span></div></div>';
    h += '<div class="card"><h3>Where the year ends</h3><p class="muted" style="margin:0">' + esc(slipText(s)) + '</p></div>';

    var counts = {}, dm = doneMap(), max = 1;
    SERIES.forEach(function (x) { counts[x] = 0; });
    Object.keys(dm).forEach(function (id) { var it = item(id); if (it && counts[it.s] != null) { counts[it.s]++; max = Math.max(max, counts[it.s]); } });
    h += '<div class="card"><h3>Posted by series</h3><div class="bars">';
    SERIES.forEach(function (x) { h += '<div><span>' + x + '</span><i style="width:' + (counts[x] / max * 60).toFixed(1) + '%;background:var(--' + x.replace(' ', '') + ')"></i>' + counts[x] + '</div>'; });
    h += '</div></div>';

    var pts = Object.keys(state.entries).filter(function (d) { return Number(state.entries[d].followers) > 0; }).sort().map(function (d) { return { day: diff(state.start, d) + 1, v: Number(state.entries[d].followers), date: d }; });
    h += '<div class="card"><h3>Followers against the targets</h3>';
    if (pts.length) {
      var last = pts[pts.length - 1], next = TARGETS.filter(function (x) { return x[0] >= last.day; })[0] || TARGETS[3];
      h += '<p class="muted small">Latest: ' + last.v.toLocaleString() + ' on calendar day ' + last.day + '. Next checkpoint: ' + next[1].toLocaleString() + ' by day ' + next[0] + '.</p>';
      h += chart(pts);
    } else h += '<p class="muted small">Enter your follower count in a journal entry now and then, and the curve appears here. Checkpoints from the manual: 500 by day 30, 5,000 by day 90, 25,000 by day 180, 100,000 by day 365.</p>';
    h += '</div>';
    return h;
  }
  /* Log-scale line of follower entries with the manual's checkpoints as hollow markers. */
  function chart(pts) {
    var W = 640, H = 220, L = 46, R = 12, T = 12, B = 26;
    var maxDay = Math.max(365, pts[pts.length - 1].day), maxV = Math.max(100000, pts.reduce(function (a, p) { return Math.max(a, p.v); }, 0));
    var lo = Math.log10(10), hi = Math.log10(maxV * 1.2);
    function x(d) { return L + (W - L - R) * Math.max(0, d) / maxDay; }
    function y(v) { return T + (H - T - B) * (1 - (Math.log10(Math.max(10, v)) - lo) / (hi - lo)); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Followers over the year on a log scale, with target checkpoints">';
    [100, 1000, 10000, 100000].forEach(function (v) { s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#3a2f23"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + (v >= 1000 ? v / 1000 + 'k' : v) + '</text>'; });
    [1, 90, 180, 270, 365].forEach(function (d) { s += '<text x="' + x(d) + '" y="' + (H - 6) + '" text-anchor="' + (d === 1 ? 'start' : d === 365 ? 'end' : 'middle') + '">day ' + d + '</text>'; });
    TARGETS.forEach(function (t) { s += '<circle cx="' + x(t[0]) + '" cy="' + y(t[1]) + '" r="5" fill="none" stroke="#a8977f" stroke-width="1.5"><title>Target: ' + t[1].toLocaleString() + ' by day ' + t[0] + '</title></circle>'; });
    s += '<polyline fill="none" stroke="#e8a24a" stroke-width="2.5" stroke-linejoin="round" points="' + pts.map(function (p) { return x(p.day).toFixed(1) + ',' + y(p.v).toFixed(1); }).join(' ') + '"/>';
    pts.forEach(function (p) { s += '<circle cx="' + x(p.day) + '" cy="' + y(p.v) + '" r="3.5" fill="#e8a24a"><title>' + p.v.toLocaleString() + ' on ' + p.date + '</title></circle>'; });
    return s + '</svg><p class="muted small" style="margin:6px 0 0">Filled dots are your entries. Hollow circles are the checkpoints.</p>';
  }

  function renderSettings() {
    var names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], h = '';
    h += '<div class="card"><h3>Start date</h3><p class="muted small">Day 1 of your year. Changing it re-flows the plan.</p><input type="date" id="s-start" value="' + esc(state.start) + '"></div>';
    h += '<div class="card"><h3>Posting days</h3><p class="muted small">Switch off the weekdays you will not post. Ideas are only placed on the days left on, so the year stretches to fit.</p><div class="days">';
    [1, 2, 3, 4, 5, 6, 0].forEach(function (i) { h += '<label><input type="checkbox" data-act="day-toggle" data-i="' + i + '"' + (state.activeDays[i] ? ' checked' : '') + '>' + names[i] + '</label>'; });
    h += '</div></div>';
    h += '<div class="card"><h3>Your data</h3><p class="muted small">Entries live only in this browser on this device. Export a backup regularly, and import it on another device to continue there.</p>';
    h += '<div class="row"><button class="b" data-act="export">Export backup</button><button class="b" data-act="import">Import backup</button></div><input type="file" id="s-file" accept="application/json,.json" hidden></div>';
    h += '<div class="card"><h3>Start over</h3><p class="muted small">Deletes every entry and restores the original 365-day plan.</p><div class="row"><button class="b ghost" data-act="reset" style="border-color:var(--warn);color:var(--warn)">Erase everything</button></div><p class="small muted" id="reset-hint" hidden>Press again within five seconds to confirm.</p></div>';
    return h;
  }

  /* ---------- events ---------- */
  function readFields(d) {
    var e = entry(d), m = document.getElementById('f-min'), f = document.getElementById('f-fol'), n = document.getElementById('f-note');
    if (m) { if (m.value === '') delete e.minutes; else e.minutes = Math.max(0, Number(m.value) || 0); }
    if (f) { if (f.value === '') delete e.followers; else e.followers = Math.max(0, Math.round(Number(f.value) || 0)); }
    if (n) { if (n.value.trim() === '') delete e.note; else e.note = n.value; }
    if (!hasContent(e) && !e.done.length) delete state.entries[d];
  }
  var resetArmed = 0;
  document.getElementById('nav').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    view = b.dataset.view; if (view === 'day') viewDate = null; render();
  });
  app.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act]'); if (!b || b.type === 'checkbox') return;
    var act = b.dataset.act, d = viewDate || today();
    if (act === 'log') {
      var id = remaining()[0]; if (!id) return;
      var link = (document.getElementById('f-link') || {}).value || '', dropIt = (document.getElementById('f-drop') || {}).checked;
      readFields(d); logOutcome(d, id, b.dataset.o, { link: link.trim(), drop: dropIt });
      toast(b.dataset.o === 'posted' ? 'Logged. The plan moves on to the next idea.' : dropIt && b.dataset.o !== 'filmed' ? 'Logged. That idea is set aside; find it under Plan.' : 'Logged. This idea carries forward and the rest of the plan shifts.');
      render();
    } else if (act === 'save-fields') { readFields(d); save(); toast('Entry saved.'); render(); }
    else if (act === 'undo') { readFields(d); undoLog(d, Number(b.dataset.i)); toast('Undone.'); render(); }
    else if (act === 'winner') { readFields(d); markWinner(d, Number(b.dataset.i)); toast('Three remixes added to the next week of the plan.'); render(); }
    else if (act === 'goto-today') { viewDate = null; render(); }
    else if (act === 'view') { view = b.dataset.view; render(); }
    else if (act === 'open-day') { viewDate = b.dataset.d === today() ? null : b.dataset.d; view = 'day'; render(); }
    else if (act === 'front') { moveToFront(b.dataset.id); toast('Moved to the front.'); render(); }
    else if (act === 'later') { moveLater(b.dataset.id, 7); toast('Pushed back about a week.'); render(); }
    else if (act === 'drop') { drop(b.dataset.id); toast('Set aside. You can bring it back below.'); render(); }
    else if (act === 'restore') { restore(b.dataset.id); toast('Back in the plan, up next.'); render(); }
    else if (act === 'toggle-all') { showAll = !showAll; render(); }
    else if (act === 'add-custom') {
      var hk = document.getElementById('c-h').value.trim(), mk = document.getElementById('c-m').value.trim();
      if (!hk || !mk) { toast('Give it a hook and a line on what to make.'); return; }
      addCustom({ s: document.getElementById('c-s').value, own: true, hook: hk, make: mk }, document.getElementById('c-w').value === 'end' ? 'end' : 0);
      toast('Added.'); render();
    }
    else if (act === 'export') {
      var blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = '365-journal-' + today() + '.json'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }
    else if (act === 'import') document.getElementById('s-file').click();
    else if (act === 'reset') {
      if (Date.now() - resetArmed < 5000) { state = fresh(); save(); resetArmed = 0; toast('Everything erased. Fresh plan.'); view = 'day'; render(); }
      else { resetArmed = Date.now(); document.getElementById('reset-hint').hidden = false; }
    }
  });
  app.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.id === 's-start' && /^\d{4}-\d\d-\d\d$/.test(t.value)) { state.start = t.value; save(); toast('Start date changed. Plan re-flowed.'); render(); }
    else if (t.dataset.act === 'day-toggle') { state.activeDays[Number(t.dataset.i)] = t.checked; save(); toast('Posting days changed. Plan re-flowed.'); }
    else if (t.id === 's-file' && t.files && t.files[0]) {
      var r = new FileReader();
      r.onload = function () {
        try { var s = JSON.parse(r.result); if (!s || !Array.isArray(s.queue) || typeof s.entries !== 'object') throw 0; state = Object.assign(fresh(), s); save(); toast('Backup imported.'); view = 'day'; render(); }
        catch (e) { toast('That file is not a journal backup.'); }
      };
      r.readAsText(t.files[0]);
    }
  });

  window.__journal = { state: function () { return state; }, schedule: schedule, summary: summary, remaining: remaining };
  render();
})();
