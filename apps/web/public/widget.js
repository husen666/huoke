/**
 * HuoKe Chat Widget v3 — embeddable customer service widget
 * Features: AI auto-reply, pre-chat form, file upload, transfer to human,
 *           satisfaction rating, sound notification, session management
 * Usage: <script src="https://your-domain.com/widget.js" data-site-token="YOUR_ORG_ID"></script>
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var SITE_TOKEN = script && script.getAttribute('data-site-token');
  var API_BASE = script && script.getAttribute('data-api') || (script ? script.src.replace(/\/widget\.js.*$/, '') : '');
  var POSITION = script && script.getAttribute('data-position') || 'right';
  var COLOR = script && script.getAttribute('data-color') || '#4F46E5';
  var TITLE = script && script.getAttribute('data-title') || '在线客服';
  var PRE_CHAT = script && script.getAttribute('data-pre-chat') !== 'false';

  if (!SITE_TOKEN) { console.warn('[HuoKe Widget] Missing data-site-token'); return; }

  var SESSION_KEY = 'huoke_widget_session';
  var VISITOR_KEY = 'huoke_widget_visitor';
  var sessionId = null;
  var greeting = '您好！有什么可以帮您的吗？';
  var isOpen = false;
  var messages = [];
  var polling = null;
  var convStatus = 'pending';
  var agentId = '';
  var agentName = '';
  var agentAvatarUrl = '';
  var agentOnlineStatus = '';
  var lastAgentSwitchNoticeKey = '';
  var agentTimeline = [];
  var activeAuxPanel = '';
  var isRated = false;
  var visitorInfo = null;
  var preChatDone = false;
  var sending = false;
  var isOnline = true;
  var offlineMessage = '';
  var queuePos = 0;
  var queueLastCheck = 0;
  var proactiveRules = [];
  var proactiveLoaded = false;
  var proactiveRuntime = { shownRuleIds: {}, listenersBound: false, startedAt: Date.now() };
  var pageEnterAt = Date.now();

  try { visitorInfo = JSON.parse(localStorage.getItem(VISITOR_KEY)); } catch (e) { /* */ }
  if (visitorInfo) preChatDone = true;

  // ---- Styles ----
  var css = '\n'
    + '#huoke-widget-btn{position:fixed;bottom:24px;' + POSITION + ':24px;z-index:99999;width:60px;height:60px;border-radius:50%;'
    + 'background:linear-gradient(135deg,' + COLOR + ' 0%,' + COLOR + 'cc 100%);color:#fff;border:none;cursor:pointer;'
    + 'box-shadow:0 10px 30px rgba(15,23,42,.28),0 0 0 1px rgba(255,255,255,.18) inset;'
    + 'display:flex;align-items:center;justify-content:center;transition:transform .22s,box-shadow .22s,filter .22s}'
    + '#huoke-widget-btn:hover{transform:translateY(-2px) scale(1.05);box-shadow:0 14px 34px rgba(15,23,42,.34);filter:saturate(1.05)}'
    + '#huoke-widget-btn svg{width:28px;height:28px}'
    + '#huoke-widget-panel{position:fixed;bottom:100px;' + POSITION + ':24px;z-index:99999;width:700px;max-width:calc(100vw - 32px);'
    + 'height:560px;max-height:calc(100vh - 140px);border-radius:18px;background:rgba(255,255,255,.96);backdrop-filter:blur(8px);'
    + 'border:1px solid rgba(148,163,184,.25);box-shadow:0 18px 50px rgba(15,23,42,.24);'
    + 'display:none;flex-direction:row;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}'
    + '#huoke-widget-panel.open{display:flex}'
    + '#huoke-chat-area{flex:1;display:flex;flex-direction:column;min-width:0}'
    + '#huoke-faq-sidebar{width:270px;border-left:1px solid #e2e8f0;display:flex;flex-direction:column;background:linear-gradient(180deg,#f8fafc 0%,#eef2ff 100%);flex-shrink:0}'
    + '#huoke-faq-sidebar .faq-header{padding:16px 16px 12px;font-size:15px;font-weight:700;color:#1e293b;'
    + 'display:flex;align-items:center;gap:8px;flex-shrink:0}'
    + '#huoke-faq-sidebar .faq-header .faq-header-icon{width:28px;height:28px;border-radius:8px;background:' + COLOR + '15;'
    + 'display:flex;align-items:center;justify-content:center;flex-shrink:0}'
    + '#huoke-faq-sidebar .faq-header .faq-header-icon svg{color:' + COLOR + '}'
    + '#huoke-faq-search{margin:0 12px 10px;position:relative}'
    + '#huoke-faq-search input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:7px 10px 7px 30px;font-size:12px;'
    + 'outline:none;background:#fff;transition:border-color .2s;box-sizing:border-box}'
    + '#huoke-faq-search input:focus{border-color:' + COLOR + '}'
    + '#huoke-faq-search svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:#94a3b8;pointer-events:none}'
    + '#huoke-faq-list{flex:1;overflow-y:auto;padding:0 10px 10px}'
    + '#huoke-faq-list .faq-cat{font-size:11px;font-weight:700;color:' + COLOR + ';padding:12px 6px 6px;letter-spacing:.3px;'
    + 'display:flex;align-items:center;gap:5px;border-bottom:1px solid ' + COLOR + '15;margin-bottom:4px}'
    + '#huoke-faq-list .faq-cat svg{opacity:.6}'
    + '#huoke-faq-list .faq-item{padding:9px 10px;margin:4px 0;border-radius:10px;font-size:13px;color:#475569;cursor:pointer;'
    + 'transition:all .2s;line-height:1.45;display:flex;align-items:flex-start;gap:7px;background:#fff;'
    + 'border:1px solid transparent;box-shadow:0 1px 2px rgba(0,0,0,.03)}'
    + '#huoke-faq-list .faq-item:hover{background:' + COLOR + '08;border-color:' + COLOR + '22;color:' + COLOR + ';transform:translateX(2px);box-shadow:0 8px 18px rgba(15,23,42,.08)}'
    + '#huoke-faq-list .faq-item:active{transform:scale(.98)}'
    + '#huoke-faq-list .faq-item .faq-q-icon{flex-shrink:0;width:18px;height:18px;border-radius:50%;background:' + COLOR + '12;'
    + 'display:flex;align-items:center;justify-content:center;margin-top:1px;font-size:10px;font-weight:700;color:' + COLOR + '}'
    + '#huoke-faq-list .faq-empty{text-align:center;padding:40px 16px;color:#94a3b8;font-size:13px}'
    + '@media(max-width:600px){#huoke-widget-panel{width:calc(100vw - 12px);' + POSITION + ':6px;bottom:74px;height:calc(100vh - 88px);max-height:calc(100vh - 88px);border-radius:14px}#huoke-faq-sidebar{display:none}#huoke-widget-btn{bottom:14px;' + POSITION + ':14px}}'
    + '#huoke-widget-header{padding:14px 20px;background:linear-gradient(135deg,' + COLOR + ' 0%,' + COLOR + 'd9 100%);color:#fff;display:flex;align-items:flex-start;gap:12px;flex-shrink:0;position:relative}'
    + '#huoke-agent-meta{display:flex;align-items:flex-start;gap:10px;min-width:0;flex:1;padding-right:28px}'
    + '#huoke-agent-avatar-wrap{position:relative;width:30px;height:30px;border-radius:999px;background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.25);overflow:hidden;display:none;flex-shrink:0}'
    + '#huoke-agent-avatar{width:100%;height:100%;object-fit:cover;display:none}'
    + '#huoke-agent-avatar-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff}'
    + '#huoke-agent-status-dot{position:absolute;right:-1px;bottom:-1px;width:9px;height:9px;border-radius:50%;border:2px solid rgba(79,70,229,.7);background:#22c55e}'
    + '#huoke-header-text{min-width:0}'
    + '#huoke-widget-header .title{font-size:15px;font-weight:600;line-height:1.25;word-break:break-word}'
    + '#huoke-widget-header .sub{font-size:12px;opacity:.8;line-height:1.3;word-break:break-word}'
    + '#huoke-agent-timeline{display:none !important;gap:6px;flex-wrap:wrap;margin-top:6px}'
    + '#huoke-agent-timeline .timeline-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;'
    + 'font-size:10.5px;line-height:1.2;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.24);white-space:nowrap}'
    + '#huoke-agent-timeline .timeline-time{opacity:.78}'
    + '#huoke-widget-header button#huoke-widget-close{background:none;border:none;color:#fff;cursor:pointer;padding:4px;opacity:.7;'
    + 'position:absolute;top:8px;right:8px;border-radius:6px;transition:opacity .2s,background .2s}'
    + '#huoke-widget-header button#huoke-widget-close:hover{opacity:1;background:rgba(255,255,255,.15)}'
    + '#huoke-widget-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)}'
    + '.huoke-msg{max-width:82%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;word-break:break-word;box-shadow:0 1px 2px rgba(15,23,42,.05)}'
    + '.huoke-msg.customer{align-self:flex-end;background:linear-gradient(135deg,' + COLOR + ' 0%,' + COLOR + 'd9 100%);color:#fff;border-bottom-right-radius:4px}'
    + '.huoke-msg.agent{align-self:flex-start;background:#ffffff;color:#1e293b;border-bottom-left-radius:4px;border:1px solid #e2e8f0}'
    + '.huoke-msg.system{align-self:center;background:transparent;color:#94a3b8;font-size:12px;padding:4px 12px;'
    + 'border:1px dashed #e2e8f0;border-radius:8px}'
    + '.huoke-msg .time{font-size:11px;opacity:.6;margin-top:4px}'
    + '.huoke-msg img{max-width:100%;border-radius:8px;margin-top:4px;cursor:pointer;transition:opacity .2s}'
    + '.huoke-msg img:hover{opacity:.85}'
    + '.huoke-msg a.file-link{display:inline-flex;align-items:center;gap:4px;color:inherit;text-decoration:underline;font-size:13px;opacity:.9;transition:opacity .2s}'
    + '.huoke-msg a.file-link:hover{opacity:1}'
    + '.huoke-typing{align-self:flex-start;background:#f1f5f9;border-radius:12px;padding:10px 14px;border-bottom-left-radius:4px}'
    + '.huoke-typing span{display:inline-block;width:8px;height:8px;border-radius:50%;background:#94a3b8;margin:0 2px;animation:huoke-dot 1.4s infinite}'
    + '.huoke-typing span:nth-child(2){animation-delay:.2s}'
    + '.huoke-typing span:nth-child(3){animation-delay:.4s}'
    + '@keyframes huoke-dot{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}'
    + '#huoke-widget-input-area{border-top:1px solid #e2e8f0;flex-shrink:0;background:#fff;position:relative;box-shadow:0 -6px 18px rgba(15,23,42,.03)}'
    + '#huoke-widget-input-area .actions{display:flex;gap:6px;padding:8px 12px 0}'
    + '#huoke-widget-input-area .actions button{background:#f8fafc;border:1px solid #e2e8f0;cursor:pointer;padding:6px;border-radius:8px;color:#64748b;transition:all .2s}'
    + '#huoke-widget-input-area .actions button:hover{color:' + COLOR + ';border-color:' + COLOR + '33;background:' + COLOR + '0a;transform:translateY(-1px)}'
    + '#huoke-emoji-panel{display:none;position:absolute;bottom:100%;left:0;right:0;background:#fff;border-top:1px solid #e2e8f0;'
    + 'box-shadow:0 -4px 16px rgba(0,0,0,.08);z-index:10;flex-direction:column;max-height:280px;border-radius:12px 12px 0 0}'
    + '#huoke-emoji-panel.open{display:flex}'
    + '#huoke-emoji-tabs{display:flex;gap:2px;padding:6px 8px;border-bottom:1px solid #f1f5f9;overflow-x:auto;flex-shrink:0}'
    + '#huoke-emoji-tabs button{background:none;border:none;cursor:pointer;padding:4px 6px;border-radius:6px;font-size:16px;line-height:1;transition:background .15s}'
    + '#huoke-emoji-tabs button:hover{background:#f1f5f9}'
    + '#huoke-emoji-tabs button.active{background:' + COLOR + '1a}'
    + '#huoke-emoji-grid{flex:1;overflow-y:auto;padding:8px;display:grid;grid-template-columns:repeat(8,1fr);gap:2px}'
    + '#huoke-emoji-grid button{background:none;border:none;cursor:pointer;padding:4px;font-size:20px;line-height:1;border-radius:6px;'
    + 'transition:background .12s,transform .12s;display:flex;align-items:center;justify-content:center;aspect-ratio:1}'
    + '#huoke-emoji-grid button:hover{background:#f1f5f9;transform:scale(1.15)}'
    + '#huoke-emoji-grid button:active{transform:scale(.9)}'
    + '#huoke-widget-input-area .msg-row{display:flex;gap:8px;padding:8px 12px 12px}'
    + '#huoke-smart-toggle{display:none;padding:5px 10px 0}'
    + '#huoke-smart-toggle button{border:1px dashed #cbd5e1;background:#fff;color:#64748b;border-radius:999px;font-size:11.5px;line-height:1;'
    + 'padding:6px 10px;cursor:pointer;transition:all .2s}'
    + '#huoke-smart-toggle button:hover{border-color:' + COLOR + '44;background:' + COLOR + '0f;color:' + COLOR + '}'
    + '#huoke-smart-toggle button.is-faded{opacity:.55}'
    + '#huoke-smart-toggle button.is-faded:hover{opacity:1}'
    + '#huoke-smart-prompts{display:none;padding:5px 10px 0;gap:6px;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}'
    + '#huoke-smart-prompts::-webkit-scrollbar{display:none}'
    + '#huoke-smart-prompts[data-expanded="1"]{flex-wrap:wrap;overflow:visible}'
    + '#huoke-smart-prompts .smart-chip{border:1px solid #e2e8f0;background:#f8fafc;color:#334155;border-radius:999px;'
    + 'font-size:11.5px;line-height:1;padding:6px 9px;cursor:pointer;transition:all .2s;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 0 auto}'
    + '#huoke-smart-prompts .smart-chip:hover{border-color:' + COLOR + '44;background:' + COLOR + '0f;color:' + COLOR + '}'
    + '#huoke-smart-prompts .smart-more{border-style:dashed;color:#64748b;background:#fff}'
    + '#huoke-widget-input-area input[type=text]{flex:1;border:1px solid #dbe2ea;border-radius:10px;padding:9px 12px;font-size:14px;outline:none;transition:border-color .2s,box-shadow .2s;background:#fff}'
    + '#huoke-widget-input-area input[type=text]:focus{border-color:' + COLOR + ';box-shadow:0 0 0 3px ' + COLOR + '22}'
    + '#huoke-widget-input-area .send-btn{background:linear-gradient(135deg,' + COLOR + ' 0%,' + COLOR + 'd4 100%);color:#fff;border:none;border-radius:10px;padding:8px 16px;font-size:14px;cursor:pointer;flex-shrink:0;transition:transform .2s,box-shadow .2s,opacity .2s;box-shadow:0 8px 16px ' + COLOR + '3d}'
    + '#huoke-widget-input-area .send-btn:hover{transform:translateY(-1px);box-shadow:0 10px 20px ' + COLOR + '47}'
    + '#huoke-widget-input-area .send-btn:disabled{opacity:.5;cursor:not-allowed}'
    + '#huoke-widget-input-area .file-preview{margin:0 12px 4px;padding:6px 10px;background:#f1f5f9;border-radius:6px;display:flex;align-items:center;gap:6px;font-size:12px;color:#475569}'
    + '#huoke-widget-input-area .file-preview .remove{cursor:pointer;color:#94a3b8;font-size:16px;line-height:1}'
    + '#huoke-widget-toolbar{display:flex;gap:6px;padding:0 16px 10px;flex-shrink:0}'
    + '#huoke-widget-toolbar button{background:#f8fafc;color:#475569;border:1px solid #e2e8f0;border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer;transition:all .2s}'
    + '#huoke-widget-toolbar button:hover{background:#eef2ff;border-color:' + COLOR + '2e;color:' + COLOR + '}'
    + '#huoke-widget-badge{position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;'
    + 'font-size:11px;display:none;align-items:center;justify-content:center;font-weight:600}'
    + '#huoke-proactive-card{position:fixed;z-index:99998;bottom:96px;' + POSITION + ':24px;width:280px;max-width:calc(100vw - 24px);'
    + 'background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 14px 36px rgba(15,23,42,.18);padding:12px;display:none}'
    + '#huoke-proactive-card .title{font-size:12px;color:#64748b;font-weight:600;margin-bottom:6px}'
    + '#huoke-proactive-card .text{font-size:13px;color:#334155;line-height:1.5;margin-bottom:10px}'
    + '#huoke-proactive-card .actions{display:flex;gap:8px;justify-content:flex-end}'
    + '#huoke-proactive-card .actions button{border:none;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer}'
    + '#huoke-proactive-card .actions .secondary{background:#f1f5f9;color:#64748b}'
    + '#huoke-proactive-card .actions .primary{background:' + COLOR + ';color:#fff}'
    + '@media(max-width:600px){#huoke-proactive-card{bottom:86px;' + POSITION + ':8px;width:calc(100vw - 16px)}}'
    + '#huoke-rating-panel{padding:20px;text-align:center;border-top:1px solid #e2e8f0;flex-shrink:0;background:linear-gradient(180deg,#fafbff 0%,#f8fafc 100%)}'
    + '#huoke-rating-panel p{font-size:13px;color:#64748b;margin-bottom:10px}'
    + '#huoke-rating-panel .stars{display:flex;justify-content:center;gap:6px;margin-bottom:10px}'
    + '#huoke-rating-panel .stars button{background:none;border:none;cursor:pointer;font-size:28px;color:#d1d5db;transition:color .15s}'
    + '#huoke-rating-panel .stars button.active{color:#f59e0b}'
    + '#huoke-rating-panel .stars button:hover{color:#f59e0b}'
    + '#huoke-rating-panel textarea{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px;font-size:13px;resize:none;outline:none;margin-bottom:8px}'
    + '#huoke-rating-panel textarea:focus{border-color:' + COLOR + '}'
    + '#huoke-rating-panel .submit-btn{background:' + COLOR + ';color:#fff;border:none;border-radius:8px;padding:6px 20px;font-size:13px;cursor:pointer}'
    + '#huoke-rating-panel .submit-btn:disabled{opacity:.5}'
    + '#huoke-resolved-bar{padding:12px 16px;border-top:1px solid #e2e8f0;background:#f0fdf4;text-align:center;flex-shrink:0}'
    + '#huoke-resolved-bar p{font-size:13px;color:#16a34a;margin-bottom:8px}'
    + '#huoke-resolved-bar button{background:' + COLOR + ';color:#fff;border:none;border-radius:8px;padding:6px 16px;font-size:13px;cursor:pointer}'
    + '#huoke-prechat{padding:24px;flex:1;display:flex;flex-direction:column;justify-content:center}'
    + '#huoke-prechat h3{font-size:16px;font-weight:600;color:#1e293b;margin-bottom:4px;text-align:center}'
    + '#huoke-prechat p{font-size:13px;color:#64748b;margin-bottom:16px;text-align:center}'
    + '#huoke-prechat label{display:block;font-size:13px;color:#475569;font-weight:500;margin-bottom:4px}'
    + '#huoke-prechat input{width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:14px;outline:none;margin-bottom:12px;transition:border-color .2s;box-sizing:border-box}'
    + '#huoke-prechat input:focus{border-color:' + COLOR + '}'
    + '#huoke-prechat button{width:100%;background:' + COLOR + ';color:#fff;border:none;border-radius:8px;padding:10px;font-size:14px;cursor:pointer;font-weight:500}'
    + '#huoke-prechat button:hover{opacity:.9}'
    + '#huoke-widget-messages::-webkit-scrollbar,#huoke-faq-list::-webkit-scrollbar,#huoke-emoji-grid::-webkit-scrollbar{width:8px;height:8px}'
    + '#huoke-widget-messages::-webkit-scrollbar-thumb,#huoke-faq-list::-webkit-scrollbar-thumb,#huoke-emoji-grid::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:8px}'
    + '#huoke-widget-messages::-webkit-scrollbar-thumb:hover,#huoke-faq-list::-webkit-scrollbar-thumb:hover,#huoke-emoji-grid::-webkit-scrollbar-thumb:hover{background:#94a3b8}'
    + '#huoke-leave-msg-form input:focus,#huoke-leave-msg-form textarea:focus{border-color:' + COLOR + '}'
    + '#huoke-leave-msg-form button:hover{opacity:.9}'
    + '\n';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---- DOM ----
  var btn = document.createElement('button');
  btn.id = 'huoke-widget-btn';
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
    + '<span id="huoke-widget-badge">0</span>';
  btn.title = '在线咨询';

  var panel = document.createElement('div');
  panel.id = 'huoke-widget-panel';
  panel.innerHTML = '<div id="huoke-chat-area">'
    + '<div id="huoke-widget-header">'
    + '<div id="huoke-agent-meta"><div id="huoke-agent-avatar-wrap"><img id="huoke-agent-avatar" alt="客服头像" /><span id="huoke-agent-avatar-fallback"></span><span id="huoke-agent-status-dot"></span></div><div id="huoke-header-text"><div class="title">' + escapeHtml(TITLE) + '</div><div class="sub" id="huoke-widget-status">通常在几分钟内回复</div></div></div>'
    + '<button id="huoke-widget-close" title="关闭">'
    + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    + '</button></div>'
    + '<div id="huoke-prechat" style="display:none"></div>'
    + '<div id="huoke-widget-messages"></div>'
    + '<div id="huoke-widget-toolbar">'
    + '<button id="huoke-human-btn">&#128100; 转人工客服</button>'
    + '</div>'
    + '<div id="huoke-widget-input-area">'
    + '<div class="file-preview" id="huoke-file-preview" style="display:none"></div>'
    + '<div id="huoke-emoji-panel"></div>'
    + '<div id="huoke-smart-toggle"><button type="button" id="huoke-smart-toggle-btn">猜你想问</button></div>'
    + '<div id="huoke-smart-prompts"></div>'
    + '<div class="actions">'
    + '<button id="huoke-img-btn" title="发送图片"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></button>'
    + '<button id="huoke-video-btn" title="发送视频"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></button>'
    + '<button id="huoke-attach-btn" title="发送文件"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.49"/></svg></button>'
    + '<button id="huoke-emoji-btn" title="表情"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg></button>'
    + '</div>'
    + '<div class="msg-row">'
    + '<input type="text" id="huoke-widget-text" placeholder="输入消息..." autocomplete="off" />'
    + '<button class="send-btn" id="huoke-widget-send">发送</button></div></div>'
    + '<input type="file" id="huoke-file-input" style="display:none" accept="image/*,video/*,.pdf,.doc,.docx,.xlsx,.csv,.txt" />'
    + '<input type="file" id="huoke-img-input" style="display:none" accept="image/*" />'
    + '<input type="file" id="huoke-video-input" style="display:none" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" />'
    + '<div id="huoke-rating-panel" style="display:none"></div>'
    + '<div id="huoke-resolved-bar" style="display:none"></div>'
    + '</div>'
    + '<div id="huoke-faq-sidebar">'
    + '<div class="faq-header"><div class="faq-header-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>常见问题</div>'
    + '<div id="huoke-faq-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input type="text" id="huoke-faq-search-input" placeholder="搜索问题..." /></div>'
    + '<div id="huoke-faq-list"><div class="faq-empty">加载中...</div></div>'
    + '</div>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);
  var proactiveCard = document.createElement('div');
  proactiveCard.id = 'huoke-proactive-card';
  proactiveCard.innerHTML = '<div class="title">在线客服</div><div class="text"></div><div class="actions"><button class="secondary" id="huoke-proactive-later">稍后</button><button class="primary" id="huoke-proactive-open">立即咨询</button></div>';
  document.body.appendChild(proactiveCard);

  var msgBox = document.getElementById('huoke-widget-messages');
  var chatArea = document.getElementById('huoke-chat-area');
  var inputEl = document.getElementById('huoke-widget-text');
  var sendBtn = document.getElementById('huoke-widget-send');
  var closeBtn = document.getElementById('huoke-widget-close');
  var badge = document.getElementById('huoke-widget-badge');
  var humanBtn = document.getElementById('huoke-human-btn');
  var toolbar = document.getElementById('huoke-widget-toolbar');
  var inputArea = document.getElementById('huoke-widget-input-area');
  var ratingPanel = document.getElementById('huoke-rating-panel');
  var resolvedBar = document.getElementById('huoke-resolved-bar');
  var preChatEl = document.getElementById('huoke-prechat');
  var fileInput = document.getElementById('huoke-file-input');
  var imgInput = document.getElementById('huoke-img-input');
  var videoInput = document.getElementById('huoke-video-input');
  var filePreview = document.getElementById('huoke-file-preview');
  var attachBtn = document.getElementById('huoke-attach-btn');
  var imgBtn = document.getElementById('huoke-img-btn');
  var videoBtn = document.getElementById('huoke-video-btn');
  var pendingFile = null;
  var unread = 0;
  var emojiBtn = document.getElementById('huoke-emoji-btn');
  var emojiPanel = document.getElementById('huoke-emoji-panel');
  var smartToggleEl = document.getElementById('huoke-smart-toggle');
  var smartToggleBtn = document.getElementById('huoke-smart-toggle-btn');
  var smartPromptsEl = document.getElementById('huoke-smart-prompts');
  var emojiOpen = false;
  var smartPromptsLoaded = false;
  var smartPromptCache = [];
  var smartPromptsExpanded = false;
  var smartPromptsHiddenByTyping = false;
  var smartPromptsPanelOpen = false;
  var smartToggleFadeTimer = null;

  var EMOJI_CATS = {
    '😀': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','😐','😏','😒','🙄','😔','😪','😴','😷','🤒','🤕','🥴','🤯','🥳','😎','🤓','🧐'],
    '👋': ['👋','🤚','✋','👌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','👍','👎','✊','👊','👏','🙌','🤝','🙏','💪','✍️'],
    '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','💔','❣️','💕','💖','💘','💝','⭐','✨','⚡','🔥','💥','🌈','🎉','🎊','🎈','💯','✅','❌','❓','❗','💤'],
    '🐶': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🦆','🦅','🦋','🐢','🐍','🐙','🐬','🐳'],
    '🍕': ['🍏','🍎','🍊','🍋','🍌','🍉','🍇','🍓','🍒','🍑','🥝','🍅','🌽','🥕','🍞','🧀','🍳','🍔','🍟','🍕','🌮','🥪','🍜','🍣','🍦','🍰','🍩','☕','🍵','🍺'],
  };
  var EMOJI_CAT_KEYS = Object.keys(EMOJI_CATS);

  function buildEmojiPanel() {
    var tabsHtml = '<div id="huoke-emoji-tabs">';
    EMOJI_CAT_KEYS.forEach(function (icon, idx) {
      tabsHtml += '<button data-idx="' + idx + '"' + (idx === 0 ? ' class="active"' : '') + '>' + icon + '</button>';
    });
    tabsHtml += '</div>';
    var gridHtml = '<div id="huoke-emoji-grid">';
    EMOJI_CATS[EMOJI_CAT_KEYS[0]].forEach(function (e) {
      gridHtml += '<button data-emoji="' + e + '">' + e + '</button>';
    });
    gridHtml += '</div>';
    emojiPanel.innerHTML = tabsHtml + gridHtml;

    emojiPanel.querySelector('#huoke-emoji-tabs').addEventListener('click', function (ev) {
      var btn2 = ev.target.closest('button');
      if (!btn2) return;
      var idx = parseInt(btn2.getAttribute('data-idx'));
      emojiPanel.querySelectorAll('#huoke-emoji-tabs button').forEach(function (b) { b.className = ''; });
      btn2.className = 'active';
      var grid = emojiPanel.querySelector('#huoke-emoji-grid');
      var html = '';
      EMOJI_CATS[EMOJI_CAT_KEYS[idx]].forEach(function (e) {
        html += '<button data-emoji="' + e + '">' + e + '</button>';
      });
      grid.innerHTML = html;
    });

    emojiPanel.querySelector('#huoke-emoji-grid').addEventListener('click', function (ev) {
      var btn2 = ev.target.closest('button');
      if (!btn2) return;
      var emoji = btn2.getAttribute('data-emoji');
      if (emoji) {
        var pos = inputEl.selectionStart || inputEl.value.length;
        inputEl.value = inputEl.value.slice(0, pos) + emoji + inputEl.value.slice(pos);
        inputEl.focus();
        var np = pos + emoji.length;
        inputEl.setSelectionRange(np, np);
      }
    });
  }

  function toggleEmoji() {
    emojiOpen = !emojiOpen;
    if (emojiOpen) {
      if (!emojiPanel.innerHTML) buildEmojiPanel();
      emojiPanel.classList.add('open');
      emojiBtn.style.color = COLOR;
    } else {
      emojiPanel.classList.remove('open');
      emojiBtn.style.color = '';
    }
  }

  emojiBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    toggleEmoji();
  });

  document.addEventListener('click', function (e) {
    if (emojiOpen && !emojiPanel.contains(e.target) && e.target !== emojiBtn) {
      emojiOpen = false;
      emojiPanel.classList.remove('open');
      emojiBtn.style.color = '';
    }
  });

  // ---- API helpers ----
  function apiCall(path, opts) {
    return fetch(API_BASE + '/api/v1/widget' + path, Object.assign({
      headers: { 'Content-Type': 'application/json' },
    }, opts)).then(function (r) { return r.json(); });
  }

  function mapWidgetError(raw) {
    var msg = String(raw || '').trim();
    var lower = msg.toLowerCase();
    if (!msg) return '请求失败，请稍后重试';
    if (lower.indexOf('invalid params') >= 0) return '提交参数有误，请检查联系方式或消息内容';
    if (lower.indexOf('rate limit') >= 0) return '操作过于频繁，请稍后再试';
    if (lower.indexOf('invalid site token') >= 0 || lower.indexOf('invalid token') >= 0) return '站点配置校验失败，请联系管理员';
    if (lower.indexOf('blocked') >= 0) return '当前请求受限，请联系管理员';
    if (lower.indexOf('session not found') >= 0) return '会话不存在，请开启新会话';
    if (lower.indexOf('session_resolved') >= 0) return '当前会话已结束，请开启新会话';
    if (lower.indexOf('server error') >= 0) return '服务暂时不可用，请稍后重试';
    return msg;
  }

  function isEphemeralMessageId(id) {
    var s = String(id || '');
    return s.startsWith('temp-') || s.startsWith('ai-') || s.startsWith('err-') || s.startsWith('think-');
  }

  function trackPage(durationMs) {
    if (!sessionId) return;
    var duration = Math.max(0, Math.floor((durationMs || 0) / 1000));
    apiCall('/track-page', {
      method: 'POST',
      body: JSON.stringify({
        siteToken: SITE_TOKEN,
        sessionId: sessionId,
        pageUrl: location.href,
        pageTitle: document.title || '',
        referrer: document.referrer || '',
        duration: duration,
      }),
    }).catch(function () { /* silent */ });
  }

  // ---- Module: proactive invite ----
  var ProactiveModule = (function () {
    function getCountMap() {
      try { return JSON.parse(localStorage.getItem('huoke_proactive_count') || '{}') || {}; } catch (e) { return {}; }
    }
    function setCountMap(map) {
      try { localStorage.setItem('huoke_proactive_count', JSON.stringify(map)); } catch (e) { /* */ }
    }
    function incCount(ruleId) {
      var map = getCountMap();
      map[ruleId] = (map[ruleId] || 0) + 1;
      setCountMap(map);
    }
    function getCount(ruleId) {
      var map = getCountMap();
      return map[ruleId] || 0;
    }
    function hideCard() {
      proactiveCard.style.display = 'none';
      proactiveCard.setAttribute('data-rule-id', '');
    }
    function showCard(rule) {
      if (!rule || proactiveRuntime.shownRuleIds[rule.id]) return;
      var maxShow = rule.maxShowCount || 1;
      if (getCount(rule.id) >= maxShow) return;
      proactiveRuntime.shownRuleIds[rule.id] = true;
      proactiveCard.querySelector('.text').textContent = rule.message || '您好，有什么可以帮您？';
      proactiveCard.setAttribute('data-rule-id', rule.id);
      proactiveCard.style.display = 'block';
      incCount(rule.id);
    }
    function schedule(rule, delayMs) {
      setTimeout(function () { showCard(rule); }, Math.max(0, delayMs || 0));
    }
    function bindTriggers() {
      if (proactiveRuntime.listenersBound) return;
      proactiveRuntime.listenersBound = true;
      var exitHandled = false;
      document.addEventListener('mouseout', function (e) {
        if (exitHandled) return;
        if (!e || !e.relatedTarget) {
          for (var i = 0; i < proactiveRules.length; i++) {
            var r = proactiveRules[i];
            if (r.triggerType === 'exit_intent') {
              exitHandled = true;
              schedule(r, (r.displayDelay || 0) * 1000);
              break;
            }
          }
        }
      });
      var scrollFired = {};
      window.addEventListener('scroll', function () {
        var doc = document.documentElement;
        var total = Math.max(1, doc.scrollHeight - window.innerHeight);
        var pct = Math.round((window.scrollY / total) * 100);
        for (var i = 0; i < proactiveRules.length; i++) {
          var r = proactiveRules[i];
          if (r.triggerType !== 'scroll_depth' || scrollFired[r.id]) continue;
          var cfg = r.triggerConfig || {};
          var target = Number(cfg.percent || cfg.depth || 50);
          if (pct >= target) {
            scrollFired[r.id] = true;
            schedule(r, (r.displayDelay || 0) * 1000);
          }
        }
      }, { passive: true });
    }
    function start() {
      if (proactiveLoaded) return;
      proactiveLoaded = true;
      apiCall('/proactive-rules?siteToken=' + encodeURIComponent(SITE_TOKEN))
        .then(function (res) {
          if (!res.success || !res.data || !res.data.length) return;
          proactiveRules = res.data;
          var isReturning = !!visitorInfo;
          var nowUrl = location.href;
          var elapsedSec = function () { return Math.floor((Date.now() - proactiveRuntime.startedAt) / 1000); };
          for (var i = 0; i < proactiveRules.length; i++) {
            var r = proactiveRules[i];
            var cfg = r.triggerConfig || {};
            if (r.triggerType === 'returning_visitor' && isReturning) {
              schedule(r, (r.displayDelay || 0) * 1000);
            } else if (r.triggerType === 'page_url') {
              var match = String(cfg.contains || cfg.url || '').trim();
              if (!match || nowUrl.indexOf(match) !== -1) {
                schedule(r, (r.displayDelay || 0) * 1000);
              }
            } else if (r.triggerType === 'time_on_page') {
              var sec = Number(cfg.seconds || cfg.time || 10);
              var delay = Math.max(0, sec - elapsedSec()) * 1000 + (r.displayDelay || 0) * 1000;
              schedule(r, delay);
            }
          }
          bindTriggers();
        })
        .catch(function () { /* */ });
    }
    return {
      start: start,
      hideCard: hideCard,
    };
  })();

  // ---- Module: queue status ----
  var QueueModule = (function () {
    function fetchQueuePosition() {
      return apiCall('/queue-position?sessionId=' + encodeURIComponent(sessionId) + '&token=' + encodeURIComponent(SITE_TOKEN))
        .then(function (qres) {
          if (qres.success && qres.data && qres.data.inQueue) {
            queuePos = qres.data.position || 0;
          } else {
            queuePos = 0;
          }
          updateUI();
        })
        .catch(function () { /* */ });
    }
    function syncByConversationStatus() {
      if (convStatus === 'pending' && Date.now() - queueLastCheck > 8000) {
        queueLastCheck = Date.now();
        fetchQueuePosition();
      } else if (convStatus !== 'pending' && queuePos !== 0) {
        queuePos = 0;
        updateUI();
      }
    }
    function reset() {
      queuePos = 0;
      queueLastCheck = 0;
    }
    return {
      syncByConversationStatus: syncByConversationStatus,
      reset: reset,
    };
  })();

  function initSession(forceNew) {
    var saved = null;
    try { saved = localStorage.getItem(SESSION_KEY); } catch (e) { /* */ }

    var payload = { siteToken: SITE_TOKEN };
    if (!forceNew && saved) payload.sessionId = saved;
    if (visitorInfo) {
      if (visitorInfo.name) payload.visitorName = visitorInfo.name;
      var contact = visitorInfo.email ? String(visitorInfo.email).trim() : '';
      // The pre-chat field allows "email or phone".
      // Route valid email to visitorEmail; otherwise send as visitorPhone.
      if (contact) {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) payload.visitorEmail = contact;
        else payload.visitorPhone = contact;
      }
    }

    return apiCall('/init', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res || !res.success || !res.data || !res.data.sessionId) {
        var reason = mapWidgetError((res && res.error) || '会话初始化失败，请稍后重试');
        throw new Error(reason);
      }
      sessionId = res.data.sessionId;
      greeting = res.data.greeting || greeting;
      isOnline = res.data.isOnline !== false;
      offlineMessage = res.data.offlineMessage || '';
      try { localStorage.setItem(SESSION_KEY, sessionId); } catch (e) { /* */ }
      convStatus = 'active';
      isRated = false;
      agentId = '';
      agentName = '';
      agentAvatarUrl = '';
      agentOnlineStatus = '';
      agentTimeline = [];
      lastAgentSwitchNoticeKey = '';
      renderAgentTimeline();
      QueueModule.reset();
      trackPage(0);
      updateUI();
      return res;
    });
  }

  function loadMessages() {
    if (!sessionId) return Promise.resolve();
    return apiCall('/messages/' + sessionId + '?siteToken=' + encodeURIComponent(SITE_TOKEN))
      .then(function (res) {
        if (res.success && res.data) {
          messages = res.data;
          if (res.meta) {
            convStatus = res.meta.status || 'active';
            agentId = res.meta.agentId || '';
            agentName = res.meta.agentName || '';
            agentAvatarUrl = res.meta.agentAvatarUrl || '';
            agentOnlineStatus = res.meta.agentOnlineStatus || '';
            isRated = !!res.meta.rated;
            if (agentName && agentTimeline.length === 0) {
              pushAgentTimeline('assign', agentId, agentName);
            }
          }
          renderMessages();
          updateUI();
        }
      });
  }

  function sendMessage(content, fileUrl, contentType, thumbnailUrl) {
    if (!sessionId || (!content.trim() && !fileUrl)) return;
    sending = true;
    sendBtn.disabled = true;

    var tempMsg = { content: content || (contentType === 'image' ? '[图片]' : contentType === 'video' ? '[视频]' : '[文件]'), senderType: 'customer', id: 'temp-' + Date.now() };
    if (fileUrl) { tempMsg.mediaUrl = fileUrl; tempMsg.contentType = contentType || 'file'; }
    messages.push(tempMsg);
    renderMessages();

    var thinkId = 'think-' + Date.now();
    setTimeout(function () {
      if (sending) {
        messages.push({ id: thinkId, content: '', senderType: 'agent', isThinking: true });
        renderMessages();
      }
    }, 600);

    var body = { content: content, siteToken: SITE_TOKEN };
    if (fileUrl) { body.mediaUrl = fileUrl; body.contentType = contentType || 'file'; }
    if (thumbnailUrl) { body.thumbnailUrl = thumbnailUrl; }

    return apiCall('/messages/' + sessionId, {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(function (res) {
      messages = messages.filter(function (m) { return m.id !== thinkId && !String(m.id).startsWith('temp-'); });
      if (res.success) {
        messages.push(res.data.message);
        if (res.data.aiReply) {
          messages.push({ id: 'ai-' + Date.now(), content: res.data.aiReply.content, senderType: res.data.transferred ? 'system' : (res.data.offline ? 'system' : 'agent') });
        } else {
          messages.push({ id: 'ack-' + Date.now(), content: '已收到您的问题，我们会尽快回复。', senderType: 'system' });
        }
        renderMessages();
        if (res.data.offline) {
          showLeaveMessageForm();
        }
      } else if (res.error === 'SESSION_RESOLVED') {
        startNewSession();
      } else {
        messages.push({ id: 'err-' + Date.now(), content: mapWidgetError(res.error || '发送失败，请重试'), senderType: 'system' });
        renderMessages();
      }
    }).catch(function (err) {
      messages = messages.filter(function (m) { return m.id !== thinkId; });
      messages.push({ id: 'err-' + Date.now(), content: mapWidgetError((err && err.message) || '发送失败，请稍后重试'), senderType: 'system' });
      renderMessages();
      console.error('[huoke-widget] send error:', err);
    }).finally(function () {
      sending = false;
      sendBtn.disabled = false;
    });
  }

  function submitTextMessage(content) {
    var text = (content || '').trim();
    if (!text || sending) return;
    if (!sessionId) {
      initSession(false)
        .then(function () {
          loadMessages();
          PollingModule.start();
          ProactiveModule.start();
          sendMessage(text);
          loadSmartPrompts(true);
        })
        .catch(function (err) {
          messages.push({ id: 'err-' + Date.now(), content: mapWidgetError((err && err.message) || '会话初始化失败，请稍后重试'), senderType: 'system' });
          renderMessages();
        });
      return;
    }
    sendMessage(text);
    loadSmartPrompts(true);
  }

  function requestHuman() {
    if (!sessionId) return;
    humanBtn.disabled = true;
    humanBtn.textContent = '转接中...';
    apiCall('/request-human/' + sessionId, {
      method: 'POST',
      body: JSON.stringify({ siteToken: SITE_TOKEN }),
    }).then(function (res) {
      if (res.success) {
        if (res.data && res.data.message) {
          messages.push(res.data.message);
          renderMessages();
        }
        if (res.data && res.data.offline) {
          showLeaveMessageForm();
        } else {
          toolbar.style.display = 'none';
        }
      } else {
        messages.push({ id: 'sys-' + Date.now(), content: mapWidgetError(res.error || '转接失败，请稍后再试'), senderType: 'system' });
        renderMessages();
      }
    }).catch(function () {
      messages.push({ id: 'sys-' + Date.now(), content: '网络异常，转接失败，请稍后再试', senderType: 'system' });
      renderMessages();
    }).finally(function () {
      humanBtn.disabled = false;
      humanBtn.innerHTML = '&#128100; 转人工客服';
    });
  }

  function showLeaveMessageForm() {
    activeAuxPanel = 'leave';
    toolbar.style.display = 'none';
    inputArea.style.display = 'none';
    var formEl = document.createElement('div');
    formEl.id = 'huoke-leave-msg-form';
    formEl.style.cssText = 'padding:20px;border-top:1px solid #e2e8f0;flex-shrink:0;background:#fafbfc';
    formEl.innerHTML = '<p style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:4px">📋 留下咨询信息</p>'
      + '<p style="font-size:12px;color:#64748b;margin-bottom:12px">当前为非工作时间，请留下联系方式，我们会尽快回复</p>'
      + '<input type="text" id="huoke-lm-name" placeholder="您的称呼" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;margin-bottom:8px;box-sizing:border-box" />'
      + '<input type="text" id="huoke-lm-phone" placeholder="手机号" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;margin-bottom:8px;box-sizing:border-box" />'
      + '<input type="text" id="huoke-lm-email" placeholder="邮箱（选填）" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;margin-bottom:8px;box-sizing:border-box" />'
      + '<textarea id="huoke-lm-content" rows="3" placeholder="请描述您的咨询内容..." style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;margin-bottom:8px;resize:none;box-sizing:border-box"></textarea>'
      + '<button id="huoke-lm-submit" style="width:100%;background:' + COLOR + ';color:#fff;border:none;border-radius:8px;padding:10px;font-size:14px;cursor:pointer;font-weight:500">提交咨询</button>';
    (chatArea || panel).appendChild(formEl);

    if (visitorInfo) {
      var nameEl = document.getElementById('huoke-lm-name');
      if (nameEl && visitorInfo.name) nameEl.value = visitorInfo.name;
      var emailEl = document.getElementById('huoke-lm-email');
      if (emailEl && visitorInfo.email) emailEl.value = visitorInfo.email;
    }

    document.getElementById('huoke-lm-submit').addEventListener('click', function () {
      var content = document.getElementById('huoke-lm-content').value.trim();
      if (!content) {
        document.getElementById('huoke-lm-content').style.borderColor = '#ef4444';
        return;
      }
      var submitBtn2 = document.getElementById('huoke-lm-submit');
      submitBtn2.disabled = true;
      submitBtn2.textContent = '提交中...';
      apiCall('/leave-message/' + sessionId, {
        method: 'POST',
        body: JSON.stringify({
          siteToken: SITE_TOKEN,
          name: document.getElementById('huoke-lm-name').value.trim(),
          phone: document.getElementById('huoke-lm-phone').value.trim(),
          email: document.getElementById('huoke-lm-email').value.trim(),
          content: content,
        }),
      }).then(function (res) {
        if (res.success) {
          formEl.innerHTML = '<div style="text-align:center;padding:20px 0">'
            + '<p style="font-size:28px;margin-bottom:8px">✅</p>'
            + '<p style="font-size:14px;color:#16a34a;font-weight:500">已收到您的咨询信息</p>'
            + '<p style="font-size:12px;color:#64748b;margin-top:4px">我们将在工作时间内尽快与您联系</p></div>';
          if (res.data && res.data.message) {
            messages.push(res.data.message);
            renderMessages();
          }
        } else {
          submitBtn2.disabled = false;
          submitBtn2.textContent = '提交咨询';
          messages.push({ id: 'err-' + Date.now(), content: mapWidgetError(res.error || '提交失败，请重试'), senderType: 'system' });
          renderMessages();
        }
      });
    });
  }

  function submitRating(score, comment) {
    return apiCall('/rate/' + sessionId, {
      method: 'POST',
      body: JSON.stringify({ siteToken: SITE_TOKEN, score: score, comment: comment }),
    }).then(function (res) {
      if (res.success) {
        isRated = true;
        updateUI();
      }
    });
  }

  function startNewSession() {
    var prevMessages = messages.slice();
    var prevSessionId = sessionId;
    var prevConvStatus = convStatus;
    var prevIsRated = isRated;
    var prevAgentId = agentId;
    var prevAgentName = agentName;
    var prevAgentAvatarUrl = agentAvatarUrl;
    var prevAgentOnlineStatus = agentOnlineStatus;
    var newSessionBtn = document.getElementById('huoke-new-session-btn');
    if (newSessionBtn) {
      newSessionBtn.disabled = true;
      newSessionBtn.textContent = '开启中...';
    }

    messages = [];
    agentTimeline = [];
    lastAgentSwitchNoticeKey = '';
    activeAuxPanel = '';
    var leaveFormEl = document.getElementById('huoke-leave-msg-form');
    if (leaveFormEl) leaveFormEl.remove();
    renderAgentTimeline();
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* */ }
    sessionId = null;
    initSession(true).then(function (res) {
      if (!res || !res.success || !sessionId) throw new Error((res && res.error) || '初始化失败');
      return loadMessages();
    }).then(function () {
      PollingModule.start();
      ProactiveModule.start();
      loadSmartPrompts(true);
    }).catch(function (err) {
      // Restore previous state if new session creation failed.
      messages = prevMessages;
      sessionId = prevSessionId;
      convStatus = prevConvStatus;
      isRated = prevIsRated;
      agentId = prevAgentId;
      agentName = prevAgentName;
      agentAvatarUrl = prevAgentAvatarUrl;
      agentOnlineStatus = prevAgentOnlineStatus;
      messages.push({ id: 'new-session-err-' + Date.now(), content: mapWidgetError((err && err.message) || '开启新会话失败，请稍后重试'), senderType: 'system' });
      renderMessages();
      updateUI();
    }).finally(function () {
      var btnEl = document.getElementById('huoke-new-session-btn');
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = '开启新会话';
      }
    });
  }

  // ---- Rendering ----
  function resolveUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    return API_BASE + (url.startsWith('/') ? '' : '/') + url;
  }

  function renderMessages() {
    var html = '<div class="huoke-msg system">' + escapeHtml(greeting) + '</div>';
    messages.forEach(function (m) {
      var cls = m.senderType === 'customer' ? 'customer' : m.senderType === 'system' ? 'system' : 'agent';
      var inner = '';

      if (m.isThinking) {
        inner = '<span class="huoke-typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>';
        html += '<div class="huoke-msg agent">' + inner + '</div>';
        return;
      }

      if (m.mediaUrl) {
        var fullUrl = resolveUrl(m.mediaUrl);
        if (m.contentType === 'image') {
          inner += '<img src="' + escapeAttr(fullUrl) + '" alt="图片" onclick="window.open(this.src)" />';
          if (m.content && m.content !== '[图片]' && !m.content.startsWith('[')) {
            inner += '<div style="margin-top:6px;font-size:13px">' + escapeHtml(m.content) + '</div>';
          }
        } else if (m.contentType === 'video') {
          inner += '<video src="' + escapeAttr(fullUrl) + '" controls preload="metadata" style="max-width:100%;max-height:200px;border-radius:8px;margin-top:4px"></video>';
          if (m.content && m.content !== '[视频]' && !m.content.startsWith('[')) {
            inner += '<div style="margin-top:6px;font-size:13px">' + escapeHtml(m.content) + '</div>';
          }
        } else {
          inner += '<a class="file-link" href="' + escapeAttr(fullUrl) + '" target="_blank" download>&#128206; ' + escapeHtml(m.content || '附件') + '</a>';
        }
      } else {
        inner += escapeHtml(m.content).replace(/\n/g, '<br>');
      }

      if (m.createdAt) {
        var d = new Date(m.createdAt);
        inner += '<div class="time">' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</div>';
      }

      html += '<div class="huoke-msg ' + cls + '">' + inner + '</div>';
    });
    msgBox.innerHTML = html;
    msgBox.scrollTop = msgBox.scrollHeight;
  }

  function escapeHtml(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function escapeAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
  }

  function updateUI() {
    var statusEl = document.getElementById('huoke-widget-status');
    var avatarWrapEl = document.getElementById('huoke-agent-avatar-wrap');
    var avatarImgEl = document.getElementById('huoke-agent-avatar');
    var avatarFallbackEl = document.getElementById('huoke-agent-avatar-fallback');
    var statusDotEl = document.getElementById('huoke-agent-status-dot');
    var statusTextMap = { online: '在线', busy: '忙碌', away: '离开', offline: '离线' };
    var dotColorMap = { online: '#22c55e', busy: '#f59e0b', away: '#94a3b8', offline: '#94a3b8' };
    if (statusEl) {
      if (convStatus === 'pending' && queuePos > 0) {
        statusEl.textContent = '排队中 · 当前前方 ' + queuePos + ' 位';
      } else if (agentName) {
        var onlineText = statusTextMap[agentOnlineStatus] || '在线';
        var latest = agentTimeline && agentTimeline.length > 0 ? agentTimeline[agentTimeline.length - 1] : null;
        var accessText = latest && latest.time
          ? (' · ' + latest.time + ' ' + (latest.label || '接入') + agentName)
          : '';
        statusEl.textContent = '在线客服：' + onlineText + accessText;
      } else {
        statusEl.textContent = isOnline ? '在线 · 通常在几分钟内回复' : '当前非工作时间 · AI 智能客服在线';
      }
    }
    if (avatarWrapEl && avatarImgEl && avatarFallbackEl && statusDotEl) {
      if (agentName) {
        avatarWrapEl.style.display = 'block';
        statusDotEl.style.background = dotColorMap[agentOnlineStatus] || '#22c55e';
        avatarFallbackEl.textContent = (agentName || '客').slice(0, 1);
        if (agentAvatarUrl) {
          avatarImgEl.style.display = 'block';
          avatarImgEl.src = resolveUrl(agentAvatarUrl);
        } else {
          avatarImgEl.style.display = 'none';
          avatarImgEl.removeAttribute('src');
        }
      } else {
        avatarWrapEl.style.display = 'none';
        avatarImgEl.style.display = 'none';
        avatarImgEl.removeAttribute('src');
      }
    }
    if (convStatus === 'resolved' || convStatus === 'closed') {
      inputArea.style.display = 'none';
      toolbar.style.display = 'none';
      if (!isRated) {
        showRatingPanel();
        resolvedBar.style.display = 'none';
      } else {
        ratingPanel.style.display = 'none';
        showResolvedBar();
      }
    } else {
      if (activeAuxPanel === 'leave') {
        inputArea.style.display = 'none';
        toolbar.style.display = 'none';
      } else {
        inputArea.style.display = 'block';
        toolbar.style.display = 'flex';
      }
      ratingPanel.style.display = 'none';
      resolvedBar.style.display = 'none';
    }
  }

  function renderAgentTimeline() {
    // Keep timeline data for status composition and switch notices,
    // but do not render a third header row (header should stay in 2 lines).
    var timelineEl = document.getElementById('huoke-agent-timeline');
    if (timelineEl) {
      timelineEl.style.display = 'none';
      timelineEl.innerHTML = '';
    }
  }

  function pushAgentTimeline(type, id, name) {
    var agentLabel = (name || '').trim();
    if (!agentLabel) return;
    var eventType = type || 'assign';
    var prev = agentTimeline.length ? agentTimeline[agentTimeline.length - 1] : null;
    if (prev && prev.type === eventType && prev.agentId === String(id || '') && prev.agentName === agentLabel) return;
    var label = eventType === 'switch' ? '切换' : (eventType === 'unassign' ? '离开' : '接入');
    var now = new Date();
    var time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    agentTimeline.push({ type: eventType, agentId: String(id || ''), agentName: agentLabel, label: label, time: time });
    if (agentTimeline.length > 4) agentTimeline = agentTimeline.slice(agentTimeline.length - 4);
    renderAgentTimeline();
    updateUI();
  }

  function buildAgentSwitchNotice(prevId, prevName, nextId, nextName) {
    var prevKey = String(prevId || '') + '|' + String(prevName || '');
    var nextKey = String(nextId || '') + '|' + String(nextName || '');
    if (prevKey === nextKey) return null;
    if (nextName && prevName && nextName !== prevName) return { text: '🔁 已由 ' + nextName + ' 接入，为您继续服务。', type: 'switch', timelineId: nextId || '', timelineName: nextName };
    if (nextName && !prevName) return { text: '✅ 已由 ' + nextName + ' 接入，为您服务。', type: 'assign', timelineId: nextId || '', timelineName: nextName };
    if (!nextName && prevName) return { text: '⏳ ' + prevName + ' 暂时离开，正在为您重新分配客服。', type: 'unassign', timelineId: prevId || '', timelineName: prevName };
    return null;
  }

  function emitAgentSwitchNotice(notice) {
    if (!notice || !notice.text) return;
    var noticeKey = String(sessionId || '') + '|' + String(notice.timelineId || '') + '|' + String(notice.timelineName || '') + '|' + notice.text;
    if (noticeKey === lastAgentSwitchNoticeKey) return;
    lastAgentSwitchNoticeKey = noticeKey;
    pushAgentTimeline(notice.type, notice.timelineId, notice.timelineName);
    messages.push({
      id: 'sys-switch-' + Date.now(),
      content: notice.text,
      senderType: 'system',
    });
    renderMessages();
    if (!isOpen) {
      unread += 1;
      badge.textContent = unread > 9 ? '9+' : String(unread);
      badge.style.display = 'flex';
    }
  }

  function clearSmartToggleFade() {
    if (smartToggleFadeTimer) {
      clearTimeout(smartToggleFadeTimer);
      smartToggleFadeTimer = null;
    }
    if (smartToggleBtn) smartToggleBtn.classList.remove('is-faded');
  }

  function scheduleSmartToggleFade() {
    if (!smartToggleBtn || !smartToggleEl) return;
    clearSmartToggleFade();
    if (smartToggleEl.style.display === 'none' || smartPromptsPanelOpen || smartPromptsHiddenByTyping) return;
    smartToggleFadeTimer = setTimeout(function () {
      if (smartToggleEl.style.display !== 'none' && !smartPromptsPanelOpen && !smartPromptsHiddenByTyping) {
        smartToggleBtn.classList.add('is-faded');
      }
    }, 10000);
  }

  function renderSmartPrompts(items) {
    if (!smartPromptsEl) return;
    if (!items || items.length === 0) {
      smartPromptsEl.style.display = 'none';
      smartPromptsEl.innerHTML = '';
      if (smartToggleEl) smartToggleEl.style.display = 'none';
      clearSmartToggleFade();
      return;
    }
    var compactMax = 2;
    var list = smartPromptsExpanded ? items.slice(0, 6) : items.slice(0, compactMax);
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var t = (list[i] && list[i].text) ? String(list[i].text) : '';
      if (!t) continue;
      html += '<button class="smart-chip" data-text="' + escapeAttr(t) + '" title="' + escapeAttr(t) + '">' + escapeHtml(t) + '</button>';
    }
    if (items.length > compactMax) {
      html += '<button class="smart-chip smart-more" data-action="toggle-prompts">' + (smartPromptsExpanded ? '收起' : '更多') + '</button>';
    }
    smartPromptsEl.innerHTML = html;
    smartPromptsEl.setAttribute('data-expanded', smartPromptsExpanded ? '1' : '0');
    if (smartToggleBtn) {
      smartToggleBtn.textContent = smartPromptsPanelOpen ? '收起猜你想问' : '猜你想问';
    }
    if (smartToggleEl) {
      smartToggleEl.style.display = smartPromptsHiddenByTyping ? 'none' : 'block';
    }
    smartPromptsEl.style.display = (!smartPromptsHiddenByTyping && smartPromptsPanelOpen) ? 'flex' : 'none';
    if (!smartPromptsPanelOpen && !smartPromptsHiddenByTyping) {
      scheduleSmartToggleFade();
    } else {
      clearSmartToggleFade();
    }
  }

  function collapseSmartPrompts() {
    if (!smartPromptsExpanded) return;
    smartPromptsExpanded = false;
    renderSmartPrompts(smartPromptCache);
  }

  function syncSmartPromptsVisibilityByInput() {
    if (!smartPromptsEl || !inputEl) return;
    var hasTyping = inputEl.value.trim().length > 0;
    if (hasTyping) {
      smartPromptsHiddenByTyping = true;
      smartPromptsPanelOpen = false;
      smartPromptsEl.style.display = 'none';
      if (smartToggleEl) smartToggleEl.style.display = 'none';
      clearSmartToggleFade();
      return;
    }
    if (smartPromptsHiddenByTyping) {
      smartPromptsHiddenByTyping = false;
      renderSmartPrompts(smartPromptCache);
    }
  }

  function loadSmartPrompts(force) {
    if (!force && smartPromptsLoaded) return;
    smartPromptsLoaded = true;
    var q = '/smart-prompts?siteToken=' + encodeURIComponent(SITE_TOKEN);
    if (sessionId) q += '&sessionId=' + encodeURIComponent(sessionId);
    q += '&pageUrl=' + encodeURIComponent(location.href);
    apiCall(q)
      .then(function (res) {
        if (!res.success || !res.data) {
          renderSmartPrompts([]);
          return;
        }
        smartPromptCache = res.data.slice(0, 6);
        smartPromptsExpanded = false;
        smartPromptsPanelOpen = false;
        renderSmartPrompts(smartPromptCache);
      })
      .catch(function () {
        renderSmartPrompts([]);
      });
  }

  function showRatingPanel() {
    var selectedScore = 0;
    ratingPanel.style.display = 'block';
    ratingPanel.innerHTML = '<p>会话已结束，请为本次服务评分</p>'
      + '<div class="stars">'
      + [1,2,3,4,5].map(function(s) {
          return '<button data-score="' + s + '">&#9733;</button>';
        }).join('')
      + '</div>'
      + '<textarea id="huoke-rating-comment" rows="2" placeholder="留下您的评价（选填）"></textarea>'
      + '<button class="submit-btn" id="huoke-rating-submit" disabled>提交评价</button>';

    var stars = ratingPanel.querySelectorAll('.stars button');
    var submitBtn2 = document.getElementById('huoke-rating-submit');

    stars.forEach(function (star) {
      star.addEventListener('click', function () {
        selectedScore = parseInt(this.getAttribute('data-score'));
        stars.forEach(function (s, i) {
          s.className = (i < selectedScore) ? 'active' : '';
        });
        submitBtn2.disabled = false;
      });
    });

    submitBtn2.addEventListener('click', function () {
      if (selectedScore < 1) return;
      submitBtn2.disabled = true;
      submitBtn2.textContent = '提交中...';
      var comment = document.getElementById('huoke-rating-comment').value.trim();
      submitRating(selectedScore, comment).then(function () {
        ratingPanel.innerHTML = '<p style="color:#16a34a">&#10003; 感谢您的评价！</p>';
        setTimeout(function () { showResolvedBar(); ratingPanel.style.display = 'none'; }, 2000);
      });
    });
  }

  function showResolvedBar() {
    resolvedBar.style.display = 'block';
    resolvedBar.innerHTML = '<p>&#10003; 本次会话已结束</p>'
      + '<button id="huoke-new-session-btn">开启新会话</button>';
    document.getElementById('huoke-new-session-btn').addEventListener('click', function () {
      startNewSession();
    });
  }

  function showPreChatForm() {
    preChatEl.style.display = 'flex';
    msgBox.style.display = 'none';
    toolbar.style.display = 'none';
    inputArea.style.display = 'none';
    preChatEl.innerHTML = '<h3>开始咨询</h3><p>请填写以下信息，方便我们更好地为您服务</p>'
      + '<label>您的称呼 <span style="color:#ef4444">*</span></label>'
      + '<input type="text" id="huoke-prechat-name" placeholder="请输入您的姓名" />'
      + '<label>联系邮箱 / 手机</label>'
      + '<input type="text" id="huoke-prechat-email" placeholder="选填" />'
      + '<button id="huoke-prechat-submit">开始对话</button>';

    document.getElementById('huoke-prechat-submit').addEventListener('click', function () {
      var name = document.getElementById('huoke-prechat-name').value.trim();
      if (!name) {
        document.getElementById('huoke-prechat-name').style.borderColor = '#ef4444';
        return;
      }
      var email = document.getElementById('huoke-prechat-email').value.trim();
      visitorInfo = { name: name, email: email };
      try { localStorage.setItem(VISITOR_KEY, JSON.stringify(visitorInfo)); } catch (e) { /* */ }
      preChatDone = true;
      preChatEl.style.display = 'none';
      msgBox.style.display = 'flex';
      toolbar.style.display = '';
      inputArea.style.display = '';
      openChat();
    });
  }

  function openChat() {
    if (!sessionId) {
      initSession(false).then(function () {
        loadMessages();
        PollingModule.start();
        ProactiveModule.start();
        loadSmartPrompts(true);
      }).catch(function (err) {
        messages.push({ id: 'err-' + Date.now(), content: mapWidgetError((err && err.message) || '会话初始化失败，请稍后重试'), senderType: 'system' });
        renderMessages();
      });
    } else {
      loadMessages();
      PollingModule.start();
      ProactiveModule.start();
      loadSmartPrompts(true);
    }
    setTimeout(function () { inputEl.focus(); }, 100);
    loadFaqs();
  }

  // ---- FAQ sidebar ----
  var faqListEl = document.getElementById('huoke-faq-list');
  var faqSearchInput = document.getElementById('huoke-faq-search-input');
  var faqsLoaded = false;
  var allFaqs = [];

  var CAT_ICONS = {
    '产品功能': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    '使用指南': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    '账号与计费': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
    '技术支持': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  };

  function renderFaqList(faqData) {
    if (!faqData || faqData.length === 0) {
      faqListEl.innerHTML = '<div class="faq-empty">暂无匹配的问题</div>';
      return;
    }
    var html = '';
    var grouped = {};
    faqData.forEach(function (faq) {
      var cat = faq.category || '常见';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(faq);
    });
    var cats = Object.keys(grouped);
    cats.forEach(function (cat) {
      var icon = CAT_ICONS[cat] || '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
      html += '<div class="faq-cat">' + icon + ' ' + escapeHtml(cat) + '</div>';
      grouped[cat].forEach(function (faq) {
        html += '<div class="faq-item" data-q="' + escapeAttr(faq.question) + '" title="点击发送此问题">'
          + '<span class="faq-q-icon">Q</span>'
          + '<span>' + escapeHtml(faq.question) + '</span></div>';
      });
    });
    faqListEl.innerHTML = html;
  }

  function loadFaqs() {
    if (faqsLoaded) return;
    faqsLoaded = true;
    apiCall('/faqs?siteToken=' + encodeURIComponent(SITE_TOKEN))
      .then(function (res) {
        if (!res.success || !res.data || res.data.length === 0) {
          faqListEl.innerHTML = '<div class="faq-empty">暂无常见问题</div>';
          return;
        }
        allFaqs = res.data;
        renderFaqList(allFaqs);

        faqListEl.addEventListener('click', function (e) {
          var item = e.target.closest('.faq-item');
          if (!item) return;
          var question = item.getAttribute('data-q');
          if (!question) return;
          inputEl.value = question;
          inputEl.focus();
          sendBtn.click();
        });
      })
      .catch(function () {
        faqListEl.innerHTML = '<div class="faq-empty">加载失败</div>';
      });
  }

  faqSearchInput.addEventListener('input', function () {
    var q = faqSearchInput.value.trim().toLowerCase();
    if (!q) { renderFaqList(allFaqs); return; }
    var filtered = allFaqs.filter(function (faq) {
      return faq.question.toLowerCase().indexOf(q) !== -1 || (faq.answer && faq.answer.toLowerCase().indexOf(q) !== -1);
    });
    renderFaqList(filtered);
  });

  // ---- File upload ----
  attachBtn.addEventListener('click', function () {
    fileInput.click();
  });

  imgBtn.addEventListener('click', function () {
    imgInput.click();
  });

  videoBtn.addEventListener('click', function () {
    videoInput.click();
  });

  function handleFileSelect(file) {
    if (!file) return;
    var isVid = file.type.startsWith('video/');
    var maxSize = isVid ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(isVid ? '视频大小不能超过 50MB' : '文件大小不能超过 10MB');
      return false;
    }
    pendingFile = file;
    var isImg = file.type.startsWith('image/');
    if (isImg) {
      var reader = new FileReader();
      reader.onload = function (e) {
        filePreview.innerHTML = '<img src="' + e.target.result + '" style="max-height:60px;max-width:120px;border-radius:4px;object-fit:cover" />'
          + ' <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#64748b">' + escapeHtml(file.name) + '</span>'
          + '<span class="remove" id="huoke-file-remove">&times;</span>';
        filePreview.style.display = 'flex';
        document.getElementById('huoke-file-remove').addEventListener('click', clearPendingFile);
      };
      reader.readAsDataURL(file);
    } else if (isVid) {
      var vidUrl = URL.createObjectURL(file);
      filePreview.innerHTML = '<video src="' + vidUrl + '" style="max-height:60px;max-width:120px;border-radius:4px;object-fit:cover" muted></video>'
        + ' <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#64748b">&#127909; ' + escapeHtml(file.name) + '</span>'
        + '<span class="remove" id="huoke-file-remove">&times;</span>';
      filePreview.style.display = 'flex';
      document.getElementById('huoke-file-remove').addEventListener('click', clearPendingFile);
    } else {
      filePreview.innerHTML = '&#128206; <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(file.name) + '</span>'
        + '<span class="remove" id="huoke-file-remove">&times;</span>';
      filePreview.style.display = 'flex';
      document.getElementById('huoke-file-remove').addEventListener('click', clearPendingFile);
    }
    return true;
  }

  function clearPendingFile() {
    pendingFile = null;
    fileInput.value = '';
    imgInput.value = '';
    videoInput.value = '';
    filePreview.style.display = 'none';
  }

  fileInput.addEventListener('change', function () {
    handleFileSelect(fileInput.files[0]);
  });

  imgInput.addEventListener('change', function () {
    handleFileSelect(imgInput.files[0]);
  });

  videoInput.addEventListener('change', function () {
    handleFileSelect(videoInput.files[0]);
  });

  // ---- Module: polling ----
  var PollingModule = (function () {
    var visibilityBound = false;
    function getPollingDelay() {
      return document.hidden ? 12000 : 3000;
    }
    function scheduleNextTick() {
      if (polling === null) return;
      polling = setTimeout(function () {
        tick();
        scheduleNextTick();
      }, getPollingDelay());
    }
    function rearmTimer() {
      if (polling === null) return;
      clearTimeout(polling);
      scheduleNextTick();
    }
    function getLocalServerMessageState() {
      var realLocalCount = 0;
      var realLocalLastId = '';
      for (var i = 0; i < messages.length; i++) {
        var localId = String(messages[i].id);
        if (isEphemeralMessageId(localId)) continue;
        realLocalCount++;
        realLocalLastId = localId;
      }
      return { count: realLocalCount, lastId: realLocalLastId };
    }
    function buildKnownServerIds() {
      var knownServerIds = {};
      for (var i = 0; i < messages.length; i++) {
        var id = String(messages[i].id);
        if (!isEphemeralMessageId(id)) knownServerIds[id] = true;
      }
      return knownServerIds;
    }
    function processUnread(newMsgs) {
      if (isOpen) return;
      var inc = 0;
      for (var i = 0; i < newMsgs.length; i++) {
        if (newMsgs[i].senderType !== 'customer') inc++;
      }
      if (inc === 0) return;
      unread += inc;
      badge.textContent = unread > 9 ? '9+' : String(unread);
      badge.style.display = 'flex';
      playNotificationSound();
    }
    function tick() {
      if (!sessionId) return;
      apiCall('/messages/' + sessionId + '?siteToken=' + encodeURIComponent(SITE_TOKEN))
        .then(function (res) {
          if (!res.success || !res.data) return;
          var agentSwitchNotice = null;
          if (res.meta) {
            var prev = convStatus;
            convStatus = res.meta.status || convStatus;
            var prevAgentId = agentId;
            var prevAgentName = agentName;
            var prevAgentAvatarUrl = agentAvatarUrl;
            var prevAgentOnlineStatus = agentOnlineStatus;
            agentId = res.meta.agentId || '';
            agentName = res.meta.agentName || '';
            agentAvatarUrl = res.meta.agentAvatarUrl || '';
            agentOnlineStatus = res.meta.agentOnlineStatus || '';
            isRated = !!res.meta.rated;
            agentSwitchNotice = buildAgentSwitchNotice(prevAgentId, prevAgentName, agentId, agentName);
            if (prev !== convStatus || prevAgentName !== agentName || prevAgentAvatarUrl !== agentAvatarUrl || prevAgentOnlineStatus !== agentOnlineStatus) updateUI();
          }
          var localState = getLocalServerMessageState();
          var serverLastId = res.data.length > 0 ? String(res.data[res.data.length - 1].id) : '';
          var hasDiff = res.data.length !== localState.count || serverLastId !== localState.lastId;
          if (hasDiff) {
            var knownServerIds = buildKnownServerIds();
            var newMsgs = res.data.filter(function (m) { return !knownServerIds[String(m.id)]; });
            messages = res.data;
            renderMessages();
            processUnread(newMsgs);
          }
          emitAgentSwitchNotice(agentSwitchNotice);
          QueueModule.syncByConversationStatus();
        })
        .catch(function () { /* silent */ });
    }
    function start() {
      if (polling !== null) return;
      if (!visibilityBound) {
        visibilityBound = true;
        document.addEventListener('visibilitychange', rearmTimer);
      }
      polling = setTimeout(function () {
        tick();
        scheduleNextTick();
      }, getPollingDelay());
    }
    function stop() {
      if (polling !== null) {
        clearTimeout(polling);
        polling = null;
      }
    }
    return {
      start: start,
      stop: stop,
    };
  })();

  function playNotificationSound() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.1;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) { /* ignore */ }
  }

  // ---- Events ----
  btn.addEventListener('click', function () {
    isOpen = !isOpen;
    if (isOpen) {
      ProactiveModule.hideCard();
      panel.classList.add('open');
      unread = 0;
      badge.style.display = 'none';
      if (PRE_CHAT && !preChatDone) {
        showPreChatForm();
      } else {
        openChat();
      }
    } else {
      panel.classList.remove('open');
    }
  });

  closeBtn.addEventListener('click', function () {
    isOpen = false;
    panel.classList.remove('open');
  });

  document.getElementById('huoke-proactive-later').addEventListener('click', function () {
    ProactiveModule.hideCard();
  });
  document.getElementById('huoke-proactive-open').addEventListener('click', function () {
    ProactiveModule.hideCard();
    if (!isOpen) {
      isOpen = true;
      panel.classList.add('open');
      unread = 0;
      badge.style.display = 'none';
      if (PRE_CHAT && !preChatDone) {
        showPreChatForm();
      } else {
        openChat();
      }
    }
  });

  window.addEventListener('beforeunload', function () {
    if (!sessionId) return;
    var payload = JSON.stringify({
      siteToken: SITE_TOKEN,
      sessionId: sessionId,
      pageUrl: location.href,
      pageTitle: document.title || '',
      referrer: document.referrer || '',
      duration: Math.max(0, Math.floor((Date.now() - pageEnterAt) / 1000)),
    });
    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(API_BASE + '/api/v1/widget/track-page', blob);
        return;
      } catch (e) { /* fallback below */ }
    }
    trackPage(Date.now() - pageEnterAt);
  });

  function extractVideoFrame(file) {
    return new Promise(function (resolve) {
      try {
        var video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        var url = URL.createObjectURL(file);
        video.src = url;
        video.onloadeddata = function () {
          video.currentTime = Math.min(1, video.duration * 0.1);
        };
        video.onseeked = function () {
          try {
            var canvas = document.createElement('canvas');
            canvas.width = Math.min(video.videoWidth, 640);
            canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
            var ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(function (blob) {
              URL.revokeObjectURL(url);
              resolve(blob);
            }, 'image/jpeg', 0.8);
          } catch (e) {
            URL.revokeObjectURL(url);
            resolve(null);
          }
        };
        video.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
        setTimeout(function () { resolve(null); }, 5000);
      } catch (e) { resolve(null); }
    });
  }

  function uploadFile(file) {
    var formData = new FormData();
    formData.append('file', file);
    return fetch(API_BASE + '/api/v1/widget/upload', {
      method: 'POST',
      body: formData,
    }).then(function (r) { return r.json(); });
  }

  sendBtn.addEventListener('click', function () {
    if (sending) return;
    if (emojiOpen) { emojiOpen = false; emojiPanel.classList.remove('open'); emojiBtn.style.color = ''; }
    var v = inputEl.value.trim();
    if (pendingFile) {
      var isImg = pendingFile.type.startsWith('image/');
      var isVid = pendingFile.type.startsWith('video/');
      var ct = isImg ? 'image' : isVid ? 'video' : 'file';
      var fname = pendingFile.name;
      var theFile = pendingFile;
      pendingFile = null;
      fileInput.value = '';
      imgInput.value = '';
      videoInput.value = '';
      filePreview.style.display = 'none';
      sendBtn.disabled = true;

      if (isVid) {
        Promise.all([
          uploadFile(theFile),
          extractVideoFrame(theFile).then(function (blob) {
            if (!blob) return null;
            var thumbFile = new File([blob], 'thumb_' + fname.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
            return uploadFile(thumbFile);
          })
        ]).then(function (results) {
          var vidRes = results[0];
          var thumbRes = results[1];
          if (vidRes && vidRes.success && vidRes.data) {
            var thumbUrl = (thumbRes && thumbRes.success && thumbRes.data) ? thumbRes.data.url : null;
            sendMessage(v || '[视频]', vidRes.data.url, 'video', thumbUrl);
          } else {
            messages.push({ id: 'err-' + Date.now(), content: '视频上传失败', senderType: 'system' });
            renderMessages();
            sendBtn.disabled = false;
          }
        }).catch(function () {
          messages.push({ id: 'err-' + Date.now(), content: '视频上传失败', senderType: 'system' });
          renderMessages();
          sendBtn.disabled = false;
        });
      } else {
        uploadFile(theFile).then(function (res) {
          if (res.success && res.data) {
            sendMessage(v || (isImg ? '[图片]' : '[文件] ' + fname), res.data.url, ct);
          } else {
            messages.push({ id: 'err-' + Date.now(), content: '文件上传失败', senderType: 'system' });
            renderMessages();
            sendBtn.disabled = false;
          }
        }).catch(function () {
          messages.push({ id: 'err-' + Date.now(), content: '文件上传失败', senderType: 'system' });
          renderMessages();
          sendBtn.disabled = false;
        });
      }
    } else if (v) {
      submitTextMessage(v);
      inputEl.value = '';
      syncSmartPromptsVisibilityByInput();
    }
  });

  smartPromptsEl.addEventListener('click', function (e) {
    var btn2 = e.target.closest('button');
    if (!btn2) return;
    if (btn2.getAttribute('data-action') === 'toggle-prompts') {
      smartPromptsExpanded = !smartPromptsExpanded;
      renderSmartPrompts(smartPromptCache);
      return;
    }
    var text = btn2.getAttribute('data-text');
    if (!text) return;
    smartPromptsPanelOpen = false;
    renderSmartPrompts(smartPromptCache);
    submitTextMessage(text);
  });

  smartToggleBtn.addEventListener('click', function () {
    if (!smartPromptCache || smartPromptCache.length === 0) return;
    clearSmartToggleFade();
    smartPromptsPanelOpen = !smartPromptsPanelOpen;
    renderSmartPrompts(smartPromptCache);
  });

  smartToggleBtn.addEventListener('mouseenter', function () {
    clearSmartToggleFade();
  });
  smartToggleBtn.addEventListener('mouseleave', function () {
    scheduleSmartToggleFade();
  });
  smartToggleBtn.addEventListener('focus', function () {
    clearSmartToggleFade();
  });
  smartToggleBtn.addEventListener('blur', function () {
    scheduleSmartToggleFade();
  });

  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  inputEl.addEventListener('input', function () {
    if (inputEl.value.trim().length > 0) {
      collapseSmartPrompts();
    }
    syncSmartPromptsVisibilityByInput();
  });

  inputEl.addEventListener('paste', function (e) {
    var items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        var file = items[i].getAsFile();
        if (file) handleFileSelect(file);
        break;
      }
    }
  });

  panel.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
  });
  panel.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) handleFileSelect(files[0]);
  });

  humanBtn.addEventListener('click', function () {
    requestHuman();
  });

  // Start proactive rules on page load (does not require panel open)
  ProactiveModule.start();

  // Restore session
  try {
    var saved = localStorage.getItem(SESSION_KEY);
    if (saved) {
      sessionId = saved;
      PollingModule.start();
      trackPage(0);
    }
  } catch (e) { /* */ }
})();
