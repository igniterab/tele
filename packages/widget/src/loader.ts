/**
 * Tele embeddable chat widget loader.
 *
 * Install with a single script tag:
 *   <script src="https://<your-tele-host>/tele-widget.js" data-workspace="acme-support" async></script>
 *
 * This file intentionally has zero dependencies and no build-time coupling to
 * the dashboard app beyond the iframe URL — it must run unmodified on an
 * arbitrary third-party page.
 */

interface TeleWidgetApi {
  open(): void;
  close(): void;
  toggle(): void;
}

declare global {
  interface Window {
    Tele?: TeleWidgetApi;
  }
}

(function init() {
  const currentScript = document.currentScript as HTMLScriptElement | null;
  const workspaceSlug = currentScript?.getAttribute("data-workspace");
  if (!workspaceSlug) {
    console.error("[Tele widget] missing required data-workspace attribute on the script tag");
    return;
  }

  // Derive our own origin from the script's own src so this works regardless
  // of what domain embeds it, and regardless of which environment (local/
  // staging/prod) served the script.
  const origin = new URL(currentScript!.src).origin;

  const STYLE_ID = "tele-widget-styles";
  const BUBBLE_SIZE = 60;
  const PANEL_WIDTH = 380;
  const PANEL_HEIGHT = 600;

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .tele-widget-bubble {
        position: fixed; bottom: 20px; right: 20px; width: ${BUBBLE_SIZE}px; height: ${BUBBLE_SIZE}px;
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
        position: fixed; bottom: 92px; right: 20px; width: ${PANEL_WIDTH}px; height: ${PANEL_HEIGHT}px;
        max-height: calc(100vh - 120px); border: none; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        z-index: 2147483000; display: none; background: #fff;
      }
      .tele-widget-panel.tele-widget-open { display: block; }
      @media (max-width: 480px) {
        .tele-widget-panel { width: 100vw; height: 100vh; max-height: 100vh; bottom: 0; right: 0; border-radius: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  const bubble = document.createElement("button");
  bubble.className = "tele-widget-bubble";
  bubble.setAttribute("aria-label", "Open chat");
  bubble.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4h16v12H7l-3 3V4z" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg>';

  const badge = document.createElement("span");
  badge.className = "tele-widget-badge";
  badge.style.display = "none";
  bubble.appendChild(badge);

  const iframe = document.createElement("iframe");
  iframe.className = "tele-widget-panel";
  iframe.title = "Chat with us";
  iframe.src = `${origin}/widget-frame?workspaceSlug=${encodeURIComponent(workspaceSlug)}`;

  let isOpen = false;

  function render() {
    iframe.classList.toggle("tele-widget-open", isOpen);
    if (isOpen) {
      badge.style.display = "none";
      badge.textContent = "";
      iframe.contentWindow?.postMessage({ type: "tele:panel-opened" }, origin);
    }
  }

  const api: TeleWidgetApi = {
    open() {
      isOpen = true;
      render();
    },
    close() {
      isOpen = false;
      render();
    },
    toggle() {
      isOpen = !isOpen;
      render();
    },
  };

  bubble.addEventListener("click", () => api.toggle());

  window.addEventListener("message", (event) => {
    if (event.origin !== origin) return;
    const data = event.data as { type?: string; count?: number } | undefined;
    if (data?.type === "tele:unread" && !isOpen) {
      const count = data.count ?? 0;
      if (count > 0) {
        badge.textContent = String(count > 9 ? "9+" : count);
        badge.style.display = "block";
      } else {
        badge.style.display = "none";
      }
    }
  });

  function mount() {
    document.body.appendChild(iframe);
    document.body.appendChild(bubble);
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  window.Tele = api;
})();
