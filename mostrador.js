console.info("Ferretería Granados Mostrador v8.7 cargado");

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";

    import {
      createUserWithEmailAndPassword,
      getAuth,
      onAuthStateChanged,
      signInWithEmailAndPassword,
      signOut
    } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

    import {
      addDoc,
      collection,
      deleteDoc,
      doc,
      getDoc,
      getDocs,
      onSnapshot,
      orderBy,
      query,
      serverTimestamp,
      setDoc,
      updateDoc
    } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

    import {
      getFirestore
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
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Una instancia secundaria permite crear otra cuenta sin cerrar
    // la sesión actual del despachador.
    const appCreacionUsuarios = initializeApp(firebaseConfig, "creacion-repartidores");
    const authCreacionUsuarios = getAuth(appCreacionUsuarios);

    const CONFIG = {
      empresa: {
        nombre: "Ferretería Granados",
        lat: 20.922644,
        lng: -104.091522
      },

      zona: {
        localidad: "San Andrés",
        municipio: "Magdalena",
        estado: "Jalisco",
        pais: "México",
        radioHabitualMetros: 1500,
        radioMaximoMetros: 5000
      },

      enlaceSeguimiento: "https://arceo86.github.io/Ferre-Envios/rastreo.html",

      pinVehiculoUrl:
        "https://lh3.googleusercontent.com/d/1BO70O8A3Qf0qPeoFoCqezV3G0sNZMkc4"
    };

    const calles = [
      "Calle 5 de Febrero",
      "Calle Allende",
      "Calle Colón",
      "Calle Degollado",
      "Calle Donato Guerra",
      "Calle Javier Mina",
      "Calle Francisco Villa",
      "Calle Hidalgo",
      "Calle Josefa Ortiz de Domínguez",
      "Calle López Mateos",
      "Calle Melchor Ocampo",
      "Calle Morelos",
      "Calle Prisciliano Sánchez",
      "Calle Vallarta",
      "Calle Zaragoza",
      "Privada Guadalupe Victoria",
      "Privada Guerrero",
      "Privada Herrera y Cairo",
      "Privada Lerdo de Tejada",
      "Privada López Cotilla",
      "Privada M. Miramontes",
      "Privada Manuel M. Diéguez",
      "Privada Mariano Jiménez"
    ];

    let mapa = null;
    let geocoder = null;
    let tipoMapaActual =
      localStorage.getItem("ferreteriaTipoMapa") ||
      "roadmap";
    let marcadorOrigen = null;
    let marcadorDestino = null;
    let circuloZona = null;

    let listaClientes = [];
    let listaRepartidores = [];
    let destinoActual = null;
    let pedidoActualId = localStorage.getItem("pedidoActualId") || "";
    let pedidosActivos = [];
    let cancelarEscuchaPedidosActivos = null;
    let pedidoTicketActual = null;

    let modoPinManual = false;
    let secuenciaGeocodificacion = 0;
    let secuenciaGeocodificacionInversa = 0;

    let cancelarEscuchaRepartidoresMapa = null;
    let infoRepartidorMapa = null;
    const marcadoresRepartidores = new Map();

    let cancelarEscuchaRastreoActivo = null;
    let pedidoRastreoActivoId = "";
    let repartidorRastreoActivoUID = "";
    let datosRastreoActivo = null;
    let marcadorDestinoRastreo = null;
    let marcadorVehiculoRastreo = null;
    let lineaRastreo = null;
    let vistaRastreoAjustada = false;

    const $ = (id) => document.getElementById(id);

    function mostrarEstado(elemento, mensaje, tipo = "") {
      elemento.textContent = mensaje;
      elemento.classList.remove("oculto", "estado-ok", "estado-alerta", "estado-error");

      if (tipo) {
        elemento.classList.add(`estado-${tipo}`);
      }
    }

    function limpiarEstado(elemento) {
      elemento.textContent = "";
      elemento.classList.add("oculto");
    }

    function escaparTexto(valor) {
      return String(valor ?? "").trim();
    }

    function obtenerDireccionCorta() {
      const calle = escaparTexto($("selectCalle").value);
      const numero = escaparTexto($("numExterior").value);

      if (!calle || !numero) {
        throw new Error("Selecciona la calle y escribe el número exterior.");
      }

      return `${calle} ${numero}`;
    }

    function obtenerDireccionCompleta() {
      const direccionCorta = obtenerDireccionCorta();

      return `${direccionCorta}, ${CONFIG.zona.localidad}, ${CONFIG.zona.municipio}, ${CONFIG.zona.estado}, ${CONFIG.zona.pais}`;
    }

    function radianes(grados) {
      return (grados * Math.PI) / 180;
    }

    function calcularDistanciaMetros(a, b) {
      const radioTierra = 6371000;
      const dLat = radianes(b.lat - a.lat);
      const dLng = radianes(b.lng - a.lng);

      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(radianes(a.lat)) *
          Math.cos(radianes(b.lat)) *
          Math.sin(dLng / 2) ** 2;

      return radioTierra * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    function formatearDistancia(metros) {
      if (!Number.isFinite(metros)) return "No disponible";
      if (metros < 1000) return `${Math.round(metros)} m`;
      return `${(metros / 1000).toFixed(2)} km`;
    }

    function crearBoundsLocales() {
      const centro = CONFIG.empresa;

      return new google.maps.LatLngBounds(
        {
          lat: centro.lat - 0.035,
          lng: centro.lng - 0.035
        },
        {
          lat: centro.lat + 0.035,
          lng: centro.lng + 0.035
        }
      );
    }

    function actualizarEstadoPin(
      tipo,
      mensaje
    ) {
      const elemento = $("pinManualEstado");

      elemento.classList.remove(
        "activo",
        "confirmado",
        "error"
      );

      if (tipo) {
        elemento.classList.add(tipo);
      }

      elemento.innerHTML = mensaje;
    }

    function activarModoPinManual() {
      modoPinManual = true;
      document.body.classList.add("modo-pin-manual");
      $("chipPinManual").classList.add("visible");
      $("btnModoPin").textContent = "✋ Cancelar selección";

      actualizarEstadoPin(
        "activo",
        "<strong>Selección manual activa.</strong> Toca el punto exacto en el mapa. Después podrás arrastrar el marcador para afinarlo."
      );
    }

    function desactivarModoPinManual() {
      modoPinManual = false;
      document.body.classList.remove("modo-pin-manual");
      $("chipPinManual").classList.remove("visible");
      $("btnModoPin").textContent = "📌 Elegir en el mapa";
    }

    function alternarModoPinManual() {
      if (modoPinManual) {
        desactivarModoPinManual();

        actualizarEstadoPin(
          "",
          "Selección manual cancelada. Puedes buscar la dirección o volver a elegir el punto en el mapa."
        );

        return;
      }

      activarModoPinManual();
    }

    function evaluarDestino(destino) {
      const distancia = calcularDistanciaMetros(
        CONFIG.empresa,
        destino
      );

      destinoActual = {
        lat: destino.lat,
        lng: destino.lng,
        distanciaMetros: Math.round(distancia),
        metodoUbicacion:
          destino.metodoUbicacion ||
          destinoActual?.metodoUbicacion ||
          "desconocido",
        direccionMapa:
          destino.direccionMapa ??
          destinoActual?.direccionMapa ??
          ""
      };

      $("chipDistancia").innerHTML = `
        <strong>Destino</strong>
        ${formatearDistancia(distancia)} desde la ferretería
      `;

      const coordenadas =
        `${destinoActual.lat.toFixed(6)}, ` +
        `${destinoActual.lng.toFixed(6)}`;

      if (distancia <= CONFIG.zona.radioHabitualMetros) {
        mostrarEstado(
          $("zonaEstado"),
          `Destino dentro de la zona habitual: ${formatearDistancia(distancia)}.`,
          "ok"
        );

        $("btnCrearPedido").disabled = false;

        actualizarEstadoPin(
          "confirmado",
          `<strong>Destino confirmado.</strong><br>` +
          `Coordenadas: ${coordenadas}` +
          (
            destinoActual.direccionMapa
              ? `<br>Referencia de Google: ${destinoActual.direccionMapa}`
              : ""
          )
        );

        return;
      }

      if (distancia <= CONFIG.zona.radioMaximoMetros) {
        mostrarEstado(
          $("zonaEstado"),
          `El destino está fuera del radio habitual de 1.5 km, pero sigue dentro del máximo configurado: ${formatearDistancia(distancia)}.`,
          "alerta"
        );

        $("btnCrearPedido").disabled = false;

        actualizarEstadoPin(
          "confirmado",
          `<strong>Destino confirmado fuera de la zona habitual.</strong><br>` +
          `Coordenadas: ${coordenadas}` +
          (
            destinoActual.direccionMapa
              ? `<br>Referencia de Google: ${destinoActual.direccionMapa}`
              : ""
          )
        );

        return;
      }

      mostrarEstado(
        $("zonaEstado"),
        `Atención: el destino está a ${formatearDistancia(distancia)}. Corrige el marcador antes de crear el pedido.`,
        "error"
      );

      $("btnCrearPedido").disabled = true;

      actualizarEstadoPin(
        "error",
        `<strong>El punto está fuera del radio permitido.</strong><br>` +
        `Coordenadas: ${coordenadas}`
      );
    }

    async function obtenerDireccionDelPin(
      posicion,
      secuencia
    ) {
      try {
        const respuesta = await geocoder.geocode({
          location: posicion
        });

        if (
          secuencia !== secuenciaGeocodificacionInversa ||
          !destinoActual
        ) {
          return;
        }

        const direccionMapa =
          respuesta.results?.[0]?.formatted_address || "";

        destinoActual.direccionMapa = direccionMapa;

        evaluarDestino({
          ...destinoActual,
          direccionMapa
        });
      } catch (error) {
        console.warn(
          "No fue posible obtener la referencia del pin:",
          error
        );
      }
    }

    function colocarDestino(
      posicion,
      centrar = true,
      metodoUbicacion = "geocodificada",
      direccionMapa = ""
    ) {
      if (!marcadorDestino) {
        marcadorDestino = new google.maps.Marker({
          map: mapa,
          position: posicion,
          title: "Destino de entrega",
          draggable: true,
          animation: google.maps.Animation.DROP
        });

        marcadorDestino.addListener("dragstart", () => {
          secuenciaGeocodificacionInversa += 1;

          actualizarEstadoPin(
            "activo",
            "<strong>Ajustando destino.</strong> Suelta el marcador en el punto exacto."
          );
        });

        marcadorDestino.addListener("dragend", () => {
          const posicionNueva =
            marcadorDestino.getPosition();

          const destino = {
            lat: posicionNueva.lat(),
            lng: posicionNueva.lng(),
            metodoUbicacion: "manual",
            direccionMapa: ""
          };

          evaluarDestino(destino);

          const secuencia =
            ++secuenciaGeocodificacionInversa;

          obtenerDireccionDelPin(
            {
              lat: destino.lat,
              lng: destino.lng
            },
            secuencia
          );
        });
      } else {
        marcadorDestino.setPosition(posicion);
        marcadorDestino.setMap(mapa);
      }

      if (centrar) {
        const bounds =
          new google.maps.LatLngBounds();

        bounds.extend(CONFIG.empresa);
        bounds.extend(posicion);

        mapa.fitBounds(bounds, 80);
      }

      evaluarDestino({
        ...posicion,
        metodoUbicacion,
        direccionMapa
      });

      const secuencia =
        ++secuenciaGeocodificacionInversa;

      obtenerDireccionDelPin(
        posicion,
        secuencia
      );
    }

    async function ubicarDestino() {
      const secuenciaActual =
        ++secuenciaGeocodificacion;

      desactivarModoPinManual();

      try {
        $("btnVistaPrevia").disabled = true;
        $("btnCrearPedido").disabled = true;

        mostrarEstado(
          $("zonaEstado"),
          "Buscando la dirección en Google Maps..."
        );

        actualizarEstadoPin(
          "activo",
          "<strong>Buscando dirección.</strong> Si el resultado no coincide, usa “Elegir en el mapa”."
        );

        const direccionCompleta =
          obtenerDireccionCompleta();

        const respuesta = await geocoder.geocode({
          address: direccionCompleta,
          bounds: crearBoundsLocales(),
          region: "mx",
          componentRestrictions: {
            country: "MX"
          }
        });

        if (
          secuenciaActual !==
          secuenciaGeocodificacion
        ) {
          return;
        }

        if (!respuesta.results?.length) {
          throw new Error(
            "Google Maps no encontró la dirección. Selecciona el punto manualmente."
          );
        }

        const resultado =
          respuesta.results[0];

        const ubicacion =
          resultado.geometry.location;

        colocarDestino(
          {
            lat: ubicacion.lat(),
            lng: ubicacion.lng()
          },
          true,
          "geocodificada",
          resultado.formatted_address || ""
        );
      } catch (error) {
        console.error(error);

        if (
          secuenciaActual !==
          secuenciaGeocodificacion
        ) {
          return;
        }

        destinoActual = null;
        $("btnCrearPedido").disabled = true;

        mostrarEstado(
          $("zonaEstado"),
          error.message ||
            "No fue posible ubicar el destino.",
          "error"
        );

        actualizarEstadoPin(
          "error",
          "<strong>No se pudo encontrar correctamente la dirección.</strong> Pulsa “Elegir en el mapa” y toca el domicilio exacto."
        );
      } finally {
        if (
          secuenciaActual ===
          secuenciaGeocodificacion
        ) {
          $("btnVistaPrevia").disabled = false;
        }
      }
    }

    function actualizarBotonesTipoMapa() {
      const esSatelite =
        tipoMapaActual === "hybrid" ||
        tipoMapaActual === "satellite";

      $("btnVistaMapa").classList.toggle(
        "activo",
        !esSatelite
      );

      $("btnVistaSatelite").classList.toggle(
        "activo",
        esSatelite
      );

      $("btnVistaMapa").setAttribute(
        "aria-pressed",
        String(!esSatelite)
      );

      $("btnVistaSatelite").setAttribute(
        "aria-pressed",
        String(esSatelite)
      );
    }

    function cambiarTipoMapa(tipo) {
      if (!mapa) return;

      tipoMapaActual =
        tipo === "satelite"
          ? "hybrid"
          : "roadmap";

      mapa.setMapTypeId(tipoMapaActual);

      localStorage.setItem(
        "ferreteriaTipoMapa",
        tipoMapaActual
      );

      actualizarBotonesTipoMapa();
    }

    window.addEventListener("load", () => {
      const centro = CONFIG.empresa;

      mapa = new google.maps.Map($("map"), {
        center: centro,
        zoom: 16,
        mapTypeId: tipoMapaActual,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
      });

      actualizarBotonesTipoMapa();

      geocoder = new google.maps.Geocoder();
      infoRepartidorMapa = new google.maps.InfoWindow();

      mapa.addListener("click", (evento) => {
        if (!modoPinManual) return;

        const posicion = {
          lat: evento.latLng.lat(),
          lng: evento.latLng.lng()
        };

        colocarDestino(
          posicion,
          false,
          "manual",
          ""
        );

        mapa.panTo(posicion);
        desactivarModoPinManual();
      });

      marcadorOrigen = new google.maps.Marker({
        map: mapa,
        position: centro,
        title: CONFIG.empresa.nombre,
        icon: {
          url: CONFIG.pinVehiculoUrl,
          scaledSize: new google.maps.Size(84, 56),
          anchor: new google.maps.Point(42, 52)
        },
        zIndex: 10
      });

      actualizarRepartidoresEnMapa();

      circuloZona = new google.maps.Circle({
        map: mapa,
        center: centro,
        radius: CONFIG.zona.radioHabitualMetros,
        fillColor: "#ff9800",
        fillOpacity: 0.08,
        strokeColor: "#ff9800",
        strokeOpacity: 0.65,
        strokeWeight: 2,
        clickable: false
      });
    });


    function fechaRepartidor(valor) {
      if (!valor) return null;

      if (typeof valor.toDate === "function") {
        return valor.toDate();
      }

      if (valor.seconds) {
        return new Date(valor.seconds * 1000);
      }

      const fecha = new Date(valor);

      return Number.isNaN(fecha.getTime())
        ? null
        : fecha;
    }

    function tiempoDesde(fecha) {
      if (!fecha) return "sin hora";

      const segundos = Math.max(
        0,
        Math.round((Date.now() - fecha.getTime()) / 1000)
      );

      if (segundos < 60) return "ahora";
      if (segundos < 3600) {
        return `hace ${Math.floor(segundos / 60)} min`;
      }

      if (segundos < 86400) {
        return `hace ${Math.floor(segundos / 3600)} h`;
      }

      return fecha.toLocaleDateString("es-MX");
    }

    function coordenadasRepartidor(repartidor) {
      const latitud = Number(
        repartidor.ubicacion?.latitud
      );

      const longitud = Number(
        repartidor.ubicacion?.longitud
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

    function repartidorVisibleEnMapa(repartidor) {
      const posicion = coordenadasRepartidor(repartidor);

      if (!posicion) return false;

      const ultimaFecha = fechaRepartidor(
        repartidor.ultimaActualizacion ||
        repartidor.ultimaConexion
      );

      const minutosSinActualizar = ultimaFecha
        ? (Date.now() - ultimaFecha.getTime()) / 60000
        : Number.POSITIVE_INFINITY;

      const entregando =
        String(repartidor.estado || "").toLowerCase() ===
        "entregando";

      const gpsActivo = repartidor.gpsActivo === true;

      /*
       * Se mantiene visible si está en una entrega,
       * tiene GPS activo o reportó ubicación en los
       * últimos 30 minutos.
       */
      return (
        entregando ||
        gpsActivo ||
        minutosSinActualizar <= 30
      );
    }

    function contenidoInfoRepartidor(repartidor) {
      const nombre = nombreVisibleRepartidor(repartidor);
      const ultimaFecha = fechaRepartidor(
        repartidor.ultimaActualizacion ||
        repartidor.ultimaConexion
      );

      const estado =
        repartidor.estado || "sin estado";

      const pedido =
        repartidor.pedidoActivoId || "ninguno";

      return `
        <div style="min-width:210px;padding:3px 1px">
          <strong style="font-size:14px">
            ${nombre}
          </strong>
          <div style="margin-top:6px;font-size:12px">
            <b>Estado:</b> ${estado}
          </div>
          <div style="margin-top:4px;font-size:12px">
            <b>Pedido activo:</b> ${pedido}
          </div>
          <div style="margin-top:4px;font-size:12px">
            <b>Última ubicación:</b> ${tiempoDesde(ultimaFecha)}
          </div>
        </div>
      `;
    }

    function actualizarRepartidoresEnMapa() {
      if (!mapa) return;

      const visibles = listaRepartidores.filter(
        repartidorVisibleEnMapa
      );

      const uidsVisibles = new Set(
        visibles.map((repartidor) => repartidor.uid)
      );

      for (const [uid, marcador] of marcadoresRepartidores) {
        if (!uidsVisibles.has(uid)) {
          marcador.setMap(null);
          marcadoresRepartidores.delete(uid);
        }
      }

      visibles.forEach((repartidor) => {
        const posicion = coordenadasRepartidor(repartidor);

        if (!posicion) return;

        let marcador =
          marcadoresRepartidores.get(repartidor.uid);

        if (!marcador) {
          marcador = new google.maps.Marker({
            map: mapa,
            position: posicion,
            title: nombreVisibleRepartidor(repartidor),
            optimized: false,
            icon: {
              url: CONFIG.pinVehiculoUrl,
              scaledSize: new google.maps.Size(56, 37),

              /*
               * El punto GPS se coloca aproximadamente
               * debajo del centro de las ruedas.
               */
              anchor: new google.maps.Point(28, 30)
            },
            zIndex: 40
          });

          marcador.addListener("click", () => {
            const perfilActual =
              listaRepartidores.find(
                (item) => item.uid === repartidor.uid
              ) || repartidor;

            infoRepartidorMapa.setContent(
              contenidoInfoRepartidor(perfilActual)
            );

            infoRepartidorMapa.open({
              map: mapa,
              anchor: marcador
            });
          });

          marcadoresRepartidores.set(
            repartidor.uid,
            marcador
          );
        } else {
          marcador.setPosition(posicion);
          marcador.setTitle(
            nombreVisibleRepartidor(repartidor)
          );
        }

        marcador.setVisible(
          repartidor.uid !== repartidorRastreoActivoUID
        );
      });

      renderizarListaRepartidoresMapa(visibles);
    }

    function renderizarListaRepartidoresMapa(repartidores) {
      $("contadorRepartidoresMapa").textContent =
        repartidores.length;

      const contenedor = $("listaRepartidoresMapa");

      if (!repartidores.length) {
        contenedor.innerHTML = `
          <div class="repartidores-vacio">
            No hay repartidores con ubicación activa.
          </div>
        `;
        return;
      }

      contenedor.innerHTML = repartidores
        .sort((a, b) => {
          const entregandoA =
            a.estado === "entregando" ? 0 : 1;
          const entregandoB =
            b.estado === "entregando" ? 0 : 1;

          return entregandoA - entregandoB;
        })
        .map((repartidor) => {
          const ultimaFecha = fechaRepartidor(
            repartidor.ultimaActualizacion ||
            repartidor.ultimaConexion
          );

          const entregando =
            repartidor.estado === "entregando";

          return `
            <div
              class="repartidor-mapa-item"
              data-repartidor-mapa="${repartidor.uid}"
              title="Centrar en ${nombreVisibleRepartidor(repartidor)}"
            >
              <span class="repartidor-mapa-punto ${
                entregando ? "entregando" : ""
              }"></span>

              <div class="repartidor-mapa-info">
                <strong>${nombreVisibleRepartidor(repartidor)}</strong>
                <span>
                  ${repartidor.estado || "sin estado"}
                  ${
                    repartidor.pedidoActivoId
                      ? ` · pedido ${repartidor.pedidoActivoId.slice(0, 8)}…`
                      : ""
                  }
                </span>
              </div>

              <span class="repartidor-mapa-hora">
                ${tiempoDesde(ultimaFecha)}
              </span>
            </div>
          `;
        })
        .join("");
    }

    function centrarRepartidoresActivos() {
      if (!mapa) return;

      const marcadores = Array.from(
        marcadoresRepartidores.values()
      );

      if (!marcadores.length) {
        alert("No hay repartidores activos para mostrar.");
        return;
      }

      const bounds = new google.maps.LatLngBounds();
      bounds.extend(CONFIG.empresa);

      marcadores.forEach((marcador) => {
        const posicion = marcador.getPosition();

        if (posicion) bounds.extend(posicion);
      });

      mapa.fitBounds(bounds, 80);
    }

    function iniciarEscuchaRepartidoresMapa() {
      if (cancelarEscuchaRepartidoresMapa) {
        cancelarEscuchaRepartidoresMapa();
      }

      cancelarEscuchaRepartidoresMapa = onSnapshot(
        collection(db, "repartidores"),
        (snapshot) => {
          listaRepartidores = snapshot.docs
            .map((documento) => ({
              uid: documento.id,
              ...documento.data()
            }))
            .sort((a, b) =>
              nombreVisibleRepartidor(a).localeCompare(
                nombreVisibleRepartidor(b),
                "es"
              )
            );

          renderizarSelectorRepartidores();
          actualizarRepartidoresEnMapa();

          /*
           * Los pedidos activos usan la misma lista
           * para saber si un repartidor está ocupado.
           */
          renderizarPedidosActivos();

          if (
            pedidoRastreoActivoId &&
            !pedidosActivos.some(
              (pedido) =>
                pedido.id === pedidoRastreoActivoId
            )
          ) {
            $("rastreoActivoMensaje").textContent =
              "Este pedido dejó de estar activo. Puedes cerrar el rastreo.";
          }
        },
        (error) => {
          console.error(
            "Error escuchando ubicaciones de repartidores:",
            error
          );
        }
      );
    }


    function coordenadasDesdeRastreo(
      datos,
      tipo
    ) {
      const origen =
        tipo === "destino"
          ? datos?.destino
          : datos?.ubicacionRepartidor;

      const latitud = Number(
        origen?.latitud ??
        origen?.latitude
      );

      const longitud = Number(
        origen?.longitud ??
        origen?.longitude
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

    function actualizarMarcadorRastreo(
      tipo,
      posicion
    ) {
      if (!mapa || !posicion) return;

      if (tipo === "destino") {
        if (!marcadorDestinoRastreo) {
          marcadorDestinoRastreo =
            new google.maps.Marker({
              map: mapa,
              position: posicion,
              title: "Destino del pedido",
              icon:
                "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
              zIndex: 70
            });
        } else {
          marcadorDestinoRastreo.setPosition(posicion);
          marcadorDestinoRastreo.setMap(mapa);
        }

        return;
      }

      if (!marcadorVehiculoRastreo) {
        marcadorVehiculoRastreo =
          new google.maps.Marker({
            map: mapa,
            position: posicion,
            title: "Repartidor en ruta",
            optimized: false,
            icon: {
              url: CONFIG.pinVehiculoUrl,
              scaledSize:
                new google.maps.Size(68, 45),
              anchor:
                new google.maps.Point(34, 37)
            },
            zIndex: 90
          });
      } else {
        marcadorVehiculoRastreo.setPosition(posicion);
        marcadorVehiculoRastreo.setMap(mapa);
      }
    }

    function actualizarLineaRastreo(
      vehiculo,
      destino
    ) {
      if (!mapa) return;

      if (!vehiculo || !destino) {
        lineaRastreo?.setMap(null);
        return;
      }

      const ruta = [vehiculo, destino];

      if (!lineaRastreo) {
        lineaRastreo =
          new google.maps.Polyline({
            map: mapa,
            path: ruta,
            geodesic: true,
            strokeColor: "#2563EB",
            strokeOpacity: 0.78,
            strokeWeight: 4,
            zIndex: 60
          });
      } else {
        lineaRastreo.setPath(ruta);
        lineaRastreo.setMap(mapa);
      }
    }

    function centrarRastreoActivo() {
      if (!mapa || !datosRastreoActivo) {
        return;
      }

      const destino = coordenadasDesdeRastreo(
        datosRastreoActivo,
        "destino"
      );

      const vehiculo = coordenadasDesdeRastreo(
        datosRastreoActivo,
        "vehiculo"
      );

      const puntos = [
        CONFIG.empresa,
        destino,
        vehiculo
      ].filter(Boolean);

      if (!puntos.length) return;

      const bounds =
        new google.maps.LatLngBounds();

      puntos.forEach((punto) => {
        bounds.extend(punto);
      });

      mapa.fitBounds(bounds, {
        top: 80,
        right: 430,
        bottom: 90,
        left: 70
      });
    }

    function actualizarPanelRastreoActivo(
      datos
    ) {
      datosRastreoActivo = datos;

      const pedidoPrivado =
        pedidosActivos.find(
          (pedido) =>
            pedido.id === pedidoRastreoActivoId
        ) || {};

      const cliente =
        datos.cliente ||
        pedidoPrivado.cliente ||
        "Cliente";

      const direccion =
        datos.direccionCorta ||
        datos.direccion ||
        pedidoPrivado.direccionCorta ||
        pedidoPrivado.direccion ||
        "Dirección pendiente";

      const repartidorUID =
        datos.repartidorUID ||
        pedidoPrivado.repartidorUID ||
        "";

      if (
        repartidorRastreoActivoUID &&
        repartidorRastreoActivoUID !== repartidorUID
      ) {
        marcadoresRepartidores
          .get(repartidorRastreoActivoUID)
          ?.setVisible(true);
      }

      repartidorRastreoActivoUID =
        repartidorUID;

      if (repartidorUID) {
        marcadoresRepartidores
          .get(repartidorUID)
          ?.setVisible(false);
      }

      const repartidor =
        datos.repartidorNombre ||
        pedidoPrivado.repartidorNombre ||
        "Sin asignar";

      const estado =
        datos.estado ||
        pedidoPrivado.estado ||
        "asignado";

      const destino =
        coordenadasDesdeRastreo(
          datos,
          "destino"
        ) ||
        (
          Number.isFinite(
            Number(pedidoPrivado.destino?.latitud)
          ) &&
          Number.isFinite(
            Number(pedidoPrivado.destino?.longitud)
          )
            ? {
                lat:
                  Number(
                    pedidoPrivado.destino.latitud
                  ),
                lng:
                  Number(
                    pedidoPrivado.destino.longitud
                  )
              }
            : null
        );

      const vehiculo =
        coordenadasDesdeRastreo(
          datos,
          "vehiculo"
        );

      $("rastreoActivoCliente").textContent =
        cliente;

      $("rastreoActivoDireccion").textContent =
        direccion;

      $("rastreoActivoRepartidor").textContent =
        repartidor;

      $("rastreoActivoId").textContent =
        pedidoRastreoActivoId;

      const badge =
        $("rastreoActivoEstado");

      badge.className =
        `badge-estado ${claseEstado(estado)}`;

      badge.textContent =
        textoEstado(estado);

      $("rastreoActivoActualizacion").textContent =
        datos.ultimaActualizacion
          ? `Actualizado: ${formatearHora(
              datos.ultimaActualizacion
            )}`
          : "Sin actualización";

      if (destino) {
        actualizarMarcadorRastreo(
          "destino",
          destino
        );
      } else {
        marcadorDestinoRastreo?.setMap(null);
      }

      if (vehiculo) {
        actualizarMarcadorRastreo(
          "vehiculo",
          vehiculo
        );

        const distancia =
          destino
            ? calcularDistanciaMetros(
                vehiculo,
                destino
              )
            : NaN;

        $("rastreoActivoDistancia").textContent =
          formatearDistancia(distancia);

        $("rastreoActivoMensaje").textContent =
          estado === "en_camino"
            ? "El repartidor está enviando su ubicación en tiempo real."
            : "Ubicación del repartidor disponible.";
      } else {
        marcadorVehiculoRastreo?.setMap(null);

        $("rastreoActivoDistancia").textContent =
          "Esperando GPS";

        $("rastreoActivoMensaje").textContent =
          estado === "asignado" ||
          estado === "en_preparacion"
            ? "El viaje todavía no inicia. El mapa mostrará la camioneta cuando el repartidor pulse INICIAR VIAJE."
            : "Esperando una nueva ubicación del repartidor.";
      }

      actualizarLineaRastreo(
        vehiculo,
        destino
      );

      if (
        !vistaRastreoAjustada &&
        destino
      ) {
        vistaRastreoAjustada = true;

        window.setTimeout(
          centrarRastreoActivo,
          120
        );
      }
    }

    function limpiarElementosRastreoActivo() {
      marcadorDestinoRastreo?.setMap(null);
      marcadorVehiculoRastreo?.setMap(null);
      lineaRastreo?.setMap(null);

      marcadorDestinoRastreo = null;
      marcadorVehiculoRastreo = null;
      lineaRastreo = null;
    }

    function detenerRastreoActivo() {
      cancelarEscuchaRastreoActivo?.();
      cancelarEscuchaRastreoActivo = null;

      if (repartidorRastreoActivoUID) {
        marcadoresRepartidores
          .get(repartidorRastreoActivoUID)
          ?.setVisible(true);
      }

      pedidoRastreoActivoId = "";
      repartidorRastreoActivoUID = "";
      datosRastreoActivo = null;
      vistaRastreoAjustada = false;

      limpiarElementosRastreoActivo();

      $("panelRastreoActivo")
        .classList.add("oculto");

      $("panelRepartidoresMapa")
        .classList.remove("oculto");

      document.body.classList.remove(
        "rastreo-en-curso"
      );

      actualizarRepartidoresEnMapa();
    }

    function iniciarRastreoActivo(
      pedidoId
    ) {
      const pedido =
        pedidosActivos.find(
          (item) => item.id === pedidoId
        );

      cancelarEscuchaRastreoActivo?.();
      limpiarElementosRastreoActivo();

      pedidoRastreoActivoId =
        pedidoId;

      repartidorRastreoActivoUID =
        pedido?.repartidorUID || "";

      datosRastreoActivo = null;
      vistaRastreoAjustada = false;

      $("panelRastreoActivo")
        .classList.remove("oculto");

      $("panelRepartidoresMapa")
        .classList.add("oculto");

      document.body.classList.add(
        "rastreo-en-curso"
      );

      $("rastreoActivoCliente").textContent =
        pedido?.cliente || "Rastreo del pedido";

      $("rastreoActivoDireccion").textContent =
        pedido?.direccionCorta ||
        pedido?.direccion ||
        "Dirección pendiente";

      $("rastreoActivoRepartidor").textContent =
        pedido?.repartidorNombre ||
        "Sin asignar";

      $("rastreoActivoId").textContent =
        pedidoId;

      $("rastreoActivoDistancia").textContent =
        "Esperando GPS";

      $("rastreoActivoActualizacion").textContent =
        "Conectando...";

      $("rastreoActivoMensaje").textContent =
        "Consultando el seguimiento del pedido.";

      const badge =
        $("rastreoActivoEstado");

      badge.className =
        `badge-estado ${claseEstado(
          pedido?.estado || "asignado"
        )}`;

      badge.textContent =
        textoEstado(
          pedido?.estado || "asignado"
        );

      cerrarModalPedidosActivos();

      document
        .querySelector(".panel-mapa")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

      cancelarEscuchaRastreoActivo =
        onSnapshot(
          doc(
            db,
            "rastreoPublico",
            pedidoId
          ),
          (snapshot) => {
            if (!snapshot.exists()) {
              $("rastreoActivoMensaje").textContent =
                "Todavía no existe información pública de rastreo para este pedido.";

              return;
            }

            actualizarPanelRastreoActivo({
              id: snapshot.id,
              ...snapshot.data()
            });
          },
          (error) => {
            console.error(
              "Error rastreando pedido activo:",
              error
            );

            $("rastreoActivoMensaje").textContent =
              "No fue posible recibir la ubicación en tiempo real.";
          }
        );
    }

    async function cargarClientes() {
      try {
        const consulta = query(
          collection(db, "clientes"),
          orderBy("nombre")
        );

        const snapshot = await getDocs(consulta);
        listaClientes = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data()
        }));

        const select = $("selectCliente");
        select.innerHTML = '<option value="">-- Seleccionar cliente --</option>';

        listaClientes.forEach((cliente, indice) => {
          const opcion = document.createElement("option");
          opcion.value = String(indice);
          opcion.textContent = cliente.nombre || "Cliente sin nombre";
          select.appendChild(opcion);
        });
      } catch (error) {
        console.error("No se pudieron cargar clientes:", error);
        alert("No se pudo cargar el catálogo de clientes.");
      }
    }

    function nombreVisibleRepartidor(repartidor) {
      return (
        repartidor.nombre &&
        repartidor.nombre !== "Repartidor"
          ? repartidor.nombre
          : repartidor.correo || repartidor.uid
      );
    }

    function renderizarSelectorRepartidores() {
      const select = $("selectRepartidor");
      const valorAnterior = select.value;

      select.innerHTML =
        '<option value="">-- Seleccionar repartidor --</option>';

      listaRepartidores.forEach((repartidor) => {
        const opcion = document.createElement("option");
        opcion.value = repartidor.uid;
        opcion.textContent =
          `${nombreVisibleRepartidor(repartidor)} · ` +
          `${repartidor.estado || "sin estado"}`;
        select.appendChild(opcion);
      });

      if (
        valorAnterior &&
        listaRepartidores.some(
          (repartidor) => repartidor.uid === valorAnterior
        )
      ) {
        select.value = valorAnterior;
      }
    }

    async function cargarRepartidores() {
      try {
        const snapshot = await getDocs(
          collection(db, "repartidores")
        );

        listaRepartidores = snapshot.docs
          .map((item) => ({
            uid: item.id,
            ...item.data()
          }))
          .sort((a, b) => {
            const nombreA =
              (a.nombre || a.correo || "").toLowerCase();
            const nombreB =
              (b.nombre || b.correo || "").toLowerCase();

            return nombreA.localeCompare(nombreB, "es");
          });

        renderizarSelectorRepartidores();
        actualizarRepartidoresEnMapa();
      } catch (error) {
        console.error(
          "No se pudieron cargar repartidores:",
          error
        );

        alert("No se pudo cargar la lista de repartidores.");
      }
    }

    function cargarClienteSeleccionado() {
      const indice = $("selectCliente").value;

      if (indice === "") {
        limpiarFormularioCliente();
        return;
      }

      const cliente =
        listaClientes[Number(indice)];

      $("docId").value = cliente.id;
      $("cliente").value =
        cliente.nombre || "";

      const direccion =
        cliente.direccion || "";

      const coincidencia =
        direccion.match(
          /^(.*)\s+([A-Za-z0-9\-\/]+)$/
        );

      if (coincidencia) {
        $("selectCalle").value =
          coincidencia[1].trim();

        $("numExterior").value =
          coincidencia[2].trim();
      } else {
        $("selectCalle").value = "";
        $("numExterior").value =
          direccion;
      }

      const latitud = Number(
        cliente.destino?.latitud ??
        cliente.latitud
      );

      const longitud = Number(
        cliente.destino?.longitud ??
        cliente.longitud
      );

      if (
        Number.isFinite(latitud) &&
        Number.isFinite(longitud) &&
        mapa
      ) {
        colocarDestino(
          {
            lat: latitud,
            lng: longitud
          },
          true,
          "guardada",
          cliente.direccionMapa || ""
        );

        return;
      }

      invalidarDestino();

      actualizarEstadoPin(
        "",
        "Este cliente todavía no tiene un punto exacto guardado. Busca la dirección o selecciónala en el mapa."
      );
    }

    function invalidarDestino() {
      secuenciaGeocodificacion += 1;
      secuenciaGeocodificacionInversa += 1;
      desactivarModoPinManual();
      destinoActual = null;
      $("btnCrearPedido").disabled = true;

      mostrarEstado(
        $("zonaEstado"),
        "La dirección cambió. Vuelve a ubicar el destino."
      );

      if (marcadorDestino) {
        marcadorDestino.setMap(null);
        marcadorDestino = null;
      }

      $("chipDistancia").innerHTML = `
        <strong>Destino</strong>
        Pendiente
      `;

      actualizarEstadoPin(
        "",
        "La dirección cambió. Vuelve a buscarla o selecciona el punto exacto en el mapa."
      );
    }

    function limpiarFormularioCliente() {
      $("docId").value = "";
      $("cliente").value = "";
      $("selectCalle").value = "";
      $("numExterior").value = "";
      $("selectCliente").value = "";
      invalidarDestino();
    }

    async function guardarCambiosCliente() {
      const id = $("docId").value;
      const nombre = escaparTexto($("cliente").value);

      if (!id) {
        alert("Selecciona un cliente primero.");
        return;
      }

      if (!nombre) {
        alert("Escribe el nombre del cliente.");
        return;
      }

      const direccion = obtenerDireccionCorta();

      await updateDoc(
        doc(db, "clientes", id),
        {
          nombre,
          direccion,
          destino: destinoActual
            ? {
                latitud: destinoActual.lat,
                longitud: destinoActual.lng
              }
            : null,
          latitud:
            destinoActual?.lat ?? null,
          longitud:
            destinoActual?.lng ?? null,
          direccionMapa:
            destinoActual?.direccionMapa || null,
          metodoUbicacion:
            destinoActual?.metodoUbicacion || null,
          ultimaActualizacion:
            serverTimestamp()
        }
      );

      alert("Cliente actualizado.");
      await cargarClientes();
    }

    async function guardarNuevoCliente() {
      const nombre = escaparTexto($("cliente").value);

      if (!nombre) {
        alert("Escribe el nombre del cliente.");
        return;
      }

      const direccion = obtenerDireccionCorta();

      const referencia = await addDoc(
        collection(db, "clientes"),
        {
          nombre,
          direccion,
          destino: destinoActual
            ? {
                latitud: destinoActual.lat,
                longitud: destinoActual.lng
              }
            : null,
          latitud:
            destinoActual?.lat ?? null,
          longitud:
            destinoActual?.lng ?? null,
          direccionMapa:
            destinoActual?.direccionMapa || null,
          metodoUbicacion:
            destinoActual?.metodoUbicacion || null,
          fechaRegistro:
            serverTimestamp(),
          ultimaActualizacion:
            serverTimestamp()
        }
      );

      $("docId").value = referencia.id;
      alert("Cliente guardado.");
      await cargarClientes();
    }

    async function eliminarClienteActual() {
      const id = $("docId").value;

      if (!id) {
        alert("Selecciona un cliente.");
        return;
      }

      if (!confirm("¿Eliminar este cliente?")) return;

      await deleteDoc(doc(db, "clientes", id));
      limpiarFormularioCliente();
      await cargarClientes();
      alert("Cliente eliminado.");
    }

    function obtenerNotasPedido() {
      return $("notasPedido").value.trim();
    }

    function notasComoHtml(notas) {
      if (!notas) return "Sin notas";

      return escaparTexto(notas).replace(/\n/g, "<br>");
    }

    function actualizarContadorNotasPedido() {
      const total = $("notasPedido").value.length;
      $("contadorNotasPedido").textContent = `${total} / 1000`;
    }

    async function crearPedido() {
      const cliente = escaparTexto($("cliente").value);
      const repartidorUID = $("selectRepartidor").value;
      const notasPedido = obtenerNotasPedido();

      if (!cliente) {
        alert("Escribe el nombre del cliente.");
        return;
      }

      if (!repartidorUID) {
        alert("Selecciona un repartidor.");
        return;
      }

      if (!destinoActual) {
        alert("Ubica y valida el destino.");
        return;
      }

      if (
        destinoActual.distanciaMetros >
        CONFIG.zona.radioMaximoMetros
      ) {
        alert("El destino está fuera del radio máximo configurado.");
        return;
      }

      const direccionCorta = obtenerDireccionCorta();
      const direccionCompleta = obtenerDireccionCompleta();

      const repartidor = listaRepartidores.find(
        (item) => item.uid === repartidorUID
      );

      $("btnCrearPedido").disabled = true;

      try {
        const referencia = await addDoc(
          collection(db, "pedidos"),
          {
            cliente,
            direccion: direccionCompleta,
            direccionCorta,
            direccionMapa:
              destinoActual.direccionMapa || "",
            metodoUbicacion:
              destinoActual.metodoUbicacion || "desconocido",
            notasPedido,

            origen: {
              nombre: CONFIG.empresa.nombre,
              latitud: CONFIG.empresa.lat,
              longitud: CONFIG.empresa.lng
            },

            destino: {
              latitud: destinoActual.lat,
              longitud: destinoActual.lng
            },

            // Compatibilidad directa con la app del repartidor.
            latitud: destinoActual.lat,
            longitud: destinoActual.lng,

            distanciaEstimadaMetros:
              destinoActual.distanciaMetros,

            zonaOperacion: {
              localidad: CONFIG.zona.localidad,
              municipio: CONFIG.zona.municipio,
              estado: CONFIG.zona.estado,
              pais: CONFIG.zona.pais
            },

            estado: "asignado",
            repartidorUID,
            repartidorNombre:
              repartidor?.nombre ||
              repartidor?.correo ||
              "Repartidor",

            creadoPorUID: auth.currentUser?.uid || null,
            creadoPorCorreo: auth.currentUser?.email || null,
            fechaCreacion: serverTimestamp(),
            ultimaActualizacion: serverTimestamp()
          }
        );

        pedidoActualId = referencia.id;
        localStorage.setItem("pedidoActualId", pedidoActualId);

        /*
         * El rastreo público se crea desde el momento
         * en que el despachador registra el pedido.
         */
        await setDoc(
          doc(db, "rastreoPublico", pedidoActualId),
          {
            pedidoId: pedidoActualId,
            cliente,
            direccion: direccionCompleta,
            direccionCorta,
            metodoUbicacion:
              destinoActual.metodoUbicacion || "desconocido",
            tieneNotas: Boolean(notasPedido),
            estado: "asignado",

            repartidorUID,
            repartidorNombre:
              repartidor?.nombre ||
              repartidor?.correo ||
              "Repartidor",

            origen: {
              nombre: CONFIG.empresa.nombre,
              latitud: CONFIG.empresa.lat,
              longitud: CONFIG.empresa.lng
            },

            destino: {
              latitud: destinoActual.lat,
              longitud: destinoActual.lng
            },

            ubicacionRepartidor: {
              latitud: CONFIG.empresa.lat,
              longitud: CONFIG.empresa.lng,
              velocidad: 0,
              direccion: 0
            },

            distanciaEstimadaMetros:
              destinoActual.distanciaMetros,

            fechaCreacion: serverTimestamp(),
            ultimaActualizacion: serverTimestamp()
          }
        );

        $("pedidoActual").innerHTML = `
          <strong>Pedido:</strong> ${pedidoActualId}<br>
          <strong>Cliente:</strong> ${cliente}<br>
          <strong>Repartidor:</strong> ${
            repartidor?.nombre ||
            repartidor?.correo ||
            repartidorUID
          }<br>
          <strong>Distancia:</strong> ${
            formatearDistancia(destinoActual.distanciaMetros)
          }<br>
          <strong>Ubicación:</strong> ${
            destinoActual.metodoUbicacion === "manual"
              ? "Pin colocado manualmente"
              : destinoActual.metodoUbicacion === "guardada"
                ? "Punto guardado del cliente"
                : "Dirección encontrada por Google"
          }<br>
          <strong>Contenido / notas:</strong><br>
          ${notasComoHtml(notasPedido)}<br>
          <strong>Estado:</strong> asignado
        `;

        $("btnCancelarPedido").disabled = false;

        const enlaceSeguimiento =
          enlaceRastreoPedido(pedidoActualId);

        const mensaje =
          `Hola ${cliente}. Tu pedido de Ferretería Granados fue asignado y será enviado a ${direccionCorta}. ` +
          `Puedes seguirlo aquí: ${enlaceSeguimiento}`;

        $("resultado").innerHTML = `
          <a
            class="whatsapp"
            href="https://wa.me/?text=${encodeURIComponent(mensaje)}"
            target="_blank"
            rel="noopener noreferrer"
          >
            Enviar seguimiento por WhatsApp 📲
          </a>

          <div class="mini">
            El pedido ya aparece en la aplicación del repartidor.
          </div>
        `;

        $("notasPedido").value = "";
        actualizarContadorNotasPedido();

        alert("Pedido creado y asignado correctamente.");
      } catch (error) {
        console.error("No se pudo crear el pedido:", error);
        alert(`No se pudo crear el pedido: ${error.message}`);
      } finally {
        $("btnCrearPedido").disabled = !destinoActual;
      }
    }

    async function cancelarPedidoActual() {
      if (!pedidoActualId) {
        alert("No hay un pedido actual.");
        return;
      }

      if (!confirm("¿Cancelar este pedido?")) return;

      await updateDoc(
        doc(db, "pedidos", pedidoActualId),
        {
          estado: "cancelado",
          fechaCancelacion: serverTimestamp(),
          ultimaActualizacion: serverTimestamp()
        }
      );

      await setDoc(
        doc(db, "rastreoPublico", pedidoActualId),
        {
          estado: "cancelado",
          ultimaActualizacion: serverTimestamp()
        },
        { merge: true }
      );

      $("pedidoActual").innerHTML = `
        <strong>Pedido:</strong> ${pedidoActualId}<br>
        <strong>Estado:</strong> cancelado
      `;

      localStorage.removeItem("pedidoActualId");
      pedidoActualId = "";
      $("btnCancelarPedido").disabled = true;
      $("resultado").innerHTML = "";

      alert("Pedido cancelado.");
    }

    function abrirModalRepartidor() {
      $("modalRepartidor").classList.remove("oculto");
      $("modalRepartidor").setAttribute("aria-hidden", "false");
      limpiarEstado($("estadoNuevoRepartidor"));
      setTimeout(() => $("repartidorNombre").focus(), 50);
    }

    function cerrarModalRepartidor() {
      $("modalRepartidor").classList.add("oculto");
      $("modalRepartidor").setAttribute("aria-hidden", "true");
    }

    function limpiarFormularioRepartidor() {
      $("repartidorNombre").value = "";
      $("repartidorTelefono").value = "";
      $("repartidorCorreo").value = "";
      $("repartidorPassword").value = "";
      $("repartidorPasswordConfirmar").value = "";
    }

    async function crearRepartidor() {
      const nombre = escaparTexto($("repartidorNombre").value);
      const telefono = escaparTexto($("repartidorTelefono").value);
      const correo = escaparTexto($("repartidorCorreo").value).toLowerCase();
      const password = $("repartidorPassword").value;
      const confirmarPassword = $("repartidorPasswordConfirmar").value;

      if (!nombre || !correo || !password) {
        mostrarEstado(
          $("estadoNuevoRepartidor"),
          "Escribe nombre, correo y contraseña.",
          "error"
        );
        return;
      }

      if (password.length < 6) {
        mostrarEstado(
          $("estadoNuevoRepartidor"),
          "La contraseña debe tener al menos 6 caracteres.",
          "error"
        );
        return;
      }

      if (password !== confirmarPassword) {
        mostrarEstado(
          $("estadoNuevoRepartidor"),
          "Las contraseñas no coinciden.",
          "error"
        );
        return;
      }

      $("btnGuardarRepartidor").disabled = true;

      try {
        const credencial = await createUserWithEmailAndPassword(
          authCreacionUsuarios,
          correo,
          password
        );

        const nuevoUid = credencial.user.uid;

        await setDoc(
          doc(db, "repartidores", nuevoUid),
          {
            uid: nuevoUid,
            nombre,
            correo,
            telefono: telefono || "",
            activo: true,
            estado: "disponible",
            gpsActivo: false,
            internetActivo: false,
            pedidoActivoId: null,
            ubicacion: null,
            rol: "repartidor",
            creadoPorUID: auth.currentUser?.uid || null,
            creadoPorCorreo: auth.currentUser?.email || null,
            fechaRegistro: serverTimestamp(),
            ultimaActualizacion: serverTimestamp()
          },
          { merge: true }
        );

        // Cerramos solo la sesión de la instancia secundaria.
        await signOut(authCreacionUsuarios);

        await cargarRepartidores();
        $("selectRepartidor").value = nuevoUid;

        mostrarEstado(
          $("estadoNuevoRepartidor"),
          `Repartidor ${nombre} creado correctamente.`,
          "ok"
        );

        limpiarFormularioRepartidor();

        setTimeout(() => {
          cerrarModalRepartidor();
        }, 900);
      } catch (error) {
        console.error("No se pudo crear el repartidor:", error);

        let mensaje = "No se pudo crear el repartidor.";

        if (error.code === "auth/email-already-in-use") {
          mensaje = "Ese correo ya está registrado en Authentication.";
        } else if (error.code === "auth/invalid-email") {
          mensaje = "El correo no tiene un formato válido.";
        } else if (error.code === "auth/weak-password") {
          mensaje = "La contraseña es demasiado débil.";
        } else if (error.code === "permission-denied") {
          mensaje = "Firestore bloqueó la creación del perfil. Revisa las reglas de repartidores.";
        }

        mostrarEstado(
          $("estadoNuevoRepartidor"),
          mensaje,
          "error"
        );
      } finally {
        $("btnGuardarRepartidor").disabled = false;
      }
    }




    function enlaceRastreoPedido(pedidoId) {
      const base = CONFIG.enlaceSeguimiento.replace(/[?&]+$/, "");
      const separador = base.includes("?") ? "&" : "?";

      return `${base}${separador}pedido=${encodeURIComponent(pedidoId)}`;
    }

    function formatearFechaCompleta(valor) {
      const fecha = obtenerFechaDesdeTimestamp(valor);

      if (!fecha) return "Pendiente";

      return fecha.toLocaleString("es-MX", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    function crearHtmlTicket(pedido) {
      const enlace = enlaceRastreoPedido(pedido.id);

      return `
        <div class="ticket-logo">
          <h2>FERRETERÍA GRANADOS</h2>
          <p>Ticket de entrega</p>
        </div>

        <hr class="ticket-separador">

        <div class="ticket-fila">
          <span>Folio</span>
          <strong>${escaparTexto(pedido.id)}</strong>
        </div>

        <div class="ticket-fila">
          <span>Fecha de creación</span>
          <strong>${formatearFechaCompleta(pedido.fechaCreacion)}</strong>
        </div>

        <hr class="ticket-separador">

        <div class="ticket-fila">
          <span>Cliente</span>
          <strong>${escaparTexto(pedido.cliente || "Cliente")}</strong>
        </div>

        <div class="ticket-fila">
          <span>Dirección</span>
          <strong>${escaparTexto(
            pedido.direccionCorta ||
            pedido.direccion ||
            "Dirección pendiente"
          )}</strong>
        </div>

        <div class="ticket-fila">
          <span>Contenido / notas</span>
          <strong>${notasComoHtml(pedido.notasPedido)}</strong>
        </div>

        <div class="ticket-fila">
          <span>Repartidor</span>
          <strong>${escaparTexto(
            pedido.repartidorNombre || "Sin asignar"
          )}</strong>
        </div>

        <div class="ticket-fila">
          <span>Estado</span>
          <strong>${escaparTexto(textoEstado(pedido.estado))}</strong>
        </div>

        <div class="ticket-fila">
          <span>Distancia estimada</span>
          <strong>${formatearDistancia(
            Number(pedido.distanciaEstimadaMetros)
          )}</strong>
        </div>

        <hr class="ticket-separador">

        <div class="ticket-fila">
          <span>Inicio del viaje</span>
          <strong>${formatearFechaCompleta(pedido.fechaInicio)}</strong>
        </div>

        <div class="ticket-fila">
          <span>Entrega</span>
          <strong>${formatearFechaCompleta(pedido.fechaEntrega)}</strong>
        </div>

        <div class="ticket-fila">
          <span>Duración</span>
          <strong>${formatearDuracion(pedido)}</strong>
        </div>

        <hr class="ticket-separador">

        <div class="ticket-fila">
          <span>Enlace de rastreo</span>
          <a class="ticket-enlace" href="${enlace}" target="_blank" rel="noopener">
            ${escaparTexto(enlace)}
          </a>
        </div>

        <p class="ticket-nota">
          Comprobante interno de entrega. No sustituye factura ni CFDI.
        </p>
      `;
    }

    function abrirTicket(pedido) {
      if (!pedido?.id) return;

      pedidoTicketActual = pedido;
      $("ticketContenido").innerHTML = crearHtmlTicket(pedido);
      $("modalTicket").classList.remove("oculto");
      $("modalTicket").setAttribute("aria-hidden", "false");
    }

    function cerrarTicket() {
      $("modalTicket").classList.add("oculto");
      $("modalTicket").setAttribute("aria-hidden", "true");
    }

    function imprimirTicket() {
      if (!pedidoTicketActual) return;

      const ventana = window.open(
        "",
        "_blank",
        "width=700,height=800"
      );

      if (!ventana) {
        alert("El navegador bloqueó la ventana de impresión.");
        return;
      }

      const contenidoTicket =
        crearHtmlTicket(pedidoTicketActual);

      ventana.document.open();

      ventana.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          >
          <title>
            Ticket ${escaparTexto(pedidoTicketActual.id)}
          </title>

          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: Arial, sans-serif;
              color: #111111;
              background: #ffffff;
            }

            .ticket {
              max-width: 520px;
              margin: 0 auto;
              border: 1px dashed #777777;
              padding: 22px;
            }

            .ticket-logo {
              text-align: center;
            }

            .ticket-logo h2 {
              margin: 0;
            }

            .ticket-logo p {
              margin: 5px 0;
              font-size: 12px;
            }

            .ticket-separador {
              border: 0;
              border-top: 1px dashed #777777;
              margin: 14px 0;
            }

            .ticket-fila {
              display: grid;
              grid-template-columns: 145px 1fr;
              gap: 12px;
              padding: 5px 0;
              font-size: 13px;
            }

            .ticket-fila span:first-child {
              font-weight: bold;
              color: #555555;
            }

            .ticket-enlace {
              overflow-wrap: anywhere;
              color: #000000;
              font-size: 11px;
            }

            .ticket-nota {
              margin-top: 16px;
              text-align: center;
              font-size: 10px;
            }

            @media print {
              body {
                padding: 0;
              }

              .ticket {
                border: 0;
              }
            }
          </style>
        </head>

        <body>
          <div class="ticket">
            ${contenidoTicket}
          </div>
        </body>
        </html>
      `);

      ventana.document.close();

      window.setTimeout(() => {
        ventana.focus();
        ventana.print();
      }, 350);
    }

    function compartirTicketWhatsApp() {
      if (!pedidoTicketActual) return;

      const enlace = enlaceRastreoPedido(pedidoTicketActual.id);

      const mensaje =
        `FERRETERÍA GRANADOS\n` +
        `Pedido: ${pedidoTicketActual.id}\n` +
        `Cliente: ${pedidoTicketActual.cliente || "Cliente"}\n` +
        `Dirección: ${
          pedidoTicketActual.direccionCorta ||
          pedidoTicketActual.direccion ||
          "Dirección pendiente"
        }\n` +
        `Contenido / notas: ${
          pedidoTicketActual.notasPedido || "Sin notas"
        }\n` +
        `Repartidor: ${
          pedidoTicketActual.repartidorNombre || "Sin asignar"
        }\n` +
        `Estado: ${textoEstado(pedidoTicketActual.estado)}\n\n` +
        `Seguimiento:\n${enlace}`;

      window.open(
        `https://wa.me/?text=${encodeURIComponent(mensaje)}`,
        "_blank",
        "noopener"
      );
    }

    async function copiarEnlaceTicket() {
      if (!pedidoTicketActual) return;

      const enlace = enlaceRastreoPedido(pedidoTicketActual.id);

      try {
        await navigator.clipboard.writeText(enlace);
        alert("Enlace de rastreo copiado.");
      } catch {
        window.prompt("Copia este enlace:", enlace);
      }
    }

    const ESTADOS_PEDIDO_ACTIVO = [
      "asignado",
      "en_preparacion",
      "en_camino"
    ];

    function abrirModalPedidosActivos() {
      $("modalPedidosActivos").classList.remove("oculto");
      $("modalPedidosActivos").setAttribute("aria-hidden", "false");
      renderizarPedidosActivos();
    }

    function cerrarModalPedidosActivos() {
      $("modalPedidosActivos").classList.add("oculto");
      $("modalPedidosActivos").setAttribute("aria-hidden", "true");
    }

    function obtenerFechaPedido(pedido) {
      return (
        obtenerFechaDesdeTimestamp(pedido.fechaCreacion)?.getTime() ||
        0
      );
    }

    function repartidorEstaOcupado(uid, pedidoExcluidoId = "") {
      if (!uid) return false;

      const perfil = listaRepartidores.find(
        (repartidor) => repartidor.uid === uid
      );

      if (
        perfil?.pedidoActivoId &&
        perfil.pedidoActivoId !== pedidoExcluidoId
      ) {
        return true;
      }

      if (
        String(perfil?.estado || "").toLowerCase() === "entregando"
      ) {
        const mismoPedido =
          perfil?.pedidoActivoId === pedidoExcluidoId;

        if (!mismoPedido) return true;
      }

      return pedidosActivos.some(
        (pedido) =>
          pedido.id !== pedidoExcluidoId &&
          pedido.repartidorUID === uid &&
          pedido.estado === "en_camino"
      );
    }

    function opcionesRepartidoresParaPedido(pedido) {
      const opciones = [
        '<option value="">-- Seleccionar repartidor --</option>'
      ];

      listaRepartidores.forEach((repartidor) => {
        const ocupado = repartidorEstaOcupado(
          repartidor.uid,
          pedido.id
        );

        const seleccionado =
          repartidor.uid === pedido.repartidorUID
            ? "selected"
            : "";

        const deshabilitado =
          ocupado && !seleccionado
            ? "disabled"
            : "";

        const etiquetaOcupado =
          ocupado && !seleccionado
            ? " · ocupado"
            : "";

        opciones.push(`
          <option
            value="${escaparTexto(repartidor.uid)}"
            ${seleccionado}
            ${deshabilitado}
          >
            ${escaparTexto(
              repartidor.nombre ||
              repartidor.correo ||
              "Repartidor"
            )}${etiquetaOcupado}
          </option>
        `);
      });

      return opciones.join("");
    }

    function abrirRastreoPedido(pedidoId) {
      window.open(
        enlaceRastreoPedido(pedidoId),
        "_blank",
        "noopener"
      );
    }

    async function reasignarPedidoActivo(pedidoId, boton = null) {
      const pedido = pedidosActivos.find(
        (item) => item.id === pedidoId
      );

      if (!pedido) {
        mostrarEstado(
          $("estadoPedidosActivos"),
          "El pedido ya no está disponible en la lista.",
          "error"
        );
        return;
      }

      if (pedido.estado === "en_camino") {
        mostrarEstado(
          $("estadoPedidosActivos"),
          "No se puede reasignar porque el viaje ya está en camino.",
          "error"
        );
        return;
      }

      const select = document.querySelector(
        `[data-reasignar-pedido="${CSS.escape(pedidoId)}"]`
      );

      const nuevoUid = select?.value?.trim() || "";

      if (!nuevoUid) {
        mostrarEstado(
          $("estadoPedidosActivos"),
          "Selecciona primero al nuevo repartidor.",
          "error"
        );
        select?.focus();
        return;
      }

      if (nuevoUid === pedido.repartidorUID) {
        mostrarEstado(
          $("estadoPedidosActivos"),
          "Seleccionaste al mismo repartidor. Elige otro para realizar la reasignación.",
          "error"
        );
        return;
      }

      if (repartidorEstaOcupado(nuevoUid, pedidoId)) {
        mostrarEstado(
          $("estadoPedidosActivos"),
          "Ese repartidor ya tiene una entrega activa.",
          "error"
        );
        renderizarPedidosActivos();
        return;
      }

      const repartidorNuevo = listaRepartidores.find(
        (item) => item.uid === nuevoUid
      );

      if (!repartidorNuevo) {
        mostrarEstado(
          $("estadoPedidosActivos"),
          "No se encontró el perfil del nuevo repartidor.",
          "error"
        );
        return;
      }

      const nombreNuevo =
        repartidorNuevo.nombre ||
        repartidorNuevo.correo ||
        "Repartidor";

      const confirmado = confirm(
        `¿Reasignar el pedido de ${pedido.cliente || "este cliente"} a ${nombreNuevo}?`
      );

      if (!confirmado) return;

      const textoAnterior = boton?.textContent;

      try {
        if (boton) {
          boton.disabled = true;
          boton.textContent = "Guardando...";
        }

        /*
         * El pedido privado es la fuente que utiliza
         * la app del repartidor para recibir la asignación.
         */
        await setDoc(
          doc(db, "pedidos", pedidoId),
          {
            repartidorUID: nuevoUid,
            repartidorNombre: nombreNuevo,
            reasignadoPorUID: auth.currentUser?.uid || null,
            reasignadoPorCorreo: auth.currentUser?.email || null,
            fechaReasignacion: serverTimestamp(),
            ultimaActualizacion: serverTimestamp()
          },
          { merge: true }
        );

        /*
         * El visor público debe mostrar el mismo repartidor.
         */
        await setDoc(
          doc(db, "rastreoPublico", pedidoId),
          {
            repartidorUID: nuevoUid,
            repartidorNombre: nombreNuevo,
            ultimaActualizacion: serverTimestamp()
          },
          { merge: true }
        );

        /*
         * Si por algún dato antiguo el repartidor anterior
         * tenía este pedido como activo, se libera.
         */
        if (
          pedido.repartidorUID &&
          pedido.repartidorUID !== nuevoUid
        ) {
          const anterior = listaRepartidores.find(
            (item) => item.uid === pedido.repartidorUID
          );

          if (anterior?.pedidoActivoId === pedidoId) {
            await setDoc(
              doc(db, "repartidores", pedido.repartidorUID),
              {
                pedidoActivoId: null,
                estado: "disponible",
                gpsActivo: false,
                ultimaActualizacion: serverTimestamp()
              },
              { merge: true }
            );
          }
        }

        mostrarEstado(
          $("estadoPedidosActivos"),
          `Pedido reasignado correctamente a ${nombreNuevo}.`,
          "ok"
        );

        /*
         * Actualización inmediata, sin esperar al listener.
         */
        pedido.repartidorUID = nuevoUid;
        pedido.repartidorNombre = nombreNuevo;
        renderizarPedidosActivos();
      } catch (error) {
        console.error("Error reasignando pedido:", error);

        let mensaje = "No fue posible reasignar el pedido.";

        if (error?.code === "permission-denied") {
          mensaje =
            "Firestore bloqueó la reasignación. Revisa que el despachador tenga permiso para actualizar pedidos y rastreoPublico.";
        }

        mostrarEstado(
          $("estadoPedidosActivos"),
          mensaje,
          "error"
        );
      } finally {
        if (boton) {
          boton.disabled = false;
          boton.textContent = textoAnterior || "Reasignar";
        }
      }
    }

    async function cancelarPedidoActivo(pedidoId) {
      const pedido = pedidosActivos.find(
        (item) => item.id === pedidoId
      );

      if (!pedido) return;

      const confirmado = confirm(
        `¿Cancelar el pedido de ${pedido.cliente || "este cliente"}?`
      );

      if (!confirmado) return;

      try {
        await updateDoc(
          doc(db, "pedidos", pedidoId),
          {
            estado: "cancelado",
            fechaCancelacion: serverTimestamp(),
            ultimaActualizacion: serverTimestamp()
          }
        );

        await setDoc(
          doc(db, "rastreoPublico", pedidoId),
          {
            estado: "cancelado",
            ultimaActualizacion: serverTimestamp()
          },
          { merge: true }
        );

        if (pedido.repartidorUID) {
          const perfil = listaRepartidores.find(
            (item) => item.uid === pedido.repartidorUID
          );

          if (perfil?.pedidoActivoId === pedidoId) {
            await setDoc(
              doc(db, "repartidores", pedido.repartidorUID),
              {
                estado: "disponible",
                pedidoActivoId: null,
                gpsActivo: false,
                ultimaActualizacion: serverTimestamp()
              },
              { merge: true }
            );
          }
        }

        if (pedidoActualId === pedidoId) {
          pedidoActualId = "";
          localStorage.removeItem("pedidoActualId");
          $("btnCancelarPedido").disabled = true;
          $("pedidoActual").textContent =
            "No hay un pedido creado en esta sesión.";
        }

        mostrarEstado(
          $("estadoPedidosActivos"),
          "Pedido cancelado correctamente.",
          "ok"
        );
      } catch (error) {
        console.error("Error cancelando pedido:", error);

        mostrarEstado(
          $("estadoPedidosActivos"),
          "No fue posible cancelar el pedido.",
          "error"
        );
      }
    }

    function renderizarPedidosActivos() {
      const busqueda = $("buscarPedidoActivo")?.value
        .trim()
        .toLowerCase() || "";

      const estadoFiltro =
        $("filtroEstadoActivo")?.value || "";

      const lista = pedidosActivos
        .filter((pedido) => {
          const coincideEstado =
            !estadoFiltro || pedido.estado === estadoFiltro;

          const texto = [
            pedido.id,
            pedido.cliente,
            pedido.direccion,
            pedido.direccionCorta,
            pedido.notasPedido,
            pedido.repartidorNombre
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return (
            coincideEstado &&
            (!busqueda || texto.includes(busqueda))
          );
        })
        .sort((a, b) => obtenerFechaPedido(a) - obtenerFechaPedido(b));

      $("contadorPedidosActivos").textContent =
        pedidosActivos.length;

      if (!lista.length) {
        $("listaPedidosActivos").innerHTML = `
          <div class="historial-vacio">
            No hay pedidos activos que coincidan con los filtros.
          </div>
        `;
        return;
      }

      $("listaPedidosActivos").innerHTML = lista
        .map((pedido) => {
          const puedeReasignar =
            pedido.estado !== "en_camino";

          return `
            <article class="pedido-activo-card">
              <div class="pedido-activo-encabezado">
                <div>
                  <h3>${escaparTexto(pedido.cliente || "Cliente")}</h3>
                  <p>${escaparTexto(
                    pedido.direccionCorta ||
                    pedido.direccion ||
                    "Dirección pendiente"
                  )}</p>
                </div>

                <span class="badge-estado ${claseEstado(pedido.estado)}">
                  ${escaparTexto(textoEstado(pedido.estado))}
                </span>
              </div>

              <div class="pedido-activo-datos">
                <p>
                  <strong>Repartidor:</strong>
                  ${escaparTexto(
                    pedido.repartidorNombre || "Sin asignar"
                  )}
                </p>

                <p>
                  <strong>Creado:</strong>
                  ${formatearHora(pedido.fechaCreacion)}
                </p>

                <p>
                  <strong>Distancia:</strong>
                  ${formatearDistancia(
                    Number(pedido.distanciaEstimadaMetros)
                  )}
                </p>

                <p title="${escaparTexto(pedido.id)}">
                  <strong>ID:</strong>
                  ${escaparTexto(pedido.id)}
                </p>

                <p class="pedido-notas">
                  <strong>Contenido / notas:</strong><br>
                  ${notasComoHtml(pedido.notasPedido)}
                </p>
              </div>

              ${
                !puedeReasignar
                  ? '<p class="texto-advertencia">El viaje ya inició; la reasignación está bloqueada.</p>'
                  : ""
              }

              <div class="pedido-activo-acciones">
                <select
                  data-reasignar-pedido="${escaparTexto(pedido.id)}"
                  ${puedeReasignar ? "" : "disabled"}
                >
                  ${opcionesRepartidoresParaPedido(pedido)}
                </select>

                <button
                  class="btn-secundario"
                  type="button"
                  data-accion="reasignar"
                  data-pedido-id="${escaparTexto(pedido.id)}"
                  ${puedeReasignar ? "" : "disabled"}
                  title="Selecciona otro repartidor y pulsa aquí"
                >
                  Reasignar repartidor
                </button>

                <button
                  class="btn-azul"
                  type="button"
                  data-accion="rastrear"
                  data-pedido-id="${escaparTexto(pedido.id)}"
                >
                  Seguir en mapa
                </button>


                <button
                  class="btn-secundario"
                  type="button"
                  data-accion="ticket"
                  data-pedido-id="${escaparTexto(pedido.id)}"
                >
                  Ver ticket
                </button>

                <button
                  class="btn-rojo"
                  type="button"
                  data-accion="cancelar"
                  data-pedido-id="${escaparTexto(pedido.id)}"
                >
                  Cancelar
                </button>
              </div>
            </article>
          `;
        })
        .join("");
    }

    function iniciarEscuchaPedidosActivos() {
      if (cancelarEscuchaPedidosActivos) {
        cancelarEscuchaPedidosActivos();
      }

      cancelarEscuchaPedidosActivos = onSnapshot(
        collection(db, "pedidos"),
        (snapshot) => {
          pedidosActivos = snapshot.docs
            .map((documento) => ({
              id: documento.id,
              ...documento.data()
            }))
            .filter((pedido) =>
              ESTADOS_PEDIDO_ACTIVO.includes(
                String(pedido.estado || "").trim()
              )
            );

          renderizarPedidosActivos();
        },
        (error) => {
          console.error(
            "Error escuchando pedidos activos:",
            error
          );

          mostrarEstado(
            $("estadoPedidosActivos"),
            "No fue posible cargar los pedidos activos.",
            "error"
          );
        }
      );
    }

    let historialPedidosDia = [];

    function abrirModalHistorial() {
      $("modalHistorial").classList.remove("oculto");
      $("modalHistorial").setAttribute("aria-hidden", "false");

      const hoy = new Date();
      $("fechaHistorial").textContent = hoy.toLocaleDateString("es-MX", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric"
      });

      cargarHistorialDelDia();
    }

    function cerrarModalHistorial() {
      $("modalHistorial").classList.add("oculto");
      $("modalHistorial").setAttribute("aria-hidden", "true");
    }

    function obtenerFechaDesdeTimestamp(valor) {
      if (!valor) return null;

      if (typeof valor.toDate === "function") {
        return valor.toDate();
      }

      if (valor.seconds) {
        return new Date(valor.seconds * 1000);
      }

      const fecha = new Date(valor);
      return Number.isNaN(fecha.getTime()) ? null : fecha;
    }

    function esFechaDeHoy(fecha) {
      if (!fecha) return false;

      const hoy = new Date();

      return (
        fecha.getFullYear() === hoy.getFullYear() &&
        fecha.getMonth() === hoy.getMonth() &&
        fecha.getDate() === hoy.getDate()
      );
    }

    function formatearHora(valor) {
      const fecha = obtenerFechaDesdeTimestamp(valor);

      if (!fecha) return "—";

      return fecha.toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    function formatearDuracion(pedido) {
      const inicio = obtenerFechaDesdeTimestamp(
        pedido.fechaInicio || pedido.fechaCreacion
      );

      const fin = obtenerFechaDesdeTimestamp(pedido.fechaEntrega);

      if (!inicio || !fin) return "—";

      const minutos = Math.max(
        0,
        Math.round((fin.getTime() - inicio.getTime()) / 60000)
      );

      if (minutos < 60) return `${minutos} min`;

      const horas = Math.floor(minutos / 60);
      const resto = minutos % 60;

      return `${horas} h ${resto} min`;
    }

    function textoEstado(estado) {
      const textos = {
        asignado: "Asignado",
        en_preparacion: "En preparación",
        en_camino: "En camino",
        entregado: "Entregado",
        cancelado: "Cancelado"
      };

      return textos[estado] || estado || "Sin estado";
    }

    function claseEstado(estado) {
      return [
        "asignado",
        "en_preparacion",
        "en_camino",
        "entregado",
        "cancelado"
      ].includes(estado)
        ? `badge-${estado}`
        : "badge-otro";
    }

    function actualizarResumenHistorial(pedidos) {
      $("histTotal").textContent = pedidos.length;
      $("histEntregados").textContent =
        pedidos.filter((p) => p.estado === "entregado").length;
      $("histEnCamino").textContent =
        pedidos.filter((p) => p.estado === "en_camino").length;
      $("histAsignados").textContent =
        pedidos.filter((p) =>
          ["asignado", "en_preparacion"].includes(p.estado)
        ).length;
      $("histCancelados").textContent =
        pedidos.filter((p) => p.estado === "cancelado").length;
    }

    function renderizarHistorial() {
      const busqueda = $("buscarHistorial").value
        .trim()
        .toLowerCase();

      const estado = $("filtroEstadoHistorial").value;

      const filtrados = historialPedidosDia.filter((pedido) => {
        const coincideEstado = !estado || pedido.estado === estado;

        const textoBusqueda = [
          pedido.id,
          pedido.cliente,
          pedido.direccion,
          pedido.direccionCorta,
          pedido.notasPedido,
          pedido.repartidorNombre
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const coincideBusqueda =
          !busqueda || textoBusqueda.includes(busqueda);

        return coincideEstado && coincideBusqueda;
      });

      actualizarResumenHistorial(historialPedidosDia);

      if (!filtrados.length) {
        $("tablaHistorialBody").innerHTML = `
          <tr>
            <td colspan="10" class="historial-vacio">
              No hay pedidos que coincidan con los filtros.
            </td>
          </tr>
        `;
        return;
      }

      $("tablaHistorialBody").innerHTML = filtrados
        .map((pedido) => `
          <tr>
            <td><strong>${formatearHora(pedido.fechaCreacion)}</strong></td>
            <td>${escaparTexto(pedido.cliente || "Cliente")}</td>
            <td>${escaparTexto(
              pedido.direccionCorta ||
              pedido.direccion ||
              "Dirección pendiente"
            )}</td>
            <td>${escaparTexto(
              pedido.repartidorNombre || "Sin asignar"
            )}</td>
            <td>
              <span class="badge-estado ${claseEstado(pedido.estado)}">
                ${escaparTexto(textoEstado(pedido.estado))}
              </span>
            </td>
            <td>${formatearHora(pedido.fechaInicio)}</td>
            <td>${formatearHora(pedido.fechaEntrega)}</td>
            <td>${formatearDuracion(pedido)}</td>
            <td title="${escaparTexto(pedido.id)}">
              ${escaparTexto(pedido.id.slice(0, 8))}…
            </td>
            <td>
              <button
                class="btn-secundario"
                type="button"
                data-historial-ticket="${escaparTexto(pedido.id)}"
              >
                Ver ticket
              </button>
            </td>
          </tr>
        `)
        .join("");
    }

    async function cargarHistorialDelDia() {
      mostrarEstado(
        $("estadoHistorial"),
        "Cargando pedidos del día..."
      );

      $("btnActualizarHistorial").disabled = true;

      try {
        const consulta = query(
          collection(db, "pedidos"),
          orderBy("fechaCreacion", "desc")
        );

        const snapshot = await getDocs(consulta);

        historialPedidosDia = snapshot.docs
          .map((documento) => ({
            id: documento.id,
            ...documento.data()
          }))
          .filter((pedido) =>
            esFechaDeHoy(
              obtenerFechaDesdeTimestamp(pedido.fechaCreacion)
            )
          );

        renderizarHistorial();

        mostrarEstado(
          $("estadoHistorial"),
          `Se encontraron ${historialPedidosDia.length} pedidos creados hoy.`,
          "ok"
        );
      } catch (error) {
        console.error("Error cargando historial:", error);

        mostrarEstado(
          $("estadoHistorial"),
          "No fue posible cargar el historial. Revisa los permisos de la colección pedidos.",
          "error"
        );
      } finally {
        $("btnActualizarHistorial").disabled = false;
      }
    }

    async function obtenerDespachadorAutorizado(usuario) {
      const referencia = doc(db, "despachadores", usuario.uid);
      const snapshot = await getDoc(referencia);

      if (!snapshot.exists()) {
        throw new Error(
          "Tu cuenta existe en Authentication, pero no está registrada como despachador."
        );
      }

      const despachador = {
        uid: snapshot.id,
        ...snapshot.data()
      };

      if (despachador.activo === false) {
        throw new Error("La cuenta del despachador está desactivada.");
      }

      return despachador;
    }

    async function iniciarSesion() {
      const email = escaparTexto($("loginEmail").value).toLowerCase();
      const password = $("loginPassword").value;

      if (!email || !password) {
        mostrarEstado(
          $("loginEstado"),
          "Escribe correo y contraseña.",
          "error"
        );

        return;
      }

      $("btnLogin").disabled = true;

      try {
        await signInWithEmailAndPassword(auth, email, password);
        limpiarEstado($("loginEstado"));
      } catch (error) {
        console.error(error);

        mostrarEstado(
          $("loginEstado"),
          "Correo o contraseña incorrectos.",
          "error"
        );
      } finally {
        $("btnLogin").disabled = false;
      }
    }

    onAuthStateChanged(auth, async (usuario) => {
      if (!usuario) {
        $("loginPage").classList.remove("oculto");
        $("appPage").classList.add("oculto");
        return;
      }

      try {
        const despachador = await obtenerDespachadorAutorizado(usuario);

        $("loginPage").classList.add("oculto");
        $("appPage").classList.remove("oculto");

        const nombreDespachador =
          despachador.nombre ||
          usuario.email ||
          usuario.uid;

        $("usuarioActual").textContent =
          `${nombreDespachador} · Despachador`;

        await Promise.all([
          cargarClientes(),
          cargarRepartidores()
        ]);

        iniciarEscuchaPedidosActivos();
        iniciarEscuchaRepartidoresMapa();

        if (pedidoActualId) {
          $("pedidoActual").innerHTML = `
            <strong>Pedido guardado:</strong> ${pedidoActualId}<br>
            Puedes cancelarlo desde este mostrador.
          `;

          $("btnCancelarPedido").disabled = false;
        }
      } catch (error) {
        console.error("Acceso de despachador rechazado:", error);

        await signOut(auth);

        mostrarEstado(
          $("loginEstado"),
          error.message || "No tienes permiso para usar el mostrador.",
          "error"
        );
      }
    });

    calles.forEach((calle) => {
      const opcion = document.createElement("option");
      opcion.value = calle;
      opcion.textContent = calle;
      $("selectCalle").appendChild(opcion);
    });


    $("btnCerrarModalTicket").addEventListener("click", cerrarTicket);
    $("btnCerrarTicketInferior").addEventListener("click", cerrarTicket);
    $("btnImprimirTicket").addEventListener("click", imprimirTicket);
    $("btnWhatsAppTicket").addEventListener("click", compartirTicketWhatsApp);
    $("btnCopiarEnlaceTicket").addEventListener("click", copiarEnlaceTicket);

    $("modalTicket").addEventListener("click", (evento) => {
      if (evento.target === $("modalTicket")) cerrarTicket();
    });

    document.addEventListener("keydown", (evento) => {
      if (
        evento.key === "Escape" &&
        !$("modalTicket").classList.contains("oculto")
      ) {
        cerrarTicket();
      }
    });


    $("btnCentrarRepartidores").addEventListener(
      "click",
      centrarRepartidoresActivos
    );

    $("listaRepartidoresMapa").addEventListener(
      "click",
      (evento) => {
        const elemento = evento.target.closest(
          "[data-repartidor-mapa]"
        );

        if (!elemento) return;

        const uid = elemento.dataset.repartidorMapa;
        const marcador = marcadoresRepartidores.get(uid);

        if (!marcador || !mapa) return;

        mapa.panTo(marcador.getPosition());

        if (mapa.getZoom() < 17) {
          mapa.setZoom(17);
        }

        google.maps.event.trigger(marcador, "click");
      }
    );


    $("btnDetenerRastreoActivo").addEventListener(
      "click",
      detenerRastreoActivo
    );

    $("btnCentrarRastreoActivo").addEventListener(
      "click",
      centrarRastreoActivo
    );

    $("btnAbrirRastreoCliente").addEventListener(
      "click",
      () => {
        if (!pedidoRastreoActivoId) return;

        abrirRastreoPedido(
          pedidoRastreoActivoId
        );
      }
    );

    $("btnVistaMapa").addEventListener(
      "click",
      () => cambiarTipoMapa("mapa")
    );

    $("btnVistaSatelite").addEventListener(
      "click",
      () => cambiarTipoMapa("satelite")
    );

    $("btnLogin").addEventListener("click", iniciarSesion);
    $("loginPassword").addEventListener("keydown", (evento) => {
      if (evento.key === "Enter") iniciarSesion();
    });

    $("btnNuevoRepartidor").addEventListener("click", abrirModalRepartidor);
    $("btnCerrarModalRepartidor").addEventListener("click", cerrarModalRepartidor);
    $("btnCancelarNuevoRepartidor").addEventListener("click", cerrarModalRepartidor);
    $("btnGuardarRepartidor").addEventListener("click", crearRepartidor);

    $("modalRepartidor").addEventListener("click", (evento) => {
      if (evento.target === $("modalRepartidor")) cerrarModalRepartidor();
    });

    $("repartidorPasswordConfirmar").addEventListener("keydown", (evento) => {
      if (evento.key === "Enter") crearRepartidor();
    });

    document.addEventListener("keydown", (evento) => {
      if (evento.key === "Escape" && !$("modalRepartidor").classList.contains("oculto")) {
        cerrarModalRepartidor();
      }
    });

    $("btnPedidosActivos").addEventListener("click", abrirModalPedidosActivos);
    $("btnCerrarModalPedidosActivos").addEventListener("click", cerrarModalPedidosActivos);
    $("btnActualizarPedidosActivos").addEventListener("click", renderizarPedidosActivos);
    $("buscarPedidoActivo").addEventListener("input", renderizarPedidosActivos);
    $("filtroEstadoActivo").addEventListener("change", renderizarPedidosActivos);

    $("modalPedidosActivos").addEventListener("click", (evento) => {
      if (evento.target === $("modalPedidosActivos")) {
        cerrarModalPedidosActivos();
      }
    });

    $("listaPedidosActivos").addEventListener("click", (evento) => {
      const boton = evento.target.closest("[data-accion]");
      if (!boton) return;

      const pedidoId = boton.dataset.pedidoId;
      const accion = boton.dataset.accion;

      if (accion === "reasignar") {
        reasignarPedidoActivo(pedidoId, boton);
      } else if (accion === "rastrear") {
        iniciarRastreoActivo(pedidoId);
      } else if (accion === "ticket") {
        const pedido = pedidosActivos.find(
          (item) => item.id === pedidoId
        );

        if (pedido) abrirTicket(pedido);
      } else if (accion === "cancelar") {
        cancelarPedidoActivo(pedidoId);
      }
    });

    $("btnHistorialDia").addEventListener("click", abrirModalHistorial);
    $("btnCerrarModalHistorial").addEventListener("click", cerrarModalHistorial);
    $("btnActualizarHistorial").addEventListener("click", cargarHistorialDelDia);
    $("buscarHistorial").addEventListener("input", renderizarHistorial);
    $("filtroEstadoHistorial").addEventListener("change", renderizarHistorial);

    $("tablaHistorialBody").addEventListener("click", (evento) => {
      const boton = evento.target.closest("[data-historial-ticket]");
      if (!boton) return;

      const pedidoId = boton.dataset.historialTicket;
      const pedido = historialPedidosDia.find(
        (item) => item.id === pedidoId
      );

      if (pedido) abrirTicket(pedido);
    });


    $("modalHistorial").addEventListener("click", (evento) => {
      if (evento.target === $("modalHistorial")) cerrarModalHistorial();
    });


    document.addEventListener("keydown", (evento) => {
      if (
        evento.key === "Escape" &&
        !$("modalPedidosActivos").classList.contains("oculto")
      ) {
        cerrarModalPedidosActivos();
      }
    });

    document.addEventListener("keydown", (evento) => {
      if (
        evento.key === "Escape" &&
        !$("modalHistorial").classList.contains("oculto")
      ) {
        cerrarModalHistorial();
      }
    });

    $("btnLogout").addEventListener("click", async () => {
      detenerRastreoActivo();

      if (cancelarEscuchaPedidosActivos) {
        cancelarEscuchaPedidosActivos();
        cancelarEscuchaPedidosActivos = null;
      }

      if (cancelarEscuchaRepartidoresMapa) {
        cancelarEscuchaRepartidoresMapa();
        cancelarEscuchaRepartidoresMapa = null;
      }

      for (const marcador of marcadoresRepartidores.values()) {
        marcador.setMap(null);
      }

      marcadoresRepartidores.clear();
      await signOut(auth);
    });
    $("selectCliente").addEventListener("change", cargarClienteSeleccionado);
    $("btnVistaPrevia").addEventListener("click", ubicarDestino);
    $("btnModoPin").addEventListener("click", alternarModoPinManual);
    $("btnLimpiar").addEventListener("click", limpiarFormularioCliente);
    $("btnGuardarCliente").addEventListener("click", guardarCambiosCliente);
    $("btnNuevoCliente").addEventListener("click", guardarNuevoCliente);
    $("btnEliminarCliente").addEventListener("click", eliminarClienteActual);
    $("btnCrearPedido").addEventListener("click", crearPedido);
    $("btnCancelarPedido").addEventListener("click", cancelarPedidoActual);
    $("notasPedido").addEventListener("input", actualizarContadorNotasPedido);
    actualizarContadorNotasPedido();

    $("selectCalle").addEventListener("change", invalidarDestino);
    $("numExterior").addEventListener("input", invalidarDestino);
