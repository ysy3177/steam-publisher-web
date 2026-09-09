
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

function extractTitleAndBody(html, titleHint=""){
  const box=document.createElement("div");
  box.innerHTML=html;

  let nodes=[...box.children];
  if(!nodes.length) return {title:"",bodyHtml:""};

  // Cut everything from the explicit exclusion marker onward first.
  const excludeIndex=nodes.findIndex(isExcludeMarker);
  if(excludeIndex>=0) nodes=nodes.slice(0,excludeIndex);

  // Find the preserved banner blocks independently from title detection.
  // The first image-only block is the top banner; the last is the bottom banner.
  const imageOnlyIndexes=[];
  nodes.forEach((el,i)=>{ if(isImageOnlyBlock(el)) imageOnlyIndexes.push(i); });

  if(imageOnlyIndexes.length<2){
    // Conservative fallback: still parse title, but do not throw away body text.
    const textNodes=nodes.filter(el=>normalizeText(el.textContent));
    const hint=normalizeText(titleHint);
    const titleEl=(hint && textNodes.find(el=>normalizeText(el.textContent)===hint)) || textNodes[0] || null;
    const title=normalizeText(hint || titleEl?.textContent || "").split(/[\r\n]/)[0].slice(0,80);

    const bodyBox=document.createElement("div");
    let skippedTitle=false;
    for(const el of nodes){
      if(!skippedTitle && titleEl && el===titleEl){ skippedTitle=true; continue; }
      bodyBox.appendChild(el.cloneNode(true));
    }
    markVisibleBlankLines(bodyBox);
    return {title,bodyHtml:bodyBox.innerHTML.trim()};
  }

  const topBannerIndex=imageOnlyIndexes[0];
  const bottomBannerIndex=imageOnlyIndexes[imageOnlyIndexes.length-1];

  // Title is ONLY taken from the area before the top banner.
  const beforeBanner=nodes.slice(0,topBannerIndex)
    .filter(el=>normalizeText(el.textContent));

  const hint=normalizeText(titleHint);
  let titleEl=null;
  if(hint){
    titleEl=beforeBanner.find(el=>normalizeText(el.textContent)===hint) || null;
  }
  if(!titleEl){
    // DOCX structure is language marker -> title -> top banner.
    // Therefore use the first meaningful text block before the banner,
    // never a later body paragraph.
    titleEl=beforeBanner[0] || null;
  }

  const rawTitle=hint || normalizeText(titleEl?.textContent || "");
  const title=normalizeText(rawTitle).split(/[\r\n]/)[0].slice(0,80);

  // Body is strictly what exists BETWEEN the two preserved banner blocks.
  // This is independent of which element was chosen as the title, preventing
  // intro/body content from disappearing if title parsing ever misbehaves.
  let bodyNodes=nodes.slice(topBannerIndex+1,bottomBannerIndex);

  // Trim only truly empty blocks immediately touching banners.
  while(bodyNodes.length && isBlankBlock(bodyNodes[0])) bodyNodes.shift();
  while(bodyNodes.length && isBlankBlock(bodyNodes[bodyNodes.length-1])) bodyNodes.pop();

  const bodyBox=document.createElement("div");
  bodyNodes.forEach(el=>bodyBox.appendChild(el.cloneNode(true)));
  markVisibleBlankLines(bodyBox);

  return {title,bodyHtml:bodyBox.innerHTML.trim()};
}
function xmlText(el){
  return [...el.getElementsByTagNameNS("*","t")].map(n=>n.textContent||"").join("");
}




async function extractTitleHints(arrayBuffer){
  try{
    const zip=await JSZip.loadAsync(arrayBuffer);
    const raw=await zip.file("word/document.xml").async("string");
    const xml=new DOMParser().parseFromString(raw,"application/xml");
    const body=xml.getElementsByTagNameNS("*","body")[0];
    if(!body) return {};

    const out={};
    let waitingForTitle=null;

    for(const el of [...body.children]){
      if((el.localName||"").toLowerCase()!=="p") continue;

      const txt=normalizeText(xmlText(el));
      const upper=txt.toUpperCase();

      if(SECTION_CODES.includes(upper)){
        waitingForTitle=upper;
        continue;
      }

      if(!waitingForTitle) continue;

      // In the user's DOCX format the language marker is followed directly
      // by the announcement title. Use the FIRST non-empty text paragraph.
      // Never choose the last paragraph before the banner.
      if(txt){
        out[waitingForTitle]=txt.split(/[\r\n]/)[0].trim();
        waitingForTitle=null;
      }
    }

    return out;
  }catch(err){
    console.warn("제목 힌트 추출 실패",err);
    return {};
  }
}
async function extractIndentHints(arrayBuffer){
  try{
    const zip=await JSZip.loadAsync(arrayBuffer);
    const raw=await zip.file("word/document.xml").async("string");
    const xml=new DOMParser().parseFromString(raw,"application/xml");
    const body=xml.getElementsByTagNameNS("*","body")[0];
    if(!body) return {};
    const out={}; let current=null;
    const wns="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const attr=(el,n)=>el?.getAttributeNS(wns,n)||el?.getAttribute("w:"+n)||el?.getAttribute(n)||"";

    for(const el of [...body.children]){
      if((el.localName||"").toLowerCase()!=="p") continue;
      const txt=normalizeText(xmlText(el));
      const upper=txt.toUpperCase();
      if(SECTION_CODES.includes(upper)){current=upper;if(!out[current])out[current]=[];continue;}
      if(!current || !txt) continue;
      const ind=el.getElementsByTagNameNS("*","ind")[0];
      if(!ind) continue;
      const left=Number(attr(ind,"left")||attr(ind,"start")||0);
      const first=Number(attr(ind,"firstLine")||0);
      const hanging=Number(attr(ind,"hanging")||0);
      if(left||first||hanging) out[current].push({text:txt,left,first,hanging});
    }
    return out;
  }catch(err){
    console.warn("들여쓰기 힌트 추출 실패",err);
    return {};
  }
}

function prependNbsp(el,count){
  if(!el || count<=0) return;
  const prefix="\u00a0".repeat(Math.min(16,count));
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null);
  const node=walker.nextNode();
  if(node) node.nodeValue=prefix+(node.nodeValue||"");
  else el.insertBefore(document.createTextNode(prefix),el.firstChild);
}

function applyIndentHints(bodyHtml,hints){
  if(!hints || !hints.length) return bodyHtml;
  const box=document.createElement("div"); box.innerHTML=bodyHtml;
  const blocks=[...box.querySelectorAll("p,li")].filter(el=>!el.closest("table"));
  for(const h of hints){
    const target=normalizeText(h.text);
    const block=blocks.find(el=>normalizeText(el.textContent)===target);
    if(!block) continue;
    // Roughly one visual text space per 180 twips. Keep it conservative.
    const effective=Math.max(0,Number(h.left||0)+Number(h.first||0)-Number(h.hanging||0));
    const spaces=Math.min(12,Math.round(effective/180));
    prependNbsp(block,spaces);
  }
  return box.innerHTML;
}

function preserveInlineWhitespace(bodyHtml){
  const box=document.createElement("div"); box.innerHTML=bodyHtml;
  const walker=document.createTreeWalker(box,NodeFilter.SHOW_TEXT,null);
  let node;
  while((node=walker.nextNode())){
    const parent=node.parentElement;
    if(!parent || /^(SCRIPT|STYLE)$/i.test(parent.tagName)) continue;
    let t=node.nodeValue||"";
    t=t.replace(/\t/g,"\u00a0\u00a0\u00a0\u00a0");
    // Preserve leading/trailing spaces and every run of 2+ spaces.
    t=t.replace(/^ +/,m=>"\u00a0".repeat(m.length));
    t=t.replace(/ +$/,m=>"\u00a0".repeat(m.length));
    t=t.replace(/ {2,}/g,m=>"\u00a0".repeat(m.length-1)+" ");
    node.nodeValue=t;
  }
  return box.innerHTML;
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
    const stylesRaw=zip.file("word/styles.xml") ? await zip.file("word/styles.xml").async("string") : "";
    const xml=new DOMParser().parseFromString(raw,"application/xml");
    const stylesXml=stylesRaw ? new DOMParser().parseFromString(stylesRaw,"application/xml") : null;
    const body=xml.getElementsByTagNameNS("*","body")[0];
    if(!body) return {};
    const wns="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const wVal=(el,n)=>el?.getAttributeNS(wns,n)||el?.getAttribute("w:"+n)||el?.getAttribute(n)||"";

    const styleMap=new Map();
    if(stylesXml){
      for(const st of [...stylesXml.getElementsByTagNameNS("*","style")]){
        const id=wVal(st,"styleId"); if(!id) continue;
        const based=st.getElementsByTagNameNS("*","basedOn")[0];
        const pPr=[...st.children].find(x=>(x.localName||"").toLowerCase()==="ppr")||null;
        styleMap.set(id,{pPr,basedOn:based?wVal(based,"val"):""});
      }
    }
    const pPrOf=el=>[...el.children].find(x=>(x.localName||"").toLowerCase()==="ppr")||null;
    const borderOf=(pPr,side)=>{
      if(!pPr) return null;
      const b=[...pPr.children].find(x=>(x.localName||"").toLowerCase()==="pbdr");
      return b ? [...b.children].find(x=>(x.localName||"").toLowerCase()===side)||null : null;
    };
    const visibleBorder=b=>{
      if(!b) return false; const val=String(wVal(b,"val")||"");
      const sz=Number(wVal(b,"sz")||0);
      return !/^(nil|none|0)?$/i.test(val) && (sz>0 || !!val);
    };
    const styleIdOf=el=>{
      const pPr=pPrOf(el); if(!pPr) return "";
      const ps=[...pPr.children].find(x=>(x.localName||"").toLowerCase()==="pstyle");
      return ps?wVal(ps,"val"):"";
    };
    function styleHasBorder(id,side,seen=new Set()){
      if(!id||seen.has(id)) return false; seen.add(id);
      const st=styleMap.get(id); if(!st) return false;
      if(visibleBorder(borderOf(st.pPr,side))) return true;
      return styleHasBorder(st.basedOn,side,seen);
    }
    const paragraphHasBorder=(el,side)=>visibleBorder(borderOf(pPrOf(el),side))||styleHasBorder(styleIdOf(el),side);

    function isShapeLine(el){
      if(normalizeText(xmlText(el))) return false;
      if(el.getElementsByTagNameNS("*","blip").length || el.getElementsByTagNameNS("*","imagedata").length) return false;
      return el.getElementsByTagNameNS("*","pict").length>0 ||
             el.getElementsByTagNameNS("*","wsp").length>0 ||
             el.getElementsByTagNameNS("*","ln").length>0;
    }

    const out={}; let current=null;
    const kids=[...body.children];
    function prevText(i){for(let j=i-1;j>=0;j--){const t=normalizeText(xmlText(kids[j]));if(t&&!SECTION_CODES.includes(t.toUpperCase()))return t;}return "";}
    function nextText(i){for(let j=i+1;j<kids.length;j++){const t=normalizeText(xmlText(kids[j]));if(t&&!SECTION_CODES.includes(t.toUpperCase()))return t;}return "";}

    for(let i=0;i<kids.length;i++){
      const el=kids[i], local=(el.localName||"").toLowerCase();
      if(local==="p"){
        const txt=normalizeText(xmlText(el)), upper=txt.toUpperCase();
        if(SECTION_CODES.includes(upper)){current=upper;if(!out[current])out[current]=[];continue;}
        if(!current) continue;
        if(txt && paragraphHasBorder(el,"top")) out[current].push({kind:"before",anchor:txt});
        if(txt && paragraphHasBorder(el,"bottom")) out[current].push({kind:"after",anchor:txt});
        if(isShapeLine(el)){
          const prev=prevText(i), next=nextText(i);
          if(prev) out[current].push({kind:"after",anchor:prev}); else if(next) out[current].push({kind:"before",anchor:next});
        }
      }else if(local==="tbl" && current){
        // Empty 1x1 bordered table is another common Word horizontal rule representation.
        const text=normalizeText(xmlText(el));
        const rows=el.getElementsByTagNameNS("*","tr").length;
        const cells=el.getElementsByTagNameNS("*","tc").length;
        if(!text && rows===1 && cells===1){
          const prev=prevText(i), next=nextText(i);
          if(prev) out[current].push({kind:"after",anchor:prev}); else if(next) out[current].push({kind:"before",anchor:next});
        }
      }
    }
    return out;
  }catch(err){console.warn("구분선 힌트 추출 실패",err);return {};}
}

function insertRecoveredSeparators(bodyHtml,hints,titleText){
  const box=document.createElement("div"); box.innerHTML=bodyHtml;
  // Existing HRs from Mammoth are valid separators too.
  [...box.querySelectorAll("hr")].forEach(hr=>hr.classList.add("docx-separator"));
  const titleNorm=normalizeText(titleText);
  const isGap=el=>!!el && (el.classList?.contains("docx-real-gap")||el.classList?.contains("docx-empty-line")||el.classList?.contains("docx-separator-gap")||(el.tagName==="P"&&!normalizeText(el.textContent)&&!el.querySelector("img,table")));
  const findBlock=anchor=>{
    const t=normalizeText(anchor); if(!t||t===titleNorm) return null;
    const els=[...box.querySelectorAll("p,li,div")].filter(el=>!el.closest("table"));
    return els.find(el=>normalizeText(el.textContent)===t)||els.find(el=>normalizeText(el.textContent).includes(t));
  };
  for(const h of (hints||[])){
    const block=findBlock(h.anchor); if(!block) continue;
    const sibling=h.kind==="before"?block.previousElementSibling:block.nextElementSibling;
    if(sibling?.matches?.("hr.docx-separator")) continue;
    const hr=document.createElement("hr"); hr.className="docx-separator";
    if(h.kind==="before") block.before(hr); else block.after(hr);
  }
  // Make separator spacing deterministic across all languages: no inherited
  // blank paragraphs directly around it, exactly one blank line after it.
  for(const hr of [...box.querySelectorAll("hr.docx-separator")]){
    while(isGap(hr.previousElementSibling)) hr.previousElementSibling.remove();
    while(isGap(hr.nextElementSibling)) hr.nextElementSibling.remove();
    const gap=document.createElement("p"); gap.className="docx-separator-gap"; gap.innerHTML="<br>";
    hr.after(gap);
  }
  return box.innerHTML;
}

function normalizeTablesForSteam(bodyHtml){
  const box=document.createElement("div"); box.innerHTML=bodyHtml;
  for(const table of [...box.querySelectorAll("table")]){
    if(!normalizeText(table.textContent) && !table.querySelector("img")){
      const hr=document.createElement("hr"); hr.className="docx-separator"; table.replaceWith(hr); continue;
    }
    table.className="steam-docx-table";
    [...table.attributes].forEach(a=>{if(a.name!=="class")table.removeAttribute(a.name);});
    const first=table.querySelector("tr");
    if(first){
      for(const cell of [...first.children]){
        if(cell.tagName==="TD"){
          const th=document.createElement("th");
          while(cell.firstChild) th.appendChild(cell.firstChild);
          cell.replaceWith(th);
        }
      }
    }
    for(const el of [...table.querySelectorAll("tr,td,th")]){
      [...el.attributes].forEach(a=>el.removeAttribute(a.name));
    }
    for(const cell of [...table.querySelectorAll("td,th")]){
      for(const para of [...cell.querySelectorAll(":scope > p")]){
        while(para.firstChild) cell.insertBefore(para.firstChild,para);
        para.remove();
      }
    }
  }
  return box.innerHTML;
}


function xmlAttr(el,name){
  if(!el) return "";
  return el.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships",name)
    || el.getAttribute("r:"+name) || el.getAttribute(name) || "";
}
function wordAttr(el,name){
  if(!el) return "";
  return el.getAttributeNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main",name)
    || el.getAttribute("w:"+name) || el.getAttribute(name) || "";
}
function htmlEscapeText(v){
  return String(v??"").replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
}
function preserveRunSpaces(text){
  text=String(text??"").replace(/\t/g,"\u00a0\u00a0\u00a0\u00a0");
  text=text.replace(/^ +/,m=>"\u00a0".repeat(m.length));
  text=text.replace(/ +$/,m=>"\u00a0".repeat(m.length));
  text=text.replace(/ {2,}/g,m=>"\u00a0".repeat(m.length-1)+" ");
  return htmlEscapeText(text);
}
function runWrappedHtml(run,text){
  let out=preserveRunSpaces(text);
  const rPr=[...run.children].find(x=>(x.localName||"").toLowerCase()==="rpr");
  if(rPr){
    const has=n=>[...rPr.children].some(x=>(x.localName||"").toLowerCase()===n);
    if(has("b")) out="<strong>"+out+"</strong>";
    if(has("i")) out="<em>"+out+"</em>";
    if(has("u")) out="<u>"+out+"</u>";
  }
  return out;
}
function mimeFromPath(path){
  const ext=(path.split(".").pop()||"").toLowerCase();
  return ({png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",bmp:"image/bmp"}[ext]||"application/octet-stream");
}

async function parseDocxXmlNative(arrayBuffer){
  const zip=await JSZip.loadAsync(arrayBuffer);
  const raw=await zip.file("word/document.xml").async("string");
  const xml=new DOMParser().parseFromString(raw,"application/xml");
  const body=xml.getElementsByTagNameNS("*","body")[0];
  if(!body) throw new Error("DOCX 본문 구조를 찾지 못했습니다.");

  const relMap={};
  const relFile=zip.file("word/_rels/document.xml.rels");
  if(relFile){
    const relRaw=await relFile.async("string");
    const relXml=new DOMParser().parseFromString(relRaw,"application/xml");
    for(const rel of [...relXml.getElementsByTagName("*")]){
      if((rel.localName||"").toLowerCase()!=="relationship") continue;
      const id=rel.getAttribute("Id"), target=rel.getAttribute("Target");
      if(id&&target) relMap[id]=target;
    }
  }

  const imageCache={};
  async function imageData(rid){
    if(!rid) return "";
    if(imageCache[rid]) return imageCache[rid];
    const target=relMap[rid];
    if(!target) return "";
    const normalized=("word/"+target).replace(/word\/\.\//g,"");
    const f=zip.file(normalized) || zip.file(target.replace(/^\.\//,"word/"));
    if(!f) return "";
    const b64=await f.async("base64");
    return imageCache[rid]=`data:${mimeFromPath(target)};base64,${b64}`;
  }

  function paragraphPlainText(p){
    return [...p.getElementsByTagNameNS("*","t")].map(n=>n.textContent||"").join("");
  }
  function isLangMarker(p){
    const t=paragraphPlainText(p).trim().toUpperCase();
    return SECTION_CODES.includes(t) ? t : null;
  }
  function isExcludeText(t){
    return /[<＜]\s*아래\s*내용\s*제외\s*[>＞]/i.test(String(t||""));
  }
  function paragraphIndentStyle(p){
    const pPr=[...p.children].find(x=>(x.localName||"").toLowerCase()==="ppr");
    if(!pPr) return "";
    const ind=[...pPr.children].find(x=>(x.localName||"").toLowerCase()==="ind");
    if(!ind) return "";
    const left=Number(wordAttr(ind,"left")||wordAttr(ind,"start")||0);
    if(!left) return "";
    const px=Math.max(0,Math.min(180,Math.round(left/15)));
    return px?` style="padding-left:${px}px"`:"";
  }

  async function pictToken(node){
    const im=node.getElementsByTagNameNS("*","imagedata")[0];
    if(im){
      const rid=xmlAttr(im,"id");
      const src=await imageData(rid);
      if(src) return {type:"image",src};
    }
    // VML shape without image data = horizontal line / separator.
    return {type:"line"};
  }
  async function drawingToken(node){
    const blip=node.getElementsByTagNameNS("*","blip")[0];
    const rid=blip ? xmlAttr(blip,"embed") : "";
    const src=await imageData(rid);
    return src ? {type:"image",src} : null;
  }

  async function inlineTokens(parent){
    const out=[];
    async function walk(node,runCtx=null){
      for(const ch of [...node.children]){
        const name=(ch.localName||"").toLowerCase();
        if(name==="r"){
          await walk(ch,ch);
        }else if(name==="t"){
          out.push({type:"text",html:runWrappedHtml(runCtx||node,ch.textContent||""),raw:ch.textContent||""});
        }else if(name==="tab"){
          out.push({type:"text",html:"&nbsp;&nbsp;&nbsp;&nbsp;",raw:"\t"});
        }else if(name==="br"){
          out.push({type:"br"});
        }else if(name==="pict"){
          out.push(await pictToken(ch));
        }else if(name==="drawing"){
          const tok=await drawingToken(ch); if(tok) out.push(tok);
        }else{
          await walk(ch,runCtx);
        }
      }
    }
    await walk(parent,null);
    return out.filter(Boolean);
  }

  function splitTokensToHtml(tokens,indentStyle=""){
    let html="",buf="";
    const flush=()=>{
      if(buf!==""){ html+=`<p${indentStyle}>${buf}</p>`; buf=""; }
    };
    for(const tok of tokens){
      if(tok.type==="text") buf+=tok.html;
      else if(tok.type==="br") buf+="<br>";
      else if(tok.type==="line"){
        flush(); html+='<hr class="docx-separator">';
      }else if(tok.type==="image"){
        flush(); html+=`<p class="docx-content-image"><img src="${tok.src}" alt=""></p>`;
      }
    }
    flush();
    return html;
  }

  async function renderParagraph(p){
    const raw=paragraphPlainText(p);
    const tokens=await inlineTokens(p);
    const meaningful=tokens.some(t=>t.type==="image"||t.type==="line"||(t.type==="text"&&String(t.raw).trim()));
    if(!meaningful){
      return '<p class="docx-empty-line"><br></p>';
    }
    return splitTokensToHtml(tokens,paragraphIndentStyle(p));
  }

  async function renderTable(tbl){
    const rows=[...tbl.children].filter(x=>(x.localName||"").toLowerCase()==="tr");
    let html='<table class="steam-docx-table"><tbody>';
    for(let ri=0;ri<rows.length;ri++){
      html+="<tr>";
      const cells=[...rows[ri].children].filter(x=>(x.localName||"").toLowerCase()==="tc");
      for(const cell of cells){
        const tag=ri===0?"th":"td";
        let colspan="";
        const tcPr=[...cell.children].find(x=>(x.localName||"").toLowerCase()==="tcpr");
        if(tcPr){
          const gs=[...tcPr.children].find(x=>(x.localName||"").toLowerCase()==="gridspan");
          const span=gs?Number(wordAttr(gs,"val")||0):0;
          if(span>1) colspan=` colspan="${span}"`;
        }
        let inner="";
        for(const child of [...cell.children]){
          const n=(child.localName||"").toLowerCase();
          if(n==="p") inner+=await renderParagraph(child);
        }
        // unwrap paragraph wrappers inside cells for cleaner Steam tables
        const tmp=document.createElement("div"); tmp.innerHTML=inner;
        const flattened=[...tmp.children].map(el=>{
          if(el.tagName==="P" && !el.classList.contains("docx-content-image")) return el.innerHTML;
          return el.outerHTML;
        }).join("");
        html+=`<${tag}${colspan}>${flattened}</${tag}>`;
      }
      html+="</tr>";
    }
    html+="</tbody></table>";
    return html;
  }

  const sections={};
  let current=null;
  for(const block of [...body.children]){
    const name=(block.localName||"").toLowerCase();
    if(name==="p"){
      const marker=isLangMarker(block);
      if(marker){ current=marker; sections[current]=[]; continue; }
    }
    if(current) sections[current].push(block);
  }

  const parsedOut={};
  for(const code of SECTION_CODES){
    const blocks=sections[code];
    if(!blocks) continue;

    let title="";
    let titleFound=false;
    let bodyParts=[];
    let stop=false;

    for(let bi=0;bi<blocks.length && !stop;bi++){
      const block=blocks[bi];
      const name=(block.localName||"").toLowerCase();

      if(name==="p"){
        const raw=paragraphPlainText(block);
        if(isExcludeText(raw)){ stop=true; break; }
        const tokens=await inlineTokens(block);

        if(!titleFound){
          const firstTextIndex=tokens.findIndex(t=>t.type==="text"&&String(t.raw).trim());
          if(firstTextIndex<0){
            // Skip blanks before title; keep structural items only after title exists.
            continue;
          }

          // Title is the initial textual segment until first structural token.
          let titleRaw="";
          let cut=tokens.length;
          for(let i=firstTextIndex;i<tokens.length;i++){
            const t=tokens[i];
            if(t.type==="text") titleRaw+=t.raw;
            else { cut=i; break; }
          }
          title=String(titleRaw).trim().replace(/\s+/g," ");
          titleFound=true;

          // If this same paragraph also contains line/body/image (CN case),
          // keep everything after the title segment as body.
          const rest=tokens.slice(cut);
          if(rest.length){
            bodyParts.push(splitTokensToHtml(rest,paragraphIndentStyle(block)));
          }
          continue;
        }

        bodyParts.push(await renderParagraph(block));
      }else if(name==="tbl"){
        if(titleFound) bodyParts.push(await renderTable(block));
      }
    }

    // Remove existing Steam banner images only when they are image-only blocks
    // at the absolute start/end of the DOCX body. Article/content images remain.
    const temp=document.createElement("div");
    temp.innerHTML=bodyParts.join("");
    const kids=[...temp.children];
    const isImageOnly=el=>el.tagName==="P" && !!el.querySelector("img") && !(el.textContent||"").trim();
    if(kids.length && isImageOnly(kids[0])) kids[0].remove();
    const kids2=[...temp.children];
    if(kids2.length && isImageOnly(kids2[kids2.length-1])) kids2[kids2.length-1].remove();

    // Strip only leading/trailing blank paragraphs; preserve all internal spacing exactly.
    while(temp.firstElementChild && temp.firstElementChild.classList.contains("docx-empty-line")) temp.firstElementChild.remove();
    while(temp.lastElementChild && temp.lastElementChild.classList.contains("docx-empty-line")) temp.lastElementChild.remove();

    parsedOut[code]={title,bodyHtml:temp.innerHTML.trim()};
  }

  return parsedOut;
}

async function analyze(){
  if(!selectedFile)return;
  analyzeBtn.disabled=true; analyzeBtn.textContent="분석 중...";
  try{
    const arrayBuffer=await selectedFile.arrayBuffer();
    parsed=await parseDocxXmlNative(arrayBuffer);
    renderLangStatus();
    renderTabs();
  }catch(err){
    console.error(err);
    alert("DOCX 분석 중 오류가 발생했습니다.\n\n"+(err?.message||String(err)));
  }finally{
    analyzeBtn.disabled=false;
    analyzeBtn.textContent="문서 분석";
  }
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



const copyChromeExtensionsBtn = document.querySelector("#copyChromeExtensionsBtn");
if (copyChromeExtensionsBtn) {
  copyChromeExtensionsBtn.addEventListener("click", async () => {
    const value = "chrome://extensions";
    let copied = false;

    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch (_) {
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand("copy");
        ta.remove();
      } catch (_) {}
    }

    if (copied) {
      copyChromeExtensionsBtn.textContent = "복사 완료";
      setTimeout(() => {
        copyChromeExtensionsBtn.textContent = "주소 복사";
      }, 1500);
    } else {
      alert("주소 복사에 실패했습니다. chrome://extensions 를 직접 복사해주세요.");
    }
  });
}

// ===== Steam Chrome extension bridge (v0.7.4) =====

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
      setRunStatus("success","✓ Steam 공지 적용 완료",`${count}/7 언어 적용 완료 · 저장/게시하지 않음`);

    }else{
      const msg=d.error || "알 수 없는 오류";
      setRunStatus("error","✕ Steam 공지 적용 중단",msg);
      alert("Steam 공지 적용 중 오류가 발생했습니다.\n\n" + msg);
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
    const badTitles=Object.entries(payloads).filter(([_,v])=>v.title.length>80 || /[\r\n]/.test(v.title)).map(([k,v])=>`${k}(${v.title.length}자)`);
    if(badTitles.length){
      alert("Steam 제목이 80자를 초과했거나 줄바꿈이 포함되어 중단합니다: " + badTitles.join(", ") + "\n미리보기의 공지 제목이 실제 DOCX 제목과 같은지 확인해주세요.");
      return;
    }

    const ok = confirm("Steam 공지 적용을 진행합니다.");
    if(!ok) return;

    setRunStatus("running","Steam 공지 적용 중…","KR → EN → JP → CN → TW → TH → RU 순서로 진행 중");
    scanResult.className = "scan-result empty";
    scanResult.textContent = "Steam 공지를 언어별로 적용 중입니다. 완료될 때까지 잠시 기다려주세요.";

    window.postMessage({
      source:"steam-publisher-web",
      type:"MULTI_UNSAVED_TEST_REQUEST",
      payload:{languages:payloads}
    }, "*");
  });
}

setTimeout(requestFullDiagnostic, 600);

renderLangStatus();
