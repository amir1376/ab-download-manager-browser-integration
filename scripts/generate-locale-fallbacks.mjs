import fs from "node:fs"
import path from "node:path"
import {fileURLToPath} from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const english = JSON.parse(fs.readFileSync(path.join(root, "public/_locales/en/messages.json"), "utf8"))
const translations = {
  ar: {settings:"الإعدادات", connection_connected:"متصل", connection_not_connected:"غير متصل", cancel:"إلغاء", close:"إغلاق", choose:"اختر…", off:"إيقاف", standard:"قياسي", full:"كامل", batch_review_title:"مراجعة روابط المتصفح", media_selection_title:"اختر جودة الوسائط والمسارات"},
  cs: {settings:"Nastavení", connection_connected:"Připojeno", connection_not_connected:"Nepřipojeno", cancel:"Zrušit", close:"Zavřít", choose:"Vybrat…", off:"Vypnuto", standard:"Standardní", full:"Plný", batch_review_title:"Zkontrolovat odkazy prohlížeče", media_selection_title:"Vyberte kvalitu médií a stopy"},
  de: {settings:"Einstellungen", connection_connected:"Verbunden", connection_not_connected:"Nicht verbunden", cancel:"Abbrechen", close:"Schließen", choose:"Auswählen…", off:"Aus", standard:"Standard", full:"Voll", batch_review_title:"Browser-Links prüfen", media_selection_title:"Medienqualität und Spuren auswählen"},
  es: {settings:"Configuración", connection_connected:"Conectado", connection_not_connected:"No conectado", cancel:"Cancelar", close:"Cerrar", choose:"Elegir…", off:"Desactivado", standard:"Estándar", full:"Completo", batch_review_title:"Revisar enlaces del navegador", media_selection_title:"Elegir calidad y pistas multimedia"},
  fa: {settings:"تنظیمات", connection_connected:"متصل", connection_not_connected:"متصل نیست", cancel:"لغو", close:"بستن", choose:"انتخاب…", off:"خاموش", standard:"استاندارد", full:"کامل", batch_review_title:"بررسی پیوندهای مرورگر", media_selection_title:"انتخاب کیفیت و ترک‌های رسانه"},
  fr: {settings:"Paramètres", connection_connected:"Connecté", connection_not_connected:"Non connecté", cancel:"Annuler", close:"Fermer", choose:"Choisir…", off:"Désactivé", standard:"Standard", full:"Complet", batch_review_title:"Vérifier les liens du navigateur", media_selection_title:"Choisir la qualité et les pistes du média"},
  id: {settings:"Pengaturan", connection_connected:"Terhubung", connection_not_connected:"Tidak terhubung", cancel:"Batal", close:"Tutup", choose:"Pilih…", off:"Mati", standard:"Standar", full:"Penuh", batch_review_title:"Tinjau tautan browser", media_selection_title:"Pilih kualitas dan trek media"},
  it: {settings:"Impostazioni", connection_connected:"Connesso", connection_not_connected:"Non connesso", cancel:"Annulla", close:"Chiudi", choose:"Scegli…", off:"Disattivato", standard:"Standard", full:"Completo", batch_review_title:"Rivedi i collegamenti del browser", media_selection_title:"Scegli qualità e tracce multimediali"},
  ja: {settings:"設定", connection_connected:"接続済み", connection_not_connected:"未接続", cancel:"キャンセル", close:"閉じる", choose:"選択…", off:"オフ", standard:"標準", full:"完全", batch_review_title:"ブラウザーのリンクを確認", media_selection_title:"メディアの品質とトラックを選択"},
  ko: {settings:"설정", connection_connected:"연결됨", connection_not_connected:"연결되지 않음", cancel:"취소", close:"닫기", choose:"선택…", off:"끔", standard:"표준", full:"전체", batch_review_title:"브라우저 링크 검토", media_selection_title:"미디어 품질 및 트랙 선택"},
  pl: {settings:"Ustawienia", connection_connected:"Połączono", connection_not_connected:"Brak połączenia", cancel:"Anuluj", close:"Zamknij", choose:"Wybierz…", off:"Wyłączone", standard:"Standardowy", full:"Pełny", batch_review_title:"Przejrzyj łącza przeglądarki", media_selection_title:"Wybierz jakość i ścieżki multimediów"},
  pt_BR: {settings:"Configurações", connection_connected:"Conectado", connection_not_connected:"Não conectado", cancel:"Cancelar", close:"Fechar", choose:"Escolher…", off:"Desativado", standard:"Padrão", full:"Completo", batch_review_title:"Revisar links do navegador", media_selection_title:"Escolher qualidade e faixas de mídia"},
  ru: {settings:"Настройки", connection_connected:"Подключено", connection_not_connected:"Не подключено", cancel:"Отмена", close:"Закрыть", choose:"Выбрать…", off:"Выключено", standard:"Стандартный", full:"Полный", batch_review_title:"Проверить ссылки браузера", media_selection_title:"Выбрать качество и дорожки медиа"},
  tr: {settings:"Ayarlar", connection_connected:"Bağlandı", connection_not_connected:"Bağlı değil", cancel:"İptal", close:"Kapat", choose:"Seç…", off:"Kapalı", standard:"Standart", full:"Tam", batch_review_title:"Tarayıcı bağlantılarını incele", media_selection_title:"Medya kalitesini ve parçaları seç"},
  uk: {settings:"Налаштування", connection_connected:"Підключено", connection_not_connected:"Не підключено", cancel:"Скасувати", close:"Закрити", choose:"Вибрати…", off:"Вимкнено", standard:"Стандартний", full:"Повний", batch_review_title:"Переглянути посилання браузера", media_selection_title:"Вибрати якість і доріжки медіа"},
  zh_CN: {settings:"设置", connection_connected:"已连接", connection_not_connected:"未连接", cancel:"取消", close:"关闭", choose:"选择…", off:"关闭", standard:"标准", full:"完整", batch_review_title:"检查浏览器链接", media_selection_title:"选择媒体质量和轨道"},
}

for (const [locale, overrides] of Object.entries(translations)) {
  const catalog = structuredClone(english)
  const target = path.join(root, "public/_locales", locale, "messages.json")
  if (fs.existsSync(target)) {
    const existing = JSON.parse(fs.readFileSync(target, "utf8"))
    for (const key of Object.keys(catalog)) {
      if (typeof existing[key]?.message === "string" && existing[key].message.length > 0) {
        catalog[key] = existing[key]
      }
    }
  }
  for (const [key, message] of Object.entries(overrides)) if (catalog[key]) catalog[key].message = message
  const directory = path.join(root, "public/_locales", locale)
  fs.mkdirSync(directory, {recursive: true})
  fs.writeFileSync(target, JSON.stringify(catalog, null, 2) + "\n")
}
