# 🏎️ Line Robot Simulator (Ufa-Dynamics Edition)

Интерактивный симулятор для тестирования, отладки и визуализации алгоритмов движения роботов по линии (Line Follower) с живой настройкой PID-регулятора, схемы шасси и конфигурации датчиков.

[![React 19](https://img.shields.io/badge/React-19.2-61dafb?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Electron](https://img.shields.io/badge/Electron-44.x-47848F?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

---

## ✨ Возможности симулятора

- 🧠 **Живой редактор кода (JavaScript)**:
  - Написание и модификация управляющей функции `loop(sensors, dt)` прямо во время движения.
  - Поддержка двух режимов редактора: полнофункциональный **Monaco Editor** (VS Code) и быстрый автономный текстовый редактор.
- 🖲️ **Интерактивное управление на трассе**:
  - Кликните в любое место трассы для мгновенного перемещения робота.
  - Зажмите и потяните мышь, чтобы задать угол и направление старта.
  - Автоматическая корректная установка на линию при смене типа траектории.
- ⚙️ **Гибкая конфигурация робота**:
  - Настройка колесной базы (Wheelbase) и диаметра колес.
  - Изменение количества инфракрасных датчиков (от 1 до 15).
  - Расстояние между датчиками и вынос планки сенсоров вперед.
  - Динамическая схема-чертеж шасси в реальном времени.
- 🏁 **Выбор трасс**:
  - **Восьмерка (Infinity)**: классическая сложная траектория с перекрестком и плавными радиусами.
  - **Овал (Oval)**: для скоростных тестов на разгон и демпфирование.
  - **Острые повороты (Sharp)**: проверка реакции на изломы 90°.
  - Регулировка ширины линии трассы (от 8 до 40 px).
- 📊 **Телеметрия в реальном времени**:
  - Нагрузка на левый и правый двигатель (в процентах).
  - Время прохождения заезда.
  - Визуальная индикация срабатывания каждого датчика (зеленый/красный свет).

---

## 🚀 Запуск и разработка

### Требования
- **Node.js** `>= 18`
- **npm** `>= 9`

### Установка зависимостей
```bash
npm install
```

### Запуск в режиме разработки (Desktop Electron)
```bash
npm run dev
```

### Сборка веб-версии
```bash
npm run build:web
```

### Сборка Windows установщика (.exe)
```bash
npm run build
```
Готовый установщик и распакованная версия будут сохранены в папке `release/`.

---

## 📝 Пример управляющего кода

```javascript
function loop(sensors, dt) {
  const midIndex = Math.floor(sensors.length / 2);
  let error = 0;
  let activeSensors = 0;
  
  for (let i = 0; i < sensors.length; i++) {
    const weight = i - midIndex;
    error += sensors[i] * weight;
    if (sensors[i] > 0.4) activeSensors++;
  }
  
  // Если линия потеряна, доворачиваем на месте
  if (activeSensors === 0) {
    return { leftSpeed: -0.4, rightSpeed: 0.4 };
  }

  const baseSpeed = 0.7;
  const kP = 0.4;
  const turn = error * kP;
  
  return {
    leftSpeed: baseSpeed + turn,
    rightSpeed: baseSpeed - turn
  };
}
```

---

## 📄 Лицензия

Распространяется под лицензией MIT.
Разработано для соревнований робототехники **Ufa-Dynamics**.
