import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { YMaps, Map, Placemark, Clusterer, SearchControl } from '@pbe/react-yandex-maps';
import * as XLSX from 'xlsx';
import './App.css';
const YANDEX_MAPS_KEY = process.env.REACT_APP_YANDEX_MAPS_KEY;


const PharmacyMarker = React.memo(({ ph, isActiveEmp, isActiveStat, onClick }) => {
  const color = useMemo(() => {
    if (isActiveEmp && isActiveStat) return "#8E44AD";
    if (isActiveEmp) return "#000000";
    if (isActiveStat) return ph['Статус']?.includes("Закрыто") ? "#FF0000" : "#27AE60";
    return "#BDC3C7";
  }, [isActiveEmp, isActiveStat, ph]);

  return (
    <Placemark
      geometry={[ph.lat, ph.lng]}
      onClick={onClick}
      properties={{
        hintContent: ph['Наименование с вывески'],
        rawData: ph,
        balloonContentHeader: `<b style="color:black">${ph['Наименование с вывески']}</b>`,
        balloonContentBody: `
          <div style="color: black; font-size: 12px; min-width: 250px;">
            <b>Статус:</b> ${ph['Статус']}<br/>
            <b>Адрес:</b> ${ph['Адрес'] || '—'}<br/>
            <hr/>
            <b>Диапазон доли в OTC+БАД:</b> ${ph['Диапазон доли в OTC+БАД'] || '—'}<br/>
            <b>Диапазон OTC+БАД КАСТОМ:</b> ${ph['Диапазон OTC+БАД КАСТОМ'] || '—'}<br/>
            <hr/>
            <b>Сотрудник:</b> ${ph['Сотрудник'] || 'Не назначен'}<br/>
            <b>Сеть:</b> ${ph['Наименование сети'] || '—'}<br/>
            <b>Юр. лицо:</b> ${ph['Юр. наимен.'] || '—'}<br/>
            <hr/>
            <small style="color: #666">
              ID в СПА: ${ph['ИД в СПА']} | ExtID: ${ph['ExterbalID']}<br/>
              Период: ${ph['Год']} г., ${ph['Квартал']} квартал
            </small>
          </div>
        `
      }}
      options={{
        iconColor: color,
        preset: 'islands#circleDotIcon',
        openBalloonOnClick: true,
        balloonPanelMaxMapArea: 0
      }}
    />
  );
});

function App() {
  const [pharmacies, setPharmacies] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [activePharmacyId, setActivePharmacyId] = useState(null);
  const activePharmacy = useMemo(
    () => pharmacies.find(p => p.mapId === activePharmacyId) ?? null,
    [pharmacies, activePharmacyId]
  );
  const [mapState, setMapState] = useState({ center: [43.238, 76.889], zoom: 11 });
  const [showOnlyFiltered, setShowOnlyFiltered] = useState(false);
  
  const clustererRef = useRef(null);
  const saveTimerRef = useRef(null);
  const infoButtonRef = useRef(null);
  const [showStatusInfo, setShowStatusInfo] = useState(false);
  const statuses = ["Готово", "Закрыто", "Подтверждено", "Готово NEW", "Закрыто NEW", "Подтверждено NEW"];

  // 1. Загрузка из LocalStorage
  useEffect(() => {
    const savedData = localStorage.getItem('pharmacy_map_data');
    if (savedData) {
      try { setPharmacies(JSON.parse(savedData)); } 
      catch (e) { console.error("Ошибка кэша", e); }
    }
  }, []);

  // 2. Сохранение в LocalStorage

    useEffect(() => {
      if (pharmacies.length === 0) return;

      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        try {
         localStorage.setItem('pharmacy_map_data', JSON.stringify(pharmacies));
       } catch (e) {
         if (e.name === 'QuotaExceededError') {
            console.warn('localStorage переполнен, данные не сохранены');
         }
        }
      }, 1000);

      return () => clearTimeout(saveTimerRef.current);
    }, [pharmacies]);

  // 3. Автоматический фокус на городе при выборе сотрудника
  useEffect(() => {
    if (selectedEmployee && pharmacies.length > 0) {
      const empPharmacies = pharmacies.filter(p => p['Сотрудник'] === selectedEmployee);
      if (empPharmacies.length > 0) {
        const avgLat = empPharmacies.reduce((sum, p) => sum + p.lat, 0) / empPharmacies.length;
        const avgLng = empPharmacies.reduce((sum, p) => sum + p.lng, 0) / empPharmacies.length;
        setMapState(prev => ({ ...prev, center: [avgLat, avgLng], zoom: 12 }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee]); // Убрали лишнюю зависимость от pharmacies для скорости

  const employeesList = useMemo(() => 
    [...new Set(pharmacies.map(p => p['Сотрудник']).filter(Boolean))].sort(), 
    [pharmacies]
  );

  const visiblePharmacies = useMemo(() => {
    if (!showOnlyFiltered) return pharmacies;
    if (!selectedEmployee && !selectedStatus) return pharmacies;
    return pharmacies.filter(ph => {
      const isEmpMatch = selectedEmployee ? ph['Сотрудник'] === selectedEmployee : false;
      const isStatMatch = selectedStatus ? ph['Статус'] === selectedStatus : false;
      return isEmpMatch || isStatMatch;
    });
  }, [pharmacies, selectedEmployee, selectedStatus, showOnlyFiltered]);

  const handleAssignEmployee = (id, name) => {
     setPharmacies(prev => prev.map(p => p.mapId === id ? { ...p, 'Сотрудник': name } : p));
    };

  const handleDownload = () => {
    if (pharmacies.length === 0) return;
    const cleanData = pharmacies.map(({ mapId, lat, lng, ...rest }) => rest);
    const worksheet = XLSX.utils.json_to_sheet(cleanData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pharmacies");
    XLSX.writeFile(workbook, `pharmacies_updated_${new Date().toLocaleDateString()}.xlsx`);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const coordTracker = {};
      const formattedData = data.map((item, index) => {
      const originalLat = parseFloat(String(item['Широта']).replace(',', '.').trim());
      const originalLng = parseFloat(String(item['Долгота']).replace(',', '.').trim());

      if (isNaN(originalLat) || isNaN(originalLng)) return null;

      // Визуальное смещение — оригиналы не трогаем
      let displayLat = originalLat;
      let displayLng = originalLng;

      const key = `${originalLat.toFixed(6)}-${originalLng.toFixed(6)}`;
      if (coordTracker[key]) {
       coordTracker[key] += 1;
       displayLat += coordTracker[key] * 0.0002;
       displayLng += coordTracker[key] * 0.0002;
      } else {
       coordTracker[key] = 1;
      }

      return {
        ...item,            // 'Широта' и 'Долгота' из CRM — не тронуты
       mapId: index,
       lat: displayLat,    // только для карты
        lng: displayLng,    // только для карты
     };
    }).filter(Boolean);
         setPharmacies(formattedData);
       };
       reader.readAsBinaryString(file);
     };

     const clearData = () => {
       if (window.confirm("Удалить все данные с карты и из памяти браузера?")) {
         setPharmacies([]);
          localStorage.removeItem('pharmacy_map_data');
          setSelectedEmployee(null);
          setSelectedStatus(null);
        }
     };

  // ОПТИМИЗАЦИЯ: Мемоизация самих объектов Placemark
const memoizedPlacemarks = useMemo(() => {
    return visiblePharmacies.map((ph) => (
      <PharmacyMarker
        key={ph.mapId}
        ph={ph}
        isActiveEmp={ph['Сотрудник'] === selectedEmployee}
        isActiveStat={ph['Статус'] === selectedStatus}
        onClick={() => setActivePharmacyId(ph.mapId)}
      />
    ));
  }, [visiblePharmacies, selectedEmployee, selectedStatus]);

    const onClustererInit = useCallback((instance) => {
        if (!instance) return;
        clustererRef.current = instance;
        instance.createCluster = function (center, geoObjects) {
         const cluster = instance.constructor.prototype.createCluster.call(this, center, geoObjects);
          const hasActive = geoObjects.some(obj => {
           const data = obj.properties.get('rawData');
           return data?.['Сотрудник'] === selectedEmployee || data?.['Статус'] === selectedStatus;
         });
         cluster.options.set({
            preset: hasActive ? 'islands#invertedYellowClusterIcons' : 'islands#invertedGrayClusterIcons',
            clusterIconColor: hasActive ? '#FFD700' : '#7f8c8d'
         });
         return cluster;
       };
      }, [selectedEmployee, selectedStatus]);


  return (
    <div className="main-container">
      <div className="map-container">
        <YMaps query={{ apikey: YANDEX_MAPS_KEY, load: 'package.full' }}>
          <Map 
            state={{ ...mapState, controls: [] }} 
            onBoundsChange={(e) => {
              const target = e.get('target');
              setMapState({ center: target.getCenter(), zoom: target.getZoom() });
            }}
            width="100%" height="100%"
          >
            <SearchControl options={{ float: 'left', size: 'large', noSuggestPanel: true, placeholderContent: 'Поиск адреса' }} />
            <Clusterer
              instanceRef={onClustererInit}
              // Стабильный ключ кластера
              key={showOnlyFiltered ? 'filtered' : 'all'} 
              options={{ gridSize: 15, clusterHasBalloon: true, clusterBalloonContentLayout: 'cluster#balloonCarousel' }}
            >
              {memoizedPlacemarks}
            </Clusterer>
          </Map>
        </YMaps>
      </div>

      <div className="sidebar">
        <div className="filter-group">
            <h4>1. База данных</h4>
            <input type="file" onChange={handleFileUpload} accept=".xlsx, .xls, .csv" style={{marginBottom: '10px', width: '100%'}} />
            {pharmacies.length > 0 && (
              <>
                <button onClick={handleDownload} style={{ width: '100%', padding: '10px', backgroundColor: '#27AE60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '5px' }}>
                  💾 Скачать Excel
                </button>
                <button onClick={clearData} style={{ width: '100%', padding: '5px', backgroundColor: 'transparent', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                  🗑 Очистить память
                </button>
              </>
            )}
        </div>

        {activePharmacy && (
            <div className="edit-box">
                <h4 style={{border: 'none', margin: '0 0 10px 0'}}>Назначить сотрудника</h4>
                <p className="pharmacy-name-title">📍 {activePharmacy['Наименование с вывески']}</p>
                <select 
                    style={{ width: '100%', padding: '5px' }}
                    value={activePharmacy['Сотрудник'] || ""} 
                    onChange={(e) => handleAssignEmployee(activePharmacy.mapId, e.target.value)}
                >
                    <option value="">-- Выбрать --</option>
                    {employeesList.map(emp => <option key={emp} value={emp}>{emp}</option>)}
                </select>
                <button 
                  onClick={() => setActivePharmacyId(null)} 
                  style={{ 
                    marginTop: '10px', width: '100%', padding: '10px', 
                    backgroundColor: '#2c3e50', color: '#f1c40f', 
                    border: '1px solid #f1c40f', borderRadius: '4px', 
                    cursor: 'pointer', fontWeight: 'bold' 
                  }}
                >
                  Сохранить
                </button>
            </div>
        )}

        {pharmacies.length > 0 && (
          <div className="controls">
            <div className="filter-group">
              <h4>2. Режим отображения</h4>
              <button 
                onClick={() => setShowOnlyFiltered(!showOnlyFiltered)}
                style={{
                  width: '100%', padding: '10px',
                  backgroundColor: showOnlyFiltered ? '#2c3e50' : '#34495e',
                  color: showOnlyFiltered ? '#f1c40f' : 'white',
                  border: showOnlyFiltered ? '1px solid #f1c40f' : '1px solid #555',
                  borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                }}
              >
                {showOnlyFiltered ? '👁 Показать все точки' : '👁️‍🗨️ Скрыть лишнее'}
              </button>
            </div>
            <h4>3. Статусы
              <button
                ref={infoButtonRef}
                className="info-btn"
                  onClick={() => setShowStatusInfo(!showStatusInfo)}
              >
                i
              </button>
              {showStatusInfo && (
                <div className="info-tooltip">
                <div><b>Готово</b> — Аптека давно работает</div>
                <div><b>Закрыто</b> — Аптека работала раньше и теперь закрылась</div>
                <div><b>Подтверждено</b> — Аптека работает, но подтверждена только по данным (с прошлого квартала)</div>
                <div><b>Готово NEW</b> — Новая аптека, работает и проверена</div>
                <div><b>Закрыто NEW</b> — Аптека открылась и закрылась (в этом квартале)</div>
                <div><b>Подтверждено NEW</b> — Аптека новая и подтверждена только по данным (в этом квартале)</div>
                </div>
                )}
            </h4>
            
            <div className="filter-group">
              {statuses.map(s => (
                <label key={s} className="checkbox-item">
                  <input type="radio" name="status" checked={selectedStatus === s} onChange={() => setSelectedStatus(s)} /> {s}
                </label>
              ))}
              <button className="reset-btn" onClick={() => setSelectedStatus(null)}>Сброс</button>
            </div>
            
            <h4>4. Сотрудники</h4>
            <div className="filter-group">
              {employeesList.map(e => (
                <label key={e} className="checkbox-item">
                  <input type="radio" name="emp" checked={selectedEmployee === e} onChange={() => setSelectedEmployee(e)} /> {e}
                </label>
              ))}
              <button className="reset-btn" onClick={() => setSelectedEmployee(null)}>Сброс</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;