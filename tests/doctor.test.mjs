import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRegValues,launcherNodePath,policyProblems} from '../scripts/doctor.mjs';
import {stableNodePath,macHostScript} from '../scripts/platform.mjs';

test('registry output is parsed in English and Korean Windows, including the default value', () => {
  const en = '\r\nHKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.klas_summarizer.host\r\n    (Default)    REG_SZ    C:\\Users\\a b\\AppData\\Local\\KlasSummarizer\\com.klas_summarizer.host.json\r\n';
  assert.equal(parseRegValues(en)[''], 'C:\\Users\\a b\\AppData\\Local\\KlasSummarizer\\com.klas_summarizer.host.json');
  const ko = '\r\nHKEY_LOCAL_MACHINE\\Software\\Policies\\Google\\Chrome\r\n    (기본값)    REG_SZ    x\r\n    NativeMessagingUserLevelHosts    REG_DWORD    0x0\r\n';
  assert.deepEqual(parseRegValues(ko), {'': 'x', NativeMessagingUserLevelHosts: '0x0'});
});

test('the node path is read back from both launcher formats', () => {
  assert.equal(launcherNodePath('@echo off\r\nchcp 65001 >nul\r\n"C:\\Program Files\\nodejs\\node.exe" "%~dp0host.mjs"\r\n'), 'C:\\Program Files\\nodejs\\node.exe');
  const sh = macHostScript({nodePath: "/Users/o'neil/.volta/bin/node", hostPath: '/x/host.mjs', home: "/Users/o'neil"});
  assert.equal(launcherNodePath(sh), "/Users/o'neil/.volta/bin/node");
  assert.equal(launcherNodePath('garbage'), null);
});

test('school or company Chrome policies that block the extension or its host are reported', () => {
  assert.deepEqual(policyProblems({}), []);
  assert.equal(policyProblems({ExtensionDeveloperModeSettings: '1'}).length, 1);
  assert.equal(policyProblems({NativeMessagingUserLevelHosts: '0'}).length, 1);
  assert.equal(policyProblems({ExtensionInstallBlocklist: ['*']}).length, 1);
  assert.deepEqual(policyProblems({ExtensionInstallBlocklist: ['*'], ExtensionInstallAllowlist: ['klihhclhnhhmldcbnkpampimkjafmbdm']}), []);
  assert.deepEqual(policyProblems({NativeMessagingBlocklist: ['*'], NativeMessagingAllowlist: ['com.klas_summarizer.host']}), []);
});

test('the launcher keeps a node path that survives shell exit and brew upgrades', () => {
  const exists = (p) => p !== '/missing';
  // fnm: per-shell temporary folder → real install path
  assert.equal(stableNodePath('C:\\Users\\a\\AppData\\Local\\fnm_multishells\\123_456\\node.exe', {exists, realpath: () => 'C:\\Users\\a\\AppData\\Roaming\\fnm\\node-versions\\v20.11.1\\installation\\node.exe'}),
    'C:\\Users\\a\\AppData\\Roaming\\fnm\\node-versions\\v20.11.1\\installation\\node.exe');
  assert.equal(stableNodePath('/Users/a/.local/state/fnm_multishells/9_1/bin/node', {exists, realpath: () => { throw Error('gone'); }}), '/Users/a/.local/state/fnm_multishells/9_1/bin/node');
  // Homebrew: versioned Cellar path → unversioned opt path
  assert.equal(stableNodePath('/opt/homebrew/Cellar/node/22.1.0/bin/node', {exists, realpath: (p) => p}), '/opt/homebrew/opt/node/bin/node');
  assert.equal(stableNodePath('/usr/local/Cellar/node@20/20.11.1/bin/node', {exists, realpath: (p) => p}), '/usr/local/opt/node@20/bin/node');
  assert.equal(stableNodePath('/opt/homebrew/Cellar/node/22.1.0/bin/node', {exists: () => false, realpath: (p) => p}), '/opt/homebrew/Cellar/node/22.1.0/bin/node');
  // ordinary installers are kept as-is
  assert.equal(stableNodePath('C:\\Program Files\\nodejs\\node.exe', {exists, realpath: () => 'X'}), 'C:\\Program Files\\nodejs\\node.exe');
});
