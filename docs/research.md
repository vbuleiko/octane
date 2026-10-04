# Octane Auto: аудит текущего сайта

Источник: https://www.octaneauto.co.za/ (изучено 04.10.2026)

## Бренд

| Что | Значение |
|---|---|
| Основной оранжевый (CSS `--s-prime`) | `#F48222` |
| Вторичный оранжевый (`--s-secondary`) | `#E6944C` |
| Тёмно-серый (`--dark-grey`) | `#232628` |
| Оранжевый в самом логотипе | около `#F86400` |
| Слоган | Your drive is our passion |
| Логотип | `public/brand/logo-original.png` (241×242, на чёрном квадрате) и `public/brand/logo-circle.png` (тот же логотип, обрезанный по кругу, с прозрачным фоном). Сам логотип не меняется. |

Векторного логотипа на сайте нет (`logo.svg` отдаёт 404). Для продакшена нужен оригинал в SVG/AI от клиента.

Фирменный мотив, который есть на всех фото: студия с оранжево-серым шахматным полом и чёрной стеной с логотипом.

## Контакты и часы работы

- Шоурум: Unit 6, 3 Esso Rd, Montague Gardens, Cape Town, 7441 ([карта](https://goo.gl/maps/trQAx6PqpTVew6xi9))
- Мастерская: Unit 13, Montague Drive, Montague Gardens, 7441
- Телефон: 021 891 3342
- Email: conrad@octaneauto.co.za
- Пн–Пт 08:30–17:00, Сб 09:00–12:30, Вс и праздники: выходной

## Страницы и контент

- **Home**: слайдер (2 баннера с оранжевым Ferrari), счётчик «39 cars», 8 последних авто.
- **Showroom**: фильтры (марка, модель, год, цвет, цена, пробег, КПП, топливо, кузов), по 8 авто на страницу (Knockout.js).
- **Vehicle**: галерея до 20 фото, Extras (список опций), описание, характеристики, форма заявки, похожие авто.
- **Finance & Insurance**: онлайн-заявка, PDF-анкеты (частное лицо и юрлицо), калькулятор: ставка 9–20% с шагом 0.25, срок 6–72 мес., депозит, trade-in.
- **Workshop**: 7 шагов (заявка → расчёт → забираем авто в радиусе 30 км → ремонт → контроль качества → оплата → доставка обратно), услуги: Minor/Major service, Brakes, Shocks, Engine overhaul, Diagnostics, Other.
- **About us**, **Contact us** (форма: имя, телефон, email, сообщение), **POPI Policy**.

## Данные об авто

Сток ведётся в DMS **VMG Software** и отдаётся JSON-фидом:
`/wp-content/themes/vmg-motors-theme/filterData.php`. Снимок стока (с фото, опциями и описаниями) лежит в `data/vmg-snapshot.json`, импортёр: `src/lib/vmg.ts`.

Поля фида: `stock_code, make, model, variant, year, value, mile, colour, body_type, fuelType, transmission, condition, imageUrl, permaLink, dateString, ...`
Фото: `https://s3-eu-west-1.amazonaws.com/vmg.images.production/1057/1057_{id}_I{1..20}.jpg`

Срез на 04.10.2026:
- 39 авто, 19 марок (Ford 6, Volkswagen 5, BMW 4, Hyundai 3, Land Rover 3, Volvo 2, Toyota 2, Fiat 2, Chevrolet 2 и ещё 10 марок по одному авто)
- Кузов: SUV 17, Hatchback 17, Sedan 2, Bakkie 2
- Цены от R 79 995 до R 599 995, средняя R 253 585, стоимость всего стока R 9 889 805

Типовой «подвал» в каждом описании: optional 2-year Prestige unlimited km warranty · finance through all major banks · trade-ins welcome · nationwide delivery on request. В админке это стоит вынести в один переключатель.

## Проблемы текущего сайта

- Два дублирующих меню (десктоп и мобильное) и тяжёлая шапка; на телефоне адрес раскрывается по тапу на иконку.
- На странице авто весь блок контента выводится дважды.
- Кнопка WhatsApp закомментирована, номер в ней некорректный.
- Часть фото грузится по `http://` (mixed content).
- Сломанные символы и опечатки в описаниях («??» вместо эмодзи, «m,echanical»).
- Нет meta description и Open Graph: ссылки в соцсетях и мессенджерах без превью.
- В слайдере стоковый Ferrari, а не реальные авто из наличия.
- Ежемесячный платёж в карточках не показывается (поле `installment` = 0).
