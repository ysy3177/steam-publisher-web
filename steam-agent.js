(() => {
  "use strict";

  const AGENT_ID = "steam-publisher-agent-runtime";
  const allowed =
    /(^|\.)steamcommunity\.com$/i.test(location.hostname) ||
    /(^|\.)partner\.steamgames\.com$/i.test(location.hostname);

  if (!allowed) {
    alert("Steam Publisher Web 연결 도우미는 Steam 편집 페이지에서만 실행됩니다.");
    return;
  }

  if (window.__steamPublisherAgentLoaded) {
    notifyReady();
    return;
  }
  window.__steamPublisherAgentLoaded = true;

  function send(type, payload = {}) {
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ source: "steam-publisher-agent", type, ...payload }, "*");
      }
    } catch {}
  }

  function notifyReady() {
    send("ready", { href: location.href, title: document.title });
    showOverlay("Steam Publisher Web 연결됨", "현재는 읽기 전용 진단 모드입니다.");
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
  }

  function shortText(s, n = 140) {
    return String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
  }

  function safeAttrs(el) {
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      class: typeof el.className === "string" ? el.className.slice(0, 180) : "",
      role: el.getAttribute("role") || "",
      ariaLabel: el.getAttribute("aria-label") || "",
      placeholder: el.getAttribute("placeholder") || "",
      contenteditable: el.getAttribute("contenteditable") || ""
    };
  }

  function scan() {
    const editables = [...document.querySelectorAll('[contenteditable="true"], textarea')]
      .filter(visible)
      .slice(0, 30)
      .map((el, i) => ({
        index: i,
        ...safeAttrs(el),
        textPreview: shortText(el.innerText || el.value || "", 180),
        childCount: el.children ? el.children.length : 0
      }));

    const textInputs = [...document.querySelectorAll('input[type="text"], input:not([type])')]
      .filter(visible)
      .slice(0, 40)
      .map((el, i) => ({
        index: i,
        ...safeAttrs(el),
        valueLength: (el.value || "").length
      }));

    const selects = [...document.querySelectorAll("select")]
      .filter(visible)
      .slice(0, 20)
      .map((el, i) => ({
        index: i,
        ...safeAttrs(el),
        options: [...el.options].slice(0, 30).map(o => shortText(o.textContent, 80))
      }));

    const buttons = [...document.querySelectorAll("button, [role='button'], a")]
      .filter(visible)
      .map(el => ({ ...safeAttrs(el), text: shortText(el.innerText || el.textContent, 100) }))
      .filter(x => x.text)
      .slice(0, 120);

    const images = [...document.querySelectorAll("img")]
      .filter(visible)
      .slice(0, 50)
      .map((el, i) => {
        const r = el.getBoundingClientRect();
        let src = "";
        try {
          const u = new URL(el.currentSrc || el.src, location.href);
          src = u.origin + u.pathname;
        } catch {}
        return {
          index: i,
          ...safeAttrs(el),
          alt: shortText(el.alt, 100),
          width: Math.round(r.width),
          height: Math.round(r.height),
          src
        };
      });

    const languageWords = ["Russian","English","Japanese","Chinese","Thai","Korean","러시아","영어","일본어","중국어","태국어","한국어"];
    const languageCandidates = buttons.filter(b => languageWords.some(w => b.text.toLowerCase().includes(w.toLowerCase())));

    const saveWords = ["save","저장","保存","儲存","保存","บันทึก"];
    const saveCandidates = buttons.filter(b => saveWords.some(w => b.text.toLowerCase().includes(w.toLowerCase())));

    return {
      mode: "SAFE_READ_ONLY",
      page: {
        href: location.href,
        title: document.title,
        hostname: location.hostname
      },
      counts: {
        editableAreas: editables.length,
        textInputs: textInputs.length,
        selects: selects.length,
        visibleImages: images.length,
        visibleButtonsAndLinks: buttons.length
      },
      editableAreas: editables,
      textInputs,
      selects,
      languageCandidates,
      saveCandidates,
      images
    };
  }

  function showOverlay(title, body) {
    let box = document.getElementById(AGENT_ID);
    if (!box) {
      box = document.createElement("div");
      box.id = AGENT_ID;
      Object.assign(box.style, {
        position: "fixed", right: "18px", bottom: "18px", zIndex: "2147483647",
        maxWidth: "360px", background: "#111820", color: "#dfeaf3",
        border: "1px solid #4d6b82", borderRadius: "10px",
        padding: "14px 16px", boxShadow: "0 10px 30px rgba(0,0,0,.45)",
        font: "13px/1.45 Arial,sans-serif"
      });
      document.documentElement.appendChild(box);
    }
    box.innerHTML = `<div style="font-weight:700;color:#7fc9ff;margin-bottom:5px">${title}</div>
      <div>${body}</div>
      <div style="margin-top:8px;color:#83d59c">읽기 전용 · Steam 내용 수정 없음</div>`;
    setTimeout(() => { try { box.remove(); } catch {} }, 8000);
  }

  window.addEventListener("message", e => {
    const d = e.data;
    if (!d || d.source !== "steam-publisher-web") return;
    if (d.type === "safe-scan") {
      try {
        const payload = scan();
        send("scan-result", { payload });
        showOverlay("안전 진단 완료", `편집 영역 ${payload.counts.editableAreas}개 · 이미지 ${payload.counts.visibleImages}개를 찾았습니다.`);
      } catch (err) {
        send("error", { message: err && err.message ? err.message : String(err) });
      }
    }
  });

  notifyReady();
})();