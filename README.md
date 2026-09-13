# 飛行腦｜無人機學科模擬考

一套以繁體中文製作的無人機學科練習與模擬考系統。採用純 HTML、CSS 與 JavaScript 開發，不需要登入，作答紀錄會保存在使用者的瀏覽器中。

## 線上測驗

### [立即開始測驗](https://andrewkotw.github.io/dronetest/)

網站網址：<https://andrewkotw.github.io/dronetest/>

## 主要功能

- 收錄 588 題無人機學科題目，涵蓋四個章節。
- 每回合隨機抽取 40 題，且同一回合不會重複出題。
- 練習模式會優先安排錯題與未作答題目，答對後移出錯題循環。
- 正式抽考從完整題庫抽題，交卷後統一公布答案與成績。
- 正式抽考答對 32／40 題（80%）即為及格。
- Dashboard 顯示整體與各章節的掌握度、正確率及近期考試紀錄。
- 未完成的回合可在重新開啟網站後繼續作答。
- 題目選項會隨機排列，重新整理後仍維持原本順序。
- 支援桌面、平板與手機版面，以及鍵盤快捷操作。

## 本機使用

下載或 clone 此專案後，直接以瀏覽器開啟 `index.html` 即可使用：

```bash
git clone https://github.com/andrewkotw/dronetest.git
cd dronetest
```

也可以使用任意靜態網站伺服器開啟，例如 VS Code Live Server。

## 更新題庫

原始題庫位於 `無人機學科測驗題庫 (1).csv`。更新 CSV 後，執行以下指令即可重新產生網站使用的 `questions.js`：

```bash
node generate-questions.js
```

產生器會自動清理 PDF／CSV 轉換過程中插入的異常空格，同時檢查欄位、答案與題目 ID。

## 專案結構

```text
├── index.html              # 網站結構
├── styles.css             # 介面與響應式樣式
├── app.js                  # 測驗、統計及本機儲存邏輯
├── questions.js            # 網站實際載入的題庫
├── generate-questions.js   # CSV 題庫轉換工具
└── 無人機學科測驗題庫 (1).csv
```

## 資料與隱私

作答進度、錯題狀態及正式抽考紀錄只會儲存在目前瀏覽器的 `localStorage`，不會上傳到伺服器。清除瀏覽器網站資料或改用其他瀏覽器／裝置後，紀錄不會自動同步。

## 技術

- HTML5
- CSS3
- Vanilla JavaScript
- GitHub Pages

## 製作

安澤製作

> 本網站供學習與模擬測驗使用，實際考試內容與規定仍請以主管機關最新公告為準。
