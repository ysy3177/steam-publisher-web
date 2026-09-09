
(() => {
  const allowedHost = "steam-publisher-web.onrender.com";
  if (location.hostname !== allowedHost) return;

  function post(type, extra = {}) {
    window.postMessage({ source: "steam-publisher-extension", type, ...extra }, "*");
  }

  async function fullDiagnostic(){
    try{
      const r = await chrome.runtime.sendMessage({ type: "FULL_DIAGNOSTIC" });
      post("FULL_DIAGNOSTIC_RESULT", r || {bridge:true, runtime:false});
    }catch(err){
      post("FULL_DIAGNOSTIC_RESULT", {
        bridge:true, runtime:false, steamTab:false, editor:false,
        error: err?.message || String(err)
      });
    }
  }

  async function safeScan(){
    try{
      const r = await chrome.runtime.sendMessage({ type: "SAFE_SCAN" });
      post("SAFE_SCAN_RESULT", {
        ok: !!r?.ok,
        result: r?.ok ? { tab: r.tab, scan: r.result } : null,
        error: r?.error || ""
      });
    }catch(err){
      post("SAFE_SCAN_RESULT", {ok:false, error:err?.message || String(err)});
    }
  }




  async function multiUnsavedTest(payload){
    try{
      const r = await chrome.runtime.sendMessage({type:"MULTI_UNSAVED_TEST", payload});
      post("MULTI_UNSAVED_TEST_RESULT", {
        ok: !!r?.ok,
        result: r?.ok ? {tab:r.tab, test:r.result} : null,
        error: r?.error || ""
      });
    }catch(err){
      post("MULTI_UNSAVED_TEST_RESULT", {ok:false,error:err?.message || String(err)});
    }
  }

  async function krUnsavedTest(payload){
    try{
      const safePayload = {
        title: String(payload?.title || ""),
        bodyHtml: String(payload?.bodyHtml || ""),
        debug: payload?.debug || {}
      };
      const r = await chrome.runtime.sendMessage({type:"KR_UNSAVED_TEST", payload:safePayload});
      post("KR_UNSAVED_TEST_RESULT", {
        ok: !!r?.ok,
        result: r?.ok ? {tab:r.tab, test:r.result} : null,
        error: r?.error || ""
      });
    }catch(err){
      post("KR_UNSAVED_TEST_RESULT", {ok:false,error:err?.message || String(err)});
    }
  }

  async function boundaryCheck(){
    try{
      const r = await chrome.runtime.sendMessage({ type: "BOUNDARY_CHECK" });
      post("BOUNDARY_RESULT", {
        ok: !!r?.ok,
        result: r?.ok ? { tab: r.tab, boundary: r.result } : null,
        error: r?.error || ""
      });
    }catch(err){
      post("BOUNDARY_RESULT", {ok:false, error:err?.message || String(err)});
    }
  }

  post("EXTENSION_READY", {version: chrome.runtime.getManifest().version});

  window.addEventListener("message", (e)=>{
    if(e.source !== window) return;
    const d = e.data;
    if(!d || d.source !== "steam-publisher-web") return;
    if(d.type === "FULL_DIAGNOSTIC") fullDiagnostic();
    if(d.type === "SAFE_SCAN_REQUEST") safeScan();
    if(d.type === "BOUNDARY_REQUEST") boundaryCheck();
    if(d.type === "KR_UNSAVED_TEST_REQUEST") krUnsavedTest(d.payload || {});
    if(d.type === "MULTI_UNSAVED_TEST_REQUEST") multiUnsavedTest(d.payload || {});
  });

  // Redundant observer path: works even if page message handling is interfered with.
  const obs = new MutationObserver((mutations)=>{
    for(const m of mutations){
      if(m.type !== "attributes") continue;
      if(m.attributeName === "data-spw-diagnostic-request") fullDiagnostic();
      if(m.attributeName === "data-spw-safe-scan-request") safeScan();
      if(m.attributeName === "data-spw-boundary-request") boundaryCheck();
    }
  });
  obs.observe(document.documentElement, {attributes:true});
})();
