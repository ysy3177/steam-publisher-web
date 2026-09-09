
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
let steamWindow = null;
let steamConnected = false;

const $ = s => document.querySelector(s);
const fileInput = $("#fileInput");
const analyzeBtn = $("#analyzeBtn");
const clearBtn = $("#clearBtn");
const fileName = $("#fileName");
const langGrid = $("#langGrid");
const tabs = $("#tabs");
const detail = $("#detail");
const dropZone = $("#dropZone");
const bookmarklet = $("#bookmarklet");
const steamUrl = $("#steamUrl");
const openSteamBtn = $("#openSteamBtn");
const scanBtn = $("#scanBtn");
const scanResult = $("#scanResult");
const statusDot = $("#statusDot");
const connectionStatus = $("#connectionStatus");

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
function extractTitleAndBody(html){
  const box=document.createElement("div"); box.innerHTML=html;
  const candidates=[...box.children].filter(el=>normalizeText(el.textContent));
  if(!candidates.length) return {title:"",bodyHtml:""};
  const titlePattern=/(패치\s*안내|patch\s*notice|ご案内|公告|ประกาศ)/i;
  const titleEl=candidates.find(el=>titlePattern.test(normalizeText(el.textContent)))||candidates[0];
  const title=normalizeText(titleEl.textContent);
  const all=[...box.children], idx=all.indexOf(titleEl), bodyBox=document.createElement("div");
  if(idx>=0) all.slice(idx+1).forEach(el=>bodyBox.appendChild(el.cloneNode(true)));
  return {title,bodyHtml:bodyBox.innerHTML.trim()};
}
async function analyze(){
  if(!selectedFile)return;
  analyzeBtn.disabled=true; analyzeBtn.textContent="분석 중...";
  try{
    const arrayBuffer=await selectedFile.arrayBuffer();
    const result=await mammoth.convertToHtml({arrayBuffer},{
      convertImage:mammoth.images.imgElement(async image=>{
        const buffer=await image.read("base64");
        return {src:`data:${image.contentType};base64,${buffer}`};
      })
    });
    const temp=document.createElement("div"); temp.innerHTML=result.value;
    const sections=splitByLanguage(temp); parsed={};
    for(const code of SECTION_CODES) if(sections[code]) parsed[code]=extractTitleAndBody(sections[code]);
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

// ===== Steam safe diagnostics =====
function buildBookmarklet(){
  const agentUrl = new URL("steam-agent.js", window.location.href).href + "?v=020";
  const js = `javascript:(()=>{const u=${JSON.stringify(agentUrl)};const old=document.getElementById('steam-publisher-agent');if(old)old.remove();const s=document.createElement('script');s.id='steam-publisher-agent';s.src=u;document.documentElement.appendChild(s)})()`;
  bookmarklet.href = js;
}
buildBookmarklet();

openSteamBtn.addEventListener("click",()=>{
  const url=steamUrl.value.trim();
  if(!url){alert("Steam 공지 편집 페이지 주소를 먼저 붙여넣어주세요.");return}
  try{
    const u=new URL(url);
    const allowed = /(^|\.)steamcommunity\.com$/i.test(u.hostname) || /(^|\.)partner\.steamgames\.com$/i.test(u.hostname);
    if(!allowed){alert("Steam Community 또는 Steamworks 편집 페이지 주소인지 확인해주세요.");return}
    steamWindow=window.open(url,"steamPublisherEdit");
    connectionStatus.textContent="Steam 탭 열림 · 연결 도우미 클릭 대기";
  }catch{alert("주소 형식을 확인해주세요.")}
});

window.addEventListener("message", e=>{
  const d=e.data;
  if(!d || d.source!=="steam-publisher-agent") return;
  if(d.type==="ready"){
    steamConnected=true;
    if(e.source) steamWindow=e.source;
    statusDot.classList.add("on");
    connectionStatus.textContent="Steam 편집기 연결됨";
    scanBtn.disabled=false;
  }
  if(d.type==="scan-result"){
    scanResult.className="scan-result";
    scanResult.innerHTML=`<pre>${escapeHtml(JSON.stringify(d.payload,null,2))}</pre>`;
  }
  if(d.type==="error"){
    scanResult.className="scan-result";
    scanResult.innerHTML=`<pre>${escapeHtml("오류: "+d.message)}</pre>`;
  }
});

scanBtn.addEventListener("click",()=>{
  if(!steamWindow || steamWindow.closed){
    alert("Steam 편집 탭이 닫혀 있습니다."); return;
  }
  steamWindow.postMessage({source:"steam-publisher-web",type:"safe-scan"},"*");
  scanResult.className="scan-result empty";
  scanResult.textContent="Steam 편집기 구조를 읽는 중...";
});

renderLangStatus();
