const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'users.json');

// 사용자 DB 인메모리 캐시 & 동기화
let usersDb = {};

function loadDb() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            usersDb = JSON.parse(data);

            // 🌟 이전 버전(passwordHash)과 신규 버전(hash) 필드 호환성 자동 마이그레이션
            let isMigrated = false;
            for (let username in usersDb) {
                const u = usersDb[username];
                if (u.passwordHash && !u.hash) {
                    u.hash = u.passwordHash;
                    isMigrated = true;
                }
                if (u.hash && !u.passwordHash) {
                    u.passwordHash = u.hash;
                    isMigrated = true;
                }
            }
            if (isMigrated) {
                saveDb();
            }
        } else {
            usersDb = {};
            saveDb();
        }
    } catch (e) {
        console.error('DB 로드 중 오류:', e);
        usersDb = {};
    }
}

function saveDb() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(usersDb, null, 2), 'utf8');
    } catch (e) {
        console.error('DB 저장 중 오류:', e);
    }
}

// 비밀번호 암호화 (PBKDF2)
function hashPassword(password, salt = null) {
    if (!salt) {
        salt = crypto.randomBytes(16).toString('hex');
    }
    const hash = crypto.pbkdf2Sync(String(password).trim(), salt, 1000, 64, 'sha512').toString('hex');
    return { salt, hash };
}

function verifyPassword(password, salt, storedHash) {
    if (!storedHash || !salt) return false;
    const { hash } = hashPassword(String(password).trim(), salt);
    return hash === storedHash;
}

// 초기 DB 로드 실행
loadDb();

// 기본 어드민 계정 시드 생성 및 필드 보정
function seedAdminAccount() {
    const adminUsername = 'mini4950';
    const { salt, hash } = hashPassword('Andrew4950!');
    
    if (!usersDb[adminUsername]) {
        usersDb[adminUsername] = {
            username: adminUsername,
            nickname: '냥게이',
            salt: salt,
            hash: hash,
            passwordHash: hash,
            wins: 0,
            losses: 0,
            rating: 1200,
            createdAt: new Date().toISOString()
        };
        saveDb();
        console.log('어드민 계정 (mini4950 / 냥게이) 시드 생성 완료');
    } else {
        // 기존 어드민 계정 필드 보정
        const admin = usersDb[adminUsername];
        if (!admin.hash && admin.passwordHash) admin.hash = admin.passwordHash;
        if (!admin.passwordHash && admin.hash) admin.passwordHash = admin.hash;
    }
}
seedAdminAccount();

module.exports = {
    registerUser(username, password, nickname) {
        const cleanUsername = String(username).trim();
        const cleanNickname = String(nickname).trim();
        const cleanPassword = String(password).trim();

        if (usersDb[cleanUsername]) {
            return { success: false, message: '이미 존재하는 아이디입니다.' };
        }

        const nicknameExists = Object.values(usersDb).some(u => u.nickname === cleanNickname);
        if (nicknameExists) {
            return { success: false, message: '이미 사용 중인 닉네임입니다.' };
        }

        const { salt, hash } = hashPassword(cleanPassword);
        usersDb[cleanUsername] = {
            username: cleanUsername,
            nickname: cleanNickname,
            salt: salt,
            hash: hash,
            passwordHash: hash,
            wins: 0,
            losses: 0,
            rating: 1000,
            createdAt: new Date().toISOString()
        };
        saveDb();
        return { success: true, message: '회원가입이 완료되었습니다.' };
    },

    loginUser(username, password) {
        const cleanUsername = String(username).trim();
        const cleanPassword = String(password).trim();

        const user = usersDb[cleanUsername];
        if (!user) {
            return { success: false, message: '존재하지 않는 아이디입니다.' };
        }

        const targetHash = user.hash || user.passwordHash;

        if (!verifyPassword(cleanPassword, user.salt, targetHash)) {
            return { success: false, message: '비밀번호가 일치하지 않습니다.' };
        }

        return {
            success: true,
            user: {
                username: user.username,
                nickname: user.nickname,
                wins: user.wins || 0,
                losses: user.losses || 0,
                rating: user.rating || 1000
            }
        };
    },

    getUserByUsername(username) {
        const cleanUsername = String(username).trim();
        return usersDb[cleanUsername] || null;
    },

    getUserByNickname(nickname) {
        const cleanNickname = String(nickname).trim();
        return Object.values(usersDb).find(u => u.nickname === cleanNickname) || null;
    },

    // 🌟 동적 랭크 점수 변동 반영 (승자 상승, 패자 차감)
    updateUserStatsWithRating(username, isWin, deltaRating) {
        const cleanUsername = String(username).trim();
        const user = usersDb[cleanUsername];
        if (!user) return null;

        if (isWin) {
            user.wins = (user.wins || 0) + 1;
            user.rating = (user.rating || 1000) + deltaRating;
        } else {
            user.losses = (user.losses || 0) + 1;
            user.rating = Math.max(100, (user.rating || 1000) - deltaRating);
        }

        saveDb();
        return {
            wins: user.wins,
            losses: user.losses,
            rating: user.rating
        };
    },

    getUsersCount() {
        return Object.keys(usersDb).length;
    }
};
