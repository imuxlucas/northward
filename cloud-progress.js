import { cloudPatch } from './reader-store.js?v=4';

async function withDeadline(task, milliseconds) {
  let timer;
  try {
    return await Promise.race([task,new Promise((_,reject)=>{
      timer=setTimeout(()=>reject({code:'auth/network-request-failed'}),milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

export async function connectProgress(store, config, notify, options = {}) {
  // Imports are deferred so a failed Google connection never prevents local reading.
  const [appSDK, authSDK, dbSDK] = await withDeadline(Promise.all([
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js')
  ]),15000);
  const app = appSDK.initializeApp(config);
  const auth = authSDK.getAuth(app);
  const db = dbSDK.getFirestore(app);
  // Explicit test-only injection; production does not read emulator settings from URLs/storage.
  if (options.emulators) {
    authSDK.connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings:true});
    dbSDK.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  const provider = new authSDK.GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  let session = null;
  let errorMessage = '';
  const humanError = error => ({
    'auth/popup-blocked':'请允许登录弹窗，或在 Chrome / Safari 中打开此网页。',
    'auth/unauthorized-domain':'此网址尚未启用 Google 登录。',
    'auth/operation-not-allowed':'Google 登录尚未启用。',
    'auth/network-request-failed':'连接失败，请检查网络后重试。',
    'permission-denied':'进度同步未获授权，请联系网站维护者。',
    'unavailable':'暂时无法连接，进度已保留在本机。'
  }[error?.code] || '暂时无法同步，请稍后重试。');
  const report = () => notify({
    user:session?.user || null,
    syncing:Boolean(session && (session.inFlight || store.hasPending())),
    connected:Boolean(session?.ready && !session?.fromCache),
    error:errorMessage
  });
  async function flush() {
    const active = session;
    if (!active?.ready || active.inFlight || !store.hasPending() || store.owner !== active.user.uid) return;
    const pending = store.pending();
    active.inFlight = true;
    errorMessage = '';
    report();
    let successful = false;
    try {
      await dbSDK.setDoc(active.ref, {...cloudPatch(pending), updatedAt:dbSDK.serverTimestamp()}, {merge:true});
      store.acknowledge(active.user.uid, pending);
      successful = true;
    } catch (error) {
      if (session === active) errorMessage = humanError(error);
    } finally {
      active.inFlight = false;
      if (session === active) { report(); if (successful && store.hasPending()) void flush(); }
    }
  }
  authSDK.onAuthStateChanged(auth, user => {
    session?.unsubscribe?.();
    session = null;
    errorMessage = '';
    store.switchOwner(user?.uid || null);
    if (!user) { report(); return; }
    const active = {user,ref:dbSDK.doc(db,'users',user.uid,'learning','week-one'),ready:false,fromCache:true,inFlight:false};
    session = active;
    report();
    active.unsubscribe = dbSDK.onSnapshot(active.ref, {includeMetadataChanges:true}, snapshot => {
      if (session !== active) return;
      active.fromCache = snapshot.metadata.fromCache;
      // An empty memory cache is not evidence of an empty account.
      if (!snapshot.metadata.fromCache) {
        store.applyRemote(snapshot.exists() ? snapshot.data() : {});
        active.ready = true;
        errorMessage = '';
      }
      report();
      if (active.ready) void flush();
    }, error => {
      if (session !== active) return;
      active.ready = false;
      errorMessage = humanError(error);
      report();
    });
  }, error => { errorMessage = humanError(error); report(); });
  window.addEventListener('online', () => { void flush(); report(); });
  window.addEventListener('offline', report);
  return {
    flush,
    async login() {
      errorMessage = ''; report();
      // Account selection is user-paced. Let Firebase detect closed/blocked popups.
      try { await authSDK.signInWithPopup(auth, provider); }
      catch (error) {
        if (!['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(error.code)) errorMessage=humanError(error);
        report();
      }
    },
    async logout() {
      try { await authSDK.signOut(auth); }
      catch (error) { errorMessage=humanError(error); report(); }
    },
    importGuest() { store.importGuest(); report(); void flush(); }
  };
}
