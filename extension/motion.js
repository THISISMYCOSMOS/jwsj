// 설정의 '애니메이션' 끄기를 하트 애니메이션에 적용한다(ui.css가 data-motion="off"를 본다).
export function applyMotion(on) { document.documentElement.dataset.motion = on ? 'on' : 'off'; }
