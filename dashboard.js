// ============================================================================
// GLOBAL STATE & DOM REFERENCES
// 全域狀態與 DOM 元素參照
// ============================================================================
let guideContent = {};
let tripConfig = {}; // 新增：用來儲存設定檔內容

const DOM = {
    dayTabsContainer: document.getElementById('day-tabs'),
    contentDisplay: document.getElementById('content-display'),
    modal: document.getElementById('guide-modal'),
    modalBody: document.getElementById('modal-body'),
    closeModalBtn: document.querySelector('.modal-close')
};

// ============================================================================
// CONFIGURATION & INITIALIZATION
// 設定檔讀取與初始化 (新增區塊)
// ============================================================================

/**
 * 讀取 config.json 設定檔。
 * @returns {Promise<Object>} 包含設定資訊的物件。
 */
async function loadConfig() {
    console.log("DEBUG: loadConfig 啟動");
    try {
        const response = await fetch('config.json', { cache: 'no-cache' });
        if (!response.ok) {
            throw new Error(`無法讀取 config.json: ${response.status}`);
        }
        const config = await response.json();
        console.log("DEBUG: config.json 載入成功:", config);
        return config;
    } catch (error) {
        console.error('DEBUG: 讀取設定檔失敗:', error);
        throw error;
    }
}

/**
 * 使用設定檔中的靜態文字更新頁面。
 */
function updateStaticText() {
    console.log("DEBUG: updateStaticText 啟動");
    document.title = `${tripConfig.tripTitle} ${tripConfig.tripYear} - ${tripConfig.pageTitle}`;
    document.getElementById('main-title').textContent = `${tripConfig.tripTitle} ${tripConfig.tripYear}`;
    document.getElementById('main-subtitle').textContent = tripConfig.mainSubtitle;
    document.getElementById('welcome-message').textContent = tripConfig.welcomeMessage;
    document.getElementById('footer-text').textContent = tripConfig.footerText;
    document.querySelector('.background-container').style.backgroundImage = `url('${tripConfig.backgroundImageUrl}')`;
    console.log("DEBUG: 靜態文字更新完成。");
}

/**
 * 應用程式初始化主函式。
 */
async function initializeApp() {
    console.log("DEBUG: initializeApp 啟動");
    try {
        // 1. 讀取設定
        tripConfig = await loadConfig();
        // 2. 更新靜態文字
        updateStaticText();
        // 3. 讀取動態資料
        const { itineraryData, accommodationMap, guideData } = await loadAllData();
        guideContent = guideData;
        console.log("DEBUG: 所有資料載入完成。Itinerary Data:", itineraryData);

        if (itineraryData.length === 0) {
            throw new Error('解析行程資料後為空陣列。');
        }
        // 4. 渲染頁面
        renderDayTabs(itineraryData, accommodationMap);
        selectInitialDay(itineraryData);
        console.log("DEBUG: 應用程式初始化完成。");
    } catch (error) {
        console.error('DEBUG: 初始化失敗:', error);
        displayErrorMessage(error);
    }
}


// ============================================================================
// DATA LOADING & PARSING
// 資料讀取與解析
// ============================================================================

/**
 * 並行讀取所有需要的資料檔案 (行程、住宿、指南)。
 * (修改) 檔名從 tripConfig 讀取。
 * @returns {Promise<Object>} 包含行程、住宿和指南資料的物件。
 */
async function loadAllData() {
    console.log("DEBUG: loadAllData 啟動");
    try {
        const fetchOptions = { cache: 'no-cache' };
        const [itineraryResponse, accommodationResponse, guideResponse] = await Promise.all([
            fetch(tripConfig.itineraryFileName, fetchOptions).catch(e => ({ ok: false, status: e.toString() })),
            fetch(tripConfig.accommodationFileName, fetchOptions).catch(e => ({ ok: false, status: e.toString() })),
            fetch(tripConfig.guideFileName, fetchOptions).catch(e => ({ ok: false, status: e.toString() }))
        ]);

        if (!itineraryResponse.ok || !accommodationResponse.ok || !guideResponse.ok) {
            throw new Error(`讀取資料檔案失敗: \n                行程: ${itineraryResponse.status}, \n                住宿: ${accommodationResponse.status}, \n                指南: ${guideResponse.status}`);
        }

        const itineraryText = await itineraryResponse.text();
        const accommodationText = await accommodationResponse.text();
        const guideJson = await guideResponse.json();

        console.log("DEBUG: 行程 CSV 內容前幾行:", itineraryText.split('\n').slice(0, 5).join('\n'));
        console.log("DEBUG: 住宿 CSV 內容前幾行:", accommodationText.split('\n').slice(0, 5).join('\n'));
        console.log("DEBUG: 指南 JSON 載入成功:", guideJson);

        return {
            itineraryData: parseItinerary(itineraryText),
            // (修改) 傳入年份
            accommodationMap: parseAccommodation(accommodationText, tripConfig.tripYear),
            guideData: guideJson
        };
    } catch (error) {
        console.error('DEBUG: 資料讀取失敗:', error);
        throw error;
    }
}

/**
 * 解析 CSV 單行，處理引號內的逗號。
 * @param {string} line - CSV 的單行文字。
 * @returns {string[]} 解析後的欄位陣列。
 */
function parseCsvLine(line) {
    const parts = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && (i === 0 || line[i-1] !== '"')) {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            parts.push(currentField);
            currentField = '';
        } else {
            currentField += char;
        }
    }

    parts.push(currentField);
    return parts.map(field => field.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
}

/**
 * 解析行程 CSV 字串，將其轉換為結構化資料。
 * @param {string} csvString - 行程的 CSV 完整內容。
 * @returns {Array<Object>} 處理過的行程資料陣列。
 */
function parseItinerary(csvString) {
    console.log("DEBUG: parseItinerary 啟動");
    const lines = csvString.trim().split(/\r?\n/);
    const tripData = [];
    let currentDayData = null;
    const dayHeaderRegex = /^第(.+?)天：(.+?)\s*(,)\s*(.+?)(,)*$/;

    lines.forEach(line => {
        const dayMatch = line.match(dayHeaderRegex);
        if (dayMatch) {
            if (currentDayData) tripData.push(currentDayData);
            currentDayData = {
                day: dayMatch[1].trim(),
                date: dayMatch[2].trim().replace('（', ' (').replace('）', ')'),
                title: dayMatch[4].trim(),
                events: []
            };
        } else if (currentDayData && line.trim() && !line.startsWith('時間,行程')) {
            const parts = parseCsvLine(line);
            if (parts.length >= 2 && parts[1]?.trim()) {
                currentDayData.events.push({
                    time: parts[0] || 'N/A',
                    activity: parts[1] || 'N/A',
                    notes: parts[4] || '',
                    guideKey: parts[5] || '',
                    googleMapLink: parts[6] || ''
                });
            }
        }
    });

    if (currentDayData) tripData.push(currentDayData);
    console.log("DEBUG: parseItinerary 完成。Trip Data:", tripData);
    return tripData;
}

/**
 * 解析住宿 CSV 字串，建立一個日期到住宿資訊的映射。
 * (修改) 新增 year 參數，移除寫死的 2025。
 * @param {string} csvString - 住宿的 CSV 完整內容。
 * @param {string|number} year - 當前年份，用於建立 Date 物件。
 * @returns {Object} 一個 key 為 "月/日"，value 為住宿物件的 Map。
 */
function parseAccommodation(csvString, year) {
    console.log("DEBUG: parseAccommodation 啟動 (年份:", year, ")");
    const lines = csvString.trim().split(/\r?\n/);
    const accommodationMap = {};
    const numericYear = parseInt(year, 10);

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const parts = parseCsvLine(line);
        if (parts.length < 10) continue;

        const [dateRange, region, platform, roomType, breakfast, kitchen, parking, link, address, mapLink] = parts;
        if (!dateRange?.trim()) continue;

        const accommodation = { region, platform, name: link, roomType, parking, kitchen, breakfast, address, mapLink };
        const [startDateStr, endDateStr] = dateRange.split('-');
        if (!startDateStr) continue;

        const [startMonth, startDay] = startDateStr.split('/').map(Number);
        const [endMonth, endDay] = endDateStr ? endDateStr.split('/').map(Number) : [startMonth, startDay];

        let currentDate = new Date(numericYear, startMonth - 1, startDay);
        const endDate = new Date(numericYear, endMonth - 1, endDay);

        while (currentDate <= endDate) {
            const key = `${currentDate.getMonth() + 1}/${currentDate.getDate()}`;
            accommodationMap[key] = accommodation;
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }

    console.log("DEBUG: parseAccommodation 完成。Accommodation Map:", accommodationMap);
    return accommodationMap;
}

// ============================================================================
// TEMPLATE GENERATORS
// HTML 模板生成函式
// ============================================================================

/**
 * 建立單一事件的時間軸項目 HTML。
 * @param {Object} event - 單一事件物件。
 * @returns {string} HTML 字串。
 */
function createEventTimelineItem(event) {
    const guideKey = Object.keys(guideContent).find(key => event.guideKey?.includes(key));
    const guideButton = guideKey ? `<button class="guide-btn inline-block ml-3 text-yellow-400 hover:text-yellow-300" data-guide-key="${guideKey}"><i data-lucide="book-open" class="w-5 h-5"></i></button>` : '';
    const mapLink = event.googleMapLink ? `<a href="${event.googleMapLink}" target="_blank" rel="noopener noreferrer" class="inline-block ml-3 text-blue-400 hover:text-blue-300"><i data-lucide="map-pin" class="w-5 h-5"></i></a>` : '';
    const notes = event.notes ? `<p class="text-gray-400 mt-1 text-sm">${event.notes}</p>` : '';

    return `
        <div class="timeline-item relative pl-8 pb-8">
            <div class="timeline-dot"></div>
            <p class="text-blue-300 font-semibold">${event.time}</p>
            <h4 class="text-lg font-semibold text-gray-100 mt-1 flex items-center">
                ${event.activity}
                ${guideButton}
                ${mapLink}
            </h4>
            ${notes}
        </div>
    `;
}

/**
 * 建立每日的行程區塊 HTML。
 * @param {Object} dayData - 當天的行程資料。
 * @returns {string} HTML 字串。
 */
function createItinerarySection(dayData) {
    const eventsList = dayData.events.map(createEventTimelineItem).join('');

    return `
        <div class="mb-8 lg:mb-0">
            <h3 class="text-xl sm:text-2xl font-bold text-white mb-4 flex items-center">
                <i data-lucide="list-checks" class="w-6 h-6 mr-3 text-blue-400"></i>
                行程安排
            </h3>
            <div class="relative pl-8">
                ${eventsList}
            </div>
        </div>
    `;
}

/**
 * 根據提供的值（通常是 'V' 或 'X'）生成設施圖示。
 * @param {string} value - 代表設施有無的字串。
 * @param {boolean} checkIcon - 是否使用打勾圖示。
 * @returns {string} Lucide icon 的 HTML 字串。
 */
function createAmenityIcon(value, checkIcon = true) {
    if (!value) return '';
    const hasAmenity = value.toLowerCase().includes('v');
    if (hasAmenity) return '<i data-lucide="check-circle-2" class="w-4 h-4 text-green-400"></i>';
    if (value.toLowerCase().includes('x')) return '<i data-lucide="x-circle" class="w-4 h-4"></i>';
    return value;
}

/**
 * 建立當晚的住宿區塊 HTML。
 * @param {Object} accommodationData - 住宿資料。
 * @returns {string} HTML 字串。
 */
function createAccommodationSection(accommodationData) {
    if (!accommodationData) {
        return `
            <div>
                <h3 class="text-xl sm:text-2xl font-bold text-white mb-4 flex items-center">
                    <i data-lucide="moon-star" class="w-6 h-6 mr-3 text-purple-400"></i>
                    今晚住宿
                </h3>
                <div class="bg-gray-800 p-6 rounded-lg border border-gray-700 text-center">
                    <p class="text-gray-400">今天為返程日或無預定住宿。</p>
                </div>
            </div>
        `;
    }

    const platformColor = accommodationData.platform === 'AirBnb' ? 'bg-pink-600' : 'bg-blue-600';
    const parking = createAmenityIcon(accommodationData.parking);
    const kitchen = createAmenityIcon(accommodationData.kitchen);
    const breakfast = createAmenityIcon(accommodationData.breakfast);

    return `
        <div>
            <h3 class="text-xl sm:text-2xl font-bold text-white mb-4 flex items-center">
                <i data-lucide="home" class="w-6 h-6 mr-3 text-green-400"></i>
                今晚住宿
            </h3>
            <div class="bg-gray-800 p-4 sm:p-6 rounded-lg border border-gray-700">
                <div class="flex justify-between items-start">
                    <h4 class="text-lg sm:text-xl font-bold text-white">${accommodationData.region}</h4>
                    <span class="text-sm font-medium ${platformColor} text-white px-2 py-1 rounded-full">${accommodationData.platform}</span>
                </div>
                <p class="text-gray-300 mt-1 mb-4 font-semibold text-sm sm:text-base">${accommodationData.name}</p>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mt-4">
                    <div class="flex items-start">
                        <i data-lucide="bed-double" class="w-4 h-4 mr-2 mt-1 text-gray-400 flex-shrink-0"></i>
                        <div><span class="font-semibold text-gray-300">房型:</span> ${accommodationData.roomType || 'N/A'}</div>
                    </div>
                    <div class="flex items-center">
                        <i data-lucide="parking-circle" class="w-4 h-4 mr-2 text-gray-400"></i>
                        <span class="font-semibold text-gray-300 mr-2">停車:</span>
                        ${parking}
                    </div>
                    <div class="flex items-center">
                        <i data-lucide="soup" class="w-4 h-4 mr-2 text-gray-400"></i>
                        <span class="font-semibold text-gray-300 mr-2">廚房:</span>
                        ${kitchen}
                    </div>
                    <div class="flex items-center">
                        <i data-lucide="croissant" class="w-4 h-4 mr-2 text-gray-400"></i>
                        <span class="font-semibold text-gray-300 mr-2">早餐:</span>
                        ${breakfast}
                    </div>
                </div>

                <a href="${accommodationData.mapLink}" target="_blank" rel="noopener noreferrer" class="mt-6 flex items-center text-blue-400 hover:text-blue-300 transition-colors duration-200 text-sm">
                    <i data-lucide="map-pin" class="w-4 h-4 mr-2"></i>
                    <span class="underline">${accommodationData.address}</span>
                </a>
            </div>
        </div>
    `;
}

/**
 * 渲染指定日期的詳細內容 (行程 + 住宿)。
 * @param {Object} dayData - 當天行程資料。
 * @param {Object} accommodationData - 當天住宿資料。
 */
function renderDayDetails(dayData, accommodationData) {
    console.log("DEBUG: renderDayDetails 啟動。Day Data:", dayData, "Accommodation Data:", accommodationData);
    const itineraryHtml = createItinerarySection(dayData);
    const accommodationHtml = createAccommodationSection(accommodationData);

    DOM.contentDisplay.innerHTML = `
        <h2 class="text-2xl sm:text-3xl font-bold text-white mb-1">第 ${dayData.day} 天: ${dayData.title}</h2>
        <p class="text-base sm:text-lg text-gray-400 mb-6 sm:mb-8">${dayData.date}</p>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            ${itineraryHtml}
            ${accommodationHtml}
        </div>
    `;

    lucide.createIcons();
    addGuideButtonListeners();
    console.log("DEBUG: renderDayDetails 完成。");
}
// ============================================================================
// MODAL MANAGEMENT
// 彈出視窗 (Modal) 管理
// ============================================================================

/**
 * 開啟指南彈出視窗並填入內容。
 * @param {string} key - 指南內容的 key。
 */
function openGuideModal(key) {
    console.log("DEBUG: openGuideModal 啟動，Key:", key);
    const data = guideContent[key];
    if (data) {
        DOM.modalBody.innerHTML = `<h3>${data.title}</h3>${data.content}`;
        DOM.modal.style.display = 'block';
        console.log("DEBUG: Modal 已開啟。");
    }
}

/**
 * 關閉指南彈出視窗。
 */
function closeGuideModal() {
    console.log("DEBUG: closeGuideModal 啟動");
    DOM.modal.style.display = 'none';
    console.log("DEBUG: Modal 已關閉。");
}

/**
 * 為所有指南按鈕加上點擊事件監聽器。
 */
function addGuideButtonListeners() {
    console.log("DEBUG: addGuideButtonListeners 啟動");
    document.querySelectorAll('.guide-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            openGuideModal(btn.dataset.guideKey);
        });
    });
    console.log("DEBUG: 指南按鈕監聽器已添加。");
}

// ============================================================================
// TAB & DAY NAVIGATION
// 頁籤與日期導覽
// ============================================================================

/**
 * 根據日期字串從住宿地圖中查找對應的住宿資料。
 * @param {string} dayDate - 日期字串 (例如 "12 月 25 日 (一)")。
 * @param {Object} accommodationMap - 住宿資料地圖。
 * @returns {Object|null} 找到的住宿資料或 null。
 */
function getAccommodationForDay(dayDate, accommodationMap) {
    const dateParts = dayDate.match(/(\d+)\s*月\s*(\d+)/);
    if (!dateParts) return null;
    
    const key = `${parseInt(dateParts[1])}/${parseInt(dateParts[2])}`;
    console.log("DEBUG: 查找住宿 key:", key);
    return accommodationMap[key] || null;
}

/**
 * 建立單一的日期導覽頁籤按鈕。
 * @param {Object} day - 當天的行程資料。
 * @param {Object} accommodationMap - 住宿資料地圖。
 * @returns {HTMLButtonElement} 建立好的按鈕元素。
 */
function createDayTab(day, accommodationMap) {
    const tab = document.createElement('button');
    tab.className = 'day-tab px-4 py-2 rounded-lg text-sm font-semibold bg-gray-800 text-gray-300 border border-gray-700';
    tab.innerHTML = `第 ${day.day} 天 <span class="hidden sm:inline-block ml-2 text-gray-400">${day.date.split(' ')[0]}</span>`;

    tab.onclick = () => {
        console.log("DEBUG: 點擊了頁籤:", day.day);
        // 移除所有頁籤的 'active' class
        document.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // 取得住宿資料並渲染內容
        const accommodationData = getAccommodationForDay(day.date, accommodationMap);
        renderDayDetails(day, accommodationData);
    };

    return tab;
}

/**
 * 渲染所有的日期導覽頁籤。
 * @param {Array<Object>} itineraryData - 完整的行程資料。
 * @param {Object} accommodationMap - 住宿資料地圖。
 */
function renderDayTabs(itineraryData, accommodationMap) {
    console.log("DEBUG: renderDayTabs 啟動。行程資料長度:", itineraryData.length);
    DOM.dayTabsContainer.innerHTML = '';
    itineraryData.forEach(day => {
        const tab = createDayTab(day, accommodationMap);
        DOM.dayTabsContainer.appendChild(tab);
    });
    console.log("DEBUG: 頁籤渲染完成。生成的頁籤數量:", DOM.dayTabsContainer.children.length);
}

/**
 * 尋找今天日期在行程資料中的索引。
 * @param {Array<Object>} itineraryData - 完整的行程資料。
 * @returns {number} 今天的索引，如果找不到則返回 -1。
 */
function findTodayIndex(itineraryData) {
    console.log("DEBUG: findTodayIndex 啟動");
    const today = new Date();
    const currentMonth = today.getUTCMonth() + 1;
    const currentDay = today.getUTCDate();
    const todayFormatted = `${currentMonth} 月 ${currentDay} 日`;
    console.log("DEBUG: 今天日期 (格式化):". todayFormatted);

    const todayIndex = itineraryData.findIndex(day => day.date.startsWith(todayFormatted));
    console.log("DEBUG: 今天索引:", todayIndex);
    return todayIndex;
}

/**
 * 選擇初始顯示的日期 (優先選擇今天，否則選擇第一天)。
 * @param {Array<Object>} itineraryData - 完整的行程資料。
 */
function selectInitialDay(itineraryData) {
    console.log("DEBUG: selectInitialDay 啟動");
    const todayIndex = findTodayIndex(itineraryData);
    const targetTab = todayIndex !== -1 ? DOM.dayTabsContainer.children[todayIndex] : DOM.dayTabsContainer.firstElementChild;

    if (targetTab) {
        console.log("DEBUG: 選擇初始頁籤並點擊。", targetTab);
        targetTab.click();
    } else {
        console.log("DEBUG: 沒有找到可選擇的初始頁籤。");
    }
    console.log("DEBUG: selectInitialDay 完成。");
}

// ============================================================================
// ERROR HANDLING & DISPLAY
// 錯誤處理與顯示
// ============================================================================

/**
 * 在主內容區顯示錯誤訊息。
 * @param {Error} error - 錯誤物件。
 */
function displayErrorMessage(error) {
    console.error("DEBUG: displayErrorMessage 啟動，錯誤:", error);
    DOM.contentDisplay.innerHTML = `
        <div class="flex flex-col justify-center items-center h-full min-h-[40vh] text-center">
            <i data-lucide="alert-triangle" class="w-12 h-12 text-red-400 mb-4"></i>
            <h3 class="text-xl font-bold text-red-300">載入行程資料時發生錯誤</h3>
            <p class="text-gray-400 mt-2">請確認 CSV 和 JSON 檔案都存在且格式正確。</p>
            <p class="text-xs text-gray-500 mt-4">${error.message}</p>
        </div>
    `;
    lucide.createIcons();
    console.log("DEBUG: 錯誤訊息已顯示。");
}

// ============================================================================
// INITIALIZATION
// 初始化
// ============================================================================

/**
 * (修改) DOM 載入完成後執行的主函式改為呼叫 initializeApp。
 */
document.addEventListener('DOMContentLoaded', initializeApp);

// ============================================================================
// MODAL EVENT LISTENERS
// 彈出視窗事件監聽器
// ============================================================================

DOM.closeModalBtn.addEventListener('click', closeGuideModal);

window.addEventListener('click', (event) => {
    if (event.target === DOM.modal) {
        closeGuideModal();
    }
});
