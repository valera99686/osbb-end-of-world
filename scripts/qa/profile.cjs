// A save of a player who has been through a few raids, for the screenshots and the
// trailer. It needs `npm test` to have built .test-build once.
const path = require('node:path');

const TEST = path.resolve(__dirname, '../../.test-build');

// A player who has been through a few raids: everything unlocked and the story
// of the first screens already seen, so the hub shows its full self.
function veteran(extra = {}) {
  const M = require(path.join(TEST, 'model.js'));
  const D = require(path.join(TEST, 'data.js'));
  const R = require(path.join(TEST, 'residents.js'));
  const meta = M.initialMeta();
  Object.assign(meta, {
    wins: 8,
    runs: 19,
    kills: 1840,
    cores: 420,
    totalBosses: 9,
    totalMinibosses: 7,
    totalRescues: 22,
    tutorialDone: true,
    deaths: 11,
    bestHeat: 4,
    heatUnlocked: 5,
    playTime: 36000,
    scenesSeen: ['prologue', 'origins'],
    ...extra,
  });
  meta.unlocked = D.ITEMS.map((i) => i.id);
  meta.residents = Object.keys(R.RESIDENT_BY_ID);
  // What is earned is already known: no toast of new achievements over the shots.
  const A = require(path.join(TEST, 'achievements.js'));
  meta.achievements = A.newAchievements(meta, null, false);
  return { key: M.SAVE_KEY, value: M.saveData(meta, null) };
}

module.exports = { veteran };
