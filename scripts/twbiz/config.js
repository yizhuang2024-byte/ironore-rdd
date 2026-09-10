// 台灣工商登記資料來源設定
//
// 資料來源為經濟部商工登記公示資料開放平臺（https://data.gcis.nat.gov.tw/main/index）。
// 各 API 的 dataset id 以平臺公告為準，若官方調整，可用 --dataset 參數或
// TWBIZ_DATASET_<KEY> 環境變數覆寫，不必改程式碼。

export const DATASETS = {
  // 公司登記（股份有限公司、有限公司…）
  companyByName: {
    id: '6BBA2268-1367-4B42-9CCA-BC17499EBE8C',
    label: '公司登記—依公司名稱關鍵字',
    queryField: 'Company_Name',
    statusField: 'Company_Status',
  },
  companyByLocation: {
    id: '236EE382-4942-41A9-BD03-CA0709025E7C',
    label: '公司登記—依公司所在地',
    queryField: 'Company_Location',
    statusField: 'Company_Status',
  },
  companyByItem: {
    id: '5F64D864-61CB-4D0D-8AD9-492047CC1EA6',
    label: '公司登記—依營業項目代碼',
    queryField: 'Business_Item',
    statusField: 'Company_Status',
  },
  // 商業登記（獨資、合夥，即一般俗稱的商號／行號，中小企業黃頁大宗）
  businessByName: {
    id: '5D9DA6C4-DF7D-4C87-9636-A4E9A0F4A9D2',
    label: '商業登記—依商業名稱關鍵字',
    queryField: 'Business_Name',
    statusField: 'Business_Current_Status',
  },
};

export const API_BASE = 'https://data.gcis.nat.gov.tw/od/data/api';

// 每頁筆數上限由平臺決定，實測 50 最穩定
export const PAGE_SIZE = 50;

// 兩次請求間隔（毫秒），避免觸發平臺流量限制
export const REQUEST_INTERVAL_MS = 350;

// 營業中的判定：狀態碼或狀態文字命中任一即視為仍在營業
export const ACTIVE_STATUS_CODES = ['01'];
export const ACTIVE_STATUS_TEXTS = ['核准設立', '營業中', '核准登記', '核准'];

// 明確代表已終止營業的關鍵字，優先於上面的營業中判定
export const INACTIVE_STATUS_TEXTS = [
  '解散', '撤銷', '廢止', '歇業', '停業', '註銷', '清算', '破產', '合併',
];

export const CITIES = [
  '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市',
  '基隆市', '新竹市', '新竹縣', '苗栗縣', '彰化縣', '南投縣',
  '雲林縣', '嘉義市', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣',
  '臺東縣', '澎湖縣', '金門縣', '連江縣',
];

// 使用者常打「台」，資料庫多為「臺」，查詢時兩者互通
export function normalizeCity(name) {
  return String(name || '').replace(/台/g, '臺').trim();
}
