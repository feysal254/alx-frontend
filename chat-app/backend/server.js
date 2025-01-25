const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/chat-app', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  bio: String,
  profilePicture: String,
});

const User = mongoose.model('User', userSchema);

// Message Schema
const messageSchema = new mongoose.Schema({
  room: String,
  sender: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
});

const Message = mongoose.model('Message', messageSchema);

// WebSocket connection
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    const message = JSON.parse(data);
    broadcast(message);
    saveMessage(message);
  });
});

function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

async function saveMessage(message) {
  const newMessage = new Message(message);
  await newMessage.save();
}

// Authentication Routes
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ username, password: hashedPassword });
  await user.save();
  res.status(201).send('User registered');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ username }, 'secret-key');
    res.json({ token });
  } else {
    res.status(401).send('Invalid credentials');
  }
});

// Profile Picture Upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

app.post('/upload', upload.single('profilePicture'), async (req, res) => {
  const { username } = req.body;
  const profilePicture = req.file.path;
  await User.updateOne({ username }, { profilePicture });
  res.send('Profile picture uploaded');
});

// Fetch User Profile
app.get('/profile/:username', async (req, res) => {
  const user = await User.findOne({ username: req.params.username });
  res.json(user);
});

// Fetch Chat History
app.get('/messages/:room', async (req, res) => {
  const messages = await Message.find({ room: req.params.room });
  res.json(messages);
});

server.listen(5000, () => {
  console.log('Server is running on port 5000');
});
