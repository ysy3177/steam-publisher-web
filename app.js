
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

const fileInput = document.querySelector("#fileInput");
const analyzeBtn = document.querySelector("#analyzeBtn");
const clearBtn = document.querySelector("#clearBtn");
const fileName = document.querySelector("#fileName");
const langGrid = document.querySelector("#langGrid");
const tabs = document.querySelector("#tabs");
const detail = document.querySelector("#detail");
const dropZone = document.querySelector("#dropZone");

function resetUI(){
  selectedFile = null;
  parsed = {};
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
    alert("DOCX 파일만 선택해주세요.");
    return;
  }
  selectedFile = file;
  fileName.textContent = file.name;
  analyzeBtn.disabled = false;
}

fileInput.addEventListener("change", e => chooseFile(e.target.files[0]));
clearBtn.addEventListener("click", resetUI);

["dragenter","dragover"].forEach(evt => dropZone.addEventListener(evt, e => {
  e.preventDefault(); dropZone.classList.add("drag");
}));
["dragleave","drop"].forEach(evt => dropZone.addEventListener(evt, e => {
  e.preventDefault(); dropZone.classList.remove("drag");
}));
dropZone.addEventListener("drop", e => chooseFile(e.dataTransfer.files[0]));

function renderLangStatus(){
  langGrid.innerHTML = SUPPORTED.map(x => {
    const src = parsed[x.source];
    const ok = !!src;
    return `<div class="lang-card">
      <strong>${x.steam} (${x.code})</strong>
      <div class="${ok?'ok':'missing'}">${ok ? `✓ ${x.source} 사용` : `— ${x.source} 대기`}</div>
    </div>`;
  }).join("");
}

function normalizeText(s){
  return (s || "").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
}

function isMarkerParagraph(p){
  const t = normalizeText(p.textContent).toUpperCase();
  return SECTION_CODES.includes(t);
}

function splitByLanguage(container){
  const out = {};
  let current = null;
  let buffer = [];
  const flush = () => {
    if(current){
      const box = document.createElement("div");
      buffer.forEach(n => box.appendChild(n.cloneNode(true)));
      out[current] = box.innerHTML.trim();
    }
    buffer = [];
  };

  [...container.children].forEach(el => {
    if(isMarkerParagraph(el)){
      flush();
      current = normalizeText(el.textContent).toUpperCase();
    } else if(current){
      buffer.push(el);
    }
  });
  flush();
  return out;
}

function extractTitleAndBody(html){
  const box = document.createElement("div");
  box.innerHTML = html;

  const candidates = [...box.children].filter(el => normalizeText(el.textContent));
  let titleEl = candidates[0] || null;

  // 업무 문서에 내부 관리용 문장이 제목보다 먼저 들어가는 경우를 대비한 간단한 보정.
  // "패치 안내 / Notice / ご案内 / 公告 / ประกาศ" 등의 제목형 문장을 우선 탐색.
  const titlePattern = /(패치\s*안내|notice|ご案内|公告|ประกาศ)/i;
  const matched = candidates.find(el => titlePattern.test(normalizeText(el.textContent)));
  if(matched) titleEl = matched;

  const title = titleEl ? normalizeText(titleEl.textContent) : "";
  if(titleEl) titleEl.remove();

  // 제목 이전의 내부 관리용 텍스트는 본문에서 제외
  if(matched){
    let n = box.firstElementChild;
    while(n && n !== matched){
      const next = n.nextElementSibling;
      n.remove();
      n = next;
    }
  }

  return { title, bodyHtml: box.innerHTML.trim() };
}

async function fileToArrayBuffer(file){
  return await file.arrayBuffer();
}

async function analyze(){
  if(!selectedFile) return;
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "분석 중...";

  try{
    const arrayBuffer = await fileToArrayBuffer(selectedFile);
    const result = await mammoth.convertToHtml(
      {arrayBuffer},
      {
        convertImage: mammoth.images.imgElement(async image => {
          const buffer = await image.read("base64");
          return {src:`data:${image.contentType};base64,${buffer}`};
        })
      }
    );

    const temp = document.createElement("div");
    temp.innerHTML = result.value;

    const sections = splitByLanguage(temp);
    parsed = {};

    for(const code of SECTION_CODES){
      if(sections[code]){
        parsed[code] = extractTitleAndBody(sections[code]);
      }
    }

    renderLangStatus();
    renderTabs();
  }catch(err){
    console.error(err);
    alert("DOCX 분석 중 오류가 발생했습니다.\n" + err.message);
  }finally{
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "문서 분석";
  }
}

analyzeBtn.addEventListener("click", analyze);

function renderTabs(){
  tabs.innerHTML = "";
  const available = SUPPORTED.filter(x => parsed[x.source]);

  if(!available.length){
    detail.className = "detail";
    detail.innerHTML = "<p>언어 구간을 찾지 못했습니다. DOCX 안에 KR / JP / EN / TW / CN / TH 구분자가 있는지 확인해주세요.</p>";
    return;
  }

  available.forEach((x, idx) => {
    const b = document.createElement("button");
    b.className = "tab" + (idx===0 ? " active" : "");
    b.textContent = `${x.steam} (${x.code})`;
    b.addEventListener("click", () => {
      [...tabs.children].forEach(c => c.classList.remove("active"));
      b.classList.add("active");
      showDetail(x);
    });
    tabs.appendChild(b);
  });
  showDetail(available[0]);
}

function showDetail(mapping){
  const data = parsed[mapping.source];
  detail.className = "detail";
  detail.innerHTML = `
    <div class="meta">
      <div class="label">Steam 언어</div><div class="value">${mapping.steam} (${mapping.code})</div>
      <div class="label">DOCX 소스</div><div class="value">${mapping.source}${mapping.code==="RU" ? " (러시아어는 영어 안내)" : ""}</div>
      <div class="label">공지 제목</div><div class="value">${escapeHtml(data.title || "(제목을 찾지 못함)")}</div>
    </div>
    <h3>공지 본문 미리보기</h3>
    <div class="preview">${data.bodyHtml || "<p>(본문 없음)</p>"}</div>
  `;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));
}

renderLangStatus();
