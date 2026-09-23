// 📊 グラフ描画・集計ロジック（chart.js専用）
async function updateChart() {
    const canvas = document.getElementById('weightChart');
    if (!canvas) return;
    const exercise = document.getElementById('exercise-select').value;
    
    // データベースから選択種目の全データを日付順で取得
    let records = await db.records.where('exercise').equals(exercise).sortBy('date');
    if (records.length === 0) { if (myChart) myChart.destroy(); myChart = null; return; }

    // 🟢 期間に応じたデータ事前フィルタリング処理
    if (currentPeriod === 'day') {
        records = records.slice(-30); // 日別は最新の30件に絞る
    } else if (currentPeriod === 'month') {
        const selYear = document.getElementById('year-select').value;
        records = records.filter(r => r.date.startsWith(selYear)); // 月別は選択年のみに絞る
    }

    if (records.length === 0) { if (myChart) myChart.destroy(); myChart = null; return; }

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
    if (myChart) myChart.destroy(); // 古いグラフを安全に破棄

    const colors = ['#ff5722', '#2196f3', '#4caf50', '#9c27b0', '#009688', '#ffeb3b'];

    if (currentChartType === 'line') {
        // 【A：折れ線グラフ（最高回数）モード】
        const groupedLine = {}; labels.forEach(l => { groupedLine[l] = {}; });
        records.forEach(r => {
            let l = r.date;
            if (currentPeriod === 'month') l = r.date.slice(5, 7) + "月";
            else if (currentPeriod === 'year') l = r.date.slice(0, 4) + "年";
            groupedLine[l][r.weight] = groupedLine[l][r.weight] ? Math.max(groupedLine[l][r.weight], r.reps) : r.reps;
        });
        const datasets = uniqueWeights.map((w, i) => ({
            label: `${w} kg`, 
            data: labels.map(l => groupedLine[l][w] !== undefined ? groupedLine[l][w] : null),
            borderColor: colors[i % colors.length], 
            backgroundColor: colors[i % colors.length], 
            borderWidth: 2, 
            tension: 0.1, 
            spanGaps: true // 線を綺麗に繋ぐ
        }));
        myChart = new Chart(ctx, {
            type: 'line', 
            data: { labels: labels, datasets: datasets },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false, ticks: { stepSize: 1 } } } }
        });
    } else {
        // 【B：積み上げ棒グラフ（総負荷ボリューム）モード】
        const groupedBar = {}; labels.forEach(l => { groupedBar[l] = {}; uniqueWeights.forEach(w => { groupedBar[l][w] = 0; }); });
        records.forEach(r => {
            let l = r.date;
            if (currentPeriod === 'month') l = r.date.slice(5, 7) + "月";
            else if (currentPeriod === 'year') l = r.date.slice(0, 4) + "年";
            groupedBar[l][r.weight] += (r.weight * r.reps);
        });
        const datasets = uniqueWeights.map((w, i) => ({
            label: `${w} kg`, 
            data: labels.map(l => groupedBar[l][w]), 
            backgroundColor: colors[i % colors.length], 
            borderColor: colors[i % colors.length], 
            borderWidth: 1
        }));
        myChart = new Chart(ctx, {
            type: 'bar', 
            data: { labels: labels, datasets: datasets },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
        });
    }
}
