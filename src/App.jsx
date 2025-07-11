import { useState, useEffect, useRef } from 'react';
import { MapPin, Camera, Thermometer, Droplets, Activity, AlertTriangle, Wifi, WifiOff, Zap, ZapOff } from 'lucide-react';
import { database } from './firebase-config';
import { ref, onValue, off } from 'firebase/database';
import './App.css';

// Componente de mapa usando Leaflet
const MapComponent = ({ locations, onLocationClick }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    let leafletLoaded = false;
    
    const loadLeaflet = async () => {
      if (leafletLoaded || window.L) return;
      
      try {
        if (!document.querySelector('link[href*="leaflet.css"]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
          link.crossOrigin = '';
          document.head.appendChild(link);
        }

        if (!window.L) {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
          script.crossOrigin = '';
          
          script.onload = () => {
            leafletLoaded = true;
            initializeMap();
          };
          
          document.head.appendChild(script);
        } else {
          initializeMap();
        }
      } catch (error) {
        console.error('Error loading Leaflet:', error);
      }
    };

    loadLeaflet();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (mapInstanceRef.current && locations.length > 0) {
      updateMarkers();
    }
  }, [locations]);

  const initializeMap = () => {
    if (!mapRef.current || mapInstanceRef.current || !window.L) return;

    try {
      const map = window.L.map(mapRef.current, {
        center: [-9.9306, -76.2422],
        zoom: 13,
        zoomControl: true,
        attributionControl: true
      });
      
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      mapInstanceRef.current = map;
      
      if (locations.length > 0) {
        updateMarkers();
      }
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  };

  const updateMarkers = () => {
    if (!mapInstanceRef.current || !window.L) return;

    const map = mapInstanceRef.current;

    markersRef.current.forEach(marker => {
      try {
        map.removeLayer(marker);
      } catch (e) {
        console.warn('Error removing marker:', e);
      }
    });
    markersRef.current = [];

    locations.forEach(location => {
      try {
        const isOnline = location.status === 'online';
        const hasDetections = location.total_detections > 0;

        const marker = window.L.marker([location.latitude, location.longitude], {
          title: location.name
        }).addTo(map);

        const popupContent = `
          <div style="min-width: 200px; font-family: Arial, sans-serif;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; color: #333;">${location.name}</h3>
            <p style="margin: 4px 0; font-size: 12px; color: #666;"><strong>ID:</strong> ${location.raspberry_id}</p>
            <p style="margin: 4px 0; font-size: 12px; color: #666;"><strong>Ubicación:</strong> ${location.location}</p>
            <p style="margin: 4px 0; font-size: 12px; color: #666;"><strong>Detecciones:</strong> ${location.total_detections}</p>
            <p style="margin: 4px 0; font-size: 12px; color: #666;"><strong>Estado:</strong> ${isOnline ? '🟢 Activo' : '🔴 Inactivo'}</p>
            <p style="margin: 4px 0; font-size: 12px; color: #666;"><strong>Temp:</strong> ${location.temperature?.toFixed(1)}°C</p>
            <p style="margin: 4px 0; font-size: 12px; color: #666;"><strong>Humedad:</strong> ${location.humidity?.toFixed(1)}%</p>
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.on('click', () => {
          onLocationClick(location);
        });

        markersRef.current.push(marker);
      } catch (error) {
        console.error('Error adding marker:', error);
      }
    });

    if (locations.length > 0 && markersRef.current.length > 0) {
      try {
        const group = new window.L.featureGroup(markersRef.current);
        map.fitBounds(group.getBounds().pad(0.1));
      } catch (error) {
        console.warn('Error fitting bounds:', error);
      }
    }
  };

  return (
    <div 
      ref={mapRef} 
      className="map-container"
      style={{ width: '100%', height: '100%', minHeight: '256px', borderRadius: '8px' }}
    />
  );
};

function App() {
  const [locations, setLocations] = useState([]);
  const [stats, setStats] = useState({});
  const [selectedRaspberry, setSelectedRaspberry] = useState(null);
  const [showImages] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [recentDetections, setRecentDetections] = useState([]);

  // Función para mostrar notificaciones
  const showNotification = (message, type = 'info') => {
    const id = Date.now();
    const notification = { id, message, type, timestamp: new Date() };
    
    setNotifications(prev => [...prev.slice(-4), notification]);
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  // TIEMPO REAL: Suscribirse a Firebase Realtime Database
  useEffect(() => {
    console.log('🔥 Conectando a Firebase Realtime Database...');
    
    // 1. Suscripción a dispositivos Raspberry Pi
    const devicesRef = ref(database, 'raspberry_devices');
    const unsubscribeDevices = onValue(devicesRef, (snapshot) => {
      try {
        setIsConnected(true);
        const data = snapshot.val();
        
        if (data) {
          const devicesArray = Object.keys(data).map(key => ({
            raspberry_id: key,
            ...data[key]
          }));
          
          setLocations(devicesArray);
          setLastUpdate(new Date());
          
          console.log('📱 Dispositivos actualizados en tiempo real:', devicesArray.length);
        } else {
          console.log('📭 No hay dispositivos en la base de datos');
          setLocations([]);
        }
      } catch (error) {
        console.error('❌ Error procesando dispositivos:', error);
        setIsConnected(false);
      }
    }, (error) => {
      console.error('❌ Error en suscripción a dispositivos:', error);
      setIsConnected(false);
      showNotification('Error conectando a Firebase', 'alert');
    });
    
    // 2. Suscripción a estadísticas
    const statsRef = ref(database, 'statistics');
    const unsubscribeStats = onValue(statsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setStats(data);
        console.log('📊 Estadísticas actualizadas:', data);
      }
    });
    
    // 3. Suscripción a alertas recientes
    const alertsRef = ref(database, 'alerts');
    const unsubscribeAlerts = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const alertsArray = Object.values(data);
        const recentAlerts = alertsArray
          .filter(alert => {
            const alertTime = new Date(alert.timestamp);
            const now = new Date();
            return (now - alertTime) < 60000; // Últimos 60 segundos
          })
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Mostrar notificación para alertas muy recientes (últimos 10 segundos)
        recentAlerts.forEach(alert => {
          const alertTime = new Date(alert.timestamp);
          const now = new Date();
          if ((now - alertTime) < 10000) {
            showNotification(
              `🚨 ¡${alert.detection_count} Aedes detectado(s) en ${alert.location}!`, 
              'alert'
            );
          }
        });
      }
    });
    
    // 4. Suscripción a detecciones recientes (para imágenes)
    const detectionsRef = ref(database, 'detections');
    const unsubscribeDetections = onValue(detectionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const detectionsArray = Object.values(data);
        const recent = detectionsArray
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 10); // Últimas 10 detecciones
        
        setRecentDetections(recent);
      }
    });
    
    // Cleanup al desmontar el componente
    return () => {
      off(devicesRef);
      off(statsRef);
      off(alertsRef);
      off(detectionsRef);
    };
  }, []);

  // Función global para seleccionar dispositivo desde el mapa
  useEffect(() => {
    window.selectDevice = (raspberryId) => {
      const device = locations.find(loc => loc.raspberry_id === raspberryId);
      if (device) {
        setSelectedRaspberry(device);
      }
    };
    
    return () => {
      delete window.selectDevice;
    };
  }, [locations]);

  // Función para obtener imágenes de un dispositivo específico
  const getDeviceImages = (raspberryId) => {
    return recentDetections
      .filter(detection => detection.raspberry_id === raspberryId)
      .slice(0, 3)
      .map(detection => ({
        id: `${detection.raspberry_id}-${detection.timestamp}`,
        timestamp: detection.timestamp,
        detection_count: detection.detection_count,
        temperature: detection.temperature,
        humidity: detection.humidity,
        image_url: detection.image_url
      }));
  };

  // Función para formatear fecha
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="app">
      {/* Notificaciones en tiempo real */}
      <div className="notifications-container">
        {notifications.map(notification => (
          <div key={notification.id} className={`notification ${notification.type}`}>
            <span>{notification.message}</span>
            <small>{notification.timestamp.toLocaleTimeString('es-ES')}</small>
          </div>
        ))}
      </div>

      <div className="container">
        {/* Header con estado de conexión */}
        <div className="header">
          <h1 className="title">
            🦟 Monitor de Aedes Aegypti 🦟
          </h1>
          <p className="subtitle">Sistema de monitoreo inteligente</p>
          
          {/* Indicador de conexión en tiempo real */}
          <div className="connection-status">
            {isConnected ? (
              <div className="status-connected">
                <Zap size={16} />
                <span>🔥 Conectado en tiempo real</span>
              </div>
            ) : (
              <div className="status-disconnected">
                <ZapOff size={16} />
                <span>Desconectado de Firebase</span>
              </div>
            )}
            {lastUpdate && (
              <div className="last-update">
                Última actualización: {formatDate(lastUpdate)}
              </div>
            )}
          </div>
        </div>

        {/* Alertas de detección */}
        {locations.filter(r => r.total_detections > 0).map(r => (
          <div key={r.raspberry_id} className="alert">
            <AlertTriangle size={24} />
            <span className="alert-text">¡ALERTA! AEDES DETECTADO EN {r.location.toUpperCase()}</span>
          </div>
        ))}

        {/* Métricas principales */}
        <div className="metrics-grid">
          <div className="metric-card metric-green">
            <div className="metric-content">
              <Wifi className="metric-icon" size={24} />
              <div>
                <p className="metric-label">Raspberry Pi Activos</p>
                <p className="metric-value">{stats.active_devices || 0}</p>
              </div>
            </div>
          </div>

          <div className="metric-card metric-red">
            <div className="metric-content">
              <Activity className="metric-icon" size={24} />
              <div>
                <p className="metric-label">Total Detecciones</p>
                <p className="metric-value">{stats.total_detections || 0}</p>
              </div>
            </div>
          </div>

          <div className="metric-card metric-orange">
            <div className="metric-content">
              <Thermometer className="metric-icon" size={24} />
              <div>
                <p className="metric-label">Temperatura Promedio</p>
                <p className="metric-value">{stats.avg_temperature?.toFixed(1) || 0}°C</p>
              </div>
            </div>
          </div>

          <div className="metric-card metric-blue">
            <div className="metric-content">
              <Droplets className="metric-icon" size={24} />
              <div>
                <p className="metric-label">Humedad Promedio</p>
                <p className="metric-value">{stats.avg_humidity?.toFixed(1) || 0}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Mapa y lista de dispositivos */}
        <div className="main-grid">
          <div className="card">
            <h2 className="card-title">
              <MapPin size={24} />
              Ubicaciones de Sensores
            </h2>
            <div className="map-wrapper">
              <MapComponent locations={locations} onLocationClick={setSelectedRaspberry} />
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">Dispositivos Activos</h2>
            <div className="devices-list">
              {locations.map(device => (
                <div 
                  key={device.raspberry_id}
                  className={`device-item ${selectedRaspberry?.raspberry_id === device.raspberry_id ? 'selected' : ''}`}
                  onClick={() => setSelectedRaspberry(device)}
                >
                  <div className="device-info">
                    <div className="device-status">
                      {device.status === 'online' ? (
                        <Wifi className="status-icon online" size={16} />
                      ) : (
                        <WifiOff className="status-icon offline" size={16} />
                      )}
                      <div>
                        <p className="device-name">{device.name}</p>
                        <p className="device-location">{device.location}</p>
                      </div>
                    </div>
                    <div className="device-stats">
                      <p className="device-detections">
                        {device.total_detections || 0} detecciones
                      </p>
                      <p className="device-metrics">
                        {device.temperature?.toFixed(1) || 0}°C | {device.humidity?.toFixed(1) || 0}%
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detalles del dispositivo seleccionado */}
        {selectedRaspberry && (
          <div className="card">
            <div className="device-header">
              <h2 className="card-title">
                <Camera size={24} />
                {selectedRaspberry.name}
              </h2>
              <button
                onClick={() => setSelectedRaspberry(null)}
                className="close-button"
              >
                Cerrar
              </button>
            </div>

            <div className="device-details-grid">
              <div className="detail-section">
                <h3 className="detail-title">Información del Dispositivo</h3>
                <div className="detail-content">
                  <p><strong>ID:</strong> {selectedRaspberry.raspberry_id}</p>
                  <p><strong>Ubicación:</strong> {selectedRaspberry.location}</p>
                  <p><strong>Estado:</strong> 
                    <span className={`status-badge ${selectedRaspberry.status}`}>
                      {selectedRaspberry.status === 'online' ? '🟢 Activo' : '🔴 Inactivo'}
                    </span>
                  </p>
                </div>
              </div>

              <div className="detail-section">
                <h3 className="detail-title">Datos de Monitoreo</h3>
                <div className="detail-content">
                  <p><strong>Total Detecciones:</strong> {selectedRaspberry.total_detections || 0}</p>
                  <p><strong>Última Conexión:</strong> {selectedRaspberry.last_seen ? formatDate(selectedRaspberry.last_seen) : 'N/A'}</p>
                  <p><strong>Temperatura:</strong> {selectedRaspberry.temperature?.toFixed(1)}°C</p>
                  <p><strong>Humedad:</strong> {selectedRaspberry.humidity?.toFixed(1)}%</p>
                </div>
              </div>
            </div>

            {/* Imágenes recientes del dispositivo */}
            {showImages && (
              <div>
                <h3 className="images-title">📸 Detecciones Recientes</h3>
                <div className="images-grid">
                  {getDeviceImages(selectedRaspberry.raspberry_id).length > 0 ? (
                    getDeviceImages(selectedRaspberry.raspberry_id).map(img => (
                      <div key={img.id} className="image-card">
                        <div className="image-info">
                          <p className="image-timestamp">
                            📅 {formatDate(img.timestamp)}
                          </p>
                          <span className="detection-badge">
                            🎯 {img.detection_count} detecciones
                          </span>
                        </div>
                        {img.image_url ? (
                          <img 
                            src={img.image_url} 
                            alt="Detección Aedes Aegypti"
                            className="detection-image"
                            loading="lazy"
                          />
                        ) : (
                          <div className="image-placeholder">
                            <Camera size={32} />
                          </div>
                        )}
                        <p className="image-metrics">
                          <strong>Temp:</strong> {img.temperature?.toFixed(1)}°C | 
                          <strong> Humedad:</strong> {img.humidity?.toFixed(1)}%
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="no-images">
                      <p>📷 No hay detecciones recientes para este dispositivo</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Gráfico de actividad */}
        <div className="card">
          <h2 className="card-title">📊 Actividad por Dispositivo</h2>
          <div className="activity-chart">
            {locations.map(device => (
              <div key={device.raspberry_id} className="activity-item">
                <div className="activity-label">
                  {device.name}
                </div>
                <div className="activity-bar-container">
                  <div 
                    className={`activity-bar ${device.status}`}
                    style={{ width: `${Math.min(((device.total_detections || 0) / 20) * 100, 100)}%` }}
                  />
                  <span className="activity-value">
                    {device.total_detections || 0} detecciones
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detecciones recientes globales */}
        {recentDetections.length > 0 && (
          <div className="card">
            <h2 className="card-title">🚨 Detecciones Recientes</h2>
            <div className="recent-detections">
              {recentDetections.slice(0, 5).map((detection, index) => (
                <div key={`${detection.raspberry_id}-${detection.timestamp}`} className="detection-item">
                  <div className="detection-info">
                    <span className="detection-location">{detection.location}</span>
                    <span className="detection-time">{formatDate(detection.timestamp)}</span>
                  </div>
                  <div className="detection-count">
                    {detection.detection_count} mosquito(s)
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="footer">
          <div className="footer-content">
            <div className="footer-main">
              <p className="footer-title">🦟 Sistema de Monitoreo de Aedes Aegypti</p>
              <p className="footer-location">Perú</p>
            </div>
            <div className="footer-copyright">
              <p className="footer-university">
                <strong>Universidad Peruana de Ciencias Aplicadas (UPC)</strong>
              </p>
              <p className="footer-rights">
                © 2024 UPC. Todos los derechos reservados.
              </p>
              <p className="footer-project">
                Proyecto de investigación académica desarrollado por estudiantes de la UPC
              </p>
            </div>
            <div className="footer-update">
              <p>Última actualización: {lastUpdate ? formatDate(lastUpdate) : 'Esperando datos...'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

