// ==========================================
// 📊 4パターン描き分け対応：グラフ描画ロジック
// ==========================================
async function updateChart() {
    const canvas = document.getElementById('weightChart');
    if (!canvas) return;
    const exercise = document.getElementById('exercise-select').value;

    // データベースから選択種目の全データを取得（日付順）
    let records = await db.records.where('exercise').equals(exercise).sortBy('date');
    if (records.length === 0) { if (myChart) myChart.destroy(); myChart = null; return; }

    // 1. 期間（日・月・年）に応じたデータ事前フィルタリング
    if (currentPeriod === 'day') {
        records = records.slice(-30); // 日別は最新の30セットに絞る
    } else if (currentPeriod === 'month') {
// 🟢 【新規追加】プルダウン要素を取得
        const yearSelect = document.getElementById('year-select');

        if (yearSelect) {
            // もしプルダウンの初期値が空っぽ（選択されていない）場合
            if (!yearSelect.value && records.length > 0) {
                // データベースの一番最後のデータ（＝最新データ）から「年（最初の4文字）」を抽出
                const latestYear = records[records.length - 1].date.slice(0, 4);
                // プルダウンの選択状態を最新年に強制セットする
                yearSelect.value = latestYear;
            }
        }

        // 選択された年のデータのみに絞り込む（ここは既存の処理のままです）
        const selYear = yearSelect ? yearSelect.value : '';
        records = records.filter(r => r.date.startsWith(selYear));
    }
    if (records.length === 0) { if (myChart) myChart.destroy(); myChart = null; return; }

    // 横軸のラベルと、存在する重量の種類を把握する
    const labelsSet = new Set();
    const weightsSet = new Set();

    records.forEach(r => {
        let l = r.date;
        if (currentPeriod === 'month') l = r.date.slice(5, 7) + "月";
        else if (currentPeriod === 'year') l = r.date.slice(0, 4) + "年";
        labelsSet.add(l);
        weightsSet.add(r.weight);
    });

    const labels = Array.from(labelsSet).sort();
    const uniqueWeights = Array.from(weightsSet).sort((a, b) => a - b);

    const ctx = canvas.getContext('2d');
    if (myChart) myChart.destroy(); // 古いグラフを破棄

    // グラフの線に使用するカラーパレット
    const colors = [
        '#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33F3', '#33FFF0',
        '#FFA500', '#8A2BE2', '#00CED1', '#FF1493', '#7FFF00', '#FF4500'
    ];

    // 2. 🟢 4つのグラフタイプ（自力線、補助線、自力棒、補助棒）に応じて集計・描画を分岐
    if (currentChartType === 'line') {
        // 【パターン1：📈 折れ線（自力回数のみ）モード】
        const groupedLine = {}; labels.forEach(l => { groupedLine[l] = {}; });
        records.forEach(r => {
            let l = r.date;
            if (currentPeriod === 'month') l = r.date.slice(5, 7) + "月";
            else if (currentPeriod === 'year') l = r.date.slice(0, 4) + "年";

            // 純粋な自力回数（r.reps）の最大値を集計
            groupedLine[l][r.weight] = groupedLine[l][r.weight] ? Math.max(groupedLine[l][r.weight], r.reps) : r.reps;
        });

        // TODO:グラフ作成共有化
        const datasets = uniqueWeights.map((w, i) => ({
            label: `${w} kg`,
            data: labels.map(l => groupedLine[l][w] !== undefined ? groupedLine[l][w] : null),
            borderColor: colors[i % colors.length],
            backgroundColor: colors[i % colors.length],
            borderWidth: 2, tension: 0.1, spanGaps: true,
            // マーカークリックしやすく
            pointRadius: 4,
            pointHoverRadius: 6,
            pointHitRadius: 20
        }));

        myChart = new Chart(ctx, {
            type: 'line', data: { labels: labels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false }, // 🟢 反応を良くする
                plugins: {
                    title: { display: true, text: '最高自力回数推移（補助なし）' },
                    legend: { labels: { font: { size: 14 } } } // 🟢 凡例を大きく
                },
                scales: { y: { beginAtZero: false, ticks: { stepSize: 1 } } }
            }
        });
    }
    else if (currentChartType === 'line-assist') {
        // 【パターン2：💪 折れ線（補助込み合計回数）モード】
        const groupedLineAssist = {}; labels.forEach(l => { groupedLineAssist[l] = {}; });
        records.forEach(r => {
            let l = r.date;
            if (currentPeriod === 'month') l = r.date.slice(5, 7) + "月";
            else if (currentPeriod === 'year') l = r.date.slice(0, 4) + "年";

            const assistReps = r.assist ? parseInt(r.assist) : 0;
            const totalReps = r.reps + assistReps; // 自力 ＋ 補助

            groupedLineAssist[l][r.weight] = groupedLineAssist[l][r.weight] ? Math.max(groupedLineAssist[l][r.weight], totalReps) : totalReps;
        });

        const datasets = uniqueWeights.map((w, i) => ({
            label: `${w} kg`,
            data: labels.map(l => groupedLineAssist[l][w] !== undefined ? groupedLineAssist[l][w] : null),
            borderColor: colors[i % colors.length], backgroundColor: colors[i % colors.length],
            borderWidth: 2, pointStyle: 'rectRot', pointRadius: 6, tension: 0.1, spanGaps: true,
            // マーカークリックしやすく
            pointRadius: 4,
            pointHoverRadius: 6,
            pointHitRadius: 20
        }));

        myChart = new Chart(ctx, {
            type: 'line', data: { labels: labels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false }, // 🟢 反応を良くする
                plugins: {
                    title: { display: true, text: '最高合計回数推移（自力 ＋ 補助）' }, 
                    legend: { labels: { font: { size: 14 } } } // 🟢 凡例を大きく
                },
                scales: { y: { beginAtZero: false, ticks: { stepSize: 1 } } }
            }
        });
    }
    else if (currentChartType === 'bar') {
        // 【パターン3：📊 積み上げ棒グラフ（自力ボリュームのみ）モード】
        const groupedBar = {}; labels.forEach(l => { groupedBar[l] = {}; uniqueWeights.forEach(w => { groupedBar[l][w] = 0; }); });

        records.forEach(r => {
            let l = r.date;
            if (currentPeriod === 'month') l = r.date.slice(5, 7) + "月";
            else if (currentPeriod === 'year') l = r.date.slice(0, 4) + "年";

            // 🟢 純粋な「重量 × 自力回数」だけで総負荷量を計算
            const selfVolume = r.weight * r.reps;
            groupedBar[l][r.weight] += selfVolume;
        });

        const datasets = uniqueWeights.map((w, i) => ({
            label: `${w} kg`,
            data: labels.map(l => groupedBar[l][w]),
            backgroundColor: colors[i % colors.length],
            borderColor: colors[i % colors.length],
            borderWidth: 1,
            // マーカークリックしやすく
            pointRadius: 4,
            pointHoverRadius: 6,
            pointHitRadius: 20
        }));

        myChart = new Chart(ctx, {
            type: 'bar', data: { labels: labels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false }, // 🟢 反応を良くする
                plugins: { 
                    title: { display: true, text: '総ボリューム集計（重量 × 自力回数のみ）' },
                    legend: { labels: { font: { size: 14 } } } // 🟢 凡例を大きく
                },
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
            }
        });
    }
    else if (currentChartType === 'bar-assist') {
        // 【パターン4：🧱 積み上げ棒グラフ（補助込み総ボリューム）モード】
        const groupedBarAssist = {}; labels.forEach(l => { groupedBarAssist[l] = {}; uniqueWeights.forEach(w => { groupedBarAssist[l][w] = 0; }); });

        records.forEach(r => {
            let l = r.date;
            if (currentPeriod === 'month') l = r.date.slice(5, 7) + "月";
            else if (currentPeriod === 'year') l = r.date.slice(0, 4) + "年";

            // 🟢 自力回数 ＋ 補助回数の「総回数」を反映
            const assistReps = r.assist ? parseInt(r.assist) : 0;
            const totalReps = r.reps + assistReps;

            // 重量 × 総回数 で、限界を超えた全体の総負荷量を計算
            const totalVolume = r.weight * totalReps;
            groupedBarAssist[l][r.weight] += totalVolume;
        });

        const datasets = uniqueWeights.map((w, i) => ({
            label: `${w} kg`,
            data: labels.map(l => groupedBarAssist[l][w]),
            backgroundColor: colors[i % colors.length],
            borderColor: colors[i % colors.length],
            borderWidth: 1,
            // マーカークリックしやすく
            pointRadius: 4,
            pointHoverRadius: 6,
            pointHitRadius: 20
        }));

        myChart = new Chart(ctx, {
            type: 'bar', data: { labels: labels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false }, // 🟢 反応を良くする
                plugins: { 
                    title: { display: true, text: '総ボリューム集計（重量 × 総回数）' },
                    legend: { labels: { font: { size: 14 } } } // 🟢 凡例を大きく
                },
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
            }
        });
    }
}
