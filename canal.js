/* HCM · Aula en vivo — canal de comunicación entre el celular y la pantalla.
   Dos vías al mismo tiempo:
     · mismo dispositivo  → BroadcastChannel / localStorage (sin internet)
     · dispositivos distintos → el Apps Script del HCM (acciones aula_set / aula_get)
   El celular manda "ops" y la pantalla las aplica en orden.                     */
(function (global) {
  'use strict';

  function Canal(sala, rol, alRecibir) {
    this.yo = (rol || 'x') + '-' + Math.random().toString(36).slice(2, 9);
    this.sala = String(sala || '301');
    this.rol = rol;                   // 'control' | 'pantalla'
    this.alRecibir = alRecibir || function () {};
    this.clave = 'hcm-aula-' + this.sala;
    /* el endpoint se consulta cada vez: puede llegar después, de servidor.json */
    this.visto = 0;
    this.primera = true;        // la primera respuesta no revive la clase anterior
    this.cola = [];
    this.enviando = false;
    this.ultimoCambio = 0;
    this.estado = { local: false, remoto: Canal.endpoint() ? 'esperando' : 'apagado' };
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

    var arranca = function () { if (Canal.endpoint() && !yo._sondeando) { yo._sondeando = true; yo.sondear(); } };
    if (Canal.endpoint()) arranca();
    else Canal.buscarServidor(function () { yo.estado.remoto = 'esperando'; arranca(); });
  }

  Canal._auto = '';          // servidor del HCM publicado en servidor.json
  Canal.endpoint = function () {
    var g = '';
    try { g = localStorage.getItem('hcm_aula_endpoint') || ''; } catch (e) {}
    return g || Canal._auto || '';
  };
  /* Busca el servidor del Colegio sin que nadie tenga que configurarlo. */
  Canal.buscarServidor = function (alTener) {
    fetch('servidor.json?v=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.url) { Canal._auto = String(d.url).trim(); if (alTener) alTener(Canal._auto); }
      })
      .catch(function () {});
  };
  Canal.guardarEndpoint = function (url) {
    try { localStorage.setItem('hcm_aula_endpoint', (url || '').trim()); } catch (e) {}
  };

  /* ── salida ─────────────────────────────────────────────────────────────── */
  Canal.prototype.enviar = function (op) {
    if (this.muerto) return;
    op.t_ = Date.now();
    op.o = this.yo;
    var paq = [op];
    if (this.bc) { try { this.bc.postMessage(paq); } catch (e) {} }
    try { localStorage.setItem(this.clave, JSON.stringify({ ops: paq, r: Math.random() })); } catch (e) {}
    if (Canal.endpoint()) { this.cola.push(op); this.vaciar(); }
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
        if (yo.cola.length) setTimeout(function () { yo.vaciar(); }, 30);
      })
      .catch(function () {
        yo.estado.remoto = 'error';
        yo.enviando = false;
        setTimeout(function () { yo.vaciar(); }, 1500);
      });
  };

  /* ── entrada (solo la pantalla sondea) ──────────────────────────────────── */
  Canal.prototype.cerrar = function () {
    this.muerto = true;
    try { if (this.bc) this.bc.close(); } catch (e) {}
  };
  Canal.prototype.sondear = function () {
    var yo = this;
    function vuelta() {
      if (yo.muerto) return;
      yo.pedir({ accion: 'aula_get', sala: yo.sala, desde: yo.visto })
        .then(function (r) {
          if (r && r.ok) {
            yo.estado.remoto = 'conectado';
            if (yo.primera) {
              /* al entrar, la sala puede traer lo que hizo el grupo anterior:
                 se toma nota del punto actual y se ignora el historial */
              if (typeof r.n === 'number') yo.visto = r.n;
              yo.primera = false;
            } else if (r.ops && r.ops.length) {
              yo.visto = r.n;
              yo.ultimoCambio = Date.now();
              yo.hayNuevo = true;        // si vino algo, vuelve a preguntar de inmediato
              yo.recibe(r.ops, 'remoto');
            }
          }
        })
        .catch(function () { yo.estado.remoto = 'error'; })
        .then(function () {
          // pegadito mientras hay movimiento, tranquilo cuando no pasa nada
          var desde = Date.now() - yo.ultimoCambio;
          var espera = yo.hayNuevo ? 0 : (desde < 10000 ? 220 : (desde < 60000 ? 700 : 1500));
          yo.hayNuevo = false;
          setTimeout(vuelta, espera);
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
      if (op.o && op.o === this.yo) continue;   // es un eco de uno mismo
      var id = (op.t_ || 0) + '|' + op.t + '|' + (op.n || '');
      this.vistos = this.vistos || {};
      if (this.vistos[id]) continue;        // no repetir lo que ya llegó por la otra vía
      this.vistos[id] = 1;
      try { this.alRecibir(op, via); } catch (e) {}
    }
  };

  Canal.prototype.pedir = function (cuerpo) {
    return fetch(Canal.endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cuerpo)
    }).then(function (r) { return r.json(); });
  };

  global.Canal = Canal;
})(window);
