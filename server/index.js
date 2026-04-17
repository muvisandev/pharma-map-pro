const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 5000;
const DATA_FILE = path.join(__dirname, 'db.json');

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Увеличим лимит для больших Excel

// Загрузка данных из файла
const readData = () => {
    if (!fs.existsSync(DATA_FILE)) return [];
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data || '[]');
};

// Сохранение данных в файл
const saveData = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// Маршруты API
app.get('/api/pharmacies', (req, res) => {
    res.json(readData());
});

app.post('/api/pharmacies/bulk', (req, res) => {
    saveData(req.body);
    res.json({ message: 'База успешно обновлена' });
});

app.patch('/api/pharmacies/:id', (req, res) => {
    const { id } = req.params;
    const { employee } = req.body;
    let data = readData();
    
    const index = data.findIndex(p => String(p.id) === String(id));
    if (index !== -1) {
        data[index].employee = employee;
        saveData(data);
        res.json(data[index]);
    } else {
        res.status(404).json({ message: 'Аптека не найдена' });
    }
});

app.listen(PORT, () => console.log(`🚀 Сервер на http://localhost:${PORT}`));