// 极简 MQTT 3.1.1 客户端（WebSocket，QoS 0），只实现本游戏用到的功能
const MqttLite = (() => {
  const te = new TextEncoder(), td = new TextDecoder();
  const str = s => { const b = te.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
  function packet(type, body) {
    const len = []; let n = body.length;
    do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0);
    const out = new Uint8Array(1 + len.length + body.length);
    out[0] = type; out.set(len, 1); out.set(body, 1 + len.length); return out;
  }

  function connect(url, opt = {}) {
    const ev = {}, subs = new Set();
    let ws = null, buf = new Uint8Array(0), pid = 1, ping = null, closed = false, retry = null;
    const c = {
      connected: false,
      on(e, f) { (ev[e] = ev[e] || []).push(f); return c; },
      off(e, f) { ev[e] = (ev[e] || []).filter(x => x !== f); },
      subscribe(t) { subs.add(t); if (c.connected) sendSub(t); },
      unsubscribe(t) { subs.delete(t); if (c.connected) { const n = nid(); send(packet(0xa2, [n >> 8, n & 255, ...str(t)])); } },
      publish(t, msg, retain) { const b = te.encode(msg); if (c.connected) send(packet(0x30 | (retain ? 1 : 0), [...str(t), ...b])); return c.connected; },
      end() { closed = true; clearInterval(ping); clearTimeout(retry); try { ws && ws.close(); } catch (e) { } },
    };
    const emit = (e, ...a) => (ev[e] || []).forEach(f => f(...a));
    const send = p => { try { ws.send(p); } catch (e) { } };
    const nid = () => { pid = pid % 65535 + 1; return pid; };
    const sendSub = t => { const n = nid(); send(packet(0x82, [n >> 8, n & 255, ...str(t), 0])); };

    function open() {
      ws = new WebSocket(url, ['mqtt']); ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        const id = 'ecg' + Math.random().toString(36).slice(2, 12);
        send(packet(0x10, [...str('MQTT'), 4, 2, 0, 30, ...str(id)]));
      };
      ws.onmessage = e => {
        const add = new Uint8Array(e.data), nb = new Uint8Array(buf.length + add.length);
        nb.set(buf); nb.set(add, buf.length); buf = nb;
        // 一个 WebSocket 帧可能包含多个或半个 MQTT 包
        while (buf.length >= 2) {
          let mul = 1, len = 0, i = 1, d;
          do { if (i >= buf.length) return; d = buf[i++]; len += (d & 127) * mul; mul *= 128; } while (d & 128);
          if (buf.length < i + len) return;
          handle(buf[0], buf.subarray(i, i + len));
          buf = buf.slice(i + len);
        }
      };
      ws.onclose = () => {
        const was = c.connected; c.connected = false; clearInterval(ping); buf = new Uint8Array(0);
        if (was) emit('offline');
        if (!closed) retry = setTimeout(open, 2000);
      };
      ws.onerror = () => emit('error', new Error('ws error'));
    }
    function handle(h, b) {
      const type = h >> 4;
      if (type === 2) {
        if (b[1] !== 0) return emit('error', new Error('refused ' + b[1]));
        c.connected = true;
        subs.forEach(sendSub);
        ping = setInterval(() => send(packet(0xc0, [])), 20000);
        emit('connect');
      } else if (type === 3) {
        const tl = (b[0] << 8) | b[1], topic = td.decode(b.subarray(2, 2 + tl));
        let off = 2 + tl; if ((h >> 1) & 3) off += 2;
        emit('message', topic, td.decode(b.subarray(off)), !!(h & 1));
      }
    }
    open();
    return c;
  }
  return { connect };
})();
