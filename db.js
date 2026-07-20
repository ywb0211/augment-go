const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2), 'utf-8');
        return {};
    }
    try {
        const content = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(content || '{}');
    } catch (e) {
        return {};
    }
}

function saveUsers(users) {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

function hashPassword(password, salt) {
    if (!salt) {
        salt = crypto.randomBytes(16).toString('hex');
    }
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { hash, salt };
}

function registerUser(username, password, nickname) {
    const users = loadUsers();
    
    // 아이디 중복 체크
    if (users[username]) {
        return { success: false, message: '이미 존재하는 아이디입니다.' };
    }

    // 닉네임 중복 체크
    for (let uId in users) {
        if (users[uId].nickname === nickname) {
            return { success: false, message: '이미 사용 중인 닉네임입니다.' };
        }
    }

    const { hash, salt } = hashPassword(password);

    const newUser = {
        username,
        passwordHash: hash,
        salt,
        nickname,
        wins: 0,
        losses: 0,
        rating: 1000,
        createdAt: new Date().toISOString()
    };

    users[username] = newUser;
    saveUsers(users);

    return {
        success: true,
        user: {
            username: newUser.username,
            nickname: newUser.nickname,
            wins: newUser.wins,
            losses: newUser.losses,
            rating: newUser.rating
        }
    };
}

function loginUser(username, password) {
    const users = loadUsers();
    const user = users[username];

    if (!user) {
        return { success: false, message: '존재하지 않는 아이디입니다.' };
    }

    const { hash } = hashPassword(password, user.salt);
    if (hash !== user.passwordHash) {
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
}

function updateUserStats(username, isWin) {
    const users = loadUsers();
    const user = users[username];
    if (!user) return null;

    if (isWin) {
        user.wins = (user.wins || 0) + 1;
        user.rating = (user.rating || 1000) + 15;
    } else {
        user.losses = (user.losses || 0) + 1;
        user.rating = Math.max(500, (user.rating || 1000) - 10);
    }

    saveUsers(users);
    return {
        wins: user.wins,
        losses: user.losses,
        rating: user.rating
    };
}

function getUserByNickname(nickname) {
    const users = loadUsers();
    for (let uId in users) {
        if (users[uId].nickname === nickname) {
            return users[uId];
        }
    }
    return null;
}

function getUsersCount() {
    const users = loadUsers();
    return Object.keys(users).length;
}

// 어드민 계정 (mini4950 / Andrew4950! / 냥게이) 자동 생성 시드
function initAdminAccount() {
    const users = loadUsers();
    if (!users['mini4950']) {
        registerUser('mini4950', 'Andrew4950!', '냥게이');
        console.log('어드민 계정 (mini4950 / 냥게이) 자동 생성 완료!');
    }
}

initAdminAccount();

module.exports = {
    registerUser,
    loginUser,
    updateUserStats,
    getUserByNickname,
    getUsersCount
};
