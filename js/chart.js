// ==========================================
// 📊 統合グラフ描画ロジック（chart.js専用）
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
        const selYear = document.getElementById('year-select').value;
        records = records.filter(r => r.date.startsWith(selYear)); // 月別は選択年のみに絞る
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
    const colors = ['#ff5722', '#2196f3', '#4caf50', '#9c27b0', '#009688', '#ffeb3b'];

    // 2. 🟢 3択のグラフタイプ（自力折れ線、補助込み折れ線、総負荷棒グラフ）に応じて分岐
    if (currentChartType === 'line') {
        // 【パターンA：📈 折れ線（自力回数のみ）モード】
        const groupedLine = {}; labels.forEach(l => { groupedLine[l] = {}; });
        records.forEach(r => {
            let l = r.date;
            if (currentPeriod === 'month') l = r.date.slice(5, 7) + "月";
            else if (currentPeriod === 'year') l = r.date.slice(0, 4) + "年";
            
            // 純粋な自力回数（r.reps）の最大値を集計
            groupedLine[l][r.weight] = groupedLine[l][r.weight] ? Math.max(groupedLine[l][r.weight], r.reps) : r.reps;
        });

        const datasets = uniqueWeights.map((w, i) => ({
            label: `${w} kg (自力)`, 
            data: labels.map(l => groupedLine[l][w] !== undefined ? groupedLine[l][w] : null),
            borderColor: colors[i % colors.length], 
            backgroundColor: colors[i % colors.length], 
            borderWidth: 2, 
            tension: 0.1, 
            spanGaps: true
        }));

        myChart = new Chart(ctx, {
            type: 'line', 
            data: { labels: labels, datasets: datasets },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { title: { display: true, text: '最高自力回数推移（補助なし）' } },
                scales: { y: { beginAtZero: false, ticks: { stepSize: 1 } } } 
            }
        });
    }
    else if (currentChartType === 'line-assist') {
        // 【パターンB：💪 折れ線（補助込み合計回数）モード】
        const groupedLineAssist = {}; labels.forEach(l => { groupedLineAssist[l] = {}; });
        records.forEach(r => {
            let l = r.date;
            if (currentPeriod === 'month') l = r.date.slice(5, 7) + "月";
            else if (currentPeriod === 'year') l = r.date.slice(0, 4) + "年";
            
            // 🟢 補助回数（r.assist）がなければ0として、自力回数と合算（総レップ数）
            const assistReps = r.assist ? parseInt(r.assist) : 0;
            const totalReps = r.reps + assistReps;
            
            // 合計回数の最大値を集計
            groupedLineAssist[l][r.weight] = groupedLineAssist[l][r.weight] ? Math.max(groupedLineAssist[l][r.weight], totalReps) : totalReps;
        });

        const datasets = uniqueWeights.map((w, i) => ({
            label: `${w} kg (補助込)`, 
            data: labels.map(l => groupedLineAssist[l][w] !== undefined ? groupedLineAssist[l][w] : null),
            borderColor: colors[i % colors.length], 
            backgroundColor: colors[i % colors.length], 
            borderWidth: 2, 
            pointStyle: 'rectRot', // 自力グラフと見分けやすくするため、点の形をひし形に変更
            pointRadius: 6,
            tension: 0.1, 
            spanGaps: true
        }));

        myChart = new Chart(ctx, {
            type: 'line', 
            data: { labels: labels, datasets: datasets },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { title: { display: true, text: '最高合計回数推移（自力 ＋ 補助）' } },
                scales: { y: { beginAtZero: false, ticks: { stepSize: 1 } } } 
            }
        });
    } 
    else {
        // 【パターンC：📊 積み上げ棒グラフ（総負荷ボリューム）モード】
        const groupedBar = {}; labels.forEach(l => { groupedBar[l] = {}; uniqueWeights.forEach(w => { groupedBar[l][w] = 0; }); });
        records.forEach(r => {
            let l = r.date;
            if (currentPeriod === 'month') l = r.date.slice(5, 7) + "月";
            else if (currentPeriod === 'year') l = r.date.slice(0, 4) + "年";
            
            // 🟢 総ボリューム計算時にも、補助回数を含めた総負荷として計算（重量 ×（自力 ＋ 補助））
            const assistReps = r.assist ? parseInt(r.assist) : 0;
            const totalVolume = r.weight * (r.reps + assistReps);
            
            groupedBar[l][r.weight] += totalVolume;
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
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { title: { display: true, text: '総ボリューム集計（重量 × 総回数）' } },
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } 
            }
        });
    }
}
