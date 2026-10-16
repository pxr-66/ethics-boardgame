// 联机层：基于公共 MQTT 服务器（WebSocket）中转，房主端为权威
// 主题：<PREFIX>/<房间码>/state（房主发布，保留消息）  /up（玩家上行）
const Net = (() => {
  const PREFIX = 'ethics-chip-game/v1';
  const BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
  ];
  let client = null, code = null, handlers = {}, subs = [];

  function tryConnect(url) {
    return new Promise((res, rej) => {
      const c = MqttLite.connect(url);
      const timer = setTimeout(() => { c.end(); rej(new Error('timeout')); }, 8000);
      c.on('connect', function first() { c.off('connect', first); clearTimeout(timer); res(c); });
    });
  }

  // 所有玩家必须连到同一个服务器，因此按固定顺序尝试
  async function connect() {
    if (client) return;
    let lastErr;
    for (const url of BROKERS) {
      try { client = await tryConnect(url); break; } catch (e) { lastErr = e; }
    }
    if (!client) throw lastErr || new Error('无法连接服务器');
    client.on('message', (topic, text) => {
      if (!code || !topic.startsWith(`${PREFIX}/${code}/`)) return;
      let msg; try { msg = text.length ? JSON.parse(text) : { closed: true }; } catch { return; }
      const kind = topic.split('/').pop();
      if (handlers[kind]) handlers[kind](msg);
    });
    client.on('offline', () => handlers.status && handlers.status(false));
    client.on('connect', () => handlers.status && handlers.status(true));
  }

  async function open(roomCode, h) {
    await connect();
    leave();
    code = roomCode; handlers = { ...h }; subs = [];
    for (const k of ['state', 'up']) if (h[k]) { subs.push(k); client.subscribe(`${PREFIX}/${code}/${k}`); }
  }
  function publishState(s) { if (client && code) client.publish(`${PREFIX}/${code}/state`, JSON.stringify(s), true); }
  function send(msg) { if (client && code) client.publish(`${PREFIX}/${code}/up`, JSON.stringify(msg)); }
  function clearRoom() { if (client && code) client.publish(`${PREFIX}/${code}/state`, '', true); }
  function leave() {
    if (client && code) subs.forEach(k => client.unsubscribe(`${PREFIX}/${code}/${k}`));
    code = null; subs = []; handlers = {};
  }
  // 读取房间的保留状态，判断房间是否存在
  async function peek(roomCode, ms = 3500) {
    await connect();
    return new Promise(res => {
      const t = `${PREFIX}/${roomCode}/state`;
      let done = false;
      const fin = v => { if (done) return; done = true; client.off('message', fn); if (code !== roomCode) client.unsubscribe(t); res(v); };
      const fn = (topic, text) => { if (topic !== t) return; try { fin(text.length ? JSON.parse(text) : null); } catch { fin(null); } };
      client.on('message', fn);
      client.subscribe(t);
      setTimeout(() => fin(null), ms);
    });
  }
  return { open, publishState, send, leave, peek, clearRoom, connect };
})();
