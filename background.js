
function isSteamUrl(url = ""){
  return /^https:\/\/(steamcommunity\.com|partner\.steamgames\.com)\//i.test(url);
}

async function steamTabsQuery(){
  const all = await chrome.tabs.query({});
  return all.filter(t => isSteamUrl(t.url || ""));
}


async function ensureSteamContentScript(tabId){
  try{
    await chrome.tabs.sendMessage(tabId, {type:"PING_CONTENT"});
    return;
  }catch(_){}
  await chrome.scripting.executeScript({
    target: {tabId},
    files: ["steam-content.js"]
  });
}

function looksLikeEditor(tab){
  const u = (tab.url || "").toLowerCase();
  const title = (tab.title || "").toLowerCase();
  // Deliberately broad. v0.3.1 is diagnostic only.
  return /edit|event|announcement|news|admin|manage/.test(u) ||
         /edit|event|announcement|공지|이벤트|수정/.test(title);
}

async function chooseSteamTab(){
  const tabs = await steamTabsQuery();
  if(!tabs.length) throw new Error("열려 있는 Steam 탭을 찾지 못했습니다.");
  const active = tabs.find(t => t.active);
  if(active) return active;
  tabs.sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0));
  return tabs[0];
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
  if(!msg || !msg.type) return;

  if(msg.type === "FULL_DIAGNOSTIC"){
    (async()=>{
      try{
        const tabs = await steamTabsQuery();
        const tab = tabs.length ? (tabs.find(t=>t.active) || [...tabs].sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0))[0]) : null;
        sendResponse({
          bridge:true,
          runtime:true,
          version: chrome.runtime.getManifest().version,
          steamTab: !!tab,
          editor: !!tab && looksLikeEditor(tab),
          tabTitle: tab?.title || "",
          tabUrl: tab?.url || ""
        });
      }catch(err){
        sendResponse({
          bridge:true, runtime:true,
          version: chrome.runtime.getManifest().version,
          steamTab:false, editor:false,
          error:err?.message || String(err)
        });
      }
    })();
    return true;
  }




  if(msg.type === "MULTI_UNSAVED_TEST"){
    (async()=>{
      try{
        const tab = await chooseSteamTab();
        await ensureSteamContentScript(tab.id);
        const result = await chrome.tabs.sendMessage(tab.id, {
          type:"MULTI_UNSAVED_TEST",
          payload: msg.payload || {}
        });
        sendResponse({
          ok:!result?.error,
          tab:{id:tab.id,title:tab.title,url:tab.url},
          result,
          error:result?.error||""
        });
      }catch(err){
        sendResponse({ok:false,error:err?.message || String(err)});
      }
    })();
    return true;
  }

  if(msg.type === "KR_UNSAVED_TEST"){
    (async()=>{
      try{
        const tab = await chooseSteamTab();
        await ensureSteamContentScript(tab.id);
        const result = await chrome.tabs.sendMessage(tab.id, {
          type:"KR_UNSAVED_TEST",
          payload: msg.payload || {}
        });
        sendResponse({ok:!result?.error, tab:{id:tab.id,title:tab.title,url:tab.url}, result, error:result?.error||""});
      }catch(err){
        sendResponse({ok:false,error:err?.message || String(err)});
      }
    })();
    return true;
  }

  if(msg.type === "BOUNDARY_CHECK"){
    (async()=>{
      try{
        const tab = await chooseSteamTab();
        await ensureSteamContentScript(tab.id);
        const result = await chrome.tabs.sendMessage(tab.id, {type:"BOUNDARY_CHECK"});
        sendResponse({ok:true, tab:{id:tab.id,title:tab.title,url:tab.url}, result});
      }catch(err){
        sendResponse({ok:false,error:err?.message || String(err)});
      }
    })();
    return true;
  }

  if(msg.type === "SAFE_SCAN"){
    (async()=>{
      try{
        const tab = await chooseSteamTab();
        await ensureSteamContentScript(tab.id);
        const result = await chrome.tabs.sendMessage(tab.id, {type:"SAFE_SCAN"});
        sendResponse({ok:true, tab:{id:tab.id,title:tab.title,url:tab.url}, result});
      }catch(err){
        sendResponse({ok:false,error:err?.message || String(err)});
      }
    })();
    return true;
  }
});
