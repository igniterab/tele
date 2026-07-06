(function(){"use strict";(function(){const d=document.currentScript,c=d==null?void 0:d.getAttribute("data-workspace");if(!c){console.error("[Tele widget] missing required data-workspace attribute on the script tag");return}const a=new URL(d.src).origin,p="tele-widget-styles",g=60,h=380,w=600;if(!document.getElementById(p)){const e=document.createElement("style");e.id=p,e.textContent=`
      .tele-widget-bubble {
        position: fixed; bottom: 20px; right: 20px; width: ${g}px; height: ${g}px;
        border-radius: 50%; background: #4f6df5; box-shadow: 0 4px 14px rgba(0,0,0,0.25);
        border: none; cursor: pointer; z-index: 2147483000; display: flex; align-items: center; justify-content: center;
        transition: transform 0.15s ease;
      }
      .tele-widget-bubble:hover { transform: scale(1.05); }
      .tele-widget-badge {
        position: absolute; top: -2px; right: -2px; background: #ef4444; color: #fff; border-radius: 999px;
        font: 600 11px/1 system-ui, sans-serif; padding: 3px 6px; min-width: 16px; text-align: center;
      }
      .tele-widget-panel {
        position: fixed; bottom: 92px; right: 20px; width: ${h}px; height: ${w}px;
        max-height: calc(100vh - 120px); border: none; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        z-index: 2147483000; display: none; background: #fff;
      }
      .tele-widget-panel.tele-widget-open { display: block; }
      @media (max-width: 480px) {
        .tele-widget-panel { width: 100vw; height: 100vh; max-height: 100vh; bottom: 0; right: 0; border-radius: 0; }
      }
    `,document.head.appendChild(e)}const o=document.createElement("button");o.className="tele-widget-bubble",o.setAttribute("aria-label","Open chat"),o.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4h16v12H7l-3 3V4z" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg>';const t=document.createElement("span");t.className="tele-widget-badge",t.style.display="none",o.appendChild(t);const i=document.createElement("iframe");i.className="tele-widget-panel",i.title="Chat with us",i.src=`${a}/widget-frame?workspaceSlug=${encodeURIComponent(c)}`;let n=!1;function r(){var e;i.classList.toggle("tele-widget-open",n),n&&(t.style.display="none",t.textContent="",(e=i.contentWindow)==null||e.postMessage({type:"tele:panel-opened"},a))}const u={open(){n=!0,r()},close(){n=!1,r()},toggle(){n=!n,r()}};o.addEventListener("click",()=>u.toggle()),window.addEventListener("message",e=>{if(e.origin!==a)return;const s=e.data;if((s==null?void 0:s.type)==="tele:unread"&&!n){const l=s.count??0;l>0?(t.textContent=String(l>9?"9+":l),t.style.display="block"):t.style.display="none"}});function b(){document.body.appendChild(i),document.body.appendChild(o)}document.body?b():document.addEventListener("DOMContentLoaded",b),window.Tele=u})()})();
