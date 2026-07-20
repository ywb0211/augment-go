const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const BOARD_SIZE = 19;
const MAX_LEVEL = 6;
const LEVEL_XP_REQUIREMENTS = [25, 50, 85, 130, 190];

// 사용자 상태 관리: socketId -> { id, username, nickname, wins, losses, rating, roomId }
const users = {};

// 방 상태 관리: roomId -> Room Object
const rooms = {};

// --- 48종 등급별 순수 한글 증강 정의 ---
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

const SHOP_ITEMS = [
    { id: 'extra_turn', name: '연속 착수 주문서', price: 150, desc: '이번 턴에 한 번 더 연속으로 착수합니다.' },
    { id: 'target_bomb', name: '저격 폭파탄', price: 130, desc: '지정한 적 돌 1개를 즉시 파괴합니다.' },
    { id: 'position_swap', name: '위치 교환서', price: 100, desc: '내 돌 1개와 상대 돌 1개의 위치를 서로 바꿉니다.' },
    { id: 'emergency_shield', name: '긴급 공배 보호막', price: 90, desc: '선택한 내 돌 그룹에 3턴간 포획 면제 보호막을 부여합니다.' },
    { id: 'gold_elixir', name: '골드 풍요 포션', price: 70, desc: '5턴 동안 매 턴 골드 획득량이 2배가 됩니다.' },
    { id: 'atari_radar', name: '단수 레이더', price: 40, desc: '3턴 동안 단수 상태에 빠진 적 돌을 황금빛으로 강조 표시합니다.' }
];

const STAR_POINTS = [
    [3, 3], [3, 9], [3, 15],
    [9, 3], [9, 9], [9, 15],
    [15, 3], [15, 9], [15, 15]
];

function isStarPoint(x, y) {
    return STAR_POINTS.some(([sx, sy]) => sx === x && sy === y);
}

function isCornerArea(x, y) {
    return (x <= 2 || x >= 16) && (y <= 2 || y >= 16);
}

function isSideArea(x, y) {
    return !isCornerArea(x, y) && (x === 0 || x === 18 || y === 0 || y === 18);
}

function getTargetXp(level) {
    if (level >= MAX_LEVEL) return Infinity;
    return LEVEL_XP_REQUIREMENTS[level - 1] || 200;
}

function createInitialPlayerStats() {
    return {
        black: { xp: 0, level: 1, augments: [], captured: 0, gold: 50, items: [], goldBuffTurns: 0, atariRadarTurns: 0, initialSelected: false, legendaryTurns: 0 },
        white: { xp: 0, level: 1, augments: [], captured: 0, gold: 50, items: [], goldBuffTurns: 0, atariRadarTurns: 0, initialSelected: false, legendaryTurns: 0 }
    };
}

function createInitialTimeState() {
    return {
        black: { mainTime: 300, byoYomi: 30, isByoYomi: false },
        white: { mainTime: 300, byoYomi: 30, isByoYomi: false }
    };
}

function rollRarity() {
    const rand = Math.random() * 100;
    if (rand < 1) return 'legendary'; // 1%
    if (rand < 8) return 'epic';      // 7%
    if (rand < 30) return 'rare';     // 22%
    return 'common';                  // 70%
}

function getRandomAugmentChoices(count = 3) {
    const choices = [];
    const usedIds = new Set();

    while (choices.length < count) {
        const targetRarity = rollRarity();
        const available = AUGMENT_POOL.filter(a => a.rarity === targetRarity && !usedIds.has(a.id));
        
        let selected = null;
        if (available.length > 0) {
            selected = available[Math.floor(Math.random() * available.length)];
        } else {
            const remaining = AUGMENT_POOL.filter(a => !usedIds.has(a.id));
            if (remaining.length > 0) {
                selected = remaining[Math.floor(Math.random() * remaining.length)];
            }
        }

        if (selected) {
            usedIds.add(selected.id);
            choices.push(selected);
        } else {
            break;
        }
    }

    return choices;
}

// ------------------- 어드민 모니터링 메트릭 헬퍼 ------------------- //
function getAdminServerMetrics() {
    const mem = process.memoryUsage();
    const rssMb = (mem.rss / (1024 * 1024)).toFixed(1);
    const heapUsedMb = (mem.heapUsed / (1024 * 1024)).toFixed(1);
    const heapTotalMb = (mem.heapTotal / (1024 * 1024)).toFixed(1);

    const activeUsers = Object.keys(users).length;
    const activeRooms = Object.keys(rooms).length;
    const totalRegisteredUsers = db.getUsersCount();
    const uptimeSec = Math.floor(process.uptime());

    const memPercent = Math.min(100, ((mem.rss / (512 * 1024 * 1024)) * 100).toFixed(1));

    return {
        rssMb,
        heapUsedMb,
        heapTotalMb,
        renderLimitMb: 512,
        memPercent,
        activeUsers,
        activeRooms,
        totalRegisteredUsers,
        uptimeSec
    };
}

// ------------------- 타이머 인터벌 헬퍼 ------------------- //
function startRoomTimer(room) {
    if (room.timerInterval) clearInterval(room.timerInterval);

    room.timerInterval = setInterval(() => {
        if (room.status !== 'playing') return;

        const current = room.currentTurn;
        const timeObj = room.timeState[current];

        if (!timeObj.isByoYomi) {
            timeObj.mainTime -= 1;
            if (timeObj.mainTime <= 0) {
                timeObj.mainTime = 0;
                timeObj.isByoYomi = true;
                timeObj.byoYomi = 30;
                io.to(room.id).emit('log_update', `[초읽기 경고] ${current === 'black' ? '흑' : '백'} 제한 시간 소진! 30초 초읽기로 전환됩니다.`);
            }
        } else {
            timeObj.byoYomi -= 1;
            if (timeObj.byoYomi <= 0) {
                timeObj.byoYomi = 0;
                room.status = 'finished';

                const winnerColor = current === 'black' ? 'white' : 'black';
                const winnerName = room.players[winnerColor] ? room.players[winnerColor].nickname : '상대방';
                const loserName = room.players[current] ? room.players[current].nickname : '플레이어';
                room.winner = winnerColor;

                recordGameResult(room, winnerColor);

                const logMsg = `[시간패] ${loserName}(${current === 'black' ? '흑' : '백'}) 님이 초읽기 30초를 초과하셨습니다. ${winnerName} 시간승!`;

                io.to(room.id).emit('game_over', {
                    winner: winnerColor,
                    winnerNickname: winnerName,
                    log: logMsg,
                    boardState: room.boardState,
                    stats: room.playerStats
                });
                io.to(room.id).emit('room_state_update', getRoomSanitizedState(room));
                broadcastLobbyData();
                clearInterval(room.timerInterval);
                return;
            }
        }

        io.to(room.id).emit('timer_tick', { timeState: room.timeState, currentTurn: room.currentTurn });
    }, 1000);
}

// ------------------- 전적 DB 기록 헬퍼 ------------------- //
function recordGameResult(room, winnerColor) {
    if (!room.players.black || !room.players.white) return;
    const blackUser = db.getUserByNickname(room.players.black.nickname);
    const whiteUser = db.getUserByNickname(room.players.white.nickname);

    if (winnerColor === 'black') {
        if (blackUser) db.updateUserStats(blackUser.username, true);
        if (whiteUser) db.updateUserStats(whiteUser.username, false);
    } else {
        if (blackUser) db.updateUserStats(blackUser.username, false);
        if (whiteUser) db.updateUserStats(whiteUser.username, true);
    }
}

// ------------------- 바둑 모양 및 사석 검사 ------------------- //

function checkEyeCreation(boardState, color) {
    let count = 0;
    for (let y = 1; y < BOARD_SIZE - 1; y++) {
        for (let x = 1; x < BOARD_SIZE - 1; x++) {
            if (boardState[y][x] === null) {
                if (boardState[y-1][x] === color &&
                    boardState[y+1][x] === color &&
                    boardState[y][x-1] === color &&
                    boardState[y][x+1] === color) {
                    count++;
                }
            }
        }
    }
    return count;
}

function checkKnightOrLine(boardState, x, y, color) {
    const knightOffsets = [
        [1,2], [1,-2], [-1,2], [-1,-2],
        [2,1], [2,-1], [-2,1], [-2,-1]
    ];
    for (let [dx, dy] of knightOffsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
            if (boardState[ny][nx] === color) return true;
        }
    }
    return false;
}

function checkNetTrap(boardState, x, y, myColor) {
    const enemyColor = myColor === 'black' ? 'white' : 'black';
    const adj = [[1,0], [-1,0], [0,1], [0,-1]];
    
    for (let [dx, dy] of adj) {
        const ex = x + dx;
        const ey = y + dy;
        if (ex >= 0 && ex < BOARD_SIZE && ey >= 0 && ey < BOARD_SIZE && boardState[ey][ex] === enemyColor) {
            let surroundedCount = 0;
            for (let [adx, ady] of adj) {
                const nx = ex + adx;
                const ny = ey + ady;
                if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
                    if (boardState[ny][nx] === myColor) surroundedCount++;
                }
            }
            if (surroundedCount >= 3) {
                return { x: ex, y: ey };
            }
        }
    }
    return null;
}

function checkCutMove(boardState, x, y, myColor) {
    const enemyColor = myColor === 'black' ? 'white' : 'black';
    const horizontalCut = (x > 0 && x < BOARD_SIZE - 1 && boardState[y][x-1] === enemyColor && boardState[y][x+1] === enemyColor);
    const verticalCut = (y > 0 && y < BOARD_SIZE - 1 && boardState[y-1][x] === enemyColor && boardState[y+1][x] === enemyColor);
    return horizontalCut || verticalCut;
}

function captureStones(boardState, targetColor, isVampire, augmentsList, roomLocks, roomShields) {
    const visited = Array.from(Array(BOARD_SIZE), () => Array(BOARD_SIZE).fill(false));
    let totalCaptured = 0;
    const capturerColor = targetColor === 'black' ? 'white' : 'black';

    const eyesCount = checkEyeCreation(boardState, targetColor);
    const isImmuneByTwoEyes = augmentsList.includes('two_eyes_life') && eyesCount >= 2;
    const isImmuneByImmortal = augmentsList.includes('immortal_domain') && eyesCount >= 3;

    if (isImmuneByTwoEyes || isImmuneByImmortal) {
        return 0;
    }

    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            if (boardState[y][x] === targetColor && !visited[y][x]) {
                const group = [];
                const queue = [[x, y]];
                visited[y][x] = true;
                let liberties = 0;
                let hasShield = false;

                while (queue.length > 0) {
                    const [cx, cy] = queue.shift();
                    group.push([cx, cy]);
                    if (roomShields && roomShields[`${cx},${cy}`] && roomShields[`${cx},${cy}`].turnsLeft > 0) {
                        hasShield = true;
                    }

                    const neighbors = [[cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]];
                    for (let [nx, ny] of neighbors) {
                        if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
                            if (boardState[ny][nx] === null) {
                                liberties++;
                            } else if (boardState[ny][nx] === targetColor && !visited[ny][nx]) {
                                visited[ny][nx] = true;
                                queue.push([nx, ny]);
                            }
                        }
                    }
                }

                if (hasShield) {
                    liberties = Math.max(liberties, 1);
                }

                if (liberties === 0 && augmentsList.includes('emergency_liberty')) {
                    liberties = 1;
                }

                if (liberties === 0) {
                    totalCaptured += group.length;
                    let flippedCount = 0;
                    const maxFlip = augmentsList.includes('vampire') ? 2 : 0;
                    for (let [gx, gy] of group) {
                        if (maxFlip > 0 && flippedCount < maxFlip) {
                            boardState[gy][gx] = capturerColor;
                            flippedCount++;
                        } else {
                            boardState[gy][gx] = null;
                            if (augmentsList.includes('ko_phantom')) {
                                roomLocks[`${gx},${gy}`] = { owner: capturerColor, turnsLeft: 2 };
                            } else if (augmentsList.includes('phoenix_return') && Math.random() < 0.35) {
                                roomLocks[`${gx},${gy}`] = { owner: capturerColor, turnsLeft: 1 };
                            }
                        }
                    }
                }
            }
        }
    }
    return totalCaptured;
}

function countStones(boardState, color) {
    let count = 0;
    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            if (boardState[y][x] === color) count++;
        }
    }
    return count;
}

function getLobbyData() {
    const userList = Object.values(users).map(u => ({
        id: u.id,
        nickname: u.nickname,
        wins: u.wins || 0,
        losses: u.losses || 0,
        rating: u.rating || 1000,
        roomId: u.roomId
    }));

    const roomList = Object.values(rooms).map(r => {
        let playerNum = 0;
        if (r.players.black) playerNum++;
        if (r.players.white) playerNum++;
        return {
            id: r.id,
            title: r.title,
            hostNickname: r.hostNickname,
            playerCount: playerNum,
            spectatorCount: r.spectators.length,
            status: r.status
        };
    });

    return { users: userList, rooms: roomList };
}

function broadcastLobbyData() {
    io.emit('lobby_update', getLobbyData());

    // 어드민 사용자(mini4950)에게 실시간 서버 메모리 및 용량 브로드캐스트
    Object.values(users).forEach(u => {
        if (u.username === 'mini4950') {
            io.to(u.id).emit('admin_metrics_update', getAdminServerMetrics());
        }
    });
}

function leaveUserFromRoom(socketId) {
    const user = users[socketId];
    if (!user || !user.roomId) return;

    const roomId = user.roomId;
    const room = rooms[roomId];
    user.roomId = null;

    if (!room) return;

    let roleLeft = null;
    if (room.players.black && room.players.black.socketId === socketId) {
        room.players.black = null;
        roleLeft = '흑';
    } else if (room.players.white && room.players.white.socketId === socket.id) {
        room.players.white = null;
        roleLeft = '백';
    } else {
        room.spectators = room.spectators.filter(s => s.socketId !== socketId);
        roleLeft = '관전자';
    }

    const hasPlayers = room.players.black || room.players.white;
    const hasSpectators = room.spectators.length > 0;

    if (!hasPlayers && !hasSpectators) {
        if (room.timerInterval) clearInterval(room.timerInterval);
        delete rooms[roomId];
    } else {
        io.to(roomId).emit('room_state_update', getRoomSanitizedState(room));
        io.to(roomId).emit('log_update', `${user.nickname} (${roleLeft}) 님이 퇴장하셨습니다.`);
    }

    broadcastLobbyData();
}

function getRoomSanitizedState(room) {
    return {
        id: room.id,
        title: room.title,
        hostNickname: room.hostNickname,
        players: room.players,
        spectators: room.spectators,
        currentTurn: room.currentTurn,
        boardState: room.boardState,
        playerStats: room.playerStats,
        timeState: room.timeState,
        shields: room.shields || {},
        locks: room.locks || {},
        status: room.status,
        winner: room.winner || null,
        consecutivePasses: room.consecutivePasses || 0
    };
}

function startInitialAugmentPhase(room) {
    room.status = 'selecting_augment';
    
    if (room.players.black) {
        const count = room.playerStats.black.augments.includes('scholar_eye') ? 4 : 3;
        const blackChoices = getRandomAugmentChoices(count);
        io.to(room.players.black.socketId).emit('initial_augment_options', { choices: blackChoices });
    }
    if (room.players.white) {
        const count = room.playerStats.white.augments.includes('scholar_eye') ? 4 : 3;
        const whiteChoices = getRandomAugmentChoices(count);
        io.to(room.players.white.socketId).emit('initial_augment_options', { choices: whiteChoices });
    }

    io.to(room.id).emit('room_state_update', getRoomSanitizedState(room));
    io.to(room.id).emit('log_update', '대국이 시작됩니다! 두 플레이어는 시작 증강 능력을 선택하세요.');
}

io.on('connection', (socket) => {

    // 1. 회원가입
    socket.on('register_account', (data, callback) => {
        const { username, password, nickname } = data || {};
        if (!username || !password || !nickname) {
            if (typeof callback === 'function') callback({ success: false, message: '모든 항목을 입력해 주세요.' });
            return;
        }
        const result = db.registerUser(username.trim(), password, nickname.trim());
        if (typeof callback === 'function') callback(result);
    });

    // 2. 로그인
    socket.on('login_account', (data, callback) => {
        const { username, password } = data || {};
        if (!username || !password) {
            if (typeof callback === 'function') callback({ success: false, message: '아이디와 비밀번호를 입력해 주세요.' });
            return;
        }

        const result = db.loginUser(username.trim(), password);
        if (!result.success) {
            if (typeof callback === 'function') callback(result);
            return;
        }

        const userObj = result.user;
        users[socket.id] = {
            id: socket.id,
            username: userObj.username,
            nickname: userObj.nickname,
            wins: userObj.wins,
            losses: userObj.losses,
            rating: userObj.rating,
            roomId: null
        };

        // 대국 진행 중 30초 내 재접속 세션 복구 확인
        let reconnectedRoom = null;
        let reconnectedRole = null;

        for (let rId in rooms) {
            const r = rooms[rId];
            if (r.status === 'playing' || r.status === 'selecting_augment') {
                if (r.players.black && r.players.black.nickname === userObj.nickname && r.players.black.disconnected) {
                    reconnectedRoom = r;
                    reconnectedRole = 'black';
                    r.players.black.socketId = socket.id;
                    r.players.black.disconnected = false;
                } else if (r.players.white && r.players.white.nickname === userObj.nickname && r.players.white.disconnected) {
                    reconnectedRoom = r;
                    reconnectedRole = 'white';
                    r.players.white.socketId = socket.id;
                    r.players.white.disconnected = false;
                }
            }
        }

        if (reconnectedRoom) {
            users[socket.id].roomId = reconnectedRoom.id;
            socket.join(reconnectedRoom.id);

            if (reconnectedRoom.disconnectTimers && reconnectedRoom.disconnectTimers[reconnectedRole]) {
                clearTimeout(reconnectedRoom.disconnectTimers[reconnectedRole]);
                delete reconnectedRoom.disconnectTimers[reconnectedRole];
            }

            const roleKor = reconnectedRole === 'black' ? '흑' : '백';
            io.to(reconnectedRoom.id).emit('log_update', `[재접속 성공] ${userObj.nickname}(${roleKor}) 님이 대국실로 돌아왔습니다! 대국을 계속합니다.`);
            io.to(reconnectedRoom.id).emit('room_state_update', getRoomSanitizedState(reconnectedRoom));

            if (typeof callback === 'function') {
                callback({
                    success: true,
                    user: userObj,
                    reconnected: true,
                    role: reconnectedRole,
                    roomState: getRoomSanitizedState(reconnectedRoom),
                    shopItems: SHOP_ITEMS
                });
            }
            broadcastLobbyData();
            return;
        }

        const isAdmin = userObj.username === 'mini4950';

        if (typeof callback === 'function') {
            callback({
                success: true,
                user: userObj,
                isAdmin: isAdmin,
                adminMetrics: isAdmin ? getAdminServerMetrics() : null,
                lobbyData: getLobbyData(),
                shopItems: SHOP_ITEMS
            });
        }
        broadcastLobbyData();
    });

    // 3. 방 생성
    socket.on('create_room', (data, callback) => {
        const user = users[socket.id];
        if (!user) {
            if (typeof callback === 'function') callback({ success: false, message: '로그인이 필요합니다.' });
            return;
        }

        if (user.roomId) {
            leaveUserFromRoom(socket.id);
        }

        const roomId = `room_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const title = (data && data.title && data.title.trim())
            ? data.title.trim()
            : `${user.nickname}님의 대국실`;

        const newRoom = {
            id: roomId,
            title: title,
            hostId: socket.id,
            hostNickname: user.nickname,
            players: {
                black: { socketId: socket.id, nickname: user.nickname, disconnected: false },
                white: null
            },
            spectators: [],
            currentTurn: 'black',
            boardState: Array.from(Array(BOARD_SIZE), () => Array(BOARD_SIZE).fill(null)),
            playerStats: createInitialPlayerStats(),
            timeState: createInitialTimeState(),
            disconnectTimers: {},
            shields: {},
            locks: {},
            consecutivePasses: 0,
            status: 'waiting',
            winner: null
        };

        rooms[roomId] = newRoom;
        user.roomId = roomId;
        socket.join(roomId);

        if (typeof callback === 'function') {
            callback({ success: true, role: 'black', roomState: getRoomSanitizedState(newRoom) });
        }

        broadcastLobbyData();
    });

    // 4. 방 입장
    socket.on('join_room', (data, callback) => {
        const user = users[socket.id];
        if (!user) {
            if (typeof callback === 'function') callback({ success: false, message: '로그인이 필요합니다.' });
            return;
        }

        const roomId = data.roomId;
        const room = rooms[roomId];
        if (!room) {
            if (typeof callback === 'function') callback({ success: false, message: '존재하지 않는 방입니다.' });
            return;
        }

        if (user.roomId) {
            leaveUserFromRoom(socket.id);
        }

        let role = 'spectator';
        if (!room.players.black) {
            room.players.black = { socketId: socket.id, nickname: user.nickname, disconnected: false };
            role = 'black';
        } else if (!room.players.white) {
            room.players.white = { socketId: socket.id, nickname: user.nickname, disconnected: false };
            role = 'white';
        } else {
            room.spectators.push({ socketId: socket.id, nickname: user.nickname });
            role = 'spectator';
        }

        user.roomId = roomId;
        socket.join(roomId);

        if (room.players.black && room.players.white && room.status === 'waiting') {
            startInitialAugmentPhase(room);
        } else {
            io.to(roomId).emit('room_state_update', getRoomSanitizedState(room));
            io.to(roomId).emit('log_update', `${user.nickname} 님이 ${role === 'black' ? '흑' : role === 'white' ? '백' : '관전자'}(으)로 입장하셨습니다.`);
        }

        if (typeof callback === 'function') {
            callback({ success: true, role, roomState: getRoomSanitizedState(room) });
        }

        broadcastLobbyData();
    });

    // 5. 시작 증강 선택
    socket.on('select_initial_augment', (data) => {
        const user = users[socket.id];
        if (!user || !user.roomId) return;

        const room = rooms[user.roomId];
        if (!room || room.status !== 'selecting_augment') return;

        let color = null;
        if (room.players.black && room.players.black.socketId === socket.id) color = 'black';
        if (room.players.white && room.players.white.socketId === socket.id) color = 'white';

        if (!color) return;

        const { augmentId } = data;
        const augmentObj = AUGMENT_POOL.find(a => a.id === augmentId);
        const augmentName = augmentObj ? augmentObj.name : augmentId;

        if (!room.playerStats[color].augments.includes(augmentId)) {
            room.playerStats[color].augments.push(augmentId);
            room.playerStats[color].initialSelected = true;
            const colorKor = color === 'black' ? '흑' : '백';
            io.to(room.id).emit('log_update', `${user.nickname}(${colorKor}) 님이 시작 증강 [${augmentName}]을(를) 선택했습니다.`);
        }

        if (room.playerStats.black.initialSelected && room.playerStats.white.initialSelected) {
            room.status = 'playing';
            startRoomTimer(room);
            io.to(room.id).emit('log_update', '양측 시작 증강 선택 완료! 흑의 선공으로 대국 및 제한시간이 시작됩니다.');
        }

        io.to(room.id).emit('room_state_update', getRoomSanitizedState(room));
    });

    // 6. 아이템 구매
    socket.on('buy_item', (data, callback) => {
        const user = users[socket.id];
        if (!user || !user.roomId) return;

        const room = rooms[user.roomId];
        if (!room) return;

        let color = null;
        if (room.players.black && room.players.black.socketId === socket.id) color = 'black';
        if (room.players.white && room.players.white.socketId === socket.id) color = 'white';

        if (!color) {
            if (typeof callback === 'function') callback({ success: false, message: '플레이어만 상점을 이용할 수 있습니다.' });
            return;
        }

        const { itemId } = data;
        const itemObj = SHOP_ITEMS.find(i => i.id === itemId);
        if (!itemObj) {
            if (typeof callback === 'function') callback({ success: false, message: '존재하지 않는 아이템입니다.' });
            return;
        }

        const stats = room.playerStats[color];
        if (stats.items.length >= 3) {
            if (typeof callback === 'function') callback({ success: false, message: '인벤토리(최대 3슬롯)가 가득 찼습니다.' });
            return;
        }

        if (stats.gold < itemObj.price) {
            if (typeof callback === 'function') callback({ success: false, message: '골드가 부족합니다.' });
            return;
        }

        stats.gold -= itemObj.price;
        stats.items.push(itemObj.id);

        const colorKor = color === 'black' ? '흑' : '백';
        io.to(room.id).emit('log_update', `${user.nickname}(${colorKor}) 님이 상점에서 [${itemObj.name}]을(를) 구매하셨습니다.`);
        io.to(room.id).emit('room_state_update', getRoomSanitizedState(room));

        if (typeof callback === 'function') callback({ success: true, message: `${itemObj.name} 구매 완료!` });
    });

    // 7. 아이템 사용
    socket.on('use_item', (data, callback) => {
        const user = users[socket.id];
        if (!user || !user.roomId) return;

        const room = rooms[user.roomId];
        if (!room || room.status !== 'playing') return;

        let color = null;
        if (room.players.black && room.players.black.socketId === socket.id) color = 'black';
        if (room.players.white && room.players.white.socketId === socket.id) color = 'white';

        if (!color || color !== room.currentTurn) {
            if (typeof callback === 'function') callback({ success: false, message: '본인 턴일 때만 아이템을 사용할 수 있습니다.' });
            return;
        }

        const { itemId, targetPos, swapPos } = data;
        const stats = room.playerStats[color];
        const itemIndex = stats.items.indexOf(itemId);

        if (itemIndex === -1) {
            if (typeof callback === 'function') callback({ success: false, message: '해당 아이템을 소지하고 있지 않습니다.' });
            return;
        }

        const colorKor = color === 'black' ? '흑' : '백';
        const enemyColor = color === 'black' ? 'white' : 'black';
        let logMsg = `${user.nickname}(${colorKor}) 님이 아이템 사용: `;

        if (itemId === 'extra_turn') {
            logMsg += `[연속 착수 주문서] 이번 턴에 한 번 더 연속으로 착수합니다!`;
            stats.items.splice(itemIndex, 1);
            io.to(room.id).emit('log_update', logMsg);
            io.to(room.id).emit('room_state_update', getRoomSanitizedState(room));
            if (typeof callback === 'function') callback({ success: true });
            return;
        }

        if (itemId === 'target_bomb') {
            if (!targetPos) {
                if (typeof callback === 'function') callback({ success: false, message: '파괴할 상대 돌을 선택해 주세요.' });
                return;
            }
            const { x, y } = targetPos;
            if (room.boardState[y][x] !== enemyColor) {
                if (typeof callback === 'function') callback({ success: false, message: '상대방의 돌 위치를 선택해 주세요.' });
                return;
            }
            room.boardState[y][x] = null;
            stats.items.splice(itemIndex, 1);
            logMsg += `[저격 폭파탄] (${x}, ${y}) 위치의 적 돌을 폭파했습니다!`;
            io.to(room.id).emit('stone_placed', {
                boardState: room.boardState,
                nextTurn: room.currentTurn,
                stats: room.playerStats,
                timeState: room.timeState,
                shields: room.shields,
                locks: room.locks,
                log: logMsg
            });
            if (typeof callback === 'function') callback({ success: true });
            return;
        }

        if (itemId === 'position_swap') {
            if (!targetPos || !swapPos) {
                if (typeof callback === 'function') callback({ success: false, message: '교환할 내 돌과 상대 돌을 선택해 주세요.' });
                return;
            }
            const myStone = targetPos;
            const enemyStone = swapPos;

            if (room.boardState[myStone.y][myStone.x] !== color || room.boardState[enemyStone.y][enemyStone.x] !== enemyColor) {
                if (typeof callback === 'function') callback({ success: false, message: '내 돌과 상대 돌 위치가 올바르지 않습니다.' });
                return;
            }

            room.boardState[myStone.y][myStone.x] = enemyColor;
            room.boardState[enemyStone.y][enemyStone.x] = color;
            stats.items.splice(itemIndex, 1);
            logMsg += `[위치 교환서] 내 돌(${myStone.x}, ${myStone.y})과 상대 돌(${enemyStone.x}, ${enemyStone.y})의 위치를 교환했습니다!`;

            io.to(room.id).emit('stone_placed', {
                boardState: room.boardState,
                nextTurn: room.currentTurn,
                stats: room.playerStats,
                timeState: room.timeState,
                shields: room.shields,
                locks: room.locks,
                log: logMsg
            });
            if (typeof callback === 'function') callback({ success: true });
            return;
        }

        if (itemId === 'emergency_shield') {
            if (!targetPos) {
                if (typeof callback === 'function') callback({ success: false, message: '보호막을 적용할 내 돌 위치를 선택해 주세요.' });
                return;
            }
            const { x, y } = targetPos;
            if (room.boardState[y][x] !== color) {
                if (typeof callback === 'function') callback({ success: false, message: '내 돌이 있는 위치를 선택해 주세요.' });
                return;
            }
            room.shields[`${x},${y}`] = { owner: color, turnsLeft: 3 };
            stats.items.splice(itemIndex, 1);
            logMsg += `[긴급 공배 보호막] (${x}, ${y}) 위치의 돌 그룹에 3턴간 수호막을 부여했습니다!`;

            io.to(room.id).emit('stone_placed', {
                boardState: room.boardState,
                nextTurn: room.currentTurn,
                stats: room.playerStats,
                timeState: room.timeState,
                shields: room.shields,
                locks: room.locks,
                log: logMsg
            });
            if (typeof callback === 'function') callback({ success: true });
            return;
        }

        if (itemId === 'gold_elixir') {
            stats.goldBuffTurns = 5;
            stats.items.splice(itemIndex, 1);
            logMsg += `[골드 풍요 포션] 향후 5턴 동안 턴당 골드 획득량이 2배(+10 골드)가 됩니다!`;
            io.to(room.id).emit('log_update', logMsg);
            io.to(room.id).emit('room_state_update', getRoomSanitizedState(room));
            if (typeof callback === 'function') callback({ success: true });
            return;
        }

        if (itemId === 'atari_radar') {
            stats.atariRadarTurns = 3;
            stats.items.splice(itemIndex, 1);
            logMsg += `[단수 레이더] 향후 3턴 동안 단수 상태의 적 돌을 레이더로 탐지합니다!`;
            io.to(room.id).emit('log_update', logMsg);
            io.to(room.id).emit('room_state_update', getRoomSanitizedState(room));
            if (typeof callback === 'function') callback({ success: true });
            return;
        }
    });

    // 8. 방 퇴장
    socket.on('leave_room', (callback) => {
        const user = users[socket.id];
        if (user && user.roomId) {
            socket.leave(user.roomId);
            leaveUserFromRoom(socket.id);
        }
        if (typeof callback === 'function') {
            callback({ success: true });
        }
    });

    // 9. 패스 (pass_turn)
    socket.on('pass_turn', () => {
        const user = users[socket.id];
        if (!user || !user.roomId) return;

        const room = rooms[user.roomId];
        if (!room || room.status !== 'playing') return;

        let color = null;
        if (room.players.black && room.players.black.socketId === socket.id) color = 'black';
        if (room.players.white && room.players.white.socketId === socket.id) color = 'white';

        if (!color || color !== room.currentTurn) return;

        const colorKor = color === 'black' ? '흑' : '백';
        const enemyColor = color === 'black' ? 'white' : 'black';

        room.consecutivePasses += 1;
        let logMsg = `${user.nickname}(${colorKor}) 님이 패스를 했습니다.`;

        if (room.timeState[color].isByoYomi) {
            room.timeState[color].byoYomi = 30;
        }

        if (room.consecutivePasses >= 2) {
            room.status = 'finished';
            if (room.timerInterval) clearInterval(room.timerInterval);

            const blackScore = countStones(room.boardState, 'black') + room.playerStats.black.captured;
            const whiteScore = countStones(room.boardState, 'white') + room.playerStats.white.captured + 6.5;

            let winner = blackScore > whiteScore ? 'black' : 'white';
            let winnerNickname = winner === 'black' ? room.players.black.nickname : room.players.white.nickname;
            room.winner = winner;

            recordGameResult(room, winner);

            logMsg += ` [양측 패스 -> 계가 완료] 흑: ${blackScore}점 / 백: ${whiteScore}점 (덤 6.5) -> ${winnerNickname} 승리!`;

            io.to(room.id).emit('game_over', {
                winner: winner,
                winnerNickname: winnerNickname,
                log: logMsg,
                boardState: room.boardState,
                stats: room.playerStats
            });
            io.to(room.id).emit('room_state_update', getRoomSanitizedState(room));
            broadcastLobbyData();
            return;
        }

        room.currentTurn = enemyColor;

        io.to(room.id).emit('stone_placed', {
            boardState: room.boardState,
            nextTurn: room.currentTurn,
            stats: room.playerStats,
            timeState: room.timeState,
            shields: room.shields,
            locks: room.locks,
            log: logMsg
        });
    });

    // 10. 기권 (resign)
    socket.on('resign', () => {
        const user = users[socket.id];
        if (!user || !user.roomId) return;

        const room = rooms[user.roomId];
        if (!room || room.status !== 'playing') return;

        let color = null;
        if (room.players.black && room.players.black.socketId === socket.id) color = 'black';
        if (room.players.white && room.players.white.socketId === socket.id) color = 'white';

        if (!color) return;

        const enemyColor = color === 'black' ? 'white' : 'black';
        const winnerNickname = room.players[enemyColor] ? room.players[enemyColor].nickname : '상대방';

        room.status = 'finished';
        room.winner = enemyColor;
        if (room.timerInterval) clearInterval(room.timerInterval);

        recordGameResult(room, enemyColor);

        const colorKor = color === 'black' ? '흑' : '백';
        const logMsg = `${user.nickname}(${colorKor}) 님이 기권하셨습니다. ${winnerNickname} 불계승!`;

        io.to(room.id).emit('game_over', {
            winner: enemyColor,
            winnerNickname: winnerNickname,
            log: logMsg,
            boardState: room.boardState,
            stats: room.playerStats
        });
        io.to(room.id).emit('room_state_update', getRoomSanitizedState(room));
        broadcastLobbyData();
    });

    // 11. 착수 (place_stone) 및 초읽기 리셋
    socket.on('place_stone', (data) => {
        const user = users[socket.id];
        if (!user || !user.roomId) return;

        const room = rooms[user.roomId];
        if (!room || room.status !== 'playing') return;

        let color = null;
        if (room.players.black && room.players.black.socketId === socket.id) color = 'black';
        if (room.players.white && room.players.white.socketId === socket.id) color = 'white';

        if (!color || color !== room.currentTurn) return;

        const { x, y } = data;
        if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;
        if (room.boardState[y][x] !== null) return;

        const lockKey = `${x},${y}`;
        if (room.locks[lockKey] && room.locks[lockKey].turnsLeft > 0) {
            socket.emit('log_update', '패 보호막이 작동 중인 위치에는 착수할 수 없습니다!');
            return;
        }

        if (room.timeState[color].isByoYomi) {
            room.timeState[color].byoYomi = 30;
        }

        room.consecutivePasses = 0;
        room.boardState[y][x] = color;

        Object.keys(room.locks).forEach(k => {
            room.locks[k].turnsLeft -= 1;
            if (room.locks[k].turnsLeft <= 0) delete room.locks[k];
        });
        Object.keys(room.shields).forEach(k => {
            if (room.shields[k].turnsLeft) {
                room.shields[k].turnsLeft -= 1;
                if (room.shields[k].turnsLeft <= 0) delete room.shields[k];
            }
        });

        const myStats = room.playerStats[color];
        let baseGoldGained = myStats.goldBuffTurns > 0 ? 10 : 5;
        if (myStats.augments.includes('wealth_master')) baseGoldGained *= 2;
        if (myStats.augments.includes('gold_miner') && Math.random() < 0.3) baseGoldGained += 10;

        if (myStats.goldBuffTurns > 0) myStats.goldBuffTurns -= 1;
        if (myStats.atariRadarTurns > 0) myStats.atariRadarTurns -= 1;
        myStats.gold += baseGoldGained;

        const colorKor = color === 'black' ? '흑' : '백';
        const enemyColor = color === 'black' ? 'white' : 'black';
        let logMessage = `${user.nickname}(${colorKor}) 님이 (${x}, ${y}) 위치에 착수했습니다. (+${baseGoldGained} 골드)`;
        const myAugments = myStats.augments;
        const enemyAugments = room.playerStats[enemyColor].augments;

        if (myAugments.includes('god_growth')) {
            myStats.xp += 3;
            myStats.gold += 15;
            myStats.legendaryTurns = (myStats.legendaryTurns || 0) + 1;
            if (myStats.legendaryTurns % 3 === 0 && myStats.items.length < 3) {
                const randomItem = SHOP_ITEMS[Math.floor(Math.random() * SHOP_ITEMS.length)];
                myStats.items.push(randomItem.id);
                logMessage += ` [전설] 신선 유람 발동! (+3 XP, +15 골드 및 무료 ${randomItem.name} 획득)`;
            }
        }

        if (myAugments.includes('eye_creation')) {
            const eyeCount = checkEyeCreation(room.boardState, color);
            if (eyeCount > 0) {
                const bonusXp = eyeCount * 5;
                myStats.xp += bonusXp;
                myStats.gold += 5;
                logMessage += ` [증강] 독립된 집(${eyeCount}개) 완성! (+${bonusXp} XP, +5 골드)`;
            }
        }

        let cornerMultiplier = (myAugments.includes('corner_master') && isCornerArea(x, y)) ? 1.5 : 1;

        if (myAugments.includes('side_master') && isSideArea(x, y)) {
            myStats.xp += Math.floor(3 * cornerMultiplier);
            myStats.gold += 5;
            logMessage += ` [증강] 변 영역 착수! (+${Math.floor(3 * cornerMultiplier)} XP, +5 골드)`;
        }

        if (myAugments.includes('knight_move') && checkKnightOrLine(room.boardState, x, y, color)) {
            myStats.xp += Math.floor(3 * cornerMultiplier);
            logMessage += ` [증강] 날일자 행마! (+${Math.floor(3 * cornerMultiplier)} XP)`;
        }

        if (myAugments.includes('center_point') && (isStarPoint(x, y) || (x === 9 && y === 9))) {
            myStats.xp += Math.floor(5 * cornerMultiplier);
            myStats.gold += 15;
            logMessage += ` [증강] 대세점 착수! (+${Math.floor(5 * cornerMultiplier)} XP, +15 골드)`;
        }

        if (myAugments.includes('fast_runner')) {
            myStats.xp += 2;
            myStats.gold += 5;
        }

        if (myAugments.includes('cutting_edge') && checkCutMove(room.boardState, x, y, color)) {
            myStats.xp += Math.floor(4 * cornerMultiplier);
            myStats.gold += 10;
            logMessage += ` [증강] 끊음의 일격! 적 차단 완료 (+${Math.floor(4 * cornerMultiplier)} XP, +10 골드)`;
        }

        if (myAugments.includes('net_trap')) {
            const trappedTarget = checkNetTrap(room.boardState, x, y, color);
            if (trappedTarget) {
                const isSanctuary = enemyAugments.includes('sanctuary_star') && isStarPoint(trappedTarget.x, trappedTarget.y);
                if (!isSanctuary) {
                    room.boardState[trappedTarget.y][trappedTarget.x] = null;
                    myStats.captured += 1;
                    myStats.gold += 15;
                    logMessage += ` [증강] 장문의 그물! 적 돌 포획 완료 (+15 골드)`;
                }
            }
        }

        if (myAugments.includes('push_stone')) {
            const adj = [[1,0], [-1,0], [0,1], [0,-1]];
            for (let [dx, dy] of adj) {
                const ex = x + dx;
                const ey = y + dy;
                if (ex >= 0 && ex < BOARD_SIZE && ey >= 0 && ey < BOARD_SIZE && room.boardState[ey][ex] === enemyColor) {
                    const isSanctuary = enemyAugments.includes('sanctuary_star') && isStarPoint(ex, ey);
                    if (!isSanctuary) {
                        const pushX = ex + dx;
                        const pushY = ey + dy;
                        if (pushX >= 0 && pushX < BOARD_SIZE && pushY >= 0 && pushY < BOARD_SIZE && room.boardState[pushY][pushX] === null) {
                            room.boardState[pushY][pushX] = enemyColor;
                            room.boardState[ey][ex] = null;
                            logMessage += ` [증강] 밀어내기! 적 돌을 (${pushX}, ${pushY})로 밀어냈습니다.`;
                            break;
                        }
                    }
                }
            }
        }

        if (myAugments.includes('heavenly_strike')) {
            let destroyed = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const ny = y + dy;
                    const nx = x + dx;
                    if (ny >= 0 && ny < BOARD_SIZE && nx >= 0 && nx < BOARD_SIZE) {
                        if (room.boardState[ny][nx] === enemyColor && destroyed < 2) {
                            room.boardState[ny][nx] = null;
                            destroyed++;
                        }
                    }
                }
            }
            if (destroyed > 0) {
                myStats.captured += destroyed * 2;
                myStats.gold += destroyed * 30;
                logMessage += ` [전설] 천벌의 일격! 주변 적 돌 ${destroyed}개를 파괴했습니다! (+${destroyed * 30} 골드)`;
            }
        }

        const isVampire = myAugments.includes('vampire');
        const capturedCount = captureStones(room.boardState, enemyColor, isVampire, enemyAugments, room.locks, room.shields);
        
        if (capturedCount > 0) {
            myStats.captured += capturedCount;
            let goldGainedFromCaptures = capturedCount * 15;
            if (myAugments.includes('wealth_master')) goldGainedFromCaptures *= 2;
            myStats.gold += goldGainedFromCaptures;

            const gainPerStone = (myAugments.includes('xp_boost') ? 4 : 2) * cornerMultiplier;
            const xpGained = Math.floor(capturedCount * gainPerStone);
            myStats.xp += xpGained;
            logMessage += ` [사석 포획] 적 돌 ${capturedCount}개를 잡았습니다! (+${xpGained} XP, +${goldGainedFromCaptures} 골드)`;
        } else {
            const selfCapturedCount = captureStones(room.boardState, color, false, [], room.locks, room.shields);
            if (selfCapturedCount > 0) {
                room.playerStats[enemyColor].captured += selfCapturedCount;
                room.playerStats[enemyColor].gold += selfCapturedCount * 15;
                const enemyXpGained = selfCapturedCount * 2;
                room.playerStats[enemyColor].xp += enemyXpGained;
                logMessage += ` [자충수] 공배(0개)가 없는 곳에 착수하여 돌 ${selfCapturedCount}개가 상대에게 즉시 포획되었습니다!`;
            }
        }

        if (myStats.level < MAX_LEVEL) {
            myStats.xp += Math.floor(1 * cornerMultiplier);
            let targetXp = getTargetXp(myStats.level);
            if (myStats.xp >= targetXp) {
                myStats.level += 1;
                const count = myStats.augments.includes('scholar_eye') ? 4 : 3;
                const choices = getRandomAugmentChoices(count);
                socket.emit('level_up', { level: myStats.level, choices });
            }
        }

        if (myAugments.includes('comeback_king') &&
            myStats.level < room.playerStats[enemyColor].level) {
            myStats.xp += 4;
            myStats.gold += 15;
            logMessage += ` [역전의 발판] 보너스 경험치 +4, +15 골드 획득.`;
        }

        let doubleChance = myAugments.includes('double_place') ? 0.12 : 0;
        if (Math.random() >= doubleChance) {
            room.currentTurn = enemyColor;
        } else {
            logMessage += ` [증강] 증바람 연사! 턴이 유지되어 한 번 더 착수합니다.`;
        }

        io.to(room.id).emit('stone_placed', {
            boardState: room.boardState,
            nextTurn: room.currentTurn,
            stats: room.playerStats,
            timeState: room.timeState,
            shields: room.shields,
            locks: room.locks,
            log: logMessage
        });
    });

    // 12. 일반 증강 선택
    socket.on('select_augment', (data) => {
        const user = users[socket.id];
        if (!user || !user.roomId) return;

        const room = rooms[user.roomId];
        if (!room) return;

        let color = null;
        if (room.players.black && room.players.black.socketId === socket.id) color = 'black';
        if (room.players.white && room.players.white.socketId === socket.id) color = 'white';

        if (!color) return;

        const { augmentId } = data;
        const augmentObj = AUGMENT_POOL.find(a => a.id === augmentId);
        const augmentName = augmentObj ? augmentObj.name : augmentId;

        if (room.playerStats[color] && !room.playerStats[color].augments.includes(augmentId)) {
            room.playerStats[color].augments.push(augmentId);
            const colorKor = color === 'black' ? '흑' : '백';
            io.to(room.id).emit('log_update', `${user.nickname}(${colorKor}) 님이 증강 [${augmentName}]을(를) 선택했습니다.`);
            io.to(room.id).emit('room_state_update', getRoomSanitizedState(room));
        }
    });

    // 13. 연결 해제 및 30초 재접속 유예 타임아웃
    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user && user.roomId) {
            const room = rooms[user.roomId];
            if (room && (room.status === 'playing' || room.status === 'selecting_augment')) {
                let role = null;
                if (room.players.black && room.players.black.socketId === socket.id) role = 'black';
                if (room.players.white && room.players.white.socketId === socket.id) role = 'white';

                if (role) {
                    const roleKor = role === 'black' ? '흑' : '백';
                    room.players[role].disconnected = true;
                    
                    io.to(room.id).emit('log_update', `[연결 끊김] ${user.nickname}(${roleKor}) 님의 연결이 끊어졌습니다! 30초 이내에 재접속하지 않으면 몰수패(기권패) 처리됩니다.`);

                    if (!room.disconnectTimers) room.disconnectTimers = {};
                    if (room.disconnectTimers[role]) clearTimeout(room.disconnectTimers[role]);

                    room.disconnectTimers[role] = setTimeout(() => {
                        if (room.status === 'playing' || room.status === 'selecting_augment') {
                            const enemyRole = role === 'black' ? 'white' : 'black';
                            const winnerName = room.players[enemyRole] ? room.players[enemyRole].nickname : '상대방';

                            room.status = 'finished';
                            room.winner = enemyRole;
                            if (room.timerInterval) clearInterval(room.timerInterval);

                            recordGameResult(room, enemyRole);

                            const logMsg = `[몰수패] ${user.nickname}(${roleKor}) 님이 30초 이내에 재접속하지 않아 기권패 처리되었습니다. ${winnerName} 승리!`;

                            io.to(room.id).emit('game_over', {
                                winner: enemyRole,
                                winnerNickname: winnerName,
                                log: logMsg,
                                boardState: room.boardState,
                                stats: room.playerStats
                            });
                            io.to(room.id).emit('room_state_update', getRoomSanitizedState(room));
                            broadcastLobbyData();
                        }
                    }, 30000);
                }
            } else {
                leaveUserFromRoom(socket.id);
            }
        }
        delete users[socket.id];
        broadcastLobbyData();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`증강 바둑 서버가 포트 ${PORT}에서 실행 중입니다.`);
});

// 어드민 전용 2초 주기 실시간 용량/메모리/가동시간 갱신
setInterval(() => {
    Object.values(users).forEach(u => {
        if (u.username === 'mini4950') {
            io.to(u.id).emit('admin_metrics_update', getAdminServerMetrics());
        }
    });
}, 2000);