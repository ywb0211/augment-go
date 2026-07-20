/**
 * 증강 바둑 (Augmented Baduk) - 인게임 상점 아이템 정의
 * 아이템 가격, 세부 능력 및 밸런스 패치를 위해 독립 파일로 분리 관리됩니다.
 */

const SHOP_ITEMS = [
    { id: 'extra_turn', name: '연속 착수 주문서', price: 150, desc: '이번 턴에 한 번 더 연속으로 착수합니다.' },
    { id: 'target_bomb', name: '저격 폭파탄', price: 130, desc: '지정한 적 돌 1개를 즉시 파괴합니다.' },
    { id: 'position_swap', name: '위치 교환서', price: 100, desc: '내 돌 1개와 상대 돌 1개의 위치를 서로 바꿉니다.' },
    { id: 'emergency_shield', name: '긴급 공배 보호막', price: 90, desc: '선택한 내 돌 그룹에 3턴간 포획 면제 보호막을 부여합니다.' },
    { id: 'gold_elixir', name: '골드 풍요 포션', price: 70, desc: '5턴 동안 매 턴 골드 획득량이 2배가 됩니다.' },
    { id: 'atari_radar', name: '단수 레이더', price: 40, desc: '3턴 동안 단수 상태에 빠진 적 돌을 황금빛으로 강조 표시합니다.' }
];

module.exports = SHOP_ITEMS;
