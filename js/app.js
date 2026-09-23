// ==========================================
// 1. データベース（IndexedDB / Dexie）の初期化
// ==========================================
const db = new Dexie("WorkoutDatabase");
db.version(1).stores({
    records: '++id, date, exercise, weight, reps, assist' // 🟢 補助回数（assist）を保存項目に追記
});

// 全体で使用する共通の変数（すべてのファイルで共有）
let myChart = null;              // グラフのインスタンス
let currentPeriod = 'day';       // 集計期間の初期値（日別）
let currentChartType = 'line';   // グラフタイプの初期値（自力折れ線）
let chartModalInstance = null;   // グラフ用モーダルのインスタンス
let historyModalInstance = null; // 全履歴用モーダルのインスタンス
let timerId = null;              // +-ボタン押下時制御用 時間制御
let delayId = null;              // +-ボタン押下時制御用 間隔制御

// 画面が読み込まれたら自動的に実行する処理
window.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.error(err));
    }
    
    // 日付入力欄の初期値を今日の年月日(YYYY-MM-DD)に自動設定
    document.getElementById('date-input').value = new Date().toISOString().slice(0, 10);
    
    // 各種モーダル要素をBootstrap機能として初期化
    const modalEl = document.getElementById('chartModal');
    if (modalEl) chartModalInstance = new bootstrap.Modal(modalEl);

    const historyModalEl = document.getElementById('historyModal');
    if (historyModalEl) historyModalInstance = new bootstrap.Modal(historyModalEl);

    // イベント追加
    // 種目セレクトボックスが切り替わった時
    document.getElementById('exercise-select').addEventListener('change', () => {
        updateApp();
    });

    // すべての「＋」「ー」ボタンボタン（.hold-btn）にイベントを紐付ける
    document.querySelectorAll('.hold-btn').forEach(button => {
        const type = button.getAttribute('data-type');
        const amount = parseFloat(button.getAttribute('data-amount'));

        // パソコン（マウス操作）
        button.addEventListener('mousedown', () => startHold(type, amount));
        button.addEventListener('mouseup', stopHold);
        button.addEventListener('mouseleave', stopHold);

        // スマホ（タッチ操作）
        button.addEventListener('touchstart', (e) => {
        e.preventDefault(); // スマホの誤ズームやメニュー表示を防止
        startHold(type, amount);
        }, { passive: false });
        button.addEventListener('touchend', stopHold);
        button.addEventListener('touchcancel', stopHold);
    });

    // 画面全体のデータを最新状態にする
    await updateApp();
});

// ==========================================
// 2. モーダルの開閉コントロール処理
// ==========================================

// 📈 グラフ用モーダルを開く
function openChartModal() {
    if (!chartModalInstance) return;
    const select = document.getElementById('exercise-select');
    document.getElementById('modal-title-text').textContent = `${select.options[select.selectedIndex].text} Analytics`;
    chartModalInstance.show();
    setTimeout(async () => { await updateChart(); }, 200); 
}

// ❌ グラフ用モーダルを閉じる
function closeChartModal() {
    if (chartModalInstance) {
        chartModalInstance.hide();
        document.querySelector('button[onclick="openChartModal()"]').focus();
    }
}

// 📋 全履歴モーダルを開く
async function openHistoryModal() {
    if (!historyModalInstance) return;
    const select = document.getElementById('exercise-select');
    document.getElementById('history-modal-title-text').textContent = `${select.options[select.selectedIndex].text} - 全履歴一覧`;
    
    await generateFilterWeightOptions(); // 重量フィルターの選択肢を更新
    
    // 各種フィルターの初期化
    document.getElementById('filter-assist-select').value = 'all';
    document.getElementById('filter-start-date').value = '';
    document.getElementById('filter-end-date').value = '';

    historyModalInstance.show();
    await filterHistoryList(); // 履歴リストの描画
}

// ❌ 全履歴モーダルを閉じる
function closeHistoryModal() {
    if (historyModalInstance) {
        historyModalInstance.hide();
        document.querySelector('button[onclick="openHistoryModal()"]').focus();
    }
}

// ==========================================
// 3. データの追加・増減・削除処理
// ==========================================

// 「記録を保存」ボタンを押したときの処理
async function addRecord() {
    const dateInput = document.getElementById('date-input').value;
    const exercise = document.getElementById('exercise-select').value;
    const weight = parseFloat(document.getElementById('weight-input').value);
    const reps = parseInt(document.getElementById('reps-input').value);
    // 🟢 補助回数の値を取得（未入力なら0にする）
    let assist = parseInt(document.getElementById('assist-input').value);
    if (isNaN(assist)) assist = 0;

    if (!dateInput || isNaN(weight) || isNaN(reps)) {
        alert('すべて正しく入力してください');
        return;
    }

    // データベースへの登録（assistを保存）
    await db.records.add({ 
        date: dateInput, 
        exercise: exercise, 
        weight: weight, 
        reps: reps,
        assist: assist
    });
    
    await updateApp();
}

// クイック「＋」「ー」ボタンが押されたときの計算
function adjustValue(inputId, amount) {
    const input = document.getElementById(`${inputId}-input`);
    let val = parseFloat(input.value);
    if (isNaN(val)) val = 0;
    let newVal = val + amount;
    input.value = newVal < 0 ? 0 : Math.round(newVal * 100) / 100;
}

// 「＋」「ー」ボタン長押し（ホールド）開始
function startHold(type, amount) {
adjustValue(type, amount); // 1回目は押した瞬間に即座に実行

// 0.4秒（400ms）長押しされたら、一定の等速で連打モードを開始
delayId = setTimeout(() => {
    timerId = setInterval(() => {
    adjustValue(type, amount);
    }, 100); // 0.1秒（100ms）間隔で等速連打（速度はお好みで調整してください）
}, 400);
}

// 「＋」「ー」ボタン長押し（ホールド）停止
function stopHold() {
clearTimeout(delayId);
clearInterval(timerId);
delayId = null;
timerId = null;
}

// 履歴の削除処理
async function deleteRecord(id) {
    if (confirm('この記録を削除してもよろしいですか？')) {
        await db.records.delete(id);
        await updateApp();
        
        if (document.getElementById('historyModal').classList.contains('show')) {
            await generateFilterWeightOptions();
            await filterHistoryList();
        }
    }
}

// ==========================================
// 4. リスト・フィルター生成処理
// ==========================================

// メイン画面側：直近5件制限の簡易履歴リスト生成（補助回数の表示対応）
async function updateHistoryList() {
    const container = document.getElementById('recent-history-container');
    if (!container) return;
    
    const exercise = document.getElementById('exercise-select').value;
    let records = await db.records.where('exercise').equals(exercise).toArray();
    
    // 日付の新しい順(降順)・IDの降順にソート
    records.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    records = records.slice(0, 5); // 直近5件を切り取る
    
    container.innerHTML = '';

    if (records.length === 0) {
        container.innerHTML = '<div class="text-muted text-center small py-3">記録がまだありません</div>';
        return;
    }
    
    records.forEach(r => {
        const fmtDate = r.date.replace(/^\d{4}-/, '').replace('-', '/');
        const item = document.createElement('div');
        item.className = 'card border-0 shadow-sm rounded-3 p-3 d-flex flex-row align-items-center justify-content-between history-list-item bg-white';
        
        // 🟢 補助回数（r.assist）がある場合は「10 + 2」のようにテキストを組み立てる
        let repsDisplay = `<strong class="text-dark h6 mb-0">${r.reps}</strong>`;
        if (r.assist > 0) {
            repsDisplay += ` <span class="text-primary font-monospace small">+${r.assist}</span>`;
        }

        item.innerHTML = `
            <div>
                <span class="badge bg-light text-dark font-monospace me-2">${fmtDate}</span>
                <strong class="text-danger h6 mb-0">${r.weight}</strong> <small class="text-muted">kg</small>
                <span class="mx-2 text-black-50">×</span>
                ${repsDisplay} <small class="text-muted">Reps</small>
            </div>
            <button class="btn btn-sm btn-outline-secondary border-0 rounded-circle text-danger fw-bold" onclick="deleteRecord(${r.id})">×</button>
        `;
        container.appendChild(item);
    });
}

// モーダル内の「重量で絞り込み」セレクトボックス生成
async function generateFilterWeightOptions() {
    const exercise = document.getElementById('exercise-select').value;
    const records = await db.records.where('exercise').equals(exercise).toArray();
    const weightSelect = document.getElementById('filter-weight-select');
    if (!weightSelect) return;

    const weightsSet = new Set();
    records.forEach(r => weightsSet.add(r.weight));
    const sortedWeights = Array.from(weightsSet).sort((a, b) => b - a);

    const currentSelected = weightSelect.value;
    weightSelect.innerHTML = '<option value="all">すべての重量</option>';
    
    sortedWeights.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w; opt.textContent = `${w} kg`;
        weightSelect.appendChild(opt);
    });

    if (currentSelected && weightSelect.querySelector(`option[value="${currentSelected}"]`)) {
        weightSelect.value = currentSelected;
    }
}

// 重量・日付・補助回数の条件による、全履歴リストのリアルタイム絞り込み
async function filterHistoryList() {
    const container = document.getElementById('full-history-container');
    if (!container) return;

    const exercise = document.getElementById('exercise-select').value;
    let records = await db.records.where('exercise').equals(exercise).toArray();

    // ① 重量フィルターの適用
    const selectedWeight = document.getElementById('filter-weight-select').value;
    if (selectedWeight !== 'all') {
        const targetWeight = parseFloat(selectedWeight);
        records = records.filter(r => r.weight === targetWeight);
    }

    // 🟢 ② 【新設】補助回数フィルターの適用
    const selectedAssist = document.getElementById('filter-assist-select').value;
    if (selectedAssist === 'has-assist') {
        records = records.filter(r => r.assist > 0); // 補助ありのみ
    } else if (selectedAssist === 'no-assist') {
        records = records.filter(r => r.assist === 0 || r.assist === undefined); // 自力のみ
    }

    // ③ 日付フィルターの適用
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;

    if (startDate) records = records.filter(r => r.date >= startDate);
    if (endDate) records = records.filter(r => r.date <= endDate);

    // 日付の新しい順(降順)・セット順(ID降順)にソート
    records.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

    container.innerHTML = '';

    if (records.length === 0) {
        container.innerHTML = '<div class="text-muted text-center small py-4">条件に一致する記録がありません</div>';
        return;
    }

    records.forEach(r => {
        const fmtDate = r.date.replace(/^\d{4}-/, '').replace('-', '/');
        const item = document.createElement('div');
        item.className = 'card border-0 shadow-sm rounded-3 p-3 d-flex flex-row align-items-center justify-content-between history-list-item bg-white';
        
        let repsDisplay = `<strong class="text-dark h6 mb-0">${r.reps}</strong>`;
        if (r.assist > 0) {
            repsDisplay += ` <span class="text-primary font-monospace small">+${r.assist}</span>`;
        }

        item.innerHTML = `
            <div>
                <span class="badge bg-light text-dark font-monospace me-2">${fmtDate}</span>
                <strong class="text-danger h6 mb-0">${r.weight}</strong> <small class="text-muted">kg</small>
                <span class="mx-2 text-black-50">×</span>
                ${repsDisplay} <small class="text-muted">Reps</small>
            </div>
            <button class="btn btn-sm btn-outline-secondary border-0 rounded-circle text-danger fw-bold btn-delete-item" onclick="deleteRecord(${r.id})">×</button>
        `;
        container.appendChild(item);
    });
}

// 期間タブ切り替え（日・月・年）
async function changePeriod(period) {
    currentPeriod = period;
    document.querySelectorAll('#periodTab .nav-link').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${period}`).classList.add('active');
    
    const yearFilter = document.getElementById('year-filter-container');
    if (period === 'month') {
        await generateYearOptions();
        yearFilter.style.display = 'block';
    } else {
        yearFilter.style.display = 'none';
    }
    await updateChart();
}

// 月別モード用の年別セレクトボックス生成
async function generateYearOptions() {
    const exercise = document.getElementById('exercise-select').value;
    const records = await db.records.where('exercise').equals(exercise).toArray();
    const yearSelect = document.getElementById('year-select');
    const yearsSet = new Set();
    records.forEach(r => yearsSet.add(r.date.slice(0, 4)));
    if (yearsSet.size === 0) yearsSet.add(new Date().getFullYear().toString());

    const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
    const currentSelected = yearSelect.value;
    yearSelect.innerHTML = '';
    sortedYears.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = `${y}年`;
        yearSelect.appendChild(opt);
    });
    yearSelect.value = sortedYears.includes(currentSelected) ? currentSelected : sortedYears;
}

// 折れ線 ↔ 棒グラフ 切り替えタブ
function changeChartType(type) {
    currentChartType = type;
    document.querySelectorAll('#chartTypeTab .nav-link').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-type-${type}`).classList.add('active');
    updateChart();
}

// 統合更新関数
async function updateApp() {
    if (currentPeriod === 'month') await generateYearOptions();
    await updateChart(); // chart.js側のグラフ描画関数を呼び出す
    await updateHistoryList();
}
