/*
 INKUBIO — three languages: O‘zbekcha (uz, Latin script), Русский (ru), English (en).

 Russian is the source text. Every Russian string on the page (text, aria-label, placeholder, title, alt,
 meta content) is looked up in D and replaced with the chosen language. Scripts call I18N.t('русский текст')
 for text they create, with {placeholders}: I18N.t('Ответим с {time}', { time: '9:00' }).
 A string missing from D stays Russian, and is listed in I18N.missing (open the console to check).

 To fix a translation: find the Russian line below and edit the first (uz) or the second (en) text.
 Owner content in js/config.js can be given in three languages: { ru: '…', uz: '…', en: '…' }.

 Classic script (not a module): it runs where it stands at the end of <body>, before the modules.
*/
(function () {
  var LANGS = ['uz', 'ru', 'en'];
  var NAMES = { uz: 'O‘zbekcha', ru: 'Русский', en: 'English' };
  // round flags (shown in a circle): Uzbekistan, Russia, United Kingdom
  var FLAGS = {
    uz: '<svg viewBox="0 0 24 24"><rect width="24" height="8" fill="#0099b5"/><rect y="8" width="24" height="8" fill="#fff"/><rect y="16" width="24" height="8" fill="#1eb53a"/>' +
      '<rect y="7.6" width="24" height=".8" fill="#ce1126"/><rect y="15.6" width="24" height=".8" fill="#ce1126"/>' +
      '<circle cx="7.2" cy="4.1" r="2.6" fill="#fff"/><circle cx="8.3" cy="4.1" r="2.3" fill="#0099b5"/>' +
      '<g fill="#fff"><circle cx="12.4" cy="2.4" r=".55"/><circle cx="14.4" cy="2.4" r=".55"/><circle cx="16.4" cy="2.4" r=".55"/><circle cx="10.4" cy="4.2" r=".55"/><circle cx="12.4" cy="4.2" r=".55"/><circle cx="14.4" cy="4.2" r=".55"/><circle cx="16.4" cy="4.2" r=".55"/><circle cx="10.4" cy="6" r=".55"/><circle cx="12.4" cy="6" r=".55"/><circle cx="14.4" cy="6" r=".55"/><circle cx="16.4" cy="6" r=".55"/></g></svg>',
    ru: '<svg viewBox="0 0 24 24"><rect width="24" height="8" fill="#fff"/><rect y="8" width="24" height="8" fill="#0039a6"/><rect y="16" width="24" height="8" fill="#d52b1e"/></svg>',
    en: '<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="#012169"/><path d="M0 0 24 24M24 0 0 24" stroke="#fff" stroke-width="4.6"/><path d="M0 0 24 24M24 0 0 24" stroke="#c8102e" stroke-width="1.6"/>' +
      '<path d="M12 0v24M0 12h24" stroke="#fff" stroke-width="7"/><path d="M12 0v24M0 12h24" stroke="#c8102e" stroke-width="4"/></svg>',
  };

  /* 'русский': ['o‘zbekcha', 'english'] */
  var D = {
    /* ---------- head ---------- */
    'INKUBIO — инкубаторий': ['INKUBIO — inkubatoriya', 'INKUBIO — hatchery'],
    'Инкубаторий INKUBIO: суточные цыплята бройлеров Ross 308 и Cobb 500 с доставкой. Путь от яйца до вашего хозяйства.':
      ['INKUBIO inkubatoriyasi: Ross 308 va Cobb 500 broyler zotli bir kunlik jo‘jalar, yetkazib berish bilan. Tuxumdan xo‘jaligingizgacha bo‘lgan yo‘l.',
       'INKUBIO hatchery: day-old Ross 308 and Cobb 500 broiler chicks with delivery. The journey from egg to your farm.'],
    'Каждая большая жизнь начинается с маленького чуда. Суточные цыплята Ross 308 и Cobb 500 с доставкой.':
      ['Har bir katta hayot kichik mo‘jizadan boshlanadi. Ross 308 va Cobb 500 bir kunlik jo‘jalari, yetkazib berish bilan.',
       'Every big life begins with a small miracle. Day-old Ross 308 and Cobb 500 chicks with delivery.'],

    /* ---------- intro & header ---------- */
    'Согреваем инкубатор': ['Inkubatorni isitmoqdamiz', 'Warming up the incubator'],
    'Переворачиваем яйца': ['Tuxumlarni aylantirmoqdamiz', 'Turning the eggs'],
    'Цыплёнок стучится': ['Jo‘ja taqillatmoqda', 'The chick is knocking'],
    'Привет!': ['Salom!', 'Hello!'],
    'пи-пи!': ['chiy-chiy!', 'peep-peep!'],
    'INKUBIO — в начало': ['INKUBIO — boshiga', 'INKUBIO — back to top'],
    'Флаг Узбекистана': ['O‘zbekiston bayrog‘i', 'Flag of Uzbekistan'],
    'Узбекистан': ['O‘zbekiston', 'Uzbekistan'],
    'Звук': ['Ovoz', 'Sound'],
    'Без звука': ['Ovozsiz', 'Muted'],
    'Заказать цыплят': ['Jo‘ja buyurtma qilish', 'Order chicks'],
    'Заказать': ['Buyurtma', 'Order'],
    'Язык': ['Til', 'Language'],
    'Главы': ['Boblar', 'Chapters'],
    'Остановить фильм': ['Filmni to‘xtatish', 'Stop the film'],
    'Остановить': ['To‘xtatish', 'Stop'],

    /* chapters */
    'Чудо': ['Mo‘jiza', 'Miracle'],
    'Климат': ['Iqlim', 'Climate'],
    'Развитие': ['Rivojlanish', 'Growth'],
    'Рождение': ['Tug‘ilish', 'Birth'],
    'Знакомство': ['Tanishuv', 'Meet'],
    'Новый дом': ['Yangi uy', 'New home'],
    'О нас': ['Biz haqimizda', 'About us'],

    /* big outlined words */
    'ЧУДО': ['MO‘JIZA', 'MIRACLE'],
    'КЛИМАТ': ['IQLIM', 'CLIMATE'],
    '21 ДЕНЬ': ['21 KUN', '21 DAYS'],
    'РОЖДЕНИЕ': ['TUG‘ILISH', 'BIRTH'],
    'ПРИВЕТ': ['SALOM', 'HELLO'],
    'В ПУТЬ': ['YO‘LGA', 'ON THE WAY'],

    /* ---------- the story ---------- */
    'Партнёры': ['Hamkorlar', 'Partners'],
    'Новости': ['Yangiliklar', 'News'],
    'Новости инкубатория': ['Inkubatoriya yangiliklari', 'Hatchery news'],
    'Читать полностью': ['To‘liq o‘qish', 'Read more'],
    'Свернуть': ['Yig‘ish', 'Show less'],
    'Республика Узбекистан': ['O‘zbekiston Respublikasi', 'Republic of Uzbekistan'],
    'Министерство сельского хозяйства': ['Qishloq xo‘jaligi vazirligi', 'Ministry of Agriculture'],
    'Ассоциация птицеводов Узбекистана': ['O‘zbekiston parrandachilar uyushmasi', 'Poultry Association of Uzbekistan'],
    'Из Узбекистана': ['O‘zbekistondan', 'From Uzbekistan'],
    'Сделано в Узбекистане': ['O‘zbekistonda ishlab chiqarilgan', 'Made in Uzbekistan'],
    'Инкубаторий INKUBIO': ['INKUBIO inkubatoriyasi', 'INKUBIO hatchery'],
    'Каждая большая жизнь начинается с маленького чуда': ['Har bir katta hayot kichik mo‘jizadan boshlanadi', 'Every big life begins with a small miracle'],
    'Смотреть как фильм': ['Film kabi ko‘rish', 'Watch as a film'],
    'Сразу к заказу': ['Darhol buyurtmaga', 'Straight to ordering'],
    'Прокрутите вниз': ['Pastga aylantiring', 'Scroll down'],
    '01 · Микроклимат': ['01 · Mikroiqlim', '01 · Microclimate'],
    'Всё под контролем — каждую секунду': ['Hammasi nazoratda — har soniyada', 'Everything under control — every second'],
    'Температура': ['Harorat', 'Temperature'],
    'точность ±0,1 °C': ['aniqlik ±0,1 °C', 'accuracy ±0.1 °C'],
    'Влажность': ['Namlik', 'Humidity'],
    'диапазон 55–60 %': ['oralig‘i 55–60 %', 'range 55–60 %'],
    'Вентиляция': ['Shamollatish', 'Ventilation'],
    'Авто': ['Avto', 'Auto'],
    'O₂ и CO₂ в норме': ['O₂ va CO₂ meʼyorida', 'O₂ and CO₂ normal'],
    'Поворот яйца': ['Tuxumni aylantirish', 'Egg turning'],
    'автоматически, каждый час': ['avtomatik, har soatda', 'automatic, every hour'],
    '02 · Инкубатор': ['02 · Inkubator', '02 · Incubator'],
    '21 день тепла, покоя и заботы': ['21 kun iliqlik, osoyishtalik va g‘amxo‘rlik', '21 days of warmth, calm and care'],
    'Заглянем внутрь — туда, где под светом овоскопа видно, как растёт новая жизнь.':
      ['Ichkariga nazar tashlaymiz — ovoskop nurida yangi hayot qanday o‘sayotgani ko‘rinadi.',
       'Let’s look inside — where, under the candling light, you can see a new life growing.'],
    'День': ['Kun', 'Day'],
    'Формирование эмбриона': ['Embrion shakllanishi', 'The embryo forms'],
    'Закладываются нервная система, сердце и глаза.': ['Asab tizimi, yurak va ko‘zlar shakllana boshlaydi.', 'The nervous system, heart and eyes are laid down.'],
    'На поверхности желтка появляется зародыш. Уже на 2-й день начинает биться сердце.':
      ['Sarig‘ yuzasida murtak paydo bo‘ladi. 2-kunning o‘zidayoq yurak ura boshlaydi.',
       'An embryo appears on the surface of the yolk. By day 2 its heart is already beating.'],
    'Развитие кровеносной системы': ['Qon aylanish tizimining rivojlanishi', 'The blood vessels develop'],
    'От зародыша по желтку и оболочке расходятся сосуды — они приносят ему питание и кислород.':
      ['Murtakdan sarig‘ va parda bo‘ylab qon tomirlari tarqaladi — ular unga oziq va kislorod yetkazadi.',
       'Vessels spread from the embryo over the yolk and the membrane, bringing it food and oxygen.'],
    'Формирование клюва и лапок': ['Tumshuq va oyoqchalar shakllanishi', 'Beak and legs form'],
    'Зародыш становится похож на птенца: появляются клюв, лапки и первый пух.':
      ['Murtak polaponga o‘xshay boshlaydi: tumshuq, oyoqchalar va ilk patlar paydo bo‘ladi.',
       'The embryo starts to look like a chick: beak, legs and the first down appear.'],
    'Рост будущего цыплёнка': ['Bo‘lajak jo‘janing o‘sishi', 'The future chick grows'],
    'Цыплёнок занимает почти всё яйцо, а остаток желтка уходит к нему в животик.':
      ['Jo‘ja deyarli butun tuxumni egallaydi, sarig‘ning qolgani esa uning qorinchasiga o‘tadi.',
       'The chick fills almost the whole egg, and the rest of the yolk moves into its tummy.'],
    '03 · Чудо рождения': ['03 · Tug‘ilish mo‘jizasi', '03 · The miracle of birth'],
    'Тук-тук… Кто-то спешит на свет': ['Tiq-tiq… Kimdir dunyoga shoshilmoqda', 'Knock-knock… Someone is in a hurry to see the world'],
    'И вот начинается новая жизнь': ['Mana, yangi hayot boshlanmoqda', 'And so a new life begins'],
    '04 · Знакомство': ['04 · Tanishuv', '04 · Meet the chick'],
    'Привет, мир!': ['Salom, dunyo!', 'Hello, world!'],
    'Первые минуты жизни: любопытный взгляд, первые шаги и первое «пи-пи».':
      ['Hayotning ilk daqiqalari: qiziquvchan nigoh, ilk qadamlar va ilk «chiy-chiy».',
       'The first minutes of life: a curious look, first steps and the first “peep”.'],
    'Коснитесь цыплёнка': ['Jo‘jaga teging', 'Tap the chick'],
    'Наведите курсор — цыплёнок посмотрит на вас': ['Kursorni olib keling — jo‘ja sizga qaraydi', 'Move the cursor — the chick will look at you'],
    '05 · Новый дом': ['05 · Yangi uy', '05 · A new home'],
    'Линия обработки': ['Ishlov berish liniyasi', 'Processing line'],
    'Сортировка': ['Saralash', 'Sorting'],
    'Упаковка в коробки': ['Qutilarga qadoqlash', 'Packing into boxes'],
    'Доставка': ['Yetkazib berish', 'Delivery'],
    'проверено': ['tekshirildi', 'checked'],
    'упаковано': ['qadoqlandi', 'packed'],
    'Мы создаём начало вашего успешного птицеводства': ['Biz muvaffaqiyatli parrandachiligingiz boshlanishini yaratamiz', 'We create the start of your successful poultry farming'],
    'Класс A ·': ['A sinf ·', 'Grade A ·'],
    'Сайт': ['Sayt', 'Website'],
    '{w} г': ['{w} g', '{w} g'],

    /* contact buttons */
    'Написать нам': ['Bizga yozing', 'Write to us'],
    'Позвонить': ['Qo‘ng‘iroq qilish', 'Call'],
    'Написать в Telegram': ['Telegramda yozish', 'Message on Telegram'],
    'Написать в WhatsApp': ['WhatsAppda yozish', 'Message on WhatsApp'],
    'Связаться с нами': ['Biz bilan bog‘lanish', 'Contact us'],
    'На связи сейчас': ['Hozir aloqadamiz', 'Available now'],
    'Ответим с {time}': ['{time} dan javob beramiz', 'We’ll answer from {time}'],
    'Ответим завтра с {time}': ['Ertaga {time} dan javob beramiz', 'We’ll answer tomorrow from {time}'],
    'Ответим в {day} с {time}': ['{day} kuni {time} dan javob beramiz', 'We’ll answer on {day} from {time}'],
    'пн': ['dushanba', 'Monday'], 'вт': ['seshanba', 'Tuesday'], 'ср': ['chorshanba', 'Wednesday'], 'чт': ['payshanba', 'Thursday'],
    'пт': ['juma', 'Friday'], 'сб': ['shanba', 'Saturday'], 'вс': ['yakshanba', 'Sunday'],

    /* ---------- about ---------- */
    'Инкубаторий': ['Inkubatoriya', 'Hatchery'],
    'Полный цикл: от закладки яйца до доставки суточных цыплят в ваше хозяйство. Современные инкубаторы, ветеринарный контроль на каждом этапе и транспорт с климат-контролем.':
      ['To‘liq sikl: tuxum qo‘yishdan bir kunlik jo‘jalarni xo‘jaligingizga yetkazib berishgacha. Zamonaviy inkubatorlar, har bosqichda veterinariya nazorati va iqlim nazoratiga ega transport.',
       'The full cycle: from setting the eggs to delivering day-old chicks to your farm. Modern incubators, veterinary control at every stage and climate-controlled transport.'],
    'Для кого': ['Kimlar uchun', 'Who it’s for'],
    'Для кого мы работаем': ['Biz kimlar uchun ishlaymiz', 'Who we work for'],
    'Частные подворья': ['Tomorqa xo‘jaliklari', 'Smallholders'],
    'Для тех, кто выращивает птицу для своей семьи. Поможем выбрать кросс и подскажем, как подготовиться к приезду цыплят.':
      ['Oilasi uchun parranda boqadiganlar uchun. Kross tanlashga yordam beramiz va jo‘jalar kelishiga qanday tayyorlanishni aytib beramiz.',
       'For those who raise poultry for their family. We’ll help you choose a cross and tell you how to get ready for the chicks.'],
    'Небольшие партии': ['Kichik partiyalar', 'Small batches'],
    'Понятные советы по уходу': ['Parvarish bo‘yicha tushunarli maslahatlar', 'Clear care advice'],
    'Помощь с выбором кросса': ['Kross tanlashda yordam', 'Help choosing a cross'],
    'Обсудить заказ': ['Buyurtmani muhokama qilish', 'Discuss an order'],
    'Фермерские хозяйства': ['Fermer xo‘jaliklari', 'Farms'],
    'Для ферм, которым нужен ровный, здоровый молодняк по графику. Планируем поставки вместе с вами под ваш оборот.':
      ['Jadval bo‘yicha bir tekis, sog‘lom jo‘jalar kerak bo‘lgan fermalar uchun. Yetkazib berishni siz bilan birga aylanmangizga moslab rejalashtiramiz.',
       'For farms that need even, healthy young stock on schedule. We plan deliveries with you around your turnover.'],
    'Поставки по графику': ['Jadval bo‘yicha yetkazib berish', 'Deliveries on schedule'],
    'Выбор из трёх кроссов': ['Uchta krossdan tanlash', 'A choice of three crosses'],
    'Документы на каждую партию': ['Har bir partiya uchun hujjatlar', 'Documents for every batch'],
    'Птицефабрики': ['Parranda fabrikalari', 'Poultry plants'],
    'Для предприятий с промышленным циклом. Работаем с крупными партиями и согласуем вывод с планом посадки.':
      ['Sanoat sikliga ega korxonalar uchun. Yirik partiyalar bilan ishlaymiz va jo‘ja chiqarishni joylashtirish rejangizga moslaymiz.',
       'For companies with an industrial cycle. We work with large batches and match the hatch to your placement plan.'],
    'Крупные партии': ['Yirik partiyalar', 'Large batches'],
    'Согласование с планом посадки': ['Joylashtirish rejasi bilan kelishish', 'Matched to your placement plan'],
    'Вакцинация в первый день': ['Birinchi kuni emlash', 'Vaccination on day one'],

    'Инкубация': ['Inkubatsiya', 'Incubation'],
    '21 день внутри яйца': ['Tuxum ichidagi 21 kun', '21 days inside the egg'],
    'Дни инкубации': ['Inkubatsiya kunlari', 'Incubation days'],
    'День {d}': ['{d}-kun', 'Day {d}'],
    'День {d} · как и в день {k}': ['{d}-kun · {k}-kundagi kabi', 'Day {d} · same as day {k}'],
    'Начало пути': ['Yo‘l boshi', 'The journey begins'],
    'Яйцо попадает в инкубатор. В тепле начинается деление клеток зародышевого диска.':
      ['Tuxum inkubatorga tushadi. Iliqlikda murtak diski hujayralarining bo‘linishi boshlanadi.',
       'The egg goes into the incubator. In the warmth the cells of the germinal disc start dividing.'],
    'Первое сердцебиение': ['Ilk yurak urishi', 'The first heartbeat'],
    'Закладывается сердце, и уже к концу второго дня оно начинает биться. Появляются первые сосуды.':
      ['Yurak shakllanadi va ikkinchi kun oxiridayoq ura boshlaydi. Ilk qon tomirlari paydo bo‘ladi.',
       'The heart forms and starts beating by the end of the second day. The first vessels appear.'],
    'Глаза и зачатки крыльев': ['Ko‘zlar va qanot kurtaklari', 'Eyes and wing buds'],
    'Становятся заметны тёмные глаза, появляются зачатки крыльев и лапок.':
      ['Qora ko‘zlar ko‘rina boshlaydi, qanot va oyoqcha kurtaklari paydo bo‘ladi.',
       'Dark eyes become visible, and wing and leg buds appear.'],
    'Сеть сосудов': ['Qon tomirlari to‘ri', 'A web of vessels'],
    'Сосуды оплетают желток и подают зародышу питание. Он заметно растёт и двигается.':
      ['Qon tomirlari sarig‘ni o‘rab, murtakka oziq yetkazadi. U sezilarli o‘sadi va harakatlanadi.',
       'Vessels wrap around the yolk and feed the embryo. It grows visibly and moves.'],
    'Клюв и коготки': ['Tumshuq va tirnoqchalar', 'Beak and claws'],
    'Формируются клюв и коготки, на коже появляются зачатки будущего пуха.':
      ['Tumshuq va tirnoqchalar shakllanadi, terida bo‘lajak patlar kurtaklari paydo bo‘ladi.',
       'The beak and claws form, and the beginnings of down appear on the skin.'],
    'Пух и поворот': ['Pat va burilish', 'Down and turning'],
    'Тело покрывается пухом. Цыплёнок разворачивается головой к тупому концу яйца.':
      ['Tana mayin pat bilan qoplanadi. Jo‘ja boshini tuxumning to‘mtoq uchiga buradi.',
       'The body gets covered in down. The chick turns its head towards the blunt end of the egg.'],
    'Перевод на вывод': ['Ochirish shkafiga o‘tkazish', 'Moved to the hatcher'],
    'Яйца перестают поворачивать и переносят в выводной шкаф, где выше влажность.':
      ['Tuxumlarni aylantirish to‘xtatiladi va namligi yuqoriroq bo‘lgan ochirish shkafiga o‘tkaziladi.',
       'The eggs stop being turned and move to the hatcher, where the humidity is higher.'],
    'Желток — в брюшко': ['Sarig‘ — qoringa', 'Yolk into the belly'],
    'Остаток желтка втягивается внутрь. Это запас еды на первые сутки жизни.':
      ['Sarig‘ning qolgani ichkariga tortiladi. Bu hayotning birinchi sutkasi uchun oziq zaxirasi.',
       'The rest of the yolk is drawn inside. It’s the food supply for the first day of life.'],
    'Первый вдох': ['Ilk nafas', 'The first breath'],
    'Цыплёнок прокалывает воздушную камеру и начинает дышать лёгкими. Появляется наклёв.':
      ['Jo‘ja havo kamerasini teshib, o‘pkasi bilan nafas ola boshlaydi. Po‘choqda ilk teshikcha paydo bo‘ladi.',
       'The chick pierces the air cell and starts breathing with its lungs. The first pip appears.'],
    'Вывод': ['Ochirib chiqarish', 'Hatching'],
    'Цыплёнок разбивает скорлупу и выбирается наружу. Через несколько часов он уже обсох и пушист.':
      ['Jo‘ja po‘choqni yorib, tashqariga chiqadi. Bir necha soatdan keyin u qurib, yumshoq patli bo‘ladi.',
       'The chick breaks the shell and climbs out. A few hours later it’s dry and fluffy.'],

    'Можно забронировать': ['Band qilish mumkin', 'Available to book'],
    'Ближайшие выводы': ['Yaqin kunlardagi jo‘ja chiqarish', 'Upcoming hatches'],
    'осталось {n} голов': ['{n} bosh qoldi', '{n} chicks left'],
    'Забронировать': ['Band qilish', 'Book'],

    'Арбор Эйкерс': ['Arbor Acres', 'Arbor Acres'],
    'Ветеринарный контроль': ['Veterinariya nazorati', 'Veterinary control'],
    'Доставка с климат-контролем': ['Iqlim nazorati bilan yetkazib berish', 'Climate-controlled delivery'],

    'Кроссы': ['Krosslar', 'Crosses'],
    'Какую породу выбрать': ['Qaysi zotni tanlash kerak', 'Which breed to choose'],
    'Универсальный кросс для большинства хозяйств': ['Ko‘pchilik xo‘jaliklar uchun universal kross', 'A versatile cross for most farms'],
    'Быстрый и равномерный рост': ['Tez va bir tekis o‘sish', 'Fast, even growth'],
    'Хорошая отдача корма': ['Yemdan yaxshi samara', 'Good feed return'],
    'Один из самых распространённых в мире': ['Dunyodagi eng keng tarqalganlaridan biri', 'One of the most widespread in the world'],
    'Кому подойдёт': ['Kimga mos keladi', 'Best for'],
    'Тем, кому нужен надёжный и предсказуемый результат': ['Ishonchli va oldindan bilinadigan natija kerak bo‘lganlarga', 'Those who need a reliable, predictable result'],
    'Выбрать эту породу': ['Shu zotni tanlash', 'Choose this breed'],
    'Ставка на эффективность корма': ['Yem samaradorligiga tayanish', 'Built for feed efficiency'],
    'Экономичное использование корма': ['Yemdan tejamkor foydalanish', 'Economical use of feed'],
    'Хорошо раскрывается при разных рационах': ['Turli ratsionlarda yaxshi natija beradi', 'Performs well on different rations'],
    'Плотная, мясистая тушка': ['Zich, go‘shtdor tana', 'A dense, meaty carcass'],
    'Хозяйствам, где важна каждая затраченная единица корма': ['Har bir sarflangan yem birligi muhim bo‘lgan xo‘jaliklarga', 'Farms where every unit of feed counts'],
    'Выносливый и неприхотливый': ['Chidamli va talabchan emas', 'Hardy and undemanding'],
    'Хорошо переносит разные условия': ['Turli sharoitlarga yaxshi chidaydi', 'Copes well with different conditions'],
    'Стабильная сохранность поголовья': ['Barqaror yashovchanlik', 'Stable flock survival'],
    'Спокойный нрав': ['Xotirjam feʼl', 'A calm temperament'],
    'Подворьям и фермам с непростыми условиями содержания': ['Sharoiti murakkab bo‘lgan tomorqa va fermalarga', 'Smallholdings and farms with tougher conditions'],

    /* ---------- calculator ---------- */
    'Калькулятор': ['Kalkulyator', 'Calculator'],
    'Сколько принесёт ваша партия': ['Partiyangiz qancha foyda keltiradi', 'What your batch will earn'],
    'Посчитайте корм, выход мяса и прибыль ещё до заказа. Цены впишите свои — всё считается сразу.':
      ['Buyurtmadan oldin yem, go‘sht chiqishi va foydani hisoblang. O‘z narxlaringizni yozing — hammasi darhol hisoblanadi.',
       'Work out the feed, meat yield and profit before you order. Enter your own prices — everything updates instantly.'],
    'Кросс': ['Kross', 'Cross'],
    'Цыплят в партии': ['Partiyadagi jo‘jalar', 'Chicks in the batch'],
    'Цыплят в партии, число': ['Partiyadagi jo‘jalar soni', 'Number of chicks in the batch'],
    'Выращиваете до': ['Necha kungacha boqasiz', 'Raise until'],
    'Ваши цены': ['Sizning narxlaringiz', 'Your prices'],
    'в {cur}': ['{cur} da', 'in {cur}'],
    'Цыплёнок, за голову': ['Jo‘ja, bir bosh', 'Chick, per head'],
    'Корм, за кг': ['Yem, 1 kg', 'Feed, per kg'],
    'Продажа, за кг': ['Sotish, 1 kg', 'Sale, per kg'],
    'Продаёте': ['Qanday sotasiz', 'You sell'],
    'живым весом': ['tirik vaznda', 'live weight'],
    'тушкой': ['so‘yilgan holda', 'as carcass'],
    'Точная настройка': ['Aniq sozlash', 'Fine-tuning'],
    'Сохранность, %': ['Yashovchanlik, %', 'Survival, %'],
    'Живой вес, кг': ['Tirik vazn, kg', 'Live weight, kg'],
    'Конверсия корма': ['Yem konversiyasi', 'Feed conversion'],
    'Прочее на голову': ['Boshqa xarajat, bir boshga', 'Other, per head'],
    'авто': ['avto', 'auto'],
    'авто: {v}': ['avto: {v}', 'auto: {v}'],
    'Прочее — вакцины, подстилка, отопление, свет. Конверсия — сколько кг корма уходит на 1 кг привеса.':
      ['Boshqa — vaksinalar, to‘shama, isitish, yorug‘lik. Konversiya — 1 kg vazn ortishi uchun necha kg yem ketishi.',
       'Other — vaccines, litter, heating, light. Conversion — how many kg of feed go into 1 kg of weight gain.'],
    'Прибыль с партии': ['Partiyadan foyda', 'Profit per batch'],
    'Убыток с партии': ['Partiyadan zarar', 'Loss per batch'],
    'Расходы на партию': ['Partiya xarajatlari', 'Cost of the batch'],
    'Впишите цены слева — посчитаем расходы и прибыль': ['Chapda narxlarni yozing — xarajat va foydani hisoblaymiz', 'Enter prices on the left — we’ll work out costs and profit'],
    'Впишите цену цыплёнка и корма — посчитаем расходы, а с ценой продажи и прибыль':
      ['Jo‘ja va yem narxini yozing — xarajatlarni, sotish narxi bilan esa foydani ham hisoblaymiz',
       'Enter the chick and feed prices for costs — add the sale price to see the profit'],
    '{per}{cur} с каждого цыплёнка · отдача {roi} % на вложения':
      ['har bir jo‘jadan {per}{cur} · sarmoyaga {roi} % qaytim', '{per}{cur} per chick · {roi} % return on investment'],
    'Окупится при цене продажи от {p}{cur} за кг живого веса': ['Tirik vazn kilosi {p}{cur} dan sotilsa, xarajat qoplanadi', 'Breaks even at a sale price from {p}{cur} per kg of live weight'],
    'Окупится при цене продажи от {p}{cur} за кг тушки': ['Tana go‘shti kilosi {p}{cur} dan sotilsa, xarajat qoplanadi', 'Breaks even at a sale price from {p}{cur} per kg of carcass'],
    'голов к убою': ['so‘yishga bosh', 'birds to slaughter'],
    'кг живого веса': ['kg tirik vazn', 'kg live weight'],
    'кг мяса тушкой': ['kg tana go‘shti', 'kg carcass meat'],
    'кг корма': ['kg yem', 'kg feed'],
    'кг корма · ≈ {bags} меш. по {bag} кг': ['kg yem · ≈ {bags} qop ({bag} kg dan)', 'kg feed · ≈ {bags} bags of {bag} kg'],
    'себестоимость 1 кг': ['1 kg tannarxi', 'cost of 1 kg'],
    'Расходы': ['Xarajatlar', 'Costs'],
    'Выручка': ['Tushum', 'Revenue'],
    'цыплята': ['jo‘jalar', 'chicks'],
    'корм': ['yem', 'feed'],
    'прочее': ['boshqa', 'other'],
    'Заказать {n} цыплят {breed}': ['{breed}: {n} ta jo‘ja buyurtma qilish', 'Order {n} {breed} chicks'],
    '{n} дней': ['{n} kun', '{n} days'],
    '{n} дня': ['{n} kun', '{n} days'],
    '{n} г': ['{n} g', '{n} g'],
    'День {n}': ['{n}-kun', 'Day {n}'],
    'Заказать {n} цыплят Ross 308': ['Ross 308: {n} ta jo‘ja buyurtma qilish', 'Order {n} Ross 308 chicks'],
    'Ориентир на хорошие условия содержания и полнорационный корм. Реальный результат зависит от корма, климата и ухода. Вес и конверсию можно поправить в «Точной настройке».':
      ['Hisob yaxshi boqish sharoiti va to‘liq ratsionli yemga mo‘ljallangan. Haqiqiy natija yem, iqlim va parvarishga bog‘liq. Vazn va konversiyani «Aniq sozlash»da o‘zgartirish mumkin.',
       'Based on good housing and complete feed. Real results depend on feed, climate and care. Weight and conversion can be adjusted under “Fine-tuning”.'],

    /* ---------- why ---------- */
    'Почему INKUBIO': ['Nega INKUBIO', 'Why INKUBIO'],
    'Каждый этап — под контролем': ['Har bir bosqich nazoratda', 'Every stage under control'],
    'Точный климат в инкубаторах': ['Inkubatorlarda aniq iqlim', 'Precise climate in the incubators'],
    'Температура, влажность и поворот яиц под постоянным контролем на каждом этапе инкубации.':
      ['Harorat, namlik va tuxumlarni aylantirish inkubatsiyaning har bir bosqichida doimiy nazoratda.',
       'Temperature, humidity and egg turning are monitored constantly at every stage of incubation.'],
    'Овоскопирование и отбор': ['Ovoskopiya va saralash', 'Candling and selection'],
    'Просвечиваем яйца во время инкубации и убираем неразвивающиеся. После вывода отбираем активных, здоровых цыплят.':
      ['Inkubatsiya vaqtida tuxumlarni yoritib tekshiramiz va rivojlanmayotganlarini olib tashlaymiz. Jo‘ja chiqqandan keyin faol, sog‘lomlarini saralaymiz.',
       'We candle the eggs during incubation and remove those not developing. After hatching we select active, healthy chicks.'],
    'Цыплята проходят вакцинацию прямо на линии, до отправки к вам.': ['Jo‘jalar sizga jo‘natilishidan oldin liniyaning o‘zida emlanadi.', 'Chicks are vaccinated right on the line, before they’re sent to you.'],
    'Вентилируемые коробки': ['Shamollatiladigan qutilar', 'Ventilated boxes'],
    'Цыплята едут в специальных коробках с отверстиями для воздуха — без тесноты и перегрева.':
      ['Jo‘jalar havo teshiklari bor maxsus qutilarda boradi — siqilmasdan va qizib ketmasdan.',
       'Chicks travel in special boxes with air holes — no crowding and no overheating.'],
    'Доставка в первые сутки': ['Birinchi sutkada yetkazib berish', 'Delivery within the first day'],
    'Везём цыплят в первые сутки после вывода, в машинах с поддержанием температуры.':
      ['Jo‘jalarni chiqqandan keyingi birinchi sutkada, haroratni saqlaydigan mashinalarda olib boramiz.',
       'We deliver chicks within the first day after hatching, in temperature-controlled vehicles.'],
    'Документы с каждой партией': ['Har bir partiya bilan hujjatlar', 'Documents with every batch'],
    'К каждой партии прикладываем сопроводительные документы. Вы знаете, кого и откуда получили.':
      ['Har bir partiyaga kuzatuv hujjatlarini ilova qilamiz. Kimni va qayerdan olganingizni bilasiz.',
       'Every batch comes with accompanying documents. You know exactly what you got and where from.'],

    /* gallery, reviews */
    'Без 3D — как есть': ['3D siz — boricha', 'No 3D — as it is'],
    'Как мы работаем': ['Biz qanday ishlaymiz', 'How we work'],
    'Отзывы': ['Fikrlar', 'Reviews'],
    'Что говорят наши клиенты': ['Mijozlarimiz nima deydi', 'What our customers say'],
    'Предыдущие отзывы': ['Oldingi fikrlar', 'Previous reviews'],
    'Следующие отзывы': ['Keyingi fikrlar', 'Next reviews'],
    'Отзывы, прокручиваются вбок': ['Fikrlar, yon tomonga aylantiriladi', 'Reviews, scroll sideways'],
    'Оставить отзыв': ['Fikr qoldirish', 'Leave a review'],
    'Открыть фото: {name}': ['Rasmni ochish: {name}', 'Open photo: {name}'],
    'Оценка {n} из 5': ['Baho: 5 dan {n}', 'Rated {n} out of 5'],
    'Фото от клиента: {name}': ['Mijozdan rasm: {name}', 'Photo from customer: {name}'],
    'Клиент': ['Mijoz', 'Customer'],
    '{breed}, {n} гол.': ['{breed}, {n} bosh', '{breed}, {n} birds'],
    'Пример · замените в js/config.js': ['Namuna · js/config.js da almashtiring', 'Example · replace in js/config.js'],

    /* facts card, contacts */
    'Производство': ['Ishlab chiqarish', 'Production'],
    'Инкубаторы с точностью климата ±0,1 °C': ['Iqlim aniqligi ±0,1 °C bo‘lgan inkubatorlar', 'Incubators with ±0.1 °C climate accuracy'],
    'Линия сортировки и вакцинации суточных цыплят': ['Bir kunlik jo‘jalarni saralash va emlash liniyasi', 'A sorting and vaccination line for day-old chicks'],
    'Собственный автопарк с климат-контролем': ['Iqlim nazoratli o‘z avtoparkimiz', 'Our own climate-controlled fleet'],
    'Ветеринарные сертификаты на каждую партию': ['Har bir partiyaga veterinariya sertifikatlari', 'Veterinary certificates for every batch'],
    'Контакты': ['Kontaktlar', 'Contacts'],
    'Адрес инкубатория — укажите здесь': ['Inkubatoriya manzili — shu yerga yozing', 'Hatchery address — enter it here'],
    'Пн–Сб, 8:00–18:00': ['Du–Sh, 8:00–18:00', 'Mon–Sat, 8:00–18:00'],

    /* delivery */
    'Путь до вашего хозяйства': ['Xo‘jaligingizgacha yo‘l', 'The way to your farm'],
    'Как мы доставляем': ['Qanday yetkazib beramiz', 'How we deliver'],
    'Цыплята появляются на свет в выводных шкафах и обсыхают.': ['Jo‘jalar ochirish shkaflarida dunyoga keladi va quriydi.', 'Chicks hatch in the hatchers and dry off.'],
    'Отбор и вакцинация': ['Saralash va emlash', 'Selection and vaccination'],
    'Каждого проверяют, сортируют по классу и вакцинируют.': ['Har birini tekshiramiz, sinf bo‘yicha saralaymiz va emlaymiz.', 'Each chick is checked, graded and vaccinated.'],
    'Упаковка': ['Qadoqlash', 'Packing'],
    'Вентилируемые коробки, подстилка, ровная плотность посадки.': ['Shamollatiladigan qutilar, to‘shama, bir xil zichlik.', 'Ventilated boxes, litter, even stocking density.'],
    'Дорога': ['Yo‘l', 'The road'],
    'Машина с климат-контролем, в первые сутки после вывода.': ['Iqlim nazoratli mashina, jo‘ja chiqqandan keyingi birinchi sutkada.', 'A climate-controlled vehicle, within the first day after hatching.'],
    'Приёмка': ['Qabul qilish', 'Hand-over'],
    'Пересчёт с водителем, акт, документы на партию.': ['Haydovchi bilan qayta sanash, dalolatnoma, partiya hujjatlari.', 'Counting with the driver, a signed record, batch documents.'],

    /* delivery map */
    'География': ['Geografiya', 'Coverage'],
    'Куда мы возим цыплят': ['Jo‘jalarni qayerlarga olib boramiz', 'Where we deliver chicks'],
    'Карта зон доставки': ['Yetkazib berish hududlari xaritasi', 'Map of delivery zones'],
    'Проверьте свой город': ['Shahringizni tekshiring', 'Check your town'],
    'Начните вводить название': ['Nomini yozishni boshlang', 'Start typing a name'],
    'Выберите точку на карте или найдите свой город — покажем расстояние, время в пути и условия доставки.':
      ['Xaritadan nuqtani tanlang yoki shahringizni toping — masofa, yo‘l vaqti va yetkazib berish shartlarini ko‘rsatamiz.',
       'Pick a point on the map or find your town — we’ll show the distance, travel time and delivery terms.'],
    'В день вывода': ['Jo‘ja chiqqan kuni', 'On hatch day'],
    'В первые сутки': ['Birinchi sutkada', 'Within the first day'],
    'По договорённости': ['Kelishuv bo‘yicha', 'By arrangement'],
    'Привезём в течение нескольких часов после отбора.': ['Saralashdan keyin bir necha soat ichida olib boramiz.', 'We’ll bring them within a few hours after selection.'],
    'Выезжаем ночью, цыплята у вас утром.': ['Kechasi yo‘lga chiqamiz, jo‘jalar ertalab sizda.', 'We leave at night, the chicks are with you in the morning.'],
    'Возим крупные партии. Сроки и цену согласуем.': ['Yirik partiyalarni olib boramiz. Muddat va narxni kelishamiz.', 'We deliver large batches. We’ll agree on timing and price.'],
    '{km} км': ['{km} km', '{km} km'],
    'до {km} км': ['{km} km gacha', 'up to {km} km'],
    '{name}, около {km} км': ['{name}, taxminan {km} km', '{name}, about {km} km'],
    'инкубаторий, отсюда выезжает машина': ['inkubatoriya, mashina shu yerdan chiqadi', 'the hatchery, where the truck starts'],
    'около часа': ['taxminan bir soat', 'about an hour'],
    '≈ {h} ч': ['≈ {h} soat', '≈ {h} h'],
    'по дороге': ['yo‘l bo‘yicha', 'by road'],
    'в пути': ['yo‘lda', 'on the road'],
    'Заказать с доставкой в {city}': ['{city} ga yetkazib berish bilan buyurtma', 'Order with delivery to {city}'],
    'Дальше наших зон': ['Hududlarimizdan uzoqroq', 'Beyond our zones'],
    'Такие поездки обсуждаем отдельно — оставьте заявку, посчитаем.': ['Bunday safarlarni alohida kelishamiz — ariza qoldiring, hisoblab beramiz.', 'We discuss such trips separately — leave a request and we’ll work it out.'],
    'Этого города нет в списке, но, скорее всего, довезём. Оставьте заявку — менеджер посчитает срок и стоимость доставки.':
      ['Bu shahar ro‘yxatda yo‘q, lekin katta ehtimol bilan yetkazamiz. Ariza qoldiring — menejer muddat va narxni hisoblab beradi.',
       'This town isn’t on the list, but we can most likely deliver. Leave a request — a manager will work out the timing and cost.'],
    'С': ['N', 'N'], 'В': ['E', 'E'], 'Ю': ['S', 'S'], 'З': ['W', 'W'],

    /* care guide */
    'Памятка': ['Eslatma', 'Guide'],
    'Первая неделя цыплёнка': ['Jo‘janing birinchi haftasi', 'A chick’s first week'],
    'Дни': ['Kunlar', 'Days'],
    'День 0': ['0-kun', 'Day 0'],
    'Дни 1–2': ['1–2-kunlar', 'Days 1–2'],
    'Дни 3–4': ['3–4-kunlar', 'Days 3–4'],
    'Дни 5–7': ['5–7-kunlar', 'Days 5–7'],
    'Каждый день': ['Har kuni', 'Every day'],
    'ориентир на уровне цыплят': ['jo‘jalar balandligida', 'at chick level'],
    'по поведению': ['xulq-atvoriga qarab', 'by behaviour'],
    'Встреча цыплят': ['Jo‘jalarni kutib olish', 'Welcoming the chicks'],
    'Прогрейте помещение заранее: на уровне цыплят около 32–34 °C. Сухая чистая подстилка, свежая вода комнатной температуры и стартовый корм — сразу.':
      ['Xonani oldindan isiting: jo‘jalar balandligida taxminan 32–34 °C. Quruq toza to‘shama, xona haroratidagi toza suv va start yemi — darhol.',
       'Warm the room in advance: about 32–34 °C at chick level. Dry clean litter, fresh room-temperature water and starter feed — right away.'],
    'Вода и корм рядом': ['Suv va yem yaqinida', 'Water and feed close by'],
    'Держите поилки и кормушки в шаговой доступности. Подсыпайте корм часто, понемногу. Проверяйте, что цыплята пьют и зобики наполняются.':
      ['Sug‘orgich va yemlagichlarni yaqin joyda saqlang. Yemni tez-tez, ozgina-ozgina soling. Jo‘jalar suv ichayotgani va jig‘ildonlari to‘layotganini tekshiring.',
       'Keep drinkers and feeders within easy reach. Top up feed often, a little at a time. Check that the chicks drink and their crops fill up.'],
    'Плавно снижаем тепло': ['Issiqlikni asta kamaytiramiz', 'Lower the heat gradually'],
    'Начинайте понемногу снижать температуру, без резких скачков. Следите, чтобы подстилка оставалась сухой, а у поилок не было луж.':
      ['Haroratni keskin o‘zgartirmasdan, asta-sekin pasaytira boshlang. To‘shama quruq qolishi va sug‘orgichlar yonida ko‘lmak bo‘lmasligiga eʼtibor bering.',
       'Start lowering the temperature little by little, without sudden jumps. Keep the litter dry and no puddles around the drinkers.'],
    'Больше простора': ['Ko‘proq joy', 'More space'],
    'Расширяйте площадь и добавляйте кормушки по мере роста. К концу недели температура обычно на несколько градусов ниже стартовой. Проветривайте без сквозняков.':
      ['O‘sishiga qarab maydonni kengaytiring va yemlagich qo‘shing. Hafta oxiriga kelib harorat odatda boshlang‘ichdan bir necha daraja past bo‘ladi. Yelvizaksiz shamollating.',
       'Expand the area and add feeders as they grow. By the end of the week the temperature is usually a few degrees below the start. Ventilate without draughts.'],
    'Смотрите на поведение': ['Xulq-atvoriga qarang', 'Watch their behaviour'],
    'Цыплятам комфортно, если они равномерно распределены и активны. Сбились в кучу — холодно. Жмутся к краям и дышат открытым клювом — жарко.':
      ['Jo‘jalar bir tekis tarqalgan va faol bo‘lsa, ularga qulay. To‘p bo‘lib yig‘ilsa — sovuq. Chetlarga qisilib, tumshug‘ini ochib nafas olsa — issiq.',
       'Chicks are comfortable when they’re evenly spread and active. Huddled together — too cold. Pressed to the edges and panting — too hot.'],
    'Готово к приезду?': ['Kelishiga tayyormisiz?', 'Ready for arrival?'],
    'Брудер прогрет заранее': ['Bruder oldindan isitilgan', 'Brooder warmed in advance'],
    'Сухая чистая подстилка': ['Quruq toza to‘shama', 'Dry clean litter'],
    'Поилки с водой комнатной температуры': ['Xona haroratidagi suvli sug‘orgichlar', 'Drinkers with room-temperature water'],
    'Стартовый корм': ['Start yemi', 'Starter feed'],
    'Термометр на уровне цыплят': ['Jo‘jalar balandligida termometr', 'Thermometer at chick level'],
    'Всё готово — заказать': ['Hammasi tayyor — buyurtma berish', 'All set — order now'],
    'Общие рекомендации. Точный режим для вашего кросса и помещения подскажет ветеринар или наш менеджер.':
      ['Umumiy tavsiyalar. Krossingiz va xonangiz uchun aniq rejimni veterinar yoki menejerimiz aytib beradi.',
       'General advice. A vet or our manager will give you the exact regime for your cross and housing.'],

    /* facts */
    'Знаете ли вы?': ['Bilasizmi?', 'Did you know?'],
    'Удивительное внутри яйца': ['Tuxum ichidagi ajoyibotlar', 'Wonders inside the egg'],
    'Три недели до встречи': ['Uchrashuvgacha uch hafta', 'Three weeks to meet'],
    'Куриное яйцо инкубируется около 21 дня. За это время из одной клетки формируется цыплёнок, готовый к жизни.':
      ['Tovuq tuxumi taxminan 21 kun inkubatsiya qilinadi. Shu vaqt ichida bitta hujayradan hayotga tayyor jo‘ja shakllanadi.',
       'A hen’s egg incubates for about 21 days. In that time a single cell becomes a chick ready for life.'],
    'Скорлупа умеет дышать': ['Po‘choq nafas oladi', 'The shell breathes'],
    'В скорлупе от 7 до 17 тысяч пор. Через них внутрь поступает кислород, а наружу выходят углекислый газ и влага.':
      ['Po‘choqda 7 mingdan 17 minggacha teshikcha bor. Ular orqali ichkariga kislorod kiradi, tashqariga esa karbonat angidrid va namlik chiqadi.',
       'A shell has 7 to 17 thousand pores. Oxygen comes in through them, and carbon dioxide and moisture go out.'],
    'Первый вдох — внутри яйца': ['Ilk nafas — tuxum ichida', 'The first breath — inside the egg'],
    'Примерно на 19–20-й день цыплёнок прокалывает оболочку воздушной камеры и впервые дышит лёгкими, ещё не разбив скорлупу.':
      ['Taxminan 19–20-kuni jo‘ja havo kamerasi pardasini teshib, po‘choqni hali yormasdan birinchi marta o‘pkasi bilan nafas oladi.',
       'Around day 19–20 the chick pierces the air cell membrane and breathes with its lungs for the first time, before breaking the shell.'],
    'Яйцевой зуб': ['Tuxum tishi', 'The egg tooth'],
    'На кончике клюва есть маленький роговой бугорок. Им цыплёнок пробивает скорлупу, а вскоре после вылупления бугорок отпадает.':
      ['Tumshuq uchida kichik shoxsimon do‘mboqcha bor. Jo‘ja u bilan po‘choqni teshadi, chiqqanidan keyin tez orada u tushib ketadi.',
       'There’s a tiny horny bump on the tip of the beak. The chick uses it to break the shell, and it falls off soon after hatching.'],
    'Запас еды с собой': ['O‘zi bilan oziq zaxirasi', 'Packed lunch'],
    'Перед вылуплением цыплёнок втягивает остаток желтка в брюшко. Этот запас поддерживает его в первые сутки-двое жизни.':
      ['Chiqishdan oldin jo‘ja sarig‘ning qolganini qorniga tortib oladi. Bu zaxira uni hayotining dastlabki bir-ikki sutkasida quvvatlaydi.',
       'Before hatching the chick draws the rest of the yolk into its belly. This supply keeps it going for the first day or two.'],
    'Голос раньше рождения': ['Tug‘ilishdan oldingi ovoz', 'A voice before birth'],
    'Незадолго до вылупления цыплята уже слышат звуки снаружи и пищат прямо в яйце.':
      ['Chiqishiga oz qolganda jo‘jalar tashqaridagi tovushlarni eshitadi va tuxum ichida chiyillaydi.',
       'Shortly before hatching, chicks already hear sounds outside and peep right inside the egg.'],
    'Зачем поворачивают яйца': ['Tuxumlar nega aylantiriladi', 'Why eggs are turned'],
    'Регулярный поворот не даёт зародышу прилипнуть к оболочке. Обычно яйца переворачивают примерно до 18-го дня инкубации.':
      ['Muntazam aylantirish murtakning pardaga yopishib qolishiga yo‘l qo‘ymaydi. Odatda tuxumlar inkubatsiyaning taxminan 18-kunigacha aylantiriladi.',
       'Regular turning keeps the embryo from sticking to the membrane. Eggs are usually turned until about day 18 of incubation.'],
    'Влажность перед выводом': ['Chiqish oldidan namlik', 'Humidity before hatching'],
    'В последние дни инкубации влажность повышают. Так оболочки не пересыхают, и цыплёнку легче выбраться из скорлупы.':
      ['Inkubatsiyaning so‘nggi kunlarida namlik oshiriladi. Shunda pardalar qurib qolmaydi va jo‘jaga po‘choqdan chiqish osonroq bo‘ladi.',
       'Humidity is raised in the last days of incubation. That keeps the membranes from drying out, so it’s easier for the chick to get out.'],

    /* FAQ */
    'Вопросы': ['Savollar', 'Questions'],
    'Частые вопросы': ['Ko‘p beriladigan savollar', 'Frequently asked questions'],
    'Какая минимальная партия?': ['Eng kichik partiya qancha?', 'What is the minimum batch?'],
    'Минимальный объём зависит от породы и региона доставки — менеджер назовёт его при первом звонке. Небольшие хозяйства тоже обслуживаем.':
      ['Eng kam hajm zot va yetkazib berish hududiga bog‘liq — menejer uni birinchi qo‘ng‘iroqdayoq aytadi. Kichik xo‘jaliklarga ham xizmat ko‘rsatamiz.',
       'The minimum depends on the breed and delivery region — a manager will tell you on the first call. We serve small farms too.'],
    'Как подготовить помещение к приезду цыплят?': ['Jo‘jalar kelishiga xonani qanday tayyorlash kerak?', 'How do I prepare the room for the chicks?'],
    'За сутки прогрейте брудер: в первые дни под источником тепла нужно 32–34 °C, затем температуру снижают постепенно. Застелите чистую сухую подстилку, поставьте поилки с водой комнатной температуры и корм для стартового периода. Подробную памятку пришлём вместе с подтверждением заказа.':
      ['Bir sutka oldin bruderni isiting: dastlabki kunlarda issiqlik manbai ostida 32–34 °C kerak, keyin harorat asta-sekin pasaytiriladi. Toza quruq to‘shama yozing, xona haroratidagi suvli sug‘orgichlar va start davri uchun yem qo‘ying. Batafsil eslatmani buyurtma tasdig‘i bilan birga yuboramiz.',
       'Warm the brooder a day ahead: in the first days you need 32–34 °C under the heat source, then lower it gradually. Lay clean dry litter, set out drinkers with room-temperature water and starter feed. We’ll send a detailed guide with the order confirmation.'],
    'Цыплята вакцинированы?': ['Jo‘jalar emlanganmi?', 'Are the chicks vaccinated?'],
    'Да, вакцинация проводится в первый день жизни на нашей линии, до упаковки. Схему вакцинации и ветеринарные документы вы получите вместе с партией.':
      ['Ha, emlash hayotning birinchi kunida, qadoqlashdan oldin liniyamizda o‘tkaziladi. Emlash sxemasi va veterinariya hujjatlarini partiya bilan birga olasiz.',
       'Yes, vaccination is done on the first day of life on our line, before packing. You’ll get the vaccination schedule and vet documents with the batch.'],
    'Как проходит доставка?': ['Yetkazib berish qanday bo‘ladi?', 'How does delivery work?'],
    'Цыплят везут в вентилируемых коробках в машине с климат-контролем, в течение первых суток после вывода — в это время им ещё хватает питательных веществ из желтка. Время в пути зависит от региона.':
      ['Jo‘jalar shamollatiladigan qutilarda, iqlim nazoratli mashinada, chiqqandan keyingi birinchi sutka ichida olib boriladi — bu vaqtda ularga sarig‘dagi oziq moddalar hali yetadi. Yo‘l vaqti hududga bog‘liq.',
       'Chicks travel in ventilated boxes in a climate-controlled vehicle within the first day after hatching — they still have enough nutrients from the yolk then. Travel time depends on the region.'],
    'Как оплатить заказ?': ['Buyurtmani qanday to‘lash mumkin?', 'How do I pay?'],
    'Условия оплаты зависят от объёма и фиксируются в договоре. Менеджер расскажет о вариантах при оформлении.':
      ['To‘lov shartlari hajmga bog‘liq va shartnomada belgilanadi. Menejer rasmiylashtirishda variantlar haqida aytib beradi.',
       'Payment terms depend on the volume and are set in the contract. A manager will explain the options when you order.'],
    'Что если часть цыплят не доедет?': ['Jo‘jalarning bir qismi yetib bormasa-chi?', 'What if some chicks don’t arrive alive?'],
    'При приёмке партия пересчитывается вместе с водителем и составляется акт. Условия гарантии сохранности прописаны в договоре.':
      ['Qabul qilishda partiya haydovchi bilan birga qayta sanaladi va dalolatnoma tuziladi. Saqlanish kafolati shartlari shartnomada yozilgan.',
       'At hand-over the batch is counted together with the driver and a record is signed. The survival guarantee terms are in the contract.'],

    /* closing, footer */
    'Следующий шаг': ['Keyingi qadam', 'Next step'],
    'Подберём кросс и партию под ваше хозяйство': ['Xo‘jaligingizga mos kross va partiyani tanlaymiz', 'We’ll match the cross and batch to your farm'],
    'Оставьте заявку — расскажем о ближайших выводах, условиях доставки и поможем подготовиться к посадке.':
      ['Ariza qoldiring — yaqin kunlardagi jo‘ja chiqarish, yetkazib berish shartlari haqida aytamiz va joylashtirishga tayyorlanishda yordam beramiz.',
       'Leave a request — we’ll tell you about upcoming hatches and delivery terms, and help you get ready.'],
    'Оставить заявку': ['Ariza qoldirish', 'Leave a request'],
    'С каждой партией вы получаете': ['Har bir partiya bilan siz olasiz', 'With every batch you get'],
    'Ветеринарные документы': ['Veterinariya hujjatlari', 'Veterinary documents'],
    'Схему вакцинации': ['Emlash sxemasi', 'The vaccination schedule'],
    'Акт приёмки': ['Qabul dalolatnomasi', 'A hand-over record'],
    'Памятку по первой неделе': ['Birinchi hafta bo‘yicha eslatma', 'A first-week guide'],

    /* ---------- order form ---------- */
    'Закрыть': ['Yopish', 'Close'],
    'Заявка': ['Ariza', 'Request'],
    'Ваше имя': ['Ismingiz', 'Your name'],
    'Телефон': ['Telefon', 'Phone'],
    'Порода': ['Zot', 'Breed'],
    'Количество': ['Soni', 'Quantity'],
    'Желаемая дата': ['Istalgan sana', 'Preferred date'],
    'Доставка:': ['Yetkazib berish:', 'Delivery:'],
    'Убрать город доставки': ['Yetkazib berish shahrini olib tashlash', 'Remove the delivery town'],
    'consent': ['Ariza bo‘yicha bog‘lanish uchun <a href="privacy.html" target="_blank" rel="noopener">shaxsiy maʼlumotlarimni qayta ishlashga</a> roziman',
                'I agree to the <a href="privacy.html" target="_blank" rel="noopener">processing of my personal data</a> so you can contact me about this request'],
    'Отправить заявку': ['Arizani yuborish', 'Send request'],
    'Отправляем…': ['Yuborilmoqda…', 'Sending…'],
    'Спасибо! Заявка отправлена — мы свяжемся с вами в ближайшее время.': ['Rahmat! Ariza yuborildi — tez orada siz bilan bog‘lanamiz.', 'Thank you! Your request has been sent — we’ll be in touch soon.'],
    'Удобнее написать?': ['Yozish qulayroqmi?', 'Prefer to message?'],
    'Проверьте имя и телефон — похоже, в них ошибка.': ['Ism va telefonni tekshiring — ularda xato borga o‘xshaydi.', 'Please check your name and phone — something looks wrong.'],
    'Слишком много заявок подряд. Попробуйте через несколько минут.': ['Ketma-ket juda ko‘p ariza. Bir necha daqiqadan keyin urinib ko‘ring.', 'Too many requests in a row. Please try again in a few minutes.'],
    'Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам.': ['Arizani yuborib bo‘lmadi. Yana urinib ko‘ring yoki bizga qo‘ng‘iroq qiling.', 'Couldn’t send the request. Please try again or give us a call.'],
    'Не удалось отправить заявку. Позвоните нам.': ['Arizani yuborib bo‘lmadi. Bizga qo‘ng‘iroq qiling.', 'Couldn’t send the request. Please call us.'],
    'Примерно: {sum}': ['Taxminan: {sum}', 'Approximately: {sum}'],
    ' + доставка {sum}': [' + yetkazib berish {sum}', ' + delivery {sum}'],
    ' · доставка рассчитывается отдельно': [' · yetkazib berish alohida hisoblanadi', ' · delivery is calculated separately'],
    'Для 3D-истории нужен JavaScript.': ['3D hikoya uchun JavaScript kerak.', 'The 3D story needs JavaScript.'],
    'Фото': ['Rasm', 'Photo'],
    'Предыдущее фото': ['Oldingi rasm', 'Previous photo'],
    'Следующее фото': ['Keyingi rasm', 'Next photo'],

    /* ---------- texts painted on the 3D models ---------- */
    'ЛОТКИ 1–7 · 147 ЯИЦ': ['LOTOKLAR 1–7 · 147 TUXUM', 'TRAYS 1–7 · 147 EGGS'],
    'PRO S-147 · ИНКУБАЦИОННЫЙ ШКАФ': ['PRO S-147 · INKUBATSIYA SHKAFI', 'PRO S-147 · INCUBATOR CABINET'],
    'ИНКУБАЦИЯ · ЛОТКИ 1–7': ['INKUBATSIYA · LOTOKLAR 1–7', 'INCUBATION · TRAYS 1–7'],
    'НОРМА': ['MEʼYOR', 'NORMAL'],
    'ТЕМПЕРАТУРА': ['HARORAT', 'TEMPERATURE'],
    'ВЛАЖНОСТЬ': ['NAMLIK', 'HUMIDITY'],
    'ДЕНЬ': ['KUN', 'DAY'],
    'ПОВОРОТ ЛОТКОВ ±45° · КАЖДЫЙ ЧАС': ['LOTOKLARNI AYLANTIRISH ±45° · HAR SOAT', 'TRAY TURNING ±45° · EVERY HOUR'],
    'CO₂ 0.3% · ВЕНТИЛЯЦИЯ 3 × 1450 об/мин': ['CO₂ 0.3% · SHAMOLLATISH 3 × 1450 ayl/daq', 'CO₂ 0.3% · VENTILATION 3 × 1450 rpm'],
    'ЖИВЫЕ ЦЫПЛЯТА · ОСТОРОЖНО': ['TIRIK JO‘JALAR · EHTIYOT BO‘LING', 'LIVE CHICKS · HANDLE WITH CARE'],
    'Суточные цыплята · Доставка с климат-контролем': ['Bir kunlik jo‘jalar · Iqlim nazoratli yetkazib berish', 'Day-old chicks · Climate-controlled delivery'],
    'ВАКЦИНАЦИЯ': ['EMLASH', 'VACCINATION'],
  };

  /* ---------- language choice: ?lang= → saved → browser → Uzbek ---------- */
  function pick() {
    var q = null;
    try { q = new URLSearchParams(location.search).get('lang'); } catch (e) {}
    if (LANGS.indexOf(q) >= 0) { save(q); return q; }
    try { var s = localStorage.getItem('inkubio-lang'); if (LANGS.indexOf(s) >= 0) return s; } catch (e) {}
    var nav = (navigator.languages || [navigator.language || '']).map(function (l) { return String(l).slice(0, 2).toLowerCase(); });
    for (var i = 0; i < nav.length; i++) if (LANGS.indexOf(nav[i]) >= 0) return nav[i];
    return 'uz';
  }
  function save(l) { try { localStorage.setItem('inkubio-lang', l); } catch (e) {} }
  var lang = pick();
  var col = lang === 'uz' ? 0 : 1;
  var missing = [];

  var norm = function (s) { return String(s).replace(/[\s ]+/g, ' ').trim(); };
  var fill = function (s, v) { return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return k in v ? v[k] : m; }) : s; };

  function t(ru, vars) {
    if (ru == null) return '';
    if (typeof ru === 'object') return fill(String(ru[lang] || ru.ru || ru.uz || ru.en || ''), vars); // { ru, uz, en } from config.js
    var s = String(ru);
    if (lang !== 'ru') {
      var e = D[s] || D[norm(s)];
      if (!e) {
        // one number in the text: 'День 7' → 'День {n}'
        var nums = norm(s).match(/\d+(?:[.,]\d+)?/g);
        if (nums && nums.length === 1) {
          var g = D[norm(s).replace(nums[0], '{n}')];
          if (g) { e = [fill(g[0], { n: nums[0] }), fill(g[1], { n: nums[0] })]; }
        }
      }
      if (e) s = e[col];
      else if (/[А-Яа-яЁё]/.test(s) && missing.indexOf(norm(s)) < 0) missing.push(norm(s));
    }
    return fill(s, vars);
  }

  /* ---------- the static page ---------- */
  function translatePage(root) {
    if (lang === 'ru') return;
    // <option> without value: its text IS the value sent to the server — keep that in Russian
    root.querySelectorAll('option:not([value])').forEach(function (o) { o.value = o.textContent; });
    root.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var e = D[el.getAttribute('data-i18n-html')];
      if (e) el.innerHTML = e[col];
    });
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode && n.parentNode.nodeName;
        return p === 'SCRIPT' || p === 'STYLE' || p === 'NOSCRIPT' || !/[А-Яа-яЁё]/.test(n.nodeValue) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    var nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(function (n) {
      var v = n.nodeValue, m = /^(\s*)([\s\S]*?)(\s*)$/.exec(v);
      var out = t(m[2]);
      if (out !== m[2]) n.nodeValue = m[1] + out + m[3];
    });
    ['aria-label', 'placeholder', 'title', 'alt', 'content', 'data-label'].forEach(function (a) {
      root.querySelectorAll('[' + a + ']').forEach(function (el) {
        var v = el.getAttribute(a);
        if (/[А-Яа-яЁё]/.test(v)) el.setAttribute(a, t(v));
      });
    });
  }

  /* ---------- the switcher in the header ---------- */
  function setLang(l) {
    if (LANGS.indexOf(l) < 0 || l === lang) return;
    save(l);
    var u = new URL(location.href);
    u.searchParams.set('lang', l);
    location.replace(u.toString());
  }
  function switcher() {
    var box = document.getElementById('langBox');
    if (!box) return;
    var btn = box.querySelector('button');
    var menu = box.querySelector('ul');
    btn.querySelector('b').textContent = lang.toUpperCase();
    btn.querySelector('.flag').innerHTML = FLAGS[lang];
    menu.innerHTML = LANGS.map(function (l) {
      return '<li><button type="button" role="menuitemradio" aria-checked="' + (l === lang) + '" data-lang="' + l + '" lang="' + l + '"><span class="flag" aria-hidden="true">' + FLAGS[l] + '</span>' + NAMES[l] + '</button></li>';
    }).join('');
    var open = function (on) { box.classList.toggle('open', on); btn.setAttribute('aria-expanded', String(on)); };
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(!box.classList.contains('open')); });
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-lang]');
      if (b) { open(false); setLang(b.getAttribute('data-lang')); }
    });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') open(false); });
  }

  var UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
  // '20 декабря' / '20-dekabr' / 'December 20'; parts: { year: true } adds the year, { monthYear: true } gives 'dekabr 2026'
  function formatDate(d, parts) {
    parts = parts || {};
    if (!(d instanceof Date)) d = new Date(d);
    if (isNaN(d.getTime())) return '';
    if (lang === 'uz') {
      var m = UZ_MONTHS[d.getMonth()];
      if (parts.monthYear) return m + ' ' + d.getFullYear();
      return d.getDate() + '-' + m + (parts.year ? ' ' + d.getFullYear() : '');
    }
    var loc = lang === 'en' ? 'en-US' : 'ru-RU';
    if (parts.monthYear) return d.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
    return d.toLocaleDateString(loc, parts.year ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long' });
  }

  document.documentElement.lang = lang;
  window.I18N = {
    lang: lang,
    langs: LANGS,
    names: NAMES,
    locale: { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' }[lang],
    t: t,
    set: setLang,
    date: formatDate,
    missing: missing,
  };
  translatePage(document);
  var og = document.querySelector('meta[property="og:locale"]');
  if (og) og.setAttribute('content', { uz: 'uz_UZ', ru: 'ru_RU', en: 'en_US' }[lang]);
  var hl = document.querySelector('input[name="lang"]');
  if (hl) hl.value = lang;
  switcher();
  if (missing.length) console.info('[i18n] no ' + lang + ' text for:', missing);
})();
