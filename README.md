# iceland_trip_proj_2025
Iceland trip project 2025

## 專案結構與可維護性

這個專案已經過重構，以提升可維護性和重複使用性。關鍵的改動包括：

*   **分離關注點**：HTML (dashboard.html)、CSS (dashboard.css) 和 JavaScript (dashboard.js) 各自獨立。
*   **集中配置**：所有旅程相關的變動資訊 (標題、年份、圖片 URL、資料檔名等) 都集中在 `config.json` 中，方便快速修改，無需改動程式碼。

## 部署最佳化 (檔案壓縮)

為了加快網站載入速度，特別是部署到如 GitHub Pages 這類靜態網站服務時，我們採用了以下壓縮策略：

*   **原始檔案 (`.css`, `.js`)**：保持原始格式，包含註解和排版，方便開發與維護。
*   **壓縮檔案 (`.min.css`, `.min.js`)**：移除了多餘的空白、換行和註解，檔案體積更小，適合部署到生產環境。

**如何切換使用？**

目前 `dashboard.html` 已配置為引用壓縮後的 `dashboard.min.css` 和 `dashboard.min.js`。若您在本地開發時需要查看原始檔案的變化或調試，可以手動修改 `dashboard.html` 中的引用路徑：

從：
```html
<link rel="stylesheet" href="dashboard.min.css">
<!-- ...其他標籤... -->
<script src="dashboard.min.js"></script>
```

改為：
```html
<link rel="stylesheet" href="dashboard.css">
<!-- ...其他標籤... -->
<script src="dashboard.js"></script>
```

**建議**：在正式部署到生產環境時，請確保 `dashboard.html` 引用的是 `.min` 結尾的壓縮檔案。

