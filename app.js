
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



async function extractManualLineBreakHints(arrayBuffer){
  try{
    const zip=await JSZip.loadAsync(arrayBuffer);
    const raw=await zip.file("word/document.xml").async("string");
    const xml=new DOMParser().parseFromString(raw,"application/xml");
    const body=xml.getElementsByTagNameNS("*","body")[0];
    if(!body) return {};

    const out={};
    let current=null;

    function paragraphLines(p){
      const lines=[""];
      const walker=xml.createTreeWalker(p, NodeFilter.SHOW_ELEMENT, null);
      let node=p;
      while(node){
        const local=(node.localName||"").toLowerCase();
        if(local==="t"){
          lines[lines.length-1]+=node.textContent||"";
        }else if(local==="br"){
          lines.push("");
        }else if(local==="tab"){
          lines[lines.length-1]+="\t";
        }
        node=walker.nextNode();
      }
      return lines;
    }

    for(const el of [...body.children]){
      if((el.localName||"").toLowerCase()!=="p") continue;
      const full=normalizeText(xmlText(el));
      const upper=full.toUpperCase();
      if(SECTION_CODES.includes(upper)){
        current=upper;
        if(!out[current]) out[current]=[];
        continue;
      }
      if(!current) continue;

      const lines=paragraphLines(el);
      if(lines.length>1){
        out[current].push(lines);
      }
    }
    return out;
  }catch(err){
    console.warn("수동 줄바꿈 힌트 추출 실패",err);
    return {};
  }
}

function insertBreakAtTextOffset(block, offset){
  const walker=document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
  let node;
  let pos=0;
  while((node=walker.nextNode())){
    const len=(node.nodeValue||"").length;
    const end=pos+len;

    if(offset===pos){
      node.parentNode.insertBefore(document.createElement("br"), node);
      return true;
    }
    if(offset>pos && offset<end){
      const tail=node.splitText(offset-pos);
      tail.parentNode.insertBefore(document.createElement("br"), tail);
      return true;
    }
    if(offset===end){
      node.parentNode.insertBefore(document.createElement("br"), node.nextSibling);
      return true;
    }
    pos=end;
  }
  return false;
}

function repairManualLineBreaks(bodyHtml, lineBreakHints, titleText){
  if(!lineBreakHints || !lineBreakHints.length) return bodyHtml;

  const box=document.createElement("div");
  box.innerHTML=bodyHtml;
  const titleNorm=normalizeText(titleText);

  for(const lines of lineBreakHints){
    if(!Array.isArray(lines) || lines.length<2) continue;
    const sourceJoined=lines.join("");
    const sourceNorm=normalizeText(sourceJoined);
    if(!sourceNorm || sourceNorm===titleNorm) continue;

    const blocks=[...box.querySelectorAll("p")];
    const block=blocks.find(p=>{
      const raw=p.textContent||"";
      const norm=normalizeText(raw);
      return norm===sourceNorm || raw===sourceJoined;
    });
    if(!block) continue;

    // Mammoth may flatten Word's w:br into a continuous text stream.
    // Re-insert the break immediately before each original line segment.
    const raw=block.textContent||"";
    const offsets=[];
    let searchFrom=0;
    for(let i=1;i<lines.length;i++){
      const segment=lines[i];
      if(!segment) continue;
      const idx=raw.indexOf(segment, searchFrom);
      if(idx>=0){
        offsets.push(idx);
        searchFrom=idx+segment.length;
      }
    }

    // Insert from the end so earlier text offsets remain stable.
    offsets.sort((a,b)=>b-a).forEach(off=>insertBreakAtTextOffset(block,off));
  }

  return box.innerHTML;
}

async function extractParagraphHints(arrayBuffer){
  try{
    const zip=await JSZip.loadAsync(arrayBuffer);
    const raw=await zip.file("word/document.xml").async("string");
    const xml=new DOMParser().parseFromString(raw,"application/xml");
    const body=xml.getElementsByTagNameNS("*","body")[0];
    if(!body) return {};
    const out={}; let current=null;
    for(const el of [...body.children]){
      if((el.localName||"").toLowerCase()!=="p") continue;
      const txt=normalizeText(xmlText(el));
      const upper=txt.toUpperCase();
      if(SECTION_CODES.includes(upper)){
        current=upper;
        if(!out[current]) out[current]=[];
        continue;
      }
      if(!current) continue;
      const hasDrawing=el.getElementsByTagNameNS("*","drawing").length>0 ||
                       el.getElementsByTagNameNS("*","pict").length>0;
      if(txt) out[current].push(txt);
      else if(!hasDrawing) out[current].push("");
    }
    return out;
  }catch(err){
    console.warn("문단 힌트 추출 실패",err);
    return {};
  }
}

function repairMergedParagraphs(bodyHtml, paragraphHints, titleText){
  if(!paragraphHints || !paragraphHints.length) return bodyHtml;
  const box=document.createElement("div");
  box.innerHTML=bodyHtml;
  const titleNorm=normalizeText(titleText);
  const hints=paragraphHints.filter(t=>normalizeText(t)!==titleNorm && normalizeText(t));

  // Mammoth occasionally places two consecutive Word paragraphs in one HTML
  // paragraph when list/indent styling changes. Split only when two exact
  // consecutive source paragraph texts are found joined inside one <p>.
  for(let i=0;i<hints.length-1;i++){
    const a=normalizeText(hints[i]), b=normalizeText(hints[i+1]);
    if(!a || !b) continue;
    const blocks=[...box.querySelectorAll("p")];
    for(const block of blocks){
      const bt=normalizeText(block.textContent);
      if(bt===a+" "+b || bt===a+b){
        const raw=block.textContent||"";
        const pos=raw.indexOf(hints[i+1]);
        if(pos<=0) continue;

        // Preserve formatting conservatively by cloning the paragraph and
        // replacing text only when it is plain text. Otherwise leave it alone.
        if(block.querySelector("img,table")) continue;
        const p1=block.cloneNode(false), p2=block.cloneNode(false);
        p1.textContent=hints[i];
        p2.textContent=hints[i+1];
        block.replaceWith(p1,p2);
        break;
      }
    }
  }
  return box.innerHTML;
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


async function extractSeparatorHints(arrayBuffer){
  try{
    const zip=await JSZip.loadAsync(arrayBuffer);
    const raw=await zip.file("word/document.xml").async("string");
    const xml=new DOMParser().parseFromString(raw,"application/xml");
    const body=xml.getElementsByTagNameNS("*","body")[0];
    if(!body) return {};

    const out={};
    let current=null;
    const paragraphs=[...body.children].filter(el=>(el.localName||"").toLowerCase()==="p");

    function borderIsVisible(el, side){
      const pPr=[...el.children].find(x=>(x.localName||"").toLowerCase()==="ppr");
      if(!pPr) return false;
      const pBdr=[...pPr.children].find(x=>(x.localName||"").toLowerCase()==="pbdr");
      if(!pBdr) return false;
      const border=[...pBdr.children].find(x=>(x.localName||"").toLowerCase()===side);
      if(!border) return false;
      const val=border.getAttributeNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main","val")
        || border.getAttribute("w:val") || border.getAttribute("val") || "";
      const sz=Number(border.getAttributeNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main","sz")
        || border.getAttribute("w:sz") || border.getAttribute("sz") || 0);
      return !/^(nil|none|0)?$/i.test(String(val)) && sz>0;
    }

    function isShapeOnlySeparator(el){
      const text=normalizeText(xmlText(el));
      if(text) return false;
      const drawings=el.getElementsByTagNameNS("*","drawing");
      const picts=el.getElementsByTagNameNS("*","pict");
      if(!drawings.length && !picts.length) return false;

      // Image drawings contain a:blip. A line/shape normally does not.
      const blips=el.getElementsByTagNameNS("*","blip");
      if(blips.length) return false;

      const lines=el.getElementsByTagNameNS("*","ln");
      const shapes=el.getElementsByTagNameNS("*","wsp");
      return !!(lines.length || shapes.length || picts.length);
    }

    for(let i=0;i<paragraphs.length;i++){
      const el=paragraphs[i];
      const txt=normalizeText(xmlText(el));
      const upper=txt.toUpperCase();
      if(SECTION_CODES.includes(upper)){
        current=upper;
        if(!out[current]) out[current]=[];
        continue;
      }
      if(!current) continue;

      if(txt){
        if(borderIsVisible(el,"top")) out[current].push({kind:"before", anchor:txt});
        if(borderIsVisible(el,"bottom")) out[current].push({kind:"after", anchor:txt});
      }

      if(isShapeOnlySeparator(el)){
        let prev="", next="";
        for(let j=i-1;j>=0;j--){
          const t=normalizeText(xmlText(paragraphs[j]));
          if(t && !SECTION_CODES.includes(t.toUpperCase())){ prev=t; break; }
        }
        for(let j=i+1;j<paragraphs.length;j++){
          const t=normalizeText(xmlText(paragraphs[j]));
          if(t && !SECTION_CODES.includes(t.toUpperCase())){ next=t; break; }
        }
        if(prev) out[current].push({kind:"after", anchor:prev, fallbackNext:next});
        else if(next) out[current].push({kind:"before", anchor:next});
      }
    }
    return out;
  }catch(err){
    console.warn("구분선 힌트 추출 실패",err);
    return {};
  }
}

function insertRecoveredSeparators(bodyHtml, hints, titleText){
  if(!hints || !hints.length) return bodyHtml;
  const box=document.createElement("div");
  box.innerHTML=bodyHtml;
  const titleNorm=normalizeText(titleText);

  function findBlock(anchor){
    const target=normalizeText(anchor);
    if(!target || target===titleNorm) return null;
    const candidates=[...box.querySelectorAll("p,li,div,td,th")];
    return candidates.find(el=>normalizeText(el.textContent)===target)
      || candidates.find(el=>normalizeText(el.textContent).includes(target));
  }

  for(const hint of hints){
    const block=findBlock(hint.anchor);
    if(!block) continue;

    const sibling = hint.kind==="before" ? block.previousElementSibling : block.nextElementSibling;
    if(sibling && sibling.tagName==="HR" && sibling.classList.contains("docx-separator")) continue;

    const hr=document.createElement("hr");
    hr.className="docx-separator";
    if(hint.kind==="before") block.parentNode.insertBefore(hr,block);
    else block.parentNode.insertBefore(hr,block.nextSibling);
  }
  return box.innerHTML;
}

function normalizeTablesForSteam(bodyHtml){
  const box=document.createElement("div");
  box.innerHTML=bodyHtml;

  for(const table of [...box.querySelectorAll("table")]){
    table.classList.add("steam-docx-table");

    // Steam's editor looks cleaner when the first row is a true header row.
    const firstRow=table.querySelector("tr");
    if(firstRow){
      for(const cell of [...firstRow.children]){
        if(cell.tagName!=="TD") continue;
        const th=document.createElement("th");
        for(const attr of [...cell.attributes]) th.setAttribute(attr.name,attr.value);
        while(cell.firstChild) th.appendChild(cell.firstChild);
        cell.replaceWith(th);
      }
    }

    // Word/Mammoth often wraps each cell in a <p>. Keep the text/formatting,
    // but remove paragraph margins by marking those wrappers.
    for(const cell of [...table.querySelectorAll("td,th")]){
      for(const para of [...cell.children]){
        if(para.tagName==="P") para.classList.add("steam-table-cell-p");
      }
    }
  }
  return box.innerHTML;
}

async function analyze(){
  if(!selectedFile)return;
  analyzeBtn.disabled=true; analyzeBtn.textContent="분석 중...";
  try{
    const arrayBuffer=await selectedFile.arrayBuffer();
    const blankHints=await extractBlankLineHints(arrayBuffer.slice(0));
    const paragraphHints=await extractParagraphHints(arrayBuffer.slice(0));
    const lineBreakHints=await extractManualLineBreakHints(arrayBuffer.slice(0));
    const separatorHints=await extractSeparatorHints(arrayBuffer.slice(0));
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
        data.bodyHtml=repairManualLineBreaks(data.bodyHtml, lineBreakHints[code]||[], data.title);
        data.bodyHtml=repairMergedParagraphs(data.bodyHtml, paragraphHints[code]||[], data.title);
        data.bodyHtml=insertRecoveredBlankLines(data.bodyHtml, blankHints[code]||[], data.title);
        data.bodyHtml=insertRecoveredSeparators(data.bodyHtml, separatorHints[code]||[], data.title);
        data.bodyHtml=normalizeTablesForSteam(data.bodyHtml);
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

// ===== Steam Chrome extension bridge (v0.6.4) =====

function refreshKrTestButton(){
  if(krTestBtn){
    krTestBtn.disabled = !extensionConnected;
  }
}


let extensionConnected = false;

const checkExtensionBtn = document.querySelector("#checkExtensionBtn");
const boundaryBtn = document.querySelector("#boundaryBtn");
const krTestBtn = document.querySelector("#krTestBtn");
const multiTestBtn = document.querySelector("#multiTestBtn");
const runStatus = document.querySelector("#runStatus");


function setRunStatus(kind,title,detail){
  if(!runStatus) return;
  runStatus.className="run-status "+kind;
  runStatus.innerHTML=`<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail||"")}</span>`;
}

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
    if(krTestBtn) krTestBtn.disabled = !(extensionConnected && d.steamTab);
    if(multiTestBtn) multiTestBtn.disabled = !(extensionConnected && d.steamTab);

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

  if(d.type === "MULTI_UNSAVED_TEST_RESULT"){
    if(d.ok){
      const test=d.result?.test || d.result || {};
      const count=Array.isArray(test.results)?test.results.length:0;
      setRunStatus("success","✓ 7개 언어 미저장 테스트 완료",`${count}/7 언어 적용 완료 · 저장/게시하지 않음`);
      scanResult.className = "scan-result";
      scanResult.innerHTML = `<pre>${escapeHtml(JSON.stringify(d.result, null, 2))}</pre>`;
    }else{
      setRunStatus("error","✕ 7개 언어 테스트 중단",d.error || "알 수 없는 오류");
      scanResult.className = "scan-result";
      scanResult.innerHTML = `<pre>${escapeHtml("7개 언어 미저장 테스트 실패: " + (d.error || "알 수 없는 오류"))}</pre>`;
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
      alert("먼저 위에서 DOCX 파일을 불러와 분석해주세요. 분석이 끝나면 다시 이 버튼을 눌러주세요.");
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


if(multiTestBtn){
  multiTestBtn.addEventListener("click", ()=>{
    const required = ["KR","EN","JP","CN","TW","TH"];
    const missing = required.filter(code => !parsed[code]);
    if(missing.length){
      alert("DOCX에서 다음 언어를 찾지 못했습니다: " + missing.join(", "));
      return;
    }

    const payloads = {
      KR:{source:"KR", title:String(parsed.KR.title||""), bodyHtml:String(parsed.KR.bodyHtml||"")},
      EN:{source:"EN", title:String(parsed.EN.title||""), bodyHtml:String(parsed.EN.bodyHtml||"")},
      JP:{source:"JP", title:String(parsed.JP.title||""), bodyHtml:String(parsed.JP.bodyHtml||"")},
      CN:{source:"CN", title:String(parsed.CN.title||""), bodyHtml:String(parsed.CN.bodyHtml||"")},
      TW:{source:"TW", title:String(parsed.TW.title||""), bodyHtml:String(parsed.TW.bodyHtml||"")},
      TH:{source:"TH", title:String(parsed.TH.title||""), bodyHtml:String(parsed.TH.bodyHtml||"")},
      RU:{source:"EN", title:String(parsed.EN.title||""), bodyHtml:String(parsed.EN.bodyHtml||"")}
    };

    const empty = Object.entries(payloads).filter(([_,v]) => !v.title.trim() || !v.bodyHtml.trim()).map(([k])=>k);
    if(empty.length){
      alert("제목 또는 본문이 비어 있는 언어가 있어 중단합니다: " + empty.join(", "));
      return;
    }

    const ok = confirm(
      "테스트용 복제 공지에서 7개 언어를 순서대로 전환하며 임시 적용합니다.\\n\\n" +
      "KR → EN → JP → CN → TW → TH → RU(EN 내용 사용)\\n\\n" +
      "• 저장/게시 버튼은 누르지 않습니다.\\n" +
      "• 각 언어의 기존 상단/하단 배너는 유지합니다.\\n" +
      "• 실패하면 즉시 중단합니다.\\n" +
      "• 마지막에는 한국어 화면으로 돌아옵니다.\\n" +
      "• Steam 탭을 새로고침하면 저장된 원본으로 돌아갑니다.\\n\\n" +
      "계속할까요?"
    );
    if(!ok) return;

    setRunStatus("running","7개 언어 적용 중…","KR → EN → JP → CN → TW → TH → RU 순서로 진행 중");
    scanResult.className = "scan-result empty";
    scanResult.textContent = "7개 언어를 순서대로 전환하며 미저장 적용 중... Steam 탭은 건드리지 말아주세요.";

    window.postMessage({
      source:"steam-publisher-web",
      type:"MULTI_UNSAVED_TEST_REQUEST",
      payload:{languages:payloads}
    }, "*");
  });
}

setTimeout(requestFullDiagnostic, 600);

renderLangStatus();
