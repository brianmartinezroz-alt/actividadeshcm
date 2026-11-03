/* Transporte de respuestas: ntfy (aguanta muchos celulares a la vez).
   Un tema por sala. La pantalla escucha; los celulares publican.           */
(function (g) {
  'use strict';
  var BASE = 'https://ntfy.sh/';
  function tema(sala) { return 'hcmresp-' + String(sala || '301'); }

  function Sala(sala, alLlegar) {
    this.sala = String(sala || '301');
    this.tema = tema(this.sala);
    this.alLlegar = alLlegar || function () {};
    this.es = null;
    this.vivo = false;
  }
  Sala.prototype.escuchar = function () {
    var yo = this;
    if (this.es) { try { this.es.close(); } catch (e) {} }
    this.es = new EventSource(BASE + this.tema + '/sse');
    this.es.onopen = function () { yo.vivo = true; if (yo.alEstado) yo.alEstado(true); };
    this.es.onerror = function () { yo.vivo = false; if (yo.alEstado) yo.alEstado(false); };
    this.es.onmessage = function (e) {
      try {
        var d = JSON.parse(e.data);
        if (d.event !== 'message' || !d.message) return;
        yo.alLlegar(JSON.parse(d.message));
      } catch (x) {}
    };
  };
  Sala.prototype.cerrar = function () { if (this.es) { try { this.es.close(); } catch (e) {} this.es = null; } };
  Sala.prototype.manda = function (obj) {
    return fetch(BASE + this.tema, { method: 'POST', body: JSON.stringify(obj) })
      .then(function (r) { return r.ok; })
      .catch(function () { return false; });
  };
  g.Sala = Sala;
})(window);
