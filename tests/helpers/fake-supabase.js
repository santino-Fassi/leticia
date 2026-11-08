export function createFakeSupabase(seed = []) {
  const state = {
    wishes: structuredClone(seed), files: new Map(), reservations: new Map(),
    users: new Map([['admin-token', { id: '00000000-0000-4000-8000-000000000001' }], ['visitor-token', { id: '00000000-0000-4000-8000-000000000002' }]]),
    admins: new Set(['00000000-0000-4000-8000-000000000001']),
    failUploadAt: 0, uploadCalls: 0, failInsert: false, failRemove: false, raceUpdate: false,
    signedPaths: [],
  };
  class Query {
    constructor() { this.filters = []; this.operation = 'select'; this.columns = '*'; this.rangeStart = 0; this.rangeEnd = Infinity; this.orders = []; }
    select(columns = '*') { this.columns = columns; return this; }
    insert(value) { this.operation = 'insert'; this.value = value; return this; }
    update(value) { this.operation = 'update'; this.value = value; return this; }
    eq(column, value) { this.filters.push([column, value]); return this; }
    order(column, options) { this.orders.push([column, options]); return this; }
    range(from, to) { this.rangeStart = from; this.rangeEnd = to; return this; }
    maybeSingle() { this.single = true; return this; }
    async execute() {
      if (this.operation === 'insert') {
        if (state.failInsert) return { data: null, error: { code: 'INSERT_FAILED' } };
        state.wishes.push({ created_at: new Date().toISOString(), ...structuredClone(this.value) });
        return { data: null, error: null };
      }
      let rows = state.wishes.filter((row) => this.filters.every(([key, value]) => row[key] === value));
      if (this.operation === 'update') {
        if (state.raceUpdate) { state.raceUpdate = false; rows = []; }
        for (const row of rows) Object.assign(row, structuredClone(this.value));
      }
      for (const [key, options] of [...this.orders].reverse()) {
        rows = [...rows].sort((a, b) => (String(a[key]).localeCompare(String(b[key]))) * (options?.ascending === false ? -1 : 1));
      }
      rows = rows.slice(this.rangeStart, this.rangeEnd + 1).map((row) => {
        if (this.columns === '*') return structuredClone(row);
        return Object.fromEntries(this.columns.split(',').map((key) => [key.trim(), row[key.trim()]]));
      });
      return { data: this.single ? rows[0] || null : rows, error: null };
    }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
  }
  const client = {
    auth: { getUser: async (token) => ({ data: { user: state.users.get(token) || null }, error: state.users.has(token) ? null : { message: 'invalid' } }) },
    rpc: async (name, args) => {
      if (name === 'is_wall_admin_for') return { data: state.admins.has(args.p_user_id), error: null };
      if (name === 'reserve_wish_submission') {
        if (state.reservations.has(args.p_nonce)) return { error: { message: 'SUBMISSION_REPLAY' } };
        if ([...state.reservations.values()].filter((value) => value === args.p_fingerprint).length >= 3) return { error: { message: 'SUBMISSION_RATE_LIMIT' } };
        state.reservations.set(args.p_nonce, args.p_fingerprint);
        return { data: null, error: null };
      }
      throw new Error('Unexpected RPC');
    },
    from: () => new Query(),
    storage: { from: () => ({
      upload: async (path, body, options) => {
        state.uploadCalls++;
        if (state.uploadCalls === state.failUploadAt) return { error: { code: 'UPLOAD_FAILED' } };
        state.files.set(path, { body, options });
        return { data: { path }, error: null };
      },
      remove: async (paths) => {
        if (state.failRemove) return { error: { code: 'REMOVE_FAILED' } };
        paths.forEach((path) => state.files.delete(path));
        return { data: paths, error: null };
      },
      createSignedUrls: async (paths) => {
        state.signedPaths.push(...paths);
        return { data: paths.map((path) => ({ path, signedUrl: 'https://test.supabase.co/signed/' + path })), error: null };
      },
    }) },
  };
  return { client, state };
}
export function sampleWish(index = 1, status = 'pending') {
  const id = '00000000-0000-4000-8000-' + String(index).padStart(12, '0');
  return { id, name: 'Alumna ' + index, city: 'Córdoba', country: 'Argentina', message: 'Gracias por compartir tantos años de creatividad.', status, photo_path: null, thumbnail_path: null, created_at: new Date(2026, 0, index).toISOString() };
}
