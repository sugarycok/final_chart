const express = require('express');
const mysql = require('mysql');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const ftp = require('basic-ftp'); // basic-ftp 패키지 추가
const multer = require('multer');

const app = express();
const PORT = 3000;

// MySQL 연결 정보
const db = mysql.createConnection({
    host: '127.0.0.1',
    port: '3306',
    user: 'root',
    password: '0000',
    database: 'capstone'
});

// MySQL 연결
db.connect((err) => {
    if (err) {
        throw err;
    }
    console.log('MySQL 데이터베이스에 연결되었습니다.');
});

// FTP 클라이언트 생성
const ftpClient = new ftp.Client();

// FTP 서버 정보
const ftpConfig = {
    host: '172.30.1.6', // FTP 호스트 주소
    port: 21, // FTP 포트 번호
    user: 'root', // FTP 사용자명
    password: '0000' // FTP 비밀번호
};

// Body parser 미들웨어 추가
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// multer 미들웨어 설정
const upload = multer({ dest: 'uploads/' });

// 정적 파일들을 제공하기 위한 미들웨어
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 세션 미들웨어 추가
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true
}));

// 주식 코드를 세션에 저장하는 엔드포인트
app.post('/predict', (req, res) => {
    const stockCode = req.body.stockCode; // 클라이언트에서 전송된 주식 코드
    req.session.stockCode = stockCode; // 세션에 주식 코드 저장
    res.send('주식 코드를 받았고 세션에 저장했습니다.');
});

// 메인 페이지
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// 회원가입 페이지
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'register.html'));
});

// 회원가입 처리
app.post('/register', (req, res) => {
    const { name, username, password, phone } = req.body;

    // 사용자명(username) 중복 확인 쿼리
    const checkDuplicateQuery = `SELECT * FROM info WHERE username = ?`;
    db.query(checkDuplicateQuery, [username], (checkErr, checkResult) => {
        if (checkErr) {
            console.error('사용자명 중복 확인 중 오류 발생:', checkErr);
            res.status(500).send('회원가입 중 오류가 발생했습니다.');
        } else if (checkResult.length > 0) {
            // 사용자명이 이미 존재하는 경우
            res.status(400).send('이미 존재하는 사용자명입니다.');
        } else {
            // 사용자명이 중복되지 않은 경우, 회원가입 정보를 데이터베이스에 저장하는 쿼리
            const insertQuery = `INSERT INTO info (name, username, password, phone) VALUES (?, ?, ?, ?)`;
            db.query(insertQuery, [name, username, password, phone], (insertErr, insertResult) => {
                if (insertErr) {
                    console.error('회원가입 중 오류 발생:', insertErr);
                    res.status(500).send('회원가입 중 오류가 발생했습니다.');
                } else {
                    console.log('회원가입이 성공적으로 완료되었습니다.');
                    // 회원가입이 완료되면 세션을 파기하고 다시 생성합니다.
                    req.session.destroy((destroyErr) => {
                        if (destroyErr) {
                            console.error('세션 파기 중 오류 발생:', destroyErr);
                            res.status(500).send('세션 파기 중 오류가 발생했습니다.');
                        } else {
                            // 세션을 파기한 후 새로운 세션을 생성합니다.
                            req.session.username = username;
                            // 회원가입이 완료되면 인덱스 페이지로 리디렉션합니다.
                            res.redirect('/');
                        }
                    });
                }
            });
        }
    });
});

// 로그인 페이지
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'login.html'));
});

// 로그인 처리
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // 사용자명(username)와 비밀번호를 데이터베이스에서 확인하는 쿼리
    const loginQuery = `SELECT id, username, name FROM info WHERE username = ? AND password = ?`;
    db.query(loginQuery, [username, password], (err, result) => {
        if (err) {
            console.error('로그인 중 오류 발생:', err);
            res.status(500).send('로그인 중 오류가 발생했습니다.');
        } else if (result.length === 0) {
            // 사용자명 또는 비밀번호가 일치하지 않는 경우
            res.status(401).send('사용자명 또는 비밀번호가 일치하지 않습니다.');
        } else {
            // 로그인이 성공한 경우
            const userId = result[0].id; // 사용자 ID 가져오기
            req.session.userId = userId; // 세션에 사용자 ID 저장
            req.session.username = result[0].name; // 세션에 사용자 이름 저장
            res.redirect('/'); // index.html로 리디렉션
        }
    });
});

// 로그아웃 처리
app.get('/logout', (req, res) => {
    // 세션을 파기하여 로그아웃 처리
    req.session.destroy((err) => {
        if (err) {
            console.error('로그아웃 중 오류 발생:', err);
            res.status(500).json({ success: false, error: '로그아웃 중 오류가 발생했습니다.' });
        } else {
            // 로그아웃이 성공한 경우, 클라이언트에게 성공 응답을 보냄
            res.json({ success: true });
        }
    });
});

// 마이페이지
app.get('/mypage', (req, res) => {
    // 로그인 여부 확인
    if (!req.session.username) {
        // 로그인되어 있지 않으면 로그인 페이지로 리디렉션
        res.redirect('/login');
    } else {
        // 로그인되어 있으면 마이페이지를 표시
        res.sendFile(path.join(__dirname, 'templates', 'mypage.html'));
    }
});

// 라우트를 통해 사용자 이름 반환
app.get('/getUsername', (req, res) => {
    // 현재 세션에서 사용자명 가져오기
    const username = req.session.username;
    // JSON 형태로 반환
    res.json({ username: username });
});

// 클라이언트에서 요청을 받아 FTP 서버로부터 모든 이미지를 가져와 응답하는 라우트
app.get('/getAllPngFromFTP', async (req, res) => {
    try {
        await ftpClient.access(ftpConfig);
        
        // FTP 서버에 저장된 파일 경로
        const remotePath = '/'; // FTP 서버에서 파일이 위치한 경로

        // FTP 서버에 저장된 파일 목록 가져오기
        const files = await ftpClient.list(remotePath);

        // 파일 목록 중 이미지 파일(.png, .jpg 등)을 필터링
        const imageFiles = files.filter(file => /\.(png|jpg|jpeg)$/i.test(file.name));

        if (imageFiles.length === 0) {
            // 이미지 파일이 없는 경우 에러 응답 전송
            res.status(404).json({ success: false, error: 'FTP 서버에 이미지 파일이 없습니다.' });
            return;
        }

        // 이미지 파일을 모두 다운로드하여 uploads 디렉토리에 저장하고 클라이언트에게 각 이미지의 URL을 응답으로 전송
        const imageUrls = [];
        const downloadDir = './uploads/'; // 이미지를 저장할 디렉토리
        for (const file of imageFiles) {
            const imageName = file.name;
            await ftpClient.downloadTo(downloadDir + imageName, remotePath + imageName);
            const imageUrl = `/uploads/${imageName}`; // 이미지 URL 수정
            imageUrls.push(imageUrl);
        }

        res.json({ success: true, imageUrls: imageUrls });
    } catch (error) {
        console.error('FTP 서버에서 이미지 다운로드 중 오류 발생:', error);
        res.status(500).json({ success: false, error: 'FTP 서버에서 이미지 다운로드 중 오류 발생' });
    } finally {
        await ftpClient.close();
    }
});


// 이미지를 서버로 전송하는 라우트
app.post('/saveImageWithUserInfo', upload.single('imageData'), async (req, res) => {
    // multer를 사용하여 이미지 데이터를 읽어옵니다.
    const imageData = req.file;

    try {
        // 세션에서 사용자 이름 가져오기
        const username = req.session.username;
        
        // 클라이언트로부터 주식 종목 코드 받기
        let stockCode;
        if (req.body.stockCode) {
            // 클라이언트 요청 데이터에 주식 종목 코드가 있는 경우
            stockCode = req.body.stockCode;
        } else {
            // 세션에서 주식 종목 코드 가져오기
            // 이 부분은 세션에서 주식 종목 코드를 가져오는 방법에 따라 수정이 필요할 수 있습니다.
            stockCode = req.session.stockCode;
        }

        // FTP 서버에 이미지 업로드 및 이미지 URL 획득
        const imageUrl = await uploadImageToFTP(imageData, username, stockCode);

        // 사용자의 세션에서 사용자 ID를 가져옵니다.
        const userId = req.session.userId;

        // 이미지 URL과 주식 종목 코드를 데이터베이스에 저장하는 쿼리
        const insertQuery = `INSERT INTO images (image_url, user_id, stock_code) VALUES (?, ?, ?)`;
        db.query(insertQuery, [imageUrl, userId, stockCode], (insertErr, insertResult) => {
            if (insertErr) {
                console.error('이미지 URL 및 주식 종목 코드를 데이터베이스에 저장하는 중 오류 발생:', insertErr);
                res.status(500).json({ success: false, error: '이미지 URL 및 주식 종목 코드를 데이터베이스에 저장하는 중 오류 발생' });
            } else {
                console.log('이미지 URL과 주식 종목 코드가 성공적으로 데이터베이스에 저장되었습니다.');
                const imageId = insertResult.insertId;

                // 이미지와 사용자 간의 매핑을 매핑 테이블에 추가하는 쿼리
                const mappingQuery = `INSERT INTO image_info_mapping (image_id, user_id) VALUES (?, ?)`;
                db.query(mappingQuery, [imageId, userId], (mappingErr, mappingResult) => {
                    if (mappingErr) {
                        console.error('이미지와 사용자 간의 매핑을 데이터베이스에 추가하는 중 오류 발생:', mappingErr);
                        res.status(500).json({ success: false, error: '이미지와 사용자 간의 매핑을 데이터베이스에 추가하는 중 오류 발생' });
                    } else {
                        console.log('이미지와 사용자 간의 매핑이 성공적으로 데이터베이스에 추가되었습니다.');
                        res.json({ success: true });
                    }
                });
            }
        });
    } catch (error) {
        console.error('이미지 업로드 및 저장 중 오류 발생:', error);
        res.status(500).json({ success: false, error: '이미지 업로드 및 저장 중 오류 발생' });
    }
});

// 이미지를 FTP 서버에 업로드하고 이미지의 URL을 반환하는 함수
async function uploadImageToFTP(imageData, userId, stockCode) {
    try {
        await ftpClient.access(ftpConfig);
        // 이미지를 루트 디렉토리로 업로드
        const imageName = `${userId}Result_${stockCode}.png`; // 이미지 파일 이름 수정
        await ftpClient.upload(imageData.path, '/' + imageName); // imageData.path로 수정
        // 업로드한 이미지의 URL 반환
        const imageUrl = `http://localhost:3000/uploads/${imageName}`;
        return imageUrl;
    } catch (error) {
        console.error('FTP 서버에 이미지 업로드 중 오류 발생:', error);
        throw error;
    } finally {
        await ftpClient.close();
    }
}

// 클라이언트로 이미지 파일 경로 전달하는 라우트
app.get('/getImagePaths', (req, res) => {
    const imageDirectory = './uploads/'; // 이미지 디렉토리 경로
    const imagePaths = fs.readdirSync(imageDirectory);
    // 이미지 파일의 전체 경로를 클라이언트로 전송
    res.json({ success: true, imagePaths: imagePaths.map(image => `${imageDirectory}/${image}`) }); 
});

// 각각의 메뉴 항목에 대한 라우팅
app.get('/page1', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'page1.html'));
});

app.get('/page2', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'page2.html'));
});

app.get('/page3', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'page3.html'));
});

app.get('/page4', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'page4.html'));
});

// FTP URL을 HTTP URL로 변환하는 함수
function convertFtpToHttp(ftpUrl) {
    // FTP URL에서 파일 이름 추출
    const fileName = ftpUrl.substring(ftpUrl.lastIndexOf('/') + 1);
    // HTTP URL 생성
    const httpUrl = `http://localhost:3000/uploads/${fileName}`;
    return httpUrl;
}

// 로그인한 사용자가 저장한 이미지를 가져와 응답하는 라우트
app.get('/getUserImages', (req, res) => {
    // 현재 로그인한 사용자의 ID 가져오기
    const userId = req.session.userId;

    // 사용자가 업로드한 이미지를 데이터베이스에서 쿼리
    const query = `SELECT image_url FROM images WHERE user_id = ?`;
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('사용자 이미지를 가져오는 중 오류 발생:', err);
            res.status(500).json({ success: false, error: '사용자 이미지를 가져오는 중 오류가 발생했습니다.' });
        } else {
            // 이미지 URL을 HTTP 형식으로 변환하여 클라이언트에게 응답
            const imageUrls = results.map(result => convertFtpToHttp(result.image_url));
            res.json({ success: true, imageUrls: imageUrls });
        }
    });
});


// 서버를 시작합니다.
app.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다!`);
});
