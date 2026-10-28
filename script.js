(function () {
  'use strict';

  var TZ = 'Asia/Kathmandu';
  var KEY = 'day-ledger-events-v2';
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  /* ---------- helpers ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function key(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function parseKey(k) { var p = k.split('-'); return { y: +p[0], m: +p[1] - 1, d: +p[2] }; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function nepalParts() {
    var p = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return { y: +p.year, m: +p.month - 1, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
  }

  /* ---------- storage ---------- */
  var memory = null;
  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    return memory;
  }
  function save() {
    memory = events;
    try { localStorage.setItem(KEY, JSON.stringify(events)); } catch (e) {}
  }

  /* ---------- state ---------- */
  var now = nepalParts();
  var todayKey = key(now.y, now.m, now.d);
  var events = load();
  var needsSeed = !events;

  // Used only if events.json cannot be loaded (for example when opened straight from a folder)
  function fallbackSeed() {
    var shift = function (n) {
      var dt = new Date(now.y, now.m, now.d + n);
      return key(dt.getFullYear(), dt.getMonth(), dt.getDate());
    };
    events = {};
    events[todayKey] = [{ id: 'ex1', title: 'Project check-in', time: '14:00', end: '15:00', note: 'Walk through the calendar demo.', type: 'event', example: true }];
    events[shift(2)] = [{ id: 'ex2', title: 'Submit assignment', time: '09:00', end: '', note: '', type: 'reminder', example: true }];
    events[shift(5)] = [
      { id: 'ex3', title: 'Study group', time: '16:30', end: '18:00', note: 'Library, second floor.', type: 'event', example: true },
      { id: 'ex4', title: 'Pay internet bill', time: '', end: '', note: '', type: 'reminder', example: true }
    ];
    save();
  }

  var viewY = now.y, viewM = now.m;
  var selected = todayKey;
  var is24 = false;
  var editing = null; // { mode: 'new' } or { mode: 'edit', id: '...' }
  var fired = {};     // alerts already shown this session

  var el = {
    time: document.getElementById('time'),
    longDate: document.getElementById('longDate'),
    nextUp: document.getElementById('nextUp'),
    f12: document.getElementById('fmt12'),
    f24: document.getElementById('fmt24'),
    grid: document.getElementById('grid'),
    title: document.getElementById('monthTitle'),
    list: document.getElementById('list'),
    empty: document.getElementById('emptyState'),
    lt: document.getElementById('ledgerTitle'),
    ls: document.getElementById('ledgerSub'),
    slot: document.getElementById('editorSlot'),
    note: document.getElementById('exampleNote'),
    toasts: document.getElementById('toasts'),
    alertBtn: document.getElementById('alertBtn')
  };

  /* ---------- time formatting ---------- */
  function fmtTime(t) {
    if (!t) return '';
    var p = t.split(':'), h = +p[0], m = p[1];
    if (is24) return pad(h) + ':' + m;
    return (h % 12 || 12) + ':' + m + ' ' + (h >= 12 ? 'PM' : 'AM');
  }
  function fmtRange(e) {
    if (!e.time) return '<b>All day</b>';
    return '<b>' + fmtTime(e.time) + '</b>' + (e.end ? 'to ' + fmtTime(e.end) : '');
  }

  /* ---------- clock ---------- */
  function tick() {
    var n = nepalParts();
    var h = n.h, ap = '';
    if (!is24) { ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; }
    el.time.innerHTML = pad(h) + ':' + pad(n.mi) +
      '<span class="sec">:' + pad(n.s) + '</span>' +
      (ap ? '<span class="ampm">' + ap + '</span>' : '');
    var dow = new Date(n.y, n.m, n.d).getDay();
    el.longDate.textContent = DAYS[dow] + ', ' + MONTHS[n.m] + ' ' + n.d + ', ' + n.y;

    var k = key(n.y, n.m, n.d);
    if (k !== todayKey) { todayKey = k; renderGrid(); renderLedger(); }

    checkAlerts(n, k);
    if (n.s === 0 || !el.nextUp.innerHTML) renderNextUp(n, k);
  }

  function setFmt(v) {
    is24 = v;
    el.f12.setAttribute('aria-pressed', String(!v));
    el.f24.setAttribute('aria-pressed', String(v));
    tick(); renderLedger(); renderNextUp(nepalParts(), todayKey);
  }
  el.f12.addEventListener('click', function () { setFmt(false); });
  el.f24.addEventListener('click', function () { setFmt(true); });

  /* ---------- next up ---------- */
  function renderNextUp(n, k) {
    var nowHM = pad(n.h) + ':' + pad(n.mi);
    var best = null;
    Object.keys(events).forEach(function (dk) {
      if (dk < k) return;
      events[dk].forEach(function (e) {
        if (dk === k && e.time && e.time < nowHM) return;
        var stamp = dk + ' ' + (e.time || '00:00');
        if (!best || stamp < best.stamp) best = { stamp: stamp, dk: dk, e: e };
      });
    });
    if (!best) { el.nextUp.textContent = 'Nothing coming up.'; return; }
    var p = parseKey(best.dk);
    var when = best.dk === k ? 'Today' : MONTHS[p.m].slice(0, 3) + ' ' + p.d;
    el.nextUp.innerHTML = 'Next up: <b>' + esc(best.e.title) + '</b> &middot; ' + when + (best.e.time ? ', ' + fmtTime(best.e.time) : ', all day');
  }

  /* ---------- time-based alerts ---------- */
  function checkAlerts(n, k) {
    var nowHM = pad(n.h) + ':' + pad(n.mi);
    (events[k] || []).forEach(function (e) {
      if (!e.time || e.time !== nowHM) return;
      var token = k + '|' + e.id + '|' + e.time;
      if (fired[token]) return;
      fired[token] = true;
      showToast(e);
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(e.title, { body: (e.type === 'reminder' ? 'Reminder' : 'Event') + ' at ' + fmtTime(e.time) });
        }
      } catch (err) {}
    });
  }

  function showToast(e) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<div><div class="tt">' + (e.type === 'reminder' ? 'Reminder' : 'Event') + ' &middot; ' + fmtTime(e.time) + '</div><div class="tn">' + esc(e.title) + '</div></div><button type="button">Dismiss</button>';
    t.querySelector('button').addEventListener('click', function () { t.remove(); });
    el.toasts.appendChild(t);
  }

  function syncAlertBtn() {
    if (!('Notification' in window)) { el.alertBtn.hidden = true; return; }
    if (Notification.permission === 'granted') { el.alertBtn.textContent = 'Alerts on'; el.alertBtn.disabled = true; }
    else if (Notification.permission === 'denied') { el.alertBtn.textContent = 'Alerts blocked'; el.alertBtn.disabled = true; }
  }
  el.alertBtn.addEventListener('click', function () {
    try { Notification.requestPermission().then(syncAlertBtn); } catch (e) {}
  });

  /* ---------- calendar ---------- */
  function renderGrid() {
    el.title.textContent = MONTHS[viewM] + ' ' + viewY;
    var first = new Date(viewY, viewM, 1).getDay();
    var count = new Date(viewY, viewM + 1, 0).getDate();
    var html = '';
    for (var i = 0; i < first; i++) html += '<div class="day pad"></div>';
    for (var d = 1; d <= count; d++) {
      var k = key(viewY, viewM, d);
      var list = events[k] || [];
      var hasEv = list.some(function (e) { return e.type === 'event'; });
      var hasRem = list.some(function (e) { return e.type === 'reminder'; });
      var dow = (first + d - 1) % 7;
      var cls = 'day' + (dow === 6 ? ' sat' : '') + (k === todayKey ? ' today' : '') + (k === selected ? ' selected' : '');
      var label = DAYS[dow] + ', ' + MONTHS[viewM] + ' ' + d + (list.length ? ', ' + list.length + ' item' + (list.length > 1 ? 's' : '') : '');
      html += '<button type="button" class="' + cls + '" data-key="' + k + '" aria-label="' + label + '"' + (k === selected ? ' aria-pressed="true"' : '') + '>' +
        '<span>' + d + '</span><span class="dots">' + (hasEv ? '<i class="dot"></i>' : '') + (hasRem ? '<i class="dot rem"></i>' : '') + '</span></button>';
    }
    el.grid.innerHTML = html;
  }

  // Single click: show the day. Double click: open the add form.
  el.grid.addEventListener('click', function (e) {
    var b = e.target.closest('.day[data-key]'); if (!b) return;
    selected = b.getAttribute('data-key'); editing = null;
    renderGrid(); renderLedger();
  });
  el.grid.addEventListener('dblclick', function (e) {
    var b = e.target.closest('.day[data-key]'); if (!b) return;
    selected = b.getAttribute('data-key');
    openEditor({ mode: 'new' });
    renderGrid();
  });
  document.getElementById('prev').addEventListener('click', function () { viewM--; if (viewM < 0) { viewM = 11; viewY--; } renderGrid(); });
  document.getElementById('next').addEventListener('click', function () { viewM++; if (viewM > 11) { viewM = 0; viewY++; } renderGrid(); });
  document.getElementById('goToday').addEventListener('click', function () {
    var n = nepalParts(); viewY = n.y; viewM = n.m; selected = key(n.y, n.m, n.d); editing = null; renderGrid(); renderLedger();
  });

  /* ---------- day ledger ---------- */
  function renderLedger() {
    var p = parseKey(selected);
    var dow = new Date(p.y, p.m, p.d).getDay();
    el.lt.textContent = selected === todayKey ? 'Today' : DAYS[dow];
    el.ls.textContent = MONTHS[p.m] + ' ' + p.d + ', ' + p.y;

    var n = nepalParts();
    var nowHM = pad(n.h) + ':' + pad(n.mi);
    var list = (events[selected] || []).slice().sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); });

    el.list.innerHTML = list.map(function (e) {
      var past = selected < todayKey || (selected === todayKey && e.time && (e.end || e.time) < nowHM);
      return '<li class="item' + (past ? ' past' : '') + '"><div class="t">' + fmtRange(e) + '</div><div><div class="name">' + esc(e.title) +
        '<span class="badge">' + (e.type === 'reminder' ? 'Reminder' : 'Event') + '</span>' +
        (e.example ? '<span class="badge">Example</span>' : '') + '</div>' +
        (e.note ? '<div class="note">' + esc(e.note) + '</div>' : '') + '</div>' +
        '<div class="row-actions"><button type="button" data-act="edit" data-id="' + e.id + '">Edit</button>' +
        '<button type="button" data-act="del" data-id="' + e.id + '">Delete</button></div></li>';
    }).join('');

    if (!list.length) {
      el.empty.hidden = false;
      el.empty.innerHTML = '<strong>Nothing planned</strong>No events or reminders on this day. Double-click the date, or press Add.';
    } else { el.empty.hidden = true; }

    var anyExample = Object.keys(events).some(function (k) { return events[k].some(function (e) { return e.example; }); });
    el.note.hidden = !anyExample;
    renderEditor();
  }

  /* ---------- editor ---------- */
  function openEditor(state) {
    editing = state;
    renderLedger();
    var t = document.getElementById('f-title'); if (t) t.focus();
  }

  function renderEditor() {
    if (!editing) { el.slot.innerHTML = ''; return; }
    var cur = { title: '', time: '', end: '', note: '', type: 'event' };
    if (editing.mode === 'edit') {
      var f = (events[selected] || []).filter(function (e) { return e.id === editing.id; })[0];
      if (f) cur = f;
    } else {
      var n = nepalParts();
      if (selected === todayKey) {
        // Suggest the next full hour for today
        var hh = (n.h + 1) % 24;
        cur.time = pad(hh) + ':00';
      }
    }
    el.slot.innerHTML =
      '<form class="editor" id="editor" novalidate>' +
        '<label for="f-title">Title<input id="f-title" type="text" maxlength="80" value="' + esc(cur.title) + '" placeholder="e.g. Viva presentation"></label>' +
        '<div class="row3">' +
          '<label for="f-date">Date<input id="f-date" type="date" value="' + selected + '"></label>' +
          '<label for="f-time">Start time<input id="f-time" type="time" value="' + esc(cur.time || '') + '"></label>' +
          '<label for="f-end">End time<input id="f-end" type="time" value="' + esc(cur.end || '') + '"></label>' +
        '</div>' +
        '<label for="f-type">Type<select id="f-type"><option value="event"' + (cur.type === 'event' ? ' selected' : '') + '>Event</option><option value="reminder"' + (cur.type === 'reminder' ? ' selected' : '') + '>Reminder</option></select></label>' +
        '<label for="f-note">Note<textarea id="f-note" maxlength="300" placeholder="Optional">' + esc(cur.note || '') + '</textarea></label>' +
        '<div class="form-err" id="f-err" hidden></div>' +
        '<p class="hint">Leave the times empty for an all-day entry. An alert appears when the start time arrives while this page is open.</p>' +
        '<div class="form-actions"><button type="button" class="btn ghost" id="f-cancel">Cancel</button><button type="submit" class="btn">' + (editing.mode === 'edit' ? 'Save changes' : 'Save') + '</button></div>' +
      '</form>';

    document.getElementById('f-cancel').addEventListener('click', function () { editing = null; renderEditor(); });
    document.getElementById('editor').addEventListener('submit', onSubmit);
  }

  function onSubmit(ev) {
    ev.preventDefault();
    var err = document.getElementById('f-err');
    var title = document.getElementById('f-title').value.trim();
    var date = document.getElementById('f-date').value;
    var time = document.getElementById('f-time').value;
    var end = document.getElementById('f-end').value;

    var msg = '';
    if (!title) msg = 'Add a title before saving.';
    else if (!date) msg = 'Choose a date.';
    else if (end && !time) msg = 'Add a start time, or clear the end time.';
    else if (end && time && end <= time) msg = 'The end time must be after the start time.';
    if (msg) { err.textContent = msg; err.hidden = false; return; }

    var rec = { title: title, type: document.getElementById('f-type').value, time: time, end: end, note: document.getElementById('f-note').value.trim() };

    if (editing.mode === 'edit') {
      rec.id = editing.id;
      var old = events[selected] || [];
      var example = (old.filter(function (e) { return e.id === rec.id; })[0] || {}).example;
      events[selected] = old.filter(function (e) { return e.id !== rec.id; });
      if (!events[selected].length) delete events[selected];
      if (example) rec.example = true;
    } else {
      rec.id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    (events[date] = events[date] || []).push(rec);
    save();

    var p = parseKey(date);
    selected = date; viewY = p.y; viewM = p.m; editing = null;
    renderGrid(); renderLedger(); renderNextUp(nepalParts(), todayKey);
  }

  document.getElementById('addBtn').addEventListener('click', function () { openEditor({ mode: 'new' }); });

  el.list.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var id = b.getAttribute('data-id');
    if (b.getAttribute('data-act') === 'edit') {
      openEditor({ mode: 'edit', id: id });
    } else {
      events[selected] = (events[selected] || []).filter(function (x) { return x.id !== id; });
      if (!events[selected].length) delete events[selected];
      save(); renderGrid(); renderLedger(); renderNextUp(nepalParts(), todayKey);
    }
  });

  /* ---------- start ---------- */
  /* ---------- export / import events.json ---------- */
  document.getElementById('exportBtn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'events.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  var importFile = document.getElementById('importFile');
  document.getElementById('importBtn').addEventListener('click', function () { importFile.click(); });
  importFile.addEventListener('change', function () {
    var f = importFile.files && importFile.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('bad');
        events = data;
        save();
        editing = null;
        renderGrid(); renderLedger(); renderNextUp(nepalParts(), todayKey);
      } catch (e) {
        showToast({ title: 'That file is not a valid events.json.', type: 'event', time: '' });
      }
      importFile.value = '';
    };
    reader.readAsText(f);
  });

  /* ---------- start ---------- */
  function start() {
    syncAlertBtn();
    renderGrid();
    renderLedger();
    tick();
    setInterval(tick, 1000);
  }

  if (needsSeed) {
    // First visit: load the starting events from events.json
    fetch('events.json')
      .then(function (r) { if (!r.ok) throw new Error('missing'); return r.json(); })
      .then(function (data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('bad');
        events = data; save();
      })
      .catch(fallbackSeed)
      .then(start);
  } else {
    start();
  }
})();