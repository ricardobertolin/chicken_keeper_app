import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const lobbyCode = html.slice(html.indexOf('  // ---------- Online lobby (PeerJS)'), html.indexOf('  function netSendPosition()'))
  + html.slice(html.indexOf('  async function hostLobby()'), html.indexOf('  // ---------- Upgrade tree overlay'));
const turn = {
  urls: ['turn:relay.example:80', 'turns:relay.example:443?transport=tcp'],
  username: 'client-user', credential: 'client-password',
};
const endpoint = 'https://relay.example/ice-servers';

function connection() {
  const events = new Map();
  return {
    open: false, closed: false,
    on(name, cb) { if (!events.has(name)) events.set(name, []); events.get(name).push(cb); },
    emit(name, ...args) { if (name === 'open') this.open = true; for (const cb of events.get(name) || []) cb(...args); },
    close() { this.closed = true; this.open = false; this.emit('close'); },
  };
}

function client({ search = '', settings = { iceServers: [turn] }, fetcher, libraryLoaded = true } = {}) {
  const peers = [], calls = [], timers = new Map(), elements = new Map(), scripts = [];
  let timerId = 0;
  const el = id => {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', disabled: false,
      classList: { add() {}, remove() {}, toggle() {} },
    });
    return elements.get(id);
  };
  class Peer {
    constructor(id, options) { Object.assign(this, connection()); this.id = id; this.options = options; peers.push(this); }
    destroy() { this.destroyed = true; this.emit('close'); }
    connect(id, options) { this.outgoing = connection(); this.remoteId = id; this.connectOptions = options; return this.outgoing; }
  }
  const context = vm.createContext({
    ...(libraryLoaded ? { Peer } : {}), URL, URLSearchParams, AbortSignal, Uint8Array,
    console: { warn() {}, log() {} }, performance: { now: () => 100 },
    crypto: { getRandomValues: b => b.fill(0) }, location: { search },
    document: {
      getElementById: el, querySelectorAll: () => [],
      createElement: () => ({ remove() {} }), head: { appendChild: s => scripts.push(s) },
    },
    inMenu: true, multiplayer: false, starts: 0,
    startGame(mp) { context.starts++; context.inMenu = false; context.multiplayer = mp; },
    setTimeout(cb, delay) { const id = ++timerId; timers.set(id, { cb, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return fetcher ? fetcher(url, init) : Response.json(url === './multiplayer-config.json' ? settings : { iceServers: [turn] });
    },
  });
  vm.runInContext(lobbyCode, context);
  return { context, peers, calls, timers, el, scripts, Peer };
}

test('host and guest use configured client credentials before opening PeerJS', async () => {
  for (const host of [true, false]) {
    const c = client();
    await (host ? c.context.hostLobby() : c.context.joinLobby('ABC123'));
    assert.equal(c.peers.length, 1);
    assert.equal(c.calls.length, 1);
    assert.equal(c.calls[0].init.cache, 'no-store');
    const config = c.peers[0].options.config;
    assert.deepEqual(JSON.parse(JSON.stringify(config.iceServers[1])), turn);
    assert.equal(config.iceTransportPolicy, 'all');
    assert.ok(!JSON.stringify(config).includes('openrelayproject'));
  }
});

test('the deployed configuration has authenticated TURN and a TLS route on 443', async () => {
  const settings = JSON.parse(await readFile(new URL('../multiplayer-config.json', import.meta.url), 'utf8'));
  const c = client({ settings });
  await c.context.hostLobby();
  assert.equal(c.peers.length, 1);
  assert.ok(c.peers[0].options.config.iceServers.some(s => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some(u => /^turns:.*:443\?transport=tcp$/.test(u)) && s.username && s.credential;
  }));
});

test('relay-only mode applies inside the RTC config for both players', async () => {
  for (const host of [true, false]) {
    const c = client({ search: '?relay=1' });
    await (host ? c.context.hostLobby() : c.context.joinLobby('ABC123'));
    assert.equal(c.peers[0].options.config.iceTransportPolicy, 'relay');
    assert.ok(!c.el('lobbyCode').textContent.includes(turn.credential));
  }
});

test('temporary credentials are fetched over HTTPS using an uncached POST', async () => {
  for (const host of [true, false]) {
    const c = client({ settings: { turnCredentialsUrl: endpoint, iceServers: [] } });
    await (host ? c.context.hostLobby() : c.context.joinLobby('ABC123'));
    assert.equal(c.calls[1].url, endpoint);
    assert.equal(c.calls[1].init.method, 'POST');
    assert.equal(c.calls[1].init.cache, 'no-store');
    assert.equal(c.calls[1].init.credentials, 'omit');
    assert.deepEqual(JSON.parse(JSON.stringify(c.peers[0].options.config.iceServers[1])), turn);
  }
});

test('invalid, conflicting or incomplete settings block lobby creation and allow retry', async () => {
  for (const settings of [
    null, { iceServers: {} }, { turnCredentialsUrl: 12 },
    { turnCredentialsUrl: endpoint, iceServers: [turn] },
    { turnCredentialsUrl: 'http://relay.example/credentials' },
    { iceServers: [{ urls: 'turn:relay.example', username: 'missing-password' }] },
    { iceServers: [{ urls: 'https://relay.example' }] },
    { iceServers: [{ urls: [] }] }, { iceServers: [null] },
    { iceServers: [{ urls: 'stun:relay.example' }] },
  ]) {
    const c = client({ settings });
    await c.context.joinLobby('ABC123');
    assert.equal(c.peers.length, 0);
    assert.ok(c.el('joinStatus').textContent.trim());
    assert.equal(c.el('btnJoinConnect').disabled, false);
  }
});

test('settings and configured service failures do not fall back to obsolete relays', async () => {
  for (const failure of [
    () => new Response('', { status: 503 }),
    () => new Response('', { status: 429 }),
    () => Response.json({ iceServers: [] }),
    () => { throw new Error('Network unavailable'); },
  ]) {
    const c = client({ fetcher: async url => url === './multiplayer-config.json'
      ? Response.json({ turnCredentialsUrl: endpoint }) : failure() });
    await c.context.joinLobby('ABC123');
    assert.equal(c.peers.length, 0);
    assert.equal(c.el('btnJoinConnect').disabled, false);
    assert.ok(c.el('joinStatus').textContent.trim());
  }
  const c = client({ fetcher: async () => new Response('', { status: 404 }) });
  await c.context.hostLobby();
  assert.equal(c.peers.length, 0);
  assert.match(c.el('hostStatus').textContent, /settings/);
});

test('empty configuration explains direct-only play and rejects relay-only mode', async () => {
  const c = client({ settings: {} });
  await c.context.hostLobby();
  c.peers[0].emit('open');
  assert.match(c.el('hostStatus').textContent, /Direct connections only/);
  assert.equal(c.peers[0].options.config.iceServers.length, 1);
  const relay = client({ settings: {}, search: '?relay=1' });
  await relay.context.hostLobby();
  assert.equal(relay.peers.length, 0);
  assert.match(relay.el('hostStatus').textContent, /configured TURN/);
});

test('cancelling while credentials load never creates a late host or guest', async () => {
  for (const host of [true, false]) {
    let resolve;
    const pending = new Promise(r => { resolve = r; });
    const c = client({ fetcher: () => pending });
    const attempt = host ? c.context.hostLobby() : c.context.joinLobby('ABC123');
    c.context.teardownConnection();
    resolve(Response.json({ iceServers: [turn] }));
    await attempt;
    assert.equal(c.peers.length, 0);
    assert.equal(c.el('btnJoinConnect').disabled, false);
  }
});

test('cancelled PeerJS loading cannot reopen a lobby; script failure permits retry', async () => {
  const c = client({ libraryLoaded: false });
  const attempt = c.context.hostLobby();
  c.context.teardownConnection();
  c.context.Peer = c.Peer;
  c.scripts[0].onload();
  await attempt;
  assert.equal(c.peers.length, 0);
  const failed = client({ libraryLoaded: false });
  const joining = failed.context.joinLobby('ABC123');
  failed.scripts[0].onerror();
  await joining;
  assert.match(failed.el('joinStatus').textContent, /PeerJS failed/);
  assert.equal(failed.el('btnJoinConnect').disabled, false);
  failed.context.Peer = failed.Peer;
  await failed.context.joinLobby('ABC123');
  assert.equal(failed.peers.length, 1);
});

async function offered(host) {
  const c = client();
  await (host ? c.context.hostLobby() : c.context.joinLobby('ABC123'));
  const p = c.peers[0];
  p.emit('open');
  const channel = host ? connection() : p.outgoing;
  if (host) p.emit('connection', channel);
  return { ...c, channel };
}

test('host and guest timeouts close pending channels and ignore late opens', async () => {
  for (const host of [true, false]) {
    const c = await offered(host);
    const timer = [...c.timers.values()][0];
    assert.equal(timer.delay, 15000);
    timer.cb();
    assert.equal(c.channel.closed, true);
    assert.equal(c.peers[0].destroyed, true);
    assert.match(c.el(host ? 'hostStatus' : 'joinStatus').textContent, /even through the relay/);
    c.channel.emit('open');
    assert.equal(c.context.starts, 0);
    assert.equal(c.timers.size, 0);
  }
});

test('successful channels start both roles and clear connection timers', async () => {
  for (const host of [true, false]) {
    const c = await offered(host);
    c.channel.emit('open');
    assert.equal(c.context.starts, 1);
    assert.equal(c.timers.size, 0);
  }
});

test('pending channel errors and broker errors settle promptly', async () => {
  for (const name of ['error', 'close']) {
    const c = await offered(false);
    c.channel.emit(name);
    assert.equal(c.timers.size, 0);
    assert.equal(c.el('btnJoinConnect').disabled, false);
    c.channel.emit('open');
    assert.equal(c.context.starts, 0);
  }
  const c = await offered(false);
  c.peers[0].emit('error', { type: 'peer-unavailable' });
  assert.equal(c.timers.size, 0);
  assert.match(c.el('joinStatus').textContent, /No lobby/);
});

test('retries ignore old broker and channel events; host reserves one pending slot', async () => {
  const c = await offered(false);
  await c.context.joinLobby('NEW123');
  c.peers[0].emit('open');
  c.peers[0].emit('error', { type: 'network' });
  c.channel.emit('open');
  assert.equal(c.peers[1].destroyed, undefined);
  assert.equal(c.context.starts, 0);
  c.peers[1].emit('open');
  c.peers[1].outgoing.emit('open');
  c.channel.emit('close');
  assert.equal(c.context.starts, 1);
  assert.equal(c.peers[1].outgoing.closed, false);
  const host = await offered(true);
  const extra = connection();
  host.peers[0].emit('connection', extra);
  assert.equal(extra.closed, true);
  host.channel.emit('open');
  assert.equal(host.context.starts, 1);
});

test('join Back button tears down the pending lobby', () => {
  const handlers = new Map();
  const button = { dataset: { back: 'online' }, addEventListener: (name, cb) => handlers.set(name, cb) };
  const calls = [];
  const marker = "  document.querySelectorAll('#menu .menu-back[data-back]')";
  const source = html.slice(html.indexOf(marker), html.indexOf('  requestAnimationFrame(loop);', html.indexOf(marker)));
  vm.runInNewContext(source, {
    document: { querySelectorAll: () => [button] },
    teardownConnection: () => calls.push('teardown'), showScreen: screen => calls.push(screen),
  });
  handlers.get('click')();
  assert.deepEqual(calls, ['teardown', 'online']);
});

test('service worker never caches config, including relay-query URLs, or intercepts credential POSTs', async () => {
  const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const handlers = {}, calls = [];
  vm.runInNewContext(source, {
    URL,
    self: { location: { href: 'https://game.example/chicken/sw.js' }, addEventListener: (name, cb) => { handlers[name] = cb; } },
    fetch: async (...args) => { calls.push(args); return Response.json({}); },
    caches: { match() { assert.fail('Config must not access offline cache'); } },
  });
  for (const suffix of ['', '?refresh=1']) {
    let result;
    handlers.fetch({ request: new Request('https://game.example/chicken/multiplayer-config.json' + suffix), respondWith(p) { result = p; } });
    await result;
    assert.equal(calls.at(-1)[1].cache, 'no-store');
  }
  handlers.fetch({ request: new Request(endpoint, { method: 'POST' }), respondWith() { assert.fail('POST must bypass caching'); } });
  const assets = vm.runInNewContext(source + '\nASSETS;', {
    self: { addEventListener() {} },
  });
  assert.ok(!assets.includes('./multiplayer-config.json'));
});

test('all inline game scripts parse', () => {
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
