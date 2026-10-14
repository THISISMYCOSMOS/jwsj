// 성균관대 icampus '강의콘텐츠' 탭(LearningX 모듈 빌더 iframe, canvas.skku.edu/learningx/lti/modulebuilder)에 클라스노트 컨트롤을 붙인다.
// 강의 정보는 같은 출처의 LearningX·Canvas API에서 읽기만 한다(GET). 재생·진도·출석 요청은 보내지 않는다.
// 각 행은 제목 링크(/courses/<과목>/modules/items/<모듈 항목>)의 번호로 API의 module_item_id와 짝짓는다(실측 2026-10-09).
// 버튼 모양과 동작은 KLAS용 content/klas-list.js와 같다.
(() => {
  const valid=/^[0-9a-f]{8,32}$/i,controls=new Map(),VIDEO_TYPES=new Set(['movie','everlec','mp4','screenlecture','audio']);
  let byItem=new Map(),current={statuses:{},opened:{}},courseId=null,loading=null,failedAt=0;
  const send=async(type,data={})=>{let r;try{r=await chrome.runtime.sendMessage({target:'bg',type,...data});}catch(e){throw new Error(/context invalidated/i.test(String(e?.message))?'확장이 새로 설치되거나 새로고침되었어요. 이 페이지를 새로고침(F5)한 뒤 다시 눌러 주세요.':String(e?.message||e));}if(!r?.ok)throw new Error(r?.error||'확장 연결 오류');return r;};
  async function refresh(){try{current=await send('getState');render();}catch{}}
  // LearningX API는 xn_api_token 쿠키를 Bearer로 받는다(icampus 화면 자신도 같은 방식). Canvas API는 세션 쿠키만 쓴다.
  async function api(path,learningx){
    const token=learningx?document.cookie.split('; ').find(s=>s.startsWith('xn_api_token='))?.slice('xn_api_token='.length):null;
    const r=await fetch(path,{credentials:'same-origin',headers:{Accept:'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}});
    if(!r.ok)throw new Error(`강의 목록을 읽지 못했어요 (HTTP ${r.status}). 페이지를 새로고침해 주세요.`);
    return JSON.parse((await r.text()).replace(/^while\(1\);/,''));
  }
  // "조선한문학사_KLC2018_01(김영죽)" → 과목 "조선한문학사", 교수 "김영죽"
  function splitCourse(name){
    const professor=name.match(/\(([^()]+)\)\s*$/)?.[1]??'';
    const course=name.replace(/\([^()]*\)\s*$/,'').replace(/_[A-Za-z]{2,6}\d{3,4}_[0-9A-Za-z]+$/,'').trim();
    return {course:course||name,professor};
  }
  async function load(id){
    const [mods,info]=await Promise.all([api(`/learningx/api/v1/courses/${id}/modules?include_detail=true`,true),api(`/api/v1/courses/${id}`,false).catch(()=>null)]);
    const {course,professor}=splitCourse(String(info?.name??''));
    const items=[],map=new Map();
    for(const m of Array.isArray(mods)?mods:[]){
      const week=Number(String(m?.title??'').match(/(\d{1,2})\s*주차/)?.[1])||null;
      for(const it of Array.isArray(m?.module_items)?m.module_items:[]){
        const cd=it?.content_data??{},c=cd.item_content_data??{};
        // 녹화 강의(LCMS 동영상)만. Zoom 실시간 강의·파일·음성은 받아쓸 mp4가 없다.
        // 형식: movie(video1 ssmovie.mp4), everlec·mp4(upf screen.mp4), screenlecture(video2 sub.mp4 / video1 main.mp4),
        // audio(ssaudio.m4a, 슬라이드 없이 받아쓰기). 실측 2026-10-14, 수강 강의 224개 모두 주소 확인.
        if(cd.item_content_type!=='commons'||!VIDEO_TYPES.has(c.content_type))continue;
        const contentId=String(c.content_id??'').toLowerCase();if(!valid.test(contentId))continue;
        // 진도 값이 API에 없어 '학습 완료'만 열어 본 강의로 인정한다. 그 밖의 강의는 한 번 재생하면(플레이어 열림 신호) 열린다.
        const item={contentId,title:String(cd.title??it.title??'').slice(0,200),course:course.slice(0,100),professor:professor.slice(0,50),week,
          prog:it.completed===true?100:0,module:String(m.title??'').slice(0,200),period:[cd.unlock_at,cd.due_at].filter(Boolean).map(s=>String(s).slice(0,10)).join(' ~ ').slice(0,60)};
        items.push(item);if(it.module_item_id!=null)map.set(String(it.module_item_id),item);
      }
    }
    byItem=map;
    await send('registerLectures',{items:items.slice(0,1000)});
  }
  function render(){
    for(const [id,view] of controls){
      const status=current.statuses?.[id]??{},opened=!!current.opened?.[id];
      view.toggle.checked=!!status.auto;view.toggle.setAttribute('aria-label',`${view.title} 자동 처리`);
      const ready=['done','awaiting_confirmation'].includes(status.state);const saved=ready&&status.rawSaved===true;
      view.button.textContent=ready?'확인하고 저장':'지금 요약';
      view.button.disabled=!opened;view.button.title=!opened?'강의를 한 번 열어 본 뒤 요약할 수 있습니다.':ready?'처리가 끝났어요. 확인 화면에서 저장합니다.':'로컬 처리 후 확장 화면에서 전송량을 확인합니다.';
      view.download.hidden=!(['done','awaiting_confirmation','complete'].includes(status.state)||status.transcribed===true);
      view.download.title=status.state==='complete'?'저장된 결과로 HTML을 다시 받습니다 (AI 재호출 없음).':'AI 요약 없이 받아쓰기 원문으로 HTML을 받습니다.';
      const step=status.error||status.step||(opened?'개인 복습용':'한 번 열어야 요약 가능');
      if(view.status.textContent!==String(step).slice(0,200))view.status.textContent=String(step).slice(0,200);
      const pct=Math.round((Number(status.progress)||0)*100);
      const BADGE={complete:['✓ 처리 완료','ok'],saved:['✓ HTML 저장됨','ok'],done:['확인 필요','warn'],awaiting_confirmation:['확인 필요','warn'],running:[`처리 중 ${pct}%`,'busy'],queued:['대기 중','busy'],summarizing:['AI 요약 중','busy'],paused:['일시정지','idle'],error:['오류','err']}[saved?'saved':status.state];
      view.badge.hidden=!BADGE;if(BADGE){view.badge.textContent=BADGE[0];view.badge.dataset.kind=BADGE[1];}
      view.progress.hidden=!['queued','running','summarizing'].includes(status.state);
      view.progress.value=Number(status.progress)||0;
    }
  }
  function decorate(){
    for(const [id,view] of controls)if(!view.status.isConnected)controls.delete(id);
    // 주차를 펼칠 때마다 React가 행을 새로 그린다. 보이는 행마다 다시 붙인다.
    for(const row of document.querySelectorAll('.xnmb-module_item-outer-wrapper')){
      const itemId=row.querySelector('a.xnmb-module_item-left-title')?.getAttribute('href')?.match(/\/modules\/items\/(\d+)/)?.[1];
      const match=itemId&&byItem.get(itemId);if(!match)continue;
      const old=row.querySelector('[data-klas-summarizer-control]');
      if(old?.dataset.contentId===match.contentId)continue;
      if(old){controls.delete(old.dataset.contentId);old.remove();}
      const cell=document.createElement('div');cell.dataset.klasSummarizerControl='';cell.dataset.contentId=match.contentId;
      // 행 전체가 강의로 이동하는 링크처럼 동작하지 않도록 컨트롤 안의 클릭은 행으로 올려 보내지 않는다.
      for(const type of ['click','mousedown','pointerdown','keydown'])cell.addEventListener(type,e=>e.stopPropagation());
      const root=cell.attachShadow({mode:'closed'});
      const style=document.createElement('style');style.textContent=':host{display:block;margin-top:6px;font:12px system-ui;color:#333}*{box-sizing:border-box}.ks-summary-tools{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}.ks-summary-switch{display:flex;align-items:center;gap:4px;white-space:nowrap}.ks-summary-button{font:inherit;white-space:nowrap;word-break:keep-all;padding:3px 10px;border:1px solid #c93d6f;border-radius:999px;background:#fffaf3;color:#a8325d;cursor:pointer}.ks-summary-button:disabled{opacity:.5;cursor:default}.ks-summary-button[hidden]{display:none}.ks-badge{display:inline-block;margin:0 0 4px;padding:1px 8px;border-radius:999px;font-weight:600;white-space:nowrap;border:1px solid transparent}.ks-badge[hidden]{display:none}.ks-badge[data-kind=ok]{background:#e6f4ea;color:#1e6b34;border-color:#a8d5b5}.ks-badge[data-kind=warn]{background:#fff4d6;color:#7a5200;border-color:#f0d58a}.ks-badge[data-kind=busy]{background:#e8f0fe;color:#1a4fa0;border-color:#b6ccf5}.ks-badge[data-kind=idle]{background:#f1f1f1;color:#555;border-color:#ddd}.ks-badge[data-kind=err]{background:#fdecea;color:#a12622;border-color:#f3b8b4}.ks-summary-download{background:#a8325d;color:#fff;border-color:#a8325d}.ks-summary-status{display:block;margin-top:3px;max-width:320px;word-break:keep-all;overflow-wrap:break-word}progress{display:block;width:100%;max-width:320px;height:5px;accent-color:#c93d6f}progress[hidden]{display:none}';root.append(style);
      const group=document.createElement('div');group.className='ks-summary-tools';
      const label=document.createElement('label');label.className='ks-summary-switch';
      const toggle=document.createElement('input');toggle.type='checkbox';const text=document.createElement('span');text.textContent='자동 처리';label.append(toggle,text);
      const button=document.createElement('button');button.type='button';button.className='ks-summary-button';button.textContent='지금 요약';
      const download=document.createElement('button');download.type='button';download.className='ks-summary-button ks-summary-download';download.textContent='HTML 받기';download.hidden=true;
      const status=document.createElement('span');status.className='ks-summary-status';status.setAttribute('role','status');
      const progress=document.createElement('progress');progress.max=1;progress.value=0;progress.setAttribute('aria-label','받아쓰기 진행률');
      const badge=document.createElement('span');badge.className='ks-badge';badge.hidden=true;badge.setAttribute('role','status');
      group.append(label,button,download);root.append(badge,group,status,progress);
      (row.querySelector('.xnmb-module_item-left-wrapper')??row).append(cell);
      controls.set(match.contentId,{toggle,button,download,status,progress,badge,title:match.title});
      download.addEventListener('click',async event=>{if(!event.isTrusted)return;download.disabled=true;try{await send('download',{contentId:match.contentId});status.textContent='다운로드 폴더의 icampus요약에 저장했어요.';}catch(e){status.textContent=e.message;}finally{download.disabled=false;}});
      toggle.addEventListener('change',async event=>{if(!event.isTrusted){toggle.checked=!!current.statuses?.[match.contentId]?.auto;return;}toggle.disabled=true;try{await send('setAuto',{contentId:match.contentId,enabled:toggle.checked});await refresh();}catch(e){toggle.checked=!toggle.checked;status.textContent=e.message;}finally{toggle.disabled=false;}});
      button.addEventListener('click',async event=>{if(!event.isTrusted)return;button.disabled=true;try{const st=current.statuses?.[match.contentId]?.state;const ready=['done','awaiting_confirmation','complete'].includes(st);await send(ready?'manualSummary':'startProcessing',{contentId:match.contentId});if(!ready)status.textContent='처리를 시작했어요. 끝나면 "확인하고 저장"이 떠요.';}catch(e){status.textContent=e.message;}finally{button.disabled=!current.opened?.[match.contentId];}});
    }
    render();
  }
  // 과목은 행 링크에서 읽는다. 과목이 바뀌었거나 아직 못 읽었을 때만 API를 다시 부른다.
  async function sync(){
    const id=document.querySelector('a.xnmb-module_item-left-title[href*="/courses/"]')?.getAttribute('href')?.match(/^\/courses\/(\d+)\//)?.[1];
    // 실패하면 30초 동안은 다시 부르지 않는다(화면이 바뀔 때마다 요청이 반복되지 않게).
    if(id&&id!==courseId&&!loading&&Date.now()-failedAt>30000){
      courseId=id;
      loading=load(id).then(refresh).catch(()=>{courseId=null;failedAt=Date.now();}).finally(()=>{loading=null;});
      await loading;
    }
    decorate();
  }
  let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;sync();},300);}).observe(document.documentElement,{childList:true,subtree:true});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes.statuses||changes.opened||changes.settings)&&!document.hidden)refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&chrome.runtime?.id){refresh();sync();}});
  refresh();sync();
})();
