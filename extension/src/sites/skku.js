// 성균관대 icampus(Canvas + LearningX) + LCMS(Xinics Commons). 공용 코어가 쓰는 학교별 값만 둔다.
// 실측 2026-10-09: 강의 목록은 canvas.skku.edu의 '강의콘텐츠' 탭 안 같은 출처 iframe(/learningx/lti/modulebuilder),
// 메타 XML은 lcms.skku.edu/viewer/ssplayer/uniplayer_support/content.php(광운대와 같은 형식),
// mp4는 vod.skku.edu(인증 없음, Range 206, moov가 파일 끝). 목록 스크립트는 content/skku-list.js.
export const SITE = Object.freeze({
  id: 'skku',
  commonsOrigin: 'https://lcms.skku.edu',
  mediaOrigins: Object.freeze(['https://vod.skku.edu']),
  downloadRoot: 'icampus요약',
  startUrl: 'https://icampus.skku.edu/',
  isListPage: u => u.hostname === 'canvas.skku.edu' && u.pathname === '/learningx/lti/modulebuilder',
  isStatusPage: u => u.hostname === 'canvas.skku.edu',
  isPlayerPage: u => u.hostname === 'lcms.skku.edu' && (/^\/em\//.test(u.pathname) || /^\/viewer\/ssplayer\//.test(u.pathname)),
  // 테스트가 이 학교 기준으로 발신자 판정을 확인할 때 쓰는 대표 주소
  examples: Object.freeze({
    list: 'https://canvas.skku.edu/learningx/lti/modulebuilder',
    status: 'https://canvas.skku.edu/courses/75207/external_tools/297',
    playerBase: 'https://lcms.skku.edu/em/',
    media: 'https://vod.skku.edu/contents7/skku100001/6aaa6b1e4a956/contents/media_files/mobile/ssmovie.mp4',
  }),
});
