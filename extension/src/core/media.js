// Xinics Commons(학교별 SITE) 강의 mp4에서 압축 AAC와 키프레임(슬라이드 후보)을 뽑는다.
// 전제(실측 31강): progressive mp4, H.264 + AAC(44.1/48kHz), 키프레임 약 2초 간격. moov 위치는 앞·끝 모두 있음.
// 전역 MP4Box(vendor/mp4box.all.js)가 먼저 로드되어 있어야 한다.
import { SITE } from '../site.js';

const abortError = (signal) => signal?.reason ?? Object.assign(new Error('사용자가 중지함'), { name: 'AbortError' });
function checkAbort(signal) { if (signal?.aborted) throw abortError(signal); }
// 디코더와 렌더러가 늦게 끝나더라도 취소된 강의의 큐를 붙잡지 않는다.
function abortable(promise, signal, onAbort) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => { try { onAbort?.(); } catch {} finish(reject, abortError(signal)); };
    const finish = (settle, value) => { signal.removeEventListener('abort', abort); settle(value); };
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
const prefetchLimit = () => Object.assign(new Error('다음 구간 미리 받기 메모리 한도'), { code: 'PREFETCH_LIMIT' });
function discardBody(body) { try { Promise.resolve(body?.cancel()).catch(() => {}); } catch {} }

// fetchImpl(url, init)을 주입받는다. 확장에서는 fetch, 개발 서버에서는 프록시 fetch.
export function createSource(fetchImpl = fetch) {
  async function getText(url, { signal } = {}) {
    const r = await fetchImpl(url, { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return r.text();
  }
  async function getRange(url, start, endInclusive, { signal, maxBytes = Infinity } = {}) {
    const r = await fetchImpl(url, { headers: { Range: `bytes=${start}-${endInclusive}` }, signal });
    if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status} range ${url}`);
    // 영상 서버가 차단하면 206과 함께 HTML 안내 페이지를 준다. mp4로 읽지 않고 바로 알린다.
    if (/text\/html/i.test(r.headers?.get('content-type') ?? '')) {
      discardBody(r.body);
      throw new Error('영상 서버가 영상 대신 안내 페이지를 보냈어요(접근 차단). 확장을 새로고침한 뒤 다시 시도하세요.');
    }
    if (Number.isFinite(maxBytes)) {
      // Range를 무시한 서버의 전체 파일은 미리 받지 않는다. 본문을 읽기 전에 버린다.
      if (r.status !== 206 || Number(r.headers?.get('content-length')) > maxBytes || !r.body?.getReader) {
        discardBody(r.body);
        throw prefetchLimit();
      }
      const reader = r.body.getReader(), parts = [];
      let size = 0, done = false, canceled = false;
      const cancel = () => { if (canceled) return; canceled = true;try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} };
      try {
        while (true) {
          checkAbort(signal);
          const chunk = await abortable(reader.read(), signal, cancel);
          checkAbort(signal);
          if (chunk.done) { done = true; break; }
          size += chunk.value.byteLength;
          if (size > maxBytes) throw prefetchLimit();
          parts.push(chunk.value);
        }
        const buf = new Uint8Array(size);
        let offset = 0;
        for (const part of parts) { buf.set(part, offset); offset += part.byteLength; }
        return buf;
      } finally { if (!done) cancel(); reader.releaseLock(); }
    }
    return new Uint8Array(await r.arrayBuffer());
  }
  return { getText, getRange };
}

// content_id → 제목, 길이, mp4 주소
export async function loadContentInfo(src, contentId) {
  const xml = await src.getText(`${SITE.commonsOrigin}/viewer/ssplayer/uniplayer_support/content.php?content_id=${encodeURIComponent(contentId)}`);
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const q = (sel) => doc.querySelector(sel)?.textContent?.trim() ?? '';
  const title = q('content_metadata > title');
  const duration = Number(q('content_playing_info > content_duration')) || 0;
  // 형식 1(upf): story의 main_media 파일명 + service_root의 progressive 주소 템플릿
  // 형식 2(video1): main_media > desktop|mobile > html5 안에 method=progressive와 완성된 media_uri (실측 2026-10-04)
  let mediaUrl = null;
  // 형식 3(video2, 성대 화면 강의): main_media는 강의실 카메라, sub_media가 슬라이드 화면이다. 음성은 둘이 같다(실측 2026-10-14).
  // 슬라이드를 뽑아야 하므로 sub_media를 먼저 쓴다.
  const progressive = (sel) => [...doc.querySelectorAll(`${sel} desktop html5, ${sel} mobile html5`)]
    .find((n) => n.querySelector('method')?.textContent?.trim() === 'progressive')?.querySelector('media_uri')?.textContent?.trim() || null;
  if (q('content_playing_info > content_type') === 'video2') mediaUrl = progressive('sub_media');
  const html5 = mediaUrl ? null : [...doc.querySelectorAll('main_media desktop html5, main_media mobile html5')]
    .find((n) => n.querySelector('method')?.textContent?.trim() === 'progressive');
  if (html5) mediaUrl = html5.querySelector('media_uri')?.textContent?.trim() || null;
  if (!mediaUrl) {
    const list = doc.querySelector('main_media_list');
    const def = list?.getAttribute('default_media_id');
    const file = (def && list.querySelector(`main_media[media_id="${CSS.escape(def)}"]`)?.textContent?.trim())
      || doc.querySelector('main_media_list main_media')?.textContent?.trim();
    const tpl = [...doc.querySelectorAll('service_root media_uri')]
      .find((n) => n.getAttribute('method') === 'progressive')?.textContent?.trim();
    if (file && tpl && !/[/\\]/.test(file)) mediaUrl = tpl.replace('[MEDIA_FILE]', file);
    // 성대 upf(everlec 등)는 service_root가 없다. content_uri(<commons>/…/contents/web_files)의
    // 같은 경로를 mp4 origin의 media_files 아래로 옮긴 곳에 파일이 있다(실측 2026-10-14, 4강).
    const base = q('content_playing_info > content_uri');
    if (!mediaUrl && file && !/[/\\]/.test(file) && base.startsWith(`${SITE.commonsOrigin}/`) && /\/web_files\/?$/.test(base)) {
      mediaUrl = SITE.mediaOrigins[0] + base.slice(SITE.commonsOrigin.length).replace(/\/web_files\/?$/, '/media_files/') + file;
    }
  }
  if (!isAllowedMediaUrl(mediaUrl)) {
    throw new Error('지원하지 않는 콘텐츠 형식입니다 (progressive mp4 없음).');
  }
  return { contentId, title, duration, mediaUrl };
}
// 이 학교의 mp4 origin 아래 주소만 받는다. origin 뒤의 '/'까지 비교해 'kwcommons.kw.ac.kr.evil.test' 같은 주소를 막는다.
export function isAllowedMediaUrl(url) {
  return typeof url === 'string' && SITE.mediaOrigins.some((o) => url.startsWith(`${o}/`)) && /\.(mp4|m4a)(\?|$)/i.test(url);
}

// 최상위 박스를 머리(최대 16바이트)만 읽으며 건너뛰어 ftyp와 moov 위치를 찾는다.
// 실측(2026-10-04, 31강): screen.mp4는 moov가 앞(faststart), ssmovie.mp4는 moov가 파일 끝에 있다. 둘 다 지원한다.
const MAX_MOOV = 64 * 1024 * 1024;
async function locateBoxes(src, url) {
  const head = await src.getRange(url, 0, 65535, {maxBytes:65536});
  const readHeader = async (off) => {
    if (off + 16 <= head.length) return head.subarray(off, off + 16);
    const h = await src.getRange(url, off, off + 15, {maxBytes:16});
    return h.length >= 8 ? h : null;
  };
  let off = 0, ftyp = null;
  for (let i = 0; i < 64; i++) {
    const h = await readHeader(off);
    if (!h) break;
    const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
    let size = dv.getUint32(0);
    const type = String.fromCharCode(...h.subarray(4, 8));
    if (size === 1) {
      if (h.length < 16) break;
      size = Number(dv.getBigUint64(8)); // 64비트 크기(긴 mdat)
    } else if (size === 0) {
      break; // 파일 끝까지 이어지는 박스. 그 뒤에 moov가 있을 수 없다.
    }
    if (size < 8 || !Number.isSafeInteger(off + size)) break;
    if (type === 'ftyp' && off + size <= head.length) ftyp = head.slice(off, off + size);
    if (type === 'moov') {
      if (size > MAX_MOOV) throw new Error('moov가 너무 큽니다.');
      const moov = off + size <= head.length ? head.slice(off, off + size) : await src.getRange(url, off, off + size - 1, {maxBytes:MAX_MOOV});
      if (moov.length !== size) throw new Error('moov를 끝까지 받지 못했습니다.');
      return { ftyp, moov };
    }
    off += size;
  }
  throw new Error('moov를 찾지 못했습니다 (지원하지 않는 mp4 구조).');
}

// ftyp+moov만 받아 트랙과 샘플 표를 만든다. 샘플 위치(stco/co64)는 원래 파일 기준 절대 위치라
// moov가 파일 끝에 있어도 [ftyp][moov]를 이어 붙여 해석하면 그대로 쓸 수 있다.
export async function openMp4(src, mediaUrl) {
  const { ftyp, moov } = await locateBoxes(src, mediaUrl);
  const joined = new Uint8Array((ftyp?.length || 0) + moov.length);
  if (ftyp) joined.set(ftyp, 0);
  joined.set(moov, ftyp?.length || 0);

  const file = MP4Box.createFile(false);
  const info = await new Promise((resolve, reject) => {
    file.onReady = resolve;
    file.onError = reject;
    const ab = joined.buffer;
    ab.fileStart = 0;
    file.appendBuffer(ab);
    file.flush();
  });
  const vInfo = info.tracks.find((t) => t.video);
  const aInfo = info.tracks.find((t) => t.audio);
  if (!aInfo) throw new Error('오디오 트랙이 없어 받아쓸 수 없습니다.');
  const aTrak = file.getTrackById(aInfo.id);
  const vTrak = vInfo ? file.getTrackById(vInfo.id) : null;
  return {
    mediaUrl,
    duration: info.duration / info.timescale,
    // 비디오가 없는 강의(음성만)는 슬라이드 없이 받아쓰기만 한다.
    video: vTrak ? { info: vInfo, samples: vTrak.samples, description: codecDescription(vTrak) } : null,
    audio: { info: aInfo, samples: aTrak.samples, description: aacDescription(aTrak) },
  };
}

function codecDescription(trak) {
  const entry = trak.mdia.minf.stbl.stsd.entries[0];
  const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
  const ds = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
  box.write(ds);
  return new Uint8Array(ds.buffer, 8); // 박스 헤더 8바이트 제외
}

// 성대 일부 영상(예: 2.7초짜리 video2)은 음성 트랙에 esds(디코더 설정)가 없다. 프레임은 일반 AAC-LC 원시 프레임이라
// 표본 주파수·채널 수로 AAC-LC AudioSpecificConfig(2바이트)를 만들어 쓴다(실측 2026-10-14).
const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
export function aacLcConfig(rate, channels) {
  const i = AAC_RATES.indexOf(rate);
  if (i < 0 || !Number.isInteger(channels) || channels < 1 || channels > 7) return undefined;
  return new Uint8Array([(2 << 3) | (i >> 1), ((i & 1) << 7) | (channels << 3)]);
}
function aacDescription(trak) {
  const entry = trak.mdia.minf.stbl.stsd.entries[0];
  const dsi = entry.esds?.esd?.descs?.[0]?.descs?.[0]?.data;
  if (dsi) return new Uint8Array(dsi);
  return entry.type === 'mp4a' ? aacLcConfig(entry.samplerate, entry.channel_count) : undefined;
}

const sec = (s, track) => s.cts / track.info.timescale;

// 성대 vod.skku.edu는 느리다(실측 2026-10-14: 연결 하나 약 0.2~0.4MB/s, 여러 연결로 나눠도 합계가 늘지 않음).
// 그래서 구간 전체가 아니라 필요한 바이트(음성 샘플 + 2초마다 키프레임)만 받는다. 실측 2분 구간:
// upf 1080p 24.0→14.4MB, video1 16.6→9.1MB, video2 sub 16.5→4.6MB. 간격이 RUN_GAP 이하인 샘플은 한 요청으로 묶는다.
export const RUN_GAP = 16 << 10;
const RUN_CONCURRENCY = 4;
export function byteRuns(samples, gap = RUN_GAP) {
  const runs = [];
  for (const s of [...samples].sort((a, b) => a.offset - b.offset)) {
    const last = runs.at(-1);
    if (last && s.offset - last[1] <= gap) last[1] = Math.max(last[1], s.offset + s.size);
    else runs.push([s.offset, s.offset + s.size]);
  }
  return runs;
}
// 여러 묶음을 동시에(최대 RUN_CONCURRENCY) 받는다. 하나가 실패하면 나머지도 멈추고 그 오류를 한 번만 알린다.
export async function fetchRuns(src, url, runs, { signal, concurrency = RUN_CONCURRENCY } = {}) {
  if (signal?.aborted) throw abortError(signal);
  const ctl = new AbortController();
  const onAbort = () => ctl.abort(signal.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  const out = new Array(runs.length);
  let next = 0, failure = null;
  const worker = async () => {
    while (!failure && next < runs.length) {
      const i = next++, [a, b] = runs[i];
      try {
        // 묶음마다 206과 크기를 확인한다(maxBytes 경로). Range를 무시하는 서버의 전체 파일은 받지 않는다.
        const chunk = await src.getRange(url, a, b - 1, { signal: ctl.signal, maxBytes: b - a });
        if (chunk.length !== b - a) throw new Error(`영상 조각 크기가 다릅니다 (${chunk.length}/${b - a}).`);
        out[i] = chunk;
      } catch (err) { if (!failure) { failure = err; ctl.abort(err); } }
    }
  };
  try { await Promise.all(Array.from({ length: Math.min(concurrency, runs.length) }, worker)); }
  finally { signal?.removeEventListener('abort', onAbort); }
  if (signal?.aborted) throw abortError(signal);
  if (failure) throw failure;
  return out;
}

// [t0, t1) 구간의 오디오 샘플과 키프레임 샘플을 받아 잘라낸다. 묶음이 하나면 예전처럼 한 번의 Range 요청이다.
// slideEvery: 키프레임을 몇 초 간격으로 쓸지 (슬라이드 감지 해상도)
export async function fetchWindow(src, mp4, t0, t1, { slideEvery = 2, signal, maxBytes = Infinity } = {}) {
  const aS = mp4.audio.samples.filter((s) => { const t = sec(s, mp4.audio); return t >= t0 && t < t1; });
  const vS = [];
  let next = t0;
  for (const s of mp4.video?.samples ?? []) {
    if (!s.is_sync) continue;
    const t = sec(s, mp4.video);
    if (t < t0 || t >= t1) continue;
    if (t >= next) { vS.push(s); next = t + slideEvery; }
  }
  const all = aS.concat(vS);
  if (!all.length) return { audio: [], keyframes: [], bytes: 0 };
  const runs = byteRuns(all);
  const total = runs.reduce((n, [a, b]) => n + b - a, 0);
  if (total > maxBytes) throw prefetchLimit();
  const bufs = runs.length === 1
    ? [await src.getRange(mp4.mediaUrl, runs[0][0], runs[0][1] - 1, { signal, maxBytes })]
    : await fetchRuns(src, mp4.mediaUrl, runs, { signal });
  const starts = runs.map(([a]) => a);
  const cut = (s) => {
    let lo = 0, hi = runs.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= s.offset) lo = mid; else hi = mid - 1; }
    return bufs[lo].subarray(s.offset - starts[lo], s.offset - starts[lo] + s.size);
  };
  return {
    audio: aS.map((s) => ({ ts: sec(s, mp4.audio), dur: s.duration / mp4.audio.info.timescale, data: cut(s) })),
    keyframes: vS.map((s) => ({ ts: sec(s, mp4.video), data: cut(s) })),
    bytes: total,
  };
}

// 키프레임 → { ts, bitmap } (가로 maxWidth로 축소)
export async function decodeKeyframes(mp4, keyframes, { maxWidth = 1280, signal, onFrame } = {}) {
  checkAbort(signal);
  const out = [];
  if (!mp4.video || !keyframes.length) return out;
  const { width, height } = mp4.video.info.video;
  const scale = Math.min(1, maxWidth / width);
  const w = Math.round(width * scale), h = Math.round(height * scale);
  const pending = [];
  let discard = false;
  let failure = null;
  // createImageBitmap(VideoFrame)과 기본 2D 캔버스는 GPU 프로세스에 이미지를 만들고 늦게 해제해, 구간마다 GPU 메모리가
  // +400~700MB 튀었다(실측 2026-10-05). CPU 캔버스 하나(willReadFrequently)에 그려 꺼내면 close() 즉시 해제된다.
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  const toBitmap = (frame) => { try { ctx.drawImage(frame, 0, 0, w, h); return Promise.resolve(canvas.transferToImageBitmap()); } catch (e) { return Promise.reject(e); } };
  const dec = new VideoDecoder({
    output: (frame) => {
      if (discard || signal?.aborted) { frame.close(); return; }
      const ts=frame.timestamp/1e6;
      pending.push(toBitmap(frame)
        .then(async (bitmap) => {
          if (discard || signal?.aborted) bitmap.close();
          else if (onFrame) { try { await onFrame({ ts, bitmap }); } catch(e) { bitmap.close(); throw e; } }
          else out.push({ ts, bitmap });
        }).catch(e=>{failure=e;})
        .finally(() => frame.close()));
    },
    error: (e) => { failure=e; },
  });
  try {
  // 슬라이드용 키프레임은 2초에 1장뿐이라 CPU로 충분하다. 강의 재생과 GPU 디코더를 다투지 않게 소프트웨어를 우선한다.
  const base = { codec: mp4.video.info.codec, codedWidth: width, codedHeight: height, description: mp4.video.description };
  const soft = { ...base, hardwareAcceleration: 'prefer-software' };
  const supported = await abortable(VideoDecoder.isConfigSupported(soft).then((r) => r.supported, () => false), signal);
  checkAbort(signal);
  dec.configure(supported ? soft : base);
  // 키프레임만 독립 디코딩한다. 각 키프레임 뒤에 flush해 출력을 확정한다.
  for (const k of keyframes) {
    dec.decode(new EncodedVideoChunk({ type: 'key', timestamp: Math.round(k.ts * 1e6), data: k.data }));
    await abortable(dec.flush(), signal, () => { if (dec.state !== 'closed') dec.close(); });
    await abortable(Promise.all(pending.splice(0)), signal);
    checkAbort(signal);
    if(failure)throw failure;
  }
  await abortable(Promise.all(pending), signal);
  checkAbort(signal);
  if(failure)throw failure;
  return out.sort((a, b) => a.ts - b.ts);
  } catch(e) { discard = true;for(const f of out)f.bitmap.close();out.length = 0;throw e; }
  finally { if(dec.state!=='closed')dec.close(); }
}
