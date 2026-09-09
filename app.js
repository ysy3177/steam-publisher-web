
const SUPPORTED = [
  {steam:"러시아어", code:"RU", source:"EN"},
  {steam:"영어", code:"EN", source:"EN"},
  {steam:"일본어", code:"JP", source:"JP"},
  {steam:"중국어 - 간체", code:"CN", source:"CN"},
  {steam:"중국어 - 번체", code:"TW", source:"TW"},
  {steam:"태국어", code:"TH", source:"TH"},
  {steam:"한국어", code:"KR", source:"KR"},
];
const SECTION_CODES = ["KR","JP","EN","TW","CN","TH"];

let selectedFile = null;
let parsed = {};

const $ = s => document.querySelector(s);
const fileInput = $("#fileInput");
const analyzeBtn = $("#analyzeBtn");
const clearBtn = $("#clearBtn");
const fileName = $("#fileName");
const langGrid = $("#langGrid");
const tabs = $("#tabs");
const detail = $("#detail");
const dropZone = $("#dropZone");
const scanBtn = $("#scanBtn");
const scanResult = $("#scanResult");

function resetUI(){
  selectedFile = null; parsed = {};
  fileInput.value = "";
  analyzeBtn.disabled = true;
  fileName.textContent = "선택된 파일 없음";
  renderLangStatus();
  tabs.innerHTML = "";
  detail.className = "detail empty";
  detail.textContent = "DOCX를 선택한 뒤 분석을 눌러주세요.";
}
function chooseFile(file){
  if(!file) return;
  if(!file.name.toLowerCase().endsWith(".docx")){
    alert("DOCX 파일만 선택해주세요."); return;
  }
  selectedFile = file;
  fileName.textContent = file.name;
  analyzeBtn.disabled = false;
}
fileInput.addEventListener("change", e => chooseFile(e.target.files[0]));
clearBtn.addEventListener("click", resetUI);
["dragenter","dragover"].forEach(evt => dropZone.addEventListener(evt,e=>{e.preventDefault();dropZone.classList.add("drag")}));
["dragleave","drop"].forEach(evt => dropZone.addEventListener(evt,e=>{e.preventDefault();dropZone.classList.remove("drag")}));
dropZone.addEventListener("drop", e => chooseFile(e.dataTransfer.files[0]));

function renderLangStatus(){
  langGrid.innerHTML = SUPPORTED.map(x=>{
    const ok = !!parsed[x.source];
    return `<div class="lang-card"><strong>${x.steam} (${x.code})</strong><div class="${ok?'ok':'missing'}">${ok?`✓ ${x.source} 사용`:`— ${x.source} 대기`}</div></div>`;
  }).join("");
}
function normalizeText(s){return (s||"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim()}
function isMarkerParagraph(p){return SECTION_CODES.includes(normalizeText(p.textContent).toUpperCase())}
function splitByLanguage(container){
  const out={}; let current=null, buffer=[];
  const flush=()=>{
    if(current){
      const box=document.createElement("div");
      buffer.forEach(n=>box.appendChild(n.cloneNode(true)));
      out[current]=box.innerHTML.trim();
    }
    buffer=[];
  };
  [...container.children].forEach(el=>{
    if(isMarkerParagraph(el)){flush();current=normalizeText(el.textContent).toUpperCase()}
    else if(current){buffer.push(el)}
  });
  flush(); return out;
}
function isImageOnlyBlock(el){
  if(!el) return false;
  const text=normalizeText(el.textContent);
  const hasImage=!!el.querySelector("img");
  const hasOtherMeaningful=[...el.querySelectorAll("*")].some(node=>{
    const tag=node.tagName ? node.tagName.toLowerCase() : "";
    return !["img","br","span","a"].includes(tag) && normalizeText(node.textContent);
  });
  return hasImage && !text && !hasOtherMeaningful;
}

function isBlankBlock(el){
  if(!el) return true;
  return !normalizeText(el.textContent) && !el.querySelector("img,table,iframe,video");
}

function isExcludeMarker(el){
  const t=normalizeText(el.textContent)
    .replace(/[＜＞<>]/g,"")
    .replace(/\s+/g,"");
  return t.includes("아래내용제외");
}

function markVisibleBlankLines(container){
  [...container.children].forEach(el=>{
    if(el.tagName && el.tagName.toLowerCase()==="p" && isBlankBlock(el)){
      el.classList.add("docx-empty-line");
      if(!el.innerHTML.trim()) el.innerHTML="<br>";
    }
  });
}

function extractTitleAndBody(html){
  const box=document.createElement("div");
  box.innerHTML=html;

  const candidates=[...box.children].filter(el=>normalizeText(el.textContent));
  if(!candidates.length) return {title:"",bodyHtml:""};

  const titlePattern=/(패치\s*안내|patch\s*notice|ご案内|公告|ประกาศ)/i;
  const titleEl=candidates.find(el=>titlePattern.test(normalizeText(el.textContent)))||candidates[0];
  const title=normalizeText(titleEl.textContent);

  const all=[...box.children];
  const titleIndex=all.indexOf(titleEl);
  let bodyNodes=titleIndex>=0 ? all.slice(titleIndex+1) : [];

  // 1) "< 아래 내용 제외 >"가 있으면 그 문단부터 뒤는 전부 제외.
  const excludeIndex=bodyNodes.findIndex(isExcludeMarker);
  if(excludeIndex>=0){
    bodyNodes=bodyNodes.slice(0,excludeIndex);
  }

  // 2) 제목 직후의 기존 상단 배너와 그 주변 빈 문단 제거.
  while(bodyNodes.length && (isBlankBlock(bodyNodes[0]) || isImageOnlyBlock(bodyNodes[0]))){
    bodyNodes.shift();
  }

  // 3) 문서 끝(또는 제외 마커 직전)의 기존 하단 배너 제거.
  //    일반 콘텐츠 이미지는 유지하고, "끝쪽의 이미지 전용 블록"만 배너로 취급.
  while(bodyNodes.length && isBlankBlock(bodyNodes[bodyNodes.length-1])){
    bodyNodes.pop();
  }
  if(bodyNodes.length && isImageOnlyBlock(bodyNodes[bodyNodes.length-1])){
    bodyNodes.pop();
    while(bodyNodes.length && isBlankBlock(bodyNodes[bodyNodes.length-1])){
      bodyNodes.pop();
    }
  }

  const bodyBox=document.createElement("div");
  bodyNodes.forEach(el=>bodyBox.appendChild(el.cloneNode(true)));

  // 4) Word의 빈 문단을 브라우저에서도 실제 한 줄 공백으로 보이게 처리.
  markVisibleBlankLines(bodyBox);

  return {title,bodyHtml:bodyBox.innerHTML.trim()};
}

function xmlText(el){
  return [...el.getElementsByTagNameNS("*","t")].map(n=>n.textContent||"").join("");
}

async function extractBlankLineHints(arrayBuffer){
  try{
    const zip=await JSZip.loadAsync(arrayBuffer);
    const xmlTextRaw=await zip.file("word/document.xml").async("string");
    const xml=new DOMParser().parseFromString(xmlTextRaw,"application/xml");
    const body=xml.getElementsByTagNameNS("*","body")[0];
    if(!body) return {};

    const hints={};
    let current=null;
    let pendingBlank=0;

    const children=[...body.children];
    for(const el of children){
      const tag=(el.localName||"").toLowerCase();

      if(tag==="p"){
        const txt=normalizeText(xmlText(el));
        const upper=txt.toUpperCase();

        if(SECTION_CODES.includes(upper)){
          current=upper;
          pendingBlank=0;
          if(!hints[current]) hints[current]=[];
          continue;
        }

        if(!current) continue;

        const hasDrawing=el.getElementsByTagNameNS("*","drawing").length>0 ||
                         el.getElementsByTagNameNS("*","pict").length>0;

        if(!txt && !hasDrawing){
          pendingBlank++;
          continue;
        }

        if(txt){
          hints[current].push({text:txt, blankBefore:pendingBlank});
        }
        pendingBlank=0;
      } else if(current && tag==="tbl"){
        pendingBlank=0;
      }
    }
    return hints;
  }catch(err){
    console.warn("빈 줄 힌트 추출 실패",err);
    return {};
  }
}

function insertRecoveredBlankLines(bodyHtml, langHints, titleText){
  if(!langHints || !langHints.length) return bodyHtml;

  const box=document.createElement("div");
  box.innerHTML=bodyHtml;

  const titleNorm=normalizeText(titleText);
  const usefulHints=langHints.filter(h=>normalizeText(h.text)!==titleNorm);

  // Mammoth 결과의 블록을 문서 순서대로 훑으면서 텍스트를 맞춘다.
  const blocks=[...box.querySelectorAll("p,li,h1,h2,h3,h4,h5,h6,blockquote")];
  let startAt=0;

  for(const hint of usefulHints){
    const target=normalizeText(hint.text);
    if(!target || hint.blankBefore<=0) continue;

    let matchIndex=-1;
    for(let i=startAt;i<blocks.length;i++){
      const bt=normalizeText(blocks[i].textContent);
      if(!bt) continue;
      if(bt===target || bt.includes(target) || target.includes(bt)){
        matchIndex=i;
        break;
      }
    }
    if(matchIndex<0) continue;

    const matched=blocks[matchIndex];

    // 이미 바로 앞에 복구용 공백이 있으면 중복 삽입하지 않음.
    let prev=matched.previousElementSibling;
    let existing=0;
    while(prev && prev.classList && prev.classList.contains("docx-real-gap")){
      existing++;
      prev=prev.previousElementSibling;
    }

    const toAdd=Math.max(0,Math.min(hint.blankBefore,3)-existing);
    for(let n=0;n<toAdd;n++){
      const gap=document.createElement("div");
      gap.className="docx-real-gap";
      gap.setAttribute("aria-hidden","true");
      matched.parentNode.insertBefore(gap,matched);
    }
    startAt=matchIndex+1;
  }

  return box.innerHTML;
}

async function analyze(){
  if(!selectedFile)return;
  analyzeBtn.disabled=true; analyzeBtn.textContent="분석 중...";
  try{
    const arrayBuffer=await selectedFile.arrayBuffer();
    const blankHints=await extractBlankLineHints(arrayBuffer.slice(0));
    const result=await mammoth.convertToHtml({arrayBuffer},{
      convertImage:mammoth.images.imgElement(async image=>{
        const buffer=await image.read("base64");
        return {src:`data:${image.contentType};base64,${buffer}`};
      })
    });
    const temp=document.createElement("div"); temp.innerHTML=result.value;
    const sections=splitByLanguage(temp); parsed={};
    for(const code of SECTION_CODES){
      if(sections[code]){
        const data=extractTitleAndBody(sections[code]);
        data.bodyHtml=insertRecoveredBlankLines(data.bodyHtml, blankHints[code]||[], data.title);
        parsed[code]=data;
      }
    }
    renderLangStatus(); renderTabs();
  }catch(err){console.error(err);alert("DOCX 분석 중 오류가 발생했습니다.\n"+err.message)}
  finally{analyzeBtn.disabled=false;analyzeBtn.textContent="문서 분석"}
}
analyzeBtn.addEventListener("click", analyze);

function renderTabs(){
  tabs.innerHTML="";
  const available=SUPPORTED.filter(x=>parsed[x.source]);
  if(!available.length){detail.className="detail";detail.innerHTML="<p>언어 구간을 찾지 못했습니다.</p>";return}
  available.forEach((x,i)=>{
    const b=document.createElement("button"); b.className="tab"+(i===0?" active":""); b.textContent=`${x.steam} (${x.code})`;
    b.addEventListener("click",()=>{[...tabs.children].forEach(c=>c.classList.remove("active"));b.classList.add("active");showDetail(x)});
    tabs.appendChild(b);
  });
  showDetail(available[0]);
}
function showDetail(mapping){
  const data=parsed[mapping.source];
  detail.className="detail";
  detail.innerHTML=`<div class="meta">
    <div class="label">Steam 언어</div><div class="value">${mapping.steam} (${mapping.code})</div>
    <div class="label">DOCX 소스</div><div class="value">${mapping.source}${mapping.code==="RU"?" (러시아어는 영어 안내)":""}</div>
    <div class="label">공지 제목</div><div class="value">${escapeHtml(data.title||"(제목을 찾지 못함)")}</div>
  </div><h3>공지 본문 미리보기</h3><div class="preview">${data.bodyHtml||"<p>(본문 없음)</p>"}</div>`;
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]))}

// ===== Steam Chrome extension bridge (v0.5.2) =====
let extensionConnected = false;

const checkExtensionBtn = document.querySelector("#checkExtensionBtn");
const boundaryBtn = document.querySelector("#boundaryBtn");
const krTestBtn = document.querySelector("#krTestBtn");

const diag = {
  bridge: [document.querySelector("#bridgeDot"), document.querySelector("#bridgeStatus")],
  runtime: [document.querySelector("#runtimeDot"), document.querySelector("#runtimeStatus")],
  steamTab: [document.querySelector("#steamTabDot"), document.querySelector("#steamTabStatus")],
  editor: [document.querySelector("#editorDot"), document.querySelector("#editorStatus")]
};

function setDiag(key, state, text){
  const pair = diag[key];
  if(!pair || !pair[0] || !pair[1]) return;
  pair[0].classList.remove("ok","bad","wait");
  pair[0].classList.add(state);
  pair[1].textContent = text;
}

function resetDiag(){
  setDiag("bridge","wait","확인 중...");
  setDiag("runtime","wait","확인 중...");
  setDiag("steamTab","wait","확인 중...");
  setDiag("editor","wait","확인 중...");
  extensionConnected = false;
  if(scanBtn) scanBtn.disabled = true;
}

function requestFullDiagnostic(){
  resetDiag();
  // This event is intentionally visible to the content script even if the
  // page's own postMessage listener is affected by page code.
  document.documentElement.setAttribute("data-spw-diagnostic-request", String(Date.now()));
  window.postMessage({source:"steam-publisher-web", type:"FULL_DIAGNOSTIC"}, "*");
}

window.addEventListener("message", (e)=>{
  if(e.source !== window) return;
  const d = e.data;
  if(!d || d.source !== "steam-publisher-extension") return;

  if(d.type === "EXTENSION_READY"){
    setDiag("bridge","ok","웹페이지와 연결됨");
  }

  if(d.type === "FULL_DIAGNOSTIC_RESULT"){
    setDiag("bridge", d.bridge ? "ok" : "bad", d.bridge ? "웹페이지와 연결됨" : "웹페이지 연결 실패");
    setDiag("runtime", d.runtime ? "ok" : "bad", d.runtime ? `확장 프로그램 실행 중 (v${d.version || "?"})` : "확장 프로그램 응답 없음");
    setDiag("steamTab", d.steamTab ? "ok" : "bad", d.steamTab ? `Steam 탭 발견: ${d.tabTitle || ""}` : "열려 있는 Steam 탭 없음");
    setDiag("editor", d.editor ? "ok" : "bad", d.editor ? "Steam 공지 편집 화면 확인됨" : (d.steamTab ? "Steam 탭은 있으나 편집 화면으로 확인되지 않음" : "Steam 탭 확인 필요"));

    extensionConnected = !!(d.bridge && d.runtime);
    if(scanBtn) scanBtn.disabled = !(extensionConnected && d.steamTab);
    if(boundaryBtn) boundaryBtn.disabled = !(extensionConnected && d.steamTab);
    if(krTestBtn) krTestBtn.disabled = !(extensionConnected && d.steamTab && parsed.KR);

    if(scanResult){
      scanResult.className = "scan-result";
      scanResult.innerHTML = `<pre>${escapeHtml(JSON.stringify({
        version: d.version || "",
        steamTabFound: !!d.steamTab,
        editorDetected: !!d.editor,
        tabTitle: d.tabTitle || "",
        tabUrl: d.tabUrl || "",
        note: "이 진단은 Steam 내용을 수정하지 않습니다."
      }, null, 2))}</pre>`;
    }
  }

  if(d.type === "KR_UNSAVED_TEST_RESULT"){
    if(d.ok){
      scanResult.className = "scan-result";
      scanResult.innerHTML = `<pre>${escapeHtml(JSON.stringify(d.result, null, 2))}</pre>`;
    }else{
      scanResult.className = "scan-result";
      scanResult.innerHTML = `<pre>${escapeHtml("한국어 미저장 테스트 실패: " + (d.error || "알 수 없는 오류"))}</pre>`;
    }
  }

  if(d.type === "BOUNDARY_RESULT"){
    if(d.ok){
      scanResult.className = "scan-result";
      scanResult.innerHTML = `<pre>${escapeHtml(JSON.stringify(d.result, null, 2))}</pre>`;
    }else{
      scanResult.className = "scan-result";
      scanResult.innerHTML = `<pre>${escapeHtml("배너 경계 확인 실패: " + (d.error || "알 수 없는 오류"))}</pre>`;
    }
  }

  if(d.type === "SAFE_SCAN_RESULT"){
    if(d.ok){
      scanResult.className = "scan-result";
      scanResult.innerHTML = `<pre>${escapeHtml(JSON.stringify(d.result, null, 2))}</pre>`;
    }else{
      scanResult.className = "scan-result";
      scanResult.innerHTML = `<pre>${escapeHtml("진단 실패: " + (d.error || "알 수 없는 오류"))}</pre>`;
    }
  }
});

if(checkExtensionBtn){
  checkExtensionBtn.addEventListener("click", ()=>{
    requestFullDiagnostic();
    setTimeout(()=>{
      const runtimeText = diag.runtime?.[1]?.textContent || "";
      if(runtimeText === "확인 중..."){
        setDiag("bridge","bad","확장 프로그램의 사이트 연결 스크립트가 응답하지 않음");
        setDiag("runtime","bad","확장 프로그램 응답 없음");
        setDiag("steamTab","bad","확인할 수 없음");
        setDiag("editor","bad","확인할 수 없음");
        if(scanResult){
          scanResult.className = "scan-result";
          scanResult.innerHTML = `<pre>${escapeHtml(
            "연결 스크립트가 이 페이지에서 실행되지 않았습니다.\n" +
            "Chrome 확장 프로그램 상세정보에서 '사이트 액세스'가 허용되어 있는지 확인해주세요.\n" +
            "현재 진단은 Steam 내용을 수정하지 않습니다."
          )}</pre>`;
        }
      }
    }, 1800);
  });
}

if(scanBtn){
  scanBtn.addEventListener("click", ()=>{
    if(!extensionConnected){
      alert("먼저 연결 상태 진단을 실행해주세요.");
      return;
    }
    scanResult.className = "scan-result empty";
    scanResult.textContent = "열려 있는 Steam 탭의 구조를 읽는 중...";
    document.documentElement.setAttribute("data-spw-safe-scan-request", String(Date.now()));
    window.postMessage({source:"steam-publisher-web", type:"SAFE_SCAN_REQUEST"}, "*");
  });
}


if(boundaryBtn){
  boundaryBtn.addEventListener("click", ()=>{
    if(!extensionConnected){
      alert("먼저 연결 상태 진단을 실행해주세요.");
      return;
    }
    scanResult.className = "scan-result empty";
    scanResult.textContent = "Steam 편집기에서 제목·본문·상단/하단 배너 경계를 표시하는 중...";
    document.documentElement.setAttribute("data-spw-boundary-request", String(Date.now()));
    window.postMessage({source:"steam-publisher-web", type:"BOUNDARY_REQUEST"}, "*");
  });
}


if(krTestBtn){
  krTestBtn.addEventListener("click", ()=>{
    const kr = parsed.KR;
    if(!kr){
      alert("먼저 DOCX를 불러와서 KR 문서를 분석해주세요.");
      return;
    }
    const ok = confirm(
      "테스트용 복제 공지의 한국어 화면에만 임시로 내용을 넣습니다.\n\n" +
      "• 저장 버튼은 누르지 않습니다.\n" +
      "• 상단/하단 배너는 유지합니다.\n" +
      "• 문제가 있으면 Steam 탭을 새로고침하면 저장된 내용으로 돌아갑니다.\n\n" +
      "계속할까요?"
    );
    if(!ok) return;

    const titlePayload = String(kr.title || "");
    const bodyPayload = String(kr.bodyHtml || "");

    if(!bodyPayload.trim()){
      scanResult.className = "scan-result";
      scanResult.innerHTML = `<pre>${escapeHtml(
        "웹앱 단계에서 KR 본문이 비어 있습니다.\n" +
        `titleLength=${titlePayload.length}, bodyHtmlLength=${bodyPayload.length}\n` +
        "문서 미리보기에는 본문이 보인다면 브라우저 캐시 문제일 가능성이 큽니다."
      )}</pre>`;
      return;
    }

    scanResult.className = "scan-result empty";
    scanResult.textContent =
      `한국어 임시 적용 중... (제목 ${titlePayload.length}자 / 본문 HTML ${bodyPayload.length}자)`;

    window.postMessage({
      source:"steam-publisher-web",
      type:"KR_UNSAVED_TEST_REQUEST",
      payload:{
        title: titlePayload,
        bodyHtml: bodyPayload,
        debug:{
          titleLength:titlePayload.length,
          bodyHtmlLength:bodyPayload.length
        }
      }
    }, "*");
  });
}

setTimeout(requestFullDiagnostic, 600);

renderLangStatus();
