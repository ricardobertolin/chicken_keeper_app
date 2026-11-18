import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const build = vm.runInNewContext(sw + '\n({version: BUILD_VERSION, cache: VERSION, assets: ASSETS})', {
  self: {addEventListener() {}},
});

test('every game script and stylesheet has the displayed build version in its URL', () => {
  const titleVersion = html.match(/class="menu-version">v([\d.]+)/)[1];
  assert.equal(build.version, titleVersion);
  assert.equal(build.cache, 'chicken-keeper-v' + titleVersion);
  const assetUrls = [...html.matchAll(/(?:src|href)="((?:js\/[^"?]+\.js|styles\.css)[^"]*)"/g)]
    .map(match => match[1]);
  assert.ok(assetUrls.length > 10);
  for (const asset of assetUrls) {
    assert.equal(new URL(asset, 'https://game.example/').searchParams.get('v'), titleVersion, asset);
    assert.ok(build.assets.includes('./' + asset), 'offline cache must include the exact versioned URL: ' + asset);
  }
});

test('old cached script URLs cannot satisfy a new build request', async () => {
  const oldUrl = 'https://game.example/js/render.js';
  const newUrl = oldUrl + '?v=' + build.version;
  const oldCache = new Map([[oldUrl, new Response('old robot renderer')]]);
  const handlers = {};
  let networkRequest;
  vm.runInNewContext(sw, {
    URL,
    self: {location: {href: 'https://game.example/sw.js'}, addEventListener(name, cb) {handlers[name] = cb;}},
    caches: {
      async match(request) {return oldCache.get(request.url);},
      async open() {return {async put() {}};},
    },
    async fetch(request) {networkRequest = request.url; return new Response('new robot renderer');},
  });
  let response;
  handlers.fetch({request: new Request(newUrl), respondWith(promise) {response = promise;}});
  assert.equal(await (await response).text(), 'new robot renderer');
  assert.equal(networkRequest, newUrl);
});
