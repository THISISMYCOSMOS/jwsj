// OS별 경로를 한곳에 모은다. Windows와 macOS를 지원한다.
// 인자를 받는 순수 함수라서 Windows에서도 macOS 경로를 테스트할 수 있다.
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export const HOST_NAME = 'com.jwsj.host';
export const EXTENSION_ID = 'ongnnbhdedfhijimkccikfdbkigemkfn';
export const HELPER_ID = 'jicidjkhiefbhbgbfbemakjndloecjlf'; // KLAS Helper (있으면 같은 창에 함께 연결)

export function platformPaths({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  if (platform === 'win32') {
    const p = path.win32;
    if (!env.LOCALAPPDATA) throw Error('LOCALAPPDATA 환경 변수가 없습니다.');
    const local = env.LOCALAPPDATA;
    return {
      platform,
      installRoot: p.join(local, 'Jwsj'),
      chromeCandidates: [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], local].filter(Boolean)
        .map((d) => p.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe')),
      helperRoot: p.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Extensions', HELPER_ID),
      // Windows는 레지스트리가 설치 폴더 안의 manifest를 가리킨다.
      hostManifestDir: null,
      hostLauncher: 'host.bat',
    };
  }
  if (platform === 'darwin') {
    const p = path.posix;
    const support = p.join(home, 'Library', 'Application Support');
    return {
      platform,
      installRoot: p.join(support, 'Jwsj'),
      chromeCandidates: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        p.join(home, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
      ],
      helperRoot: p.join(support, 'Google', 'Chrome', 'Default', 'Extensions', HELPER_ID),
      // macOS는 이 폴더의 manifest 파일 자체가 등록이다(레지스트리 없음).
      hostManifestDir: p.join(support, 'Google', 'Chrome', 'NativeMessagingHosts'),
      hostLauncher: 'host.sh',
    };
  }
  throw Error('Windows 또는 macOS에서 실행하세요.');
}

// 저장된 PID가 살아 있고, 그 프로세스가 정말 우리 실행기(chrome-launch)인지 확인한다(독립 검토 F9).
// Windows 강제 종료 뒤 남은 PID 파일이 다른 프로세스 번호와 겹쳐도 속지 않는다.
export function isLauncherAlive(pidFile, { platform = process.platform } = {}) {
  let pid;
  try { pid = Number(fs.readFileSync(pidFile, 'utf8')); } catch { return false; }
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); } catch { return false; }
  const r = platform === 'win32'
    ? spawnSync('powershell.exe', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: 'utf8', windowsHide: true })
    : spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  if (r.error || typeof r.stdout !== 'string') return true; // 확인 수단이 없으면 보수적으로 살아 있다고 본다
  return r.stdout.includes('chrome-launch');
}

// reg.exe query의 출력은 콘솔 코드 페이지(한국어 Windows는 CP949)라 UTF-8로 읽으면 한글 경로가 깨진다(독립 검토 2026-10-09).
// reg export는 항상 UTF-16LE .reg 파일을 쓰므로 그것을 읽는다. 반환: {'HKEY_…\\키': {'': 기본값, 이름: 문자열}}
export function parseRegExport(text) {
  const out = {}; let cur = null;
  const unescape = (s) => s.replace(/\\(.)/g, '$1');
  for (const raw of String(text).replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trimEnd();
    const section = line.match(/^\[(.+)\]$/);
    if (section) { cur = out[section[1]] = {}; continue; }
    const m = cur && line.match(/^(@|"((?:[^"\\]|\\.)*)")=(.*)$/);
    if (!m) continue;
    const str = m[3].match(/^"((?:[^"\\]|\\.)*)"$/);
    const value = str ? unescape(str[1]) : /^dword:[0-9a-f]{8}$/i.test(m[3]) ? String(parseInt(m[3].slice(6), 16)) : null;
    if (value !== null) cur[m[1] === '@' ? '' : unescape(m[2])] = value;
  }
  return out;
}
// 키(하위 키 포함)를 읽는다. 키가 없으면 null, reg.exe를 쓸 수 없으면 오류.
export function readRegistry(key, { spawn = spawnSync } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'klas-reg-'));
  try {
    const file = path.join(dir, 'k.reg');
    const r = spawn('reg.exe', ['export', key, file, '/y'], { windowsHide: true });
    if (r.error) throw Error('레지스트리를 읽을 수 없습니다.');
    if (r.status === 1 || !fs.existsSync(file)) return null;
    if (r.status !== 0) throw Error('레지스트리 조회에 실패했습니다.');
    return parseRegExport(fs.readFileSync(file).toString('utf16le'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
// 위 결과에서 'HKCU\\…' 같은 짧은 이름으로 키 하나를 찾는다(대소문자 무시).
export function regKey(parsed, key) {
  const full = key.replace(/^HKCU\\/i, 'HKEY_CURRENT_USER\\').replace(/^HKLM\\/i, 'HKEY_LOCAL_MACHINE\\').toLowerCase();
  const hit = Object.keys(parsed || {}).find((k) => k.toLowerCase() === full);
  return hit ? parsed[hit] : null;
}

// 연결 프로그램 실행기에 적어 둘 node 경로. 설치할 때의 node 경로가 나중에 사라지는 환경을 피한다.
// - fnm: 셸마다 임시 폴더(fnm_multishells)를 만들고 창을 닫으면 지운다 → 실제 설치 경로(realpath)로 바꾼다.
// - Homebrew: process.execPath가 버전 폴더(Cellar/node/22.1.0)라 brew upgrade 후 사라진다 → 버전 없는 opt/<formula>/bin/node로 바꾼다.
// 바꾼 경로가 없으면 원래 경로를 그대로 쓴다.
export function stableNodePath(execPath = process.execPath, { exists = fs.existsSync, realpath = fs.realpathSync.native } = {}) {
  const s = String(execPath);
  if (/[\\/]fnm_multishells[\\/]/i.test(s)) {
    try { const real = realpath(s); if (real && exists(real)) return real; } catch {}
    return s;
  }
  const brew = s.match(/^(.*)\/Cellar\/([^/]+)\/[^/]+\/bin\/node$/);
  if (brew) {
    const opt = `${brew[1]}/opt/${brew[2]}/bin/node`;
    if (exists(opt)) return opt;
  }
  return s;
}

// macOS용 host 실행 스크립트. Chrome이 Finder에서 실행되면 PATH가 짧아 node·claude·codex를 못 찾으므로 보강한다.
export function macHostScript({ nodePath, hostPath, home }) {
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const extra = [path.posix.dirname(nodePath), `${home}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin'].map(q).join(':');
  return `#!/bin/sh\nexport PATH=${extra}:"$PATH"\nexec ${q(nodePath)} ${q(hostPath)}\n`;
}
