(() => {
  'use strict';
  const stories = window.STORIES;
  const $ = (id) => document.getElementById(id);
  const key = 'northward-week-one-v1';
  let state = { read: [], notes: {}, last: 1 };
  let storageAvailable = true;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && typeof saved === 'object') {
      state.read = Array.isArray(saved.read) ? [...new Set(saved.read.filter(n => Number.isInteger(n) && n >= 1 && n <= 7))] : [];
      state.notes = Object.fromEntries(Object.entries(saved.notes && typeof saved.notes === 'object' ? saved.notes : {}).filter(([k, v]) => /^[1-7]$/.test(k) && typeof v === 'string').map(([k,v]) => [k,v.slice(0,5000)]));
      state.last = Number.isInteger(saved.last) && saved.last >= 1 && saved.last <= 7 ? saved.last : 1;
    }
  } catch { storageAvailable = false; }
  let current = state.last;
  const save = () => {
    try { localStorage.setItem(key, JSON.stringify(state)); storageAvailable = true; }
    catch { storageAvailable = false; }
  };
  const status = () => {
    $('save-status').textContent = storageAvailable ? (state.notes[current] ? '已保存 · 仅在当前浏览器' : '笔记仅保存在当前浏览器') : '浏览器无法保存，离开前请导出笔记';
  };
  const cards = stories.map(story => {
    const link = document.createElement('a');
    link.href = '#day-' + story.id;
    link.className = 'day-card';
    link.innerHTML = `<span class="number">0${story.id}</span><span class="check" aria-hidden="true"></span><h3>${story.short}</h3><span class="tag">${story.motif}<span class="day-label"> · DAY ${story.id}</span></span>`;
    $('day-grid').append(link);
    return link;
  });
  function updateProgress() {
    const count = state.read.length;
    $('progress').value = count;
    $('progress').textContent = `${count} / 7`;
    $('progress-label').textContent = `旅程进度 · ${count} / 7`;
    $('progress-caption').textContent = count === 7 ? '第一周已完成。故事会留下来，随时回来重读。' : '不用赶路，按自己的节奏读。';
    cards.forEach((card, index) => {
      const id = index + 1;
      const done = state.read.includes(id);
      card.setAttribute('aria-current', String(id === current));
      card.setAttribute('aria-label', `第 ${id} 天：${stories[index].short}${done ? '，已读' : ''}`);
      card.querySelector('.check').textContent = done ? '✓' : '';
    });
    const done = state.read.includes(current);
    $('mark-read').setAttribute('aria-pressed', String(done));
    $('mark-read').innerHTML = done ? '已读完 · 点击撤销 <span aria-hidden="true">✓</span>' : '标记今天已读 <span aria-hidden="true">✓</span>';
    $('begin').href = '#day-' + state.last;
    $('begin').innerHTML = state.read.length || state.notes[state.last] || state.last > 1 ? `继续第 ${state.last} 天 <span aria-hidden="true">↗</span>` : '开启第一天 <span aria-hidden="true">↗</span>';
  }
  function render(id, focus = false) {
    current = id;
    state.last = id;
    const s = stories[id - 1];
    document.title = `第 ${id} 天 · ${s.short} — 向北`;
    $('story-day').textContent = `DAY 0${id} / ${s.motif}`;
    $('story-time').textContent = `阅读与思考约 ${s.time}`;
    $('story-english').textContent = s.english;
    $('story-title').textContent = s.title;
    $('story-intro').textContent = s.intro;
    $('story-body').replaceChildren(...s.paragraphs.map(text => { const p=document.createElement('p'); p.textContent=text; return p; }));
    $('people').replaceChildren(...s.people.map(([name, detail]) => {
      const group=document.createElement('div'); const dt=document.createElement('dt'); const dd=document.createElement('dd');
      dt.textContent=name; dd.textContent=detail; group.append(dt,dd); return group;
    }));
    $('lens').textContent = s.lens;
    $('question').textContent = s.question;
    $('note').value = state.notes[id] || '';
    $('version-note').textContent = s.note;
    $('sources').replaceChildren(...s.sources.map(source => {
      const li=document.createElement('li'); const a=document.createElement('a'); const desc=document.createElement('span');
      a.href=source.url; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent=source.title+' ↗'; desc.textContent=source.where; li.append(a,desc); return li;
    }));
    document.querySelector('.source-details').open = false;
    $('next-day').href = id === 7 ? '#library' : '#day-' + (id+1);
    $('next-day').innerHTML = id === 7 ? '去原典书架 <span aria-hidden="true">↗</span>' : `下一天 · ${stories[id].short} <span aria-hidden="true">→</span>`;
    save(); status(); updateProgress();
    if (focus) {
      $('story-title').focus({preventScroll:true});
      $('reading').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    }
  }
  function fromHash() { const match=location.hash.match(/^#day-([1-7])$/); if(match) render(Number(match[1]),true); }
  window.addEventListener('hashchange',fromHash);
  document.addEventListener('click',event => {
    const anchor=event.target.closest('a[href^="#day-"]');
    if(anchor && anchor.hash === location.hash) { event.preventDefault(); fromHash(); }
  });
  $('mark-read').addEventListener('click',() => {
    state.read = state.read.includes(current) ? state.read.filter(id => id !== current) : [...state.read,current];
    save(); status(); updateProgress();
  });
  $('note').addEventListener('input',() => { state.notes[current]=$('note').value; save(); status(); });
  $('export-notes').addEventListener('click',() => {
    const lines=['向北 · 第一周阅读笔记','进度与笔记导出自当前浏览器',''];
    stories.forEach(s => lines.push(`第 ${s.id} 天｜${s.title} ${state.read.includes(s.id)?'（已读）':'（未标记）'}`,`想一想：${s.question}`,state.notes[s.id] || '尚未记录。',''));
    const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.join('\n')],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a'); a.href=url; a.download='向北-第一周阅读笔记.txt'; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const initial = location.hash.match(/^#day-([1-7])$/);
  render(initial ? Number(initial[1]) : current);
  if(initial) requestAnimationFrame(()=> { $('reading').scrollIntoView({behavior:'instant'}); });
})();
