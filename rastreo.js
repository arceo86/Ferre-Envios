console.info("Ferretería Granados Rastreo v5.1 · camioneta direccional cargado");

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";

import {
  doc,
  getFirestore,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBNC-Oh6i2wyZMRiailIoYZ8rzpjN-6wBo",
  authDomain: "ferreteria-envios.firebaseapp.com",
  projectId: "ferreteria-envios",
  storageBucket: "ferreteria-envios.firebasestorage.app",
  messagingSenderId: "871957193583",
  appId: "1:871957193583:web:e093c54efa0919b142be9a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ORIGEN = {
  lat: 20.922644,
  lng: -104.091522
};

const ICONO_CAMION =
  "https://lh3.googleusercontent.com/d/1BO70O8A3Qf0qPeoFoCqezV3G0sNZMkc4";

let mapa = null;
let marcadorOrigen = null;
let marcadorDestino = null;
let marcadorCamion = null;
let ClaseMarcadorCamionRotable = null;
let rumboCamionActual = 0;
let posicionAnteriorRumboCamion = null;
const OFFSET_RUMBO_CAMION = 90;

let cancelarRastreo = null;
let pedidoActual = null;
let posicionCamion = null;

let vistaInicialAjustada = false;
let animacionMarcadorId = null;
let ultimaRecepcionGpsMs = 0;
let ultimoObjetivoGps = null;

const $ = (id) => document.getElementById(id);

function obtenerClaseMarcadorCamionRotable() {
  if (ClaseMarcadorCamionRotable) {
    return ClaseMarcadorCamionRotable;
  }

  ClaseMarcadorCamionRotable = class extends google.maps.OverlayView {
    constructor({ map, position, imageUrl, width, height, title, heading = 0 }) {
      super();
      this.position = new google.maps.LatLng(position);
      this.imageUrl = imageUrl;
      this.width = width;
      this.height = height;
      this.title = title;
      this.visible = true;
      this.div = null;
      this.img = null;
      this.rotacionContinua = null;
      this.heading = heading;
      this.setMap(map);
    }

    onAdd() {
      const div = document.createElement("div");
      div.style.position = "absolute";
      div.style.width = `${this.width}px`;
      div.style.height = `${this.height}px`;
      div.style.zIndex = "20";
      div.style.display = this.visible ? "block" : "none";
      div.title = this.title;

      const img = document.createElement("img");
      img.src = this.imageUrl;
      img.alt = this.title;
      img.draggable = false;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "contain";
      img.style.display = "block";
      img.style.transformOrigin = "50% 50%";
      img.style.transition = "transform 420ms linear";
      img.style.filter = "drop-shadow(0 2px 2px rgba(0,0,0,.28))";

      div.appendChild(img);
      this.div = div;
      this.img = img;
      this.getPanes().overlayLayer.appendChild(div);
      this.setHeading(this.heading);
    }

    draw() {
      if (!this.div || !this.position) return;
      const pixel = this.getProjection()?.fromLatLngToDivPixel(this.position);
      if (!pixel) return;

      this.div.style.left = `${pixel.x - this.width / 2}px`;
      this.div.style.top = `${pixel.y - this.height / 2}px`;
    }

    onRemove() {
      this.div?.remove();
      this.div = null;
      this.img = null;
    }

    setPosition(position) {
      this.position = position instanceof google.maps.LatLng
        ? position
        : new google.maps.LatLng(position);
      this.draw();
    }

    getPosition() {
      return this.position;
    }

    setVisible(visible) {
      this.visible = Boolean(visible);
      if (this.div) {
        this.div.style.display = this.visible ? "block" : "none";
      }
    }

    setHeading(valor) {
      const heading = ((Number(valor) % 360) + 360) % 360;
      this.heading = heading;
      const objetivoBase = heading + OFFSET_RUMBO_CAMION;

      if (this.rotacionContinua === null) {
        this.rotacionContinua = objetivoBase;
      } else {
        const actual = ((this.rotacionContinua % 360) + 360) % 360;
        const objetivo = ((objetivoBase % 360) + 360) % 360;
        const diferencia = ((objetivo - actual + 540) % 360) - 180;
        this.rotacionContinua += diferencia;
      }

      if (this.img) {
        this.img.style.transform = `rotate(${this.rotacionContinua}deg)`;
      }
    }
  };

  return ClaseMarcadorCamionRotable;
}

function crearMarcadorCamionRotable(opciones) {
  const Clase = obtenerClaseMarcadorCamionRotable();
  return new Clase(opciones);
}

function normalizarRumbo(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) return null;
  return ((numero % 360) + 360) % 360;
}

function calcularRumbo(origen, destino) {
  if (!origen || !destino) return null;

  const aRad = (grados) => grados * Math.PI / 180;
  const lat1 = aRad(origen.lat);
  const lat2 = aRad(destino.lat);
  const dLng = aRad(destino.lng - origen.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const grados = Math.atan2(y, x) * 180 / Math.PI;
  return ((grados % 360) + 360) % 360;
}

function distanciaAproxMetros(a, b) {
  if (!a || !b) return 0;
  const latPromedio = (a.lat + b.lat) / 2 * Math.PI / 180;
  const metrosLat = (b.lat - a.lat) * 111320;
  const metrosLng = (b.lng - a.lng) * 111320 * Math.cos(latPromedio);
  return Math.hypot(metrosLat, metrosLng);
}

function obtenerRumboCamion(data, nuevaPosicion) {
  const rumboGps = normalizarRumbo(
    data.ubicacionRepartidor?.direccion
  );
  const velocidad = Math.max(
    Number(data.ubicacionRepartidor?.velocidad || 0),
    0
  );

  const movimiento = posicionAnteriorRumboCamion
    ? distanciaAproxMetros(posicionAnteriorRumboCamion, nuevaPosicion)
    : 0;

  if (rumboGps !== null && (velocidad >= 0.7 || !posicionAnteriorRumboCamion)) {
    rumboCamionActual = rumboGps;
  } else if (posicionAnteriorRumboCamion && movimiento >= 1.5) {
    rumboCamionActual =
      calcularRumbo(posicionAnteriorRumboCamion, nuevaPosicion) ??
      rumboCamionActual;
  } else if (rumboGps !== null && posicionAnteriorRumboCamion === null) {
    rumboCamionActual = rumboGps;
  }

  posicionAnteriorRumboCamion = { ...nuevaPosicion };
  return rumboCamionActual;
}

function obtenerPedidoId() {
  return (
    new URLSearchParams(window.location.search)
      .get("pedido")
      ?.trim() || ""
  );
}

function mostrarError(mensaje) {
  const elemento = $("mensajeError");
  elemento.style.display = "block";
  elemento.textContent = mensaje;
}

function ocultarError() {
  $("mensajeError").style.display = "none";
  $("mensajeError").textContent = "";
}

function formatearDistancia(metros) {
  const numero = Number(metros);

  if (!Number.isFinite(numero)) return "—";
  if (numero < 1000) return `${Math.round(numero)} m`;

  return `${(numero / 1000).toFixed(2)} km`;
}

function formatearFecha(timestamp) {
  if (!timestamp) return "Sin actualización";

  const fecha =
    typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : timestamp.seconds
        ? new Date(timestamp.seconds * 1000)
        : new Date(timestamp);

  if (Number.isNaN(fecha.getTime())) {
    return "Sin actualización";
  }

  return fecha.toLocaleString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  });
}

function configurarEstado(estado) {
  const etiqueta = $("estadoTexto");
  const titulo = $("tituloPrincipal");

  const estados = {
    asignado: {
      texto: "ASIGNADO",
      color: "#1565c0",
      titulo: "Tu pedido fue asignado"
    },

    en_preparacion: {
      texto: "PREPARANDO",
      color: "#f9ab00",
      titulo: "Estamos preparando tu material"
    },

    en_camino: {
      texto: "EN CAMINO",
      color: "#d32f2f",
      titulo: "Tu material está en camino"
    },

    entregado: {
      texto: "ENTREGADO",
      color: "#2e7d32",
      titulo: "¡Tu material ha llegado!"
    },

    cancelado: {
      texto: "CANCELADO",
      color: "#667085",
      titulo: "El pedido fue cancelado"
    }
  };

  const config = estados[estado] || {
    texto: "PENDIENTE",
    color: "#667085",
    titulo: "Consultando el estado del pedido"
  };

  etiqueta.textContent = config.texto;
  etiqueta.style.background = config.color;
  titulo.textContent = config.titulo;
}

function obtenerDestino(pedido) {
  const latitud = Number(
    pedido?.destino?.latitud ??
    pedido?.latitud
  );

  const longitud = Number(
    pedido?.destino?.longitud ??
    pedido?.longitud
  );

  if (
    !Number.isFinite(latitud) ||
    !Number.isFinite(longitud)
  ) {
    return null;
  }

  return {
    lat: latitud,
    lng: longitud
  };
}

function obtenerPosicionRepartidor(pedido) {
  const latitud = Number(
    pedido?.ubicacionRepartidor?.latitud
  );

  const longitud = Number(
    pedido?.ubicacionRepartidor?.longitud
  );

  if (
    !Number.isFinite(latitud) ||
    !Number.isFinite(longitud)
  ) {
    return null;
  }

  return {
    lat: latitud,
    lng: longitud
  };
}

function posicionesIguales(a, b, tolerancia = 0.0000002) {
  if (!a || !b) return false;
  return (
    Math.abs(a.lat - b.lat) <= tolerancia &&
    Math.abs(a.lng - b.lng) <= tolerancia
  );
}

function animarMarcador(
  marcador,
  nuevaPosicion
) {
  if (posicionesIguales(ultimoObjetivoGps, nuevaPosicion)) {
    return;
  }

  const ahoraRecepcion = performance.now();
  const intervalo = ultimaRecepcionGpsMs
    ? ahoraRecepcion - ultimaRecepcionGpsMs
    : 2200;

  ultimaRecepcionGpsMs = ahoraRecepcion;
  ultimoObjetivoGps = { ...nuevaPosicion };

  /*
   * La animación ocupa casi todo el tiempo entre muestras GPS.
   * Así la camioneta no avanza, se detiene y vuelve a saltar.
   */
  const duracion = Math.min(
    Math.max(intervalo * 1.08, 1400),
    3400
  );

  if (animacionMarcadorId) {
    cancelAnimationFrame(animacionMarcadorId);
  }

  const inicio = marcador.getPosition();

  if (!inicio) {
    marcador.setPosition(nuevaPosicion);
    return;
  }

  const latInicial = inicio.lat();
  const lngInicial = inicio.lng();

  const salto = Math.hypot(
    nuevaPosicion.lat - latInicial,
    nuevaPosicion.lng - lngInicial
  );

  if (salto > 0.025) {
    marcador.setPosition(nuevaPosicion);
    return;
  }

  const tiempoInicial = performance.now();

  function cuadro(tiempoActual) {
    const progreso = Math.min(
      (tiempoActual - tiempoInicial) / duracion,
      1
    );

    marcador.setPosition({
      lat: latInicial +
        (nuevaPosicion.lat - latInicial) * progreso,
      lng: lngInicial +
        (nuevaPosicion.lng - lngInicial) * progreso
    });

    if (progreso < 1) {
      animacionMarcadorId =
        requestAnimationFrame(cuadro);
    } else {
      animacionMarcadorId = null;
    }
  }

  animacionMarcadorId =
    requestAnimationFrame(cuadro);
}

function centrarRecorrido() {
  if (!mapa) return;

  const puntos = [ORIGEN];
  const destino = obtenerDestino(pedidoActual);

  if (destino) puntos.push(destino);
  if (posicionCamion) puntos.push(posicionCamion);

  if (puntos.length === 1) {
    mapa.setCenter(ORIGEN);
    mapa.setZoom(16);
    return;
  }

  const bounds = new google.maps.LatLngBounds();

  puntos.forEach((punto) => {
    bounds.extend(punto);
  });

  mapa.fitBounds(bounds, {
    top: 80,
    right: 60,
    bottom: 80,
    left: 60
  });
}

function ajustarVistaSoloUnaVez() {
  if (vistaInicialAjustada) return;

  vistaInicialAjustada = true;

  /*
   * Se encuadra una sola vez. Las siguientes
   * actualizaciones solamente mueven el vehículo,
   * sin cambiar el zoom elegido por el cliente.
   */
  window.setTimeout(centrarRecorrido, 120);
}

function actualizarPantalla(pedidoId, data) {
  pedidoActual = data;

  $("pedidoIdTexto").textContent = pedidoId;

  $("subtituloDestino").textContent =
    data.direccionCorta ||
    data.direccion ||
    "Dirección de entrega";

  $("distanciaTexto").textContent =
    formatearDistancia(
      data.distanciaEstimadaMetros
    );

  $("nombreRepartidor").textContent =
    data.repartidorNombre ||
    "Repartidor asignado";

  $("ultimaActualizacion").textContent =
    formatearFecha(data.ultimaActualizacion);

  configurarEstado(data.estado);

  const destino = obtenerDestino(data);

  if (destino) {
    marcadorDestino.setPosition(destino);
    marcadorDestino.setVisible(true);
  } else {
    marcadorDestino.setVisible(false);
  }

  const nuevaPosicion =
    obtenerPosicionRepartidor(data);

  if (nuevaPosicion) {
    posicionCamion = nuevaPosicion;
    marcadorCamion.setVisible(true);

    const rumboCamion = obtenerRumboCamion(
      data,
      nuevaPosicion
    );

    marcadorCamion.setHeading(rumboCamion);

    animarMarcador(
      marcadorCamion,
      nuevaPosicion
    );

    const velocidadKmh = Math.max(
      Number(
        data.ubicacionRepartidor?.velocidad || 0
      ) * 3.6,
      0
    );

    $("detalleRepartidor").textContent =
      data.estado === "en_camino"
        ? `En reparto · ${Math.round(velocidadKmh)} km/h`
        : "Ubicación disponible";
  } else {
    marcadorCamion.setVisible(false);

    $("detalleRepartidor").textContent =
      "Esperando ubicación";
  }

  ajustarVistaSoloUnaVez();
}

function escucharRastreoPublico(pedidoId) {
  if (cancelarRastreo) {
    cancelarRastreo();
  }

  cancelarRastreo = onSnapshot(
    doc(db, "rastreoPublico", pedidoId),

    (snapshot) => {
      if (!snapshot.exists()) {
        configurarEstado("no_existe");

        $("tituloPrincipal").textContent =
          "Pedido no encontrado";

        mostrarError(
          "El pedido no existe o el enlace de seguimiento no es válido."
        );

        return;
      }

      ocultarError();
      actualizarPantalla(
        pedidoId,
        snapshot.data()
      );
    },

    (error) => {
      console.error(
        "Error leyendo rastreo público:",
        error
      );

      configurarEstado("error");

      mostrarError(
        "No fue posible consultar el seguimiento público."
      );
    }
  );
}

function iniciarAplicacion() {
  mapa = new google.maps.Map(
    $("mapa"),
    {
      center: ORIGEN,
      zoom: 16,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "greedy"
    }
  );

  marcadorOrigen = new google.maps.Marker({
    map: mapa,
    position: ORIGEN,
    title: "Ferretería Granados",
    label: {
      text: "F",
      color: "#ffffff",
      fontWeight: "800"
    }
  });

  marcadorDestino = new google.maps.Marker({
    map: mapa,
    visible: false,
    title: "Destino de entrega",
    icon:
      "https://maps.google.com/mapfiles/ms/icons/red-dot.png"
  });

  marcadorCamion = crearMarcadorCamionRotable({
    map: mapa,
    position: ORIGEN,
    imageUrl: ICONO_CAMION,
    width: 58,
    height: 39,
    title: "Repartidor",
    heading: 0
  });

  marcadorCamion.setVisible(false);

  $("btnCentrarMapa").addEventListener(
    "click",
    centrarRecorrido
  );

  const pedidoId = obtenerPedidoId();

  if (!pedidoId) {
    configurarEstado("no_existe");

    $("tituloPrincipal").textContent =
      "Falta el número de pedido";

    mostrarError(
      "Este enlace no contiene el parámetro ?pedido=ID_DEL_PEDIDO."
    );

    return;
  }

  escucharRastreoPublico(pedidoId);
}

if (window.mapaListo) {
  iniciarAplicacion();
} else {
  window.addEventListener(
    "google-maps-ready",
    iniciarAplicacion,
    { once: true }
  );
}

window.addEventListener(
  "beforeunload",
  () => {
    cancelarRastreo?.();

    if (animacionMarcadorId) {
      cancelAnimationFrame(
        animacionMarcadorId
      );
    }
  }
);
