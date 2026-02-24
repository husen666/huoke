/**
 * HuoKe Widget Loader — lightweight embed script
 * Renders a floating chat button and opens the widget page in an iframe.
 *
 * Usage:
 *   <script src="https://your-domain.com/widget-loader.js"
 *     data-site-token="YOUR_ORG_ID"
 *     data-color="#2563eb"
 *     data-title="在线客服"
 *     data-position="br"
 *     data-pre-chat="true"></script>
 */
(function () {
  'use strict';
  var w = window, d = document;

  var scripts = d.getElementsByTagName('script');
  var currentScript = d.currentScript || scripts[scripts.length - 1];

  var config = {
    siteToken: currentScript.getAttribute('data-site-token') || '',
    color: currentScript.getAttribute('data-color') || '#2563eb',
    title: currentScript.getAttribute('data-title') || '在线客服',
    position: currentScript.getAttribute('data-position') || 'br',
    preChat: currentScript.getAttribute('data-pre-chat') === 'true'
  };

  if (!config.siteToken) {
    console.warn('[HuoKe Loader] Missing data-site-token');
    return;
  }

  var baseUrl = currentScript.src.replace(/\/widget-loader\.js.*$/, '');
  var posRight = config.position !== 'bl';

  var SIDE = posRight ? 'right' : 'left';

  var styleEl = d.createElement('style');
  styleEl.textContent = [
    '#huoke-widget-btn{position:fixed;bottom:20px;' + SIDE + ':20px;width:60px;height:60px;border-radius:50%;',
    'background:' + config.color + ';display:flex;align-items:center;justify-content:center;cursor:pointer;',
    'box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:2147483646;transition:transform .2s,box-shadow .2s;border:none}',
    '#huoke-widget-btn:hover{transform:scale(1.08);box-shadow:0 6px 20px rgba(0,0,0,.22)}',
    '#huoke-widget-frame{position:fixed;' + SIDE + ':20px;bottom:90px;width:380px;height:560px;border:none;border-radius:16px;',
    'box-shadow:0 8px 32px rgba(0,0,0,.15);z-index:2147483647;opacity:0;transform:translateY(20px);',
    'transition:opacity .3s ease,transform .3s ease;pointer-events:none}',
    '#huoke-widget-frame.open{opacity:1;transform:translateY(0);pointer-events:auto}',
    '#huoke-widget-frame.hidden{display:none}',
    '@media(max-width:420px){#huoke-widget-frame{width:calc(100vw - 16px);height:calc(100vh - 100px);',
    SIDE + ':8px;bottom:80px;border-radius:12px}',
    '#huoke-widget-btn{' + SIDE + ':16px;bottom:16px;width:54px;height:54px}}'
  ].join('');
  d.head.appendChild(styleEl);

  var chatSvg = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  var closeSvg = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  var btn = d.createElement('button');
  btn.id = 'huoke-widget-btn';
  btn.innerHTML = chatSvg;
  btn.setAttribute('aria-label', '在线客服');

  var iframe = null;
  var isOpen = false;

  btn.addEventListener('click', function () {
    if (!iframe) {
      iframe = d.createElement('iframe');
      var params = new URLSearchParams({
        siteToken: config.siteToken,
        color: config.color,
        title: config.title,
        preChat: String(config.preChat)
      });
      iframe.src = baseUrl + '/widget?' + params.toString();
      iframe.id = 'huoke-widget-frame';
      iframe.allow = 'microphone;camera';
      iframe.setAttribute('aria-label', '在线客服窗口');
      d.body.appendChild(iframe);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          iframe.classList.add('open');
        });
      });
      isOpen = true;
    } else {
      isOpen = !isOpen;
      if (isOpen) {
        iframe.classList.remove('hidden');
        requestAnimationFrame(function () {
          iframe.classList.add('open');
        });
      } else {
        iframe.classList.remove('open');
        setTimeout(function () {
          if (!isOpen) iframe.classList.add('hidden');
        }, 300);
      }
    }
    btn.innerHTML = isOpen ? closeSvg : chatSvg;
  });

  // ─── Page Tracking ────────────────────────────────────────────────────
  var trackingSessionId = null;
  var currentPageUrl = w.location.href;
  var currentPageTitle = d.title;
  var pageEnteredAt = Date.now();
  var trackingApiBase = baseUrl + '/api/v1/widget';

  function getTrackingSessionId() {
    if (trackingSessionId) return trackingSessionId;
    try {
      trackingSessionId = w.localStorage.getItem('huoke_widget_session');
    } catch (e) { /* ignore */ }
    return trackingSessionId;
  }

  function sendPageView(url, title, ref, dur) {
    var sid = getTrackingSessionId();
    if (!sid || !config.siteToken) return;
    try {
      var body = JSON.stringify({
        siteToken: config.siteToken,
        sessionId: sid,
        pageUrl: url,
        pageTitle: title || '',
        referrer: ref || '',
        duration: dur || 0
      });
      if (w.navigator.sendBeacon) {
        w.navigator.sendBeacon(trackingApiBase + '/track-page', new Blob([body], { type: 'application/json' }));
      } else {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', trackingApiBase + '/track-page', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(body);
      }
    } catch (e) { /* silent */ }
  }

  function onPageChange() {
    var newUrl = w.location.href;
    var newTitle = d.title;
    if (newUrl === currentPageUrl && newTitle === currentPageTitle) return;
    var dur = Math.round((Date.now() - pageEnteredAt) / 1000);
    sendPageView(currentPageUrl, currentPageTitle, '', dur);
    currentPageUrl = newUrl;
    currentPageTitle = newTitle;
    pageEnteredAt = Date.now();
  }

  // Track SPA navigations
  w.addEventListener('popstate', onPageChange);
  var origPushState = w.history.pushState;
  var origReplaceState = w.history.replaceState;
  w.history.pushState = function () {
    origPushState.apply(this, arguments);
    onPageChange();
  };
  w.history.replaceState = function () {
    origReplaceState.apply(this, arguments);
    onPageChange();
  };

  // Monitor title changes for SPAs
  if (w.MutationObserver) {
    var titleEl = d.querySelector('title');
    if (titleEl) {
      new MutationObserver(onPageChange).observe(titleEl, { childList: true, characterData: true, subtree: true });
    }
  }

  // Periodic flush (every 30s)
  setInterval(function () {
    var dur = Math.round((Date.now() - pageEnteredAt) / 1000);
    sendPageView(currentPageUrl, currentPageTitle, '', dur);
    pageEnteredAt = Date.now();
  }, 30000);

  // Send initial page view when session becomes available
  function tryInitialPageView() {
    if (getTrackingSessionId()) {
      sendPageView(w.location.href, d.title, d.referrer || '', 0);
    } else {
      setTimeout(tryInitialPageView, 2000);
    }
  }
  setTimeout(tryInitialPageView, 1000);

  // Send on page unload
  w.addEventListener('beforeunload', function () {
    var dur = Math.round((Date.now() - pageEnteredAt) / 1000);
    sendPageView(currentPageUrl, currentPageTitle, '', dur);
  });

  // Listen for session changes from iframe
  w.addEventListener('storage', function (e) {
    if (e.key === 'huoke_widget_session' && e.newValue) {
      trackingSessionId = e.newValue;
    }
  });

  // ─── Mount Button ──────────────────────────────────────────────────────
  if (d.body) {
    d.body.appendChild(btn);
  } else {
    d.addEventListener('DOMContentLoaded', function () {
      d.body.appendChild(btn);
    });
  }
})();
