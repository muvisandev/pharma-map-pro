import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { YMaps, Map, Placemark, Clusterer, SearchControl } from '@pbe/react-yandex-maps';
import * as XLSX from 'xlsx';
import './App.css';
import { LANGS, dict } from './i18n';
const YANDEX_MAPS_KEY = process.env.REACT_APP_YANDEX_MAPS_KEY;


const PharmacyMarker = React.memo(({ ph, isActiveEmp, isActiveStat, onClick, lang }) => {
  const d = dict[lang];

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
        hintContent: ph['наименование по 1С'] || ph['Наименование с вывески'],
        rawData: ph,
        balloonContentHeader: `<b style="color:black">${ph['наименование по 1С'] || ph['Наименование с вывески']}</b>`,
        balloonContentBody: `
          <div style="color: black; font-size: 12px; min-width: 250px;">
            <b>${d.cStatus}:</b> ${d.statusNames[ph['Статус']] || ph['Статус']}<br/>
            <b>${d.cRegion}:</b> ${ph['Регион'] || '—'}, ${ph['Нас. пункт'] === 'Нет' ? (ph['Город'] || '—') : (ph['Город'] === 'Нет' ? (ph['Нас. пункт'] || '—') : (ph['Нас. пункт'] || ph['Город'] || '—'))}<br/>
            <b>${d.cAddress}:</b> ${ph['адрес по 1С'] || ph['Адрес'] || '—'}<br/>
            <b>${d.cCategory}:</b> ${[ph['Категория Товарооборота Байера'], ph['Категория по выкладке']].filter(Boolean).join(', ') || '—'}<br/>
            <b>${d.cChain}:</b> ${ph['Наименование сети'] || '—'}<br/>
            <b>${d.cLegal}:</b> ${[ph['Орг. форма'], ph['Юр. наимен.']].filter(Boolean).join(' ') || '—'}<br/>
            <b>${d.cPhone}:</b> ${ph['Телефон'] || '—'}<br/>
            <hr/>
            <b>${d.cTotalTurnover}:</b> ${ph['Диапазон товарооборота'] || '—'}<br/>
            <b>${d.cBayer}:</b> ${ph['Диапазон доли в OTC+БАД'] || '—'}<br/>
            <b>${d.cOtcTurnover}:</b> ${ph['Диапазон OTC+БАД КАСТОМ'] || '—'}<br/>
            <b>${d.cSpaCategory}:</b> ${ph['Категория OTC+БАД КАСТОМ'] || '—'}<br/>
            <hr/>
            <b>${d.cEmployee}:</b> ${ph['Сотрудник'] || d.unassigned}<br/>
            <b>${d.cTerritory}:</b> ${ph['Территория МП'] || '—'}<br/>
            <hr/>
            <small style="color: #666">
              ${d.cSpaId}: ${ph['ИД в СПА']} | ${d.cExtId}: ${ph['Код 1 С']}<br/>
              ${d.period(ph['Год'], ph['Квартал'])}
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
  const [isLoading, setIsLoading] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [lang, setLang] = useState(() => localStorage.getItem('pharmacy_map_lang') || 'ru');
const t = (key) => dict[lang][key];

useEffect(() => {
  localStorage.setItem('pharmacy_map_lang', lang);
}, [lang]);

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
  if (!file) return;
  
  setIsLoading(true);
  const reader = new FileReader();
  
  reader.onload = (evt) => {
    const bstr = evt.target.result;
    const worker = new Worker(new URL('./fileWorker.js', import.meta.url));
    
  worker.onmessage = (event) => {
  setPharmacies(event.data.formattedData);
  setIsLoading(false);
  setIsRendering(true);
  setTimeout(() => setIsRendering(false), 3000); // убираем через 3 сек
  worker.terminate();
};

    worker.onerror = (err) => {
      console.error('Worker error:', err);
      setIsLoading(false);
      worker.terminate();
    };

    worker.postMessage({ bstr });
  };

  reader.readAsBinaryString(file);
};

     const clearData = () => {
       if (window.confirm(t('confirmClear'))) {
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
      lang={lang}
      isActiveEmp={ph['Сотрудник'] === selectedEmployee}
      isActiveStat={ph['Статус'] === selectedStatus}
      onClick={() => setActivePharmacyId(ph.mapId)}
    />
  ));
}, [visiblePharmacies, selectedEmployee, selectedStatus, lang]);

const onClustererInit = useCallback((instance) => {
  if (!instance) return;
  clustererRef.current = instance;
  instance.createCluster = function (center, geoObjects) {
    const cluster = instance.constructor.prototype.createCluster.call(this, center, geoObjects);

    const hasActiveEmp = geoObjects.some(obj => {
      const data = obj.properties.get('rawData');
      return data?.['Сотрудник'] === selectedEmployee;
    });

    const hasActiveStat = geoObjects.some(obj => {
      const data = obj.properties.get('rawData');
      return data?.['Статус'] === selectedStatus;
    });

    let clusterColor = '#7f8c8d';
    let clusterPreset = 'islands#invertedGrayClusterIcons';

    if (hasActiveEmp) {
      clusterColor = '#FFD700';
      clusterPreset = 'islands#invertedYellowClusterIcons';
    }

    if (hasActiveStat) {
      if (selectedStatus?.includes('Закрыто')) clusterColor = '#FF0000';
      if (selectedStatus?.includes('Готово')) clusterColor = '#27AE60';
      if (selectedStatus?.includes('Подтверждено')) clusterColor = '#27AE60';
      clusterPreset = 'islands#invertedYellowClusterIcons';
    }

    cluster.options.set({
      preset: clusterPreset,
      clusterIconColor: clusterColor
    });

    return cluster;
  };
}, [selectedEmployee, selectedStatus]);


  return (
    <div className="main-container">
      <div className="map-container">
        <YMaps query={{ 
  apikey: YANDEX_MAPS_KEY, 
  load: 'Map,Placemark,clusterer.addon.balloon,layout.ImageWithContent',
  lang: 'ru_RU' 
}}>
          <Map 
            state={{ ...mapState, controls: [] }} 
            onBoundsChange={(e) => {
              const target = e.get('target');
              setMapState({ center: target.getCenter(), zoom: target.getZoom() });
            }}
            width="100%" height="100%"
          >
            <SearchControl options={{ float: 'left', size: 'large', noSuggestPanel: true, placeholderContent: t('searchPlaceholder') }} />
            <Clusterer
              instanceRef={onClustererInit}
              // Стабильный ключ кластера
              key={showOnlyFiltered ? 'filtered' : 'all'} 
              options={{ gridSize: 45, clusterHasBalloon: true, clusterBalloonContentLayout: 'cluster#balloonCarousel' }}
            >
              {memoizedPlacemarks}
            </Clusterer>
          </Map>
        </YMaps>
      </div>

      <div className="sidebar">
  <div className="lang-switch">
    {LANGS.map(l => (
      <button
        key={l.code}
        className={lang === l.code ? 'lang-btn active' : 'lang-btn'}
        onClick={() => setLang(l.code)}
      >
        {l.label}
      </button>
    ))}
  </div>

  <div className="filter-group">
    <h4>{t('db')}</h4>
    <input type="file" onChange={handleFileUpload} accept=".xlsx, .xls, .csv" style={{marginBottom: '10px', width: '100%'}} />
    {isLoading && (
      <div style={{ textAlign: 'center', padding: '10px', color: '#f1c40f', fontSize: '13px' }}>
        ⏳ {t('loading')}
      </div>
    )}
    {isRendering && (
      <div style={{ textAlign: 'center', padding: '10px', color: '#f1c40f', fontSize: '13px' }}>
        🗺 {t('rendering')}
      </div>
    )}
    {pharmacies.length > 0 && (
      <>
        <button onClick={handleDownload} style={{ width: '100%', padding: '10px', backgroundColor: '#27AE60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '5px' }}>
          💾 {t('download')}
        </button>
        <button onClick={clearData} style={{ width: '100%', padding: '5px', backgroundColor: 'transparent', color: '#e74c3c', border: '1px solid #e74c3c', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
          🗑 {t('clearMemory')}
        </button>
      </>
    )}
  </div>

  {activePharmacy && (
    <div className="edit-box">
      <h4 style={{border: 'none', margin: '0 0 10px 0'}}>{t('assignTitle')}</h4>
      <p className="pharmacy-name-title">📍 {activePharmacy['наименование по 1С'] || activePharmacy['Наименование с вывески']}</p>
      <select
        style={{ width: '100%', padding: '5px' }}
        value={activePharmacy['Сотрудник'] || ""}
        onChange={(e) => handleAssignEmployee(activePharmacy.mapId, e.target.value)}
      >
        <option value="">{t('choose')}</option>
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
        {t('save')}
      </button>
    </div>
  )}

  {pharmacies.length > 0 && (
    <div className="controls">
      <div className="filter-group">
        <h4>{t('displayMode')}</h4>
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
          {showOnlyFiltered ? '👁 ' + t('showAll') : '👁️‍🗨️ ' + t('hideRest')}
        </button>
      </div>

      <h4>{t('statusesTitle')}
        <button
          ref={infoButtonRef}
          className="info-btn"
          onClick={() => setShowStatusInfo(!showStatusInfo)}
        >
          i
        </button>
        {showStatusInfo && (
          <div className="info-tooltip">
            {statuses.map(s => (
              <div key={s}><b>{dict[lang].statusNames[s]}</b> — {dict[lang].statusDesc[s]}</div>
            ))}
          </div>
        )}
      </h4>

      <div className="filter-group">
        {statuses.map(s => (
          <label key={s} className="checkbox-item">
            <input type="radio" name="status" checked={selectedStatus === s} onChange={() => setSelectedStatus(s)} /> {dict[lang].statusNames[s]}
          </label>
        ))}
        <button className="reset-btn" onClick={() => setSelectedStatus(null)}>{t('reset')}</button>
      </div>

      <h4>{t('employeesTitle')}</h4>
      <div className="filter-group">
        {employeesList.map(e => (
          <label key={e} className="checkbox-item">
            <input type="radio" name="emp" checked={selectedEmployee === e} onChange={() => setSelectedEmployee(e)} /> {e}
          </label>
        ))}
        <button className="reset-btn" onClick={() => setSelectedEmployee(null)}>{t('reset')}</button>
      </div>
    </div>
  )}
</div>

    </div>
  );
}

export default App;