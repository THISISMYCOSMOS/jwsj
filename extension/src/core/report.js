// 결과 HTML 한 파일을 만든다. 슬라이드 이미지는 파일 안에 넣어 혼자 열린다.
// 원문(교수님 발화)은 받아쓰기 그대로 두고, AI 교정 목록에 있는 말만 표시해 고친다.
import { mmss } from './pack.js';
import { suspectReasons } from './suspect.js';
import { KITTY, BUNNY, ORANG_CHEST, ORANG_UP, ORANG_FACE } from './mascots.js';
import { CHEER_BOY, ANGRY_GIRL } from './couple.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 교정은 AI가 지목한 발화(#번호, pack.js와 같은 순번) 안에서만 적용한다. 강의 전체 치환은 같은 말이
// 맞게 쓰인 다른 문장까지 바꿨다. 발화 안에서 원문 표현이 정확히 한 번 나올 때만 적용하고, 겹치거나
// 존재하지 않는 슬라이드를 근거로 든 교정은 버린다. 원문(이스케이프 전)에 적용한 뒤 조각마다 이스케이프한다
// (태그 속성 안 재치환에 의한 HTML 주입 방지, 레드팀 R2).
function correctionsBySegment(corrections, slideCount) {
  const map = new Map();
  for (const c of corrections) {
    if (!c || !Number.isInteger(c.id) || typeof c.from !== 'string' || typeof c.to !== 'string') continue;
    if (!c.from.trim() || c.from.length > 40 || !c.to.trim() || c.to.length > 80 || c.from === c.to) continue;
    if (c.s !== undefined && !(Number.isInteger(c.s) && c.s >= 1 && c.s <= slideCount)) continue;
    if (!map.has(c.id)) map.set(c.id, []);
    map.get(c.id).push(c);
  }
  return map;
}

// 정리 시각은 저장소에 밀리초 숫자로 들어 있다. 사람이 읽는 날짜(이 PC 시간대 기준 YYYY-MM-DD)로 바꿔 보여 준다.
function displayDate(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const suspectSpan = (html, reason) => reason ? `<span class="suspect" title="${esc(`확인 필요: ${reason}`)}">${html}</span>` : html;

function renderSegment(text, list = []) {
  const hits = [];
  for (const c of list) {
    const at = text.indexOf(c.from);
    if (at < 0 || text.indexOf(c.from, at + 1) >= 0) continue;
    const end = at + c.from.length;
    if (hits.some((h) => at < h.end && end > h.at)) continue;
    hits.push({ at, end, c });
  }
  hits.sort((a, b) => a.at - b.at);
  let out = '', last = 0;
  for (const { at, end, c } of hits) {
    const why = `받아쓰기 원래: ${c.from}${c.s ? ` · 근거 S${c.s}` : ''}`;
    out += esc(text.slice(last, at)) + `<mark title="${esc(why)}">${esc(c.to)}</mark>`;
    last = end;
  }
  return out + esc(text.slice(last));
}

const VIEW_SCRIPT = "document.querySelectorAll('.view button').forEach(b=>b.onclick=()=>{document.body.dataset.view=b.dataset.v;document.querySelectorAll('.view button').forEach(x=>x.setAttribute('aria-pressed',x===b))});";

async function sha256b64(s) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return btoa(String.fromCharCode(...d));
}

// 음성인식 조각(2~5초)을 읽기 좋은 문단으로 묶는다. 말이 1.5초 이상 끊기거나 문단이 길어지면 나눈다.
// 시각은 문단 시작에만 붙인다. 원문 단어는 바꾸지 않는다.
export function toParagraphs(segs, { gap = 1.5, maxChars = 220 } = {}) {
  const paras = [];
  let cur = null;
  for (const s of segs) {
    const text = s.text.trim();
    if (!text) continue;
    const breakHere = !cur || s.start - cur.end > gap || (cur.text.length > maxChars && /[.?!요죠다]$/.test(cur.text));
    if (breakHere) { cur = { start: s.start, end: s.end, text, segs: [s] }; paras.push(cur); }
    else { cur.text += ' ' + text; cur.end = s.end; cur.segs.push(s); }
  }
  return paras;
}

async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(s)}`;
}

// groups: groupBySlide 결과 [{start,end,blob,segs}], summary: AI JSON 또는 null
export async function buildReport({ lecture, groups, summary, meta }) {
  const noteUrl = /^[a-p]{32}$/.test(meta.extensionId ?? '') && /^[0-9a-f]{8,32}$/i.test(lecture.contentId ?? '')
    ? `chrome-extension://${meta.extensionId}/note-launch.html?id=${lecture.contentId.toLowerCase()}` : null;
  const corrections = correctionsBySegment((summary?.corrections ?? []).slice(0, 80), groups.length);
  const scriptHash = await sha256b64(VIEW_SCRIPT);
  const cards = [];
  // 의심 구간 판정은 앞뒤 발화를 봐야 하므로 슬라이드 순서대로 이은 전체 발화에 대해 한 번 계산한다.
  const suspects = suspectReasons(groups.flatMap((g) => g.segs));
  let n = 0;
  for (const [i, g] of groups.entries()) {
    const img = g.blob ? `<img loading="lazy" src="${await blobToDataUrl(g.blob)}" alt="슬라이드 ${i + 1}">` : '';
    const segs = g.segs.map((s) => ({ ...s, n: ++n }));
    const verbatim = toParagraphs(segs).map((x) => `<p><time>${mmss(x.start)}</time> ${x.segs.map((s) => suspectSpan(renderSegment(s.text.trim(), corrections.get(s.n)), suspects[s.n - 1])).join(' ')}</p>`).join('');
    cards.push(`<section class="card" id="s${i + 1}">
<header><b>S${i + 1}</b> <time>${mmss(g.start)} – ${mmss(g.end)}</time></header>
<div class="body"><div class="img">${img}</div><div class="text">
<div class="raw"><h4>교수님 원문</h4>${verbatim || '<p class="muted">(발화 없음)</p>'}</div>
</div></div></section>`);
  }
  // 그림은 CSS 변수에 한 번만 넣고, 어디서든 class로 불러온다(kitty, bunny, orang, orang-up).
  const mascot = (kind, cls = '') => `<i class="m m-${kind}${cls ? ` ${cls}` : ''}" aria-hidden="true"></i>`;
  // 오랑이 하트: 하트 안을 오랑이 얼굴(사진)로 채운다.
  const HEART = 'M50 88 C20 68 4 52 4 32 C4 15 16 5 30 5 C40 5 47 11 50 19 C53 11 60 5 70 5 C84 5 96 15 96 32 C96 52 80 68 50 88 Z';
  const orangHeart = (clip) => `<path d="${HEART}" fill="#ffd1e3"/><g clip-path="url(#${clip})"><image href="${ORANG_FACE}" x="0" y="0" width="100" height="92" preserveAspectRatio="xMidYMid slice"/></g><path d="${HEART}" fill="none" stroke="#e84a8a" stroke-width="5"/>`;
  // 바탕 무늬: 하트 4개 중 1개가 오랑이 하트(120px 타일).
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><defs><clipPath id="t"><path d="${HEART}"/></clipPath></defs>`
    + `<path d="${HEART}" transform="translate(10 12) scale(.2)" fill="#ff7eb3" fill-opacity=".22"/>`
    + `<path d="${HEART}" transform="translate(74 18) scale(.15)" fill="#ff7eb3" fill-opacity=".16"/>`
    + `<path d="${HEART}" transform="translate(18 76) scale(.16)" fill="#ff7eb3" fill-opacity=".18"/>`
    + `<g transform="translate(66 62) scale(.36)" opacity=".6">${orangHeart('t')}</g></svg>`;
  const HEART_TILE = `url("data:image/svg+xml,${encodeURIComponent(tile)}")`;
  const OHEART = '<svg class="oheart" viewBox="0 0 100 92" aria-hidden="true"><use href="#m-oheart"/></svg>';
  // 떠오르는 하트·캐릭터 24개: 위치·크기·속도·지연은 고정값(같은 입력이면 같은 HTML).
  const HEARTS = [[4,14,11,0],[13,22,14,3],[22,12,9,6],[31,18,13,1],[42,26,16,8],[51,13,10,4],[60,20,12,10],[69,16,15,2],[78,24,11,7],[86,14,13,5],[93,19,10,9],[37,11,17,12],
    [8,30,15,2],[17,26,18,9],[27,34,16,5],[46,28,19,11],[56,32,17,1],[65,26,15,7],[74,30,18,13],[83,28,16,4],[90,34,19,10],[34,26,15,14],[60,30,17,6],[48,24,14,3]]
    .map(([l, s, d, w], i) => `<span style="left:${l}%;font-size:${s}px;animation-duration:${d}s;animation-delay:${w}s">${i < 12 ? (i % 4 === 3 ? OHEART : i % 3 ? '♥' : '💗') : mascot(['kitty', 'bunny', 'orang'][i % 3], 'mini')}</span>`).join('');
  // 응원하는 남자 캐릭터(하트)와 화난 여자 캐릭터. 그림은 CSS에 한 번만 넣고 class로 재사용한다.
  const BOY_TALK = `<figure class="talk boy-talk"><div class="pic boy" role="img" aria-label="하트 표정의 남자 캐릭터"><span class="onhead">${mascot('orang')}</span></div><p class="bubble">공부 화이팅 ♥</p></figure>`;
  const GIRL_TALK = `<figure class="talk girl-talk"><div class="pic girl" role="img" aria-label="화난 표정의 여자 캐릭터"><span class="onhead">${mascot('orang')}</span></div><p class="bubble angry">야 김지우 공부 안 할 거야???</p></figure>`;
  // 슬라이드 카드 3장마다 둘이 번갈아 끼어든다.
  const withTalks = cards.map((c, i) => (i % 3 === 2 ? `${c}\n<div class="interlude">${(i / 3 | 0) % 2 ? BOY_TALK : GIRL_TALK}</div>` : c)).join('\n');
  const PARADE = Array.from({ length: 12 }, (_, i) => mascot(['kitty', 'orang', 'bunny'][i % 3])).join('<span>♥</span>');
  const exam = (summary?.exam ?? []).map((t) => `<li>${esc(t)}</li>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'">
<title>${esc(lecture.title)} – 강의 정리</title>
<style>
:root{--kitty:url("${KITTY}");--bunny:url("${BUNNY}");--orang:url("${ORANG_CHEST}");--orang-up:url("${ORANG_UP}");--bg:#ffeef5;--fg:#4a2b38;--muted:#9b6b7d;--line:#ffc9dc;--card:#fffafc;--accent:#e84a8a;--on-accent:#fff;--mark:#ffd6e8;--heart:#ff7eb3}
@media (prefers-color-scheme:dark){:root{--bg:#2b1522;--fg:#fbe9f1;--muted:#d0a3b8;--line:#5a2c44;--card:#3a1d2d;--accent:#f08cb0;--on-accent:#1d1518;--mark:#5a2a40;--heart:#f08cb0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg) ${HEART_TILE};color:var(--fg);font:15px/1.65 system-ui,-apple-system,"Malgun Gothic",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px;color:var(--accent)}h2{font-size:17px;margin:28px 0 8px}
h1::after{content:" 💗" / "";display:inline-block;animation:heart-pop 1.4s ease-in-out infinite}
h2::before{content:"💕 " / ""}.card header b::before{content:"♥ " / "";color:var(--heart)}
.box,.card{border-color:var(--line);box-shadow:0 2px 10px color-mix(in srgb,var(--heart) 18%,transparent)}
.view button[aria-pressed=true]::before{content:"♥ " / ""}.note-action::after{content:" 💕" / ""}
.hearts,.bg-mascots{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:0}main{position:relative;z-index:1}
.m{display:inline-block;background:center bottom/contain no-repeat}.m-kitty{background-image:var(--kitty);aspect-ratio:160/186}.m-bunny{background-image:var(--bunny);aspect-ratio:189/177}.m-orang{background-image:var(--orang);aspect-ratio:592/576}.m-orang-up{background-image:var(--orang-up);aspect-ratio:592/766}
.bg-mascots .m{position:absolute;bottom:0;height:96vh;max-width:36vw;opacity:.5}.bg-mascots .left{left:-1vw}.bg-mascots .right{right:-1vw}.bg-mascots .center{left:50%;height:80vh;transform:translateX(-50%)}
@media (max-width:1000px){.bg-mascots .m{opacity:.22}}
.hearts .mini{height:2.4em;display:block}
.box{position:relative}.box::after{content:"";position:absolute;right:10px;top:-34px;width:28px;height:42px;background:var(--kitty) center/contain no-repeat}.box:nth-of-type(2n)::after{background-image:var(--bunny)}
.card header{display:flex;align-items:center;gap:6px}.card header::before{content:"";width:18px;height:27px;background:var(--kitty) center/contain no-repeat}.card:nth-of-type(2n) header::before{background-image:var(--bunny)}.card:nth-of-type(3n) header::before{background-image:var(--orang)}
.duo{display:flex;flex-wrap:wrap;gap:56px 32px;justify-content:center;margin:60px 0 6px}.interlude{display:flex;justify-content:center;margin:50px 0 10px}
.pic{position:relative}.onhead{position:absolute;left:50%;top:-50px;width:40px;height:60px;transform:translateX(-50%)}.onhead .m{width:100%;height:100%;display:block}
.hearts .oheart{width:2.2em;height:2em;display:block}
.talk{display:flex;align-items:flex-end;gap:10px;margin:0}.pic{width:100px;height:136px;flex:none;background:center bottom/contain no-repeat}
.boy{background-image:url(${CHEER_BOY})}.girl{background-image:url(${ANGRY_GIRL})}.boy-talk .pic{animation:hop 1.2s ease-in-out infinite}
.bubble{position:relative;margin:0 0 72px;background:var(--card);border:2px solid var(--line);border-radius:16px;padding:8px 14px;font-weight:700;color:var(--accent);box-shadow:0 2px 8px color-mix(in srgb,var(--heart) 25%,transparent)}
.bubble::before{content:"";position:absolute;left:-10px;bottom:16px;border:9px solid transparent;border-left:0;border-right-color:var(--line)}
.bubble.angry{color:#d6203b;border-color:#ff8f9f;animation:fume .45s ease-in-out infinite alternate}.bubble.angry::before{border-right-color:#ff8f9f}
@keyframes fume{from{transform:rotate(-2deg) scale(1)}to{transform:rotate(2deg) scale(1.04)}}
.parade{display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-end;gap:4px 10px;margin:32px 0 8px;color:var(--heart)}.parade .m{height:66px;animation:hop 1.2s ease-in-out infinite}.parade .m:nth-of-type(2n){animation-delay:.6s}
@keyframes hop{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.hearts span{position:absolute;bottom:-40px;color:var(--heart);opacity:0;animation:heart-rise linear infinite}
@keyframes heart-rise{0%{transform:translateY(0) scale(.6) rotate(-10deg);opacity:0}10%{opacity:.55}50%{transform:translateY(-55vh) scale(1) rotate(10deg)}90%{opacity:.35}100%{transform:translateY(-110vh) scale(1.2) rotate(-8deg);opacity:0}}
@keyframes heart-pop{0%,100%{transform:scale(1)}15%{transform:scale(1.35)}30%{transform:scale(.95)}45%{transform:scale(1.2)}}
@media (prefers-reduced-motion:reduce){h1::after,.parade .m,.boy-talk .pic,.bubble.angry{animation:none}.hearts{display:none}}
.meta{color:var(--muted);font-size:13px}.kicker{margin:0 0 2px;color:var(--accent);font-weight:600;font-size:14px}
.info{display:flex;flex-wrap:wrap;gap:4px 20px;margin:8px 0 0;font-size:13px}.info div{display:flex;gap:6px}.info dt{color:var(--muted)}.info dd{margin:0}.box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 16px}
.view{position:sticky;top:0;background:var(--bg);padding:10px 0;border-bottom:1px solid var(--line);z-index:1;display:flex;gap:6px}
.view button{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:5px 12px;cursor:pointer;font:inherit;font-size:13px}
.view button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.note-action{display:inline-block;margin-top:12px;padding:8px 16px;background:var(--accent);color:var(--on-accent);border-radius:999px;text-decoration:none;font-weight:600}.note-help{margin:4px 0 12px;color:var(--muted);font-size:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;margin:14px 0;overflow:hidden;break-inside:avoid}
.card header{padding:8px 14px;background:color-mix(in srgb,var(--accent) 8%,var(--card));border-bottom:1px solid var(--line);font-size:13px}.card header time{color:var(--muted);margin-left:6px}
.body{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:16px;padding:14px}
.img img{width:100%;border-radius:6px;border:1px solid var(--line)}
.overview,.lecture-summary li{white-space:pre-line}.muted{color:var(--muted)}
.raw h4{margin:12px 0 4px;font-size:13px;color:var(--muted)}.raw p{margin:0 0 8px;font-size:14px}.raw time{display:inline-block;margin-right:6px;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
mark{background:var(--mark);color:inherit;border-radius:3px;padding:0 2px}
.suspect{color:var(--muted);text-decoration:underline wavy;text-decoration-color:var(--accent);cursor:help}
body[data-view=sum] .card{display:none}body[data-view=raw] .lecture-summary{display:none}body[data-view=raw] .raw h4{margin-top:0}
@media (max-width:760px){.body{grid-template-columns:1fr}}
@media print{.view,.hearts,.bg-mascots{display:none}.card{page-break-inside:avoid}body{background:#fff}h1::after{animation:none}}
</style></head><body data-view="both"><svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="m-oheart" viewBox="0 0 100 92"><clipPath id="oh-clip"><path d="${HEART}"/></clipPath>${orangHeart('oh-clip')}</symbol></svg><div class="bg-mascots" aria-hidden="true">${mascot('kitty', 'left')}${mascot('orang-up', 'center')}${mascot('bunny', 'right')}</div><div class="hearts" aria-hidden="true">${HEARTS}</div><main>
<p class="kicker">${esc([lecture.course, lecture.professor && `${lecture.professor} 교수`].filter(Boolean).join(' · '))}</p>
<h1>${lecture.week ? `${esc(lecture.week)}주차 · ` : ''}${esc(lecture.title)}</h1>
<dl class="info">
${lecture.module ? `<div><dt>단원</dt><dd>${esc(lecture.module)}</dd></div>` : ''}
${lecture.period ? `<div><dt>학습기간</dt><dd>${esc(lecture.period)}</dd></div>` : ''}
<div><dt>강의 길이</dt><dd>${mmss(lecture.duration)} · 슬라이드 ${groups.length}장</dd></div>
<div><dt>정리</dt><dd>받아쓰기 ${esc(meta.asrModel)} · 요약 ${esc(meta.aiLabel)} · ${esc(displayDate(meta.createdAt))}</dd></div>
</dl>
<div class="duo">${BOY_TALK}${GIRL_TALK}</div>
${summary ? `<section class="lecture-summary"><h2>강의 전체 핵심</h2><div class="box"><p class="overview">${esc(summary.overview)}</p></div>${exam ? `<h2>시험 포인트</h2><div class="box"><ul>${exam}</ul></div>` : ''}</section>` : '<div class="box"><p>AI 요약 없이 원문만 정리한 파일입니다.</p></div>'}
${noteUrl ? `<a class="note-action" href="${esc(noteUrl)}" target="_blank" rel="noopener noreferrer">요약노트 만들기</a><p class="note-help">지우노트 💗 확장이 설치된 Chrome에서 열면, 저장된 받아쓰기로 요약을 준비합니다. 확인 후에만 AI로 전송합니다.</p>` : ''}
<div class="view" role="group" aria-label="보기 방식"><button data-v="both" aria-pressed="true">함께 보기</button><button data-v="sum" aria-pressed="false">요약만</button><button data-v="raw" aria-pressed="false">원문만</button></div>
${withTalks}
<p class="meta">원문은 음성인식(위 '정리'에 표시된 받아쓰기 모델)으로 받아쓴 것이라 오류가 있을 수 있습니다. <span class="suspect">물결 밑줄</span>은 음성인식이 지어냈을 수 있어 확인이 필요한 부분입니다. <mark>표시</mark>는 AI가 교정한 말이며, 마우스를 올리면 원래 받아쓰기가 보입니다. 개인 학습용이며, 강의 자료의 저작권은 교수자에게 있습니다.</p>
<div class="parade" aria-hidden="true">${PARADE}</div>
</main><script>${VIEW_SCRIPT}</script></body></html>`;
}
