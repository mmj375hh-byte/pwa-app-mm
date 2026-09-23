// ==========================================
// 📄 js/backup.js（補助回数対応・データ移行専用）
// ==========================================

// 📤 データをJSONファイルとして書き出す
async function exportData() {
    // データベースから全記録を取得
    const allRecords = await db.records.toArray();
    
    // ファイル名を生成 (例: workout_backup_2026_09_23.json)
    const fileName = `workout_backup_${new Date().toISOString().slice(0,10).replace(/-/g, '_')}.json`;
    
    // JSONデータを純粋なBlob（ファイル実体）に変換
    const blob = new Blob([JSON.stringify(allRecords, null, 2)], { type: "application/json" });
    
    // スマホ・PC共通のダウンロード処理を実行
    const anchor = document.createElement("a"); 
    anchor.download = fileName;
    anchor.href = window.URL.createObjectURL(blob);
    anchor.click();
    
    // 使用したメモリの解放処理
    window.URL.revokeObjectURL(anchor.href);
}

// 📥 JSONファイルを読み込んでデータを復元する
function importData(event) {
    const file = event.target.files[0]; // ファイルを確実に指定
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) throw new Error();
            
            if (confirm(`データを復元しますか？（現在のデータに追加されます）`)) {
                for (const r of imported) { 
                    // 🟢 復元時にも「r.assist」を漏らさずIndexedDBに一括登録
                    await db.records.add({ 
                        date: r.date, 
                        exercise: r.exercise, 
                        weight: r.weight, 
                        reps: r.reps,
                        assist: r.assist ? parseInt(r.assist) : 0 // 補助回数がない古いバックアップもエラーにせず0で救済
                    }); 
                }
                alert('完了しました！'); 
                await updateApp(); // 画面全体のUI（リストやグラフ）を更新（app.js側）
                
                if (document.getElementById('historyModal').classList.contains('show')) {
                    await generateFilterWeightOptions();
                    await filterHistoryList();
                }
            }
        } catch (err) { 
            alert('失敗しました。正しいJSONファイルか確認してください。'); 
        }
    };
    reader.readAsText(file);
}
