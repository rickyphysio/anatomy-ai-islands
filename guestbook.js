/* 訪客留名面板 (Visitor Guestbook - Wishing Lanterns).
   訪客文字一律用 textContent 顯示，不用 innerHTML。
   網站檔案不包含試算表 ID，僅呼叫 GAS endpoint。 */
(function () {
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
  const BLOCKED = ['幹你娘', '操你媽', '去死', '白癡', '智障', 'fuck', 'shit'];
  const LIMITS = { name: 16, message: 60, island: 30 };

  let o, panel, listBox, statusBox, form, requestId = rid(), entries = [], total = 0, last;

  function say(text, bad) {
    if (!statusBox) return;
    statusBox.textContent = text;
    statusBox.classList.toggle('bad', !!bad);
  }

  function cleanText(value) {
    return String(value == null ? '' : value)
      .normalize('NFC')
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function checkReject(text, labelEn, labelZh) {
    const low = text.toLowerCase();
    if (/https?:|www\.|\b[a-z0-9-]+\.(com|net|org|tw|io|app|dev|cc|me)\b/i.test(text)) {
      return `${labelEn} cannot contain URLs (${labelZh}不能放網址)`;
    }
    if (/[\w.+-]+@[\w-]+\.\w+/.test(text)) {
      return `${labelEn} cannot contain email addresses (${labelZh}不能放電子郵件)`;
    }
    if (/\d[\d\s-]{7,}\d/.test(text)) {
      return `${labelEn} cannot contain phone numbers or long digit strings (${labelZh}不能放電話或長串數字)`;
    }
    if (BLOCKED.some(w => low.indexOf(w) >= 0)) {
      return `${labelEn} contains inappropriate words (${labelZh}有不適合公開的文字)`;
    }
    return '';
  }

  function validateInput(rawName, rawMsg) {
    const name = cleanText(rawName);
    const msg = cleanText(rawMsg);
    if (!name) return 'Please enter a nickname (請寫下暱稱)';
    if (Array.from(name).length > LIMITS.name) {
      return `Nickname cannot exceed ${LIMITS.name} characters (暱稱最多 ${LIMITS.name} 個字)`;
    }
    if (Array.from(msg).length > LIMITS.message) {
      return `Message cannot exceed ${LIMITS.message} characters (留言最多 ${LIMITS.message} 個字)`;
    }
    return checkReject(name, 'Nickname', '暱稱') || checkReject(msg, 'Message', '留言');
  }

  function draw() {
    listBox.textContent = '';
    if (!entries.length) {
      listBox.append(el('p', 'gb-empty', 'No public lanterns yet—be the first to leave a wish! (還沒有公開留名，你可以當第一位)'));
      return;
    }
    entries.forEach(e => {
      const row = el('article', 'gb-row');
      row.append(el('b', null, String(e.name || '')));
      if (e.message) row.append(el('span', null, String(e.message)));
      const dateStr = e.at ? new Date(e.at).toLocaleDateString('en-US', { timeZone: 'Asia/Taipei' }) : '';
      row.append(el('small', null, [e.island, dateStr].filter(Boolean).join(' · ')));
      listBox.append(row);
    });
  }

  async function load() {
    try {
      const r = await fetch(o.endpoint, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.message || 'HTTP ' + r.status);
      entries = Array.isArray(j.entries) ? j.entries : [];
      total = Number(j.total) || entries.length;
      if (form && form.elements.message) {
        form.elements.message.closest('label').hidden = j.askMessage === false;
      }
      panel.querySelector('.gb-count').textContent = `${total} visitor(s) have lit a lantern (已有 ${total} 位訪客留名)`;
      draw();
      if (o.onEntries) o.onEntries(entries, total);
    } catch (e) {
      entries = [];
      total = 0;
      if (panel) {
        panel.querySelector('.gb-count').textContent = '';
        listBox.textContent = '';
        listBox.append(el('p', 'gb-empty', 'Guestbook service is temporarily unavailable. Please try again later. (留名服務暫時連不上，稍後再試。)'));
      }
      if (o.onEntries) o.onEntries([], 0);
    }
    return entries;
  }

  async function submit(ev) {
    ev.preventDefault();
    const btn = form.querySelector('button[type=submit]'), f = form.elements;
    const errMsg = validateInput(f.name.value, f.message ? f.message.value : '');
    if (errMsg) {
      say(errMsg, true);
      return;
    }
    btn.disabled = true;
    say('Sending lantern... (送出中…)', false);
    try {
      /* Google Apps Script 不接受預檢請求，要用 text/plain */
      const gas = /script\.google\.com/.test(o.endpoint);
      const r = await fetch(o.endpoint, {
        method: 'POST',
        headers: { 'content-type': gas ? 'text/plain;charset=utf-8' : 'application/json' },
        body: JSON.stringify({
          name: cleanText(f.name.value),
          message: f.message ? cleanText(f.message.value) : '',
          island: f.island ? f.island.value : '',
          website: f.website.value,
          requestId
        })
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        say(j.message || 'Could not submit right now, please try again later (送不出去，請稍後再試)', true);
        return;
      }
      requestId = rid();
      form.reset();
      say(
        j.status === 'public'
          ? 'Lantern lit! Your name is now on the island. (留名成功，你的名字已經在島上了。)'
          : 'Submitted! Your lantern will appear on the island once approved by the island host. (已送出，島主在試算表勾選公開後就會出現在島上。)',
        false
      );
      await load();
    } catch (e) {
      say('Guestbook service is temporarily unreachable; your text is kept so you can try again. (連不上留名服務，內容還在，可以再按一次。)', true);
    } finally {
      btn.disabled = false;
    }
  }

  function open() {
    last = document.activeElement;
    panel.hidden = false;
    load();
    if (form && form.elements.name) form.elements.name.focus();
  }

  function close() {
    if (!panel) return;
    panel.hidden = true;
    if (last && last.focus) last.focus();
  }

  function mount(opts) {
    o = { endpoint: '/api/guestbook', title: 'Wishing Lantern Guestbook (到此一遊)', islands: [], button: true, ...opts };
    panel = el('section', 'gb-panel');
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', o.title);
    const head = el('header', 'gb-head');
    head.append(el('h2', null, o.title));
    const x = el('button', 'gb-close', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close Guestbook (關閉)');
    x.addEventListener('click', close);
    head.append(x);

    form = el('form', 'gb-form');
    form.noValidate = true;
    const field = (label, name, max, ph) => {
      const l = el('label', null, label), i = el('input');
      i.name = name;
      i.placeholder = ph;
      i.autocomplete = 'off';
      i.dataset.maxChars = String(max);
      l.append(i);
      return l;
    };
    const nameBox = field('Nickname (暱稱，最多 16 字)', 'name', 16, 'Use a nickname, not your real name (請用暱稱)');
    nameBox.querySelector('input').required = true;
    form.append(nameBox, field('Wish / Message (想說的話，最多 60 字)', 'message', 60, 'Up to 60 characters, no URLs or phone numbers'));

    if (o.islands.length) {
      const l = el('label', null, 'Island (留在哪座島)'), s = el('select');
      s.name = 'island';
      o.islands.forEach(n => s.append(new Option(n, n)));
      l.append(s);
      form.append(l);
    }

    const trap = el('input', 'gb-trap');
    trap.name = 'website';
    trap.tabIndex = -1;
    trap.autocomplete = 'off';
    trap.setAttribute('aria-hidden', 'true');
    form.append(trap);

    form.append(el('p', 'gb-note', 'Publicly visible after host review. Do not enter real names, phone numbers, emails, or URLs. (島主審核公開後所有人皆可見，請勿填寫個資、電話或網址。)'));
    const go = el('button', 'gb-send', '🏮 Light Wishing Lantern (留下名字)');
    go.type = 'submit';
    form.append(go);

    statusBox = el('p', 'gb-status');
    statusBox.setAttribute('role', 'status');
    form.append(statusBox);
    form.addEventListener('submit', submit);

    listBox = el('div', 'gb-list');
    panel.append(head, form, el('p', 'gb-count'), listBox);
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.body.append(panel);

    if (o.button) {
      const b = el('button', 'gb-open', '✍️ Guestbook (留名)');
      b.type = 'button';
      b.setAttribute('aria-label', 'Open Wishing Lantern Guestbook');
      b.addEventListener('click', open);
      document.body.append(b);
    }
    return load();
  }

  window.IslandGuestbook = {
    mount,
    open,
    close,
    reload: () => load(),
    setEndpoint: (ep) => { if (o) o.endpoint = ep; return load(); },
    getEndpoint: () => (o ? o.endpoint : ''),
    validateInput,
    renderMockEntries: (mockList) => {
      entries = Array.isArray(mockList) ? mockList : [];
      total = entries.length;
      draw();
      if (o && o.onEntries) o.onEntries(entries, total);
    },
    get entries() { return entries; }
  };
})();
