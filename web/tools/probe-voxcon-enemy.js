// 적 카테고리 voxel 게이트 — `probe-voxel-consistency.js` 머리말 규칙("카테고리 전환이 끝나면
// 그 카테고리만 잠근다")에 따라, 적 7종이 끝난 시점(2026-08-20: 접촉 음영 제외 기준 7/7 종
// 축정렬 100% · 최장축 8~19칸)에 등재한 래퍼다. 양축을 함께 건다:
//   축정렬 ≥99%(곡면 재유입 차단) + 최장축 ≤22칸(굵기 — 촘촘=매끈 재유입 차단, 상한 근거는
//   합격 프롭 대역 11~22칸. 현재 최대는 slime 19칸으로 여유 3칸).
// ⚠️ 다른 카테고리는 여기서 잠그지 말 것 — 전환이 끝날 때마다 카테고리별 래퍼를 하나씩 늘린다.
process.env.VOXCON_MIN = process.env.VOXCON_MIN || '99';
process.env.VOXCON_MAXCELLS = process.env.VOXCON_MAXCELLS || '22';
process.argv[2] = '적';
require('./probe-voxel-consistency.js');
