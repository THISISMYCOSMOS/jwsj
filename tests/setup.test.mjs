import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {validateTarget,checkSource,checkNode} from '../scripts/setup.mjs';
const root=path.resolve(import.meta.dirname,'../../installer-fixtures');
fs.mkdirSync(root,{recursive:true});
test('installer requires Node 18+ because the Groq host uses built-in fetch and FormData',()=>{
  for(const v of ['16.20.2','17.9.1','garbage'])assert.throws(()=>checkNode(v),/Node\.js 18 이상이 필요합니다/);
  for(const v of ['18.0.0','20.11.1','24.14.1'])assert.equal(checkNode(v),Number(v.split('.')[0]));
});
test('installer rejects missing bundled dependencies before installation writes',()=>{
  assert.throws(()=>checkSource(root),/설치 파일 누락/);
});
test('installer preserves an existing unowned folder',()=>{
  const folder=path.join(root,'unowned');fs.mkdirSync(folder,{recursive:true});
  assert.throws(()=>validateTarget(folder,null),/기존 파일을 보존/);
});
test('installer accepts owned update but preserves a conflicting host registration',()=>{
  const folder=path.join(root,'owned');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'.klas-summarizer-host'),'com.klas_summarizer.host');
  assert.equal(validateTarget(folder,null),path.join(folder,'com.klas_summarizer.host.json'));
  assert.throws(()=>validateTarget(folder,path.join(root,'another-host.json')),/기존 등록을 보존/);
});
