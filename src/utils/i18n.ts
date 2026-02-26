/**
 * 多语言支持 - DOWNLOAD 按钮文案翻译
 */

// 语言代码到翻译的映射
const downloadTranslations: Record<string, string> = {
    // 英语
    'en': 'DOWNLOAD',
    // 南非语
    'af': 'AFLAAI',
    // 阿尔巴尼亚语
    'sq': 'SHKARKO',
    // 阿姆哈拉语
    'am': 'አውርድ',
    // 阿拉伯语
    'ar': 'تحميل',
    // 亚美尼亚语
    'hy': 'ՆԵՐdelays',
    // 阿塞拜疆语
    'az': 'YÜKLƏ',
    // 孟加拉语
    'bn': 'ডাউনলোড',
    // 巴士克语
    'eu': 'DESKARGATU',
    // 白俄罗斯语
    'be': 'СПАМПАВАЦЬ',
    // 保加利亚语
    'bg': 'ИЗТЕГЛИ',
    // 缅甸语
    'my': 'ဒေါင်းလုဒ်',
    // 加泰罗语
    'ca': 'DESCARREGA',
    // 中文(香港)
    'zh-HK': '下載',
    // 中文(简体)
    'zh-CN': '下载',
    'zh': '下载',
    // 中文(繁体)
    'zh-TW': '下載',
    // 克罗地亚语
    'hr': 'PREUZMI',
    // 捷克语
    'cs': 'STÁHNOUT',
    // 丹麦语
    'da': 'DOWNLOAD',
    // 荷兰语
    'nl': 'DOWNLOADEN',
    // 爱沙尼亚语
    'et': 'LAADI ALLA',
    // 菲律宾语
    'fil': 'I-DOWNLOAD',
    // 芬兰语
    'fi': 'LATAA',
    // 法语(加拿大)
    'fr-CA': 'TÉLÉCHARGER',
    // 法语(法国)
    'fr-FR': 'TÉLÉCHARGER',
    'fr': 'TÉLÉCHARGER',
    // 加里西亚语
    'gl': 'DESCARGAR',
    // 格鲁吉亚语
    'ka': 'ჩამოტვირთვა',
    // 德语
    'de': 'HERUNTERLADEN',
    // 希腊语
    'el': 'ΛΗΨΗ',
    // 古吉拉特语
    'gu': 'ડાઉનલોડ',
    // 希伯来语
    'he': 'הורדה',
    // 印地语
    'hi': 'डाउनलोड',
    // 匈牙利语
    'hu': 'LETÖLTÉS',
    // 冰岛语
    'is': 'HLAÐA NIÐUR',
    // 印度尼西亚语
    'id': 'UNDUH',
    // 意大利语
    'it': 'SCARICA',
    // 日语
    'ja': 'ダウンロード',
    // 卡纳拉语
    'kn': 'ಡೌನ್‌ಲೋಡ್',
    // 哈萨克语
    'kk': 'ЖҮКТЕУ',
    // 高棉语
    'km': 'ទាញយក',
    // 朝鲜语
    'ko': '다운로드',
    // 吉尔吉斯语
    'ky': 'ЖҮКТӨӨ',
    // 老挝语
    'lo': 'ດາວໂຫລດ',
    // 拉脱维亚语
    'lv': 'LEJUPIELĀDĒT',
    // 立陶宛语
    'lt': 'ATSISIŲSTI',
    // 马其顿语
    'mk': 'ПРЕЗЕМИ',
    // 马来语(马来西亚)
    'ms-MY': 'MUAT TURUN',
    // 马来语
    'ms': 'MUAT TURUN',
    // 马拉雅拉姆语
    'ml': 'ഡൗൺലോഡ്',
    // 马拉地语
    'mr': 'डाउनलोड',
    // 蒙古语
    'mn': 'ТАТАХ',
    // 尼泊尔语
    'ne': 'डाउनलोड',
    // 挪威语
    'no': 'LAST NED',
    'nb': 'LAST NED',
    'nn': 'LAST NED',
    // 波斯语
    'fa': 'دانلود',
    // 波兰语
    'pl': 'POBIERZ',
    // 葡萄牙语(巴西)
    'pt-BR': 'BAIXAR',
    // 葡萄牙语(葡萄牙)
    'pt-PT': 'TRANSFERIR',
    'pt': 'BAIXAR',
    // 旁遮普语
    'pa': 'ਡਾਊਨਲੋਡ',
    // 罗马尼亚语
    'ro': 'DESCARCĂ',
    // 俄语
    'ru': 'СКАЧАТЬ',
    // 塞尔维亚语
    'sr': 'ПРЕУЗМИ',
    // 僧伽罗语
    'si': 'බාගන්න',
    // 斯洛伐克语
    'sk': 'STIAHNUŤ',
    // 斯洛文尼亚语
    'sl': 'PRENESI',
    // 西班牙语(拉美)
    'es-419': 'DESCARGAR',
    // 西班牙语(西班牙)
    'es-ES': 'DESCARGAR',
    // 西班牙语(美国)
    'es-US': 'DESCARGAR',
    'es': 'DESCARGAR',
    // 斯瓦希里语
    'sw': 'PAKUA',
    // 瑞典语
    'sv': 'LADDA NER',
    // 塔加路语
    'tl': 'I-DOWNLOAD',
    // 泰米尔语
    'ta': 'பதிவிறக்கு',
    // 泰卢固语
    'te': 'డౌన్‌లోడ్',
    // 泰语
    'th': 'ดาวน์โหลด',
    // 土耳其语
    'tr': 'İNDİR',
    // 乌克兰语
    'uk': 'ЗАВАНТАЖИТИ',
    // 乌尔都语
    'ur': 'ڈاؤن لوڈ',
    // 越南语
    'vi': 'TẢI XUỐNG',
    // 祖鲁语
    'zu': 'LANDA'
};

/**
 * 获取浏览器语言
 */
function getBrowserLanguage(): string {
    // 优先使用 navigator.language
    const lang = navigator.language || (navigator as any).userLanguage || 'en';
    return lang;
}

/**
 * 根据浏览器语言获取 DOWNLOAD 文案
 */
export function getDownloadText(): string {
    const browserLang = getBrowserLanguage();
    
    // 尝试完整匹配（如 zh-CN, pt-BR）
    if (downloadTranslations[browserLang]) {
        return downloadTranslations[browserLang];
    }
    
    // 尝试匹配语言代码的基础部分（如 zh, pt）
    const baseLang = browserLang.split('-')[0].toLowerCase();
    if (downloadTranslations[baseLang]) {
        return downloadTranslations[baseLang];
    }
    
    // 默认返回英语
    return downloadTranslations['en'];
}