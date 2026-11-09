const GUEST_KEY = 'northward-week-one-v1';
const validDay = n => Number.isInteger(n) && n >= 1 && n <= 7;
const validKey = k => /^[1-7]$/.test(k);
const empty = () => ({ read: [], notes: {}, last: 1, pending: { days: {} }, imported: false });

export function sanitize(raw) {
  const value = empty();
  if (!raw || typeof raw !== 'object') return value;
  value.read = Array.isArray(raw.read) ? [...new Set(raw.read.filter(validDay))] : [];
  value.notes = Object.fromEntries(Object.entries(raw.notes || {}).filter(([k,v]) => validKey(k) && typeof v === 'string').map(([k,v]) => [k,v.slice(0,5000)]));
  value.last = validDay(raw.last) ? raw.last : 1;
  value.imported = raw.imported === true;
  for (const [k, mutation] of Object.entries(raw.pending?.days || {})) {
    if (validKey(k) && typeof mutation?.value === 'boolean' && typeof mutation.token === 'string') value.pending.days[k] = mutation;
  }
  if (validDay(raw.pending?.last?.value) && typeof raw.pending.last.token === 'string') value.pending.last = raw.pending.last;
  return value;
}

export class ReaderStore {
  constructor(storage, token = () => crypto.randomUUID()) {
    this.storage = storage;
    this.token = token;
    this.available = true;
    this.owner = null;
    this.state = this.load(null);
  }
  key(owner) { return owner ? `northward-account-v1:${owner}` : GUEST_KEY; }
  load(owner) {
    try { return sanitize(JSON.parse(this.storage.getItem(this.key(owner)) || 'null')); }
    catch { this.available = false; return empty(); }
  }
  persist(state = this.state, owner = this.owner) {
    try { this.storage.setItem(this.key(owner), JSON.stringify(state)); this.available = true; }
    catch { this.available = false; }
  }
  switchOwner(owner) { this.owner = owner; this.state = this.load(owner); return this.state; }
  setRead(day, read) {
    if (!validDay(day)) return;
    this.state.read = this.state.read.filter(n => n !== day);
    if (read) this.state.read.push(day);
    if (this.owner) this.state.pending.days[day] = {value: read, token: this.token()};
    this.persist();
  }
  setLast(day) {
    if (!validDay(day) || this.state.last === day) return;
    this.state.last = day;
    if (this.owner) this.state.pending.last = {value: day, token: this.token()};
    this.persist();
  }
  setNote(day, note) {
    if (!validDay(day)) return;
    this.state.notes[day] = String(note).slice(0,5000);
    this.persist();
  }
  pending() { return structuredClone(this.state.pending); }
  hasPending() { return Object.keys(this.state.pending.days).length > 0 || Boolean(this.state.pending.last); }
  applyRemote(remote) {
    const reads = {...(remote?.read || {})};
    for (const [day, mutation] of Object.entries(this.state.pending.days)) reads[day] = mutation.value;
    this.state.read = Object.entries(reads).filter(([k,v]) => validKey(k) && v === true).map(([k]) => Number(k));
    this.state.last = this.state.pending.last?.value ?? (validDay(remote?.last) ? remote.last : 1);
    this.persist();
  }
  acknowledge(owner, patch) {
    const state = owner === this.owner ? this.state : this.load(owner);
    for (const [day, mutation] of Object.entries(patch.days)) {
      if (state.pending.days[day]?.token === mutation.token) delete state.pending.days[day];
    }
    if (patch.last && state.pending.last?.token === patch.last.token) delete state.pending.last;
    this.persist(state, owner);
  }
  canImportGuest() { return Boolean(this.owner && !this.state.imported && this.load(null).read.length); }
  importGuest() {
    if (!this.canImportGuest()) return;
    for (const day of this.load(null).read) if (!this.state.read.includes(day)) this.setRead(day, true);
    this.state.imported = true;
    this.persist();
  }
}

// Only these fields cross the network. Notes and identity metadata never enter the payload.
export function cloudPatch(pending) {
  const patch = {};
  const days = Object.entries(pending.days);
  if (days.length) patch.read = Object.fromEntries(days.map(([day, mutation]) => [day, mutation.value]));
  if (pending.last) patch.last = pending.last.value;
  return patch;
}
