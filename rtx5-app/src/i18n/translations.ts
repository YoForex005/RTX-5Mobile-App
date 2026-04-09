/**
 * Lightweight i18n dictionary.
 *
 * Keys are stable English strings; values are translations per language code.
 * `t(key)` falls back to the English key when a translation is missing so
 * adding a new screen never crashes the UI.
 */
import type { LanguageCode } from '../state/userPreferences';

export type TranslationKey =
  // Tab labels
  | 'Quotes'
  | 'Chart'
  | 'Trade'
  | 'History'
  | 'Settings'
  // Settings sections
  | 'TRADING & ACCOUNT'
  | 'SOCIAL & ALGO'
  | 'PREFERENCES & TOOLS'
  | 'SUPPORT & HELP'
  // Settings rows
  | 'New Account'
  | 'Accounts'
  | 'Mailbox'
  | 'News'
  | 'Brokers'
  | 'Tradays'
  | 'Chat & Messages'
  | 'Traders Community'
  | 'MQL5 Algo Trading'
  | 'Theme'
  | 'OTP'
  | 'QR Scanner'
  | 'Interface'
  | 'Charts'
  | 'Journal'
  | 'Support'
  | 'Help'
  | 'English'
  | 'Language'
  | 'Select language'
  | 'Search settings'
  // Common buttons
  | 'Cancel'
  | 'Save'
  | 'Done'
  | 'OK'
  | 'Close'
  | 'Back';

export type Dictionary = Partial<Record<TranslationKey, string>>;

export const SUPPORTED_LANGUAGES: { code: LanguageCode; nativeName: string; englishName: string }[] = [
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish' },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese' },
  { code: 'fr', nativeName: 'Français', englishName: 'French' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian' },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian' },
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi' },
  { code: 'zh', nativeName: '中文', englishName: 'Chinese' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean' },
  { code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian' },
];

const en: Dictionary = {}; // English uses keys verbatim

const es: Dictionary = {
  Quotes: 'Cotizaciones', Chart: 'Gráfico', Trade: 'Operar', History: 'Historial', Settings: 'Ajustes',
  'TRADING & ACCOUNT': 'TRADING Y CUENTA', 'SOCIAL & ALGO': 'SOCIAL Y ALGO',
  'PREFERENCES & TOOLS': 'PREFERENCIAS Y HERRAMIENTAS', 'SUPPORT & HELP': 'SOPORTE Y AYUDA',
  'New Account': 'Nueva cuenta', Accounts: 'Cuentas', Mailbox: 'Buzón', News: 'Noticias',
  Brokers: 'Brókers', Tradays: 'Tradays', 'Chat & Messages': 'Chat y mensajes',
  'Traders Community': 'Comunidad de traders', 'MQL5 Algo Trading': 'MQL5 Algo Trading',
  Theme: 'Tema', OTP: 'OTP', 'QR Scanner': 'Escáner QR', Interface: 'Interfaz',
  Charts: 'Gráficos', Journal: 'Diario', Support: 'Soporte', Help: 'Ayuda',
  English: 'Inglés', Language: 'Idioma', 'Select language': 'Seleccionar idioma',
  'Search settings': 'Buscar ajustes', Cancel: 'Cancelar', Save: 'Guardar', Done: 'Listo',
  OK: 'OK', Close: 'Cerrar', Back: 'Atrás',
};

const pt: Dictionary = {
  Quotes: 'Cotações', Chart: 'Gráfico', Trade: 'Negociar', History: 'Histórico', Settings: 'Configurações',
  'TRADING & ACCOUNT': 'NEGOCIAÇÃO E CONTA', 'SOCIAL & ALGO': 'SOCIAL E ALGO',
  'PREFERENCES & TOOLS': 'PREFERÊNCIAS E FERRAMENTAS', 'SUPPORT & HELP': 'SUPORTE E AJUDA',
  'New Account': 'Nova conta', Accounts: 'Contas', Mailbox: 'Caixa de entrada', News: 'Notícias',
  Brokers: 'Corretoras', Tradays: 'Tradays', 'Chat & Messages': 'Bate-papo e mensagens',
  'Traders Community': 'Comunidade de traders', 'MQL5 Algo Trading': 'MQL5 Algo Trading',
  Theme: 'Tema', OTP: 'OTP', 'QR Scanner': 'Leitor QR', Interface: 'Interface',
  Charts: 'Gráficos', Journal: 'Diário', Support: 'Suporte', Help: 'Ajuda',
  English: 'Inglês', Language: 'Idioma', 'Select language': 'Selecionar idioma',
  'Search settings': 'Pesquisar configurações', Cancel: 'Cancelar', Save: 'Salvar',
  Done: 'Concluído', OK: 'OK', Close: 'Fechar', Back: 'Voltar',
};

const fr: Dictionary = {
  Quotes: 'Cotations', Chart: 'Graphique', Trade: 'Trader', History: 'Historique', Settings: 'Paramètres',
  'TRADING & ACCOUNT': 'TRADING ET COMPTE', 'SOCIAL & ALGO': 'SOCIAL ET ALGO',
  'PREFERENCES & TOOLS': 'PRÉFÉRENCES ET OUTILS', 'SUPPORT & HELP': 'ASSISTANCE ET AIDE',
  'New Account': 'Nouveau compte', Accounts: 'Comptes', Mailbox: 'Boîte de réception',
  News: 'Actualités', Brokers: 'Courtiers', Tradays: 'Tradays', 'Chat & Messages': 'Chat et messages',
  'Traders Community': 'Communauté des traders', 'MQL5 Algo Trading': 'MQL5 Algo Trading',
  Theme: 'Thème', OTP: 'OTP', 'QR Scanner': 'Scanner QR', Interface: 'Interface',
  Charts: 'Graphiques', Journal: 'Journal', Support: 'Support', Help: 'Aide',
  English: 'Anglais', Language: 'Langue', 'Select language': 'Choisir la langue',
  'Search settings': 'Rechercher dans les paramètres', Cancel: 'Annuler', Save: 'Enregistrer',
  Done: 'Terminé', OK: 'OK', Close: 'Fermer', Back: 'Retour',
};

const de: Dictionary = {
  Quotes: 'Kurse', Chart: 'Chart', Trade: 'Handeln', History: 'Verlauf', Settings: 'Einstellungen',
  'TRADING & ACCOUNT': 'HANDEL UND KONTO', 'SOCIAL & ALGO': 'SOCIAL UND ALGO',
  'PREFERENCES & TOOLS': 'EINSTELLUNGEN UND TOOLS', 'SUPPORT & HELP': 'SUPPORT UND HILFE',
  'New Account': 'Neues Konto', Accounts: 'Konten', Mailbox: 'Postfach', News: 'Nachrichten',
  Brokers: 'Broker', Tradays: 'Tradays', 'Chat & Messages': 'Chat & Nachrichten',
  'Traders Community': 'Trader-Community', 'MQL5 Algo Trading': 'MQL5 Algo Trading',
  Theme: 'Thema', OTP: 'OTP', 'QR Scanner': 'QR-Scanner', Interface: 'Oberfläche',
  Charts: 'Charts', Journal: 'Journal', Support: 'Support', Help: 'Hilfe',
  English: 'Englisch', Language: 'Sprache', 'Select language': 'Sprache wählen',
  'Search settings': 'Einstellungen suchen', Cancel: 'Abbrechen', Save: 'Speichern',
  Done: 'Fertig', OK: 'OK', Close: 'Schließen', Back: 'Zurück',
};

const it: Dictionary = {
  Quotes: 'Quotazioni', Chart: 'Grafico', Trade: 'Opera', History: 'Cronologia', Settings: 'Impostazioni',
  'TRADING & ACCOUNT': 'TRADING E ACCOUNT', 'SOCIAL & ALGO': 'SOCIAL E ALGO',
  'PREFERENCES & TOOLS': 'PREFERENZE E STRUMENTI', 'SUPPORT & HELP': 'SUPPORTO E AIUTO',
  'New Account': 'Nuovo account', Accounts: 'Account', Mailbox: 'Posta', News: 'Notizie',
  Brokers: 'Broker', Tradays: 'Tradays', 'Chat & Messages': 'Chat e messaggi',
  'Traders Community': 'Comunità di trader', 'MQL5 Algo Trading': 'MQL5 Algo Trading',
  Theme: 'Tema', OTP: 'OTP', 'QR Scanner': 'Scanner QR', Interface: 'Interfaccia',
  Charts: 'Grafici', Journal: 'Diario', Support: 'Supporto', Help: 'Aiuto',
  English: 'Inglese', Language: 'Lingua', 'Select language': 'Seleziona lingua',
  'Search settings': 'Cerca impostazioni', Cancel: 'Annulla', Save: 'Salva',
  Done: 'Fatto', OK: 'OK', Close: 'Chiudi', Back: 'Indietro',
};

const ru: Dictionary = {
  Quotes: 'Котировки', Chart: 'График', Trade: 'Торговля', History: 'История', Settings: 'Настройки',
  'TRADING & ACCOUNT': 'ТОРГОВЛЯ И СЧЁТ', 'SOCIAL & ALGO': 'СОЦИАЛЬНОЕ И АЛГО',
  'PREFERENCES & TOOLS': 'НАСТРОЙКИ И ИНСТРУМЕНТЫ', 'SUPPORT & HELP': 'ПОДДЕРЖКА И ПОМОЩЬ',
  'New Account': 'Новый счёт', Accounts: 'Счета', Mailbox: 'Почта', News: 'Новости',
  Brokers: 'Брокеры', Tradays: 'Tradays', 'Chat & Messages': 'Чат и сообщения',
  'Traders Community': 'Сообщество трейдеров', 'MQL5 Algo Trading': 'MQL5 Algo Trading',
  Theme: 'Тема', OTP: 'OTP', 'QR Scanner': 'QR-сканер', Interface: 'Интерфейс',
  Charts: 'Графики', Journal: 'Журнал', Support: 'Поддержка', Help: 'Помощь',
  English: 'Английский', Language: 'Язык', 'Select language': 'Выбрать язык',
  'Search settings': 'Поиск настроек', Cancel: 'Отмена', Save: 'Сохранить',
  Done: 'Готово', OK: 'OK', Close: 'Закрыть', Back: 'Назад',
};

const tr: Dictionary = {
  Quotes: 'Fiyatlar', Chart: 'Grafik', Trade: 'İşlem', History: 'Geçmiş', Settings: 'Ayarlar',
  'TRADING & ACCOUNT': 'İŞLEM VE HESAP', 'SOCIAL & ALGO': 'SOSYAL VE ALGO',
  'PREFERENCES & TOOLS': 'TERCİHLER VE ARAÇLAR', 'SUPPORT & HELP': 'DESTEK VE YARDIM',
  'New Account': 'Yeni hesap', Accounts: 'Hesaplar', Mailbox: 'Posta kutusu', News: 'Haberler',
  Brokers: 'Aracılar', Tradays: 'Tradays', 'Chat & Messages': 'Sohbet ve mesajlar',
  'Traders Community': 'Trader topluluğu', 'MQL5 Algo Trading': 'MQL5 Algo Trading',
  Theme: 'Tema', OTP: 'OTP', 'QR Scanner': 'QR Tarayıcı', Interface: 'Arayüz',
  Charts: 'Grafikler', Journal: 'Günlük', Support: 'Destek', Help: 'Yardım',
  English: 'İngilizce', Language: 'Dil', 'Select language': 'Dil seç',
  'Search settings': 'Ayarlarda ara', Cancel: 'İptal', Save: 'Kaydet', Done: 'Tamam',
  OK: 'TAMAM', Close: 'Kapat', Back: 'Geri',
};

const ar: Dictionary = {
  Quotes: 'الأسعار', Chart: 'الرسم البياني', Trade: 'تداول', History: 'السجل', Settings: 'الإعدادات',
  'TRADING & ACCOUNT': 'التداول والحساب', 'SOCIAL & ALGO': 'اجتماعي وتداول آلي',
  'PREFERENCES & TOOLS': 'التفضيلات والأدوات', 'SUPPORT & HELP': 'الدعم والمساعدة',
  'New Account': 'حساب جديد', Accounts: 'الحسابات', Mailbox: 'صندوق الوارد', News: 'الأخبار',
  Brokers: 'الوسطاء', Tradays: 'تراديز', 'Chat & Messages': 'الدردشة والرسائل',
  'Traders Community': 'مجتمع المتداولين', 'MQL5 Algo Trading': 'MQL5 للتداول الآلي',
  Theme: 'المظهر', OTP: 'كلمة المرور لمرة واحدة', 'QR Scanner': 'ماسح QR', Interface: 'الواجهة',
  Charts: 'الرسوم البيانية', Journal: 'السجل', Support: 'الدعم', Help: 'المساعدة',
  English: 'الإنجليزية', Language: 'اللغة', 'Select language': 'اختر اللغة',
  'Search settings': 'بحث في الإعدادات', Cancel: 'إلغاء', Save: 'حفظ', Done: 'تم',
  OK: 'موافق', Close: 'إغلاق', Back: 'رجوع',
};

const hi: Dictionary = {
  Quotes: 'भाव', Chart: 'चार्ट', Trade: 'ट्रेड', History: 'इतिहास', Settings: 'सेटिंग्स',
  'TRADING & ACCOUNT': 'ट्रेडिंग और खाता', 'SOCIAL & ALGO': 'सोशल और एल्गो',
  'PREFERENCES & TOOLS': 'प्राथमिकताएँ और उपकरण', 'SUPPORT & HELP': 'सहायता और मदद',
  'New Account': 'नया खाता', Accounts: 'खाते', Mailbox: 'मेलबॉक्स', News: 'समाचार',
  Brokers: 'ब्रोकर', Tradays: 'Tradays', 'Chat & Messages': 'चैट और संदेश',
  'Traders Community': 'ट्रेडर्स समुदाय', 'MQL5 Algo Trading': 'MQL5 एल्गो ट्रेडिंग',
  Theme: 'थीम', OTP: 'OTP', 'QR Scanner': 'QR स्कैनर', Interface: 'इंटरफ़ेस',
  Charts: 'चार्ट', Journal: 'जर्नल', Support: 'सहायता', Help: 'मदद',
  English: 'अंग्रेज़ी', Language: 'भाषा', 'Select language': 'भाषा चुनें',
  'Search settings': 'सेटिंग्स खोजें', Cancel: 'रद्द करें', Save: 'सहेजें',
  Done: 'पूर्ण', OK: 'ठीक है', Close: 'बंद करें', Back: 'वापस',
};

const zh: Dictionary = {
  Quotes: '行情', Chart: '图表', Trade: '交易', History: '历史', Settings: '设置',
  'TRADING & ACCOUNT': '交易与账户', 'SOCIAL & ALGO': '社交与算法',
  'PREFERENCES & TOOLS': '偏好与工具', 'SUPPORT & HELP': '支持与帮助',
  'New Account': '新建账户', Accounts: '账户', Mailbox: '邮箱', News: '新闻',
  Brokers: '经纪商', Tradays: 'Tradays', 'Chat & Messages': '聊天与消息',
  'Traders Community': '交易者社区', 'MQL5 Algo Trading': 'MQL5 算法交易',
  Theme: '主题', OTP: '一次性密码', 'QR Scanner': '二维码扫描', Interface: '界面',
  Charts: '图表', Journal: '日志', Support: '支持', Help: '帮助',
  English: '英语', Language: '语言', 'Select language': '选择语言',
  'Search settings': '搜索设置', Cancel: '取消', Save: '保存', Done: '完成',
  OK: '确定', Close: '关闭', Back: '返回',
};

const ja: Dictionary = {
  Quotes: 'レート', Chart: 'チャート', Trade: 'トレード', History: '履歴', Settings: '設定',
  'TRADING & ACCOUNT': 'トレードとアカウント', 'SOCIAL & ALGO': 'ソーシャルとアルゴ',
  'PREFERENCES & TOOLS': '設定とツール', 'SUPPORT & HELP': 'サポートとヘルプ',
  'New Account': '新しい口座', Accounts: '口座', Mailbox: 'メールボックス', News: 'ニュース',
  Brokers: 'ブローカー', Tradays: 'Tradays', 'Chat & Messages': 'チャットとメッセージ',
  'Traders Community': 'トレーダーコミュニティ', 'MQL5 Algo Trading': 'MQL5 アルゴトレード',
  Theme: 'テーマ', OTP: 'OTP', 'QR Scanner': 'QR スキャナー', Interface: 'インターフェース',
  Charts: 'チャート', Journal: 'ジャーナル', Support: 'サポート', Help: 'ヘルプ',
  English: '英語', Language: '言語', 'Select language': '言語を選択',
  'Search settings': '設定を検索', Cancel: 'キャンセル', Save: '保存', Done: '完了',
  OK: 'OK', Close: '閉じる', Back: '戻る',
};

const ko: Dictionary = {
  Quotes: '시세', Chart: '차트', Trade: '거래', History: '내역', Settings: '설정',
  'TRADING & ACCOUNT': '거래 및 계정', 'SOCIAL & ALGO': '소셜 및 알고',
  'PREFERENCES & TOOLS': '환경설정 및 도구', 'SUPPORT & HELP': '지원 및 도움말',
  'New Account': '새 계정', Accounts: '계정', Mailbox: '메일함', News: '뉴스',
  Brokers: '브로커', Tradays: 'Tradays', 'Chat & Messages': '채팅 및 메시지',
  'Traders Community': '트레이더 커뮤니티', 'MQL5 Algo Trading': 'MQL5 알고 트레이딩',
  Theme: '테마', OTP: 'OTP', 'QR Scanner': 'QR 스캐너', Interface: '인터페이스',
  Charts: '차트', Journal: '저널', Support: '지원', Help: '도움말',
  English: '영어', Language: '언어', 'Select language': '언어 선택',
  'Search settings': '설정 검색', Cancel: '취소', Save: '저장', Done: '완료',
  OK: '확인', Close: '닫기', Back: '뒤로',
};

const id: Dictionary = {
  Quotes: 'Kuotasi', Chart: 'Grafik', Trade: 'Trading', History: 'Riwayat', Settings: 'Pengaturan',
  'TRADING & ACCOUNT': 'TRADING DAN AKUN', 'SOCIAL & ALGO': 'SOSIAL DAN ALGO',
  'PREFERENCES & TOOLS': 'PREFERENSI DAN ALAT', 'SUPPORT & HELP': 'DUKUNGAN DAN BANTUAN',
  'New Account': 'Akun baru', Accounts: 'Akun', Mailbox: 'Kotak masuk', News: 'Berita',
  Brokers: 'Broker', Tradays: 'Tradays', 'Chat & Messages': 'Obrolan dan pesan',
  'Traders Community': 'Komunitas trader', 'MQL5 Algo Trading': 'MQL5 Algo Trading',
  Theme: 'Tema', OTP: 'OTP', 'QR Scanner': 'Pemindai QR', Interface: 'Antarmuka',
  Charts: 'Grafik', Journal: 'Jurnal', Support: 'Dukungan', Help: 'Bantuan',
  English: 'Inggris', Language: 'Bahasa', 'Select language': 'Pilih bahasa',
  'Search settings': 'Cari pengaturan', Cancel: 'Batal', Save: 'Simpan', Done: 'Selesai',
  OK: 'OK', Close: 'Tutup', Back: 'Kembali',
};

export const DICTIONARIES: Record<LanguageCode, Dictionary> = {
  en, es, pt, fr, de, it, ru, tr, ar, hi, zh, ja, ko, id,
};

export const isRTL = (lang: LanguageCode) => lang === 'ar';
