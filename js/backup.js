// ==========================================
// 📄 js/backup.js（データ移行・バックアップ専用）
// ==========================================

// 📤 データをJSONファイルとして書き出す（エクスポート）
async function exportData() {
    // データベースから全記録を取得
    const allRecords = await db.records.toArray();
    
    // 今日をベースにファイル名を生成 (例: workout_backup_2026_09_23.json)
    const fileName = `workout_backup_${new Date().toISOString().slice(0,10).replace(/-/g, '_')}.json`;
    
    // テキストデータをブラウザがファイルとして扱えるFileオブジェクトに変換
    const file = new File([JSON.stringify(allRecords, null, 2)], fileName, { type: "application/json" });
    
    // iPhoneの標準「ファイル共有・保存シート」を呼び出す (ローカル/iCloud/Gドライブ対応) [^4, 5]
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { 
            await navigator.share({ files: [file], title: 'Workout Data Backup' }); 
        } catch (err) { 
            console.log('バックアップがキャンセルされました', err); 
        }
    } else {
        // PCブラウザ等の場合は、通常通りのローカルダウンロードを実行 [^1, 2]
        const anchor = document.createElement("a"); 
        anchor.download = fileName;
        anchor.href = window.URL.createObjectURL(new Blob([JSON.stringify(allRecords, null, 2)], { type: "application/json" }));
        anchor.click();
    }
}

// 📥 JSONファイルを読み込んでデータを復元する（インポート）
function importData(event) {
    const file = event.target.files[0]; // 🟢 1つ目のファイルを確実に指定
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) throw new Error(); // 配列データでなければエラー
            
            if (confirm(`データを復元しますか？（現在のデータに追加されます）`)) {
                // データを1つずつIndexedDBに一括登録
                for (const r of imported) { 
                    await db.records.add({ date: r.date, exercise: r.exercise, weight: r.weight, reps: r.reps }); 
                }
                alert('完了しました！'); 
                
                // 画面全体のUI（リストやグラフ）を最新に同期する（app.js側の関数）
                await updateApp();
                
                // もし全履歴モーダルが開いていたら、フィルターや中身も連動更新する
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
