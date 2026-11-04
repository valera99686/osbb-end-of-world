// Chat of an online room: what a line may be, how fast a partner may send them,
// how the session keeps and tells them, and the voice state it relays.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Chat = require('../.test-build/chat.js');
const N = require('../.test-build/net.js');
const SS = require('../.test-build/session.js');

function wireUp(voice = false) {
  const toGuest = [],
    toHost = [];
  const mk = (out, inbox) => {
    const l = {
      kind: 'p2p',
      voice: voice ? { send() {}, stop() {}, replace: () => false, onStream: null, stream: null } : undefined,
      onMessage: null,
      onClose: null,
      send: (m) => out.push(JSON.parse(JSON.stringify(m))),
      close() {},
    };
    return { l, pump: () => inbox.splice(0).forEach((m) => l.onMessage?.(m)) };
  };
  const h = mk(toGuest, toHost),
    g = mk(toHost, toGuest);
  const host = new SS.NetSession('host', 'x', { hero: 'mechanic', name: 'Петро' });
  const guest = new SS.NetSession('guest', 'x', { hero: 'flora', name: 'Флора' });
  host.adopt(h.l);
  guest.adopt(g.l);
  const pump = () => {
    for (let i = 0; i < 4; i++) {
      h.pump();
      g.pump();
    }
  };
  pump();
  return { host, guest, pump, toHost, toGuest, hl: h.l, gl: g.l };
}

test('A line is cleaned, cut short and refused when nothing is left', () => {
  assert.equal(Chat.cleanChat('  привіт   друже  '), 'привіт друже');
  assert.equal(Chat.cleanChat('a\u0000b\u0007c\nd'), 'a b c d', 'control characters are spaces');
  assert.equal(Chat.cleanChat('x‮y'), 'x y', 'text-direction tricks are gone');
  assert.equal(Chat.cleanChat('x'.repeat(500)).length, Chat.CHAT.max);
  assert.equal(Chat.cleanChat('😀'.repeat(300)).length, Chat.CHAT.max * 2, 'counted in characters, not halves');
  for (const bad of ['', '   ', '\n\t', null, undefined, 5, {}, []])
    assert.equal(Chat.cleanChat(bad), null, String(bad));
});

test('Quick phrases are known by their number only', () => {
  assert.ok(Chat.QUICK.length >= 8);
  assert.equal(Chat.quickText(0), Chat.QUICK[0]);
  assert.equal(Chat.quickText(Chat.QUICK.length - 1), Chat.QUICK[Chat.QUICK.length - 1]);
  for (const bad of [-1, Chat.QUICK.length, 1.5, '1', null, undefined, NaN])
    assert.equal(Chat.quickText(bad), null, String(bad));
});

test('A partner who sends too many lines too fast is not heard', () => {
  const lim = new Chat.ChatLimiter();
  let heard = 0;
  for (let i = 0; i < 20; i++) if (lim.allow(1000 + i)) heard++;
  assert.equal(heard, Chat.CHAT.burst);
  assert.ok(lim.allow(1000 + Chat.CHAT.window + 100), 'and they are heard again later');
});

test('Lines go both ways, are kept in order and counted as unread until the panel opens', () => {
  const { host, guest, pump } = wireUp();
  assert.equal(host.say('Привіт!'), true);
  assert.equal(guest.say('  Чую   тебе '), true);
  assert.equal(host.sayQuick(1), true);
  pump();
  // Each end lists what it said at once and what it heard when it came.
  assert.deepEqual(host.chat.map((l) => [l.mine, l.text]), [
    [true, 'Привіт!'],
    [true, Chat.QUICK[1]],
    [false, 'Чую тебе'],
  ]);
  assert.deepEqual(guest.chat.map((l) => [l.mine, l.text]), [
    [true, 'Чую тебе'],
    [false, 'Привіт!'],
    [false, Chat.QUICK[1]],
  ]);
  assert.equal(guest.unread, 2);
  assert.equal(host.unread, 1, 'only the partner\'s lines are unread');
  let said = null;
  guest.onChat = (l) => (said = l.text);
  host.say('Ще одне');
  pump();
  assert.equal(said, 'Ще одне');
  assert.equal(guest.unread, 3);
  guest.openChat(true);
  assert.equal(guest.unread, 0);
  host.say('І ще');
  pump();
  assert.equal(guest.unread, 0, 'read at once while the panel is open');
  assert.equal(guest.chat.at(-1).text, 'І ще');
  // The ids only grow.
  const ids = guest.chat.map((l) => l.id);
  assert.deepEqual([...ids].sort((a, b) => a - b), ids);
});

test('Empty lines, bad numbers and a flood from the partner are dropped; the log is bounded', () => {
  const { host, guest, pump, gl } = wireUp();
  assert.equal(host.say('   '), false);
  assert.equal(host.sayQuick(999), false);
  assert.equal(host.chat.length, 0);
  for (const bad of [
    { t: 'chat' },
    { t: 'chat', text: 7 },
    { t: 'chat', text: '  ' },
    { t: 'chat', q: 99 },
    { t: 'chat', q: 'x' },
  ])
    gl.send(bad);
  pump();
  assert.equal(host.chat.length, 0);
  // A partner who floods is only heard so fast.
  for (let i = 0; i < 40; i++) guest.say('спам ' + i);
  pump();
  assert.equal(host.chat.length, Chat.CHAT.burst);
  // A very long line is cut to the limit at the receiving end too.
  const fresh = wireUp();
  fresh.gl.send({ t: 'chat', text: 'z'.repeat(5000) });
  fresh.pump();
  assert.equal(fresh.host.chat[0].text.length, Chat.CHAT.max);
  // The log keeps only the last lines.
  const long = wireUp();
  for (let i = 0; i < Chat.CHAT.keep + 20; i++) {
    long.host.say('рядок ' + i);
    if (i % 3 === 2) long.pump();
  }
  assert.equal(long.host.chat.length, Chat.CHAT.keep);
  assert.equal(long.host.chat.at(-1).text, 'рядок ' + (Chat.CHAT.keep + 19));
});

test('Nothing is said to nobody: before the room is joined, and after it is gone', () => {
  const lone = new SS.NetSession('host', 'x', { hero: 'mechanic', name: 'П' });
  assert.equal(lone.say('hi'), false);
  assert.equal(lone.sayQuick(0), false);
  const { host, guest } = wireUp();
  host.close();
  assert.equal(host.say('hi'), false);
  assert.equal(guest.phase, 'connected', 'the guest has not heard the goodbye yet');
});

test('The partner\'s microphone is told, and forgotten when the link goes', () => {
  const { host, guest, pump } = wireUp(true);
  assert.ok(host.voiceLink && guest.voiceLink, 'a direct link can carry sound');
  assert.equal(guest.partnerMic, false);
  host.tellMic(true);
  pump();
  assert.equal(guest.partnerMic, true);
  host.tellMic(false);
  pump();
  assert.equal(guest.partnerMic, false);
  host.tellMic(true);
  pump();
  assert.equal(guest.partnerMic, true);
  guest.close();
  assert.equal(guest.partnerMic, true, 'closing is the other end\'s business');
  // A relay link has no sound.
  const relay = wireUp(false);
  assert.equal(relay.host.voiceLink, null);
});

test('The chat protocol is a new one', () => {
  assert.equal(N.NET_PROTOCOL, 7);
});
