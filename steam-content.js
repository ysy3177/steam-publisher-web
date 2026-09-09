
(() => {
  function visible(el) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
  }
  function clean(s, n = 180) {
    return String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
  }
  function attrs(el) {
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

  function safeScan() {
    const editables = [...document.querySelectorAll('[contenteditable="true"], textarea')]
      .filter(visible).slice(0, 40).map((el, i) => ({
        index: i, ...attrs(el),
        textPreview: clean(el.innerText || el.value || "", 220),
        childCount: el.children?.length || 0
      }));

    const inputs = [...document.querySelectorAll('input[type="text"], input:not([type])')]
      .filter(visible).slice(0, 50).map((el, i) => ({
        index: i, ...attrs(el),
        valuePreview: clean(el.value || "", 120)
      }));

    const selects = [...document.querySelectorAll("select")]
      .filter(visible).slice(0, 30).map((el, i) => ({
        index: i, ...attrs(el),
        value: el.value,
        options: [...el.options].slice(0, 40).map(o => clean(o.textContent, 80))
      }));

    const controls = [...document.querySelectorAll("button, [role='button'], a")]
      .filter(visible).map(el => ({ ...attrs(el), text: clean(el.innerText || el.textContent, 100) }))
      .filter(x => x.text).slice(0, 160);

    const images = [...document.querySelectorAll("img")]
      .filter(visible).slice(0, 70).map((el, i) => {
        const r = el.getBoundingClientRect();
        return {
          index: i, ...attrs(el),
          alt: clean(el.alt, 100),
          width: Math.round(r.width),
          height: Math.round(r.height)
        };
      });

    const langWords = ["Russian","English","Japanese","Chinese","Thai","Korean","러시아","영어","일본어","중국어","태국어","한국어"];
    const saveWords = ["save","저장","保存","儲存","บันทึก"];
    const cloneWords = ["clone","복제","複製","复制","คัดลอก"];

    return {
      mode: "SAFE_READ_ONLY",
      page: {
        title: document.title,
        url: location.href,
        hostname: location.hostname
      },
      counts: {
        editables: editables.length,
        textInputs: inputs.length,
        selects: selects.length,
        controls: controls.length,
        images: images.length
      },
      editorCandidates: editables,
      titleInputCandidates: inputs,
      selectCandidates: selects,
      languageCandidates: controls.filter(x => langWords.some(w => x.text.toLowerCase().includes(w.toLowerCase()))),
      saveCandidates: controls.filter(x => saveWords.some(w => x.text.toLowerCase().includes(w.toLowerCase()))),
      cloneCandidates: controls.filter(x => cloneWords.some(w => x.text.toLowerCase().includes(w.toLowerCase()))),
      images
    };
  }


  function rectInfo(el){
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x), y: Math.round(r.y),
      width: Math.round(r.width), height: Math.round(r.height)
    };
  }

  function clearBoundaryMarks(){
    document.querySelectorAll("[data-spw-mark]").forEach(el=>{
      el.style.removeProperty("outline");
      el.style.removeProperty("outline-offset");
      el.removeAttribute("data-spw-mark");
    });
    document.querySelectorAll(".spw-boundary-label").forEach(el=>el.remove());
  }

  function mark(el, label){
    if(!el) return;
    el.setAttribute("data-spw-mark", label);
    el.style.setProperty("outline", "3px solid #00d26a", "important");
    el.style.setProperty("outline-offset", "2px", "important");

    const r = el.getBoundingClientRect();
    const badge = document.createElement("div");
    badge.className = "spw-boundary-label";
    badge.textContent = label;
    badge.style.cssText = [
      "position:fixed","z-index:2147483647","pointer-events:none",
      "background:#0b1118","color:#fff","border:1px solid #00d26a",
      "padding:3px 7px","border-radius:4px","font:12px/1.2 sans-serif",
      `left:${Math.max(4, Math.min(window.innerWidth-180, r.left))}px`,
      `top:${Math.max(4, Math.min(window.innerHeight-28, r.top-24))}px`
    ].join(";");
    document.documentElement.appendChild(badge);
  }

  function boundaryCheck(){
    clearBoundaryMarks();

    const title = [...document.querySelectorAll('input[type="text"], input:not([type])')]
      .find(el => visible(el) && /이벤트 제목|event title/i.test(el.getAttribute("placeholder") || ""));

    const editor = [...document.querySelectorAll('[contenteditable="true"]')]
      .find(el => visible(el) && el.classList.contains("ProseMirror"))
      || [...document.querySelectorAll('[contenteditable="true"]')].find(visible);

    const save = [...document.querySelectorAll("button,[role='button']")]
      .find(el => visible(el) && /^(저장|save|保存|儲存|บันทึก)$/i.test(clean(el.innerText || el.textContent, 50)));

    const selects = [...document.querySelectorAll("select")].filter(visible);
    const langSelect = selects.find(sel => [...sel.options].some(o => /한국어|Korean/i.test(o.textContent || "")));

    let editorImages = [];
    if(editor){
      editorImages = [...editor.querySelectorAll("img")].filter(visible);
    }

    // Banner heuristic is intentionally conservative:
    // large images inside the editor, first = top banner, last = bottom banner.
    const largeEditorImages = editorImages.filter(img => {
      const r = img.getBoundingClientRect();
      return r.width >= 400 && r.height >= 60;
    });

    const topBanner = largeEditorImages[0] || null;
    const bottomBanner = largeEditorImages.length > 1 ? largeEditorImages[largeEditorImages.length - 1] : null;

    mark(title, "제목");
    mark(langSelect, "언어 선택");
    mark(editor, "본문 편집기");
    mark(topBanner, "상단 배너");
    mark(bottomBanner, "하단 배너");
    mark(save, "저장 버튼 (누르지 않음)");

    // Auto-remove visual marks after 30 seconds.
    setTimeout(clearBoundaryMarks, 30000);

    return {
      mode: "VISUAL_ONLY_NO_SAVE",
      title: title ? {placeholder:title.getAttribute("placeholder")||"", valuePreview:clean(title.value,120), rect:rectInfo(title)} : null,
      languageSelect: langSelect ? {value:langSelect.value, options:[...langSelect.options].slice(0,12).map(o=>clean(o.textContent,60)), rect:rectInfo(langSelect)} : null,
      editor: editor ? {class:typeof editor.className==="string"?editor.className:"", childCount:editor.children.length, rect:rectInfo(editor)} : null,
      editorImageCount: editorImages.length,
      largeEditorImages: largeEditorImages.map((img,i)=>({index:i, rect:rectInfo(img), alt:clean(img.alt,80)})),
      topBanner: topBanner ? {rect:rectInfo(topBanner)} : null,
      bottomBanner: bottomBanner ? {rect:rectInfo(bottomBanner)} : null,
      saveButton: save ? {text:clean(save.innerText||save.textContent,40), rect:rectInfo(save)} : null,
      note: "내용 변경/저장 없음. 표시된 테두리와 라벨은 30초 후 자동 제거됩니다."
    };
  }


  function dispatchInput(el){
    el.dispatchEvent(new InputEvent("input", {bubbles:true, inputType:"insertText", data:null}));
    el.dispatchEvent(new Event("change", {bubbles:true}));
  }

  function findTitleInput(){
    return [...document.querySelectorAll('input[type="text"], input:not([type])')]
      .find(el => visible(el) && /이벤트 제목|event title/i.test(el.getAttribute("placeholder") || ""));
  }

  function findEditor(){
    return [...document.querySelectorAll('[contenteditable="true"]')]
      .find(el => visible(el) && el.classList.contains("ProseMirror"))
      || [...document.querySelectorAll('[contenteditable="true"]')].find(visible);
  }

  function findLanguageSelect(){
    return [...document.querySelectorAll("select")].filter(visible)
      .find(sel => [...sel.options].some(o => /한국어|Korean/i.test(o.textContent || "")));
  }


  const SPW_LANGS = {
    KR:/한국어|Korean/i,
    EN:/^영어$|^English$/i,
    JP:/일본어|Japanese/i,
    CN:/중국어\s*-\s*간체|Simplified Chinese/i,
    TW:/중국어\s*-\s*번체|Traditional Chinese/i,
    TH:/태국어|Thai/i,
    RU:/러시아어|Russian/i
  };

  function sleep(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }

  function normalizeIncomingBody(bodyHtml){
    const tpl=document.createElement("template");
    tpl.innerHTML=String(bodyHtml||"");
    tpl.content.querySelectorAll("script,iframe,object,embed,form").forEach(n=>n.remove());

    // Safety guard: source DOCX banners must never be inserted into Steam.
    // Keep article/content images, but strip an image-only block before the first
    // real text/table and an image-only block after the last real text/table.
    const root=tpl.content;
    const imageOnly=el =>
      el?.nodeType===1 &&
      el.tagName==="P" &&
      !!el.querySelector("img") &&
      !(el.textContent||"").trim();
    const realContent=el => {
      if(!el || el.nodeType!==1) return false;
      if(el.tagName==="TABLE") return true;
      if(imageOnly(el)) return false;
      return !!(el.textContent||"").replace(/\u00a0/g," ").trim();
    };

    let leadingBanner=null;
    for(const el of [...root.children]){
      if(realContent(el)) break;
      if(imageOnly(el)){ leadingBanner=el; break; }
    }
    if(leadingBanner){
      let n=root.firstElementChild;
      while(n){
        const next=n.nextElementSibling;
        n.remove();
        if(n===leadingBanner) break;
        n=next;
      }
    }

    const current=[...root.children];
    let lastReal=-1;
    current.forEach((el,i)=>{ if(realContent(el)) lastReal=i; });
    if(lastReal>=0){
      const trailing=current.slice(lastReal+1);
      const trailingBanner=[...trailing].reverse().find(imageOnly);
      if(trailingBanner){
        let n=trailingBanner;
        while(n){
          const next=n.nextElementSibling;
          n.remove();
          n=next;
        }
      }
    }

    [...tpl.content.querySelectorAll(".docx-real-gap, p.docx-empty-line, p.docx-separator-gap")].forEach(gap=>{
      const p=document.createElement("p"); p.appendChild(document.createElement("br")); gap.replaceWith(p);
    });
    [...tpl.content.querySelectorAll("p")].forEach(p=>{
      const hasVisual=p.querySelector("img,table,hr,video,iframe");
      const text=(p.textContent||"").replace(/\u00a0/g,"").trim();
      if(!hasVisual && !text && !p.querySelector("br")) p.appendChild(document.createElement("br"));
    });

    // Keep DOCX separator spacing as parsed; only normalize the line itself.
    [...tpl.content.querySelectorAll("hr")].forEach(hr=>{
      hr.style.cssText="border:0;border-top:1px solid rgba(180,190,200,.65);margin:14px 0 18px;";
    });

    // Clean Steam-friendly table formatting.
    [...tpl.content.querySelectorAll("table")].forEach(table=>{
      table.style.cssText="width:100%;border-collapse:collapse;margin:12px 0 16px;color:#f3f5f7;background:#343941;";
      const first=table.querySelector("tr");
      if(first){
        [...first.children].forEach(cell=>{
          if(cell.tagName==="TD"){
            const th=document.createElement("th");
            while(cell.firstChild) th.appendChild(cell.firstChild);
            cell.replaceWith(th);
          }
        });
      }
      [...table.querySelectorAll("th,td")].forEach(cell=>{
        const head=cell.tagName==="TH";
        cell.style.cssText=
          "border:1px solid #69717b;padding:6px 8px;text-align:left;vertical-align:middle;color:#f3f5f7;" +
          (head?"background:#59606a;font-weight:700;":"background:#343941;");
        [...cell.querySelectorAll(":scope > p")].forEach(p=>{
          while(p.firstChild) cell.insertBefore(p.firstChild,p);
          p.remove();
        });
      });
    });

    // Steam collapses normal repeated spaces. Preserve tabs, 2+ spaces and
    // leading/trailing spaces with NBSP so source alignment survives.
    const tw=document.createTreeWalker(tpl.content,NodeFilter.SHOW_TEXT,null);
    let tn;
    while((tn=tw.nextNode())){
      let t=tn.nodeValue||"";
      t=t.replace(/\t/g,"\u00a0\u00a0\u00a0\u00a0");
      t=t.replace(/^ +/,m=>"\u00a0".repeat(m.length));
      t=t.replace(/ +$/,m=>"\u00a0".repeat(m.length));
      t=t.replace(/ {2,}/g,m=>"\u00a0".repeat(m.length-1)+" ");
      tn.nodeValue=t;
    }
    return tpl;
  }

  function findBannerBlocks(editor){
    const imgs=[...editor.querySelectorAll("img")];

    // Prefer rendered size, but fall back to natural size / width-height attrs.
    // During Steam language re-render an image can briefly report 0x0 even
    // though it is already present in the editor DOM.
    const large=imgs.filter(img=>{
      const r=img.getBoundingClientRect();
      const w=Math.max(
        Number(r.width||0),
        Number(img.naturalWidth||0),
        Number(img.getAttribute("width")||0)
      );
      const h=Math.max(
        Number(r.height||0),
        Number(img.naturalHeight||0),
        Number(img.getAttribute("height")||0)
      );
      return w>=400 && h>=60;
    });
    if(large.length!==2) return {
      error:`큰 배너 이미지 2개를 예상했지만 ${large.length}개를 찾았습니다.`,
      debug:{
        totalImages:imgs.length,
        sizes:imgs.map(img=>{
          const r=img.getBoundingClientRect();
          return {
            rect:[Math.round(r.width),Math.round(r.height)],
            natural:[img.naturalWidth||0,img.naturalHeight||0],
            attr:[img.getAttribute("width")||"",img.getAttribute("height")||""]
          };
        })
      }
    };

    const topImg=large[0], bottomImg=large[1];
    const children=[...editor.children];
    const topBlock=children.find(ch=>ch===topImg || ch.contains(topImg));
    const bottomBlock=children.find(ch=>ch===bottomImg || ch.contains(bottomImg));
    if(!topBlock || !bottomBlock) return {error:"상단/하단 배너 블록을 찾지 못했습니다."};

    const ti=children.indexOf(topBlock), bi=children.indexOf(bottomBlock);
    if(ti<0 || bi<0 || ti>=bi) return {error:"배너 순서가 예상과 다릅니다."};
    return {topBlock,bottomBlock,children,ti,bi};
  }

  async function waitForReadyEditorAndBanners(timeoutMs=10000){
    const start=Date.now();
    let last=null;
    while(Date.now()-start<timeoutMs){
      const editor=findEditor();
      const title=findTitleInput();
      if(editor && title){
        const bounds=findBannerBlocks(editor);
        if(!bounds.error) return {editor,title,bounds};
        last=bounds;
      }
      await sleep(250);
    }
    return {error:last?.error || "편집기/배너 로딩 대기 시간 초과", debug:last?.debug || null};
  }

  function applyPayloadToCurrentLanguage(payload){
    const title=findTitleInput();
    const editor=findEditor();
    if(!title) return {error:"제목 입력칸을 찾지 못했습니다."};
    if(!editor) return {error:"ProseMirror 본문 편집기를 찾지 못했습니다."};

    const newTitle=String(payload?.title||"").trim();
    const bodyHtml=String(payload?.bodyHtml||"").trim();
    if(!newTitle) return {error:"제목이 비어 있습니다."};
    if(!bodyHtml) return {error:"본문이 비어 있습니다."};

    const bounds=findBannerBlocks(editor);
    if(bounds.error) return bounds;

    const tpl=normalizeIncomingBody(bodyHtml);
    const incomingBlankParagraphs=[...tpl.content.querySelectorAll("p")].filter(p=>{
      const text=(p.textContent||"").replace(/\u00a0/g,"").trim();
      return !text && !!p.querySelector("br");
    }).length;

    for(let i=bounds.bi-1;i>bounds.ti;i--) bounds.children[i].remove();

    const frag=document.createDocumentFragment();
    while(tpl.content.firstChild) frag.appendChild(tpl.content.firstChild);
    bounds.bottomBlock.before(frag);

    let insertedFinalGap=false;
    const prev=bounds.bottomBlock.previousElementSibling;
    const isBlank=prev && prev.tagName==="P" &&
      !(prev.textContent||"").replace(/\u00a0/g,"").trim() && !!prev.querySelector("br");
    if(!isBlank){
      const p=document.createElement("p");
      p.appendChild(document.createElement("br"));
      bounds.bottomBlock.before(p);
      insertedFinalGap=true;
    }

    const nativeSetter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    if(nativeSetter) nativeSetter.call(title,newTitle); else title.value=newTitle;
    dispatchInput(title);
    dispatchInput(editor);

    return {
      titleApplied:newTitle,
      preservedTopBanner:true,
      preservedBottomBanner:true,
      insertedBlankParagraphs:incomingBlankParagraphs,
      insertedFinalGapBeforeBottomBanner:insertedFinalGap
    };
  }

  async function switchSteamLanguage(code){
    const re=SPW_LANGS[code];
    if(!re) return {error:`지원하지 않는 언어 코드: ${code}`};

    const selects=[...document.querySelectorAll("select")].filter(visible)
      .filter(sel=>[...sel.options].some(o=>/한국어|Korean/i.test(o.textContent||"")));
    if(!selects.length) return {error:"언어 선택 메뉴를 찾지 못했습니다."};

    const option=[...selects[0].options].find(o=>re.test((o.textContent||"").trim()));
    if(!option) return {error:`Steam 언어 옵션을 찾지 못했습니다: ${code}`};

    const targetValue=String(option.value);

    // If the requested language is already selected, do not fire a redundant
    // change event. Steam can briefly tear down/rebuild the editor on change.
    const alreadySelected=selects.some(sel=>String(sel.value)===targetValue);
    if(!alreadySelected){
      for(const sel of selects){
        const own=[...sel.options].find(o=>re.test((o.textContent||"").trim()));
        if(!own) continue;
        const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value")?.set;
        if(setter) setter.call(sel, own.value); else sel.value=own.value;
        sel.dispatchEvent(new Event("input",{bubbles:true}));
        sel.dispatchEvent(new Event("change",{bubbles:true}));
      }
    }

    // Wait for React/Steam to load the selected localization.
    const start=Date.now();
    while(Date.now()-start<8000){
      await sleep(200);
      const current=[...document.querySelectorAll("select")].filter(visible)
        .find(sel=>[...sel.options].some(o=>/한국어|Korean/i.test(o.textContent||"")));
      const editor=findEditor();
      const title=findTitleInput();
      if(current && String(current.value)===targetValue && editor && title){
        await sleep(450);
        return {ok:true, value:targetValue, label:(option.textContent||"").trim()};
      }
    }
    return {error:`언어 전환 대기 시간 초과: ${code}`};
  }

  async function runMultiUnsavedTest(payload){
    const langs=payload?.languages||{};
    const order=["KR","EN","JP","CN","TW","TH","RU"];
    const results=[];

    for(const code of order){
      const data=langs[code];
      if(!data) return {error:`${code} 데이터가 없습니다.`, completed:results};
      // Web UI에서 체크 해제한 언어는 Steam 언어 선택 자체를 하지 않고 건너뛴다.
      if(data.skip === true) continue;

      const switched=await switchSteamLanguage(code);
      if(switched.error) return {error:switched.error, completed:results};

      const ready=await waitForReadyEditorAndBanners(10000);
      if(ready.error){
        return {
          error:`${code}: ${ready.error}`,
          completed:results,
          debug:ready.debug || null
        };
      }

      let applied=applyPayloadToCurrentLanguage(data);
      if(applied.error) return {error:`${code}: ${applied.error}`, completed:results, debug:applied.debug || null};

      await sleep(550);
      let verifyTitle=findTitleInput();
      if(!verifyTitle || String(verifyTitle.value)!==String(data.title)){
        applied=applyPayloadToCurrentLanguage(data);
        if(applied.error) return {error:`${code}: 재적용 실패 - ${applied.error}`, completed:results};
        await sleep(250);
        verifyTitle=findTitleInput();
      }
      if(!verifyTitle || String(verifyTitle.value)!==String(data.title)){
        return {error:`${code}: 제목 검증 실패. 본문이 제목에 섞이는 것을 방지하기 위해 중단했습니다.`, completed:results};
      }

      results.push({
        code,
        steamLanguage:switched.label,
        source:data.source||code,
        ...applied
      });
      await sleep(350);
    }

    // Return to Korean for easy visual inspection. No content change here.
    const back=await switchSteamLanguage("KR");

    return {
      mode:"MULTI_UNSAVED_MUTATION",
      saved:false,
      published:false,
      order,
      results,
      returnedToKorean:!back.error,
      note:"선택한 언어에만 화면상 임시 적용했습니다. 저장/게시 버튼은 누르지 않았습니다."
    };
  }

  function runKrUnsavedTest(payload){
    const title = findTitleInput();
    const editor = findEditor();
    const langSelect = findLanguageSelect();
    if(!title) return {error:"제목 입력칸을 찾지 못했습니다."};
    if(!editor) return {error:"ProseMirror 본문 편집기를 찾지 못했습니다."};
    if(!langSelect) return {error:"언어 선택 메뉴를 찾지 못했습니다."};

    const koreanOption = [...langSelect.options].find(o => /한국어|Korean/i.test(o.textContent || ""));
    if(!koreanOption) return {error:"한국어 옵션을 찾지 못했습니다."};

    // Safety: only proceed when the currently selected language is already Korean.
    // We do not switch languages in this first mutation test.
    if(String(langSelect.value) !== String(koreanOption.value)){
      return {error:"현재 Steam 편집 언어가 한국어가 아닙니다. Steam에서 한국어를 선택한 뒤 다시 실행해주세요."};
    }

    const imgs = [...editor.querySelectorAll("img")].filter(visible);
    const large = imgs.filter(img=>{
      const r=img.getBoundingClientRect();
      return r.width>=400 && r.height>=60;
    });
    if(large.length !== 2){
      return {error:`안전을 위해 중단했습니다. 본문에서 큰 배너 이미지 2개를 예상했지만 ${large.length}개를 찾았습니다.`};
    }
    const topImg = large[0], bottomImg = large[1];

    // Work with top-level editor children containing each banner.
    const topBlock = [...editor.children].find(ch => ch===topImg || ch.contains(topImg));
    const bottomBlock = [...editor.children].find(ch => ch===bottomImg || ch.contains(bottomImg));
    if(!topBlock || !bottomBlock){
      return {error:"상단/하단 배너의 편집기 블록을 찾지 못했습니다."};
    }

    const children=[...editor.children];
    const ti=children.indexOf(topBlock), bi=children.indexOf(bottomBlock);
    if(ti<0 || bi<0 || ti>=bi){
      return {error:"배너 순서가 예상과 달라 안전하게 중단했습니다."};
    }

    const bodyHtml = String(payload?.bodyHtml || "").trim();
    const newTitle = String(payload?.title || "").trim();
    if(!newTitle) return {error:"DOCX KR 제목이 비어 있습니다."};
    if(!bodyHtml) return {
      error:"DOCX KR 본문이 비어 있습니다.",
      received:{
        titleLength:newTitle.length,
        bodyHtmlLength:bodyHtml.length,
        debug:payload?.debug || {}
      }
    };

    // Parse incoming body in an inert template. Remove scripts/forms and any
    // banner-like leading/trailing images defensively; the web parser should
    // already have removed them.
    const tpl=document.createElement("template");
    tpl.innerHTML=bodyHtml;
    tpl.content.querySelectorAll("script,iframe,object,embed,form").forEach(n=>n.remove());

    // The web preview uses empty DIV/P nodes plus CSS to visualize Word blank
    // paragraphs. Steam's ProseMirror does not have that CSS, so those nodes
    // collapse to zero height. Convert them into native editable blank
    // paragraphs (<p><br></p>) before insertion.
    [...tpl.content.querySelectorAll(".docx-real-gap, p.docx-empty-line")].forEach(gap=>{
      const p=document.createElement("p");
      p.appendChild(document.createElement("br"));
      gap.replaceWith(p);
    });

    // Also normalize genuinely empty block paragraphs that may come from DOCX.
    [...tpl.content.querySelectorAll("p")].forEach(p=>{
      const hasVisual = p.querySelector("img,table,hr,video,iframe");
      const text = (p.textContent || "").replace(/\u00a0/g, "").trim();
      if(!hasVisual && !text && !p.querySelector("br")){
        p.appendChild(document.createElement("br"));
      }
    });

    const incomingImgs=[...tpl.content.querySelectorAll("img")];
    incomingImgs.forEach(img=>{
      const w=Number(img.getAttribute("width")||0), h=Number(img.getAttribute("height")||0);
      if(w>=400 && h>=60) img.remove();
    });

    const incomingBlankParagraphs = [...tpl.content.querySelectorAll("p")].filter(p=>{
      const text=(p.textContent||"").replace(/\u00a0/g,"").trim();
      return !text && !!p.querySelector("br");
    }).length;

    // Replace ONLY nodes strictly between the existing banner blocks.
    for(let i=bi-1;i>ti;i--) children[i].remove();
    const frag=document.createDocumentFragment();
    while(tpl.content.firstChild) frag.appendChild(tpl.content.firstChild);
    bottomBlock.before(frag);

    // Ensure one visible blank line between the final body paragraph and the
    // preserved bottom banner. If DOCX already supplied a blank paragraph,
    // keep it; otherwise insert one Steam-native blank paragraph.
    let insertedFinalGap = false;
    const prev = bottomBlock.previousElementSibling;
    const isBlankParagraph = prev &&
      prev.tagName === "P" &&
      !(prev.textContent || "").replace(/\u00a0/g, "").trim() &&
      !!prev.querySelector("br");

    if(!isBlankParagraph){
      const finalGap = document.createElement("p");
      finalGap.appendChild(document.createElement("br"));
      bottomBlock.before(finalGap);
      insertedFinalGap = true;
    }

    // Update title without clicking save.
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if(nativeSetter) nativeSetter.call(title,newTitle); else title.value=newTitle;
    dispatchInput(title);
    dispatchInput(editor);

    // Visual confirmation.
    topBlock.style.setProperty("outline","3px solid #00d26a","important");
    bottomBlock.style.setProperty("outline","3px solid #00d26a","important");
    editor.style.setProperty("outline","2px dashed #44aaff","important");
    setTimeout(()=>{
      topBlock.style.removeProperty("outline");
      bottomBlock.style.removeProperty("outline");
      editor.style.removeProperty("outline");
    },30000);

    return {
      mode:"KR_UNSAVED_MUTATION",
      saved:false,
      published:false,
      language:"한국어",
      titleApplied:newTitle,
      preservedTopBanner:true,
      preservedBottomBanner:true,
      removedOldBetweenBlocks:Math.max(0,bi-ti-1),
      insertedBlankParagraphs:incomingBlankParagraphs,
      insertedFinalGapBeforeBottomBanner:insertedFinalGap,
      note:"저장 버튼을 누르지 않았습니다. 본문 마지막과 하단 배너 사이에 최소 1줄 공백을 보장합니다."
    };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "MULTI_UNSAVED_TEST") {
      (async()=>{
        try{
          const result=await runMultiUnsavedTest(msg.payload||{});
          sendResponse(result);
        }catch(err){
          sendResponse({error:err?.message||String(err)});
        }
      })();
      return true;
    }

    if (msg?.type === "KR_UNSAVED_TEST") {
      try { sendResponse(runKrUnsavedTest(msg.payload || {})); }
      catch(err){ sendResponse({error:err?.message || String(err)}); }
      return;
    }

    if (msg?.type === "PING_CONTENT") {
      sendResponse({ok:true});
      return;
    }
    if (msg?.type === "BOUNDARY_CHECK") {
      try {
        sendResponse(boundaryCheck());
      } catch (err) {
        sendResponse({ mode: "VISUAL_ONLY_NO_SAVE", error: err?.message || String(err) });
      }
      return;
    }

    if (msg?.type === "SAFE_SCAN") {
      try {
        sendResponse(safeScan());
      } catch (err) {
        sendResponse({ mode: "SAFE_READ_ONLY", error: err?.message || String(err) });
      }
    }
  });
})();
