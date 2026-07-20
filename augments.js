/**
 * 증강 바둑 (Augmented Baduk) - 48종 등급별 증강 카드 정의
 * 밸런스 패치 및 새로운 증강 추가를 위해 독립 파일로 분리 관리됩니다.
 */

const AUGMENT_POOL = [
    // 🟡 [유틸 & 성장] 카테고리 (16개)
    { id: 'eye_creation', category: 'growth', rarity: 'common', name: '독립된 집', desc: '1칸의 집 완성 시 경험치 +5, +5 골드 획득' },
    { id: 'corner_master', category: 'growth', rarity: 'common', name: '귀의 지배자', desc: '4개 귀 영역(3x3) 착수 시 경험치 및 골드 1.5배 획득' },
    { id: 'knight_move', category: 'growth', rarity: 'common', name: '날일자 행마', desc: '날일자(L자) 또는 3연속 행마 형성 시 경험치 +3 획득' },
    { id: 'side_master', category: 'growth', rarity: 'common', name: '변의 주인', desc: '바둑판 4개 변 영역 착수 시 경험치 +3, +5 골드 획득' },
    { id: 'bamboo_growth', category: 'growth', rarity: 'common', name: '대나무 행마', desc: '1칸 뜀 행마 형성 시 경험치 +3 획득' },
    { id: 'small_jump', category: 'growth', rarity: 'common', name: '한 칸 뜀', desc: '한 칸 뜀 착수 시 경험치 +3, +5 골드 획득' },
    { id: 'diagonal_move', category: 'growth', rarity: 'common', name: '마늘모 행마', desc: '대각선 마늘모 행마 형성 시 경험치 +2, +5 골드 획득' },
    { id: 'gold_miner', category: 'growth', rarity: 'common', name: '금광 발견', desc: '착수 시 30% 확률로 보너스 +10 골드 즉시 획득' },

    { id: 'xp_boost', category: 'growth', rarity: 'rare', name: '사석 연구', desc: '상대 돌 포획 시 획득 경험치 2배 (돌당 4 XP)' },
    { id: 'center_point', category: 'growth', rarity: 'rare', name: '대세점 천원', desc: '중앙(천원, 9x9) 및 화점 착수 시 경험치 +5, +15 골드 획득' },
    { id: 'pincer_master', category: 'growth', rarity: 'rare', name: '협공의 명수', desc: '적 돌 양쪽을 협공하는 착수 시 경험치 +5, +10 골드 획득' },
    { id: 'fast_runner', category: 'growth', rarity: 'rare', name: '쾌속 행마', desc: '매 턴 착수 시 기본 보상 경험치 +2, +5 골드 추가 지급' },

    { id: 'comeback_king', category: 'growth', rarity: 'epic', name: '역전의 발판', desc: '상대보다 레벨이 낮을 때 턴당 경험치 +4, +15 골드 획득' },
    { id: 'scholar_eye', category: 'growth', rarity: 'epic', name: '학자의 혜안', desc: '레벨업 시 증강 선택지가 3개에서 4개로 확장' },
    { id: 'wealth_master', category: 'growth', rarity: 'epic', name: '미다스의 손', desc: '착수 및 사석 포획으로 얻는 모든 골드가 2배로 증가' },

    { id: 'god_growth', category: 'growth', rarity: 'legendary', name: '신선 유람', desc: '[전설] 매 턴 XP +3, Gold +15 획득 및 매 3턴마다 고급 아이템 무료 지급' },

    // 🔴 [공격] 카테고리 (16개)
    { id: 'atari_strike', category: 'attack', rarity: 'common', name: '단수 강타', desc: '적 그룹 단수 형성 시 1턴간 상대 탈출 방해' },
    { id: 'cutting_edge', category: 'attack', rarity: 'common', name: '끊음의 일격', desc: '적 돌 끊기 착수 시 인접 적 공배 1개 제거 및 경험치 +4, +10 골드' },
    { id: 'push_stone', category: 'attack', rarity: 'common', name: '밀어내기', desc: '착수 위치 인접 적 돌 1개를 1칸 뒤로 밀어냄' },
    { id: 'attachment_hit', category: 'attack', rarity: 'common', name: '붙임의 충격', desc: '적 돌에 바짝 붙여 둘 때 인접 적 공배 1개 제거' },
    { id: 'clamp_attack', category: 'attack', rarity: 'common', name: '마늘모 찌르기', desc: '적 돌 틈새를 찌르는 마늘모 착수 시 경험치 +3 획득' },
    { id: 'peeping_tom', category: 'attack', rarity: 'common', name: '들여다보기', desc: '상대 호구 자리를 들여다볼 때 적 1턴 착수 둔화' },
    { id: 'press_down', category: 'attack', rarity: 'common', name: '누름의 압박', desc: '적 돌 위를 누르는 착수 시 경험치 +3, +5 골드 획득' },
    { id: 'wedge_in', category: 'attack', rarity: 'common', name: '끼움의 쐐기', desc: '적 두 돌 사이에 끼우는 착수 시 경험치 +4 획득' },

    { id: 'net_trap', category: 'attack', rarity: 'rare', name: '장문의 그물', desc: '적 돌 1개를 3방향 감싸 가두면 즉시 포획' },
    { id: 'double_place', category: 'attack', rarity: 'rare', name: '증바람 연사', desc: '착수 시 12% 확률로 턴이 유지되어 한 번 더 연속 착수' },
    { id: 'crushing_blow', category: 'attack', rarity: 'rare', name: '붕괴의 일격', desc: '착수 위치 인접 적 돌 1개의 공배를 즉시 1 감소시킴' },
    { id: 'crane_nest', category: 'attack', rarity: 'rare', name: '학의 둥지', desc: '적 돌 2개를 동시에 단수로 만들면 경험치 +6, +15 골드 획득' },

    { id: 'vampire', category: 'attack', rarity: 'epic', name: '생명 흡수', desc: '적 돌 포획 시 2개를 소멸 대신 내 돌 색으로 전향' },
    { id: 'cross_annihilate', category: 'attack', rarity: 'epic', name: '십자 붕괴', desc: '┼ 모양 완성 시 십자 2칸 이내의 적 돌 2개 소멸' },
    { id: 'assassination', category: 'attack', rarity: 'epic', name: '암살의 가시', desc: '단수에 걸린 적 돌 1개를 내 턴에 즉시 파괴' },

    { id: 'heavenly_strike', category: 'attack', rarity: 'legendary', name: '천벌의 일격', desc: '[전설] 착수 시 주변 3x3 안 적 돌 2개 일괄 소멸 및 사석 골드/경험치 2배 획득' },

    // 🔵 [수비 & 사활] 카테고리 (16개)
    { id: 'sanctuary_star', category: 'defense', rarity: 'common', name: '화점 안식', desc: '화점 위의 내 돌은 상대 공격 스킬 면역' },
    { id: 'emergency_liberty', category: 'defense', rarity: 'common', name: '공배 보충', desc: '내 그룹이 단수 위기 시 자동으로 공배 +1개 보충 (그룹당 1회)' },
    { id: 'uncuttable_joint', category: 'defense', rarity: 'common', name: '철벽의 이음', desc: '내 돌 그룹을 잇는 행마 시 해당 연결선 스킬 면역' },
    { id: 'solid_base', category: 'defense', rarity: 'common', name: '근거지 확보', desc: '변/귀에 2돌 연결 형성 시 해당 돌 스킬 면역' },
    { id: 'extension_shield', category: 'defense', rarity: 'common', name: '벌림의 수호', desc: '2칸 벌림 행마 시 해당 돌 1턴간 포획 방지 보호막' },
    { id: 'leaning_defense', category: 'defense', rarity: 'common', name: '기대기 방어', desc: '적 돌에 기대어 둘 때 내 공배 +1 증가' },
    { id: 'thick_shape', category: 'defense', rarity: 'common', name: '두터움의 가호', desc: '돌 3개 이상 뭉친 그룹은 소멸 스킬 피해 50% 감쇄' },
    { id: 'connection_guard', category: 'defense', rarity: 'common', name: '이음의 방패', desc: '단수 직전 그룹 연결 성공 시 경험치 +4, +10 골드 획득' },

    { id: 'ko_phantom', category: 'defense', rarity: 'rare', name: '패의 보호막', desc: '내 돌 잡힐 때 2턴간 패 착수 락 형성' },
    { id: 'phoenix_return', category: 'defense', rarity: 'rare', name: '사석 환생', desc: '내 돌 잡힐 때 35% 확률로 1턴간 봉인 지역화' },
    { id: 'dragon_tail', category: 'defense', rarity: 'rare', name: '용의 꼬리', desc: '그룹이 5개 이상 뭉치면 공배 +1 자동 추가' },
    { id: 'counter_attack', category: 'defense', rarity: 'rare', name: '반격의 가시', desc: '내 돌이 잡힐 때 상대 돌 1개도 무작위 동귀어진 파괴' },

    { id: 'two_eyes_life', category: 'defense', rarity: 'epic', name: '두 집 사활', desc: '독립된 집 2개 완성 시 연결 그룹 영구 완전 생존(포획 불가)' },
    { id: 'aegis_barrier', category: 'defense', rarity: 'epic', name: '이지스 결계', desc: '내 돌 그룹이 단수될 때마다 2턴간 포획방지 수호막 자동 생성' },
    { id: 'sanctuary_domain', category: 'defense', rarity: 'epic', name: '성역 선포', desc: '내 집 안 공간은 상대가 스킬 및 착수 불가' },

    { id: 'immortal_domain', category: 'defense', rarity: 'legendary', name: '불멸의 성역', desc: '[전설] 내 집 3개 이상 완성 시 내 모든 돌 그룹 사석 포획/스킬 파괴 완전 불멸' }
];

module.exports = AUGMENT_POOL;
