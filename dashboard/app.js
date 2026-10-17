// ---------------------------------------------------------------------------
// localStorage önbelleği — her panel sekmesi açıldığında (hatta sayfa her
// yenilendiğinde) Supabase'den tam veri setini yeniden çekmek gereksiz ve
// yavaş: kaynaklar en hızlı 15 dakikada (Ticaret Borsası canlandığında),
// çoğu günde/ayda/haftada bir güncelleniyor. Her panel kendi verisini bir
// TTL ile önbelleğe alır; süre dolmadan önceki açılışlarda hiç ağ isteği
// atılmaz, sayfa anında önbellekten render olur.
window.__supaCache = (function () {
  const PREFIX = "tuik-dash-cache:";
  function get(key, ttlMs) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || typeof entry.t !== "number" || Date.now() - entry.t > ttlMs) return null;
      return entry.v;
    } catch (e) {
      return null;
    }
  }
  function set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
    } catch (e) {
      // kota dolu / gizli sekme — önbellek olmadan da sayfa normal çalışır
    }
  }
  function clearAll() {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(PREFIX))
        .forEach(k => localStorage.removeItem(k));
    } catch (e) {
      // yoksay
    }
  }
  // bir anahtarın en son GERÇEKTEN çekildiği an (önbellekten okunsa bile) —
  // üst durum rozetinin her sekmede doğru "son çekilme" zamanını göstermesi
  // için (get() sadece veriyi döner, zamanı değil).
  function getTime(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      return (entry && typeof entry.t === "number") ? entry.t : null;
    } catch (e) {
      return null;
    }
  }
  return { get, set, clearAll, getTime };
})();

document.getElementById("refresh-data").addEventListener("click", () => {
  window.__supaCache.clearAll();
  location.reload();
});

// ---------------------------------------------------------------------------
// Üst durum rozeti — hangi sekme/alt sekme aktifse ONUN canlı verisinin en
// son çekildiği an gösterilir (kayıt sayısı yok). Her panel, aktif olduğunda
// (önbellekten de gelse) __updateStatusFromCache'i kendi önbellek anahtarıyla
// çağırır; bu yüzden rozet sekmeler arası geçişte her zaman doğru kalır.
window.__setStatus = function (text, ok) {
  const dot = document.getElementById("status-dot");
  const label = document.getElementById("status-text");
  label.textContent = text;
  dot.style.background = ok ? "var(--good)" : "var(--bad)";
};
window.__updateStatusFromCache = function (keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  const times = list.map(k => window.__supaCache.getTime(k)).filter(t => t != null);
  if (!times.length) return;
  const latest = Math.max(...times);
  window.__setStatus("Canlı — " + new Date(latest).toLocaleString("tr-TR"), true);
};

// ---------------------------------------------------------------------------
// Site geneli dil altyapısı — her panel IIFE'si kendi applyLanguage(lang)
// fonksiyonunu window.__registerI18nPanel ile kaydeder (panel henüz hiç
// veri çekmemişse applyLanguage sadece sabit metinleri günceller, zararsız).
// Header'daki tek TR/EN/RU toggle tıklanınca window.__setAppLang TÜM kayıtlı
// panelleri aynı anda günceller; tercih localStorage'da saklanıp sayfa
// yenilenince korunuyor. <html lang> attribute'u da güncelleniyor — CSS
// text-transform:uppercase'in yanlış locale'de büyütme yapmaması için
// (bkz. KTB'de bulunan "HIGHEST" -> "HİGHEST" bug'ı).
window.__appLang = "tr";
const __i18nPanels = [];
window.__registerI18nPanel = function (applyFn) {
  __i18nPanels.push(applyFn);
};

// Sayfa başlığı/üst sekme çubuğu/Ticaret Borsası alt sekmeleri gibi tek bir
// panele ait olmayan, paylaşılan "chrome" metinleri — her panelin kendi
// applyLanguage'ı yerine burada, tek seferde çevriliyor.
const SHARED_STRINGS = {
  tr: {
    eyebrow: "Özel Ticaret Sistemi",
    tabTuik: "TÜİK Dış Ticaret", tabWasde: "WASDE Raporu", tabExchange: "Ticaret Borsası", tabEsr: "ABD İhracat Satışları",
    subtabSummary: "Özet",
    refreshTitle: "Önbelleği temizle, en güncel veriyi çek",
    themeTitle: "Tema değiştir",
  },
  en: {
    eyebrow: "Private Trade System",
    tabTuik: "TurkStat Foreign Trade", tabWasde: "WASDE Report", tabExchange: "Commodity Exchange", tabEsr: "US Export Sales",
    subtabSummary: "Summary",
    refreshTitle: "Clear cache, fetch the latest data",
    themeTitle: "Switch theme",
  },
  ru: {
    eyebrow: "Частная торговая система",
    tabTuik: "Внешняя торговля (TurkStat)", tabWasde: "Отчёт WASDE", tabExchange: "Товарная биржа", tabEsr: "Экспортные продажи США",
    subtabSummary: "Сводка",
    refreshTitle: "Очистить кэш, загрузить последние данные",
    themeTitle: "Сменить тему",
  },
};
function applySharedChrome(lang) {
  const s = SHARED_STRINGS[lang];
  document.getElementById("app-eyebrow").textContent = s.eyebrow;
  document.getElementById("tab-tuik").textContent = s.tabTuik;
  document.getElementById("tab-wasde").textContent = s.tabWasde;
  document.getElementById("tab-exchange").textContent = s.tabExchange;
  document.getElementById("tab-esr").textContent = s.tabEsr;
  document.getElementById("subtab-summary").textContent = s.subtabSummary;
  document.getElementById("refresh-data").title = s.refreshTitle;
  document.getElementById("theme-toggle").title = s.themeTitle;
}

window.__setAppLang = function (lang) {
  window.__appLang = lang;
  try { localStorage.setItem("tuik-dash-lang", lang); } catch (e) { /* kota dolu / gizli sekme — tercih bu oturumda kalır */ }
  document.documentElement.setAttribute("lang", lang);
  document.querySelectorAll("#app-lang-toggle .seg").forEach(b => b.classList.toggle("active", b.dataset.lang === lang));
  applySharedChrome(lang);
  __i18nPanels.forEach(fn => { try { fn(lang); } catch (e) { console.error(e); } });
};
document.getElementById("app-lang-toggle").querySelectorAll(".seg").forEach(btn => {
  btn.addEventListener("click", () => window.__setAppLang(btn.dataset.lang));
});

// Ülke adları çeviri sözlüğü — TÜİK ve ESR panelleri ortak kullanıyor
// (trade_stats/esr_* tablolarındaki ham Türkçe country_name/partner_name
// değerleri buradan EN/RU'ya çevriliyor; kapalı küme değil ama 1 yıl+
// gerçek veriden çekilmiş, dünya üzerindeki ülkelerin tamamına yakını).
  const COUNTRY_NAMES_I18N = {
    "Fransa": { en: "France", ru: "Франция" },
    "Portekiz": { en: "Portugal", ru: "Португалия" },
    "İspanya": { en: "Spain", ru: "Испания" },
    "Belçika": { en: "Belgium", ru: "Бельгия" },
    "Belçika-Lüksemburg": { en: "Belgium-Luxembourg", ru: "Бельгия-Люксембург" },
    "Fas": { en: "Morocco", ru: "Марокко" },
    "Cezayir": { en: "Algeria", ru: "Алжир" },
    "Tunus": { en: "Tunisia", ru: "Тунис" },
    "Libya": { en: "Libya", ru: "Ливия" },
    "Mısır": { en: "Egypt", ru: "Египет" },
    "Sudan": { en: "Sudan", ru: "Судан" },
    "Güney Sudan": { en: "South Sudan", ru: "Южный Судан" },
    "Moritanya": { en: "Mauritania", ru: "Мавритания" },
    "Mali": { en: "Mali", ru: "Мали" },
    "Burkina Faso": { en: "Burkina Faso", ru: "Буркина-Фасо" },
    "İzlanda": { en: "Iceland", ru: "Исландия" },
    "Nijer": { en: "Niger", ru: "Нигер" },
    "Çad": { en: "Chad", ru: "Чад" },
    "Cabo Verde": { en: "Cabo Verde", ru: "Кабо-Верде" },
    "Senegal": { en: "Senegal", ru: "Сенегал" },
    "Gambiya": { en: "Gambia", ru: "Гамбия" },
    "Gine Bissau": { en: "Guinea-Bissau", ru: "Гвинея-Бисау" },
    "Gine": { en: "Guinea", ru: "Гвинея" },
    "Sierra Leone": { en: "Sierra Leone", ru: "Сьерра-Леоне" },
    "Liberya": { en: "Liberia", ru: "Либерия" },
    "Kotdivuar": { en: "Côte d'Ivoire", ru: "Кот-д'Ивуар" },
    "Gana": { en: "Ghana", ru: "Гана" },
    "Norveç": { en: "Norway", ru: "Норвегия" },
    "Togo": { en: "Togo", ru: "Того" },
    "Benin": { en: "Benin", ru: "Бенин" },
    "Nijerya": { en: "Nigeria", ru: "Нигерия" },
    "Hollanda": { en: "Netherlands", ru: "Нидерланды" },
    "İsveç": { en: "Sweden", ru: "Швеция" },
    "Kamerun": { en: "Cameroon", ru: "Камерун" },
    "Orta Afrika Cumhuriyeti": { en: "Central African Republic", ru: "Центральноафриканская Республика" },
    "Ekvator Ginesi": { en: "Equatorial Guinea", ru: "Экваториальная Гвинея" },
    "Sao Tome ve Prinsipe": { en: "São Tomé and Príncipe", ru: "Сан-Томе и Принсипи" },
    "Gabon": { en: "Gabon", ru: "Габон" },
    "Kongo": { en: "Congo", ru: "Конго" },
    "Finlandiya": { en: "Finland", ru: "Финляндия" },
    "Kongo Demokratik Cumhuriyeti": { en: "Democratic Republic of the Congo", ru: "Демократическая Республика Конго" },
    "Ruanda": { en: "Rwanda", ru: "Руанда" },
    "Burundi": { en: "Burundi", ru: "Бурунди" },
    "Angola": { en: "Angola", ru: "Ангола" },
    "Etiyopya": { en: "Ethiopia", ru: "Эфиопия" },
    "Eritre": { en: "Eritrea", ru: "Эритрея" },
    "Cibuti": { en: "Djibouti", ru: "Джибути" },
    "Somali": { en: "Somalia", ru: "Сомали" },
    "Kenya": { en: "Kenya", ru: "Кения" },
    "Uganda": { en: "Uganda", ru: "Уганда" },
    "Tanzanya": { en: "Tanzania", ru: "Танзания" },
    "Seyşeller": { en: "Seychelles", ru: "Сейшельские Острова" },
    "İsviçre": { en: "Switzerland", ru: "Швейцария" },
    "Mozambik": { en: "Mozambique", ru: "Мозамбик" },
    "Madagaskar": { en: "Madagascar", ru: "Мадагаскар" },
    "Mauritius": { en: "Mauritius", ru: "Маврикий" },
    "Komorlar Birliği": { en: "Union of the Comoros", ru: "Союз Коморских Островов" },
    "Mayotte": { en: "Mayotte", ru: "Майотта" },
    "Zambia": { en: "Zambia", ru: "Замбия" },
    "Avusturya": { en: "Austria", ru: "Австрия" },
    "Zimbabve": { en: "Zimbabwe", ru: "Зимбабве" },
    "Malavi": { en: "Malawi", ru: "Малави" },
    "Güney Afrika Cumhuriyeti": { en: "Republic of South Africa", ru: "Южно-Африканская Республика" },
    "Namibya": { en: "Namibia", ru: "Намибия" },
    "Güney Afrika": { en: "South Africa", ru: "Южная Африка" },
    "Botsvana": { en: "Botswana", ru: "Ботсвана" },
    "Esvatini": { en: "Eswatini", ru: "Эсватини" },
    "Lesotho": { en: "Lesotho", ru: "Лесото" },
    "Almanya": { en: "Germany", ru: "Германия" },
    "ABD": { en: "USA", ru: "США" },
    "Kanada": { en: "Canada", ru: "Канада" },
    "Meksika": { en: "Mexico", ru: "Мексика" },
    "Guatemala": { en: "Guatemala", ru: "Гватемала" },
    "Belize": { en: "Belize", ru: "Белиз" },
    "Honduras": { en: "Honduras", ru: "Гондурас" },
    "El Salvador": { en: "El Salvador", ru: "Сальвадор" },
    "Nikaragua": { en: "Nicaragua", ru: "Никарагуа" },
    "Kostarika": { en: "Costa Rica", ru: "Коста-Рика" },
    "Panama": { en: "Panama", ru: "Панама" },
    "Küba": { en: "Cuba", ru: "Куба" },
    "St. Kitts ve Nevis": { en: "St. Kitts and Nevis", ru: "Сент-Китс и Невис" },
    "Haiti": { en: "Haiti", ru: "Гаити" },
    "Bahamalar": { en: "Bahamas", ru: "Багамские Острова" },
    "Türk ve Caicos Ad.": { en: "Turks and Caicos Islands", ru: "Теркс и Кайкос" },
    "Dominik Cumhuriyeti": { en: "Dominican Republic", ru: "Доминиканская Республика" },
    "Antigua ve Barbuda": { en: "Antigua and Barbuda", ru: "Антигуа и Барбуда" },
    "Malta": { en: "Malta", ru: "Мальта" },
    "Dominik": { en: "Dominica", ru: "Доминика" },
    "Jamaika": { en: "Jamaica", ru: "Ямайка" },
    "St. Lucia": { en: "St. Lucia", ru: "Сент-Люсия" },
    "St. Vincent ve Grenadines": { en: "St. Vincent and the Grenadines", ru: "Сент-Винсент и Гренадины" },
    "Barbados": { en: "Barbados", ru: "Барбадос" },
    "Trinidad ve Tobago": { en: "Trinidad and Tobago", ru: "Тринидад и Тобаго" },
    "Grenada": { en: "Grenada", ru: "Гренада" },
    "Aruba": { en: "Aruba", ru: "Аруба" },
    "Curaçao": { en: "Curaçao", ru: "Кюрасао" },
    "Hollanda Antilleri": { en: "Netherlands Antilles", ru: "Нидерландские Антильские острова" },
    "Kolombiya": { en: "Colombia", ru: "Колумбия" },
    "Venezuela": { en: "Venezuela", ru: "Венесуэла" },
    "Guyana": { en: "Guyana", ru: "Гайана" },
    "Surinam": { en: "Suriname", ru: "Суринам" },
    "İtalya": { en: "Italy", ru: "Италия" },
    "Ekvator": { en: "Ecuador", ru: "Эквадор" },
    "Peru": { en: "Peru", ru: "Перу" },
    "Brezilya": { en: "Brazil", ru: "Бразилия" },
    "Şili": { en: "Chile", ru: "Чили" },
    "Bolivya": { en: "Bolivia", ru: "Боливия" },
    "Paraguay": { en: "Paraguay", ru: "Парагвай" },
    "Uruguay": { en: "Uruguay", ru: "Уругвай" },
    "Arjantin": { en: "Argentina", ru: "Аргентина" },
    "Estonya": { en: "Estonia", ru: "Эстония" },
    "Letonya": { en: "Latvia", ru: "Латвия" },
    "Litvanya": { en: "Lithuania", ru: "Литва" },
    "Birleşik Krallık": { en: "United Kingdom", ru: "Великобритания" },
    "Polonya": { en: "Poland", ru: "Польша" },
    "Kuzey Kıbrıs Türk Cum.": { en: "Turkish Republic of Northern Cyprus", ru: "Турецкая Республика Северного Кипра" },
    "Lübnan": { en: "Lebanon", ru: "Ливан" },
    "Suriye": { en: "Syria", ru: "Сирия" },
    "Çekya": { en: "Czechia", ru: "Чехия" },
    "Irak": { en: "Iraq", ru: "Ирак" },
    "İran": { en: "Iran", ru: "Иран" },
    "İsrail": { en: "Israel", ru: "Израиль" },
    "Filistin Devleti": { en: "State of Palestine", ru: "Государство Палестина" },
    "Ürdün": { en: "Jordan", ru: "Иордания" },
    "Slovakya": { en: "Slovakia", ru: "Словакия" },
    "Suudi Arabistan": { en: "Saudi Arabia", ru: "Саудовская Аравия" },
    "Kuveyt": { en: "Kuwait", ru: "Кувейт" },
    "Macaristan": { en: "Hungary", ru: "Венгрия" },
    "Bahreyn": { en: "Bahrain", ru: "Бахрейн" },
    "Katar": { en: "Qatar", ru: "Катар" },
    "BAE": { en: "UAE", ru: "ОАЭ" },
    "Umman": { en: "Oman", ru: "Оман" },
    "Yemen": { en: "Yemen", ru: "Йемен" },
    "Romanya": { en: "Romania", ru: "Румыния" },
    "Afganistan": { en: "Afghanistan", ru: "Афганистан" },
    "Pakistan": { en: "Pakistan", ru: "Пакистан" },
    "Hindistan": { en: "India", ru: "Индия" },
    "Bangladeş": { en: "Bangladesh", ru: "Бангладеш" },
    "Maldivler": { en: "Maldives", ru: "Мальдивы" },
    "Sri Lanka": { en: "Sri Lanka", ru: "Шри-Ланка" },
    "Nepal": { en: "Nepal", ru: "Непал" },
    "Butan": { en: "Bhutan", ru: "Бутан" },
    "Myanmar": { en: "Myanmar", ru: "Мьянма" },
    "Bulgaristan": { en: "Bulgaria", ru: "Болгария" },
    "Tayland": { en: "Thailand", ru: "Таиланд" },
    "Laos": { en: "Laos", ru: "Лаос" },
    "Vietnam": { en: "Vietnam", ru: "Вьетнам" },
    "Kamboçya": { en: "Cambodia", ru: "Камбоджа" },
    "İrlanda": { en: "Ireland", ru: "Ирландия" },
    "Arnavutluk": { en: "Albania", ru: "Албания" },
    "Endonezya": { en: "Indonesia", ru: "Индонезия" },
    "Malezya": { en: "Malaysia", ru: "Малайзия" },
    "Bruney": { en: "Brunei", ru: "Бруней" },
    "Singapur": { en: "Singapore", ru: "Сингапур" },
    "Filipinler": { en: "Philippines", ru: "Филиппины" },
    "Moğolistan": { en: "Mongolia", ru: "Монголия" },
    "Ukrayna": { en: "Ukraine", ru: "Украина" },
    "Çin": { en: "China", ru: "Китай" },
    "Güney Kore": { en: "South Korea", ru: "Южная Корея" },
    "Belarus": { en: "Belarus", ru: "Беларусь" },
    "Japonya": { en: "Japan", ru: "Япония" },
    "Tayvan": { en: "Taiwan", ru: "Тайвань" },
    "Moldova": { en: "Moldova", ru: "Молдова" },
    "Hong Kong": { en: "Hong Kong", ru: "Гонконг" },
    "Makao": { en: "Macau", ru: "Макао" },
    "Rusya Federasyonu": { en: "Russian Federation", ru: "Российская Федерация" },
    "Gürcistan": { en: "Georgia", ru: "Грузия" },
    "Azerbaycan": { en: "Azerbaijan", ru: "Азербайджан" },
    "Kazakistan": { en: "Kazakhstan", ru: "Казахстан" },
    "Danimarka": { en: "Denmark", ru: "Дания" },
    "Türkmenistan": { en: "Turkmenistan", ru: "Туркменистан" },
    "Avustralya": { en: "Australia", ru: "Австралия" },
    "Papua Yeni Gine": { en: "Papua New Guinea", ru: "Папуа — Новая Гвинея" },
    "Yeni Zelanda": { en: "New Zealand", ru: "Новая Зеландия" },
    "Yeni Kaledonya": { en: "New Caledonia", ru: "Новая Каледония" },
    "Özbekistan": { en: "Uzbekistan", ru: "Узбекистан" },
    "Fiji": { en: "Fiji", ru: "Фиджи" },
    "Tacikistan": { en: "Tajikistan", ru: "Таджикистан" },
    "Kırgızistan": { en: "Kyrgyzstan", ru: "Киргизия" },
    "Amerikan Samoası": { en: "American Samoa", ru: "Американское Самоа" },
    "Yunanistan": { en: "Greece", ru: "Греция" },
    "Slovenya": { en: "Slovenia", ru: "Словения" },
    "Hırvatistan": { en: "Croatia", ru: "Хорватия" },
    "Bosna-Hersek": { en: "Bosnia and Herzegovina", ru: "Босния и Герцеговина" },
    "Kosova": { en: "Kosovo", ru: "Косово" },
    "Belirlenemeyen Ülke ve Bölgeler": { en: "Unspecified Countries and Regions", ru: "Неустановленные страны и регионы" },
    "Kuzey Makedonya": { en: "North Macedonia", ru: "Северная Македония" },
    "Antalya Serbest Bölgesi": { en: "Antalya Free Zone", ru: "Свободная зона Анталья" },
    "AHL Serbest Bölgesi": { en: "AHL Free Zone", ru: "Свободная зона AHL" },
    "İstanbul Endüstri ve Tic.Serb.Böl.": { en: "Istanbul Industry and Trade Free Zone", ru: "Свободная зона Стамбул (пром. и торг.)" },
    "Ege Serbest Bölgesi": { en: "Aegean Free Zone", ru: "Эгейская свободная зона" },
    "Mersin Serbest Bölgesi": { en: "Mersin Free Zone", ru: "Свободная зона Мерсин" },
    "Trakya Serbest Bölgesi": { en: "Thrace Free Zone", ru: "Свободная зона Фракия" },
    "Trabzon Serbest Bölgesi": { en: "Trabzon Free Zone", ru: "Свободная зона Трабзон" },
    "Mardin Serbest Bölgesi": { en: "Mardin Free Zone", ru: "Свободная зона Мардин" },
    "Karadağ": { en: "Montenegro", ru: "Черногория" },
    "İzmir Serbest Bölgesi": { en: "Izmir Free Zone", ru: "Свободная зона Измир" },
    "Yumurtalık Serbest Bölgesi": { en: "Yumurtalık Free Zone", ru: "Свободная зона Юмурталык" },
    "Rize Serbest Bölgesi": { en: "Rize Free Zone", ru: "Свободная зона Ризе" },
    "Samsun Serbest Bölgesi": { en: "Samsun Free Zone", ru: "Свободная зона Самсун" },
    "Kayseri Serbest Bölgesi": { en: "Kayseri Free Zone", ru: "Свободная зона Кайсери" },
    "Çorlu Avrupa Serbest Bölgesi": { en: "Çorlu European Free Zone", ru: "Европейская свободная зона Чорлу" },
    "Gaziantep Serbest Bölgesi": { en: "Gaziantep Free Zone", ru: "Свободная зона Газиантеп" },
    "Bursa Serbest Bölgesi": { en: "Bursa Free Zone", ru: "Свободная зона Бурса" },
    "Sırbistan": { en: "Serbia", ru: "Сербия" },
    "Kocaeli Serbest Bölgesi": { en: "Kocaeli Free Zone", ru: "Свободная зона Коджаэли" },
  };
function translateCountryName(name, lang) {
  if (lang === "tr" || !name) return name;
  const entry = COUNTRY_NAMES_I18N[name];
  return entry ? entry[lang] : name;
}

// ---------------------------------------------------------------------------
// Sayfalama yardımcıları — Ticaret Borsası'ndaki 4 tablo da (Özet/TÜRİB/UZTB/
// KTB) aynı düzeni paylaşıyor: veri zaten TAMAMEN çekilip önbelleğe alınmış
// durumda, sayfa geçişi sadece o aralığı diziden kesip DOM'a basıyor — her
// sayfa için YENİ bir Supabase isteği atılmıyor (ağ/"token" maliyeti sıfır,
// tamamı istemci tarafında).
function paginateRows(sortedArray, page, rowLimit) {
  const total = sortedArray.length;
  const totalPages = Math.max(1, Math.ceil(total / rowLimit));
  const clampedPage = Math.min(Math.max(0, page), totalPages - 1);
  const start = clampedPage * rowLimit;
  const slice = sortedArray.slice(start, start + rowLimit);
  return { slice, page: clampedPage, totalPages, start, end: start + slice.length, total };
}
function updatePagerUI(prefix, info) {
  document.getElementById(prefix + "-pager-label").textContent = info.total
    ? `${info.start + 1}–${info.end} / ${info.total.toLocaleString(window.__appLang === "tr" ? "tr-TR" : window.__appLang === "ru" ? "ru-RU" : "en-US")}`
    : "0 / 0";
  document.getElementById(prefix + "-page-prev").disabled = info.page <= 0;
  document.getElementById(prefix + "-page-next").disabled = info.page >= info.totalPages - 1;
}

(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;
  const DEFAULT_PRODUCT_CODE = "100590000019"; // Mısır — sistem bu ürün seçiliyken açılır
  // izlenen GTİP kodlarının kaynağı — "kod AD" biçimi artık hiçbir yerde
  // gösterilmiyor (ürün çiplerinde GTIP_SHORT_NAMES kullanılıyor).
  const GTIP_NAMES = {
    "100590000019": "1005.90.00.00.19 MISIR",
    "120190000000": "1201.90.00.00.00 SOYA FASULYESİ",
    "110430900011": "1104.30.90.00.11 MISIR ÖZÜ",
    "230400000000": "2304.00.00.00.00 SOYA KÜSPESİ",
    "120600990019": "1206.00.99.00.19 ÇEKİRDEK",
    "151211910000": "1512.11.91.00.00 AYÇİÇEK HAM",
    "151219900011": "1512.19.90.00.11 AYÇİÇEK RAFİNE",
    "150710900000": "1507.10.90.00.00 SOYA HAM",
    "150790900000": "1507.90.90.00.00 SOYA RAFİNE",
    "151521900000": "1515.21.90.00.00 MISIR HAM",
    "151529900000": "1515.29.90.00.00 MISIR RAFİNE",
  };
  // sade ürün adı — grafik, tablo ve rapordaki her yerde bu kullanılır.
  const GTIP_SHORT_NAMES = {
    "100590000019": "MISIR",
    "120190000000": "SOYA FASULYESİ",
    "110430900011": "MISIR ÖZÜ",
    "230400000000": "SOYA KÜSPESİ",
    "120600990019": "ÇEKİRDEK",
    "151211910000": "AYÇİÇEK HAM",
    "151219900011": "AYÇİÇEK RAFİNE",
    "150710900000": "SOYA HAM",
    "150790900000": "SOYA RAFİNE",
    "151521900000": "MISIR HAM",
    "151529900000": "MISIR RAFİNE",
  };
  const FLOW_COLOR = ["var(--series-export)", "var(--series-import)"];
  const CAT_COLORS = [
    "var(--series-export)", "var(--series-import)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)",
    "var(--cat-6)", "var(--cat-7)", "var(--cat-8)", "var(--cat-9)", "var(--cat-10)", "var(--cat-11)",
  ];

  // ---------- i18n (TR/EN/RU) — site geneli window.__registerI18nPanel'e
  // kayıtlı. Ay adları ve "İhracat/İthalat" dile göre değişir; ürün kısa
  // adları (GTIP_SHORT_NAMES) ve ülke adları (COUNTRY_NAMES_I18N, global)
  // ayrıca çevriliyor.
  let lang = "tr";
  const FLOW_LABEL_I18N = {
    tr: ["İhracat", "İthalat"],
    en: ["Export", "Import"],
    ru: ["Экспорт", "Импорт"],
  };
  const MONTH_ABBR_I18N = {
    tr: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
    en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    ru: ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  };
  const MONTH_FULL_I18N = {
    tr: ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    ru: ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"],
  };
  const GTIP_SHORT_NAMES_I18N = {
    "100590000019": { en: "Corn", ru: "Кукуруза" },
    "120190000000": { en: "Soybeans", ru: "Соевые бобы" },
    "110430900011": { en: "Corn Germ", ru: "Кукурузный зародыш" },
    "230400000000": { en: "Soybean Meal", ru: "Соевый шрот" },
    "120600990019": { en: "Sunflower Seed", ru: "Семена подсолнечника" },
    "151211910000": { en: "Crude Sunflower Oil", ru: "Сырое подсолнечное масло" },
    "151219900011": { en: "Refined Sunflower Oil", ru: "Рафинированное подсолнечное масло" },
    "150710900000": { en: "Crude Soybean Oil", ru: "Сырое соевое масло" },
    "150790900000": { en: "Refined Soybean Oil", ru: "Рафинированное соевое масло" },
    "151521900000": { en: "Crude Corn Oil", ru: "Сырое кукурузное масло" },
    "151529900000": { en: "Refined Corn Oil", ru: "Рафинированное кукурузное масло" },
  };
  const TUIK_STRINGS = {
    tr: {
      filterFlowLabel: "Yön", filterPeriodLabel: "Dönem", filterQuickSelectLabel: "Hızlı seçim",
      presetYtd: "Bu yıl", preset12m: "Son 12 ay", presetAll: "Tüm zamanlar",
      filterProductLabel: "Ürün", filterCountryLabel: "Ülke", countrySearchPlaceholder: "Ülke ara ve ekle…",
      resetFiltersBtn: "Filtreleri temizle",
      breakdownTitle: "Kırılım — istediğiniz kombinasyonu seçin",
      top10Prefix: "İlk 10",
      unitPriceBadgeTitle: "Toplam değer / toplam miktar — geçerli filtrelerin ortalaması",
      tonnageBadgeTitle: "Geçerli filtrelerdeki toplam miktar",
      unitPriceBadgePrefix: "Ort. birim fiyat: ", tonnageBadgePrefix: "Toplam tonaj: ",
      trendTitle: "Zaman içinde eğilim (ton)",
      prevPeriodTitle: "Önceki dönem", nextPeriodTitle: "Sonraki dönem",
      priceChartTitle: "Birim fiyat eğilimi ($/ton)",
      detailTableTitle: "Detay tablo",
      tableSearchPlaceholder: "Tabloda ürün/ülke ara…",
      noDataFilters: "Bu filtrelerle veri yok.", noDataPeriod: "Bu dönemde veri yok.",
      tooltipTotalValue: "toplam değer", tooltipTotalQty: "toplam miktar",
      dimProduct: "Ürün", dimCountry: "Ülke", dimYear: "Yıl", dimMonth: "Ay", dimFlow: "Yön",
      kpiTotalExport: "Toplam İhracat", kpiTotalImport: "Toplam İthalat", kpiNet: "Net (İhracat − İthalat)",
      kpiCountries: "Kapsanan ülke", kpiProducts: "Kapsanan ürün", kpiTotalTonnage: "Toplam Tonaj",
      yoySuffix: "YoY",
      thRank: "#", thQty: "Toplam Miktar", thValue: "Toplam Değer", thUnitPrice: "Birim Fiyat", thShare: "Pay",
      tableCountLimited: (n, total) => `İlk ${n} satır gösteriliyor · toplam ${total.toLocaleString("tr-TR")} satır`,
      tableCountAll: n => `${n.toLocaleString("tr-TR")} satır`,
      tableTotal: v => "Toplam: " + v,
      noMatchCountry: "Eşleşen ülke yok",
      flowAll: "Tümü",
      dataError: "Veri çekilemedi — Supabase bağlantısını kontrol edin",
    },
    en: {
      filterFlowLabel: "Direction", filterPeriodLabel: "Period", filterQuickSelectLabel: "Quick select",
      presetYtd: "This year", preset12m: "Last 12 months", presetAll: "All time",
      filterProductLabel: "Product", filterCountryLabel: "Country", countrySearchPlaceholder: "Search and add a country…",
      resetFiltersBtn: "Clear filters",
      breakdownTitle: "Breakdown — choose your combination",
      top10Prefix: "Top 10",
      unitPriceBadgeTitle: "Total value / total quantity — average for current filters",
      tonnageBadgeTitle: "Total quantity for current filters",
      unitPriceBadgePrefix: "Avg. unit price: ", tonnageBadgePrefix: "Total tonnage: ",
      trendTitle: "Trend over time (ton)",
      prevPeriodTitle: "Previous period", nextPeriodTitle: "Next period",
      priceChartTitle: "Unit price trend ($/ton)",
      detailTableTitle: "Detail table",
      tableSearchPlaceholder: "Search product/country in table…",
      noDataFilters: "No data for these filters.", noDataPeriod: "No data for this period.",
      tooltipTotalValue: "total value", tooltipTotalQty: "total quantity",
      dimProduct: "Product", dimCountry: "Country", dimYear: "Year", dimMonth: "Month", dimFlow: "Direction",
      kpiTotalExport: "Total Exports", kpiTotalImport: "Total Imports", kpiNet: "Net (Exports − Imports)",
      kpiCountries: "Countries covered", kpiProducts: "Products covered", kpiTotalTonnage: "Total Tonnage",
      yoySuffix: "YoY",
      thRank: "#", thQty: "Total Quantity", thValue: "Total Value", thUnitPrice: "Unit Price", thShare: "Share",
      tableCountLimited: (n, total) => `Showing first ${n} rows · ${total.toLocaleString("en-US")} rows total`,
      tableCountAll: n => `${n.toLocaleString("en-US")} rows`,
      tableTotal: v => "Total: " + v,
      noMatchCountry: "No matching country",
      flowAll: "All",
      dataError: "Failed to fetch data — check the Supabase connection",
    },
    ru: {
      filterFlowLabel: "Направление", filterPeriodLabel: "Период", filterQuickSelectLabel: "Быстрый выбор",
      presetYtd: "С начала года", preset12m: "Последние 12 месяцев", presetAll: "Всё время",
      filterProductLabel: "Продукт", filterCountryLabel: "Страна", countrySearchPlaceholder: "Поиск и добавление страны…",
      resetFiltersBtn: "Сбросить фильтры",
      breakdownTitle: "Разбивка — выберите комбинацию",
      top10Prefix: "Топ 10",
      unitPriceBadgeTitle: "Общая стоимость / общее количество — среднее по текущим фильтрам",
      tonnageBadgeTitle: "Общее количество по текущим фильтрам",
      unitPriceBadgePrefix: "Сред. цена за ед.: ", tonnageBadgePrefix: "Общий тоннаж: ",
      trendTitle: "Динамика во времени (т)",
      prevPeriodTitle: "Предыдущий период", nextPeriodTitle: "Следующий период",
      priceChartTitle: "Динамика удельной цены ($/т)",
      detailTableTitle: "Подробная таблица",
      tableSearchPlaceholder: "Поиск продукта/страны в таблице…",
      noDataFilters: "Нет данных для этих фильтров.", noDataPeriod: "Нет данных за этот период.",
      tooltipTotalValue: "общая стоимость", tooltipTotalQty: "общее количество",
      dimProduct: "Продукт", dimCountry: "Страна", dimYear: "Год", dimMonth: "Месяц", dimFlow: "Направление",
      kpiTotalExport: "Общий экспорт", kpiTotalImport: "Общий импорт", kpiNet: "Нетто (экспорт − импорт)",
      kpiCountries: "Охвачено стран", kpiProducts: "Охвачено продуктов", kpiTotalTonnage: "Общий тоннаж",
      yoySuffix: "г/г",
      thRank: "#", thQty: "Общее количество", thValue: "Общая стоимость", thUnitPrice: "Цена за ед.", thShare: "Доля",
      tableCountLimited: (n, total) => `Показаны первые ${n} строк · всего ${total.toLocaleString("ru-RU")} строк`,
      tableCountAll: n => `${n.toLocaleString("ru-RU")} строк`,
      tableTotal: v => "Итого: " + v,
      noMatchCountry: "Совпадающих стран нет",
      flowAll: "Все",
      dataError: "Не удалось загрузить данные — проверьте подключение к Supabase",
    },
  };
  function tt(key) { return TUIK_STRINGS[lang][key]; }
  function translateProductShort(code) {
    const base = GTIP_SHORT_NAMES[code] || code;
    if (lang === "tr") return base;
    const entry = GTIP_SHORT_NAMES_I18N[code];
    return entry ? entry[lang] : base;
  }

  // period "key" = ay çözünürlüğünde tek bir sıralanabilir tamsayı (year*12 + monthIndex0).
  function periodKey(year, month) { return year * 12 + ((month || 1) - 1); }
  function periodFromKey(key) {
    const month = (((key % 12) + 12) % 12) + 1;
    return { year: (key - (month - 1)) / 12, month };
  }
  function periodLabelShort(key) { const p = periodFromKey(key); return MONTH_ABBR_I18N[lang][p.month - 1] + " " + String(p.year).slice(2); }
  function periodLabelFull(key) { const p = periodFromKey(key); return MONTH_FULL_I18N[lang][p.month - 1] + " " + p.year; }
  function monthInputToKey(str) {
    if (!str) return null;
    const [y, m] = str.split("-").map(Number);
    return periodKey(y, m);
  }
  function keyToMonthInput(key) {
    const p = periodFromKey(key);
    return p.year + "-" + String(p.month).padStart(2, "0");
  }

  // ---------- live data ----------
  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 dk — trade_stats günde bir güncelleniyor

  async function fetchAllRows() {
    const cached = window.__supaCache.get("trade", CACHE_TTL_MS);
    if (cached) return cached;

    const headers = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` };
    const pageSize = 1000;
    let rows = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${cfg.SUPABASE_URL}/rest/v1/trade_stats?select=period_year,period_month,flow,gtip_code,country_code,country_name,value_usd,weight_kg&order=id.asc`,
        { headers: Object.assign({}, headers, { Range: `${from}-${from + pageSize - 1}` }) }
      );
      if (!res.ok) throw new Error(`Supabase istek hatası: ${res.status}`);
      const page = await res.json();
      rows = rows.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    const result = {
      rows: rows.map(r => [
        r.period_year,
        r.flow === "import" ? 1 : 0,
        r.gtip_code,
        r.country_code,
        r.country_name || "Bilinmiyor",
        r.value_usd,
        r.weight_kg,
        r.period_month,
      ]),
    };
    window.__supaCache.set("trade", result);
    return result;
  }

  // ---------- theme (works immediately, doesn't need data) ----------
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = current === "dark" ? "light" : current === "light" ? (prefersDark ? "dark" : "light") : (prefersDark ? "light" : "dark");
    root.setAttribute("data-theme", next);
  });

  function init(RAW) {
    lang = window.__appLang || "tr"; // fetch sırasında dil değişmiş olabilir — ilk render'dan itibaren doğru olsun

    const countryNames = {};
    RAW.forEach(r => { if (!countryNames[r[3]]) countryNames[r[3]] = r[4]; });
    const allCountries = Object.keys(countryNames).sort((a, b) => countryNames[a].localeCompare(countryNames[b], "tr"));
    const allProducts = Object.keys(GTIP_NAMES);

    const allPeriodKeys = [...new Set(RAW.map(r => periodKey(r[0], r[7])))].sort((a, b) => a - b);
    const minPeriodKey = allPeriodKeys[0];
    const maxPeriodKey = allPeriodKeys[allPeriodKeys.length - 1];
    // varsayılan: filtre konmamışsa yıl başından (Ocak) bugüne kadarki veri
    const ytdStartKey = periodKey(periodFromKey(maxPeriodKey).year, 1);

    const state = {
      flow: "all",
      periodStart: ytdStartKey,
      periodEnd: maxPeriodKey,
      products: new Set([DEFAULT_PRODUCT_CODE]),
      countries: new Set(),
      groupDims: new Set(["product", "country"]),
      tableSort: { key: "kg", dir: "desc" },
      tableSearch: "",
    };

    const DIMENSIONS = {
      product: { get label() { return tt("dimProduct"); }, get: r => r[2], display: v => translateProductShort(v) },
      country: { get label() { return tt("dimCountry"); }, get: r => r[3], display: v => translateCountryName(countryNames[v] || v, lang) },
      year: { get label() { return tt("dimYear"); }, get: r => r[0], display: v => String(v) },
      month: { get label() { return tt("dimMonth"); }, get: r => periodKey(r[0], r[7]), display: v => periodLabelFull(v) },
      flow: { get label() { return tt("dimFlow"); }, get: r => r[1], display: v => FLOW_LABEL_I18N[lang][v] },
    };
    const DIM_ORDER = ["product", "country", "year", "month", "flow"];

    function fmtUsd(v) {
      if (v == null || isNaN(v)) return "—";
      const a = Math.abs(v);
      if (a >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
      if (a >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
      if (a >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
      return "$" + v.toFixed(0);
    }
    function fmtUsdFull(v) {
      if (v == null || isNaN(v)) return "—";
      return "$" + Math.round(v).toLocaleString("tr-TR");
    }
    function fmtKg(v) {
      if (v == null || isNaN(v)) return "—";
      const ton = v / 1000;
      const a = Math.abs(ton);
      if (a >= 1e6) return (ton / 1e6).toFixed(2) + "M ton";
      if (a >= 1e3) return (ton / 1e3).toFixed(1) + "K ton";
      if (a >= 1) return ton.toFixed(1) + " ton";
      return (Math.round(v) || 0) + " kg";
    }
    // birim fiyat = toplam değer / toplam miktar ($/ton)
    function fmtUnitPrice(v) {
      if (v == null || isNaN(v)) return "—";
      return "$" + v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "/ton";
    }

    // ---------- filtering ----------
    // tüm kartlar (KPI, grafikler, tablo) aynı Dönem filtresine göre çalışır —
    // "neye göre veri alıyorsun" belirsizliği kalmasın diye tek bir kaynak.
    function filteredRows() {
      return RAW.filter(r => {
        if (state.flow !== "all" && String(r[1]) !== state.flow) return false;
        const key = periodKey(r[0], r[7]);
        if (key < state.periodStart || key > state.periodEnd) return false;
        if (state.products.size && !state.products.has(r[2])) return false;
        if (state.countries.size && !state.countries.has(r[3])) return false;
        return true;
      });
    }

    function computeGroups(rows, dims) {
      const map = new Map();
      for (const r of rows) {
        const parts = dims.map(d => DIMENSIONS[d].get(r));
        const key = parts.join("§");
        let entry = map.get(key);
        if (!entry) { entry = { parts, usd: 0, kg: 0, n: 0 }; map.set(key, entry); }
        entry.usd += r[5] || 0;
        entry.kg += r[6] || 0;
        entry.n++;
      }
      return [...map.values()];
    }

    // ---------- KPIs ----------
    function periodRangeLabel() {
      return state.periodStart === state.periodEnd
        ? periodLabelFull(state.periodStart)
        : periodLabelShort(state.periodStart) + " – " + periodLabelShort(state.periodEnd);
    }

    function renderKpis() {
      const rows = filteredRows();
      const exp = rows.filter(r => r[1] === 0).reduce((s, r) => s + (r[5] || 0), 0);
      const imp = rows.filter(r => r[1] === 1).reduce((s, r) => s + (r[5] || 0), 0);
      const kg = rows.reduce((s, r) => s + (r[6] || 0), 0);
      const net = exp - imp;

      // aynı uzunlukta bir önceki dönemle (12 ay öncesiyle) kıyasla
      const prevStart = state.periodStart - 12, prevEnd = state.periodEnd - 12;
      const prevRows = RAW.filter(r => {
        const key = periodKey(r[0], r[7]);
        if (key < prevStart || key > prevEnd) return false;
        if (state.flow !== "all" && String(r[1]) !== state.flow) return false;
        if (state.products.size && !state.products.has(r[2])) return false;
        if (state.countries.size && !state.countries.has(r[3])) return false;
        return true;
      });
      const prevExp = prevRows.filter(r => r[1] === 0).reduce((s, r) => s + (r[5] || 0), 0);
      const prevImp = prevRows.filter(r => r[1] === 1).reduce((s, r) => s + (r[5] || 0), 0);
      const yoyExp = prevExp ? ((exp - prevExp) / prevExp) * 100 : null;
      const yoyImp = prevImp ? ((imp - prevImp) / prevImp) * 100 : null;

      const countries = new Set(rows.map(r => r[3])).size;
      const products = new Set(rows.map(r => r[2])).size;
      const rangeLabel = " (" + periodRangeLabel() + ")";

      const tiles = [
        { label: tt("kpiTotalExport") + rangeLabel, value: fmtUsd(exp), delta: yoyExp },
        { label: tt("kpiTotalImport") + rangeLabel, value: fmtUsd(imp), delta: yoyImp },
        { label: tt("kpiNet"), value: (net >= 0 ? "+" : "") + fmtUsd(net), delta: null },
        { label: tt("kpiCountries"), value: String(countries), delta: null },
        { label: tt("kpiProducts"), value: String(products), delta: null },
        { label: tt("kpiTotalTonnage"), value: fmtKg(kg), delta: null },
      ];

      const container = document.getElementById("kpi-row");
      container.textContent = "";
      for (const t of tiles) {
        const tile = document.createElement("div");
        tile.className = "stat-tile";
        const label = document.createElement("div");
        label.className = "label"; label.textContent = t.label;
        const value = document.createElement("div");
        value.className = "value num"; value.textContent = t.value;
        tile.appendChild(label); tile.appendChild(value);
        if (t.delta != null) {
          const d = document.createElement("div");
          const dir = t.delta > 0.05 ? "up" : t.delta < -0.05 ? "down" : "flat";
          d.className = "delta " + dir;
          d.textContent = (t.delta >= 0 ? "▲ " : "▼ ") + Math.abs(t.delta).toFixed(1) + "% " + tt("yoySuffix");
          tile.appendChild(d);
        }
        container.appendChild(tile);
      }
    }

    // ---------- filter controls ----------
    function setPeriodInputs() {
      document.getElementById("period-start").value = keyToMonthInput(state.periodStart);
      document.getElementById("period-end").value = keyToMonthInput(state.periodEnd);
    }

    function setPeriod(startKey, endKey, presetName) {
      if (startKey > endKey) { const t = startKey; startKey = endKey; endKey = t; }
      state.periodStart = Math.max(minPeriodKey, startKey);
      state.periodEnd = Math.min(maxPeriodKey, endKey);
      setPeriodInputs();
      document.querySelectorAll("#period-presets .seg").forEach(b => b.classList.toggle("active", b.dataset.preset === presetName));
      renderAll();
    }

    function buildPeriodControls() {
      const startInput = document.getElementById("period-start");
      const endInput = document.getElementById("period-end");
      startInput.min = endInput.min = keyToMonthInput(minPeriodKey);
      startInput.max = endInput.max = keyToMonthInput(maxPeriodKey);
      setPeriodInputs();

      const onManualChange = () => {
        const s = monthInputToKey(startInput.value) ?? state.periodStart;
        const e = monthInputToKey(endInput.value) ?? state.periodEnd;
        document.querySelectorAll("#period-presets .seg").forEach(b => b.classList.remove("active"));
        setPeriod(s, e, null);
      };
      startInput.addEventListener("change", onManualChange);
      endInput.addEventListener("change", onManualChange);

      document.querySelectorAll("#period-presets .seg").forEach(btn => {
        btn.addEventListener("click", () => {
          const preset = btn.dataset.preset;
          if (preset === "ytd") setPeriod(ytdStartKey, maxPeriodKey, "ytd");
          else if (preset === "12m") setPeriod(maxPeriodKey - 11, maxPeriodKey, "12m");
          else if (preset === "all") setPeriod(minPeriodKey, maxPeriodKey, "all");
        });
      });
    }

    function buildFlowFilter() {
      const wrap = document.getElementById("flow-filter");
      wrap.querySelectorAll(".seg").forEach(btn => {
        btn.addEventListener("click", () => {
          state.flow = btn.dataset.value;
          wrap.querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
          renderAll();
        });
      });
    }

    function buildProductChips() {
      const wrap = document.getElementById("product-chips");
      wrap.textContent = "";
      allProducts.forEach((code, i) => {
        const chip = document.createElement("button");
        chip.className = "chip" + (state.products.has(code) ? " active" : "");
        chip.type = "button";
        const sw = document.createElement("span");
        sw.className = "swatch";
        sw.style.background = CAT_COLORS[i % CAT_COLORS.length];
        chip.appendChild(sw);
        chip.appendChild(document.createTextNode(translateProductShort(code)));
        chip.addEventListener("click", () => {
          if (state.products.has(code)) state.products.delete(code); else state.products.add(code);
          chip.classList.toggle("active");
          renderAll();
        });
        wrap.appendChild(chip);
      });
    }

    function renderCountrySelected() {
      const wrap = document.getElementById("country-selected");
      wrap.textContent = "";
      [...state.countries].sort((a, b) => (countryNames[a] || "").localeCompare(countryNames[b] || "", "tr")).forEach(code => {
        const chip = document.createElement("button");
        chip.className = "chip active";
        chip.type = "button";
        chip.appendChild(document.createTextNode(translateCountryName(countryNames[code] || code, lang)));
        const x = document.createElement("span");
        x.className = "x"; x.textContent = " ✕";
        chip.appendChild(x);
        chip.addEventListener("click", () => { state.countries.delete(code); renderAll(); });
        wrap.appendChild(chip);
      });
    }

    function buildCountrySearch() {
      const input = document.getElementById("country-search");
      const box = document.getElementById("country-suggestions");
      let activeIndex = -1;
      let currentMatches = [];

      function closeSuggestions() {
        box.classList.remove("open");
        box.textContent = "";
        activeIndex = -1;
        currentMatches = [];
      }

      function pick(code) {
        state.countries.add(code);
        input.value = "";
        closeSuggestions();
        renderAll();
        input.focus();
      }

      function renderSuggestions() {
        const q = input.value.trim().toLowerCase();
        box.textContent = "";
        if (!q) { closeSuggestions(); return; }
        currentMatches = allCountries
          .filter(c => !state.countries.has(c) && translateCountryName(countryNames[c], lang).toLowerCase().includes(q))
          .slice(0, 30);
        if (!currentMatches.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = tt("noMatchCountry");
          box.appendChild(empty);
          box.classList.add("open");
          activeIndex = -1;
          return;
        }
        currentMatches.forEach((code, i) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = translateCountryName(countryNames[code], lang);
          if (i === activeIndex) btn.classList.add("active-option");
          btn.addEventListener("mousedown", evt => { evt.preventDefault(); pick(code); });
          box.appendChild(btn);
        });
        box.classList.add("open");
      }

      input.addEventListener("input", () => { activeIndex = -1; renderSuggestions(); });
      input.addEventListener("focus", () => { if (input.value.trim()) renderSuggestions(); });
      input.addEventListener("blur", () => { closeSuggestions(); });
      input.addEventListener("keydown", evt => {
        if (!currentMatches.length) return;
        if (evt.key === "ArrowDown") { evt.preventDefault(); activeIndex = Math.min(currentMatches.length - 1, activeIndex + 1); renderSuggestions(); }
        else if (evt.key === "ArrowUp") { evt.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); renderSuggestions(); }
        else if (evt.key === "Enter") { evt.preventDefault(); pick(currentMatches[activeIndex >= 0 ? activeIndex : 0]); }
        else if (evt.key === "Escape") { closeSuggestions(); }
      });
    }

    function buildGroupControls() {
      const wrap = document.getElementById("group-controls");
      wrap.textContent = "";
      DIM_ORDER.forEach(dim => {
        const btn = document.createElement("button");
        btn.className = "dim-toggle" + (state.groupDims.has(dim) ? " active" : "");
        btn.type = "button";
        btn.textContent = DIMENSIONS[dim].label;
        btn.addEventListener("click", () => {
          if (state.groupDims.has(dim)) state.groupDims.delete(dim); else state.groupDims.add(dim);
          btn.classList.toggle("active");
          renderAll();
        });
        wrap.appendChild(btn);
      });
    }

    document.getElementById("reset-filters").addEventListener("click", () => {
      state.flow = "all";
      state.products = new Set([DEFAULT_PRODUCT_CODE]); state.countries.clear();
      document.querySelectorAll("#flow-filter .seg").forEach(b => b.classList.toggle("active", b.dataset.value === "all"));
      buildProductChips();
      document.getElementById("country-search").value = "";
      setPeriod(ytdStartKey, maxPeriodKey, "ytd");
    });

    // ---------- tooltip ----------
    function makeTooltip() {
      let el = document.querySelector(".tooltip");
      if (!el) { el = document.createElement("div"); el.className = "tooltip"; document.body.appendChild(el); }
      return el;
    }
    function showTooltip(evt, node) {
      const tip = makeTooltip();
      tip.textContent = ""; tip.appendChild(node);
      tip.style.opacity = "1";
      let x = evt.clientX + 14, y = evt.clientY + 14;
      tip.style.left = x + "px"; tip.style.top = y + "px";
      const rect = tip.getBoundingClientRect();
      if (rect.right > window.innerWidth) tip.style.left = (evt.clientX - rect.width - 14) + "px";
      if (rect.bottom > window.innerHeight) tip.style.top = (evt.clientY - rect.height - 14) + "px";
    }
    function hideTooltip() { const t = document.querySelector(".tooltip"); if (t) t.style.opacity = "0"; }

    // ---------- top-N bar chart ----------
    function renderTopChart() {
      const rows = filteredRows();
      const dims = [...state.groupDims].length ? [...state.groupDims] : ["product"];
      const groups = computeGroups(rows, dims).sort((a, b) => b.usd - a.usd).slice(0, 10);

      document.getElementById("top-chart-title").textContent =
        tt("top10Prefix") + " — " + dims.map(d => DIMENSIONS[d].label).join(" × ") + " (" + periodRangeLabel() + ")";

      const svg = document.getElementById("top-chart");
      svg.textContent = "";
      if (!groups.length) {
        svg.setAttribute("viewBox", "0 0 520 60");
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", 10); t.setAttribute("y", 30); t.setAttribute("class", "axis-label");
        t.textContent = tt("noDataFilters");
        svg.appendChild(t);
        return;
      }

      const twoLine = dims.length > 1;
      const rowH = twoLine ? 38 : 28, gap = 4, padL = 220, padR = 64, padTop = 6;
      const barH = 20;
      const width = 590;
      const height = groups.length * (rowH + gap) + padTop;
      svg.setAttribute("viewBox", "0 0 " + width + " " + height);

      const maxVal = Math.max(...groups.map(g => g.usd), 1);
      const barMax = width - padL - padR;

      function truncate(s, n) { return s.length > n ? s.slice(0, n - 2) + "…" : s; }

      groups.forEach((g, i) => {
        const y = padTop + i * (rowH + gap);
        const barW = Math.max(3, (g.usd / maxVal) * barMax);
        const parts = g.parts.map((p, j) => DIMENSIONS[dims[j]].display(p));
        const label = parts.join(" · ");

        if (twoLine) {
          // primary dimension (e.g. Ürün) on its own line, the rest (e.g. Ülke) below it —
          // a single truncated "Ürün · Ülke" string was hiding the second dimension entirely
          // whenever the first one alone was already long.
          const line1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
          line1.setAttribute("x", padL - 10); line1.setAttribute("y", y + rowH / 2 - 5);
          line1.setAttribute("text-anchor", "end"); line1.setAttribute("class", "bar-label");
          line1.textContent = truncate(parts[0], 30);
          svg.appendChild(line1);

          const line2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
          line2.setAttribute("x", padL - 10); line2.setAttribute("y", y + rowH / 2 + 10);
          line2.setAttribute("text-anchor", "end"); line2.setAttribute("class", "axis-label");
          line2.textContent = truncate(parts.slice(1).join(" · "), 30);
          svg.appendChild(line2);
        } else {
          const labelT = document.createElementNS("http://www.w3.org/2000/svg", "text");
          labelT.setAttribute("x", padL - 10); labelT.setAttribute("y", y + rowH / 2 + 4);
          labelT.setAttribute("text-anchor", "end"); labelT.setAttribute("class", "bar-label");
          labelT.textContent = truncate(label, 32);
          svg.appendChild(labelT);
        }

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", padL); rect.setAttribute("y", y + (rowH - barH) / 2);
        rect.setAttribute("width", barW); rect.setAttribute("height", barH);
        rect.setAttribute("rx", 4); rect.setAttribute("fill", "var(--series-export)");
        rect.style.cursor = "pointer";
        rect.tabIndex = 0;
        const showFn = (evt) => {
          const wrap = document.createElement("div");
          const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = label;
          wrap.appendChild(ttl);
          const row1 = document.createElement("div"); row1.className = "row";
          const v1 = document.createElement("span"); v1.className = "val"; v1.textContent = fmtUsdFull(g.usd);
          row1.appendChild(v1); row1.appendChild(document.createTextNode(" " + tt("tooltipTotalValue")));
          wrap.appendChild(row1);
          const row2 = document.createElement("div"); row2.className = "row";
          const v2 = document.createElement("span"); v2.className = "val"; v2.textContent = fmtKg(g.kg);
          row2.appendChild(v2); row2.appendChild(document.createTextNode(" " + tt("tooltipTotalQty")));
          wrap.appendChild(row2);
          showTooltip(evt, wrap);
        };
        rect.addEventListener("pointermove", showFn);
        rect.addEventListener("focus", showFn);
        rect.addEventListener("pointerleave", hideTooltip);
        rect.addEventListener("blur", hideTooltip);
        svg.appendChild(rect);

        const valT = document.createElementNS("http://www.w3.org/2000/svg", "text");
        valT.setAttribute("x", padL + barW + 8); valT.setAttribute("y", y + rowH / 2 + 4);
        valT.setAttribute("class", "bar-value");
        valT.textContent = fmtUsd(g.usd);
        svg.appendChild(valT);
      });
    }

    // ---------- month trend charts (value + unit price) — driven by the Dönem filter ----------
    // No separate chart-only zoom/pan math anymore: the visible window is exactly
    // [state.periodStart, state.periodEnd], the same range the KPIs/table use, so
    // "what basis is this data on" always has one visible, unambiguous answer.
    // Panning moves that shared range; ◀ ▶ shift it by its own width.
    const TREND_W = 560, TREND_H = 170, TREND_PADL = 60, TREND_PADR = 16, TREND_PADT = 10, TREND_PADB = 24;

    function trendPeriods() {
      const periods = [];
      for (let k = state.periodStart; k <= state.periodEnd; k++) periods.push(k);
      return periods;
    }

    function updateTrendNav() {
      document.getElementById("trend-range-label").textContent = periodRangeLabel();
      const span = state.periodEnd - state.periodStart;
      document.getElementById("trend-prev").disabled = state.periodStart - span - 1 < minPeriodKey;
      document.getElementById("trend-next").disabled = state.periodEnd + span + 1 > maxPeriodKey;
    }

    function panTrend(direction) {
      const span = state.periodEnd - state.periodStart;
      const shift = (span + 1) * direction;
      let newStart = state.periodStart + shift;
      let newEnd = state.periodEnd + shift;
      if (newStart < minPeriodKey) { newStart = minPeriodKey; newEnd = newStart + span; }
      if (newEnd > maxPeriodKey) { newEnd = maxPeriodKey; newStart = newEnd - span; }
      setPeriod(newStart, newEnd, null);
    }

    // ortak eksen/gridline/hover-crosshair çizici — değer ve birim fiyat grafikleri
    // aynı ay eksenini paylaştığı için tek bir çizici fonksiyon kullanılıyor.
    function drawSeriesChart(svgId, periods, series, valueFmt, tooltipTitle) {
      const svg = document.getElementById(svgId);
      svg.textContent = "";
      svg.setAttribute("viewBox", "0 0 " + TREND_W + " " + TREND_H);
      if (periods.length < 1) {
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", TREND_PADL); t.setAttribute("y", TREND_H / 2); t.setAttribute("class", "axis-label");
        t.textContent = tt("noDataPeriod");
        svg.appendChild(t);
        return;
      }

      // tek aylık bir aralıkta çizgi çizilemez (bölme hatasına yol açar) — nokta ortalanır.
      const xStep = periods.length > 1 ? (TREND_W - TREND_PADL - TREND_PADR) / (periods.length - 1) : 0;
      const xScale = i => periods.length > 1 ? TREND_PADL + i * xStep : (TREND_PADL + (TREND_W - TREND_PADR)) / 2;
      const maxVal = Math.max(1, ...series.map(s => Math.max(0, ...periods.map(k => s.totals.get(k) || 0))));
      const yScale = v => TREND_H - TREND_PADB - (v / maxVal) * (TREND_H - TREND_PADB - TREND_PADT);

      for (let g = 0; g <= 3; g++) {
        const y = TREND_PADT + (g * (TREND_H - TREND_PADB - TREND_PADT)) / 3;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("class", "gridline");
        line.setAttribute("x1", TREND_PADL); line.setAttribute("x2", TREND_W - TREND_PADR);
        line.setAttribute("y1", y); line.setAttribute("y2", y);
        svg.appendChild(line);
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", TREND_PADL - 8); t.setAttribute("y", y + 3);
        t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
        t.textContent = valueFmt(maxVal - (g * maxVal) / 3);
        svg.appendChild(t);
      }

      // etiketler asla üst üste binmesin diye piksel cinsinden minimum aralık uygulanır
      const minLabelGap = 34;
      const tickEvery = Math.max(1, Math.ceil((minLabelGap) / Math.max(xStep, 1)));
      periods.forEach((key, i) => {
        const isLast = i === periods.length - 1;
        if (i % tickEvery !== 0 && !isLast) return;
        if (isLast && periods.length > 1 && (periods.length - 1) % tickEvery !== 0) {
          const prevShown = Math.floor((periods.length - 1) / tickEvery) * tickEvery;
          if ((periods.length - 1 - prevShown) * xStep < minLabelGap) return;
        }
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", xScale(i)); t.setAttribute("y", TREND_H - 6);
        t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
        t.textContent = periodLabelShort(key);
        svg.appendChild(t);
      });

      const hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      hoverLine.setAttribute("class", "baseline");
      hoverLine.setAttribute("y1", TREND_PADT); hoverLine.setAttribute("y2", TREND_H - TREND_PADB);
      hoverLine.style.opacity = "0";
      svg.appendChild(hoverLine);

      series.forEach(s => {
        const pts = periods.map((k, i) => [xScale(i), yScale(s.totals.get(k) || 0)]);
        if (pts.length === 1) {
          const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          dot.setAttribute("cx", pts[0][0]); dot.setAttribute("cy", pts[0][1]); dot.setAttribute("r", "4");
          dot.setAttribute("fill", s.color);
          if (s.skey) { dot.setAttribute("class", "series-line"); dot.dataset.skey = s.skey; }
          svg.appendChild(dot);
          return;
        }
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" "));
        path.setAttribute("stroke", s.color); path.setAttribute("stroke-width", "2");
        path.setAttribute("fill", "none"); path.setAttribute("stroke-linejoin", "round"); path.setAttribute("stroke-linecap", "round");
        if (s.dashed) path.setAttribute("stroke-dasharray", "5,4");
        path.setAttribute("class", "series-line");
        if (s.skey) path.dataset.skey = s.skey;
        svg.appendChild(path);
      });

      const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      periods.forEach((key, i) => {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        const hitW = Math.max(xStep, 6);
        rect.setAttribute("x", xScale(i) - hitW / 2); rect.setAttribute("y", TREND_PADT);
        rect.setAttribute("width", hitW); rect.setAttribute("height", TREND_H - TREND_PADB - TREND_PADT);
        rect.setAttribute("fill", "transparent"); rect.style.cursor = "pointer";
        rect.tabIndex = 0;
        const showFn = evt => {
          hoverLine.setAttribute("x1", xScale(i)); hoverLine.setAttribute("x2", xScale(i));
          hoverLine.style.opacity = "1";
          const wrap = document.createElement("div");
          const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = tooltipTitle(key);
          wrap.appendChild(ttl);
          series.forEach(s => {
            const val = s.totals.get(key);
            if (val == null) return;
            const row = document.createElement("div"); row.className = "row";
            const keyLine = document.createElement("span"); keyLine.className = "key-line" + (s.dashed ? " dashed" : ""); keyLine.style.background = s.dashed ? "" : s.color; keyLine.style.borderColor = s.color;
            const v = document.createElement("span"); v.className = "val"; v.textContent = s.fullFmt(val);
            row.appendChild(keyLine); row.appendChild(v); row.appendChild(document.createTextNode(" " + s.label));
            wrap.appendChild(row);
          });
          showTooltip(evt, wrap);
        };
        rect.addEventListener("pointermove", showFn);
        rect.addEventListener("focus", showFn);
        rect.addEventListener("pointerleave", () => { hoverLine.style.opacity = "0"; hideTooltip(); });
        rect.addEventListener("blur", () => { hoverLine.style.opacity = "0"; hideTooltip(); });
        hitLayer.appendChild(rect);
      });
      svg.appendChild(hitLayer);
    }

    // ürün bazlı: her seçili GTİP kendi çizgisi — seçilmeyenler grafikten
    // çıkar, hiçbiri seçilmemişse (varsayılan) hepsi ayrı ayrı gösterilir.
    // Renkler ürün çiplerindeki renklerle birebir aynı (CAT_COLORS, aynı sıra).
    function trendProducts() {
      return allProducts.filter(code => !state.products.size || state.products.has(code));
    }
    function productColor(code) {
      return CAT_COLORS[allProducts.indexOf(code) % CAT_COLORS.length];
    }

    // her ürün × yön kombinasyonu kendi çizgisi: renk = ürün (çiplerle aynı),
    // çizgi stili = yön (düz = ihracat, kesikli = ithalat) — böylece ithalat
    // ve ihracat aynı anda, birbirinden ayırt edilerek görülebiliyor. Yön
    // filtresi tek bir yöne daraltılmışsa o tek çizgi düz çizilir.
    function trendFlows() {
      return state.flow === "all" ? [0, 1] : [Number(state.flow)];
    }

    function renderTrendChart() {
      updateTrendNav();
      const rows = filteredRows();
      const products = trendProducts();
      const flows = trendFlows();
      const showFlowSuffix = flows.length > 1;

      const legend = document.getElementById("trend-legend");
      legend.textContent = "";
      products.forEach(code => {
        flows.forEach(f => {
          const key = document.createElement("span"); key.className = "key"; key.dataset.skey = code + "::" + f;
          const sw = document.createElement("span"); sw.className = "swatch-line" + (f === 1 ? " dashed" : "");
          if (f === 1) sw.style.borderColor = productColor(code); else sw.style.background = productColor(code);
          key.appendChild(sw);
          key.appendChild(document.createTextNode(translateProductShort(code) + (showFlowSuffix ? " · " + FLOW_LABEL_I18N[lang][f] : "")));
          legend.appendChild(key);
        });
      });

      const periods = trendPeriods();
      const usdTotals = products.map(code => flows.map(f => {
        const m = new Map();
        rows.filter(r => r[2] === code && r[1] === f).forEach(r => {
          const key = periodKey(r[0], r[7]);
          m.set(key, (m.get(key) || 0) + (r[5] || 0));
        });
        return m;
      }));
      const kgTotals = products.map(code => flows.map(f => {
        const m = new Map();
        rows.filter(r => r[2] === code && r[1] === f).forEach(r => { const k = periodKey(r[0], r[7]); m.set(k, (m.get(k) || 0) + (r[6] || 0)); });
        return m;
      }));

      // üstteki grafik tonaj gösterir — toplam değer ($) zaten detay tabloda ve
      // alttaki birim fiyat grafiğinde var, burada tekrarlamak yerine miktarı gösteriyoruz.
      const tonnageSeries = [];
      products.forEach((code, pi) => flows.forEach((f, fi) => {
        tonnageSeries.push({
          totals: kgTotals[pi][fi], color: productColor(code), dashed: f === 1, skey: code + "::" + f,
          label: translateProductShort(code) + (showFlowSuffix ? " · " + FLOW_LABEL_I18N[lang][f] : ""), fullFmt: fmtKg,
        });
      }));
      drawSeriesChart("trend-chart", periods, tonnageSeries, fmtKg, key => periodLabelFull(key));

      const priceSeries = [];
      products.forEach((code, pi) => flows.forEach((f, fi) => {
        const m = new Map();
        periods.forEach(k => {
          const kg = kgTotals[pi][fi].get(k);
          if (kg) m.set(k, (usdTotals[pi][fi].get(k) / kg) * 1000);
        });
        priceSeries.push({
          totals: m, color: productColor(code), dashed: f === 1, skey: code + "::" + f,
          label: translateProductShort(code) + (showFlowSuffix ? " · " + FLOW_LABEL_I18N[lang][f] : ""), fullFmt: fmtUnitPrice,
        });
      }));
      drawSeriesChart("price-chart", periods, priceSeries, v => "$" + Math.round(v), key => periodLabelFull(key));
    }

    function setupTrendNav() {
      document.getElementById("trend-prev").addEventListener("click", () => panTrend(-1));
      document.getElementById("trend-next").addEventListener("click", () => panTrend(1));
    }

    // legend'daki bir seriye gelince ilgili çizgiyi öne çıkarıp diğerlerini
    // soldurur — çok çizgili grafiklerde tek bir seriyi takip etmeyi kolaylaştırır.
    function setupTrendHighlight() {
      function apply(skey) {
        document.querySelectorAll(".legend .key").forEach(k => k.classList.toggle("dim", k.dataset.skey !== skey));
        document.querySelectorAll("svg.chart .series-line").forEach(el => {
          const match = el.dataset.skey === skey;
          el.classList.toggle("dim", !match);
          el.classList.toggle("focus", match);
        });
      }
      function clear() {
        document.querySelectorAll(".legend .key, svg.chart .series-line").forEach(el => el.classList.remove("dim", "focus"));
      }
      const legend = document.getElementById("trend-legend");
      legend.addEventListener("pointerover", e => {
        const key = e.target.closest(".key");
        if (key && key.dataset.skey) apply(key.dataset.skey);
      });
      legend.addEventListener("pointerout", e => { if (e.target.closest(".key")) clear(); });
    }

    // ---------- pivot table ----------
    function renderTable() {
      const rows = filteredRows();
      const dims = [...state.groupDims];
      let groups = computeGroups(rows, dims);
      const total = groups.reduce((s, g) => s + g.usd, 0) || 1;
      // standart birim fiyat: bu satırın toplam değeri / toplam miktarı (satırlar arası ortalama değil)
      groups.forEach(g => { g.unitPrice = g.kg ? (g.usd / g.kg) * 1000 : null; });

      if (state.tableSearch) {
        const q = state.tableSearch.toLowerCase();
        groups = groups.filter(g => dims.some((d, i) => DIMENSIONS[d].display(g.parts[i]).toLowerCase().includes(q)));
      }

      const sortKey = state.tableSort.key, sortDir = state.tableSort.dir;
      groups.sort((a, b) => {
        let av, bv;
        if (sortKey === "usd" || sortKey === "kg" || sortKey === "n" || sortKey === "unitPrice") {
          av = a[sortKey] ?? -Infinity; bv = b[sortKey] ?? -Infinity;
        }
        else { const di = dims.indexOf(sortKey); av = DIMENSIONS[dims[di]].display(a.parts[di]); bv = DIMENSIONS[dims[di]].display(b.parts[di]); }
        if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv, "tr") : bv.localeCompare(av, "tr");
        return sortDir === "asc" ? av - bv : bv - av;
      });

      const thead = document.getElementById("pivot-thead");
      thead.textContent = "";
      const cols = [{ key: "rank", label: tt("thRank"), num: false }]
        .concat(dims.map(d => ({ key: d, label: DIMENSIONS[d].label, num: false })))
        .concat([
          { key: "kg", label: tt("thQty"), num: true },
          { key: "usd", label: tt("thValue"), num: true },
          { key: "unitPrice", label: tt("thUnitPrice"), num: true },
          { key: "share", label: tt("thShare"), num: true },
        ]);
      cols.forEach(c => {
        const th = document.createElement("th");
        if (c.num) th.classList.add("num-col");
        th.textContent = c.label;
        if (c.key !== "rank" && c.key !== "share") {
          if (state.tableSort.key === c.key) {
            const arrow = document.createElement("span");
            arrow.className = "arrow"; arrow.textContent = state.tableSort.dir === "asc" ? "↑" : "↓";
            th.appendChild(arrow);
          }
          th.addEventListener("click", () => {
            if (state.tableSort.key === c.key) state.tableSort.dir = state.tableSort.dir === "asc" ? "desc" : "asc";
            else state.tableSort = { key: c.key, dir: "desc" };
            renderTable();
          });
        }
        thead.appendChild(th);
      });

      const tbody = document.getElementById("pivot-tbody");
      tbody.textContent = "";
      groups.slice(0, 300).forEach((g, i) => {
        const tr = document.createElement("tr");
        const rankTd = document.createElement("td"); rankTd.className = "rank num"; rankTd.textContent = String(i + 1);
        tr.appendChild(rankTd);
        dims.forEach((d, di) => {
          const td = document.createElement("td");
          if (d === "flow") {
            const tag = document.createElement("span"); tag.className = "flow-tag";
            const dot = document.createElement("span"); dot.className = "dot"; dot.style.background = FLOW_COLOR[g.parts[di]];
            tag.appendChild(dot); tag.appendChild(document.createTextNode(FLOW_LABEL_I18N[lang][g.parts[di]]));
            td.appendChild(tag);
          } else {
            td.textContent = DIMENSIONS[d].display(g.parts[di]);
          }
          tr.appendChild(td);
        });
        const kgTd = document.createElement("td"); kgTd.className = "num-col num"; kgTd.textContent = fmtKg(g.kg);
        tr.appendChild(kgTd);
        const usdTd = document.createElement("td"); usdTd.className = "num-col num"; usdTd.textContent = fmtUsdFull(g.usd);
        tr.appendChild(usdTd);
        const priceTd = document.createElement("td"); priceTd.className = "num-col num"; priceTd.textContent = fmtUnitPrice(g.unitPrice);
        tr.appendChild(priceTd);
        const shareTd = document.createElement("td"); shareTd.className = "num-col";
        const shareWrap = document.createElement("div"); shareWrap.className = "share-bar-wrap";
        const pct = Math.max(0, Math.min(100, (g.usd / total) * 100));
        const bar = document.createElement("div"); bar.className = "share-bar";
        const fill = document.createElement("span"); fill.style.width = pct + "%"; bar.appendChild(fill);
        const pctText = document.createElement("span"); pctText.className = "num"; pctText.style.fontSize = "12px";
        pctText.textContent = pct.toFixed(1) + "%";
        shareWrap.appendChild(bar); shareWrap.appendChild(pctText);
        shareTd.appendChild(shareWrap);
        tr.appendChild(shareTd);
        tbody.appendChild(tr);
      });

      document.getElementById("table-count").textContent =
        groups.length > 300 ? tt("tableCountLimited")(300, groups.length) : tt("tableCountAll")(groups.length);
      document.getElementById("table-total").textContent = tt("tableTotal")(fmtUsdFull(total));
    }

    document.getElementById("table-search").addEventListener("input", (e) => {
      state.tableSearch = e.target.value.trim();
      renderTable();
    });

    function setBadgeText(id, prefixKey, value) {
      const el = document.getElementById(id);
      el.textContent = "";
      const prefix = document.createElement("span");
      prefix.className = "badge-prefix";
      prefix.textContent = tt(prefixKey);
      el.appendChild(prefix);
      el.appendChild(document.createTextNode(value));
    }

    function renderUnitPriceBadge() {
      const rows = filteredRows();
      const usd = rows.reduce((s, r) => s + (r[5] || 0), 0);
      const kg = rows.reduce((s, r) => s + (r[6] || 0), 0);
      setBadgeText("unit-price-badge", "unitPriceBadgePrefix", fmtUnitPrice(kg ? (usd / kg) * 1000 : null));
      setBadgeText("tonnage-badge", "tonnageBadgePrefix", fmtKg(kg));
    }

    function renderAll() {
      renderCountrySelected();
      renderKpis();
      renderUnitPriceBadge();
      renderTopChart();
      renderTrendChart();
      renderTable();
    }

    // Dil değişince sabit arayüz metinleri (etiketler, başlıklar, tooltip
    // title'ları, placeholder'lar) yeniden yazılır + ürün çipleri/kırılım
    // butonları (çevrilen etiketler) yeniden kurulur + tüm kartlar yeniden
    // render edilir. state/filtreler ham (Türkçe/koda bağlı) değerde kalır,
    // sadece GÖRÜNÜM çevriliyor.
    function applyLanguage(newLang) {
      lang = newLang;
      document.getElementById("tuik-label-flow").textContent = tt("filterFlowLabel");
      document.getElementById("tuik-label-period").textContent = tt("filterPeriodLabel");
      document.getElementById("tuik-label-quickselect").textContent = tt("filterQuickSelectLabel");
      document.getElementById("tuik-label-product").textContent = tt("filterProductLabel");
      document.getElementById("tuik-label-country").textContent = tt("filterCountryLabel");
      document.querySelector('#flow-filter .seg[data-value="all"]').textContent = tt("flowAll");
      document.querySelector('#flow-filter .seg[data-value="0"]').textContent = FLOW_LABEL_I18N[lang][0];
      document.querySelector('#flow-filter .seg[data-value="1"]').textContent = FLOW_LABEL_I18N[lang][1];
      document.querySelector('#period-presets .seg[data-preset="ytd"]').textContent = tt("presetYtd");
      document.querySelector('#period-presets .seg[data-preset="12m"]').textContent = tt("preset12m");
      document.querySelector('#period-presets .seg[data-preset="all"]').textContent = tt("presetAll");
      document.getElementById("country-search").placeholder = tt("countrySearchPlaceholder");
      document.getElementById("reset-filters").textContent = tt("resetFiltersBtn");
      document.getElementById("tuik-breakdown-title").textContent = tt("breakdownTitle");
      document.getElementById("unit-price-badge").title = tt("unitPriceBadgeTitle");
      document.getElementById("tonnage-badge").title = tt("tonnageBadgeTitle");
      document.getElementById("tuik-trend-title").textContent = tt("trendTitle");
      document.getElementById("trend-prev").title = tt("prevPeriodTitle");
      document.getElementById("trend-next").title = tt("nextPeriodTitle");
      document.getElementById("tuik-price-chart-title").textContent = tt("priceChartTitle");
      document.getElementById("tuik-detail-table-title").textContent = tt("detailTableTitle");
      document.getElementById("table-search").placeholder = tt("tableSearchPlaceholder");
      buildProductChips();
      buildGroupControls();
      renderAll();
    }
    window.__registerI18nPanel(applyLanguage);

    buildPeriodControls();
    buildFlowFilter();
    buildCountrySearch();
    setupTrendNav();
    setupTrendHighlight();
    applyLanguage(lang); // sabit metinleri doğru dilde yazar + çipleri/kırılımı kurar + ilk render'ı yapar
  }

  fetchAllRows()
    .then(({ rows }) => {
      window.__updateStatusFromCache("trade");
      init(rows);
    })
    .catch(err => {
      console.error(err);
      window.__setStatus(tt("dataError"), false);
    });
})();

// ---------------------------------------------------------------------------
// Sekme yöneticisi — TÜİK / WASDE / Ticaret Borsası arasında geçişi tek yerden
// yönetir. Her sekme kendi IIFE'sinde register() ile kaydolur; sekmeye ilk
// tıklandığında onActivate çağrılır (lazy-fetch için kullanılıyor).
window.__tabManager = (function () {
  const tabs = [];
  function show(activeTabId) {
    tabs.forEach(t => {
      const isActive = t.tabId === activeTabId;
      document.getElementById(t.tabId).classList.toggle("active", isActive);
      document.getElementById(t.tabId).setAttribute("aria-selected", isActive ? "true" : "false");
      document.getElementById(t.panelId).hidden = !isActive;
      if (isActive && t.onActivate) t.onActivate();
    });
  }
  function register(tabId, panelId, onActivate) {
    tabs.push({ tabId, panelId, onActivate });
    document.getElementById(tabId).addEventListener("click", () => show(tabId));
  }
  register("tab-tuik", "tuik-panel", () => window.__updateStatusFromCache("trade"));
  return { register };
})();

// ---------------------------------------------------------------------------
// WASDE (USDA) sekmesi — TÜİK'ten tamamen ayrı bir kaynak/veri modeli olduğu
// için kasıtlı olarak ayrı bir IIFE: kendi state'i, kendi fetch'i, kendi
// render'ı. Yalnızca sekmeye ilk tıklandığında veri çekilir (gereksiz istek
// yok), TÜİK panelindeki state'e hiç dokunmaz.
(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;

  const COMMODITIES = [
    { key: "corn", label: "Mısır" },
    { key: "soybeans", label: "Soya Fasulyesi" },
    { key: "soybean_meal", label: "Soya Küspesi" },
    { key: "soybean_oil", label: "Soya Yağı" },
  ];
  // Soya Yağı için WASDE'de sadece ABD tablosu var, Dünya tablosu yok.
  const WORLD_AVAILABLE = { corn: true, soybeans: true, soybean_meal: true, soybean_oil: false };
  const REGIONS = [
    { key: "world", label: "Dünya" },
    { key: "world_less_china", label: "Dünya (Çin Hariç)" },
    { key: "united_states", label: "ABD" },
    { key: "total_foreign", label: "ABD Dışı Toplam" },
    { key: "china", label: "Çin" },
  ];
  const MEASURE_ORDER = [
    "area_planted", "area_harvested", "yield_per_acre",
    "beginning_stocks", "production", "imports", "supply_total",
    "feed", "crush", "feed_and_residual", "food_seed_industrial", "ethanol_byproducts",
    "domestic_disappearance", "biofuel", "food_feed_other_industrial", "domestic_total",
    "seed", "residual", "exports", "use_total", "ending_stocks",
    "avg_price",
  ];
  const MONTH_ORDER = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const FEATURED_ORDER = ["ending_stocks", "production", "exports", "avg_price", "domestic_total"];

  function periodSortKey(label) {
    const my = label.slice(0, 7); // "2026/27"
    const m = /([A-Z][a-z]{2})\s*$/.exec(label);
    const monthIdx = m && MONTH_ORDER[m[1]] != null ? MONTH_ORDER[m[1]] : -1;
    return my + "_" + String(monthIdx + 1).padStart(2, "0");
  }

  function fmtWasdeValue(value, unitLabelTr) {
    if (value == null || isNaN(value)) return "—";
    const num = Math.abs(value) >= 100
      ? value.toLocaleString("tr-TR", { maximumFractionDigits: 0 })
      : value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
    return num + " " + unitLabelTr;
  }

  function fmtPct(value) {
    if (value == null || isNaN(value)) return null;
    return (value >= 0 ? "+" : "") + value.toFixed(1) + "%";
  }

  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 dk — WASDE ayda bir güncelleniyor

  async function fetchWasdeRows() {
    const cached = window.__supaCache.get("wasde", CACHE_TTL_MS);
    if (cached) return cached;

    const headers = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` };
    const pageSize = 1000;
    let rows = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${cfg.SUPABASE_URL}/rest/v1/wasde_stats?select=report_date,release_number,commodity,scope,region,period_label,marketing_year,measure,measure_label_tr,value,unit,unit_label_tr&order=id.asc`,
        { headers: Object.assign({}, headers, { Range: `${from}-${from + pageSize - 1}` }) }
      );
      if (!res.ok) throw new Error(`Supabase istek hatası: ${res.status}`);
      const page = await res.json();
      rows = rows.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    window.__supaCache.set("wasde", rows);
    return rows;
  }

  function init(allRows) {
    if (!allRows.length) {
      document.getElementById("wasde-release-badge").textContent = "Henüz veri yok";
      document.getElementById("wasde-table-title").textContent = "Bilanço tablosu — henüz veri yüklenmedi";
      return;
    }

    const latestReportDate = allRows.reduce((max, r) => (r.report_date > max ? r.report_date : max), allRows[0].report_date);
    const rows = allRows.filter(r => r.report_date === latestReportDate);
    const latestRelease = rows[0].release_number;

    const badge = document.getElementById("wasde-release-badge");
    const d = new Date(latestReportDate + "T00:00:00");
    badge.textContent = `WASDE-${latestRelease} · ${d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}`;

    const state = { commodity: "corn", scope: "us", region: "world" };

    function currentRows() {
      return rows.filter(r => {
        if (r.commodity !== state.commodity) return false;
        if (r.scope !== state.scope) return false;
        if (state.scope === "world" && r.region !== state.region) return false;
        return true;
      });
    }

    function periodsFor(rs) {
      const set = new Set(rs.map(r => r.period_label));
      return [...set].sort((a, b) => periodSortKey(a).localeCompare(periodSortKey(b)));
    }

    function buildCommodityControls() {
      const wrap = document.getElementById("wasde-commodity");
      wrap.textContent = "";
      COMMODITIES.forEach(c => {
        const btn = document.createElement("button");
        btn.className = "seg" + (state.commodity === c.key ? " active" : "");
        btn.type = "button";
        btn.textContent = c.label;
        btn.addEventListener("click", () => {
          state.commodity = c.key;
          if (state.scope === "world" && !WORLD_AVAILABLE[c.key]) {
            state.scope = "us";
            document.querySelectorAll("#wasde-scope .seg").forEach(b => b.classList.toggle("active", b.dataset.value === "us"));
          }
          wrap.querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
          renderAll();
        });
        wrap.appendChild(btn);
      });
    }

    function buildScopeControls() {
      const wrap = document.getElementById("wasde-scope");
      wrap.querySelectorAll(".seg").forEach(btn => {
        btn.addEventListener("click", () => {
          if (btn.dataset.value === "world" && !WORLD_AVAILABLE[state.commodity]) return;
          state.scope = btn.dataset.value;
          wrap.querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
          renderAll();
        });
      });
    }

    function buildRegionControls() {
      const wrap = document.getElementById("wasde-region");
      wrap.textContent = "";
      REGIONS.forEach(r => {
        const btn = document.createElement("button");
        btn.className = "seg" + (state.region === r.key ? " active" : "");
        btn.type = "button";
        btn.textContent = r.label;
        btn.addEventListener("click", () => {
          state.region = r.key;
          wrap.querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
          renderAll();
        });
        wrap.appendChild(btn);
      });
    }

    function renderRegionVisibility() {
      document.getElementById("wasde-region-group").style.display = state.scope === "world" ? "" : "none";
      const worldBtn = document.querySelector('#wasde-scope .seg[data-value="world"]');
      worldBtn.disabled = !WORLD_AVAILABLE[state.commodity];
      worldBtn.title = WORLD_AVAILABLE[state.commodity] ? "" : "WASDE bu ürün için Dünya tablosu yayınlamıyor (sadece ABD)";
    }

    function renderKpis() {
      const rs = currentRows();
      const periods = periodsFor(rs);
      const latestPeriod = periods[periods.length - 1];
      const byMeasure = {};
      rs.forEach(r => { (byMeasure[r.measure] = byMeasure[r.measure] || {})[r.period_label] = r; });

      const featured = FEATURED_ORDER.filter(m => byMeasure[m] && byMeasure[m][latestPeriod]).slice(0, 4);

      const container = document.getElementById("wasde-kpi-row");
      container.textContent = "";
      featured.forEach(measure => {
        const cell = byMeasure[measure][latestPeriod];
        const tile = document.createElement("div");
        tile.className = "stat-tile";
        const label = document.createElement("div");
        label.className = "label"; label.textContent = cell.measure_label_tr + " (" + latestPeriod + ")";
        const value = document.createElement("div");
        value.className = "value num"; value.textContent = fmtWasdeValue(cell.value, cell.unit_label_tr);
        tile.appendChild(label); tile.appendChild(value);

        if (measure === "ending_stocks") {
          const mom = byMeasure["ending_stocks_mom_change_pct"] && byMeasure["ending_stocks_mom_change_pct"][latestPeriod];
          const yoy = byMeasure["ending_stocks_yoy_change_pct"] && byMeasure["ending_stocks_yoy_change_pct"][latestPeriod];
          [["Önceki rapora göre", mom], ["Önceki yıla göre", yoy]].forEach(([suffix, r]) => {
            if (!r) return;
            const d2 = document.createElement("div");
            const dir = r.value > 0.05 ? "up" : r.value < -0.05 ? "down" : "flat";
            d2.className = "delta " + dir;
            d2.textContent = (r.value >= 0 ? "▲ " : "▼ ") + Math.abs(r.value).toFixed(1) + "% " + suffix;
            tile.appendChild(d2);
          });
        }
        container.appendChild(tile);
      });
    }

    function renderTable() {
      const rs = currentRows();
      const periods = periodsFor(rs);
      const byMeasure = new Map();
      rs.forEach(r => {
        if (r.measure.endsWith("_change_pct")) return;
        if (!byMeasure.has(r.measure)) byMeasure.set(r.measure, { label: r.measure_label_tr, unit: r.unit_label_tr, byPeriod: {} });
        byMeasure.get(r.measure).byPeriod[r.period_label] = r.value;
      });
      const momByPeriod = {}, yoyByPeriod = {};
      rs.forEach(r => {
        if (r.measure === "ending_stocks_mom_change_pct") momByPeriod[r.period_label] = r.value;
        if (r.measure === "ending_stocks_yoy_change_pct") yoyByPeriod[r.period_label] = r.value;
      });

      const measures = [...byMeasure.keys()].sort((a, b) => {
        const ia = MEASURE_ORDER.indexOf(a), ib = MEASURE_ORDER.indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });

      const commodityLabel = COMMODITIES.find(c => c.key === state.commodity).label;
      const scopeLabel = state.scope === "us" ? "ABD" : REGIONS.find(r => r.key === state.region).label;
      document.getElementById("wasde-table-title").textContent = `${commodityLabel} — ${scopeLabel} Arz-Talep Bilançosu`;

      const thead = document.getElementById("wasde-thead");
      thead.textContent = "";
      const headCols = ["Kalem"].concat(periods).concat(["Bir Önceki Rapora Göre", "Bir Önceki Yıla Göre"]);
      headCols.forEach(label => {
        const th = document.createElement("th");
        th.textContent = label;
        if (label !== "Kalem") th.classList.add("num-col");
        thead.appendChild(th);
      });

      const tbody = document.getElementById("wasde-tbody");
      tbody.textContent = "";
      if (!measures.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.textContent = "Bu kombinasyon için veri yok.";
        td.colSpan = headCols.length;
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }

      measures.forEach(measure => {
        const m = byMeasure.get(measure);
        const tr = document.createElement("tr");
        const labelTd = document.createElement("td");
        labelTd.textContent = m.label;
        tr.appendChild(labelTd);
        periods.forEach(p => {
          const td = document.createElement("td");
          td.className = "num-col num";
          td.textContent = m.byPeriod[p] != null ? fmtWasdeValue(m.byPeriod[p], m.unit) : "—";
          tr.appendChild(td);
        });
        [momByPeriod, yoyByPeriod].forEach(bucket => {
          const td = document.createElement("td");
          td.className = "num-col";
          if (measure === "ending_stocks" && bucket[periods[periods.length - 1]] != null) {
            const v = bucket[periods[periods.length - 1]];
            const pill = document.createElement("span");
            pill.className = "trend-pill " + (v > 0.05 ? "up" : v < -0.05 ? "down" : "flat");
            pill.textContent = fmtPct(v);
            td.appendChild(pill);
          } else {
            td.textContent = "—";
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    function renderAll() {
      renderRegionVisibility();
      renderKpis();
      renderTable();
    }

    buildCommodityControls();
    buildScopeControls();
    buildRegionControls();
    renderAll();
  }

  let loaded = false;
  window.__tabManager.register("tab-wasde", "wasde-panel", () => {
    window.__updateStatusFromCache("wasde");
    if (loaded) return;
    loaded = true;
    fetchWasdeRows()
      .then(rows => { window.__updateStatusFromCache("wasde"); init(rows); })
      .catch(err => {
        console.error(err);
        document.getElementById("wasde-release-badge").textContent = "Veri çekilemedi";
        document.getElementById("wasde-table-title").textContent = "Bilanço tablosu yüklenemedi — Supabase bağlantısını kontrol edin";
      });
  });
})();

// ---------------------------------------------------------------------------
// Ticaret Borsası "Özet" alt sekmesi — TÜRİB (Mısır 1.Sınıf) ve KTB (Mısır)
// ağırlıklı ortalama fiyatlarını TCMB günlük USD/TRY kuruyla birlikte tek
// grafik + tabloda gösterir. Sadece ağırlıklı ortalama — min/max limit yok
// (UZTB'de Mısır işlem görmüyor, sadece Ayçiçek var, bu yüzden dahil değil).
(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;
  const TURIB_COLOR = "var(--series-export)";
  const KTB_COLOR = "var(--series-import)";
  const CHART_W = 960, CHART_H = 260, PADL = 70, PADR = 20, PADT = 16, PADB = 28;

  function fmtPriceTon(v) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " TL/ton";
  }
  function fmtUsdTon(v) {
    if (v == null || isNaN(v)) return "—";
    return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + "/ton";
  }
  function fmtUsdTry(v) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("tr-TR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  }
  function fmtDateShort(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  }
  function fmtDateFull(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  }

  const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 saat — kaynaklar günde bir güncelleniyor

  async function fetchPaginated(cacheKey, table, query) {
    const cached = window.__supaCache.get(cacheKey, CACHE_TTL_MS);
    if (cached) return cached;
    const headers = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` };
    const pageSize = 1000;
    let rows = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${cfg.SUPABASE_URL}/rest/v1/${table}?${query}`,
        { headers: Object.assign({}, headers, { Range: `${from}-${from + pageSize - 1}` }) }
      );
      if (!res.ok) throw new Error(`Supabase istek hatası: ${res.status}`);
      const page = await res.json();
      rows = rows.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    window.__supaCache.set(cacheKey, rows);
    return rows;
  }

  function fetchTuribMisir() {
    return fetchPaginated(
      "summary-turib", "turib_bulletin",
      "select=trade_date,agirlikli_ortalama_fiyat,islem_miktari_kg&enstruman_sinifi=eq.MISIR%201.SINIF&order=trade_date.asc"
    );
  }
  function fetchKtbMisir() {
    return fetchPaginated(
      "summary-ktb", "ktb_bulletin",
      "select=trade_date,grup_ort_fiyat,miktar&grup_adi=eq.M%C4%B1s%C4%B1r&order=trade_date.asc"
    );
  }
  function fetchTcmbRates() {
    return fetchPaginated("summary-tcmb", "tcmb_usd_try", "select=trade_date,forex_buying&order=trade_date.asc");
  }

  // TÜRİB günlük ağırlıklı ortalama — aynı gün birden çok LİDAŞ satırını
  // miktar-ağırlıklı birleştiriyor (TÜRİB sekmesindeki dailyWeightedSeries
  // ile aynı mantık). Kaynak TL/kg tutuyor, TL/ton'a çeviriyoruz (×1000).
  function turibDailyMap(rows) {
    const byDate = new Map();
    rows.forEach(r => {
      if (r.agirlikli_ortalama_fiyat == null || r.islem_miktari_kg == null) return;
      const e = byDate.get(r.trade_date) || { sumPriceKg: 0, sumKg: 0 };
      e.sumPriceKg += r.agirlikli_ortalama_fiyat * r.islem_miktari_kg;
      e.sumKg += r.islem_miktari_kg;
      byDate.set(r.trade_date, e);
    });
    const out = new Map();
    byDate.forEach((e, date) => { if (e.sumKg > 0) out.set(date, (e.sumPriceKg / e.sumKg) * 1000); });
    return out;
  }

  // KTB grup_ort_fiyat zaten kaynağın kendi hesapladığı günlük grup (Mısır
  // geneli, tüm sınıflar) ağırlıklı ortalaması — her sınıf satırında aynı
  // değer tekrarlanıyor, bu yüzden doğrudan kullanılabilir. TL/kg -> TL/ton.
  function ktbDailyMap(rows) {
    const out = new Map();
    rows.forEach(r => { if (r.grup_ort_fiyat != null) out.set(r.trade_date, r.grup_ort_fiyat * 1000); });
    return out;
  }

  function tcmbDailyMap(rows) {
    const out = new Map();
    rows.forEach(r => { if (r.forex_buying != null) out.set(r.trade_date, r.forex_buying); });
    return out;
  }

  // Tüm tarihlerin birleşimi (TÜRİB ∪ KTB) üzerinde, her satıra o günün (ya
  // da TCMB tatildeyse bir önceki iş gününden taşınan) dolar kurunu eşliyor.
  function buildMerged(turibMap, ktbMap, usdMap) {
    const dates = [...new Set([...turibMap.keys(), ...ktbMap.keys()])].sort();
    let lastUsd = null;
    return dates.map(date => {
      if (usdMap.has(date)) lastUsd = usdMap.get(date);
      const usd = lastUsd;
      const turibTl = turibMap.get(date) ?? null;
      const ktbTl = ktbMap.get(date) ?? null;
      return {
        date, usd, turibTl, ktbTl,
        turibUsd: (turibTl != null && usd) ? turibTl / usd : null,
        ktbUsd: (ktbTl != null && usd) ? ktbTl / usd : null,
      };
    });
  }

  // ---------- küçük tooltip (diğer panellerle aynı görünüm) ----------
  function makeTooltip() {
    let el = document.querySelector(".tooltip");
    if (!el) { el = document.createElement("div"); el.className = "tooltip"; document.body.appendChild(el); }
    return el;
  }
  function showTooltip(evt, node) {
    const tip = makeTooltip();
    tip.textContent = ""; tip.appendChild(node);
    tip.style.opacity = "1";
    let x = evt.clientX + 14, y = evt.clientY + 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
    const rect = tip.getBoundingClientRect();
    if (rect.right > window.innerWidth) tip.style.left = (evt.clientX - rect.width - 14) + "px";
    if (rect.bottom > window.innerHeight) tip.style.top = (evt.clientY - rect.height - 14) + "px";
  }
  function hideTooltip() { const t = document.querySelector(".tooltip"); if (t) t.style.opacity = "0"; }

  function buildGappedPath(points, field, xScale, yScale) {
    let d = "";
    let drawing = false;
    points.forEach((p, i) => {
      const v = p[field];
      if (v == null) { drawing = false; return; }
      d += (drawing ? "L" : "M") + xScale(i) + "," + yScale(v) + " ";
      drawing = true;
    });
    return d.trim();
  }

  function renderLegend() {
    const el = document.getElementById("exchange-summary-legend");
    el.textContent = "";
    [["TÜRİB Mısır (1.Sınıf)", TURIB_COLOR], ["KTB Mısır", KTB_COLOR]].forEach(([label, color]) => {
      const key = document.createElement("span");
      key.className = "key";
      const sw = document.createElement("span");
      sw.className = "swatch-line";
      sw.style.background = color; sw.style.borderColor = color;
      key.appendChild(sw);
      key.appendChild(document.createTextNode(label));
      el.appendChild(key);
    });
  }

  // tek grafikte iki seri (TÜRİB/KTB), para birimi state'ine göre TL veya
  // USD alanı çizilir — hover her zaman HER İKİ para birimini de gösterir.
  function drawChart(points, currency) {
    const svg = document.getElementById("exchange-summary-chart");
    svg.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + CHART_H);
    if (!points.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = "Henüz veri yok.";
      svg.appendChild(t);
      return;
    }
    const turibField = currency === "usd" ? "turibUsd" : "turibTl";
    const ktbField = currency === "usd" ? "ktbUsd" : "ktbTl";
    const xStep = points.length > 1 ? (CHART_W - PADL - PADR) / (points.length - 1) : 0;
    const xScale = i => points.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const allVals = points.flatMap(p => [p[turibField], p[ktbField]]).filter(v => v != null);
    if (!allVals.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = currency === "usd" ? "Bu aralıkta USD kuru eşleşen veri yok." : "Bu aralıkta veri yok.";
      svg.appendChild(t);
      return;
    }
    const minVal = Math.min(...allVals), maxVal = Math.max(...allVals);
    const span = maxVal - minVal || Math.abs(maxVal) || 1;
    const yPad = span * 0.1;
    const yScale = v => CHART_H - PADB - ((v - minVal + yPad) / (span + 2 * yPad)) * (CHART_H - PADB - PADT);

    for (let g = 0; g <= 3; g++) {
      const y = PADT + (g * (CHART_H - PADB - PADT)) / 3;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      const val = maxVal + yPad - (g * (span + 2 * yPad)) / 3;
      t.textContent = currency === "usd"
        ? "$" + Math.round(val).toLocaleString("en-US")
        : Math.round(val).toLocaleString("tr-TR");
      svg.appendChild(t);
    }

    const minLabelGap = 56;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && points.length > 1 && (points.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((points.length - 1) / tickEvery) * tickEvery;
        if ((points.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", CHART_H - 5);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateShort(p.date);
      svg.appendChild(t);
    });

    const hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hoverLine.setAttribute("class", "baseline");
    hoverLine.setAttribute("y1", PADT); hoverLine.setAttribute("y2", CHART_H - PADB);
    hoverLine.style.opacity = "0";
    svg.appendChild(hoverLine);

    [[turibField, TURIB_COLOR], [ktbField, KTB_COLOR]].forEach(([field, color]) => {
      const d = buildGappedPath(points, field, xScale, yScale);
      if (!d) return;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("stroke", color); path.setAttribute("stroke-width", "2.5");
      path.setAttribute("fill", "none"); path.setAttribute("stroke-linejoin", "round"); path.setAttribute("stroke-linecap", "round");
      svg.appendChild(path);
    });

    const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    points.forEach((p, i) => {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      rect.setAttribute("x", xScale(i) - hitW / 2); rect.setAttribute("y", PADT);
      rect.setAttribute("width", hitW); rect.setAttribute("height", CHART_H - PADB - PADT);
      rect.setAttribute("fill", "transparent"); rect.style.cursor = "pointer";
      rect.tabIndex = 0;
      const showFn = evt => {
        hoverLine.setAttribute("x1", xScale(i)); hoverLine.setAttribute("x2", xScale(i));
        hoverLine.style.opacity = "1";
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateFull(p.date);
        wrap.appendChild(ttl);
        const addRow = (label, tl, usd) => {
          if (tl == null) return;
          const row = document.createElement("div"); row.className = "row";
          const l = document.createElement("span"); l.textContent = label + ": ";
          const v = document.createElement("span"); v.className = "val";
          v.textContent = fmtPriceTon(tl) + (usd != null ? " (" + fmtUsdTon(usd) + ")" : "");
          row.appendChild(l); row.appendChild(v);
          wrap.appendChild(row);
        };
        addRow("TÜRİB Mısır", p.turibTl, p.turibUsd);
        addRow("KTB Mısır", p.ktbTl, p.ktbUsd);
        if (p.usd != null) {
          const row = document.createElement("div"); row.className = "row";
          const l = document.createElement("span"); l.textContent = "USD/TRY: ";
          const v = document.createElement("span"); v.className = "val"; v.textContent = fmtUsdTry(p.usd);
          row.appendChild(l); row.appendChild(v);
          wrap.appendChild(row);
        }
        showTooltip(evt, wrap);
      };
      rect.addEventListener("pointermove", showFn);
      rect.addEventListener("focus", showFn);
      rect.addEventListener("pointerleave", () => { hoverLine.style.opacity = "0"; hideTooltip(); });
      rect.addEventListener("blur", () => { hoverLine.style.opacity = "0"; hideTooltip(); });
      hitLayer.appendChild(rect);
    });
    svg.appendChild(hitLayer);
  }

  function renderKpis(points) {
    const el = document.getElementById("exchange-summary-kpi-row");
    el.textContent = "";
    const last = points[points.length - 1];
    const tiles = [
      ["TÜRİB Mısır (son)", last ? fmtPriceTon(last.turibTl) : "—"],
      ["KTB Mısır (son)", last ? fmtPriceTon(last.ktbTl) : "—"],
      ["USD/TRY (TCMB, son)", last ? fmtUsdTry(last.usd) : "—"],
    ];
    tiles.forEach(([label, value]) => {
      const tile = document.createElement("div");
      tile.className = "stat-tile";
      const l = document.createElement("div"); l.className = "label"; l.textContent = label;
      const v = document.createElement("div"); v.className = "value num"; v.textContent = value;
      tile.appendChild(l); tile.appendChild(v);
      el.appendChild(tile);
    });
  }

  function exportCsv(points) {
    const cols = ["date", "usd", "turibTl", "turibUsd", "ktbTl", "ktbUsd"];
    const header = ["tarih", "usd_try", "turib_misir_tl_ton", "turib_misir_usd_ton", "ktb_misir_tl_ton", "ktb_misir_usd_ton"];
    const esc = v => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [header.join(";")].concat(points.map(p => cols.map(c => esc(p[c])).join(";")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ticaret-borsasi-ozet-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderTable(points, rowLimit, page) {
    const tbody = document.getElementById("exchange-summary-tbody");
    tbody.textContent = "";
    const sorted = [...points].sort((a, b) => b.date.localeCompare(a.date));
    const info = paginateRows(sorted, page, rowLimit);
    exchangePage = info.page;
    info.slice.forEach(p => {
      const tr = document.createElement("tr");
      const cells = [
        fmtDateFull(p.date),
        fmtUsdTry(p.usd),
        fmtPriceTon(p.turibTl), fmtUsdTon(p.turibUsd),
        fmtPriceTon(p.ktbTl), fmtUsdTon(p.ktbUsd),
      ];
      cells.forEach((text, i) => {
        const td = document.createElement("td");
        if (i > 0) td.className = "num-col";
        td.textContent = text;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    updatePagerUI("exchange-summary", info);
  }

  let merged = [];
  let currency = "try";
  let rowLimit = 10;
  let exchangePage = 0;

  function renderAll() {
    renderKpis(merged);
    renderLegend();
    drawChart(merged, currency);
    renderTable(merged, rowLimit, exchangePage);
  }

  document.getElementById("exchange-currency-toggle").querySelectorAll(".seg").forEach(btn => {
    btn.addEventListener("click", () => {
      currency = btn.dataset.currency;
      document.getElementById("exchange-currency-toggle").querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
      drawChart(merged, currency);
    });
  });
  document.getElementById("exchange-summary-row-limit").querySelectorAll(".seg").forEach(btn => {
    btn.addEventListener("click", () => {
      rowLimit = Number(btn.dataset.limit);
      exchangePage = 0;
      document.getElementById("exchange-summary-row-limit").querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
      renderTable(merged, rowLimit, exchangePage);
    });
  });
  document.getElementById("exchange-summary-page-prev").addEventListener("click", () => {
    exchangePage -= 1;
    renderTable(merged, rowLimit, exchangePage);
  });
  document.getElementById("exchange-summary-page-next").addEventListener("click", () => {
    exchangePage += 1;
    renderTable(merged, rowLimit, exchangePage);
  });
  document.getElementById("exchange-summary-export-btn").addEventListener("click", () => {
    if (!merged.length) return;
    exportCsv(merged);
  });

  const SUMMARY_CACHE_KEYS = ["summary-turib", "summary-ktb", "summary-tcmb"];

  let loaded = false;
  window.__tabManager.register("tab-exchange", "exchange-panel", () => {
    window.__updateStatusFromCache(SUMMARY_CACHE_KEYS);
    if (loaded) return;
    loaded = true;
    Promise.all([fetchTuribMisir(), fetchKtbMisir(), fetchTcmbRates()])
      .then(([turibRows, ktbRows, tcmbRows]) => {
        window.__updateStatusFromCache(SUMMARY_CACHE_KEYS);
        merged = buildMerged(turibDailyMap(turibRows), ktbDailyMap(ktbRows), tcmbDailyMap(tcmbRows));
        const badge = document.getElementById("exchange-summary-asof-badge");
        badge.textContent = merged.length ? "Son veri: " + fmtDateFull(merged[merged.length - 1].date) : "Veri yok";
        renderAll();
      })
      .catch(err => {
        console.error(err);
        document.getElementById("exchange-summary-asof-badge").textContent = "Veri çekilemedi";
      });
  });

  // ---------- Ticaret Borsası alt sekmesi: Özet / TÜRİB / UZTB / KTB ----------
  const EXCHANGE_SUBTABS = {
    summary: { tabId: "subtab-summary", sectionId: "exchange-summary-section", onActivate: () => window.__updateStatusFromCache(SUMMARY_CACHE_KEYS) },
    turib: { tabId: "subtab-turib", sectionId: "turib-section", onActivate: () => { window.__turibTab && window.__turibTab.onActivate(); window.__updateStatusFromCache("turib"); } },
    uztb: { tabId: "subtab-uztb", sectionId: "uztb-section", onActivate: () => { window.__uztbTab && window.__uztbTab.onActivate(); window.__updateStatusFromCache("uztb"); } },
    ktb: { tabId: "subtab-ktb", sectionId: "ktb-section", onActivate: () => { window.__ktbTab && window.__ktbTab.onActivate(); window.__updateStatusFromCache("ktb"); } },
  };
  Object.entries(EXCHANGE_SUBTABS).forEach(([key, cfgSub]) => {
    document.getElementById(cfgSub.tabId).addEventListener("click", () => showExchangeSubtab(key));
  });
  function showExchangeSubtab(which) {
    Object.entries(EXCHANGE_SUBTABS).forEach(([key, cfgSub]) => {
      const isActive = key === which;
      document.getElementById(cfgSub.tabId).classList.toggle("active", isActive);
      document.getElementById(cfgSub.tabId).setAttribute("aria-selected", String(isActive));
      document.getElementById(cfgSub.sectionId).hidden = !isActive;
      if (isActive && cfgSub.onActivate) cfgSub.onActivate();
    });
  }
})();

// ---------------------------------------------------------------------------
// TÜRİB (Türkiye Ürün İhtisas Borsası) alt sekmesi — Ticaret Borsası
// sekmesinin içinde ikinci bir kaynak: TÜİK/WASDE/ESR'den tamamen ayrı,
// günlük bülten kazınarak elde edilen GERÇEK elektronik ürün senedi (ELÜS)
// işlemleri (sadece Normal Seans). Varsayılan ürün filtresi "MISIR 1.SINIF".
(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;
  const LINE_COLOR = "var(--series-export)";
  const CHART_W = 960, CHART_H = 240, PADL = 70, PADR = 20, PADT = 16, PADB = 28;
  const DEFAULT_PRODUCT = "MISIR 1.SINIF";

  function fmtKg(v) {
    if (v == null || isNaN(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2) + "M kg";
    if (a >= 1e3) return (v / 1e3).toFixed(1) + "K kg";
    return (Math.round(v) || 0) + " kg";
  }
  function fmtTon(v) {
    if (v == null || isNaN(v)) return "—";
    return (v / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " ton";
  }
  function fmtTl(v) {
    if (v == null || isNaN(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2) + "M TL";
    if (a >= 1e3) return (v / 1e3).toFixed(1) + "K TL";
    return (Math.round(v) || 0) + " TL";
  }
  // v: TL/ton olarak ZATEN ölçeklenmiş değer bekler (dailyWeightedSeries/
  // overallWeightedAvg dönüşü) — ham DB değeri (TL/kg) veriliyorsa çağıran
  // taraf ×1000 yapmalı (bkz. tablo satırları).
  function fmtPriceTon(v) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " TL/ton";
  }
  function fmtDateShort(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  }
  function fmtDateFull(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  }

  const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 saat — veri günde bir (18:00) güncelleniyor

  async function fetchTuribRows() {
    const cached = window.__supaCache.get("turib", CACHE_TTL_MS);
    if (cached) return cached;

    const headers = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` };
    const pageSize = 1000;
    let rows = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${cfg.SUPABASE_URL}/rest/v1/turib_bulletin?select=trade_date,isin_kodu,enstruman_sinifi,agirlikli_ortalama_fiyat,en_dusuk,en_yuksek,islem_adedi,islem_miktari_kg,islem_hacmi_tl,lidas_adi,il,ilce&order=trade_date.asc`,
        { headers: Object.assign({}, headers, { Range: `${from}-${from + pageSize - 1}` }) }
      );
      if (!res.ok) throw new Error(`Supabase istek hatası: ${res.status}`);
      const page = await res.json();
      rows = rows.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    window.__supaCache.set("turib", rows);
    return rows;
  }

  // ---------- tooltip (diğer panellerle aynı görünüm) ----------
  function makeTooltip() {
    let el = document.querySelector(".tooltip");
    if (!el) { el = document.createElement("div"); el.className = "tooltip"; document.body.appendChild(el); }
    return el;
  }
  function showTooltip(evt, node) {
    const tip = makeTooltip();
    tip.textContent = ""; tip.appendChild(node);
    tip.style.opacity = "1";
    let x = evt.clientX + 14, y = evt.clientY + 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
    const rect = tip.getBoundingClientRect();
    if (rect.right > window.innerWidth) tip.style.left = (evt.clientX - rect.width - 14) + "px";
    if (rect.bottom > window.innerHeight) tip.style.top = (evt.clientY - rect.height - 14) + "px";
  }
  function hideTooltip() { const t = document.querySelector(".tooltip"); if (t) t.style.opacity = "0"; }

  let allRows = [];
  const state = { product: null, grup: null, altTip: null, sinif: null, lidas: null, dateStart: null, dateEnd: null, tableSearch: "" };

  function productRows() {
    return allRows.filter(r => r.enstruman_sinifi === state.product);
  }
  function currentRows() {
    return productRows().filter(r => {
      if (state.lidas && r.lidas_adi !== state.lidas) return false;
      if (state.dateStart && r.trade_date < state.dateStart) return false;
      if (state.dateEnd && r.trade_date > state.dateEnd) return false;
      return true;
    });
  }

  // tarihe göre hacim-ağırlıklı ortalama fiyat: her satırın kendi
  // ağırlıklı ortalama fiyatını, o satırın işlem miktarıyla tartarak
  // birleştiriyoruz (tek bir ISIN'in günlük fiyatı zaten kendi içinde
  // ağırlıklı — burada sadece aynı güne ait birden çok ISIN/LİDAŞ'ı
  // doğru şekilde tek bir günlük fiyata indiriyoruz). En düşük/en yüksek
  // o günün tüm satırlarındaki en_dusuk/en_yuksek'in min/max'ı. Fiyatlar
  // TL/ton'a çevrilerek (×1000) döndürülüyor — DB TL/kg tutuyor.
  function dailyWeightedSeries(rows) {
    const byDate = new Map();
    rows.forEach(r => {
      if (r.agirlikli_ortalama_fiyat == null || r.islem_miktari_kg == null) return;
      const e = byDate.get(r.trade_date) || { sumPriceKg: 0, sumKg: 0, minPrice: null, maxPrice: null };
      e.sumPriceKg += r.agirlikli_ortalama_fiyat * r.islem_miktari_kg;
      e.sumKg += r.islem_miktari_kg;
      if (r.en_dusuk != null && r.en_dusuk > 0) e.minPrice = e.minPrice == null ? r.en_dusuk : Math.min(e.minPrice, r.en_dusuk);
      if (r.en_yuksek != null && r.en_yuksek > 0) e.maxPrice = e.maxPrice == null ? r.en_yuksek : Math.max(e.maxPrice, r.en_yuksek);
      byDate.set(r.trade_date, e);
    });
    return [...byDate.entries()]
      .map(([date, e]) => ({
        date,
        price: e.sumKg > 0 ? (e.sumPriceKg / e.sumKg) * 1000 : null,
        minPrice: e.minPrice != null ? e.minPrice * 1000 : null,
        maxPrice: e.maxPrice != null ? e.maxPrice * 1000 : null,
        kg: e.sumKg,
        ton: e.sumKg / 1000,
      }))
      .filter(p => p.price != null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function overallWeightedAvg(rows) {
    let sumPriceKg = 0, sumKg = 0;
    rows.forEach(r => {
      if (r.agirlikli_ortalama_fiyat == null || r.islem_miktari_kg == null) return;
      sumPriceKg += r.agirlikli_ortalama_fiyat * r.islem_miktari_kg;
      sumKg += r.islem_miktari_kg;
    });
    return sumKg > 0 ? (sumPriceKg / sumKg) * 1000 : null;
  }

  function renderPriceLegend() {
    const el = document.getElementById("turib-price-legend");
    el.textContent = "";
    [
      ["Ağırlıklı Ortalama", false],
      ["En Yüksek", true],
      ["En Düşük", true],
    ].forEach(([label, dashed]) => {
      const key = document.createElement("span");
      key.className = "key";
      const sw = document.createElement("span");
      sw.className = "swatch-line" + (dashed ? " dashed" : "");
      sw.style.background = dashed ? "none" : LINE_COLOR;
      sw.style.borderColor = LINE_COLOR;
      key.appendChild(sw);
      key.appendChild(document.createTextNode(label));
      el.appendChild(key);
    });
  }

  // sıçramalı (null) günlerde çizgiyi koparan, birden çok alt-yol içerebilen
  // path verisi üretir — min/max her gün dolu olmayabilir.
  function buildGappedPath(points, field, xScale, yScale) {
    let d = "";
    let drawing = false;
    points.forEach((p, i) => {
      const v = p[field];
      if (v == null) { drawing = false; return; }
      d += (drawing ? "L" : "M") + xScale(i) + "," + yScale(v) + " ";
      drawing = true;
    });
    return d.trim();
  }

  function drawPriceChart(points) {
    const svg = document.getElementById("turib-chart");
    svg.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + CHART_H);
    if (!points.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = "Bu filtrede veri yok.";
      svg.appendChild(t);
      return;
    }
    const xStep = points.length > 1 ? (CHART_W - PADL - PADR) / (points.length - 1) : 0;
    const xScale = i => points.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const allVals = points.flatMap(p => [p.price, p.minPrice, p.maxPrice]).filter(v => v != null);
    const minVal = Math.min(...allVals), maxVal = Math.max(...allVals);
    const span = maxVal - minVal || Math.abs(maxVal) || 1;
    const yPad = span * 0.1;
    const yScale = v => CHART_H - PADB - ((v - minVal + yPad) / (span + 2 * yPad)) * (CHART_H - PADB - PADT);

    for (let g = 0; g <= 3; g++) {
      const y = PADT + (g * (CHART_H - PADB - PADT)) / 3;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      t.textContent = Math.round(maxVal + yPad - (g * (span + 2 * yPad)) / 3).toLocaleString("tr-TR");
      svg.appendChild(t);
    }

    const minLabelGap = 56;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && points.length > 1 && (points.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((points.length - 1) / tickEvery) * tickEvery;
        if ((points.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", CHART_H - 5);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateShort(p.date);
      svg.appendChild(t);
    });

    const hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hoverLine.setAttribute("class", "baseline");
    hoverLine.setAttribute("y1", PADT); hoverLine.setAttribute("y2", CHART_H - PADB);
    hoverLine.style.opacity = "0";
    svg.appendChild(hoverLine);

    const avgPts = points.map((p, i) => [xScale(i), yScale(p.price)]);
    if (avgPts.length === 1) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", avgPts[0][0]); dot.setAttribute("cy", avgPts[0][1]); dot.setAttribute("r", "4");
      dot.setAttribute("fill", LINE_COLOR);
      svg.appendChild(dot);
    } else {
      const gradId = "turibAreaGradient";
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
      grad.setAttribute("id", gradId);
      grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0"); grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
      const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop1.setAttribute("offset", "0%"); stop1.setAttribute("stop-color", LINE_COLOR); stop1.setAttribute("stop-opacity", "0.18");
      const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop2.setAttribute("offset", "100%"); stop2.setAttribute("stop-color", LINE_COLOR); stop2.setAttribute("stop-opacity", "0");
      grad.appendChild(stop1); grad.appendChild(stop2);
      defs.appendChild(grad);
      svg.appendChild(defs);

      const baseline = CHART_H - PADB;
      const areaD = "M" + avgPts[0][0] + "," + baseline + " " + avgPts.map(p => "L" + p[0] + "," + p[1]).join(" ") + " L" + avgPts[avgPts.length - 1][0] + "," + baseline + " Z";
      const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
      area.setAttribute("d", areaD);
      area.setAttribute("fill", "url(#" + gradId + ")");
      area.setAttribute("stroke", "none");
      svg.appendChild(area);

      // kesikli en yüksek / en düşük çizgileri — ortalamanın altında kalsın
      ["maxPrice", "minPrice"].forEach(field => {
        const d = buildGappedPath(points, field, xScale, yScale);
        if (!d) return;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("stroke", LINE_COLOR); path.setAttribute("stroke-width", "1.5");
        path.setAttribute("stroke-dasharray", "5 4"); path.setAttribute("opacity", "0.6");
        path.setAttribute("fill", "none"); path.setAttribute("stroke-linecap", "round");
        svg.appendChild(path);
      });

      // kalın ağırlıklı ortalama çizgisi — en üstte, en belirgin
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", avgPts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" "));
      path.setAttribute("stroke", LINE_COLOR); path.setAttribute("stroke-width", "3");
      path.setAttribute("fill", "none"); path.setAttribute("stroke-linejoin", "round"); path.setAttribute("stroke-linecap", "round");
      svg.appendChild(path);

      const lastPt = avgPts[avgPts.length - 1];
      const endDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      endDot.setAttribute("cx", lastPt[0]); endDot.setAttribute("cy", lastPt[1]); endDot.setAttribute("r", "4.5");
      endDot.setAttribute("fill", "var(--surface-1)"); endDot.setAttribute("stroke", LINE_COLOR); endDot.setAttribute("stroke-width", "2.5");
      svg.appendChild(endDot);
    }

    const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    points.forEach((p, i) => {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      rect.setAttribute("x", xScale(i) - hitW / 2); rect.setAttribute("y", PADT);
      rect.setAttribute("width", hitW); rect.setAttribute("height", CHART_H - PADB - PADT);
      rect.setAttribute("fill", "transparent"); rect.style.cursor = "pointer";
      rect.tabIndex = 0;
      const showFn = evt => {
        hoverLine.setAttribute("x1", xScale(i)); hoverLine.setAttribute("x2", xScale(i));
        hoverLine.style.opacity = "1";
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateFull(p.date);
        wrap.appendChild(ttl);
        [["Ağırlıklı Ort.", p.price], ["En Yüksek", p.maxPrice], ["En Düşük", p.minPrice]].forEach(([label, val]) => {
          const row = document.createElement("div"); row.className = "row";
          const l = document.createElement("span"); l.textContent = label + ": ";
          const v = document.createElement("span"); v.className = "val"; v.textContent = fmtPriceTon(val);
          row.appendChild(l); row.appendChild(v);
          wrap.appendChild(row);
        });
        showTooltip(evt, wrap);
      };
      rect.addEventListener("pointermove", showFn);
      rect.addEventListener("focus", showFn);
      rect.addEventListener("pointerleave", () => { hoverLine.style.opacity = "0"; hideTooltip(); });
      rect.addEventListener("blur", () => { hoverLine.style.opacity = "0"; hideTooltip(); });
      hitLayer.appendChild(rect);
    });
    svg.appendChild(hitLayer);
  }

  const TON_CHART_H = 110, TON_PADT = 10, TON_PADB = 24;

  function drawTonnageChart(points) {
    const svg = document.getElementById("turib-tonnage-chart");
    svg.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + TON_CHART_H);
    if (!points.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", TON_CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = "Bu filtrede veri yok.";
      svg.appendChild(t);
      return;
    }
    const xStep = points.length > 1 ? (CHART_W - PADL - PADR) / (points.length - 1) : 0;
    const xScale = i => points.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const maxTon = Math.max(...points.map(p => p.ton), 1);
    const yScale = v => TON_CHART_H - TON_PADB - (v / maxTon) * (TON_CHART_H - TON_PADB - TON_PADT);

    [0, maxTon].forEach(val => {
      const y = yScale(val);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      t.textContent = val.toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " ton";
      svg.appendChild(t);
    });

    const minLabelGap = 56;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && points.length > 1 && (points.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((points.length - 1) / tickEvery) * tickEvery;
        if ((points.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", TON_CHART_H - 5);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateShort(p.date);
      svg.appendChild(t);
    });

    const barW = Math.max(2, Math.min(xStep * 0.6, 14));
    const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    points.forEach((p, i) => {
      const x = xScale(i);
      const y = yScale(p.ton);
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x - barW / 2); rect.setAttribute("y", y);
      rect.setAttribute("width", barW); rect.setAttribute("height", Math.max(0, (TON_CHART_H - TON_PADB) - y));
      rect.setAttribute("fill", LINE_COLOR); rect.setAttribute("opacity", "0.55"); rect.setAttribute("rx", "1.5");
      svg.appendChild(rect);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      hit.setAttribute("x", x - hitW / 2); hit.setAttribute("y", TON_PADT);
      hit.setAttribute("width", hitW); hit.setAttribute("height", TON_CHART_H - TON_PADB - TON_PADT);
      hit.setAttribute("fill", "transparent"); hit.style.cursor = "pointer";
      hit.tabIndex = 0;
      const showFn = evt => {
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateFull(p.date);
        wrap.appendChild(ttl);
        const row = document.createElement("div"); row.className = "row";
        const v = document.createElement("span"); v.className = "val";
        v.textContent = p.ton.toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " ton";
        row.appendChild(v);
        wrap.appendChild(row);
        showTooltip(evt, wrap);
      };
      hit.addEventListener("pointermove", showFn);
      hit.addEventListener("focus", showFn);
      hit.addEventListener("pointerleave", hideTooltip);
      hit.addEventListener("blur", hideTooltip);
      hitLayer.appendChild(hit);
    });
    svg.appendChild(hitLayer);
  }

  function renderKpis(rows, series) {
    const el = document.getElementById("turib-kpi-row");
    el.textContent = "";
    const tiles = [
      ["Ağırlıklı ortalama fiyat (seçili dönem)", fmtPriceTon(overallWeightedAvg(rows))],
      ["Son fiyat", series.length ? fmtPriceTon(series[series.length - 1].price) : "—"],
      ["Toplam işlem hacmi", fmtTon(rows.reduce((s, r) => s + (r.islem_miktari_kg || 0), 0))],
      ["Toplam işlem değeri", fmtTl(rows.reduce((s, r) => s + (r.islem_hacmi_tl || 0), 0))],
    ];
    tiles.forEach(([label, value]) => {
      const tile = document.createElement("div");
      tile.className = "stat-tile";
      const l = document.createElement("div"); l.className = "label"; l.textContent = label;
      const v = document.createElement("div"); v.className = "value num"; v.textContent = value;
      tile.appendChild(l); tile.appendChild(v);
      el.appendChild(tile);
    });
  }

  let rowLimit = 10;
  let tablePage = 0;

  function renderTable(rows) {
    const thead = document.getElementById("turib-thead");
    const tbody = document.getElementById("turib-tbody");
    const foot = document.getElementById("turib-table-foot");
    thead.textContent = ""; tbody.textContent = ""; foot.textContent = "";
    const cols = ["Tarih", "LİDAŞ Adı", "İl", "İlçe", "Ağ. Ort. Fiyat", "İşlem Miktarı", "İşlem Hacmi", "İşlem Adedi"];
    cols.forEach(c => { const th = document.createElement("th"); th.textContent = c; thead.appendChild(th); });

    const q = state.tableSearch.toLocaleLowerCase("tr");
    const filtered = q
      ? rows.filter(r => [r.lidas_adi, r.il, r.ilce].some(v => v && v.toLocaleLowerCase("tr").includes(q)))
      : rows;
    const sorted = [...filtered].sort((a, b) => b.trade_date.localeCompare(a.trade_date) || (a.lidas_adi || "").localeCompare(b.lidas_adi || "", "tr"));
    document.getElementById("turib-table-title").textContent = "Günlük işlemler";
    const info = paginateRows(sorted, tablePage, rowLimit);
    tablePage = info.page;
    info.slice.forEach(r => {
      const tr = document.createElement("tr");
      const cells = [
        fmtDateFull(r.trade_date), r.lidas_adi || "—", r.il || "—", r.ilce || "—",
        fmtPriceTon(r.agirlikli_ortalama_fiyat != null ? r.agirlikli_ortalama_fiyat * 1000 : null), fmtKg(r.islem_miktari_kg), fmtTl(r.islem_hacmi_tl), String(r.islem_adedi ?? "—"),
      ];
      cells.forEach(c => { const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    updatePagerUI("turib", info);
  }

  function exportTuribCsv(rows) {
    const cols = ["trade_date", "isin_kodu", "enstruman_sinifi", "agirlikli_ortalama_fiyat", "islem_adedi", "islem_miktari_kg", "islem_hacmi_tl", "lidas_adi", "il", "ilce"];
    const esc = v => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.join(";")].concat(rows.map(r => cols.map(c => esc(r[c])).join(";")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "turib-bulten-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderAll() {
    tablePage = 0; // filtre değişince sayfa 1'e dönülür — eski sayfa artık anlamsız
    const rows = currentRows();
    const series = dailyWeightedSeries(rows);
    document.getElementById("turib-chart-title").textContent = "Fiyat eğilimi (TL/ton) — " + state.product + (state.lidas ? " · " + state.lidas : "");
    renderPriceLegend();
    drawPriceChart(series);
    drawTonnageChart(series);
    renderKpis(rows, series);
    renderTable(rows);
  }

  function buildDateControls() {
    const startInput = document.getElementById("turib-date-start");
    const endInput = document.getElementById("turib-date-end");
    if (!allRows.length) return;
    const allDates = allRows.map(r => r.trade_date).sort();
    const minDate = allDates[0], maxDate = allDates[allDates.length - 1];
    startInput.min = minDate; startInput.max = maxDate;
    endInput.min = minDate; endInput.max = maxDate;
    startInput.value = minDate; endInput.value = maxDate;

    function setActivePreset(btn) {
      document.querySelectorAll("#turib-period-presets .seg").forEach(b => b.classList.toggle("active", b === btn));
    }

    function applyPreset(preset) {
      if (preset === "all") {
        state.dateStart = null; state.dateEnd = null;
        startInput.value = minDate; endInput.value = maxDate;
      } else {
        const end = new Date(maxDate + "T00:00:00");
        const start = new Date(end);
        start.setDate(start.getDate() - Number(preset) + 1);
        const startIso = start.toISOString().slice(0, 10);
        state.dateStart = startIso < minDate ? minDate : startIso;
        state.dateEnd = maxDate;
        startInput.value = state.dateStart; endInput.value = state.dateEnd;
      }
      renderAll();
    }

    document.querySelectorAll("#turib-period-presets .seg").forEach(btn => {
      btn.addEventListener("click", () => { setActivePreset(btn); applyPreset(btn.dataset.preset); });
    });
    startInput.addEventListener("change", () => {
      state.dateStart = startInput.value || null;
      setActivePreset(null);
      renderAll();
    });
    endInput.addEventListener("change", () => {
      state.dateEnd = endInput.value || null;
      setActivePreset(null);
      renderAll();
    });

    setActivePreset(document.querySelector('#turib-period-presets .seg[data-preset="90"]'));
    applyPreset("90");
  }

  // TÜRİB ürün adları "[GRUP] [opsiyonel TİP] [SINIF]" biçiminde — örn.
  // "BUĞDAY EKMEKLİK BEYAZ 1.SINIF" ya da düz "MISIR 1.SINIF". 20 ürünü tek
  // satırda listelemek yerine kademeli seçim yapıyoruz: önce Grup, Buğday
  // gibi alt tipi olan bir grupsa Tip, sonra Sınıf — ekran kalabalaşmasın.
  const SINIF_ORDER = ["1.SINIF", "2.SINIF", "3.SINIF", "DÜŞÜK VASIFLI"];

  function parseProductName(name) {
    const m = name.match(/^(.*?)\s+(\d+\.SINIF|DÜŞÜK VASIFLI)$/);
    if (!m) return { full: name, grup: name, altTip: null, sinif: "" };
    const prefix = m[1], sinif = m[2];
    if (prefix.startsWith("BUĞDAY ")) {
      return { full: name, grup: "BUĞDAY", altTip: prefix.slice(7), sinif };
    }
    return { full: name, grup: prefix, altTip: null, sinif };
  }

  function renderChipRow(wrapId, options, activeValue, onPick) {
    const wrap = document.getElementById(wrapId);
    wrap.textContent = "";
    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "chip" + (opt === activeValue ? " active" : "");
      btn.type = "button"; btn.textContent = opt;
      btn.addEventListener("click", () => onPick(opt));
      wrap.appendChild(btn);
    });
  }

  function buildProductControls() {
    const allProducts = [...new Set(allRows.map(r => r.enstruman_sinifi))];
    const parsed = allProducts.map(parseProductName);

    function selectEntry(entry) {
      state.grup = entry.grup; state.altTip = entry.altTip; state.sinif = entry.sinif;
      state.product = entry.full;
    }
    function pickDefaultForCandidates(candidates) {
      return candidates.find(p => p.sinif === "1.SINIF") || candidates[0];
    }

    if (!state.product || !allProducts.includes(state.product)) {
      const def = parsed.find(p => p.full === DEFAULT_PRODUCT) || parsed[0];
      if (def) selectEntry(def);
    }

    // 1. kademe: Grup
    const grups = [...new Set(parsed.map(p => p.grup))].sort((a, b) => a.localeCompare(b, "tr"));
    renderChipRow("turib-grup", grups, state.grup, (grup) => {
      const candidates = parsed.filter(p => p.grup === grup);
      const altTips = [...new Set(candidates.map(p => p.altTip).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
      const scoped = altTips.length ? candidates.filter(p => p.altTip === altTips[0]) : candidates;
      selectEntry(pickDefaultForCandidates(scoped));
      buildProductControls();
      renderAll();
    });

    // 2. kademe: Tip (yalnızca seçili grubun alt tipi varsa gösterilir — Buğday)
    const altTipGroup = document.getElementById("turib-alttip-group");
    const grupCandidates = parsed.filter(p => p.grup === state.grup);
    const altTips = [...new Set(grupCandidates.map(p => p.altTip).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
    if (altTips.length) {
      altTipGroup.hidden = false;
      renderChipRow("turib-alttip", altTips, state.altTip, (altTip) => {
        const scoped = grupCandidates.filter(p => p.altTip === altTip);
        selectEntry(pickDefaultForCandidates(scoped));
        buildProductControls();
        renderAll();
      });
    } else {
      altTipGroup.hidden = true;
      document.getElementById("turib-alttip").textContent = "";
    }

    // 3. kademe: Sınıf
    const sinifCandidates = grupCandidates.filter(p => p.altTip === state.altTip);
    const sinifs = [...new Set(sinifCandidates.map(p => p.sinif))].sort((a, b) => SINIF_ORDER.indexOf(a) - SINIF_ORDER.indexOf(b));
    renderChipRow("turib-sinif", sinifs, state.sinif, (sinif) => {
      const entry = sinifCandidates.find(p => p.sinif === sinif);
      selectEntry(entry);
      renderAll();
    });
  }

  function renderLidasSelected() {
    const wrap = document.getElementById("turib-lidas-selected");
    wrap.textContent = "";
    if (!state.lidas) return;
    const chip = document.createElement("button");
    chip.className = "chip active";
    chip.type = "button";
    chip.appendChild(document.createTextNode(state.lidas));
    const x = document.createElement("span");
    x.className = "x"; x.textContent = " ✕";
    chip.appendChild(x);
    chip.addEventListener("click", () => { state.lidas = null; renderLidasSelected(); renderAll(); });
    wrap.appendChild(chip);
  }

  function buildLidasSearch() {
    const input = document.getElementById("turib-lidas-search");
    const box = document.getElementById("turib-lidas-suggestions");
    function closeBox() { box.classList.remove("open"); box.textContent = ""; }
    function renderSuggestions() {
      const q = input.value.trim().toLocaleLowerCase("tr");
      const allNames = [...new Set(productRows().map(r => r.lidas_adi))].filter(Boolean).sort((a, b) => a.localeCompare(b, "tr"));
      const names = q ? allNames.filter(n => n.toLocaleLowerCase("tr").includes(q)) : allNames;
      box.textContent = "";
      if (!names.length) {
        const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "Sonuç yok";
        box.appendChild(empty);
      } else {
        names.forEach(name => {
          const btn = document.createElement("button");
          btn.type = "button"; btn.textContent = name;
          btn.addEventListener("mousedown", evt => {
            evt.preventDefault();
            input.value = "";
            closeBox();
            state.lidas = name;
            renderLidasSelected();
            renderAll();
          });
          box.appendChild(btn);
        });
      }
      box.classList.add("open");
    }
    input.addEventListener("input", renderSuggestions);
    input.addEventListener("focus", renderSuggestions);
    input.addEventListener("click", renderSuggestions);
    input.addEventListener("blur", () => setTimeout(closeBox, 120));
  }

  let loaded = false;
  window.__turibTab = {
    onActivate() {
      if (loaded) return;
      loaded = true;
      fetchTuribRows()
        .then(rows => {
          window.__updateStatusFromCache("turib");
          allRows = rows;
          document.getElementById("turib-asof-badge").textContent = rows.length
            ? "Son veri: " + fmtDateFull(rows.reduce((max, r) => (r.trade_date > max ? r.trade_date : max), rows[0].trade_date))
            : "Veri yok";
          buildProductControls();
          buildDateControls();
          renderAll();
        })
        .catch(err => {
          console.error(err);
          document.getElementById("turib-asof-badge").textContent = "Veri çekilemedi";
        });
    },
  };

  buildLidasSearch();

  document.getElementById("turib-table-search").addEventListener("input", (e) => {
    state.tableSearch = e.target.value.trim();
    tablePage = 0;
    renderTable(currentRows());
  });

  document.getElementById("turib-row-limit").querySelectorAll(".seg").forEach(btn => {
    btn.addEventListener("click", () => {
      rowLimit = Number(btn.dataset.limit);
      tablePage = 0;
      document.getElementById("turib-row-limit").querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
      renderTable(currentRows());
    });
  });
  document.getElementById("turib-page-prev").addEventListener("click", () => {
    tablePage -= 1;
    renderTable(currentRows());
  });
  document.getElementById("turib-page-next").addEventListener("click", () => {
    tablePage += 1;
    renderTable(currentRows());
  });

  document.getElementById("turib-export-btn").addEventListener("click", () => {
    const rows = currentRows();
    if (!rows.length) return;
    exportTuribCsv(rows);
  });
})();

// ---------------------------------------------------------------------------
// UZTB (Uzunköprü Ticaret Borsası) alt sekmesi — Ticaret Borsası sekmesinin
// içinde üçüncü bir kaynak. TÜRİB'den farkı: kaynakta geçmiş veri için
// tarih parametreli bir API yok, bu yüzden DB zaten GÜNLÜK ÖZET satırları
// tutuyor (bir gün = bir satır: min/maks/ağırlıklı ortalama fiyat, toplam
// kilo, ortalama rutubet) — burada TÜRİB'deki gibi ayrıca günlük toplama
// yapmaya gerek yok, satırlar doğrudan grafik noktasına dönüşüyor.
(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;
  const LINE_COLOR = "var(--series-import)";
  const CHART_W = 960, CHART_H = 240, PADL = 70, PADR = 20, PADT = 16, PADB = 28;
  const TON_CHART_H = 110, TON_PADT = 10, TON_PADB = 24;
  let rowLimit = 10;
  let tablePage = 0;

  function fmtPriceTon(v) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " TL/ton";
  }
  function fmtTon(v) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " ton";
  }
  function fmtPct(v) {
    if (v == null || isNaN(v)) return "—";
    return "%" + v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDateShort(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  }
  function fmtDateFull(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  }

  const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

  async function fetchUztbRows() {
    const cached = window.__supaCache.get("uztb", CACHE_TTL_MS);
    if (cached) return cached;
    const headers = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` };
    const res = await fetch(
      `${cfg.SUPABASE_URL}/rest/v1/uztb_fiyat?select=trade_date,urun_adi,min_fiyat,max_fiyat,ort_fiyat,toplam_kilo,islem_adet,ort_rutubet&order=trade_date.asc`,
      { headers }
    );
    if (!res.ok) throw new Error(`Supabase istek hatası: ${res.status}`);
    const rows = await res.json();
    window.__supaCache.set("uztb", rows);
    return rows;
  }

  function makeTooltip() {
    let el = document.querySelector(".tooltip");
    if (!el) { el = document.createElement("div"); el.className = "tooltip"; document.body.appendChild(el); }
    return el;
  }
  function showTooltip(evt, node) {
    const tip = makeTooltip();
    tip.textContent = ""; tip.appendChild(node);
    tip.style.opacity = "1";
    let x = evt.clientX + 14, y = evt.clientY + 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
    const rect = tip.getBoundingClientRect();
    if (rect.right > window.innerWidth) tip.style.left = (evt.clientX - rect.width - 14) + "px";
    if (rect.bottom > window.innerHeight) tip.style.top = (evt.clientY - rect.height - 14) + "px";
  }
  function hideTooltip() { const t = document.querySelector(".tooltip"); if (t) t.style.opacity = "0"; }

  let allRows = [];
  const state = { dateStart: null, dateEnd: null };

  function currentRows() {
    return allRows.filter(r => {
      if (state.dateStart && r.trade_date < state.dateStart) return false;
      if (state.dateEnd && r.trade_date > state.dateEnd) return false;
      return true;
    });
  }

  // DB zaten günlük özet tuttuğu için satır = grafik noktası; sadece
  // alan adlarını çeviriyoruz (kg->ton, TL/kg->TL/ton), ayrıca toplama yapmıyoruz.
  function toSeries(rows) {
    return [...rows]
      .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
      .map(r => ({
        date: r.trade_date,
        price: r.ort_fiyat != null ? r.ort_fiyat * 1000 : null,
        minPrice: r.min_fiyat != null ? r.min_fiyat * 1000 : null,
        maxPrice: r.max_fiyat != null ? r.max_fiyat * 1000 : null,
        ton: (r.toplam_kilo || 0) / 1000,
      }));
  }

  function overallWeightedAvg(rows) {
    let sumPriceKg = 0, sumKg = 0;
    rows.forEach(r => {
      if (r.ort_fiyat == null || r.toplam_kilo == null) return;
      sumPriceKg += r.ort_fiyat * r.toplam_kilo;
      sumKg += r.toplam_kilo;
    });
    return sumKg > 0 ? (sumPriceKg / sumKg) * 1000 : null;
  }

  function renderPriceLegend() {
    const el = document.getElementById("uztb-price-legend");
    el.textContent = "";
    [["Ağırlıklı Ortalama", false], ["En Yüksek", true], ["En Düşük", true]].forEach(([label, dashed]) => {
      const key = document.createElement("span");
      key.className = "key";
      const sw = document.createElement("span");
      sw.className = "swatch-line" + (dashed ? " dashed" : "");
      sw.style.background = dashed ? "none" : LINE_COLOR;
      sw.style.borderColor = LINE_COLOR;
      key.appendChild(sw);
      key.appendChild(document.createTextNode(label));
      el.appendChild(key);
    });
  }

  function buildGappedPath(points, field, xScale, yScale) {
    let d = "";
    let drawing = false;
    points.forEach((p, i) => {
      const v = p[field];
      if (v == null) { drawing = false; return; }
      d += (drawing ? "L" : "M") + xScale(i) + "," + yScale(v) + " ";
      drawing = true;
    });
    return d.trim();
  }

  function drawPriceChart(points) {
    const svg = document.getElementById("uztb-chart");
    svg.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + CHART_H);
    if (!points.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = "Bu filtrede veri yok.";
      svg.appendChild(t);
      return;
    }
    const xStep = points.length > 1 ? (CHART_W - PADL - PADR) / (points.length - 1) : 0;
    const xScale = i => points.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const allVals = points.flatMap(p => [p.price, p.minPrice, p.maxPrice]).filter(v => v != null);
    const minVal = Math.min(...allVals), maxVal = Math.max(...allVals);
    const span = maxVal - minVal || Math.abs(maxVal) || 1;
    const yPad = span * 0.1;
    const yScale = v => CHART_H - PADB - ((v - minVal + yPad) / (span + 2 * yPad)) * (CHART_H - PADB - PADT);

    for (let g = 0; g <= 3; g++) {
      const y = PADT + (g * (CHART_H - PADB - PADT)) / 3;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      t.textContent = Math.round(maxVal + yPad - (g * (span + 2 * yPad)) / 3).toLocaleString("tr-TR");
      svg.appendChild(t);
    }

    const minLabelGap = 56;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && points.length > 1 && (points.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((points.length - 1) / tickEvery) * tickEvery;
        if ((points.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", CHART_H - 5);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateShort(p.date);
      svg.appendChild(t);
    });

    const hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hoverLine.setAttribute("class", "baseline");
    hoverLine.setAttribute("y1", PADT); hoverLine.setAttribute("y2", CHART_H - PADB);
    hoverLine.style.opacity = "0";
    svg.appendChild(hoverLine);

    const avgPts = points.map((p, i) => [xScale(i), yScale(p.price)]);
    if (avgPts.length === 1) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", avgPts[0][0]); dot.setAttribute("cy", avgPts[0][1]); dot.setAttribute("r", "4");
      dot.setAttribute("fill", LINE_COLOR);
      svg.appendChild(dot);
    } else {
      const gradId = "uztbAreaGradient";
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
      grad.setAttribute("id", gradId);
      grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0"); grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
      const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop1.setAttribute("offset", "0%"); stop1.setAttribute("stop-color", LINE_COLOR); stop1.setAttribute("stop-opacity", "0.18");
      const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop2.setAttribute("offset", "100%"); stop2.setAttribute("stop-color", LINE_COLOR); stop2.setAttribute("stop-opacity", "0");
      grad.appendChild(stop1); grad.appendChild(stop2);
      defs.appendChild(grad);
      svg.appendChild(defs);

      const baseline = CHART_H - PADB;
      const areaD = "M" + avgPts[0][0] + "," + baseline + " " + avgPts.map(p => "L" + p[0] + "," + p[1]).join(" ") + " L" + avgPts[avgPts.length - 1][0] + "," + baseline + " Z";
      const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
      area.setAttribute("d", areaD);
      area.setAttribute("fill", "url(#" + gradId + ")");
      area.setAttribute("stroke", "none");
      svg.appendChild(area);

      ["maxPrice", "minPrice"].forEach(field => {
        const d = buildGappedPath(points, field, xScale, yScale);
        if (!d) return;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("stroke", LINE_COLOR); path.setAttribute("stroke-width", "1.5");
        path.setAttribute("stroke-dasharray", "5 4"); path.setAttribute("opacity", "0.6");
        path.setAttribute("fill", "none"); path.setAttribute("stroke-linecap", "round");
        svg.appendChild(path);
      });

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", avgPts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" "));
      path.setAttribute("stroke", LINE_COLOR); path.setAttribute("stroke-width", "3");
      path.setAttribute("fill", "none"); path.setAttribute("stroke-linejoin", "round"); path.setAttribute("stroke-linecap", "round");
      svg.appendChild(path);

      const lastPt = avgPts[avgPts.length - 1];
      const endDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      endDot.setAttribute("cx", lastPt[0]); endDot.setAttribute("cy", lastPt[1]); endDot.setAttribute("r", "4.5");
      endDot.setAttribute("fill", "var(--surface-1)"); endDot.setAttribute("stroke", LINE_COLOR); endDot.setAttribute("stroke-width", "2.5");
      svg.appendChild(endDot);
    }

    const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    points.forEach((p, i) => {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      rect.setAttribute("x", xScale(i) - hitW / 2); rect.setAttribute("y", PADT);
      rect.setAttribute("width", hitW); rect.setAttribute("height", CHART_H - PADB - PADT);
      rect.setAttribute("fill", "transparent"); rect.style.cursor = "pointer";
      rect.tabIndex = 0;
      const showFn = evt => {
        hoverLine.setAttribute("x1", xScale(i)); hoverLine.setAttribute("x2", xScale(i));
        hoverLine.style.opacity = "1";
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateFull(p.date);
        wrap.appendChild(ttl);
        [["Ağırlıklı Ort.", p.price], ["En Yüksek", p.maxPrice], ["En Düşük", p.minPrice]].forEach(([label, val]) => {
          const row = document.createElement("div"); row.className = "row";
          const l = document.createElement("span"); l.textContent = label + ": ";
          const v = document.createElement("span"); v.className = "val"; v.textContent = fmtPriceTon(val);
          row.appendChild(l); row.appendChild(v);
          wrap.appendChild(row);
        });
        showTooltip(evt, wrap);
      };
      rect.addEventListener("pointermove", showFn);
      rect.addEventListener("focus", showFn);
      rect.addEventListener("pointerleave", () => { hoverLine.style.opacity = "0"; hideTooltip(); });
      rect.addEventListener("blur", () => { hoverLine.style.opacity = "0"; hideTooltip(); });
      hitLayer.appendChild(rect);
    });
    svg.appendChild(hitLayer);
  }

  function drawTonnageChart(points) {
    const svg = document.getElementById("uztb-tonnage-chart");
    svg.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + TON_CHART_H);
    if (!points.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", TON_CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = "Bu filtrede veri yok.";
      svg.appendChild(t);
      return;
    }
    const xStep = points.length > 1 ? (CHART_W - PADL - PADR) / (points.length - 1) : 0;
    const xScale = i => points.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const maxTon = Math.max(...points.map(p => p.ton), 1);
    const yScale = v => TON_CHART_H - TON_PADB - (v / maxTon) * (TON_CHART_H - TON_PADB - TON_PADT);

    [0, maxTon].forEach(val => {
      const y = yScale(val);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      t.textContent = fmtTon(val);
      svg.appendChild(t);
    });

    const minLabelGap = 56;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && points.length > 1 && (points.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((points.length - 1) / tickEvery) * tickEvery;
        if ((points.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", TON_CHART_H - 5);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateShort(p.date);
      svg.appendChild(t);
    });

    const barW = Math.max(2, Math.min(xStep * 0.6, 14));
    const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    points.forEach((p, i) => {
      const x = xScale(i);
      const y = yScale(p.ton);
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x - barW / 2); rect.setAttribute("y", y);
      rect.setAttribute("width", barW); rect.setAttribute("height", Math.max(0, (TON_CHART_H - TON_PADB) - y));
      rect.setAttribute("fill", LINE_COLOR); rect.setAttribute("opacity", "0.55"); rect.setAttribute("rx", "1.5");
      svg.appendChild(rect);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      hit.setAttribute("x", x - hitW / 2); hit.setAttribute("y", TON_PADT);
      hit.setAttribute("width", hitW); hit.setAttribute("height", TON_CHART_H - TON_PADB - TON_PADT);
      hit.setAttribute("fill", "transparent"); hit.style.cursor = "pointer";
      hit.tabIndex = 0;
      const showFn = evt => {
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateFull(p.date);
        wrap.appendChild(ttl);
        const row = document.createElement("div"); row.className = "row";
        const v = document.createElement("span"); v.className = "val"; v.textContent = fmtTon(p.ton);
        row.appendChild(v);
        wrap.appendChild(row);
        showTooltip(evt, wrap);
      };
      hit.addEventListener("pointermove", showFn);
      hit.addEventListener("focus", showFn);
      hit.addEventListener("pointerleave", hideTooltip);
      hit.addEventListener("blur", hideTooltip);
      hitLayer.appendChild(hit);
    });
    svg.appendChild(hitLayer);
  }

  function renderKpis(rows, series) {
    const el = document.getElementById("uztb-kpi-row");
    el.textContent = "";
    const rutubetVals = rows.filter(r => r.ort_rutubet != null);
    const avgRutubet = rutubetVals.length
      ? rutubetVals.reduce((s, r) => s + r.ort_rutubet, 0) / rutubetVals.length
      : null;
    const tiles = [
      ["Ağırlıklı ortalama fiyat (seçili dönem)", fmtPriceTon(overallWeightedAvg(rows))],
      ["Son fiyat", series.length ? fmtPriceTon(series[series.length - 1].price) : "—"],
      ["Toplam işlem hacmi", fmtTon(rows.reduce((s, r) => s + (r.toplam_kilo || 0) / 1000, 0))],
      ["Ortalama rutubet", fmtPct(avgRutubet)],
    ];
    tiles.forEach(([label, value]) => {
      const tile = document.createElement("div");
      tile.className = "stat-tile";
      const l = document.createElement("div"); l.className = "label"; l.textContent = label;
      const v = document.createElement("div"); v.className = "value num"; v.textContent = value;
      tile.appendChild(l); tile.appendChild(v);
      el.appendChild(tile);
    });
  }

  function renderTable(rows) {
    const thead = document.getElementById("uztb-thead");
    const tbody = document.getElementById("uztb-tbody");
    const foot = document.getElementById("uztb-table-foot");
    thead.textContent = ""; tbody.textContent = ""; foot.textContent = "";
    const cols = ["Tarih", "En Düşük", "En Yüksek", "Ağ. Ort. Fiyat", "Toplam Miktar", "İşlem Adedi", "Ort. Rutubet"];
    cols.forEach(c => { const th = document.createElement("th"); th.textContent = c; thead.appendChild(th); });

    const sorted = [...rows].sort((a, b) => b.trade_date.localeCompare(a.trade_date));
    const info = paginateRows(sorted, tablePage, rowLimit);
    tablePage = info.page;
    info.slice.forEach(r => {
      const tr = document.createElement("tr");
      const cells = [
        fmtDateFull(r.trade_date),
        fmtPriceTon(r.min_fiyat != null ? r.min_fiyat * 1000 : null),
        fmtPriceTon(r.max_fiyat != null ? r.max_fiyat * 1000 : null),
        fmtPriceTon(r.ort_fiyat != null ? r.ort_fiyat * 1000 : null),
        fmtTon((r.toplam_kilo || 0) / 1000), String(r.islem_adet ?? "—"), fmtPct(r.ort_rutubet),
      ];
      cells.forEach(c => { const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    updatePagerUI("uztb", info);
  }

  function exportUztbCsv(rows) {
    const cols = ["trade_date", "urun_adi", "min_fiyat", "max_fiyat", "ort_fiyat", "toplam_kilo", "islem_adet", "ort_rutubet"];
    const esc = v => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.join(";")].concat(rows.map(r => cols.map(c => esc(r[c])).join(";")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "uztb-gunluk-ozet-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderAll() {
    tablePage = 0; // filtre değişince sayfa 1'e dönülür — eski sayfa artık anlamsız
    const rows = currentRows();
    const series = toSeries(rows);
    renderPriceLegend();
    drawPriceChart(series);
    drawTonnageChart(series);
    renderKpis(rows, series);
    renderTable(rows);
  }

  function buildDateControls() {
    const startInput = document.getElementById("uztb-date-start");
    const endInput = document.getElementById("uztb-date-end");
    if (!allRows.length) return;
    const allDates = allRows.map(r => r.trade_date).sort();
    const minDate = allDates[0], maxDate = allDates[allDates.length - 1];
    startInput.min = minDate; startInput.max = maxDate;
    endInput.min = minDate; endInput.max = maxDate;
    startInput.value = minDate; endInput.value = maxDate;

    function setActivePreset(btn) {
      document.querySelectorAll("#uztb-period-presets .seg").forEach(b => b.classList.toggle("active", b === btn));
    }
    function applyPreset(preset) {
      if (preset === "all") {
        state.dateStart = null; state.dateEnd = null;
        startInput.value = minDate; endInput.value = maxDate;
      } else {
        const end = new Date(maxDate + "T00:00:00");
        const start = new Date(end);
        start.setDate(start.getDate() - Number(preset) + 1);
        const startIso = start.toISOString().slice(0, 10);
        state.dateStart = startIso < minDate ? minDate : startIso;
        state.dateEnd = maxDate;
        startInput.value = state.dateStart; endInput.value = state.dateEnd;
      }
      renderAll();
    }
    document.querySelectorAll("#uztb-period-presets .seg").forEach(btn => {
      btn.addEventListener("click", () => { setActivePreset(btn); applyPreset(btn.dataset.preset); });
    });
    startInput.addEventListener("change", () => { state.dateStart = startInput.value || null; setActivePreset(null); renderAll(); });
    endInput.addEventListener("change", () => { state.dateEnd = endInput.value || null; setActivePreset(null); renderAll(); });

    setActivePreset(document.querySelector('#uztb-period-presets .seg[data-preset="90"]'));
    applyPreset("90");
  }

  let loaded = false;
  window.__uztbTab = {
    onActivate() {
      if (loaded) return;
      loaded = true;
      fetchUztbRows()
        .then(rows => {
          window.__updateStatusFromCache("uztb");
          allRows = rows;
          document.getElementById("uztb-asof-badge").textContent = rows.length
            ? "Son veri: " + fmtDateFull(rows.reduce((max, r) => (r.trade_date > max ? r.trade_date : max), rows[0].trade_date))
            : "Veri yok";
          buildDateControls();
          renderAll();
        })
        .catch(err => {
          console.error(err);
          document.getElementById("uztb-asof-badge").textContent = "Veri çekilemedi";
        });
    },
  };

  document.getElementById("uztb-row-limit").querySelectorAll(".seg").forEach(btn => {
    btn.addEventListener("click", () => {
      rowLimit = Number(btn.dataset.limit);
      tablePage = 0;
      document.getElementById("uztb-row-limit").querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
      renderTable(currentRows());
    });
  });
  document.getElementById("uztb-page-prev").addEventListener("click", () => {
    tablePage -= 1;
    renderTable(currentRows());
  });
  document.getElementById("uztb-page-next").addEventListener("click", () => {
    tablePage += 1;
    renderTable(currentRows());
  });

  document.getElementById("uztb-export-btn").addEventListener("click", () => {
    const rows = currentRows();
    if (!rows.length) return;
    exportUztbCsv(rows);
  });
})();

// ---------------------------------------------------------------------------
// KTB (Konya Ticaret Borsası) alt sekmesi — Ticaret Borsası sekmesinin
// içinde dördüncü bir kaynak. TÜRİB gibi gerçek 1 yıllık geçmiş API'si var
// (GetGunlukBulten/{tarih}), DB'de satırlar (tarih, ürün grubu, sınıf)
// kırılımında — her satır o sınıfın günlük min/ort/max fiyatı + miktarı,
// ayrıca aynı günün GRUP genelindeki (tüm sınıflar) min/ort/max fiyatı da
// taşıyor (kaynağın kendi response şekli). Grafik bu grup-geneli alanları
// kullanıyor (TÜRİB'deki gibi ayrıca ağırlıklı toplama gerekmiyor), KPI'daki
// "seçili dönem ağırlıklı ortalaması" ise sınıf satırlarının miktar ile
// tartılmasıyla hesaplanıyor (daha ince taneli, dönem bazlı doğru ortalama).
(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;
  const LINE_COLOR = "var(--series-export)";
  const CHART_W = 960, CHART_H = 240, PADL = 70, PADR = 20, PADT = 16, PADB = 28;
  const TON_CHART_H = 110, TON_PADT = 10, TON_PADB = 24;
  let rowLimit = 10;
  let tablePage = 0;
  const DEFAULT_PRODUCT = "Mısır";

  // ---------- i18n (TR/EN/RU) — sadece bu sekmenin sabit arayüz metinleri ve
  // ana ürün grubu adları çevriliyor (örn. "Mısır"); kaynaktan gelen sınıf
  // adları (sinif_adi, örn. "2.GRUP MAKARNALIK BUĞDAYLAR") Türkçe kalıyor —
  // bunlar kapalı/sabit bir küme değil, kaynağın kendi serbest metni.
  const KTB_LOCALES = { tr: "tr-TR", en: "en-US", ru: "ru-RU" };
  const KTB_STRINGS = {
    tr: {
      bannerStrong: "KTB (Konya Ticaret Borsası) günlük Satış Salonu bülteni",
      bannerBody: " — her iş günü 18:00'da o günün bülteni çekilir. Fiyatlar seçili ürün grubunun o günkü tüm sınıflarının (kalite derecelerinin) ağırlıklı ortalaması, en düşüğü ve en yükseğidir.",
      productGroupLabel: "Ürün Grubu",
      dateRangeLabel: "Tarih Aralığı",
      quickSelectLabel: "Hızlı seçim",
      preset30: "Son 30 Gün", preset90: "Son 90 Gün", presetAll: "Tüm Zamanlar",
      chartTitlePrefix: "Fiyat eğilimi (TL/ton)",
      tonnageChartTitle: "Günlük işlem hacmi (ton)",
      tableTitle: "Günlük özet (sınıf bazında)",
      exportBtn: "Excel'e aktar (CSV)",
      prevPageTitle: "Önceki sayfa", nextPageTitle: "Sonraki sayfa",
      legendAvg: "Ağırlıklı Ortalama", legendMax: "En Yüksek", legendMin: "En Düşük",
      tooltipAvg: "Ağırlıklı Ort.", tooltipMax: "En Yüksek", tooltipMin: "En Düşük",
      noDataChart: "Bu filtrede veri yok.",
      kpiAvgPrice: "Ağırlıklı ortalama fiyat (seçili dönem)",
      kpiLastPrice: "Son fiyat",
      kpiTotalVolume: "Toplam işlem hacmi",
      kpiTotalCount: "Toplam işlem sayısı",
      thDate: "Tarih", thClass: "Sınıf", thMin: "En Düşük", thMax: "En Yüksek", thAvg: "Ort. Fiyat", thQty: "Miktar", thCount: "İşlem Sayısı",
      footAll: n => `${n} satır`,
      footLimited: (n, total) => `İlk ${n} satır gösteriliyor — toplam ${total} satır. Tümü için CSV olarak aktarın.`,
      asofLoading: "Yükleniyor…", asofPrefix: "Son veri: ", asofNoData: "Veri yok", asofError: "Veri çekilemedi",
      tonSuffix: " ton", priceSuffix: " TL/ton",
    },
    en: {
      bannerStrong: "KTB (Konya Commodity Exchange) daily Sales Hall bulletin",
      bannerBody: " — the day's bulletin is fetched every business day at 18:00 (TR time). Prices are the quantity-weighted average, lowest and highest across all classes (quality grades) of the selected product group that day.",
      productGroupLabel: "Product Group",
      dateRangeLabel: "Date Range",
      quickSelectLabel: "Quick select",
      preset30: "Last 30 Days", preset90: "Last 90 Days", presetAll: "All Time",
      chartTitlePrefix: "Price trend (TRY/ton)",
      tonnageChartTitle: "Daily trade volume (ton)",
      tableTitle: "Daily summary (by class)",
      exportBtn: "Export to Excel (CSV)",
      prevPageTitle: "Previous page", nextPageTitle: "Next page",
      legendAvg: "Weighted Average", legendMax: "Highest", legendMin: "Lowest",
      tooltipAvg: "Weighted Avg.", tooltipMax: "Highest", tooltipMin: "Lowest",
      noDataChart: "No data for this filter.",
      kpiAvgPrice: "Weighted average price (selected period)",
      kpiLastPrice: "Last price",
      kpiTotalVolume: "Total trade volume",
      kpiTotalCount: "Total number of trades",
      thDate: "Date", thClass: "Class", thMin: "Lowest", thMax: "Highest", thAvg: "Avg. Price", thQty: "Quantity", thCount: "Trade Count",
      footAll: n => `${n} row${n === 1 ? "" : "s"}`,
      footLimited: (n, total) => `Showing first ${n} rows — ${total} rows total. Export to CSV for all.`,
      asofLoading: "Loading…", asofPrefix: "Latest data: ", asofNoData: "No data", asofError: "Failed to fetch data",
      tonSuffix: " ton", priceSuffix: " TRY/ton",
    },
    ru: {
      bannerStrong: "КТБ (Конийская товарная биржа) — ежедневный бюллетень торгового зала",
      bannerBody: " — бюллетень за день загружается каждый рабочий день в 18:00 (время Турции). Цены — это средневзвешенная, минимальная и максимальная цена по всем классам (сортам) выбранной товарной группы за этот день.",
      productGroupLabel: "Товарная группа",
      dateRangeLabel: "Период",
      quickSelectLabel: "Быстрый выбор",
      preset30: "Последние 30 дней", preset90: "Последние 90 дней", presetAll: "Всё время",
      chartTitlePrefix: "Динамика цены (TRY/т)",
      tonnageChartTitle: "Суточный объём торгов (т)",
      tableTitle: "Суточная сводка (по классам)",
      exportBtn: "Экспорт в Excel (CSV)",
      prevPageTitle: "Предыдущая страница", nextPageTitle: "Следующая страница",
      legendAvg: "Средневзвешенная", legendMax: "Максимум", legendMin: "Минимум",
      tooltipAvg: "Средневзв.", tooltipMax: "Максимум", tooltipMin: "Минимум",
      noDataChart: "Нет данных для этого фильтра.",
      kpiAvgPrice: "Средневзвешенная цена (за период)",
      kpiLastPrice: "Последняя цена",
      kpiTotalVolume: "Общий объём торгов",
      kpiTotalCount: "Общее число сделок",
      thDate: "Дата", thClass: "Класс", thMin: "Минимум", thMax: "Максимум", thAvg: "Сред. цена", thQty: "Объём", thCount: "Число сделок",
      footAll: n => `${n} строк`,
      footLimited: (n, total) => `Показаны первые ${n} строк — всего ${total}. Для всех данных экспортируйте в CSV.`,
      asofLoading: "Загрузка…", asofPrefix: "Данные на: ", asofNoData: "Нет данных", asofError: "Не удалось загрузить данные",
      tonSuffix: " т", priceSuffix: " TRY/т",
    },
  };
  const KTB_PRODUCT_NAMES = {
    "Beyaz Sert Buğday": { en: "White Hard Wheat", ru: "Белая твёрдая пшеница" },
    "Diğer Beyaz Buğday": { en: "Other White Wheat", ru: "Прочая белая пшеница" },
    "Diğer Kırmızı Buğday": { en: "Other Red Wheat", ru: "Прочая красная пшеница" },
    "Kırmızı Sert Buğday": { en: "Red Hard Wheat", ru: "Красная твёрдая пшеница" },
    "Makarnalık Buğday": { en: "Durum Wheat", ru: "Твёрдая пшеница (дурум)" },
    "Arpa": { en: "Barley", ru: "Ячмень" },
    "Mısır": { en: "Corn", ru: "Кукуруза" },
    "Diğer Ürünler": { en: "Other Products", ru: "Прочая продукция" },
    "Tritikale": { en: "Triticale", ru: "Тритикале" },
    "Yulaf": { en: "Oats", ru: "Овёс" },
    "Çavdar": { en: "Rye", ru: "Рожь" },
    "Nohut": { en: "Chickpeas", ru: "Нут" },
    "Kuru Fasulye": { en: "Dry Beans", ru: "Сухая фасоль" },
    "Mercimek": { en: "Lentils", ru: "Чечевица" },
    "Çemen": { en: "Fenugreek", ru: "Пажитник" },
  };
  let lang = "tr";
  function tt(key) { return KTB_STRINGS[lang][key]; }
  function translateProduct(name) {
    if (lang === "tr" || !name) return name;
    const entry = KTB_PRODUCT_NAMES[name];
    return entry ? entry[lang] : name;
  }

  function fmtPriceTon(v) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString(KTB_LOCALES[lang], { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + tt("priceSuffix");
  }
  function fmtTon(v) {
    if (v == null || isNaN(v)) return "—";
    return v.toLocaleString(KTB_LOCALES[lang], { maximumFractionDigits: 1 }) + tt("tonSuffix");
  }
  function fmtDateShort(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString(KTB_LOCALES[lang], { day: "2-digit", month: "short" });
  }
  function fmtDateFull(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString(KTB_LOCALES[lang], { day: "numeric", month: "long", year: "numeric" });
  }

  const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

  async function fetchKtbRows() {
    const cached = window.__supaCache.get("ktb", CACHE_TTL_MS);
    if (cached) return cached;
    const headers = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` };
    const pageSize = 1000;
    let rows = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${cfg.SUPABASE_URL}/rest/v1/ktb_bulletin?select=trade_date,grup_kodu,grup_adi,sinif_adi,min_fiyat,ort_fiyat,max_fiyat,miktar,islem_sayisi,grup_min_fiyat,grup_ort_fiyat,grup_max_fiyat&order=trade_date.asc`,
        { headers: Object.assign({}, headers, { Range: `${from}-${from + pageSize - 1}` }) }
      );
      if (!res.ok) throw new Error(`Supabase istek hatası: ${res.status}`);
      const page = await res.json();
      rows = rows.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    window.__supaCache.set("ktb", rows);
    return rows;
  }

  function makeTooltip() {
    let el = document.querySelector(".tooltip");
    if (!el) { el = document.createElement("div"); el.className = "tooltip"; document.body.appendChild(el); }
    return el;
  }
  function showTooltip(evt, node) {
    const tip = makeTooltip();
    tip.textContent = ""; tip.appendChild(node);
    tip.style.opacity = "1";
    let x = evt.clientX + 14, y = evt.clientY + 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
    const rect = tip.getBoundingClientRect();
    if (rect.right > window.innerWidth) tip.style.left = (evt.clientX - rect.width - 14) + "px";
    if (rect.bottom > window.innerHeight) tip.style.top = (evt.clientY - rect.height - 14) + "px";
  }
  function hideTooltip() { const t = document.querySelector(".tooltip"); if (t) t.style.opacity = "0"; }

  let allRows = [];
  const state = { product: null, dateStart: null, dateEnd: null };

  function productRows() {
    return allRows.filter(r => r.grup_adi === state.product);
  }
  function currentRows() {
    return productRows().filter(r => {
      if (state.dateStart && r.trade_date < state.dateStart) return false;
      if (state.dateEnd && r.trade_date > state.dateEnd) return false;
      return true;
    });
  }

  // Grafik için: aynı (tarih, grup) satırlarının hepsinde grup_min/ort/max_fiyat
  // zaten aynı değeri taşıyor (kaynağın kendi günlük grup özeti) — burada
  // sadece tekilleştirip TL/ton'a çeviriyoruz. Tonaj o günün tüm sınıf
  // satırlarındaki miktarın toplamı.
  function dailyWeightedSeries(rows) {
    const byDate = new Map();
    rows.forEach(r => {
      const e = byDate.get(r.trade_date) || { kg: 0, price: null, minPrice: null, maxPrice: null };
      e.kg += (r.miktar || 0);
      if (r.grup_ort_fiyat != null) e.price = r.grup_ort_fiyat;
      if (r.grup_min_fiyat != null) e.minPrice = r.grup_min_fiyat;
      if (r.grup_max_fiyat != null) e.maxPrice = r.grup_max_fiyat;
      byDate.set(r.trade_date, e);
    });
    return [...byDate.entries()]
      .map(([date, e]) => ({
        date,
        price: e.price != null ? e.price * 1000 : null,
        minPrice: e.minPrice != null ? e.minPrice * 1000 : null,
        maxPrice: e.maxPrice != null ? e.maxPrice * 1000 : null,
        ton: e.kg / 1000,
      }))
      .filter(p => p.price != null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // KPI'daki dönem ağırlıklı ortalaması: sınıf satırlarının kendi fiyatını
  // kendi miktarıyla tartarak (daha ince taneli, seçili TÜM dönem için doğru
  // hacim ağırlıklı ortalama — grup_ort_fiyat günlük bazda zaten doğru ama
  // birden çok günü basitçe ortalamak hacmi görmezden gelir).
  function overallWeightedAvg(rows) {
    let sumPriceKg = 0, sumKg = 0;
    rows.forEach(r => {
      if (r.ort_fiyat == null || r.miktar == null) return;
      sumPriceKg += r.ort_fiyat * r.miktar;
      sumKg += r.miktar;
    });
    return sumKg > 0 ? (sumPriceKg / sumKg) * 1000 : null;
  }

  function renderPriceLegend() {
    const el = document.getElementById("ktb-price-legend");
    el.textContent = "";
    [
      [tt("legendAvg"), false],
      [tt("legendMax"), true],
      [tt("legendMin"), true],
    ].forEach(([label, dashed]) => {
      const key = document.createElement("span");
      key.className = "key";
      const sw = document.createElement("span");
      sw.className = "swatch-line" + (dashed ? " dashed" : "");
      sw.style.background = dashed ? "none" : LINE_COLOR;
      sw.style.borderColor = LINE_COLOR;
      key.appendChild(sw);
      key.appendChild(document.createTextNode(label));
      el.appendChild(key);
    });
  }

  function buildGappedPath(points, field, xScale, yScale) {
    let d = "";
    let drawing = false;
    points.forEach((p, i) => {
      const v = p[field];
      if (v == null) { drawing = false; return; }
      d += (drawing ? "L" : "M") + xScale(i) + "," + yScale(v) + " ";
      drawing = true;
    });
    return d.trim();
  }

  function drawPriceChart(points) {
    const svg = document.getElementById("ktb-chart");
    svg.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + CHART_H);
    if (!points.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = tt("noDataChart");
      svg.appendChild(t);
      return;
    }
    const xStep = points.length > 1 ? (CHART_W - PADL - PADR) / (points.length - 1) : 0;
    const xScale = i => points.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const allVals = points.flatMap(p => [p.price, p.minPrice, p.maxPrice]).filter(v => v != null);
    const minVal = Math.min(...allVals), maxVal = Math.max(...allVals);
    const span = maxVal - minVal || Math.abs(maxVal) || 1;
    const yPad = span * 0.1;
    const yScale = v => CHART_H - PADB - ((v - minVal + yPad) / (span + 2 * yPad)) * (CHART_H - PADB - PADT);

    for (let g = 0; g <= 3; g++) {
      const y = PADT + (g * (CHART_H - PADB - PADT)) / 3;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      t.textContent = Math.round(maxVal + yPad - (g * (span + 2 * yPad)) / 3).toLocaleString(KTB_LOCALES[lang]);
      svg.appendChild(t);
    }

    const minLabelGap = 56;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && points.length > 1 && (points.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((points.length - 1) / tickEvery) * tickEvery;
        if ((points.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", CHART_H - 5);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateShort(p.date);
      svg.appendChild(t);
    });

    const hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hoverLine.setAttribute("class", "baseline");
    hoverLine.setAttribute("y1", PADT); hoverLine.setAttribute("y2", CHART_H - PADB);
    hoverLine.style.opacity = "0";
    svg.appendChild(hoverLine);

    const avgPts = points.map((p, i) => [xScale(i), yScale(p.price)]);
    if (avgPts.length === 1) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", avgPts[0][0]); dot.setAttribute("cy", avgPts[0][1]); dot.setAttribute("r", "4");
      dot.setAttribute("fill", LINE_COLOR);
      svg.appendChild(dot);
    } else {
      const gradId = "ktbAreaGradient";
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const grad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
      grad.setAttribute("id", gradId);
      grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0"); grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
      const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop1.setAttribute("offset", "0%"); stop1.setAttribute("stop-color", LINE_COLOR); stop1.setAttribute("stop-opacity", "0.18");
      const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
      stop2.setAttribute("offset", "100%"); stop2.setAttribute("stop-color", LINE_COLOR); stop2.setAttribute("stop-opacity", "0");
      grad.appendChild(stop1); grad.appendChild(stop2);
      defs.appendChild(grad);
      svg.appendChild(defs);

      const baseline = CHART_H - PADB;
      const areaD = "M" + avgPts[0][0] + "," + baseline + " " + avgPts.map(p => "L" + p[0] + "," + p[1]).join(" ") + " L" + avgPts[avgPts.length - 1][0] + "," + baseline + " Z";
      const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
      area.setAttribute("d", areaD);
      area.setAttribute("fill", "url(#" + gradId + ")");
      area.setAttribute("stroke", "none");
      svg.appendChild(area);

      ["maxPrice", "minPrice"].forEach(field => {
        const d = buildGappedPath(points, field, xScale, yScale);
        if (!d) return;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("stroke", LINE_COLOR); path.setAttribute("stroke-width", "1.5");
        path.setAttribute("stroke-dasharray", "5 4"); path.setAttribute("opacity", "0.6");
        path.setAttribute("fill", "none"); path.setAttribute("stroke-linecap", "round");
        svg.appendChild(path);
      });

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", avgPts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" "));
      path.setAttribute("stroke", LINE_COLOR); path.setAttribute("stroke-width", "3");
      path.setAttribute("fill", "none"); path.setAttribute("stroke-linejoin", "round"); path.setAttribute("stroke-linecap", "round");
      svg.appendChild(path);

      const lastPt = avgPts[avgPts.length - 1];
      const endDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      endDot.setAttribute("cx", lastPt[0]); endDot.setAttribute("cy", lastPt[1]); endDot.setAttribute("r", "4.5");
      endDot.setAttribute("fill", "var(--surface-1)"); endDot.setAttribute("stroke", LINE_COLOR); endDot.setAttribute("stroke-width", "2.5");
      svg.appendChild(endDot);
    }

    const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    points.forEach((p, i) => {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      rect.setAttribute("x", xScale(i) - hitW / 2); rect.setAttribute("y", PADT);
      rect.setAttribute("width", hitW); rect.setAttribute("height", CHART_H - PADB - PADT);
      rect.setAttribute("fill", "transparent"); rect.style.cursor = "pointer";
      rect.tabIndex = 0;
      const showFn = evt => {
        hoverLine.setAttribute("x1", xScale(i)); hoverLine.setAttribute("x2", xScale(i));
        hoverLine.style.opacity = "1";
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateFull(p.date);
        wrap.appendChild(ttl);
        [[tt("tooltipAvg"), p.price], [tt("tooltipMax"), p.maxPrice], [tt("tooltipMin"), p.minPrice]].forEach(([label, val]) => {
          const row = document.createElement("div"); row.className = "row";
          const l = document.createElement("span"); l.textContent = label + ": ";
          const v = document.createElement("span"); v.className = "val"; v.textContent = fmtPriceTon(val);
          row.appendChild(l); row.appendChild(v);
          wrap.appendChild(row);
        });
        showTooltip(evt, wrap);
      };
      rect.addEventListener("pointermove", showFn);
      rect.addEventListener("focus", showFn);
      rect.addEventListener("pointerleave", () => { hoverLine.style.opacity = "0"; hideTooltip(); });
      rect.addEventListener("blur", () => { hoverLine.style.opacity = "0"; hideTooltip(); });
      hitLayer.appendChild(rect);
    });
    svg.appendChild(hitLayer);
  }

  function drawTonnageChart(points) {
    const svg = document.getElementById("ktb-tonnage-chart");
    svg.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + TON_CHART_H);
    if (!points.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", TON_CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = tt("noDataChart");
      svg.appendChild(t);
      return;
    }
    const xStep = points.length > 1 ? (CHART_W - PADL - PADR) / (points.length - 1) : 0;
    const xScale = i => points.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const maxTon = Math.max(...points.map(p => p.ton), 1);
    const yScale = v => TON_CHART_H - TON_PADB - (v / maxTon) * (TON_CHART_H - TON_PADB - TON_PADT);

    [0, maxTon].forEach(val => {
      const y = yScale(val);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      t.textContent = fmtTon(val);
      svg.appendChild(t);
    });

    const minLabelGap = 56;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    points.forEach((p, i) => {
      const isLast = i === points.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && points.length > 1 && (points.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((points.length - 1) / tickEvery) * tickEvery;
        if ((points.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", TON_CHART_H - 5);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateShort(p.date);
      svg.appendChild(t);
    });

    const barW = Math.max(2, Math.min(xStep * 0.6, 14));
    const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    points.forEach((p, i) => {
      const x = xScale(i);
      const y = yScale(p.ton);
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x - barW / 2); rect.setAttribute("y", y);
      rect.setAttribute("width", barW); rect.setAttribute("height", Math.max(0, (TON_CHART_H - TON_PADB) - y));
      rect.setAttribute("fill", LINE_COLOR); rect.setAttribute("opacity", "0.55"); rect.setAttribute("rx", "1.5");
      svg.appendChild(rect);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      hit.setAttribute("x", x - hitW / 2); hit.setAttribute("y", TON_PADT);
      hit.setAttribute("width", hitW); hit.setAttribute("height", TON_CHART_H - TON_PADB - TON_PADT);
      hit.setAttribute("fill", "transparent"); hit.style.cursor = "pointer";
      hit.tabIndex = 0;
      const showFn = evt => {
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateFull(p.date);
        wrap.appendChild(ttl);
        const row = document.createElement("div"); row.className = "row";
        const v = document.createElement("span"); v.className = "val"; v.textContent = fmtTon(p.ton);
        row.appendChild(v);
        wrap.appendChild(row);
        showTooltip(evt, wrap);
      };
      hit.addEventListener("pointermove", showFn);
      hit.addEventListener("focus", showFn);
      hit.addEventListener("pointerleave", hideTooltip);
      hit.addEventListener("blur", hideTooltip);
      hitLayer.appendChild(hit);
    });
    svg.appendChild(hitLayer);
  }

  function renderKpis(rows, series) {
    const el = document.getElementById("ktb-kpi-row");
    el.textContent = "";
    const tiles = [
      [tt("kpiAvgPrice"), fmtPriceTon(overallWeightedAvg(rows))],
      [tt("kpiLastPrice"), series.length ? fmtPriceTon(series[series.length - 1].price) : "—"],
      [tt("kpiTotalVolume"), fmtTon(rows.reduce((s, r) => s + (r.miktar || 0) / 1000, 0))],
      [tt("kpiTotalCount"), String(rows.reduce((s, r) => s + (r.islem_sayisi || 0), 0))],
    ];
    tiles.forEach(([label, value]) => {
      const tile = document.createElement("div");
      tile.className = "stat-tile";
      const l = document.createElement("div"); l.className = "label"; l.textContent = label;
      const v = document.createElement("div"); v.className = "value num"; v.textContent = value;
      tile.appendChild(l); tile.appendChild(v);
      el.appendChild(tile);
    });
  }

  function renderTable(rows) {
    const thead = document.getElementById("ktb-thead");
    const tbody = document.getElementById("ktb-tbody");
    const foot = document.getElementById("ktb-table-foot");
    thead.textContent = ""; tbody.textContent = ""; foot.textContent = "";
    const cols = [tt("thDate"), tt("thClass"), tt("thMin"), tt("thMax"), tt("thAvg"), tt("thQty"), tt("thCount")];
    cols.forEach(c => { const th = document.createElement("th"); th.textContent = c; thead.appendChild(th); });

    const sorted = [...rows].sort((a, b) => b.trade_date.localeCompare(a.trade_date) || (a.sinif_adi || "").localeCompare(b.sinif_adi || "", "tr"));
    const info = paginateRows(sorted, tablePage, rowLimit);
    tablePage = info.page;
    info.slice.forEach(r => {
      const tr = document.createElement("tr");
      const cells = [
        fmtDateFull(r.trade_date), r.sinif_adi || "—",
        fmtPriceTon(r.min_fiyat != null ? r.min_fiyat * 1000 : null),
        fmtPriceTon(r.max_fiyat != null ? r.max_fiyat * 1000 : null),
        fmtPriceTon(r.ort_fiyat != null ? r.ort_fiyat * 1000 : null),
        fmtTon((r.miktar || 0) / 1000), String(r.islem_sayisi ?? "—"),
      ];
      cells.forEach(c => { const td = document.createElement("td"); td.textContent = c; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    updatePagerUI("ktb", info);
  }

  function exportKtbCsv(rows) {
    const cols = ["trade_date", "grup_kodu", "grup_adi", "sinif_adi", "min_fiyat", "ort_fiyat", "max_fiyat", "miktar", "islem_sayisi"];
    const esc = v => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.join(";")].concat(rows.map(r => cols.map(c => esc(r[c])).join(";")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ktb-bulten-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function renderAll() {
    tablePage = 0; // filtre değişince sayfa 1'e dönülür — eski sayfa artık anlamsız
    const rows = currentRows();
    const series = dailyWeightedSeries(rows);
    document.getElementById("ktb-chart-title").textContent = tt("chartTitlePrefix") + " — " + translateProduct(state.product || "");
    renderPriceLegend();
    drawPriceChart(series);
    drawTonnageChart(series);
    renderKpis(rows, series);
    renderTable(rows);
  }

  function buildDateControls() {
    const startInput = document.getElementById("ktb-date-start");
    const endInput = document.getElementById("ktb-date-end");
    if (!allRows.length) return;
    const allDates = allRows.map(r => r.trade_date).sort();
    const minDate = allDates[0], maxDate = allDates[allDates.length - 1];
    startInput.min = minDate; startInput.max = maxDate;
    endInput.min = minDate; endInput.max = maxDate;
    startInput.value = minDate; endInput.value = maxDate;

    function setActivePreset(btn) {
      document.querySelectorAll("#ktb-period-presets .seg").forEach(b => b.classList.toggle("active", b === btn));
    }

    function applyPreset(preset) {
      if (preset === "all") {
        state.dateStart = null; state.dateEnd = null;
        startInput.value = minDate; endInput.value = maxDate;
      } else {
        const end = new Date(maxDate + "T00:00:00");
        const start = new Date(end);
        start.setDate(start.getDate() - Number(preset) + 1);
        const startIso = start.toISOString().slice(0, 10);
        state.dateStart = startIso < minDate ? minDate : startIso;
        state.dateEnd = maxDate;
        startInput.value = state.dateStart; endInput.value = state.dateEnd;
      }
      renderAll();
    }

    document.querySelectorAll("#ktb-period-presets .seg").forEach(btn => {
      btn.addEventListener("click", () => { setActivePreset(btn); applyPreset(btn.dataset.preset); });
    });
    startInput.addEventListener("change", () => {
      state.dateStart = startInput.value || null;
      setActivePreset(null);
      renderAll();
    });
    endInput.addEventListener("change", () => {
      state.dateEnd = endInput.value || null;
      setActivePreset(null);
      renderAll();
    });

    setActivePreset(document.querySelector('#ktb-period-presets .seg[data-preset="90"]'));
    applyPreset("90");
  }

  function buildProductControls() {
    const wrap = document.getElementById("ktb-product");
    wrap.textContent = "";
    const products = [...new Set(allRows.map(r => r.grup_adi))].sort((a, b) => a.localeCompare(b, "tr"));
    if (!state.product || !products.includes(state.product)) {
      state.product = products.includes(DEFAULT_PRODUCT) ? DEFAULT_PRODUCT : (products[0] || null);
    }
    products.forEach(p => {
      const btn = document.createElement("button");
      btn.className = "chip" + (p === state.product ? " active" : "");
      btn.type = "button"; btn.textContent = translateProduct(p);
      btn.addEventListener("click", () => {
        state.product = p;
        wrap.querySelectorAll(".chip").forEach(b => b.classList.toggle("active", b === btn));
        buildDateControls();
        renderAll();
      });
      wrap.appendChild(btn);
    });
  }

  function updateAsofBadge() {
    const badge = document.getElementById("ktb-asof-badge");
    badge.textContent = allRows.length
      ? tt("asofPrefix") + fmtDateFull(allRows.reduce((max, r) => (r.trade_date > max ? r.trade_date : max), allRows[0].trade_date))
      : tt("asofNoData");
  }

  // Dil değişince sabit arayüz metinlerinin tamamı yeniden yazılır + ürün
  // çipleri/grafik/tablo (ürün grubu adları ve rozet dahil) yeniden render
  // edilir — state.product/filtreler Türkçe ham değerde kalır, sadece
  // GÖRÜNÜM çevriliyor.
  function applyLanguage(newLang) {
    lang = newLang;
    // Sayfanın kökü <html lang="tr">: CSS text-transform:uppercase (filtre
    // etiketleri, tablo başlıkları) bunu kullanıp İngilizce/Rusça metni bile
    // Türkçe büyük harf kurallarıyla çeviriyor ("HIGHEST" -> "HİGHEST" gibi,
    // noktalı İ) — KTB bölümünün kendi lang attribute'unu geçersiz kılmak bu
    // alt ağaçta doğru (locale'e uygun) büyütmeyi geri getiriyor.
    document.getElementById("ktb-section").setAttribute("lang", lang);
    document.getElementById("ktb-banner-strong").textContent = tt("bannerStrong");
    document.getElementById("ktb-banner-body").textContent = tt("bannerBody");
    document.getElementById("ktb-label-product").textContent = tt("productGroupLabel");
    document.getElementById("ktb-label-daterange").textContent = tt("dateRangeLabel");
    document.getElementById("ktb-label-quickselect").textContent = tt("quickSelectLabel");
    document.querySelector('#ktb-period-presets .seg[data-preset="30"]').textContent = tt("preset30");
    document.querySelector('#ktb-period-presets .seg[data-preset="90"]').textContent = tt("preset90");
    document.querySelector('#ktb-period-presets .seg[data-preset="all"]').textContent = tt("presetAll");
    document.getElementById("ktb-tonnage-title").textContent = tt("tonnageChartTitle");
    document.getElementById("ktb-table-title").textContent = tt("tableTitle");
    document.getElementById("ktb-export-btn").textContent = tt("exportBtn");
    document.getElementById("ktb-page-prev").title = tt("prevPageTitle");
    document.getElementById("ktb-page-next").title = tt("nextPageTitle");
    updateAsofBadge();
    if (allRows.length) {
      buildProductControls();
      renderAll();
    }
  }

  window.__registerI18nPanel(applyLanguage);

  let loaded = false;
  window.__ktbTab = {
    onActivate() {
      if (loaded) return;
      loaded = true;
      fetchKtbRows()
        .then(rows => {
          window.__updateStatusFromCache("ktb");
          allRows = rows;
          updateAsofBadge();
          buildProductControls();
          buildDateControls();
          renderAll();
        })
        .catch(err => {
          console.error(err);
          document.getElementById("ktb-asof-badge").textContent = tt("asofError");
        });
    },
  };

  document.getElementById("ktb-row-limit").querySelectorAll(".seg").forEach(btn => {
    btn.addEventListener("click", () => {
      rowLimit = Number(btn.dataset.limit);
      tablePage = 0;
      document.getElementById("ktb-row-limit").querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
      renderTable(currentRows());
    });
  });
  document.getElementById("ktb-page-prev").addEventListener("click", () => {
    tablePage -= 1;
    renderTable(currentRows());
  });
  document.getElementById("ktb-page-next").addEventListener("click", () => {
    tablePage += 1;
    renderTable(currentRows());
  });

  document.getElementById("ktb-export-btn").addEventListener("click", () => {
    const rows = currentRows();
    if (!rows.length) return;
    exportKtbCsv(rows);
  });
})();

// ---------------------------------------------------------------------------
// ABD İhracat Satışları (USDA ESR) sekmesi — TÜİK'ten (Türkiye'nin gerçek
// gümrük verisi) ve WASDE'den (tahmin) ayrı, üçüncü bir kaynak: ABD'li
// ihracatçıların haftalık bildirdiği GERÇEK satış sözleşmeleri. Türkiye'ye
// özgü değil (ABD'nin dünya geneline sattığı), ama "Türkiye" tek tıkla
// seçilebilen bir alıcı ülke olarak bu dashboard'da öne çıkarılıyor.
(function () {
  "use strict";

  const cfg = window.TUIK_DASHBOARD_CONFIG;
  const COMMODITIES = [
    { code: 401, label: "Mısır" },
    { code: 801, label: "Soya Fasulyesi" },
    { code: 901, label: "Soya Küspesi" },
    { code: 902, label: "Soya Yağı" },
    { code: 1110, label: "Ayçiçek Yağı" },
  ];
  // USDA ESR ülke listesindeki Türkiye kodu — metinden pozisyonel olarak
  // çıkarılan bir etiket değil, API'nin kendi kararlı sayısal kimliği
  // (GTİP kodu gibi), bu yüzden burada sabit tutmak güvenli.
  const TURKEY_COUNTRY_CODE = 4890;
  const UNKNOWN_COUNTRY_CODE = 9990;
  const CHART_W = 640, CHART_H = 190, PADL = 64, PADR = 16, PADT = 10, PADB = 24;

  function fmtTon(v) {
    if (v == null || isNaN(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(2) + "M ton";
    if (a >= 1e3) return (v / 1e3).toFixed(1) + "K ton";
    return (Math.round(v) || 0) + " ton";
  }

  function fmtDateShort(isoDate) {
    const d = new Date(isoDate + "T00:00:00");
    return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
  }

  function fmtDateFull(isoDate) {
    const d = new Date(isoDate + "T00:00:00");
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  }

  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 dk — ESR haftada bir güncelleniyor, ~4-5 sayfalık en ağır çekim

  async function fetchEsrRows() {
    const cached = window.__supaCache.get("esr", CACHE_TTL_MS);
    if (cached) return cached;

    const headers = { apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}` };
    const pageSize = 1000;
    let rows = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${cfg.SUPABASE_URL}/rest/v1/export_sales_stats?select=week_ending,commodity_code,commodity_name_tr,marketing_year,country_code,country_name,weekly_exports_ton,accumulated_exports_ton,outstanding_sales_ton,gross_new_sales_ton,current_my_net_sales_ton,current_my_total_commitment_ton,next_my_outstanding_sales_ton,next_my_net_sales_ton&order=week_ending.asc`,
        { headers: Object.assign({}, headers, { Range: `${from}-${from + pageSize - 1}` }) }
      );
      if (!res.ok) throw new Error(`Supabase istek hatası: ${res.status}`);
      const page = await res.json();
      rows = rows.concat(page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    window.__supaCache.set("esr", rows);
    return rows;
  }

  // ---------- tooltip (diğer panellerle aynı görünüm, her panel kendi kopyasını taşır) ----------
  function makeTooltip() {
    let el = document.querySelector(".tooltip");
    if (!el) { el = document.createElement("div"); el.className = "tooltip"; document.body.appendChild(el); }
    return el;
  }
  function showTooltip(evt, node) {
    const tip = makeTooltip();
    tip.textContent = ""; tip.appendChild(node);
    tip.style.opacity = "1";
    let x = evt.clientX + 14, y = evt.clientY + 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
    const rect = tip.getBoundingClientRect();
    if (rect.right > window.innerWidth) tip.style.left = (evt.clientX - rect.width - 14) + "px";
    if (rect.bottom > window.innerHeight) tip.style.top = (evt.clientY - rect.height - 14) + "px";
  }
  function hideTooltip() { const t = document.querySelector(".tooltip"); if (t) t.style.opacity = "0"; }

  function exportEsrCsv(rows, commodityLabel, buyerLabel) {
    const cols = [
      ["week_ending", "Hafta"], ["weekly_exports_ton", "Haftalık Sevkiyat (ton)"],
      ["accumulated_exports_ton", "Toplam Sevkiyat (ton)"], ["outstanding_sales_ton", "Bekleyen Satış (ton)"],
      ["gross_new_sales_ton", "Brüt Yeni Satış (ton)"], ["current_my_net_sales_ton", "Net Satış (ton)"],
      ["current_my_total_commitment_ton", "Toplam Taahhüt (ton)"],
      ["next_my_outstanding_sales_ton", "Gelecek PY Bekleyen Satış (ton)"], ["next_my_net_sales_ton", "Gelecek PY Net Satış (ton)"],
    ];
    const esc = v => {
      const s = v == null ? "" : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.map(c => c[1]).join(";")].concat(rows.map(r => cols.map(c => esc(r[c[0]])).join(";")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ihracat-satislari-" + commodityLabel + "-" + buyerLabel + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function drawEsrChart(rows) {
    const svg = document.getElementById("esr-chart");
    const legend = document.getElementById("esr-legend");
    svg.textContent = "";
    legend.textContent = "";
    svg.setAttribute("viewBox", "0 0 " + CHART_W + " " + CHART_H);
    if (!rows.length) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL); t.setAttribute("y", CHART_H / 2); t.setAttribute("class", "axis-label");
      t.textContent = "Bu kombinasyon için veri yok.";
      svg.appendChild(t);
      return;
    }

    const series = [
      { key: "accumulated_exports_ton", label: "Toplam Sevkiyat", color: "var(--series-export)" },
      { key: "outstanding_sales_ton", label: "Bekleyen Satış", color: "var(--series-import)" },
    ];
    series.forEach(s => {
      const key = document.createElement("span"); key.className = "key";
      const sw = document.createElement("span"); sw.className = "swatch-line"; sw.style.background = s.color;
      key.appendChild(sw); key.appendChild(document.createTextNode(s.label));
      legend.appendChild(key);
    });

    const xStep = rows.length > 1 ? (CHART_W - PADL - PADR) / (rows.length - 1) : 0;
    const xScale = i => rows.length > 1 ? PADL + i * xStep : (PADL + (CHART_W - PADR)) / 2;
    const maxVal = Math.max(1, ...series.flatMap(s => rows.map(r => r[s.key] || 0)));
    const yScale = v => CHART_H - PADB - (v / maxVal) * (CHART_H - PADB - PADT);

    for (let g = 0; g <= 3; g++) {
      const y = PADT + (g * (CHART_H - PADB - PADT)) / 3;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "gridline");
      line.setAttribute("x1", PADL); line.setAttribute("x2", CHART_W - PADR);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      svg.appendChild(line);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", PADL - 8); t.setAttribute("y", y + 3);
      t.setAttribute("text-anchor", "end"); t.setAttribute("class", "axis-label");
      t.textContent = fmtTon(maxVal - (g * maxVal) / 3);
      svg.appendChild(t);
    }

    const minLabelGap = 50;
    const tickEvery = Math.max(1, Math.ceil(minLabelGap / Math.max(xStep, 1)));
    rows.forEach((r, i) => {
      const isLast = i === rows.length - 1;
      if (i % tickEvery !== 0 && !isLast) return;
      if (isLast && rows.length > 1 && (rows.length - 1) % tickEvery !== 0) {
        const prevShown = Math.floor((rows.length - 1) / tickEvery) * tickEvery;
        if ((rows.length - 1 - prevShown) * xStep < minLabelGap) return;
      }
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", xScale(i)); t.setAttribute("y", CHART_H - 6);
      t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "axis-label");
      t.textContent = fmtDateShort(r.week_ending);
      svg.appendChild(t);
    });

    const hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    hoverLine.setAttribute("class", "baseline");
    hoverLine.setAttribute("y1", PADT); hoverLine.setAttribute("y2", CHART_H - PADB);
    hoverLine.style.opacity = "0";
    svg.appendChild(hoverLine);

    series.forEach(s => {
      const pts = rows.map((r, i) => [xScale(i), yScale(r[s.key] || 0)]);
      if (pts.length === 1) {
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", pts[0][0]); dot.setAttribute("cy", pts[0][1]); dot.setAttribute("r", "4");
        dot.setAttribute("fill", s.color);
        svg.appendChild(dot);
        return;
      }
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" "));
      path.setAttribute("stroke", s.color); path.setAttribute("stroke-width", "2");
      path.setAttribute("fill", "none"); path.setAttribute("stroke-linejoin", "round"); path.setAttribute("stroke-linecap", "round");
      svg.appendChild(path);
    });

    const hitLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    rows.forEach((r, i) => {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      const hitW = Math.max(xStep, 6);
      rect.setAttribute("x", xScale(i) - hitW / 2); rect.setAttribute("y", PADT);
      rect.setAttribute("width", hitW); rect.setAttribute("height", CHART_H - PADB - PADT);
      rect.setAttribute("fill", "transparent"); rect.style.cursor = "pointer"; rect.tabIndex = 0;
      const showFn = evt => {
        hoverLine.setAttribute("x1", xScale(i)); hoverLine.setAttribute("x2", xScale(i));
        hoverLine.style.opacity = "1";
        const wrap = document.createElement("div");
        const ttl = document.createElement("div"); ttl.className = "ttl"; ttl.textContent = fmtDateFull(r.week_ending);
        wrap.appendChild(ttl);
        series.forEach(s => {
          const row = document.createElement("div"); row.className = "row";
          const kl = document.createElement("span"); kl.className = "key-line"; kl.style.background = s.color;
          const v = document.createElement("span"); v.className = "val"; v.textContent = fmtTon(r[s.key]);
          row.appendChild(kl); row.appendChild(v); row.appendChild(document.createTextNode(" " + s.label));
          wrap.appendChild(row);
        });
        showTooltip(evt, wrap);
      };
      rect.addEventListener("pointermove", showFn);
      rect.addEventListener("focus", showFn);
      rect.addEventListener("pointerleave", () => { hoverLine.style.opacity = "0"; hideTooltip(); });
      rect.addEventListener("blur", () => { hoverLine.style.opacity = "0"; hideTooltip(); });
      hitLayer.appendChild(rect);
    });
    svg.appendChild(hitLayer);
  }

  function init(allRows) {
    if (!allRows.length) {
      document.getElementById("esr-release-badge").textContent = "Henüz veri yok";
      document.getElementById("esr-table-title").textContent = "Haftalık detay — henüz veri yüklenmedi";
      return;
    }

    const latestWeek = allRows.reduce((max, r) => (r.week_ending > max ? r.week_ending : max), allRows[0].week_ending);
    document.getElementById("esr-release-badge").textContent = "Veri " + fmtDateFull(latestWeek) + " haftasına kadar güncel";

    const state = { commodity: 401, countryMode: "world", customCountry: null };
    let currentSeriesRows = [];

    function currentCommodityRows() {
      return allRows.filter(r => r.commodity_code === state.commodity);
    }

    // Dünya toplamı: aynı hafta için tüm ülkelerin satırlarını toplar.
    // UNKNOWN (USDA'nın alıcı ülkeyi bildirmediği satışlar) dahil — bu
    // ABD'nin kendi resmi toplamının bir parçası, dışarıda bırakmak
    // "toplam sevkiyat" rakamını gerçek resmi toplamdan düşük gösterirdi.
    function aggregateByWeek(rows) {
      const map = new Map();
      const keys = [
        "weekly_exports_ton", "accumulated_exports_ton", "outstanding_sales_ton", "gross_new_sales_ton",
        "current_my_net_sales_ton", "current_my_total_commitment_ton", "next_my_outstanding_sales_ton", "next_my_net_sales_ton",
      ];
      rows.forEach(r => {
        let cur = map.get(r.week_ending);
        if (!cur) { cur = { week_ending: r.week_ending }; keys.forEach(k => { cur[k] = 0; }); map.set(r.week_ending, cur); }
        keys.forEach(k => { cur[k] += r[k] || 0; });
      });
      return [...map.values()].sort((a, b) => a.week_ending.localeCompare(b.week_ending));
    }

    function currentSeries() {
      const rows = currentCommodityRows();
      if (state.countryMode === "turkey") {
        return { rows: rows.filter(r => r.country_code === TURKEY_COUNTRY_CODE).sort((a, b) => a.week_ending.localeCompare(b.week_ending)), label: "Türkiye" };
      }
      if (state.countryMode === "custom" && state.customCountry) {
        return { rows: rows.filter(r => r.country_code === state.customCountry.code).sort((a, b) => a.week_ending.localeCompare(b.week_ending)), label: state.customCountry.name };
      }
      return { rows: aggregateByWeek(rows), label: "Dünya Toplamı" };
    }

    function topBuyers(rows) {
      const latestByCountry = new Map();
      rows.forEach(r => {
        if (r.country_code === UNKNOWN_COUNTRY_CODE) return;
        const cur = latestByCountry.get(r.country_code);
        if (!cur || r.week_ending > cur.week_ending) latestByCountry.set(r.country_code, r);
      });
      return [...latestByCountry.values()].sort((a, b) => b.accumulated_exports_ton - a.accumulated_exports_ton).slice(0, 8);
    }

    function buildCommodityControls() {
      const wrap = document.getElementById("esr-commodity");
      wrap.textContent = "";
      COMMODITIES.forEach(c => {
        const btn = document.createElement("button");
        btn.className = "seg" + (state.commodity === c.code ? " active" : "");
        btn.type = "button";
        btn.textContent = c.label;
        btn.addEventListener("click", () => {
          state.commodity = c.code;
          wrap.querySelectorAll(".seg").forEach(b => b.classList.toggle("active", b === btn));
          renderAll();
        });
        wrap.appendChild(btn);
      });
    }

    function setCountryMode(mode, custom) {
      state.countryMode = mode;
      state.customCountry = custom || null;
      document.querySelectorAll("#esr-country-mode .seg").forEach(b => b.classList.toggle("active", mode !== "custom" && b.dataset.value === mode));
      renderAll();
    }

    function buildCountryModeControls() {
      document.querySelectorAll("#esr-country-mode .seg").forEach(btn => {
        btn.addEventListener("click", () => setCountryMode(btn.dataset.value));
      });
    }

    function buildCountrySearch() {
      const input = document.getElementById("esr-country-search");
      const box = document.getElementById("esr-country-suggestions");
      function closeBox() { box.classList.remove("open"); box.textContent = ""; }
      function renderSuggestions() {
        const q = input.value.trim().toLowerCase();
        if (!q) { closeBox(); return; }
        const names = new Map();
        currentCommodityRows().forEach(r => {
          if (r.country_code !== UNKNOWN_COUNTRY_CODE && !names.has(r.country_code)) names.set(r.country_code, r.country_name);
        });
        const matches = [...names.entries()].filter(([, name]) => name.toLowerCase().includes(q)).slice(0, 8);
        box.textContent = "";
        if (!matches.length) {
          const empty = document.createElement("div"); empty.className = "empty"; empty.textContent = "Sonuç yok";
          box.appendChild(empty);
        } else {
          matches.forEach(([code, name]) => {
            const btn = document.createElement("button");
            btn.type = "button"; btn.textContent = name;
            btn.addEventListener("mousedown", evt => { evt.preventDefault(); input.value = ""; closeBox(); setCountryMode("custom", { code, name }); });
            box.appendChild(btn);
          });
        }
        box.classList.add("open");
      }
      input.addEventListener("input", renderSuggestions);
      input.addEventListener("focus", () => { if (input.value.trim()) renderSuggestions(); });
      input.addEventListener("blur", () => setTimeout(closeBox, 120));
    }

    function renderTopBuyers() {
      const wrap = document.getElementById("esr-top-buyers");
      wrap.textContent = "";
      topBuyers(currentCommodityRows()).forEach(b => {
        const chip = document.createElement("button");
        chip.type = "button";
        const isActive = state.countryMode === "custom" && state.customCountry && state.customCountry.code === b.country_code;
        chip.className = "chip" + (isActive ? " active" : "");
        chip.textContent = b.country_name;
        chip.addEventListener("click", () => setCountryMode("custom", { code: b.country_code, name: b.country_name }));
        wrap.appendChild(chip);
      });
    }

    function renderKpis(series) {
      const wrap = document.getElementById("esr-kpi-row");
      wrap.textContent = "";
      const last = series.rows[series.rows.length - 1];
      if (!last) {
        const p = document.createElement("p"); p.style.color = "var(--text-muted)"; p.style.fontSize = "13px";
        p.textContent = "Bu kombinasyon için veri yok.";
        wrap.appendChild(p);
        return;
      }
      [
        ["Toplam Sevkiyat (PY başından)", last.accumulated_exports_ton],
        ["Bekleyen Satış (Sevk Edilmemiş)", last.outstanding_sales_ton],
        ["Bu Hafta Net Satış", last.current_my_net_sales_ton],
        ["Toplam Taahhüt", last.current_my_total_commitment_ton],
        ["Gelecek PY Bekleyen Satış", last.next_my_outstanding_sales_ton],
      ].forEach(([label, value]) => {
        const tile = document.createElement("div"); tile.className = "stat-tile";
        const l = document.createElement("div"); l.className = "label"; l.textContent = label;
        const v = document.createElement("div"); v.className = "value num"; v.textContent = fmtTon(value);
        tile.appendChild(l); tile.appendChild(v);
        wrap.appendChild(tile);
      });
    }

    function renderTable(rows) {
      const thead = document.getElementById("esr-thead");
      const tbody = document.getElementById("esr-tbody");
      thead.textContent = ""; tbody.textContent = "";
      const cols = [
        ["Hafta", r => fmtDateFull(r.week_ending), false],
        ["Haftalık Sevkiyat", r => fmtTon(r.weekly_exports_ton), true],
        ["Toplam Sevkiyat", r => fmtTon(r.accumulated_exports_ton), true],
        ["Bekleyen Satış", r => fmtTon(r.outstanding_sales_ton), true],
        ["Net Satış", r => fmtTon(r.current_my_net_sales_ton), true],
        ["Toplam Taahhüt", r => fmtTon(r.current_my_total_commitment_ton), true],
      ];
      cols.forEach(([label, , isNum]) => {
        const th = document.createElement("th"); th.textContent = label;
        if (isNum) th.classList.add("num-col");
        thead.appendChild(th);
      });
      if (!rows.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td"); td.colSpan = cols.length; td.textContent = "Bu kombinasyon için veri yok.";
        tr.appendChild(td); tbody.appendChild(tr);
        return;
      }
      [...rows].reverse().forEach(r => {
        const tr = document.createElement("tr");
        cols.forEach(([, get, isNum]) => {
          const td = document.createElement("td");
          if (isNum) td.classList.add("num-col", "num");
          td.textContent = get(r);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    function renderAll() {
      const series = currentSeries();
      currentSeriesRows = series.rows;
      const commodityLabel = COMMODITIES.find(c => c.code === state.commodity).label;
      document.getElementById("esr-chart-title").textContent = "Haftalık eğilim — " + commodityLabel + " · " + series.label;
      document.getElementById("esr-table-title").textContent = "Haftalık detay — " + commodityLabel + " · " + series.label;
      renderKpis(series);
      drawEsrChart(series.rows);
      renderTable(series.rows);
      renderTopBuyers();
    }

    document.getElementById("esr-export-btn").addEventListener("click", () => {
      if (!currentSeriesRows.length) return;
      const commodityLabel = COMMODITIES.find(c => c.code === state.commodity).label;
      const buyerLabel = state.countryMode === "turkey" ? "Turkiye" : state.countryMode === "custom" && state.customCountry ? state.customCountry.name.trim() : "Dunya";
      exportEsrCsv(currentSeriesRows, commodityLabel, buyerLabel);
    });

    buildCommodityControls();
    buildCountryModeControls();
    buildCountrySearch();
    renderAll();
  }

  let loaded = false;
  window.__tabManager.register("tab-esr", "esr-panel", () => {
    window.__updateStatusFromCache("esr");
    if (loaded) return;
    loaded = true;
    fetchEsrRows()
      .then(rows => { window.__updateStatusFromCache("esr"); init(rows); })
      .catch(err => {
        console.error(err);
        document.getElementById("esr-release-badge").textContent = "Veri çekilemedi";
        document.getElementById("esr-table-title").textContent = "Haftalık detay yüklenemedi — Supabase bağlantısını kontrol edin";
      });
  });
})();

// ---------------------------------------------------------------------------
// Tüm panel IIFE'leri yukarıda çalışıp window.__registerI18nPanel ile
// kaydoldu — şimdi (varsa) kaydedilmiş dil tercihini tek seferde yayınlıyoruz.
// Henüz veri çekmemiş paneller sadece sabit metinlerini günceller; veri
// çekmiş olanlar tam yeniden render olur.
(function () {
  let initialLang = "tr";
  try { initialLang = localStorage.getItem("tuik-dash-lang") || "tr"; } catch (e) { /* yoksay */ }
  window.__setAppLang(initialLang);
})();
