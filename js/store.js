/* AG проект — слой данных.
   Данные сайта, заявки, фото и вход в админку хранятся на сервере sites-api (Cloudflare Worker + D1).
   Если сервер недоступен, сайт берёт данные из data/site.json (или последней сохранённой копии).
*/
window.Store = (function () {
  'use strict';

  var API = 'https://sites-api.tamerlankajrolla2.workers.dev', SITE = 'agproject';
  var LS_DATA = 'ag_data', LS_TOK = 'ag_token';

  function ls(k, v) {
    try {
      if (v === undefined) { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; }
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v));
      return v;
    } catch (e) { return null; }
  }
  var token = ls(LS_TOK) || null;
  function authed() { return !!(token && token.token && token.exp > Date.now()); }

  function req(path, opt) {
    opt = opt || {};
    var h = {};
    if (opt.type !== false) h['Content-Type'] = opt.type || 'application/json';
    if (opt.auth && authed()) h.Authorization = 'Bearer ' + token.token;
    var body = opt.body;
    if (body !== undefined && typeof body !== 'string' && !(body instanceof Blob)) body = JSON.stringify(body);
    return fetch(API + path + (path.indexOf('?') < 0 ? '?' : '&') + 'site=' + SITE, {
      method: opt.method || 'GET', headers: h, cache: 'no-store', body: body
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }
        if (!r.ok) {
          var msg = (d && d.error) || ('HTTP ' + r.status);
          if (r.status === 401 && opt.auth) { logout(); msg = 'вход истёк, обновите страницу и войдите снова'; }
          if (r.status === 401 && !opt.auth) msg = 'неверный пароль';
          if (r.status === 413) msg = 'слишком большой файл';
          var e2 = new Error(msg); e2.status = r.status; throw e2;
        }
        return d;
      });
    });
  }

  function img(id) { return id ? (/^(https?:|data:|img\/)/.test(String(id)) ? String(id) : API + '/img?site=' + SITE + '&id=' + id) : ''; }

  function fromFile() {
    var p = location.pathname.replace(/[^/]*$/, '');
    return fetch(p + 'data/site.json?v=' + Date.now()).then(function (r) {
      if (!r.ok) throw new Error('site.json не найден');
      return r.json();
    });
  }

  function arr(x) { return Array.isArray(x) ? x : []; }
  function normalize(d) {
    d = d || {};
    var s = d.settings = d.settings || {};
    s.phones = arr(s.phones); s.pay = arr(s.pay); s.credit = s.credit || {};
    var h = d.hero = d.hero || {}; h.badges = arr(h.badges); h.card = arr(h.card);
    d.services = arr(d.services).map(function (x, i) { x.id = x.id || 's' + i; x.price = +x.price || 0; x.from = x.from !== false; x.items = arr(x.items); x.on = x.on !== false; return x; });
    d.turnkey = d.turnkey || {}; d.turnkey.on = d.turnkey.on !== false;
    d.steps = arr(d.steps); d.about = d.about || {};
    d.rev = +d.rev || 1;
    return d;
  }

  var cache = null;
  function load(force) {
    if (cache && !force) return Promise.resolve(cache);
    return req('/menu').then(function (r) {
      var d = r && r.data;
      if (d && d.settings) { ls(LS_DATA, d); return normalize(d); }
      return fromFile().then(normalize);
    }).catch(function () {
      var local = ls(LS_DATA);
      return local && local.settings ? normalize(local) : fromFile().then(normalize);
    }).then(function (d) { cache = d; return d; });
  }
  function save(d) {
    cache = normalize(d);
    return req('/menu', { method: 'PUT', auth: true, body: JSON.stringify(cache) }).then(function () { ls(LS_DATA, cache); return true; });
  }
  function reset() { return fromFile().then(normalize).then(function (d) { return save(d).then(function () { return cache; }); }); }

  function createOrder(o) { return req('/order', { method: 'POST', body: o }).then(function (r) { return r || true; }).catch(function () { return false; }); }
  function listOrders(limit) { return req('/orders?limit=' + (limit || 300), { auth: true }); }
  function tgInfo() { return req('/tg', { auth: true }); }
  function tgLink() { return req('/tg/link', { method: 'POST', auth: true, body: {} }); }
  function tgOff() { return req('/tg', { method: 'DELETE', auth: true }); }
  function setStatus(id, status) { return req('/order?id=' + encodeURIComponent(id), { method: 'PATCH', auth: true, body: { status: status } }); }

  function upload(blob) { return req('/img', { method: 'POST', auth: true, type: blob.type || 'image/jpeg', body: blob }).then(function (r) { return r.id; }); }
  function removeImg(id) { return req('/img?id=' + encodeURIComponent(id), { method: 'DELETE', auth: true }); }

  function login(pass) {
    return req('/login', { method: 'POST', body: { password: pass } }).then(function (d) {
      token = { token: d.token, exp: d.exp }; ls(LS_TOK, token); return token;
    });
  }
  function logout() { token = null; ls(LS_TOK, null); }
  function changePassword(pw) { return req('/password', { method: 'POST', auth: true, body: { password: pw } }); }

  return {
    load: load, save: save, reset: reset, fromFile: fromFile, normalize: normalize, img: img,
    createOrder: createOrder, listOrders: listOrders, setStatus: setStatus, tgInfo: tgInfo, tgLink: tgLink, tgOff: tgOff,
    upload: upload, removeImg: removeImg,
    login: login, logout: logout, authed: authed, changePassword: changePassword, api: API
  };
})();
