// 광운대 KLAS + KWCommons(Xinics Commons). 공용 코어가 쓰는 학교별 값만 둔다.
// 목록·플레이어 콘텐츠 스크립트(content/*)와 manifest의 사이트 항목은 이 학교 전용이다.
export const SITE = Object.freeze({
  id: 'kw',
  commonsOrigin: 'https://kwcommons.kw.ac.kr', // content.php 메타 XML
  mediaOrigins: Object.freeze(['https://kwcommons.kw.ac.kr']), // progressive mp4를 받아도 되는 origin
  downloadRoot: 'KLAS요약',
  isListPage: u => u.hostname === 'klas.kw.ac.kr' && u.pathname === '/std/lis/evltn/OnlineCntntsStdPage.do',
  isStatusPage: u => u.hostname === 'klas.kw.ac.kr',
  isPlayerPage: u => u.hostname === 'kwcommons.kw.ac.kr' && (/^\/em\//.test(u.pathname) || /^\/viewer\/ssplayer\//.test(u.pathname)),
});
