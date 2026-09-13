// パスワードチェック（テスト用：1234）
function tryLogin() {
    const pass = document.getElementById('password-input').value;
    if (pass === '1234') {
        // ホーム画面（home.html）へジャンプする
        location.href = 'home.html';
    } else {
        alert('パスワードが違います');
    }
}

// ログアウト処理
function logout() {
    // ログイン画面（login.html）へ戻る
    location.href = 'login.html';
}
