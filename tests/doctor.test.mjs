import test from 'node:test';
import assert from 'node:assert/strict';
import {launcherNodePath,policyProblems,collectPolicies,hostLine} from '../scripts/doctor.mjs';
import {stableNodePath,macHostScript,parseRegExport,regKey} from '../scripts/platform.mjs';

// What `reg export` writes (UTF-16LE on disk, shown here decoded): Korean user path, escaped backslashes and quotes, dword, subkeys.
const EXPORT = '\uFEFFWindows Registry Editor Version 5.00\r\n\r\n'
  + '[HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.klas_summarizer.host]\r\n'
  + '@="C:\\\\Users\\\\홍길동\\\\AppData\\\\Local\\\\KlasSummarizer\\\\com.klas_summarizer.host.json"\r\n\r\n'
  + '[HKEY_LOCAL_MACHINE\\Software\\Policies\\Google\\Chrome]\r\n'
  + '"NativeMessagingUserLevelHosts"=dword:00000000\r\n'
  + '"ExtensionSettings"="{\\"*\\":{\\"installation_mode\\":\\"blocked\\"}}"\r\n'
  + '"BinaryThing"=hex:01,02\r\n\r\n'
  + '[HKEY_LOCAL_MACHINE\\Software\\Policies\\Google\\Chrome\\ExtensionInstallBlocklist]\r\n'
  + '"1"="*"\r\n';

test('reg export output keeps Korean paths intact and is looked up by short key names', () => {
  const parsed = parseRegExport(EXPORT);
  assert.equal(regKey(parsed, 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.klas_summarizer.host')[''],
    'C:\\Users\\홍길동\\AppData\\Local\\KlasSummarizer\\com.klas_summarizer.host.json');
  const policy = regKey(parsed, 'hklm\\software\\policies\\google\\chrome');
  assert.equal(policy.NativeMessagingUserLevelHosts, '0');
  assert.equal(policy.ExtensionSettings, '{"*":{"installation_mode":"blocked"}}');
  assert.equal('BinaryThing' in policy, false);
  assert.equal(regKey(parsed, 'HKCU\\Software\\Missing'), null);
});

test('Chrome policies are collected from the registry with HKLM taking precedence', () => {
  const p = collectPolicies([['HKLM', parseRegExport(EXPORT)], ['HKCU', parseRegExport('[HKEY_CURRENT_USER\\Software\\Policies\\Google\\Chrome]\r\n"NativeMessagingUserLevelHosts"=dword:00000001\r\n')]]);
  assert.equal(p.NativeMessagingUserLevelHosts, '0');
  assert.deepEqual(p.ExtensionInstallBlocklist, ['*']);
  assert.equal(policyProblems(p).length, 3);
});

test('the node path is read back from both launcher formats', () => {
  assert.equal(launcherNodePath('@echo off\r\nchcp 65001 >nul\r\n"C:\\Program Files\\nodejs\\node.exe" "%~dp0host.mjs"\r\n'), 'C:\\Program Files\\nodejs\\node.exe');
  const sh = macHostScript({nodePath: "/Users/o'neil/.volta/bin/node", hostPath: '/x/host.mjs', home: "/Users/o'neil"});
  assert.equal(launcherNodePath(sh), "/Users/o'neil/.volta/bin/node");
  assert.equal(launcherNodePath('garbage'), null);
});

test('school or company Chrome policies that block the extension or its host are reported', () => {
  const id = 'ongnnbhdedfhijimkccikfdbkigemkfn';
  assert.deepEqual(policyProblems({}), []);
  for (const p of [{ExtensionDeveloperModeSettings: '1'}, {DeveloperToolsAvailability: '2'}, {NativeMessagingUserLevelHosts: '0'},
    {ExtensionInstallBlocklist: ['*']}, {ExtensionInstallBlacklist: ['*']}, {ExtensionAllowedTypes: ['theme']},
    {ExtensionSettings: '{"*":{"installation_mode":"blocked"}}'}, {ExtensionSettings: `{"${id}":{"installation_mode":"blocked"}}`},
    {NativeMessagingBlocklist: ['*']}, {NativeMessagingBlacklist: ['*']}]) assert.equal(policyProblems(p).length, 1, JSON.stringify(p));
  for (const p of [{DeveloperToolsAvailability: '1'}, {ExtensionInstallBlocklist: ['*'], ExtensionInstallAllowlist: [id]}, {ExtensionInstallBlacklist: ['*'], ExtensionInstallWhitelist: [id]},
    {ExtensionAllowedTypes: ['extension', 'theme']}, {ExtensionSettings: `{"*":{"installation_mode":"blocked"},"${id}":{"installation_mode":"allowed"}}`},
    {ExtensionSettings: 'not json'}, {NativeMessagingBlocklist: ['*'], NativeMessagingAllowlist: ['com.jwsj.host']}]) assert.deepEqual(policyProblems(p), [], JSON.stringify(p));
});

test('the host line reports a missing Groq key as a failure, never as saved', () => {
  assert.deepEqual(hostLine({ok: true, configured: true}), {ok: true, detail: 'Groq 키 저장됨', fix: ''});
  assert.equal(hostLine({ok: true, configured: false}).ok, false);
  assert.equal(hostLine({ok: true, configured: false}).detail, 'Groq 키 없음');
  assert.equal(hostLine({ok: true}).detail, 'Groq 키 없음');
  assert.equal(hostLine({ok: false, error: '응답 없음(시간 초과)'}).detail, '응답 없음(시간 초과)');
});

test('the launcher keeps a node path that survives shell exit and brew upgrades', () => {
  const exists = (p) => p !== '/missing';
  assert.equal(stableNodePath('C:\\Users\\a\\AppData\\Local\\fnm_multishells\\123_456\\node.exe', {exists, realpath: () => 'C:\\Users\\a\\AppData\\Roaming\\fnm\\node-versions\\v20.11.1\\installation\\node.exe'}),
    'C:\\Users\\a\\AppData\\Roaming\\fnm\\node-versions\\v20.11.1\\installation\\node.exe');
  assert.equal(stableNodePath('/Users/a/.local/state/fnm_multishells/9_1/bin/node', {exists, realpath: () => { throw Error('gone'); }}), '/Users/a/.local/state/fnm_multishells/9_1/bin/node');
  assert.equal(stableNodePath('/opt/homebrew/Cellar/node/22.1.0/bin/node', {exists, realpath: (p) => p}), '/opt/homebrew/opt/node/bin/node');
  assert.equal(stableNodePath('/usr/local/Cellar/node@20/20.11.1/bin/node', {exists, realpath: (p) => p}), '/usr/local/opt/node@20/bin/node');
  assert.equal(stableNodePath('/opt/homebrew/Cellar/node/22.1.0/bin/node', {exists: () => false, realpath: (p) => p}), '/opt/homebrew/Cellar/node/22.1.0/bin/node');
  assert.equal(stableNodePath('C:\\Program Files\\nodejs\\node.exe', {exists, realpath: () => 'X'}), 'C:\\Program Files\\nodejs\\node.exe');
});
