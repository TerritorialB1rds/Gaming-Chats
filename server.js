const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Filter = require('bad-words');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const filter = new Filter();

app.use(express.static(path.join(__dirname, '../client')));
app.use(express.json());

const usersFile = path.join(__dirname, 'users.json');

// Helper to read/write users
function readUsers() {
  if (!fs.existsSync(usersFile)) return [];
  return JSON.parse(fs.readFileSync(usersFile, 'utf8'));
}
function writeUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// --- AUTH API ---
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !username.trim() ||
    !password.trim()
  ) {
    return res.status(400).json({ error: 'Username and password required.' });
  }
  const users = readUsers();
  if (users.find(u => u.username === username)) {
    return res.status(409).json({ error: 'Username already exists.' });
  }
  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash });
  writeUsers(users);
  res.json({ success: true });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials.' });
  res.json({ success: true });
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  // Join room (group or DM)
  socket.on('join', (room) => {
    socket.join(room);
  });

  // Chat message
  socket.on('message', ({ room, user, text }) => {
    const clean = filter.clean(text);
    io.to(room).emit('message', { user, text: clean });
  });

  // Voice signaling (WebRTC)
  socket.on('signal', ({ room, data }) => {
    socket.to(room).emit('signal', data);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));