// ==========================================
// 1. データベース（IndexedDB / Dexie）の初期化
// ==========================================
const db = new Dexie("WorkoutDatabase");
db.version(1).stores({
    records: '++id, date, exercise, weight, reps' // 保存するデータの基本構造
});

// 全体で使用する共通の変数
let myChart = null;           // グラフのインスタンス
let currentPeriod = 'day';     // 集計期間の初期値（日別）
let currentChartType = 'line'; // グラフタイプの初期値（折れ線）
let chartModalInstance = null; // グラフ用モーダルのインスタンス
let historyModalInstance = null; // 🟢 新設：全履歴用モーダルのインスタンス

// 画面が読み込まれたら自動的に実行する処理
window.addEventListener('DOMContentLoaded', async () => {
    // PWAサービスワーカーの登録
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.error(err));
    }
    
    // 日付入力欄の初期値を「今日の年月日(YYYY-MM-DD)」に自動設定
    document.getElementById('date-input').value = new Date().toISOString().slice(0, 10);
    
    // グラフ用モーダル要素をBootstrap機能として初期化
    const modalEl = document.getElementById('chartModal');
    if (modalEl) chartModalInstance = new bootstrap.Modal(modalEl);

    // 🟢 新設：全履歴用モーダル要素をBootstrap機能として初期化
    const historyModalEl = document.getElementById('historyModal');
    if (historyModalEl) historyModalInstance = new bootstrap.Modal(historyModalEl);

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
    if (chartModalInstance) chartModalInstance.hide();
    document.querySelector('button[onclick="openChartModal()"]').focus();
}

// 🟢 新設：全履歴モーダルを開く
async function openHistoryModal() {
    if (!historyModalInstance) return;
    const select = document.getElementById('exercise-select');
    document.getElementById('history-modal-title-text').textContent = `${select.options[select.selectedIndex].text} - 全履歴一覧`;
    
    // モーダルを開く前に、重量フィルターの選択肢をDBから最新状態にする
    await generateFilterWeightOptions();
    
    // 日付フィルターの初期化（空欄にする）
    document.getElementById('filter-start-date').value = '';
    document.getElementById('filter-end-date').value = '';

    historyModalInstance.show();
    await filterHistoryList(); // 初回表示（絞り込みなしの全件）
}

// 🟢 新設：全履歴モーダルを閉じる
function closeHistoryModal() {
    if (historyModalInstance) historyModalInstance.hide();
    document.querySelector('button[onclick="openHistoryModal()"]').focus();
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

    if (!dateInput || isNaN(weight) || isNaN(reps)) {
        alert('すべて正しく入力してください');
        return;
    }

    await db.records.add({ date: dateInput, exercise: exercise, weight: weight, reps: reps });
    await updateApp(); // 画面全体のデータを更新
}

// クイック「＋」「ー」ボタンが押されたときの計算
function adjustValue(inputId, amount) {
    const input = document.getElementById(`${inputId}-input`);
    let val = parseFloat(input.value);
    if (isNaN(val)) val = 0;
    let newVal = val + amount;
    input.value = newVal < 0 ? 0 : newVal;
}

// 履歴の削除処理
async function deleteRecord(id) {
    if (confirm('この記録を削除してもよろしいですか？')) {
        await db.records.delete(id);
        await updateApp();
        // もし全履歴モーダルが開いていたら、モーダル内のリストも再集計する
        if (document.getElementById('historyModal').classList.contains('show')) {
            await generateFilterWeightOptions();
            await filterHistoryList();
        }
    }
}

// ==========================================
// 4. メイン画面側：直近5件制限の簡易履歴リスト生成
// ==========================================
async function updateHistoryList() {
    const container = document.getElementById('recent-history-container');
    if (!container) return;
    
    const exercise = document.getElementById('exercise-select').value;
    // 🟢 変更：最新の「5件」だけを逆順（登録が新しい順）で取得するリミッターをかける
    let records = await db.records.where('exercise').equals(exercise).toArray();
    records.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    records = records.slice(0, 5);

    container.innerHTML = '';

    if (records.length === 0) {
        container.innerHTML = '<div class="text-muted text-center small py-3">記録がまだありません</div>';
        return;
    }
    
    records.forEach(r => {
        const fmtDate = r.date.replace(/^\d{4}-/, '').replace('-', '/');
        const item = document.createElement('div');
        item.className = 'card border-0 shadow-sm rounded-3 p-3 d-flex flex-row align-items-center justify-content-between history-list-item bg-white';
        item.innerHTML = `
            <div>
                <span class="badge bg-light text-dark font-monospace me-2">${fmtDate}</span>
                <strong class="text-danger h6 mb-0">${r.weight}</strong> <small class="text-muted">kg</small>
                <span class="mx-2 text-black-50">×</span>
                <strong class="text-dark h6 mb-0">${r.reps}</strong> <small class="text-muted">Reps</small>
            </div>
            <button class="btn btn-sm btn-outline-secondary border-0 rounded-circle text-danger fw-bold" onclick="deleteRecord(${r.id})">×</button>
        `;
        container.appendChild(item);
    });
}

// ==========================================
// 5. 新設：全履歴モーダル専用のフィルター・リスト生成処理
// ==========================================

// モーダル内の「重量で絞り込み」セレクトボックスの選択肢を自動生成する関数
async function generateFilterWeightOptions() {
    const exercise = document.getElementById('exercise-select').value;
    const records = await db.records.where('exercise').equals(exercise).toArray();
    const weightSelect = document.getElementById('filter-weight-select');
    if (!weightSelect) return;

    const weightsSet = new Set();
    records.forEach(r => weightsSet.add(r.weight));
    const sortedWeights = Array.from(weightsSet).sort((a, b) => b - a); // 重い順

    const currentSelected = weightSelect.value;
    weightSelect.innerHTML = '<option value="all">すべての重量</option>'; // 初期値
    
    sortedWeights.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w;
        opt.textContent = `${w} kg`;
        weightSelect.appendChild(opt);
    });

    if (currentSelected && weightSelect.querySelector(`option[value="${currentSelected}"]`)) {
        weightSelect.value = currentSelected;
    }
}

// 🟢 核心：重量と日付のフィルター条件を読み取って、全履歴リストを一瞬で絞り込む関数
async function filterHistoryList() {
    const container = document.getElementById('full-history-container');
    if (!container) return;

    const exercise = document.getElementById('exercise-select').value;
    // ベースとして、選択種目の全データを最新順（登録順の逆）で取得
    let records = await db.records.where('exercise').equals(exercise).reverse().toArray();

    // ① 重量フィルターの適用
    const selectedWeight = document.getElementById('filter-weight-select').value;
    if (selectedWeight !== 'all') {
        const targetWeight = parseFloat(selectedWeight);
        records = records.filter(r => r.weight === targetWeight);
    }

    // ② 日付フィルター（開始日・終了日）の適用
    const startDate = document.getElementById('filter-start-date').value; // YYYY-MM-DD
    const endDate = document.getElementById('filter-end-date').value;

    if (startDate) {
        records = records.filter(r => r.date >= startDate);
    }
    if (endDate) {
        records = records.filter(r => r.date <= endDate);
    }
    
    // 日付降順
    records.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

    // 画面への描画処理
    container.innerHTML = '';

    if (records.length === 0) {
        container.innerHTML = '<div class="text-muted text-center small py-4">条件に一致する記録がありません</div>';
        return;
    }

    records.forEach(r => {
        const fmtDate = r.date.replace(/^\d{4}-/, '').replace('-', '/');
        const item = document.createElement('div');
        item.className = 'card border-0 shadow-sm rounded-3 p-3 d-flex flex-row align-items-center justify-content-between history-list-item bg-white';
        item.innerHTML = `
            <div>
                <span class="badge bg-light text-dark font-monospace me-2">${fmtDate}</span>
                <strong class="text-danger h6 mb-0">${r.weight}</strong> <small class="text-muted">kg</small>
                <span class="mx-2 text-black-50">×</span>
                <strong class="text-dark h6 mb-0">${r.reps}</strong> <small class="text-muted">Reps</small>
            </div>
            <button class="btn btn-sm btn-outline-secondary border-0 rounded-circle text-danger fw-bold btn-delete-item" onclick="deleteRecord(${r.id})">×</button>
        `;
        container.appendChild(item);
    });
}

// 種目セレクトボックスが切り替わった時の全体連動
document.getElementById('exercise-select').addEventListener('change', updateApp);

// 期間タブ（日別・月別・年別）切り替え
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

// メイン画面側の定期同期処理
async function updateApp() {
    if (currentPeriod === 'month') await generateYearOptions();
    await updateChart();
    await updateHistoryList(); // 直近5件を更新
}

// ==========================================
// 6. Chart.jsによるグラフ描画・集計ロジック
// ==========================================
async function updateChart() {
    const canvas = document.getElementById('weightChart');
    if (!canvas) return;
    const exercise = document.getElementById('exercise-select').value;
    let records = await db.records.where('exercise').equals(exercise).sortBy('date');
    if (records.length === 0) { if (myChart) myChart.destroy(); myChart = null; return; }

    if (currentPeriod === 'day') records = records.slice(-30);
    else if (currentPeriod === 'month') {
        const selYear = document.getElementById('year-select').value;
        records = records.filter(r => r.date.startsWith(selYear));
    }
    if (records.length === 0) { if (myChart) myChart.destroy(); myChart = null; return; }

    const labelsSet = new Set(); const weightsSet = new Set();
    records.forEach(r => {
        let l = r.date;
        if (currentPeriod === 'month') l = r.date.slice(5, 7) + "月";
        else if (currentPeriod === 'year') l = r.date.slice(0, 4) + "年";
        labelsSet.add(l); weightsSet.add(r.weight);
    });
    const labels = Array.from(labelsSet).sort();
    const uniqueWeights = Array.from(weightsSet).sort((a, b) => a - b);
    
    const ctx = canvas.getContext('2d');
    if (myChart) myChart.destroy();

    const colors = ['#ff5722', '#2196f3', '#4caf50', '#9c27b0', '#009688', '#ffeb3b'];

    if (currentChartType === 'line') {
        const groupedLine = {}; labels.forEach(l => { groupedLine[l] = {}; });
        records.forEach(r => {
            let l = r.date;
            if (currentPeriod === 'month') l = r.date.slice(5, 7) + "月";
            else if (currentPeriod === 'year') l = r.date.slice(0, 4) + "年";
            groupedLine[l][r.weight] = groupedLine[l][r.weight] ? Math.max(groupedLine[l][r.weight], r.reps) : r.reps;
        });
        const datasets = uniqueWeights.map((w, i) => ({
            label: `${w} kg`, data: labels.map(l => groupedLine[l][w] !== undefined ? groupedLine[l][w] : null),
            borderColor: colors[i % colors.length], backgroundColor: colors[i % colors.length], borderWidth: 2, tension: 0.1, 
            spanGaps: true // 🟢 前回の要望を適用：線がブツブツ途切れずに綺麗に1本に繋がります
        }));
        myChart = new Chart(ctx, {
            type: 'line', data: { labels: labels, datasets: datasets },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false, ticks: { stepSize: 1 } } } }
        });
    } else {
        const groupedBar = {}; labels.forEach(l => { groupedBar[l] = {}; uniqueWeights.forEach(w => { groupedBar[l][w] = 0; }); });
        records.forEach(r => {
            let l = r.date;
            if (currentPeriod === 'month') l = r.date.slice(5, 7) + "月";
            else if (currentPeriod === 'year') l = r.date.slice(0, 4) + "年";
            groupedBar[l][r.weight] += (r.weight * r.reps);
        });
        const datasets = uniqueWeights.map((w, i) => ({
            label: `${w} kg`, data: labels.map(l => groupedBar[l][w]), backgroundColor: colors[i % colors.length], borderColor: colors[i % colors.length], borderWidth: 1
        }));
        myChart = new Chart(ctx, {
            type: 'bar', data: { labels: labels, datasets: datasets },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
        });
    }
}

// ==========================================
// 7. データ管理ロジック（ハンバーガーメニュー内連動）
// ==========================================
async function exportData() {
    const allRecords = await db.records.toArray();
    const fileName = `workout_backup_${new Date().toISOString().slice(0,10).replace(/-/g, '_')}.json`;
    const file = new File([JSON.stringify(allRecords, null, 2)], fileName, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Workout Data Backup' }); } catch (err) { console.log(err); }
    } else {
        const anchor = document.createElement("a"); anchor.download = fileName;
        anchor.href = window.URL.createObjectURL(new Blob([JSON.stringify(allRecords, null, 2)], { type: "application/json" }));
        anchor.click();
    }
}

function importData(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) throw new Error();
            if (confirm(`データを復元しますか？`)) {
                for (const r of imported) {
                    await db.records.add(
                        { 
                            date: r.date, 
                            exercise: r.exercise, 
                            weight: r.weight, 
                            reps: r.reps 
                        }
                    ); 
                }
                alert('完了しました！');
                await updateApp();
                if (document.getElementById('historyModal').classList.contains('show')) {
                    await generateFilterWeightOptions();await filterHistoryList();
                }
            }
        } catch (err) { 
            alert('失敗しました。'); 
        }
    };
    reader.readAsText(file);
}