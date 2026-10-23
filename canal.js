/* HCM · Aula en vivo — canal de comunicación entre el celular y la pantalla.
   Dos vías al mismo tiempo:
     · mismo dispositivo  → BroadcastChannel / localStorage (sin internet)
     · dispositivos distintos → el Apps Script del HCM (acciones aula_set / aula_get)
   El celular manda "ops" y la pantalla las aplica en orden.                     */
(function (global) {
  'use strict';

  function Canal(sala, rol, alRecibir) {
    this.sala = String(sala || '301');
    this.rol = rol;                   // 'control' | 'pantalla'
    this.alRecibir = alRecibir || function () {};
    this.clave = 'hcm-aula-' + this.sala;
    this.endpoint = Canal.endpoint();
    this.visto = 0;
    this.cola = [];
    this.enviando = false;
    this.ultimoCambio = 0;
    this.estado = { local: false, remoto: this.endpoint ? 'esperando' : 'apagado' };
    var yo = this;

    try {
      this.bc = new BroadcastChannel(this.clave);
      this.bc.onmessage = function (e) { yo.recibe(e.data, 'local'); };
      this.estado.local = true;
    } catch (e) { this.bc = null; }

    global.addEventListener('storage', function (e) {
      if (e.key === yo.clave && e.newValue) {
        try { yo.recibe(JSON.parse(e.newValue).ops, 'local'); } catch (x) {}
      }
    });

    if (rol === 'pantalla' && this.endpoint) this.sondear();
  }

  Canal.endpoint = function () {
    try { return localStorage.getItem('hcm_aula_endpoint') || ''; } catch (e) { return ''; }
  };
  Canal.guardarEndpoint = function (url) {
    try { localStorage.setItem('hcm_aula_endpoint', (url || '').trim()); } catch (e) {}
  };

  /* ── salida ─────────────────────────────────────────────────────────────── */
  Canal.prototype.enviar = function (op) {
    op.t_ = Date.now();
    var paq = [op];
    if (this.bc) { try { this.bc.postMessage(paq); } catch (e) {} }
    try { localStorage.setItem(this.clave, JSON.stringify({ ops: paq, r: Math.random() })); } catch (e) {}
    if (this.endpoint) { this.cola.push(op); this.vaciar(); }
  };

  Canal.prototype.vaciar = function () {
    var yo = this;
    if (this.enviando || !this.cola.length) return;
    this.enviando = true;
    var lote = this.cola.splice(0, this.cola.length);
    this.pedir({ accion: 'aula_set', sala: this.sala, ops: lote })
      .then(function (r) {
        yo.estado.remoto = (r && r.ok) ? 'conectado' : 'error';
        yo.enviando = false;
        if (yo.cola.length) setTimeout(function () { yo.vaciar(); }, 120);
      })
      .catch(function () {
        yo.estado.remoto = 'error';
        yo.enviando = false;
        setTimeout(function () { yo.vaciar(); }, 1500);
      });
  };

  /* ── entrada (solo la pantalla sondea) ──────────────────────────────────── */
  Canal.prototype.sondear = function () {
    var yo = this;
    function vuelta() {
      yo.pedir({ accion: 'aula_get', sala: yo.sala, desde: yo.visto })
        .then(function (r) {
          if (r && r.ok) {
            yo.estado.remoto = 'conectado';
            if (r.ops && r.ops.length) {
              yo.visto = r.n;
              yo.ultimoCambio = Date.now();
              yo.recibe(r.ops, 'remoto');
            } else if (typeof r.n === 'number' && yo.visto === 0) {
              yo.visto = r.n;
            }
          }
        })
        .catch(function () { yo.estado.remoto = 'error'; })
        .then(function () {
          // rápido mientras hay movimiento, lento cuando no pasa nada
          var activo = Date.now() - yo.ultimoCambio < 8000;
          setTimeout(vuelta, activo ? 400 : 1800);
        });
    }
    vuelta();
  };

  Canal.prototype.recibe = function (ops, via) {
    if (!ops) return;
    if (!ops.length) ops = [ops];
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (!op || !op.t) continue;
      var id = (op.t_ || 0) + '|' + op.t + '|' + (op.n || '');
      this.vistos = this.vistos || {};
      if (this.vistos[id]) continue;        // no repetir lo que ya llegó por la otra vía
      this.vistos[id] = 1;
      try { this.alRecibir(op, via); } catch (e) {}
    }
  };

  Canal.prototype.pedir = function (cuerpo) {
    return fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cuerpo)
    }).then(function (r) { return r.json(); });
  };

  global.Canal = Canal;
})(window);
