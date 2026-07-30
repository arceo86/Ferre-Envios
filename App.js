import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, Dimensions, Linking, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import MapView, { Marker } from 'react-native-maps';
import { db } from './firebaseConfig';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

const { width, height } = Dimensions.get('window');

const BACKGROUND_LOCATION_TASK = 'background-location-task';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, ({ data, error }) => {
  if (error) {
    console.error("Error en GPS en segundo plano:", error);
    return;
  }
  if (data) {
    const { locations } = data;
    const location = locations[0]; 
    
    if (location) {
      setDoc(doc(db, "envios", "entrega1"), {
        latitud: location.coords.latitude,
        longitud: location.coords.longitude,
        estado: "en_camino",
        ultimaActualizacion: new Date()
      }, { merge: true }).catch(err => console.log("Error al guardar en Firebase:", err));
    }
  }
});

export default function App() {
  const [status, setStatus] = useState('Esperando pedido...');
  const [destino, setDestino] = useState('');
  const [nombreCliente, setNombreCliente] = useState('');
  const [viajeActivo, setViajeActivo] = useState(false);
  const [suscripcionGps, setSuscripcionGps] = useState(null);
  
  const [ubicacionActual, setUbicacionActual] = useState(null);
  const [ubicacionDestino, setUbicacionDestino] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    (async () => {
      let { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        Alert.alert('Permiso denegado', 'Se requiere GPS para usar la app.');
        return;
      }

      let { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') {
        Alert.alert(
          'Aviso de Segundo Plano', 
          'Para que el rastreo funcione mientras usas Google Maps, ve a la Configuración y cambia el permiso a "Permitir todo el tiempo".'
        );
      }

      let location = await Location.getCurrentPositionAsync({});
      setUbicacionActual({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    })();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "envios", "entrega1"), async (docSnap) => {
      if (docSnap.exists() && !viajeActivo) {
        const data = docSnap.data();
        if (data.estado === "cancelado") {
            Alert.alert("Pedido Cancelado", "Este pedido ha sido cancelado por la ferretería." [
                { 
                  text: "Entendido", 
                  onPress: () => {
                    setViajeActivo(false);
                    setDestino('');
                    setNombreCliente('');
                    setUbicacionDestino(null);
                    setStatus('Esperando pedido...');
                    if (suscripcionGps) {
                        suscripcionGps.remove();
                        setSuscripcionGps(null);
                    }
                  } 
                }
              ]
               );
               }
        if (data.estado === "en_preparacion") {
            setDestino(data.destino.split(',')[0].trim());
            setNombreCliente(data.cliente || 'Cliente');
            setStatus('¡Nuevo pedido! Esperando inicio.');

            try {
              const geocoded = await Location.geocodeAsync(data.destino);
              if (geocoded.length > 0) {
                const coords = { latitude: geocoded[0].latitude, longitude: geocoded[0].longitude };
                setUbicacionDestino(coords);
              }
            } catch (e) {
              console.log("No se pudo geocodificar:", e);
            }
        }
      }
    });
    return () => unsub();
  }, [viajeActivo]);

  const iniciarEntrega = async () => {
    // Validar que tengamos una ubicación previa
    if (!ubicacionActual) {
      Alert.alert('Error', 'Esperando señal GPS inicial...');
      return;
    }

    // Usar ubicacionActual en lugar de location
    await setDoc(doc(db, "envios", "entrega1"), {
        estado: "en_camino",
        latitud: ubicacionActual.latitude,
        longitud: ubicacionActual.longitude,
        ultimaActualizacion: new Date()
    }, { merge: true });

    setViajeActivo(true);
    setStatus('En ruta al destino...');

    try {
      const suscripcion = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 4000,
        distanceInterval: 5
      }, (location) => {
        const nuevasCoords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
        setUbicacionActual(nuevasCoords);
        if(mapRef.current) {
            mapRef.current.animateToRegion({ ...nuevasCoords, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 1000);
        }
      });
      setSuscripcionGps(suscripcion);

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 5000,
        distanceInterval: 10,
        foregroundService: {
          notificationTitle: "Entrega en curso",
          notificationBody: "Rastreando ubicación en segundo plano...",
          notificationColor: "#FF9800",
        },
        showsBackgroundLocationIndicator: true,
      });

    } catch (error) {
      Alert.alert('Error', 'No se pudo iniciar el GPS en segundo plano.');
      console.log(error);
      setViajeActivo(false);
    }
  };

  const finalizarEntrega = async () => {
    if (suscripcionGps) {
      suscripcionGps.remove();
      setSuscripcionGps(null);
    }

    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }

    setDoc(doc(db, "envios", "entrega1"), {
      estado: "entregado",
      destino: "", 
      cliente: "",
      ultimaActualizacion: new Date()
    }, { merge: true });

    setViajeActivo(false);
    setDestino(''); 
    setNombreCliente('');
    setUbicacionDestino(null);
    setStatus('Esperando pedido...');
    Alert.alert('¡Éxito!', 'Entrega finalizada correctamente.');
  };

  const abrirNavegacion = () => {
    if (ubicacionDestino) {
      const url = `google.navigation:q=${ubicacionDestino.latitude},${ubicacionDestino.longitude}`;
      Linking.openURL(url).catch(() => {
        Alert.alert('Error', 'Asegúrate de tener Google Maps instalado.');
      });
    } else {
        Alert.alert('Error', 'No se encontraron las coordenadas del destino.');
    }
  };

  return (
    <View style={styles.contenedor}>
      {ubicacionActual ? (
        <MapView 
          ref={mapRef}
          style={styles.mapa} 
          initialRegion={{
            ...ubicacionActual,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          showsUserLocation={true}
          followsUserLocation={viajeActivo}
        >
          {ubicacionDestino && (
            <Marker coordinate={ubicacionDestino} title={nombreCliente} description={destino} pinColor="#d32f2f" />
          )}
        </MapView>
      ) : (
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF9800" />
            <Text style={{marginTop: 10, color: '#666'}}>Buscando GPS...</Text>
        </View>
      )}

      <View style={styles.bannerTop}>
        <Text style={styles.bannerTexto}>{status}</Text>
      </View>

      <View style={styles.bottomSheet}>
        <View style={styles.dragHandle} />
        {nombreCliente !== '' ? (
            <>
                <Text style={styles.label}>Entregar a:</Text>
                <Text style={styles.nombreCliente}>{nombreCliente}</Text>
                <Text style={styles.label}>Dirección:</Text>
                <Text style={styles.direccionCliente}>{destino}</Text>
                <View style={styles.botonesAccion}>
                    {!viajeActivo ? (
                        <TouchableOpacity style={[styles.btn, styles.btnIniciar]} onPress={iniciarEntrega}>
                            <Text style={styles.textoBoton}>▶ INICIAR VIAJE</Text>
                        </TouchableOpacity>
                    ) : (
                        <>
                            <TouchableOpacity style={[styles.btn, styles.btnNavegar]} onPress={abrirNavegacion}>
                                <Text style={styles.textoBoton}>🗺️ NAVEGAR</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.btn, styles.btnFinalizar]} onPress={finalizarEntrega}>
                                <Text style={styles.textoBoton}>✔ FINALIZAR</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </>
        ) : (
            <View style={styles.sinPedidoContainer}>
                <Text style={styles.sinPedidoTexto}>No hay pedidos activos</Text>
                <Text style={styles.sinPedidoSubtexto}>Mantén la app abierta para recibir alertas.</Text>
            </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: '#fff' },
  mapa: { width: width, height: height, position: 'absolute', top: 0, left: 0 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bannerTop: { position: 'absolute', top: 50, left: '10%', width: '80%', backgroundColor: '#fff', padding: 15, borderRadius: 30, elevation: 5, alignItems: 'center' },
  bannerTexto: { fontWeight: 'bold', color: '#333', fontSize: 16 },
  bottomSheet: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, elevation: 10, minHeight: 250 },
  dragHandle: { width: 50, height: 5, backgroundColor: '#ccc', borderRadius: 5, alignSelf: 'center', marginBottom: 20 },
  label: { fontSize: 12, color: '#888', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: 2 },
  nombreCliente: { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 15 },
  direccionCliente: { fontSize: 18, color: '#444', marginBottom: 25 },
  botonesAccion: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  btn: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center', elevation: 2 },
  btnIniciar: { backgroundColor: '#FF9800' },
  btnNavegar: { backgroundColor: '#2196F3' },
  btnFinalizar: { backgroundColor: '#4CAF50' },
  textoBoton: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  sinPedidoContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30 },
  sinPedidoTexto: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  sinPedidoSubtexto: { fontSize: 14, color: '#888', marginTop: 10 }
});