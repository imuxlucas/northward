import { ReaderStore } from './reader-store.js?v=4';
import { firebaseConfig } from './firebase-config.js?v=4';
function browserStorage() {
  try { return window.localStorage; }
  catch { return {getItem(){throw new Error('unavailable');},setItem(){throw new Error('unavailable');}}; }
}

(() => {
  'use strict';
  const stories = window.STORIES;
  const $ = (id) => document.getElementById(id);
  const store = new ReaderStore(browserStorage());
  let state = store.state;
  let current = state.last;
  let cloud = null;
  let loggingIn = false;
  let activeOwner = null;
  let cloudState = {user:null,syncing:false,connected:false,error:''};
  function status() {
    $('save-status').textContent = store.available ? '笔记仅保存在此浏览器' : '浏览器无法保存，请导出笔记';
    $('account-notice').textContent = cloudState.error;
    $('account-notice').hidden = !cloudState.error;
    $('login').hidden = Boolean(cloudState.user) || !firebaseConfig;
    $('login').textContent = loggingIn ? '请在弹窗中登录…' : cloud || !cloudState.error ? 'Google 登录' : '重试连接';
    $('account-menu').hidden = !cloudState.user;
    $('account-name').textContent = cloudState.user?.displayName || '我的账号';
    $('sync-status').textContent = cloudState.error ? '同步未完成' :
      !navigator.onLine ? '离线 · 进度待同步' :
      cloudState.syncing ? '正在同步…' :
      cloudState.connected ? '进度已同步' : '正在连接…';
    $('import-progress').hidden = !store.canImportGuest();
  }
  function cloudChanged(next) {
    cloudState = next;
    state = store.state;
    if (activeOwner !== store.owner) {
      activeOwner = store.owner;
      $('account-menu').open = false;
      const route = location.hash.match(/^#day-([1-7])$/);
      render(route ? Number(route[1]) : state.last, false, false);
    }
    status(); updateProgress();
  }
  const cards = stories.map(story => {
    const link = document.createElement('a');
    link.href = '#day-' + story.id;
    link.className = 'day-card';
    link.innerHTML = `<span class="number">0${story.id}</span><span class="check" aria-hidden="true"></span><h3>${story.short}</h3>`;
    $('day-grid').append(link);
    return link;
  });
  function updateProgress() {
    const count = state.read.length;
    $('progress').value = count;
    $('progress').textContent = `${count} / 7`;
    $('progress-label').textContent = `已读 ${count} / 7`;
    cards.forEach((card, index) => {
      const id = index + 1;
      const done = state.read.includes(id);
      card.setAttribute('aria-current', String(id === current));
      card.setAttribute('aria-label', `第 ${id} 天：${stories[index].short}${done ? '，已读' : ''}`);
      card.querySelector('.check').textContent = done ? '✓' : '';
    });
    const done = state.read.includes(current);
    $('mark-read').setAttribute('aria-pressed', String(done));
    $('mark-read').setAttribute('aria-label', done ? '已读，点击撤销' : '标记已读');
    $('mark-read').innerHTML = done ? '已读 <span aria-hidden="true">✓</span>' : '标记已读 <span aria-hidden="true">✓</span>';
    $('begin').href = '#day-' + state.last;
    $('begin').innerHTML = state.read.length || state.notes[state.last] || state.last > 1 ? `继续第 ${state.last} 天 <span aria-hidden="true">↗</span>` : '开启第一天 <span aria-hidden="true">↗</span>';
  }
  function render(id, focus = false, track = true) {
    current = id;
    if (track) store.setLast(id);
    state = store.state;
    const s = stories[id - 1];
    document.title = `第 ${id} 天 · ${s.short} — 向北`;
    $('story-day').textContent = `第 ${id} 天`;
    $('story-time').textContent = s.time;
    $('story-title').textContent = s.title;
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
    $('next-day').innerHTML = id === 7 ? '原典书架 <span aria-hidden="true">↗</span>' : '下一天 <span aria-hidden="true">→</span>';
    status(); updateProgress();
    if (track) void cloud?.flush();
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
    store.setRead(current, !state.read.includes(current));
    store.setLast(current);
    status(); updateProgress(); void cloud?.flush();
  });
  $('note').addEventListener('input',() => { store.setNote(current,$('note').value); status(); });
  $('export-notes').addEventListener('click',() => {
    const lines=['向北 · 第一周阅读笔记','进度与笔记导出自当前浏览器',''];
    stories.forEach(s => lines.push(`第 ${s.id} 天｜${s.title} ${state.read.includes(s.id)?'（已读）':'（未标记）'}`,`想一想：${s.question}`,state.notes[s.id] || '尚未记录。',''));
    const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.join('\n')],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a'); a.href=url; a.download='向北-第一周阅读笔记.txt'; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('login').addEventListener('click',async () => {
    loggingIn = Boolean(cloud);
    $('login').disabled = true;
    status();
    try { if (cloud) await cloud.login(); else await initializeCloud(); }
    finally { loggingIn = false; $('login').disabled = false; status(); }
  });
  $('logout').addEventListener('click',async () => {
    $('logout').disabled = true;
    try { await cloud?.logout(); } finally { $('logout').disabled = false; }
  });
  $('import-progress').addEventListener('click',() => cloud?.importGuest());
  async function initializeCloud() {
    if (!firebaseConfig) return;
    $('login').disabled = true;
    try {
      const {connectProgress} = await import('./cloud-progress.js?v=4');
      cloud = await connectProgress(store,firebaseConfig,cloudChanged);
    } catch {
      cloudState.error = 'Google 连接失败，本机阅读仍可使用。点击登录重试。';
      status();
    } finally { $('login').disabled = false; status(); }
  }
  const initial = location.hash.match(/^#day-([1-7])$/);
  render(initial ? Number(initial[1]) : current);
  void initializeCloud();
  if(initial) requestAnimationFrame(()=> { $('reading').scrollIntoView({behavior:'instant'}); });
})();
