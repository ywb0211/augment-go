const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const BOARD_SIZE = 19;
let players = [];
let currentTurn = 'black';
let boardState = Array.from(Array(BOARD_SIZE), () => Array(BOARD_SIZE).fill(null));

// 플레이어 상태 관리 (경험치, 레벨, 활성화된 증강)
let playerStats = {
    black: { xp: 0, level: 1, augments: [] },
    white: { xp: 0, level: 1, augments: [] }
};

// --- 초기 증강 10종 정의 ---
const AUGMENT_POOL = [
    { id: 'bomb_oh', name: 'ㅗ 모양 폭격', desc: 'ㅗ 모양 완성 시 주변 8칸의 적 돌 소멸 및 경험치 획득' },
    { id: 'double_place', name: '증바람 (연사)', desc: '돌을 놓을 때 10% 확률로 한 번 더 놓기 가능' },
    { id: 'xp_boost', name: '지식 증폭', desc: '돌을 따먹을 때 획득하는 경험치 2倍' },
    { id: 'cross_destroy', name: '십자 붕괴', desc: '┼ 모양 완성 시 십자 방향 직선상의 적 돌을 2칸씩 제거' },
    { id: 'square_shield', name: 'ㅁ 결계 생성', desc: 'ㅁ 모양 완성 시 그 중심에 적이 절대 돌을 둘 수 없는 결계 생성' },
    { id: 'comeback_king', name: '역전의 발판', desc: '상대보다 레벨이 낮을 때 턴당 추가 경험치 +1' },
    { id: 'line_three', name: '삼연격', desc: '가로나 세로로 3개가 연속 배치되면 즉시 경험치 +5' },
    { id: 'random_teleport', name: '차원 왜곡', desc: '돌을 놓을 때 주변 3x3 안의 무작위 적 돌 1개를 빈자리로 순간이동' },
    { id: 'vampire', name: '생명 흡수', desc: '상대 돌을 잡으면 내 돌로 즉시 부활(염색)시킴' },
    { id: 'final_reckoning', name: '종말의 수', desc: '판에 내 돌이 30개 이상 깔리면 모든 내 돌 주변 적 돌에 대미지(소멸)' }
];

// 간단한 'ㅗ' 모양 검사 알고리즘 (동서남북 기준 중심점이 채워졌는지 확인)
function checkOhShape(x, y, color) {
    if (x <= 0 || x >= BOARD_SIZE - 1 || y <= 0 || y >= BOARD_SIZE - 1) return false;

    // 정방향 ㅗ 모양 검사
    const up = boardState[y - 1][x] === color;
    const left = boardState[y][x - 1] === color;
    const right = boardState[y][x + 1] === color;
    const center = boardState[y][x] === color;

    return center && up && left && right;
}

// 사방이 막힌 돌을 덤으로 따먹는 기초 바둑 규칙 (단순화 버전) 및 경험치 정산
function processCaptures(color) {
    let capturedCount = 0;
    // 프로토타입용 단순 로직: 고립된 돌을 체크하여 소멸 처리 (실제 바둑 활로 계산은 추후 확장 가능)
    // 여기서는 활로 계산 대신 스킬 이펙트로 돌이 지워지는 연출로 연계됩니다.
    return capturedCount;
}

io.on('connection', (socket) => {
    if (players.length < 2) {
        const color = players.length === 0 ? 'black' : 'white';
        players.push({ id: socket.id, color });
        socket.emit('init', { color, stats: playerStats[color] });
    } else {
        socket.emit('init', { color: 'spectator' });
    }

    socket.on('place_stone', (data) => {
        if (data.color !== currentTurn) return;

        const { x, y, color } = data;
        if (boardState[y][x] !== null) return;

        boardState[y][x] = color;
        let logMessage = `${color}가 (${x}, ${y})에 착수했습니다.`;

        // [증강 발동 1] ㅗ 모양 폭격 검사
        if (playerStats[color].augments.includes('bomb_oh') && checkOhShape(x, y, color)) {
            logMessage += ` [스킬 발동] ㅗ 모양 폭격!`;
            // 주변 8칸 소멸 및 경험치 파밍
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const ny = y + dy;
                    const nx = x + dx;
                    if (ny >= 0 && ny < BOARD_SIZE && nx >= 0 && nx < BOARD_SIZE) {
                        if (boardState[ny][nx] && boardState[ny][nx] !== color) {
                            boardState[ny][nx] = null;
                            let xpGained = playerStats[color].augments.includes('xp_boost') ? 4 : 2;
                            playerStats[color].xp += xpGained;
                        }
                    }
                }
            }
        }

        // 기본 경험치 획득 및 레벨업 체크
        playerStats[color].xp += 1;
        if (playerStats[color].xp >= playerStats[color].level * 10) {
            playerStats[color].level += 1;
            // 10종 중 랜덤하게 3개 증강 셔플 후 전송
            const shuffled = [...AUGMENT_POOL].sort(() => 0.5 - Math.random());
            const choices = shuffled.slice(0, 3);
            socket.emit('level_up', { level: playerStats[color].level, choices });
        }

        // 패시브 역전의 발판 체크
        const enemyColor = color === 'black' ? 'white' : 'black';
        if (playerStats[color].augments.includes('comeback_king') && playerStats[color].level < playerStats[enemyColor].level) {
            playerStats[color].xp += 1;
        }

        // 턴 교체 (증바람 연사 패시브: 10% 확률로 한 번 더)
        let doubleChance = playerStats[color].augments.includes('double_place') ? 0.1 : 0;
        if (Math.random() >= doubleChance) {
            currentTurn = enemyColor;
        } else {
            logMessage += ` [스킬 발동] 증바람 연사! 한 번 더 둡니다.`;
        }

        io.emit('stone_placed', {
            boardState,
            nextTurn: currentTurn,
            stats: playerStats,
            log: logMessage
        });
    });

    socket.on('select_augment', (data) => {
        const { color, augmentId } = data;
        if (playerStats[color] && !playerStats[color].augments.includes(augmentId)) {
            playerStats[color].augments.push(augmentId);
            io.emit('log_update', `${color} 진영이 증강 [${augmentId}]을(를) 선택했습니다!`);
        }
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});