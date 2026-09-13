const db = new Dexie("WorkoutDatabase");
db.version(1).stores({
    records: '++id, date, exercise, weight, reps'
});

let myChart = null;
let currentPeriod = 'day';
let currentChartType = 'line';

window.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(err => console.error(err));
    }
    
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('date-input').value = today;

    await updateApp();
});

// データの追加
async function addRecord() {
    const dateInput = document.getElementById('date-input').value;
    const exercise = document.getElementById('exercise-select').value;
    const weight = parseFloat(document.getElementById('weight-input').value);
    const reps = parseInt(document.getElementById('reps-input').value);

    if (!dateInput || isNaN(weight) || isNaN(reps)) {
        alert('すべて正しく入力してください');
        return;
    }

    await db.records.add({
        date: dateInput,
        exercise: exercise,
        weight: weight,
        reps: reps
    });

    // 🟢 変更：次のセットのために、入力欄をクリアせず「直前の数値」をあえて残したままにする！
    //（weight-input と reps-input の初期化行を削除しました）

    await updateApp();
}

// 🟢 新設：クイック増減ボタンが押されたときの計算処理
function adjustValue(inputId, amount) {
    const input = document.getElementById(`${inputId}-input`);
    let currentValue = parseFloat(input.value);
    
    // まだ何も入力されていない（空っぽ）なら 0 からスタート
    if (isNaN(currentValue)) {
        currentValue = 0;
    }
    
    // 計算して、マイナス値にならないように制御（最低値0）
    let newValue = currentValue + amount;
    if (newValue < 0) newValue = 0;
    
    input.value = newValue;
}

// データの削除
async function deleteRecord(id) {
    if (confirm('この記録を削除してもよろしいですか？')) {
        await db.records.delete(id);
        await updateApp();
    }
}

// 期間切り替え
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

    updateApp();
}

// 年の選択肢自動生成
async function generateYearOptions() {
    const currentExercise = document.getElementById('exercise-select').value;
    const records = await db.records.where('exercise').equals(currentExercise).toArray();
    const yearSelect = document.getElementById('year-select');
    
    const yearsSet = new Set();
    records.forEach(r => {
        const year = r.date.slice(0, 4);
        yearsSet.add(year);
    });

    if (yearsSet.size === 0) {
        yearsSet.add(new Date().getFullYear().toString());
    }

    const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
    const currentSelected = yearSelect.value;

    yearSelect.innerHTML = '';
    sortedYears.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = `${y}年`;
        yearSelect.appendChild(opt);
    });

    if (sortedYears.includes(currentSelected)) {
        yearSelect.value = currentSelected;
    } else {
        yearSelect.value = sortedYears[0];
    }
}

// グラフタイプの切り替え
function changeChartType(type) {
    currentChartType = type;
    document.querySelectorAll('#chartTypeTab .nav-link').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-type-${type}`).classList.add('active');
    updateChart();
}

// 統合更新関数
async function updateApp() {
    if (currentPeriod === 'month') {
        await generateYearOptions();
    }
    await updateChart();
    await updateHistoryList();
}

// 履歴リストの表示
async function updateHistoryList() {
    const container = document.getElementById('history-container');
    if (!container) return;

    const currentExercise = document.getElementById('exercise-select').value;
    const records = await db.records.where('exercise').equals(currentExercise).reverse().toArray();

    container.innerHTML = '';

    if (records.length === 0) {
        container.innerHTML = '<div class="text-muted text-center small py-3">記録がまだありません</div>';
        return;
    }

    records.forEach(r => {
        const formattedDate = r.date.replace(/^\d{4}-/, '').replace('-', '/');
        const item = document.createElement('div');
        item.className = 'card border-0 shadow-sm rounded-3 p-3 d-flex flex-row align-items-center justify-content-between history-list-item bg-white';
        item.innerHTML = `
            <div>
                <span class="badge bg-light text-dark font-monospace me-2">${formattedDate}</span>
                <strong class="text-danger h6 mb-0">${r.weight}</strong> <small class="text-muted">kg</small>
                <span class="mx-2 text-black-50">×</span>
                <strong class="text-dark h6 mb-0">${r.reps}</strong> <small class="text-muted">Reps</small>
            </div>
            <button class="btn btn-sm btn-outline-secondary border-0 rounded-circle text-danger fw-bold btn-delete-item" onclick="deleteRecord(${r.id})">×</button>
        `;
        container.appendChild(item);
    });
}

document.getElementById('exercise-select').addEventListener('change', updateApp);

// 📊 グラフ描画
async function updateChart() {
    const currentExercise = document.getElementById('exercise-select').value;
    let rawRecords = await db.records.where('exercise').equals(currentExercise).sortBy('date');

    if (rawRecords.length === 0) {
        if (myChart) myChart.destroy();
        myChart = null;
        return;
    }

    if (currentPeriod === 'day') {
        rawRecords = rawRecords.slice(-30);
    } else if (currentPeriod === 'month') {
        const selectedYear = document.getElementById('year-select').value;
        rawRecords = rawRecords.filter(r => r.date.startsWith(selectedYear));
    }

    if (rawRecords.length === 0) {
        if (myChart) myChart.destroy();
        myChart = null;
        return;
    }

    const allLabelsSet = new Set();
    const allWeightsSet = new Set();

    rawRecords.forEach(r => {
        let label = r.date;
        if (currentPeriod === 'month') label = r.date.slice(5, 7) + "月";
        else if (currentPeriod === 'year') label = r.date.slice(0, 4) + "年";
        allLabelsSet.add(label);
        allWeightsSet.add(r.weight);
    });

    const labels = Array.from(allLabelsSet).sort();
    const uniqueWeights = Array.from(allWeightsSet).sort((a, b) => a - b);

    const ctx = document.getElementById('weightChart').getContext('2d');
    if (myChart) myChart.destroy();

    const colors = ['#ff5722', '#2196f3', '#4caf50', '#9c27b0', '#009688', '#ffeb3b'];

    if (currentChartType === 'line') {
        const groupedLine = {};
        labels.forEach(l => { groupedLine[l] = {}; });

        rawRecords.forEach(r => {
            let label = r.date;
            if (currentPeriod === 'month') label = r.date.slice(5, 7) + "月";
            else if (currentPeriod === 'year') label = r.date.slice(0, 4) + "年";

            if (!groupedLine[label][r.weight]) {
                groupedLine[label][r.weight] = r.reps;
            } else {
                groupedLine[label][r.weight] = Math.max(groupedLine[label][r.weight], r.reps);
            }
        });

        const datasets = uniqueWeights.map((weight, index) => {
            const color = colors[index % colors.length];
            return {
                label: `${weight} kg`,
                data: labels.map(l => groupedLine[l][weight] !== undefined ? groupedLine[l][weight] : null),
                borderColor: color,
                backgroundColor: color,
                borderWidth: 2,
                tension: 0.1,
                spanGaps: false
            };
        });

        myChart = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                plugins: { title: { display: true, text: '最高回数推移（MAX Reps）' } },
                scales: {
                    x: { title: { display: true, text: '日程・期間' } },
                    y: { title: { display: true, text: '最高回数 (Reps)' }, beginAtZero: false, ticks: { stepSize: 1 } }
                }
            }
        });

    } else {
        const groupedBar = {};
        labels.forEach(l => {
            groupedBar[l] = {};
            uniqueWeights.forEach(w => { groupedBar[l][w] = 0; });
        });

        rawRecords.forEach(r => {
            let label = r.date;
            if (currentPeriod === 'month') label = r.date.slice(5, 7) + "月";
            else if (currentPeriod === 'year') label = r.date.slice(0, 4) + "年";
            groupedBar[label][r.weight] += (r.weight * r.reps);
        });

        const datasets = uniqueWeights.map((weight, index) => {
            const color = colors[index % colors.length];
            return {
                label: `${weight} kg`,
                data: labels.map(l => groupedBar[l][weight]),
                backgroundColor: color,
                borderColor: color,
                borderWidth: 1
            };
        });

        myChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                plugins: { title: { display: true, text: '総ボリューム集計 (重量×回数×セット数)' } },
                scales: {
                    x: { stacked: true, title: { display: true, text: '日程・期間' } },
                    y: { stacked: true, title: { display: true, text: '総負荷重量 (kg)' }, beginAtZero: true }
                }
            }
        });
    }
}

// バックアップ
async function exportData() {
    const allRecords = await db.records.toArray();
    const jsonString = JSON.stringify(allRecords, null, 2);
    const fileName = `workout_backup_${new Date().toISOString().slice(0,10).replace(/-/g, '_')}.json`;
    const file = new File([jsonString], fileName, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Workout Data Backup' }); } catch (err) { console.log(err); }
    } else {
        const blob = new Blob([jsonString], { type: "application/json" });
        const anchor = document.createElement("a");
        anchor.download = fileName;
        anchor.href = window.URL.createObjectURL(blob);
        anchor.click();
    }
}

function importData(event) {
    const file = event.target.files;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importedRecords = JSON.parse(e.target.result);
            if (!Array.isArray(importedRecords)) throw new Error();
            if (confirm(`データを復元しますか？`)) {
                for (const record of importedRecords) {
                    await db.records.add({
                        date: record.date,
                        exercise: record.exercise,
                        weight: record.weight,
                        reps: record.reps
                    });
                }
                alert('完了しました！');
                await updateApp();
            }
        } catch (err) { alert('失敗しました。'); }
    };
    reader.readAsText(file);
}
