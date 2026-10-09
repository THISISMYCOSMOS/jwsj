// 설치 상태 진단(읽기 전용): node scripts/doctor.mjs  (기계용 출력: --json)
// 아무것도 설치·수정·삭제하지 않는다. Groq 키 값은 읽지 않고, 연결 프로그램이 알려 주는 '저장됨/없음'만 확인한다.
// 사람이나 AI 도우미가 INSTALL-AI.md의 순서대로 문제를 좁힐 때 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {HOST_NAME,EXTENSION_ID,platformPaths,readRegistry,regKey} from './platform.mjs';
import {checkNode} from './setup.mjs';

const ORIGIN=`chrome-extension://${EXTENSION_ID}/`;

// 실행기 파일에서 node 경로를 꺼낸다(host.bat: "C:\...\node.exe" "%~dp0host.mjs", host.sh: exec '/path/node' '...').
export function launcherNodePath(text){
  return String(text||'').match(/^"([^"]+)"\s+"%~dp0host\.mjs"/m)?.[1]
    ?? String(text||'').match(/^exec '((?:[^']|'\\'')+)' /m)?.[1]?.replace(/'\\''/g,"'") ?? null;
}
// 학교·회사 PC의 Chrome 정책 중 이 확장을 막는 것. p: {이름: 값 또는 목록 배열}. 옛 이름(…Blacklist/Whitelist)도 본다.
export function policyProblems(p){
  const out=[];const list=(...names)=>names.flatMap(n=>Array.isArray(p[n])?p[n]:[]);
  if(String(p.ExtensionDeveloperModeSettings)==='1'||String(p.DeveloperToolsAvailability)==='2')
    out.push('Chrome 정책이 개발자 모드를 막아 압축해제된 확장을 로드할 수 없습니다(ExtensionDeveloperModeSettings=1 또는 DeveloperToolsAvailability=2).');
  if(list('ExtensionInstallBlocklist','ExtensionInstallBlacklist').includes('*')&&!list('ExtensionInstallAllowlist','ExtensionInstallWhitelist').includes(EXTENSION_ID))
    out.push('Chrome 정책이 모든 확장 설치를 막고 있습니다(ExtensionInstallBlocklist=*).');
  const types=list('ExtensionAllowedTypes');
  if(types.length&&!types.includes('extension'))out.push('Chrome 정책이 일반 확장 프로그램을 허용하지 않습니다(ExtensionAllowedTypes).');
  let settings=null;try{settings=p.ExtensionSettings?JSON.parse(p.ExtensionSettings):null;}catch{}
  const mode=settings?.[EXTENSION_ID]?.installation_mode;
  if(mode==='blocked'||mode==='removed'||(settings?.['*']?.installation_mode==='blocked'&&!['allowed','force_installed','normal_installed'].includes(mode)))
    out.push('Chrome 정책(ExtensionSettings)이 이 확장 설치를 막고 있습니다.');
  if(String(p.NativeMessagingUserLevelHosts)==='0')out.push('Chrome 정책이 사용자 단위 연결 프로그램을 막습니다(NativeMessagingUserLevelHosts=0). 받아쓰기를 쓸 수 없습니다.');
  if(list('NativeMessagingBlocklist','NativeMessagingBlacklist').includes('*')&&!list('NativeMessagingAllowlist','NativeMessagingWhitelist').includes(HOST_NAME))
    out.push('Chrome 정책이 연결 프로그램을 막고 있습니다(NativeMessagingBlocklist=*).');
  return out;
}
const SCALAR_POLICIES=['ExtensionDeveloperModeSettings','DeveloperToolsAvailability','NativeMessagingUserLevelHosts','ExtensionSettings'];
const LIST_POLICIES=['ExtensionInstallBlocklist','ExtensionInstallBlacklist','ExtensionInstallAllowlist','ExtensionInstallWhitelist','ExtensionAllowedTypes',
  'NativeMessagingBlocklist','NativeMessagingBlacklist','NativeMessagingAllowlist','NativeMessagingWhitelist'];
// readRegistry 결과들([['HKLM', parsed], ['HKCU', parsed]])에서 Chrome 정책을 모은다. 앞의 것(HKLM)이 우선한다.
export function collectPolicies(hives){
  const p={};
  for(const [hive,parsed] of hives){
    const base=`${hive}\\Software\\Policies\\Google\\Chrome`;
    const v=regKey(parsed,base);
    if(v)for(const k of SCALAR_POLICIES)if(k in v&&!(k in p))p[k]=v[k];
    for(const k of LIST_POLICIES){const sub=regKey(parsed,`${base}\\${k}`);if(sub)p[k]=[...(p[k]||[]),...Object.values(sub)];}
  }
  return p;
}
function readWindowsPolicies(){
  return collectPolicies(['HKLM','HKCU'].map(h=>[h,readRegistry(`${h}\\Software\\Policies\\Google\\Chrome`)]).filter(([,x])=>x));
}

// 설치된 실행기로 연결 프로그램을 띄워 groqStatus 한 번만 묻는다(Chrome과 같은 4바이트 길이 + JSON 형식).
function pingHost(launcher,platform,timeoutMs=15000){
  return new Promise(resolve=>{
    let child;
    try{child=platform==='win32'?spawn(`"${launcher}"`,[],{shell:true,windowsHide:true}):spawn(launcher,[],{});}
    catch(e){resolve({ok:false,error:String(e.message||e)});return;}
    let out=Buffer.alloc(0),err='';const done=r=>{clearTimeout(timer);try{child.stdin.end();}catch{}try{child.kill();}catch{}resolve(r);};
    const timer=setTimeout(()=>done({ok:false,error:'응답 없음(시간 초과)'}),timeoutMs);
    child.on('error',e=>done({ok:false,error:String(e.message||e)}));
    child.stderr.on('data',d=>{err+=d;});
    child.on('exit',code=>{if(out.length<4)done({ok:false,error:`연결 프로그램이 종료됨(코드 ${code}) ${err.trim().slice(0,200)}`});});
    child.stdout.on('data',d=>{out=Buffer.concat([out,d]);if(out.length>=4){const n=out.readUInt32LE(0);if(out.length>=4+n){try{done(JSON.parse(out.subarray(4,4+n).toString('utf8')));}catch{done({ok:false,error:'응답 형식 오류'});}}}});
    const body=Buffer.from(JSON.stringify({cmd:'groqStatus'}));const head=Buffer.alloc(4);head.writeUInt32LE(body.length,0);
    child.stdin.write(Buffer.concat([head,body]));
  });
}
// 연결 프로그램의 groqStatus 응답 → 마지막 진단 줄. 키가 없으면 ✖로 보여 준다(받아쓰기를 시작할 수 없으므로).
export function hostLine(ping){
  if(!ping?.ok)return {ok:false,detail:ping?.error||'실패',fix:'실행기의 Node 경로 항목을 확인하고 install을 다시 실행하세요.'};
  return ping.configured===true
    ?{ok:true,detail:'Groq 키 저장됨',fix:''}
    :{ok:false,detail:'Groq 키 없음',fix:'확장 설정 화면의 "Groq 받아쓰기"에서 키를 저장하세요.'};
}

export async function diagnose(){
  const results=[];const add=(ok,name,detail='',fix='')=>results.push({ok,name,detail,fix});
  let P;
  try{P=platformPaths();add(true,'운영체제',process.platform);}catch{add(false,'운영체제',process.platform,'Windows 또는 macOS에서만 지원합니다.');return results;}
  try{checkNode();add(true,'Node.js',`${process.version} (${process.execPath})`);}catch(e){add(false,'Node.js',process.version,e.message);}
  const root=P.installRoot,launcher=path.join(root,P.hostLauncher);
  if(!fs.existsSync(path.join(root,'.klas-summarizer-host'))){add(false,'설치 폴더',root,'install(.cmd/.command)을 탐색기·터미널에서 직접 실행하세요.');return results;}
  const version=path.join(root,'.installed-version');
  add(true,'설치 폴더',root+(fs.existsSync(version)?` · 버전 ${fs.readFileSync(version,'utf8').trim()}`:''));
  const missing=['extension/manifest.json','host.mjs','groq.mjs',P.hostLauncher,'host-config.json'].filter(f=>!fs.existsSync(path.join(root,f)));
  add(!missing.length,'설치 파일',missing.length?'누락: '+missing.join(', '):'모두 있음',missing.length?'install을 다시 실행하세요.':'');
  const manifestPath=P.platform==='win32'?path.join(root,HOST_NAME+'.json'):path.join(P.hostManifestDir,HOST_NAME+'.json');
  if(P.platform==='win32'){
    const key=`HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
    let reg=null;try{reg=regKey(readRegistry(key),key)?.['']??null;}catch{}
    add(!!reg&&path.resolve(reg).toLowerCase()===path.resolve(manifestPath).toLowerCase(),'연결 프로그램 등록(레지스트리)',reg||'등록 없음',
      reg?'다른 위치를 가리킵니다. INSTALL-AI.md §6.2를 보세요.':'install을 탐색기에서 직접 다시 실행하세요(다른 앱 안에서 실행하면 등록이 그 앱 안에만 남습니다).');
  }
  try{
    const m=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    const ok=path.resolve(m.path)===path.resolve(launcher)&&Array.isArray(m.allowed_origins)&&m.allowed_origins.includes(ORIGIN);
    add(ok,'연결 프로그램 설정 파일',manifestPath,ok?'':'install을 다시 실행하세요.');
  }catch{add(false,'연결 프로그램 설정 파일',manifestPath+' 없음','install을 다시 실행하세요.');}
  const nodeInLauncher=fs.existsSync(launcher)?launcherNodePath(fs.readFileSync(launcher,'utf8')):null;
  add(!!nodeInLauncher&&fs.existsSync(nodeInLauncher),'실행기의 Node 경로',nodeInLauncher||'읽지 못함',
    'Node.js를 지웠거나 옮겼습니다. Node.js LTS를 설치한 뒤 install을 다시 실행하세요.');
  if(P.platform==='win32'){
    let problems;try{problems=policyProblems(readWindowsPolicies());}catch(e){problems=[`정책을 읽지 못함: ${e.message}`];}
    add(!problems.length,'Chrome 관리 정책',problems.length?problems.join(' / '):'막는 정책 없음',problems.length?'학교·회사가 관리하는 PC입니다. 관리자에게 문의하거나 개인 PC를 쓰세요.':'');
  }
  const line=hostLine(await pingHost(launcher,P.platform));
  add(line.ok,'연결 프로그램 실행',line.detail,line.fix);
  return results;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const results=await diagnose();
  if(process.argv.includes('--json'))console.log(JSON.stringify(results,null,2));
  else for(const r of results)console.log(`${r.ok?'✔':'✖'} ${r.name}: ${r.detail}${!r.ok&&r.fix?`\n    → ${r.fix}`:''}`);
  process.exitCode=results.every(r=>r.ok)?0:1;
}
