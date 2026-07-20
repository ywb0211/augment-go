const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const BOARD_SIZE = 19;

// 사용자 상태 관리: socketId -> { id, nickname, roomId }
const users = {};

// 방 상태 관리: roomId -> Room Object
const rooms = {};

// --- 증강 18종 정의 (3개 카테고리 x 6개) ---
const AUGMENT_POOL = [
    // 🟡 카테고리 1: 성장 & 집 구성 (growth)
    { id: 'eye_creation', category: 'growth', name: '독립된 집 (Eye)', desc: '독립된 집(1칸의 공간) 완성 시 경험치 +5 획득' },
    { id: 'corner_master', category: 'growth', name: '귀의 지배자', desc: '4개 귀 영역(3x3)에 착수 시 획득 경험치 2배' },
    { id: 'knight_move', category: 'growth', name: '날일자 행마', desc: '날일자(L자) 또는 3연속 행마 형성 시 경험치 +3 획득' },
    { id: 'comeback_king', category: 'growth', name: '역전의 발판', desc: '상대보다 레벨이 낮을 때 턴 종료 시 경험치 +2 획득' },
    { id: 'xp_boost', category: 'growth', name: '사석 연구', desc: '적 돌을 포획할 때 획득하는 경험치 2배' },
    { id: 'center_point', category: 'growth', name: '대세점 (천원)', desc: '중앙(천원) 및 화점에 착수 시 경험치 +4 획득' },

    // 🔴 카테고리 2: 공격 & 행마 (attack)
    { id: 'atari_strike', category: 'attack', name: '단수 강타 (Atari)', desc: '적 돌 그룹을 단수로 만들 때 1턴간 상대 탈출 방해' },
    { id: 'cutting_edge', category: 'attack', name: '끊음의 일격 (Cut)', desc: '적 돌 사이를 끊는 착수 시 인접 적 공배 1개 제거 및 경험치 +4' },
    { id: 'net_trap', category: 'attack', name: '장문의 그물 (Net)', desc: '적 돌 1개를 3방향 감싸 가두면 즉시 포획' },
    { id: 'double_place', category: 'attack', name: '증바람 (연사)', desc: '착수 시 10% 확률로 한 번 더 연속 착수' },
    { id: 'push_stone', category: 'attack', name: '밀어내기', desc: '착수 위치 인접 적 돌 1개를 1칸 뒤로 밀어냄' },
    { id: 'vampire', category: 'attack', name: '생명 흡수', desc: '포획한 적 돌 중 1개를 소멸 대신 내 돌 색으로 전향' },

    // 🔵 카테고리 3: 방어 & 사활 (defense)
    { id: 'two_eyes_life', category: 'defense', name: '두 집 사활 (Life)', desc: '독립된 집 2개 완성 시 연결 그룹 영구 완전 생존(포획 불가)' },
    { id: 'emergency_liberty', category: 'defense', name: '공배 보충 (Air)', desc: '내 그룹이 단수 위기 시 자동으로 공배 +1개 보충 (그룹당 1회)' },
    { id: 'uncuttable_joint', category: 'defense', name: '철벽의 이음', desc: '내 그룹을 잇는 착수 시 해당 연결선은 상대 스킬 면역' },
    { id: 'ko_phantom', category: 'defense', name: '패의 보호막 (Ko)', desc: '내 돌이 잡혔을 때 해당 자리에 2턴간 상대 착수 락 형성' },
    { id: 'phoenix_return', category: 'defense', name: '사석 환생 (Phoenix)', desc: '내 돌이 잡힐 때 25% 확률로 그 자리가 1턴간 착수 불가 지역화' },
    { id: 'sanctuary_star', category: 'defense', name: '화점 안식', desc: '화점 위의 내 돌은 상대 공격 스킬(밀어내기 등) 면역' }
];

// 화점 좌표 목록 (19x19 기준)
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

function createInitialPlayerStats() {
    return {
        black: { xp: 0, level: 1, augments: [], captured: 0, initialSelected: false },
        white: { xp: 0, level: 1, augments: [], captured: 0, initialSelected: false }
    };
}

// ------------------- 모양 및 스킬 검사 헬퍼 ------------------- //

// 집(Eye) 생성 검사 (x,y 주변 4방향이 내 돌이고 (x,y)가 빈공간일 때)
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

// 날일자(L자) 또는 3연속 체크
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

// 장문 체크 (적 돌 1개의 4방향 중 3방향 이상이 내 돌인 경우)
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

// 끊음 착수 체크
function checkCutMove(boardState, x, y, myColor) {
    const enemyColor = myColor === 'black' ? 'white' : 'black';
    const horizontalCut = (x > 0 && x < BOARD_SIZE - 1 && boardState[y][x-1] === enemyColor && boardState[y][x+1] === enemyColor);
    const verticalCut = (y > 0 && y < BOARD_SIZE - 1 && boardState[y-1][x] === enemyColor && boardState[y+1][x] === enemyColor);
    return horizontalCut || verticalCut;
}

// 바둑 사석 포획 (Liberties 0 계산 + 두 집 사활 면역 + 공배 보충 반영)
function captureStones(boardState, enemyColor, isVampire, enemyAugments, roomLocks) {
    const visited = Array.from(Array(BOARD_SIZE), () => Array(BOARD_SIZE).fill(false));
    let totalCaptured = 0;
    const capturerColor = enemyColor === 'black' ? 'white' : 'black';

    // 두 집 사활(two_eyes_life) 발동 시 영구 생존 체크
    const enemyEyesCount = checkEyeCreation(boardState, enemyColor);
    const isImmuneByTwoEyes = enemyAugments.includes('two_eyes_life') && enemyEyesCount >= 2;

    if (isImmuneByTwoEyes) {
        return 0; // 완전 생존 그룹
    }

    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            if (boardState[y][x] === enemyColor && !visited[y][x]) {
                const group = [];
                const queue = [[x, y]];
                visited[y][x] = true;
                let liberties = 0;

                while (queue.length > 0) {
                    const [cx, cy] = queue.shift();
                    group.push([cx, cy]);

                    const neighbors = [[cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]];
                    for (let [nx, ny] of neighbors) {
                        if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
                            if (boardState[ny][nx] === null) {
                                liberties++;
                            } else if (boardState[ny][nx] === enemyColor && !visited[ny][nx]) {
                                visited[ny][nx] = true;
                                queue.push([nx, ny]);
                            }
                        }
                    }
                }

                // 공배 보충(emergency_liberty) 발동 체크
                if (liberties === 0 && enemyAugments.includes('emergency_liberty')) {
                    // 가상 공배 1개 인정하여 이번 착수에서는 살아남음
                    liberties = 1;
                }

                // 공배가 0이면 포획
                if (liberties === 0) {
                    totalCaptured += group.length;
                    let flippedOne = false;
                    for (let [gx, gy] of group) {
                        if (isVampire && !flippedOne) {
                            boardState[gy][gx] = capturerColor;
                            flippedOne = true;
                        } else {
                            boardState[gy][gx] = null;
                            // 패의 보호막(ko_phantom) 또는 사석 환생(phoenix_return)
                            if (enemyAugments.includes('ko_phantom')) {
                                roomLocks[`${gx},${gy}`] = { owner: capturerColor, turnsLeft: 2 };
                            } else if (enemyAugments.includes('phoenix_return') && Math.random() < 0.25) {
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
    } else if (room.players.white && room.players.white.socketId === socketId) {
        room.players.white = null;
        roleLeft = '백';
    } else {
        room.spectators = room.spectators.filter(s => s.socketId !== socketId);
        roleLeft = '관전자';
    }

    const hasPlayers = room.players.black || room.players.white;
    const hasSpectators = room.spectators.length > 0;

    if (!hasPlayers && !hasSpectators) {
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
        shields: room.shields,
        locks: room.locks || {},
        status: room.status,
        winner: room.winner || null,
        consecutivePasses: room.consecutivePasses || 0
    };
}

// 무작위 3개 카테고리별 증강 뽑기 헬퍼
function getRandomAugmentChoices() {
    const growthList = AUGMENT_POOL.filter(a => a.category === 'growth');
    const attackList = AUGMENT_POOL.filter(a => a.category === 'attack');
    const defenseList = AUGMENT_POOL.filter(a => a.category === 'defense');

    const choice1 = growthList[Math.floor(Math.random() * growthList.length)];
    const choice2 = attackList[Math.floor(Math.random() * attackList.length)];
    const choice3 = defenseList[Math.floor(Math.random() * defenseList.length)];

    return [choice1, choice2, choice3];
}

// 게임 시작시 증강 선택 단계 시작
function startInitialAugmentPhase(room) {
    room.status = 'selecting_augment';
    
    // 흑/백 플레이어에게 각각 시작 증강 3개 전달
    if (room.players.black) {
        const blackChoices = getRandomAugmentChoices();
        io.to(room.players.black.socketId).emit('initial_augment_options', { choices: blackChoices });
    }
    if (room.players.white) {
        const whiteChoices = getRandomAugmentChoices();
        io.to(room.players.white.socketId).emit('initial_augment_options', { choices: whiteChoices });
    }

    io.to(room.id).emit('room_state_update', getRoomSanitizedState(room));
    io.to(room.id).emit('log_update', '대국이 시작됩니다! 두 플레이어는 시작 증강 능력을 선택하세요.');
}

io.on('connection', (socket) => {

    // 1. 로그인
    socket.on('login', (data, callback) => {
        const nickname = (data && data.nickname && data.nickname.trim())
            ? data.nickname.trim()
            : `유저_${socket.id.slice(0, 4)}`;

        users[socket.id] = {
            id: socket.id,
            nickname: nickname,
            roomId: null
        };

        if (typeof callback === 'function') {
            callback({ success: true, nickname, lobbyData: getLobbyData() });
        }
        broadcastLobbyData();
    });

    // 2. 방 생성
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
                black: { socketId: socket.id, nickname: user.nickname },
                white: null
            },
            spectators: [],
            currentTurn: 'black',
            boardState: Array.from(Array(BOARD_SIZE), () => Array(BOARD_SIZE).fill(null)),
            playerStats: createInitialPlayerStats(),
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

    // 3. 방 입장
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
            room.players.black = { socketId: socket.id, nickname: user.nickname };
            role = 'black';
        } else if (!room.players.white) {
            room.players.white = { socketId: socket.id, nickname: user.nickname };
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

    // 4. 시작 증강 선택 (select_initial_augment)
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

        // 양쪽 모두 선택 완료 시 게임 시작
        if (room.playerStats.black.initialSelected && room.playerStats.white.initialSelected) {
            room.status = 'playing';
            io.to(room.id).emit('log_update', '양측 시작 증강 선택 완료! 흑의 선공으로 대국을 시작합니다.');
        }

        io.to(room.id).emit('room_state_update', getRoomSanitizedState(room));
    });

    // 5. 방 퇴장
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

    // 6. 패스 (pass_turn)
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

        // 2회 연속 패스 시 계가(판정) 종료
        if (room.consecutivePasses >= 2) {
            room.status = 'finished';

            const blackScore = countStones(room.boardState, 'black') + room.playerStats.black.captured;
            const whiteScore = countStones(room.boardState, 'white') + room.playerStats.white.captured + 6.5;

            let winner = blackScore > whiteScore ? 'black' : 'white';
            let winnerNickname = winner === 'black' ? room.players.black.nickname : room.players.white.nickname;
            room.winner = winner;

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
            shields: room.shields,
            locks: room.locks,
            log: logMsg
        });
    });

    // 7. 기권 (resign)
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

    // 8. 착수 (place_stone)
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

        // 패(Ko) 락 검사
        const lockKey = `${x},${y}`;
        if (room.locks[lockKey] && room.locks[lockKey].turnsLeft > 0) {
            socket.emit('log_update', '패(Ko) 보호막이 작동 중인 위치에는 착수할 수 없습니다!');
            return;
        }

        // 착수 진행
        room.consecutivePasses = 0;
        room.boardState[y][x] = color;

        // 락 잔여 턴 1 감쇠
        Object.keys(room.locks).forEach(k => {
            room.locks[k].turnsLeft -= 1;
            if (room.locks[k].turnsLeft <= 0) delete room.locks[k];
        });

        const colorKor = color === 'black' ? '흑' : '백';
        const enemyColor = color === 'black' ? 'white' : 'black';
        let logMessage = `${user.nickname}(${colorKor}) 님이 (${x}, ${y}) 위치에 착수했습니다.`;
        const myAugments = room.playerStats[color].augments;
        const enemyAugments = room.playerStats[enemyColor].augments;

        // [성장 1] 독립된 집 (eye_creation)
        if (myAugments.includes('eye_creation')) {
            const eyeCount = checkEyeCreation(room.boardState, color);
            if (eyeCount > 0) {
                const bonusXp = eyeCount * 5;
                room.playerStats[color].xp += bonusXp;
                logMessage += ` [증강] 독립된 집(${eyeCount}개) 완성! (+${bonusXp} XP)`;
            }
        }

        // [성장 2] 귀의 지배자 (corner_master)
        let cornerMultiplier = (myAugments.includes('corner_master') && isCornerArea(x, y)) ? 2 : 1;
        if (cornerMultiplier === 2) {
            logMessage += ` [증강] 귀 영역 착수! XP 획득량 2배 적용.`;
        }

        // [성장 3] 날일자 행마 (knight_move)
        if (myAugments.includes('knight_move') && checkKnightOrLine(room.boardState, x, y, color)) {
            room.playerStats[color].xp += 3 * cornerMultiplier;
            logMessage += ` [증강] 날일자/연결 행마! (+${3 * cornerMultiplier} XP)`;
        }

        // [성장 6] 대세점 천원/화점 (center_point)
        if (myAugments.includes('center_point') && (isStarPoint(x, y) || (x === 9 && y === 9))) {
            room.playerStats[color].xp += 4 * cornerMultiplier;
            logMessage += ` [증강] 요충지(화점/천원) 착수! (+${4 * cornerMultiplier} XP)`;
        }

        // [공격 2] 끊음의 일격 (cutting_edge)
        if (myAugments.includes('cutting_edge') && checkCutMove(room.boardState, x, y, color)) {
            room.playerStats[color].xp += 4 * cornerMultiplier;
            logMessage += ` [증강] 끊음의 일격! 상대 연결을 차단했습니다. (+${4 * cornerMultiplier} XP)`;
        }

        // [공격 3] 장문의 그물 (net_trap)
        if (myAugments.includes('net_trap')) {
            const trappedTarget = checkNetTrap(room.boardState, x, y, color);
            if (trappedTarget) {
                const isSanctuary = enemyAugments.includes('sanctuary_star') && isStarPoint(trappedTarget.x, trappedTarget.y);
                if (!isSanctuary) {
                    room.boardState[trappedTarget.y][trappedTarget.x] = null;
                    room.playerStats[color].captured += 1;
                    const gainXp = 2 * cornerMultiplier;
                    room.playerStats[color].xp += gainXp;
                    logMessage += ` [증강] 장문의 그물! 적 돌 (${trappedTarget.x}, ${trappedTarget.y}) 포획 완료.`;
                }
            }
        }

        // [공격 5] 밀어내기 (push_stone)
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

        // 바둑 표준 사석 잡기
        const isVampire = myAugments.includes('vampire');
        const capturedCount = captureStones(room.boardState, enemyColor, isVampire, enemyAugments, room.locks);
        if (capturedCount > 0) {
            room.playerStats[color].captured += capturedCount;
            const gainPerStone = (myAugments.includes('xp_boost') ? 4 : 2) * cornerMultiplier;
            const xpGained = capturedCount * gainPerStone;
            room.playerStats[color].xp += xpGained;
            logMessage += ` [사석 포획] 적 돌 ${capturedCount}개를 잡았습니다! (+${xpGained} XP)`;
        }

        // 기본 경험치 획득 및 레벨업 체크
        room.playerStats[color].xp += 1 * cornerMultiplier;
        const targetXp = room.playerStats[color].level * 10;
        if (room.playerStats[color].xp >= targetXp) {
            room.playerStats[color].level += 1;
            const choices = getRandomAugmentChoices();
            socket.emit('level_up', { level: room.playerStats[color].level, choices });
        }

        // [성장 4] 역전의 발판 체크
        if (myAugments.includes('comeback_king') &&
            room.playerStats[color].level < room.playerStats[enemyColor].level) {
            room.playerStats[color].xp += 2;
            logMessage += ` [역전의 발판] 보너스 경험치 +2 획득.`;
        }

        // 턴 교체 ([공격 4] 증바람 연사: 10% 확률로 연속 턴)
        let doubleChance = myAugments.includes('double_place') ? 0.1 : 0;
        if (Math.random() >= doubleChance) {
            room.currentTurn = enemyColor;
        } else {
            logMessage += ` [증강] 증바람 연사! 턴이 유지되어 한 번 더 착수합니다.`;
        }

        io.to(room.id).emit('stone_placed', {
            boardState: room.boardState,
            nextTurn: room.currentTurn,
            stats: room.playerStats,
            shields: room.shields,
            locks: room.locks,
            log: logMessage
        });
    });

    // 9. 일반 증강 선택 (select_augment)
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

    // 10. 연결 해제
    socket.on('disconnect', () => {
        leaveUserFromRoom(socket.id);
        delete users[socket.id];
        broadcastLobbyData();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`증강 바둑 서버가 포트 ${PORT}에서 실행 중입니다.`);
});