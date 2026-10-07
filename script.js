// ==UserScript==
// @name         移除 uview-plus 官方文档网站广告与反调试
// @namespace    https://uview-plus.jiangruyi.com/
// @version      3.1.0
// @description  屏蔽扫码弹窗（含自愈检测）、Google Vignette 全屏广告、反广告拦截横幅、侧栏卡片，解除反调试并恢复 F12 与右键
// @author       you
// @match        https://uview-plus.jiangruyi.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // 1. 反调试（修正版）
    //    - 只劫持 console.clear，不动 log/error，DevTools 控制台可用
    //    - 捕获阶段放行右键与 F12，阻断站点的 preventDefault
    //    - 保护 documentElement.innerHTML 不被清空（白屏根因）
    // ============================================================
    (function antiDevtool() {
        // 1.1 只屏蔽 clear：站点的 clearLog 循环靠它刷屏，不影响 DevTools
        try {
            console.clear = function () {};
        } catch (_) {}

        // 1.2 冻结原生原型，让 detector 无法通过覆盖 toString 来自检
        try { Object.freeze(Date.prototype); } catch (_) {}
        try { Object.freeze(Function.prototype); } catch (_) {}

        // 1.3 捕获阶段拦截：让浏览器默认右键菜单与 F12 正常触发
        function allowNative(event) {
            event.stopImmediatePropagation();
        }
        window.addEventListener('contextmenu', allowNative, true);
        window.addEventListener('keydown', allowNative, true);
        window.addEventListener('keyup', allowNative, true);
        window.addEventListener('mousedown', allowNative, true);
        window.addEventListener('mouseup', allowNative, true);
        window.addEventListener('click', allowNative, true);

        // 1.4 禁止清空整个页面（disable-devtool 的 rewriteHTML: ""）
        try {
            var desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
            if (desc && desc.set) {
                var rawSet = desc.set;
                Object.defineProperty(Element.prototype, 'innerHTML', {
                    configurable: true,
                    get: desc.get,
                    set: function (html) {
                        if (typeof html === 'string' && html.replace(/\s/g, '') === '') return;
                        rawSet.call(this, html);
                    }
                });
            }
        } catch (_) {}

        // 1.5 阻止 window.close() 自关
        try {
            window.close = function () {};
        } catch (_) {}

        // 1.6 持续挂起 detector 定时器
        (function suspend() {
            var tries = 0;
            var t = setInterval(function () {
                tries++;
                if (window.DisableDevtool) {
                    try { window.DisableDevtool.isSuspend = true; } catch (_) {}
                }
                if (tries > 200) clearInterval(t);
            }, 200);
        })();
    })();

    // ============================================================
    // 2. localStorage 伪装免广告状态
    // ============================================================
    var AD_WINDOW = 43200;
    var AD_KEYS = ['adExpire3', 'adExpire2'];
    var VIP_KEY = 'vipNoGoogleAdsExpire';

    function prefillLocalStorage() {
        try {
            var now = Math.floor(Date.now() / 1000);

            for (var i = 0; i < AD_KEYS.length; i++) {
                var k = AD_KEYS[i];
                var s = Number(localStorage.getItem(k));
                if (!Number.isFinite(s) || s <= now || s > now + AD_WINDOW) {
                    localStorage.setItem(k, String(now + AD_WINDOW));
                }
            }

            var sv = Number(localStorage.getItem(VIP_KEY));
            if (!Number.isFinite(sv) || sv <= now) {
                localStorage.setItem(VIP_KEY, String(now + 365 * 24 * 3600));
            }
        } catch (_) {}
    }

    // ============================================================
    // 3. 广告 API 劫持：伪造会员响应
    // ============================================================
    var AD_API_PATTERN = 'uiadmin.net/api/v1/wxapp/ad';

    function fakeAdPayload() {
        var rounded = 60000 * Math.floor(Date.now() / 60000);
        var payload = { code: 200, data: {} };
        payload.data['yoip' + rounded] = true;
        return payload;
    }

    function isAdApiUrl(url) {
        if (typeof url === 'string') return url.indexOf(AD_API_PATTERN) !== -1;
        if (url && typeof url.url === 'string') return url.url.indexOf(AD_API_PATTERN) !== -1;
        return false;
    }

    (function blockAdApi() {
        var of = window.fetch;
        if (of && !of._adPatched) {
            var patchedFetch = function () {
                if (isAdApiUrl(arguments[0])) {
                    prefillLocalStorage();
                    var p = fakeAdPayload();
                    var s = JSON.stringify(p);
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        json: function () { return Promise.resolve(p); },
                        text: function () { return Promise.resolve(s); },
                        clone: function () { return this; }
                    });
                }
                return of.apply(this, arguments);
            };
            patchedFetch._adPatched = true;
            window.fetch = patchedFetch;
        }

        function patchAxios() {
            if (!window.axios || window.axios._adPatched) return;
            var origPost = window.axios.post.bind(window.axios);
            window.axios.post = function (url) {
                if (isAdApiUrl(url)) {
                    prefillLocalStorage();
                    return Promise.resolve({ data: fakeAdPayload() });
                }
                return origPost.apply(null, arguments);
            };
            window.axios._adPatched = true;
        }
        patchAxios();
        var axTimer = setInterval(function () {
            patchAxios();
            if (window.axios && window.axios._adPatched) clearInterval(axTimer);
        }, 50);
    })();

    // ============================================================
    // 4. 反检测：拦下页面自愈惩罚
    // ============================================================
    function protectDocumentOpacity() {
        try {
            var el = document.documentElement;
            if (!el) return false;
            Object.defineProperty(el.style, 'opacity', {
                configurable: true,
                get: function () {
                    var v = this.getPropertyValue('opacity');
                    return v === '' ? '1' : v;
                },
                set: function (v) {
                    if (v === '0' || v === 0) return;
                    this.setProperty('opacity', v);
                }
            });
            return true;
        } catch (_) { return false; }
    }
    protectDocumentOpacity();

    (function blockAlert() {
        var originalAlert = window.alert;
        if (!originalAlert || originalAlert._adPatched) return;
        var patched = function () {
            var hit = Array.prototype.some.call(arguments, function (a) {
                return typeof a === 'string' && a.indexOf('广告屏蔽') !== -1;
            });
            if (hit) return;
            return originalAlert.apply(this, arguments);
        };
        patched._adPatched = true;
        window.alert = patched;
    })();

    // ============================================================
    // 5. 假弹窗节点：骗过站点自愈检查
    // ============================================================
    function createFakeDialog() {
        if (!document.body) {
            setTimeout(createFakeDialog, 100);
            return;
        }

        if (!document.getElementById('pleasePrNotCrack')) {
            var d1 = document.createElement('div');
            d1.id = 'pleasePrNotCrack';
            d1.style.cssText = 'display:none;visibility:hidden;opacity:0;position:absolute;left:-9999px;top:-9999px;z-index:-9999';
            document.body.appendChild(d1);
        }

        if (!document.querySelector('.v-modal')) {
            var d2 = document.createElement('div');
            d2.className = 'v-modal';
            d2.style.cssText = 'display:none;visibility:visible;position:absolute;left:-9999px;top:-9999px;z-index:2000';
            document.body.appendChild(d2);
        }

        if (!document.querySelector('.el-dialog__wrapper')) {
            var d3 = document.createElement('div');
            d3.className = 'el-dialog__wrapper';
            d3.style.cssText = 'display:none;visibility:visible;position:absolute;left:-9999px;top:-9999px;z-index:2001';
            document.body.appendChild(d3);
        }
    }

    // ============================================================
    // 6. 选择器与 CSS
    // ============================================================
    var AD_SELECTORS = [
        'ins.adsbygoogle',
        'ins.adsbygoogle-noablate',
        'ins[data-vignette-loaded]',
        'ins[data-adsbygoogle-status]',
        'ins[data-ad-status]',
        'iframe[name^="aswift_"]',
        'iframe[id^="aswift_"]',
        'div[id^="aswift_"]',
        'img[src*="warning_amber_24dp"]',
        'img[src*="fundingchoices"]',
        'iframe[src*="fundingchoices"]',
        '.uv-ad-shell',
        '.uv-ad-panel',
        '.jump-linker',
        'div[style*="box-shadow: 0 0 12px #888"]'
    ].join(',');

    var LEGACY_SELECTORS = '.v-modal,.el-dialog__wrapper,#pleasePrNotCrack,[id^="plsPrNotCrack"]';

    var CSS = [
        '.uv-ad-shell, .uv-ad-panel { display: none !important; }',
        '.jump-linker { display: none !important; }',
        AD_SELECTORS + ' {',
        '    display: none !important;',
        '    visibility: hidden !important;',
        '    opacity: 0 !important;',
        '    width: 0 !important;',
        '    height: 0 !important;',
        '    min-width: 0 !important;',
        '    min-height: 0 !important;',
        '    max-width: 0 !important;',
        '    max-height: 0 !important;',
        '    margin: 0 !important;',
        '    padding: 0 !important;',
        '    border: none !important;',
        '    inset: auto !important;',
        '    position: static !important;',
        '    z-index: -9999 !important;',
        '    pointer-events: none !important;',
        '}'
    ].join('\n');

    function injectCss() {
        try {
            if (document.getElementById('uv-ad-kill-css')) return;
            var s = document.createElement('style');
            s.id = 'uv-ad-kill-css';
            s.textContent = CSS;
            (document.head || document.documentElement).appendChild(s);
        } catch (_) {}
    }

    // ============================================================
    // 7. 强制隐藏
    // ============================================================
    var HIDE_PROPS = {
        'display': 'none',
        'visibility': 'hidden',
        'opacity': '0',
        'position': 'static',
        'inset': 'auto',
        'width': '0',
        'height': '0',
        'min-width': '0',
        'min-height': '0',
        'max-width': '0',
        'max-height': '0',
        'margin': '0',
        'padding': '0',
        'border': 'none',
        'z-index': '-9999',
        'pointer-events': 'none'
    };

    function forceHide(el) {
        try {
            for (var k in HIDE_PROPS) {
                el.style.setProperty(k, HIDE_PROPS[k], 'important');
            }
        } catch (_) {}
    }

    function killAdNodes(root) {
        try {
            var scope = root || document;
            var nodes = scope.querySelectorAll(AD_SELECTORS);
            for (var i = 0; i < nodes.length; i++) forceHide(nodes[i]);

            var legacy = scope.querySelectorAll(LEGACY_SELECTORS);
            for (var j = 0; j < legacy.length; j++) {
                var r = legacy[j].getBoundingClientRect();
                if (r.left > -5000 && r.width > 0) forceHide(legacy[j]);
            }
        } catch (_) {}
    }

    function killHtmlLevelAds() {
        try {
            var kids = document.documentElement.children;
            for (var i = 0; i < kids.length; i++) {
                var n = kids[i];
                if (!n.tagName) continue;
                var tag = n.tagName.toUpperCase();
                if (tag === 'HEAD' || tag === 'BODY' || tag === 'SCRIPT' || tag === 'STYLE') continue;
                if (n.matches && n.matches(AD_SELECTORS)) forceHide(n);
            }
        } catch (_) {}
    }

    // ============================================================
    // 8. 启动
    // ============================================================
    function startObserver() {
        try {
            var mo = new MutationObserver(function (mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    var added = mutations[i].addedNodes;
                    for (var j = 0; j < added.length; j++) {
                        var el = added[j];
                        if (el.nodeType !== 1) continue;
                        if (el.matches && el.matches(AD_SELECTORS)) forceHide(el);
                        killAdNodes(el);
                    }
                }
            });
            mo.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
        } catch (_) {}
    }

    function boot() {
        injectCss();
        prefillLocalStorage();
        protectDocumentOpacity();
        createFakeDialog();
        killAdNodes(document);
        killHtmlLevelAds();
        startObserver();
    }

    injectCss();
    prefillLocalStorage();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // ============================================================
    // 9. 定时兜底
    // ============================================================
    setInterval(function () {
        killAdNodes(document);
        killHtmlLevelAds();
    }, 1000);

    setInterval(prefillLocalStorage, 30000);

    // ============================================================
    // 10. 路由切换
    // ============================================================
    function afterRoute() {
        setTimeout(function () {
            prefillLocalStorage();
            createFakeDialog();
            killAdNodes(document);
            killHtmlLevelAds();
        }, 60);
    }

    ['pushState', 'replaceState'].forEach(function (m) {
        var orig = history[m];
        if (!orig) return;
        history[m] = function () {
            var r = orig.apply(this, arguments);
            afterRoute();
            return r;
        };
    });

    window.addEventListener('popstate', afterRoute);
})();