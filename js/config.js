// ================= КОНФИГУРАЦИЯ =================
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'mafia-city-';
const MAX_PLAYERS = 16;
const MIN_PLAYERS = 4;

const PALETTE = [
  '#d9a44e', '#e05a4e', '#5aa06a', '#5a7bd8', '#b06ab3',
  '#4fa3a5', '#c76a3c', '#8a8f5f', '#a05674', '#5f8f4f',
  '#7a6cc4', '#c4a15a', '#d87093', '#6fa8dc', '#b8860b', '#9370db'
];

const ROLES = {
  mafia: {
    name: 'Мафия',
    icon: '🔪',
    desc: 'Ночью вы убиваете горожан. Днём — притворяйтесь мирным и отводите подозрения.'
  },
  don: {
    name: 'Дон мафии',
    icon: '🎩',
    desc: 'Глава семьи. Убиваете вместе с мафией и ночью можете искать шерифа.'
  },
  sheriff: {
    name: 'Шериф',
    icon: '⭐',
    desc: 'Ночью проверяете игроков и узнаёте, мафия ли они. Ведите город к победе.'
  },
  doctor: {
    name: 'Доктор',
    icon: '💉',
    desc: 'Ночью лечите одного игрока — можно себя. Нельзя лечить одного и того же дважды подряд.'
  },
  civilian: {
    name: 'Мирный житель',
    icon: '🌙',
    desc: 'Днём слушайте, спорьте и голосуйте. Найдите мафию, пока она не нашла вас.'
  }
};

const DEFAULT_SETTINGS = {
  sheriff: true,
  doctor: true,
  discuss: 120,
  vote: 45,
  night: 30,
  reveal: true
};

const DISCUSS_OPTIONS = [
  [60, '1 мин'], [90, '1.5 мин'], [120, '2 мин'], [180, '3 мин'], [300, '5 мин']
];

const VOTE_OPTIONS = [
  [30, '30 сек'], [45, '45 сек'], [60, '1 мин'], [90, '1.5 мин']
];

const NIGHT_OPTIONS = [
  [20, '20 сек'], [30, '30 сек'], [45, '45 сек'], [60, '1 мин']
];