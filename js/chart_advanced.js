let myAdvancedChart = null; 

if (typeof closeChartModal !== 'function') {
    window.closeChartModal = function() {};
}

async function updateAdvancedChart() {
    const canvas = document.getElementById('weightChartAdvanced');
    if (!canvas) return;
    const exercise = document.getElementById('exercise-select').value;

    let records = await db.records.where('exercise').equals(exercise).sortBy('date');
    if (records.length === 0) { if (myAdvancedChart) myAdvancedChart.destroy(); myAdvancedChart = null; return; }

    if (currentPeriod === 'day') {
        records = records.slice(-30);
    } else if (currentPeriod === 'month') {
        const yearSelectAdv = document.getElementById('year-select-advanced');
        if (yearSelectAdv) {
            // 🟢 変更：.sort((a, b) => b - a) を指定し、新しい年が上に来る「降順」に正しく並び替えます
            const allYears = Array.from(new Set(records.map(r => r.date.slice(0, 4)))).sort((a, b) => b - a);
            
            if (yearSelectAdv.innerHTML === '' || yearSelectAdv.innerHTML.trim() === '') {
                allYears.forEach(y => {
                    const opt = document.createElement('option');
                    opt.value = y;
                    opt.text = `${y}年`;
                    yearSelectAdv.appendChild(opt);
                });
            }
            // 🟢 変更：降順（新しい順）にしたため、配列の最初 [0] に入っている「最新の年」を確実に初期値にセットします
            if (!yearSelectAdv.value && allYears.length > 0) {
                yearSelectAdv.value = allYears[0];
            }
        }
        const selYear = yearSelectAdv ? yearSelectAdv.value : '';
        records = records.filter(r => r.date.startsWith(selYear));
    }
    if (records.length === 0) { if (myAdvancedChart) myAdvancedChart.destroy(); myAdvancedChart = null; return; }

    const labelsSet = new Set();
    const weightsSet = new Set();
    records.forEach(r => {
        let l = (currentPeriod === 'month') ? r.date.slice(5, 7) + "月" : (currentPeriod === 'year') ? r.date.slice(0, 4) + "年" : r.date;
        labelsSet.add(l); weightsSet.add(r.weight);
    });

    const labels = Array.from(labelsSet).sort();
    const uniqueWeights = Array.from(weightsSet).sort((a, b) => a - b);

    const groups = Array.from(new Set(uniqueWeights.map(w => Math.floor(w / 10) * 10))).sort((a, b) => a - b);
    const targetInitialGroups = groups.slice(-4);

    if (myAdvancedChart) myAdvancedChart.destroy(); 

    const colors = [
        '#FF5733', '#33FF57', '#3357FF', '#D4AF37', '#FF33F3', '#33FFF0',
        '#FFA500', '#8A2BE2', '#00CED1', '#FF1493', '#7FFF00', '#FF4500'
    ];
    let chartType = 'line';
    
    let chartOptions = {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: true },
        plugins: { 
            title: { display: true, text: '' }, 
            legend: { display: false } 
        },
        scales: { y: { beginAtZero: false, ticks: { stepSize: 1 } } }
    };

    const groupedData = {}; labels.forEach(l => { groupedData[l] = {}; });

    if (currentChartType === 'line') {
        chartOptions.plugins.title.text = '最高自力回数推移（補助なし）';
        records.forEach(r => {
            let l = (currentPeriod === 'month') ? r.date.slice(5, 7) + "月" : (currentPeriod === 'year') ? r.date.slice(0, 4) + "年" : r.date;
            groupedData[l][r.weight] = groupedData[l][r.weight] ? Math.max(groupedData[l][r.weight], r.reps) : r.reps;
        });
    } 
    else if (currentChartType === 'line-assist') {
        chartOptions.plugins.title.text = '最高合計回数推移（自力 ＋ 補助）';
        records.forEach(r => {
            let l = (currentPeriod === 'month') ? r.date.slice(5, 7) + "月" : (currentPeriod === 'year') ? r.date.slice(0, 4) + "年" : r.date;
            const totalReps = r.reps + (r.assist ? parseInt(r.assist) : 0);
            groupedData[l][r.weight] = groupedData[l][r.weight] ? Math.max(groupedData[l][r.weight], totalReps) : totalReps;
        });
    } 
    else if (currentChartType === 'bar') {
        chartType = 'bar';
        chartOptions.plugins.title.text = '総ボリューム集計（重量 × 自力回数のみ）';
        chartOptions.scales.x = { stacked: true };
        chartOptions.scales.y = { stacked: true, beginAtZero: true };
        labels.forEach(l => { uniqueWeights.forEach(w => { groupedData[l][w] = 0; }); });
        records.forEach(r => {
            let l = (currentPeriod === 'month') ? r.date.slice(5, 7) + "月" : (currentPeriod === 'year') ? r.date.slice(0, 4) + "年" : r.date;
            groupedData[l][r.weight] += (r.weight * r.reps);
        });
    }
    else {
        chartType = 'bar';
        chartOptions.plugins.title.text = '総ボリューム集計（重量 × 補助込み回数）';
        chartOptions.scales.x = { stacked: true };
        chartOptions.scales.y = { stacked: true, beginAtZero: true };
        labels.forEach(l => { uniqueWeights.forEach(w => { groupedData[l][w] = 0; }); });
        records.forEach(r => {
            let l = (currentPeriod === 'month') ? r.date.slice(5, 7) + "月" : (currentPeriod === 'year') ? r.date.slice(0, 4) + "年" : r.date;
            const totalReps = r.reps + (r.assist ? parseInt(r.assist) : 0);
            groupedData[l][r.weight] += (r.weight * totalReps);
        });
    }
    const datasets = uniqueWeights.map((w, i) => {
        const isLine = (chartType === 'line');
        const myGroup = Math.floor(w / 10) * 10;
        const isTargetGroup = targetInitialGroups.includes(myGroup);
        const weightsInGroup = uniqueWeights.filter(weight => Math.floor(weight / 10) * 10 === myGroup);
        const isFirstWeightInGroup = (weightsInGroup[0] === w); // 🟢バグ修正：[0]を付与し各グループの最小重量を正しく抽出

        return {
            label: `${w} kg`,
            data: labels.map(l => (groupedData[l][w] !== undefined && groupedData[l][w] !== 0) ? groupedData[l][w] : (isLine ? null : 0)),
            borderColor: colors[i % colors.length],
            backgroundColor: colors[i % colors.length],
            borderWidth: isLine ? 2 : 1,
            tension: isLine ? 0.1 : undefined,
            spanGaps: isLine ? true : undefined,
            pointRadius: isLine ? 4 : undefined,
            pointHoverRadius: isLine ? 6 : undefined,
            pointHitRadius: 25,
            hidden: !(isTargetGroup && isFirstWeightInGroup)
        };
    });

    myAdvancedChart = new Chart(canvas, { type: chartType, data: { labels: labels, datasets: datasets }, options: chartOptions });

    setupTwoStageFilterAdvanced(groups, uniqueWeights, datasets);
}

function setupTwoStageFilterAdvanced(groups, uniqueWeights, datasets) {
    const groupContainer = document.getElementById('weightGroupContainerAdvanced');
    const buttonContainer = document.getElementById('weightButtonContainerAdvanced');
    if (!groupContainer || !buttonContainer) return;

    groupContainer.innerHTML = ''; buttonContainer.innerHTML = '';
    let activeGroup = groups[groups.length - 1];
    const weightButtonsMap = [];

    datasets.forEach((dataset, index) => {
        const w = uniqueWeights[index];
        const btn = document.createElement('button');
        btn.type = 'button'; btn.innerText = dataset.label;
        btn.style.padding = '5px 12px'; btn.style.fontSize = '13px'; btn.style.borderRadius = '15px';
        btn.style.cursor = 'pointer'; btn.style.fontWeight = 'bold'; btn.style.margin = '2px'; btn.style.transition = 'all 0.15s';

        const setBtnColor = (isHidden) => {
            btn.style.border = isHidden ? '2px solid #555555' : `2px solid ${dataset.borderColor}`;
            btn.style.backgroundColor = isHidden ? '#222222' : dataset.borderColor;
            btn.style.color = isHidden ? '#aaaaaa' : '#ffffff';
        };
        setBtnColor(dataset.hidden);

        btn.onclick = () => {
            dataset.hidden = !dataset.hidden;
            setBtnColor(dataset.hidden);
            myAdvancedChart.update(); 
        };
        weightButtonsMap.push({ group: Math.floor(w / 10) * 10, element: btn });
    });

    const renderGroupButtons = () => {
        groupContainer.innerHTML = '';
        groups.forEach(g => {
            const gBtn = document.createElement('button');
            gBtn.type = 'button'; gBtn.innerText = `${g}kg台`;
            gBtn.style.padding = '4px 10px'; gBtn.style.fontSize = '12px'; gBtn.style.borderRadius = '6px'; gBtn.style.cursor = 'pointer'; gBtn.style.fontWeight = 'bold';
            const isActive = (g === activeGroup);
            gBtn.style.backgroundColor = isActive ? '#007bff' : '#333333';
            gBtn.style.color = isActive ? '#ffffff' : '#cccccc';
            gBtn.style.border = isActive ? '1px solid #007bff' : '1px solid #444444';
            gBtn.onclick = () => { activeGroup = g; renderGroupButtons(); renderDetailButtons(); };
            groupContainer.appendChild(gBtn);
        });
    };

    const renderDetailButtons = () => {
        buttonContainer.innerHTML = '';
        weightButtonsMap.forEach(item => { if (item.group === activeGroup) buttonContainer.appendChild(item.element); });
    };
    renderGroupButtons(); renderDetailButtons();
}

function changePeriodAdvanced(period) {
    currentPeriod = period;
    document.querySelectorAll('#periodTabAdvanced .nav-link').forEach(btn => btn.classList.remove('active'));
    if (period === 'day') document.getElementById('btn-day-adv').classList.add('active');
    if (period === 'month') document.getElementById('btn-month-adv').classList.add('active');
    if (period === 'year') document.getElementById('btn-year-adv').classList.add('active');

    const yearContainer = document.getElementById('year-filter-container-advanced');
    if (yearContainer) yearContainer.style.display = (period === 'month') ? 'block' : 'none';

    updateAdvancedChart();
}

function changeChartTypeAdvanced(type) {
    currentChartType = type;
    document.querySelectorAll('#chartTypeTabLineAdvanced .nav-link, #chartTypeTabBarAdvanced .nav-link').forEach(btn => btn.classList.remove('active'));
    if (type === 'line') document.getElementById('btn-type-line-adv').classList.add('active');
    if (type === 'line-assist') document.getElementById('btn-type-line-assist-adv').classList.add('active');
    if (type === 'bar') document.getElementById('btn-type-bar-adv').classList.add('active');
    if (type === 'bar-assist') document.getElementById('btn-type-bar-assist-adv').classList.add('active');

    updateAdvancedChart();
}

document.addEventListener('DOMContentLoaded', () => {
    const openBtnAdvanced = document.getElementById('btn-fullscreen-advanced');
    if (openBtnAdvanced) {
        openBtnAdvanced.addEventListener('click', () => {
            updateAdvancedChart();
        });
    }

    const advModalEl = document.getElementById('chartModalAdvanced');
    if (advModalEl) {
        advModalEl.addEventListener('hidden.bs.modal', () => {
            if (myAdvancedChart) {
                myAdvancedChart.destroy();
                myAdvancedChart = null;
            }
        });
    }
});
