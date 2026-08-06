console.info("Ferretería Granados Rastreo v4 cargado");

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

let cancelarRastreo = null;
let pedidoActual = null;
let posicionCamion = null;

let vistaInicialAjustada = false;
let animacionMarcadorId = null;

const $ = (id) => document.getElementById(id);

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

function animarMarcador(
  marcador,
  nuevaPosicion,
  duracion = 1600
) {
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
  const tiempoInicial = performance.now();

  function cuadro(tiempoActual) {
    const progreso = Math.min(
      (tiempoActual - tiempoInicial) / duracion,
      1
    );

    marcador.setPosition({
      lat:
        latInicial +
        (nuevaPosicion.lat - latInicial) * progreso,

      lng:
        lngInicial +
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

  marcadorCamion = new google.maps.Marker({
    map: mapa,
    position: ORIGEN,
    visible: false,
    title: "Repartidor",
    optimized: false,

    icon: {
      url: ICONO_CAMION,
      scaledSize:
        new google.maps.Size(58, 39),

      /*
       * La imagen original tiene espacio debajo del
       * vehículo. Este anclaje coloca la coordenada
       * GPS debajo del centro de las ruedas y no al
       * borde inferior de la imagen.
       */
      anchor:
        new google.maps.Point(29, 31)
    },

    zIndex: 20
  });

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
