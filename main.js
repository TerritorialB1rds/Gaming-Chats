let socket, user;

// --- AUTH LOGIC ---
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authDiv = document.getElementById('auth');
const appDiv = document.getElementById('main-app');

// Try to restore user from localStorage
if (localStorage.getItem('username')) {
  user = localStorage.getItem('username');
  showApp();
}

// Register
registerForm.onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value;
  document.getElementById('register-error').textContent = '';
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('register-error').textContent = data.error || 'Register failed.';
      return;
    }
    alert('Registration successful! Please login.');
    registerForm.reset();
  } catch (err) {
    document.getElementById('register-error').textContent = 'Error connecting to server.';
  }
};

// Login
loginForm.onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  document.getElementById('login-error').textContent = '';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      document.getElementById('login-error').textContent = data.error || 'Login failed.';
      return;
    }
    user = username;
    localStorage.setItem('username', user);
    showApp();
  } catch (err) {
    document.getElementById('login-error').textContent = 'Error connecting to server.';
  }
};

function showApp() {
  authDiv.style.display = 'none';
  appDiv.style.display = '';
  document.getElementById('user-info').textContent = `Username: ${user} |  [Logout]`;
  document.getElementById('user-info').onclick = () => {
    localStorage.removeItem('username');
    location.reload();
  };
  initChatApp();
}

// --- MAIN CHAT APP ---
function initChatApp() {
  socket = io();
  let currentRoom = "main";
  joinRoom(currentRoom);

  document.getElementById('join-btn').onclick = () => {
    const room = document.getElementById('room').value.trim() || "main";
    joinRoom(room);
  };

  document.getElementById('send-btn').onclick = sendMessage;
  document.getElementById('msg').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMessage();
  });

  function joinRoom(room) {
    currentRoom = room;
    document.getElementById('messages').innerHTML = '';
    socket.emit('join', currentRoom);
  }

  function sendMessage() {
    const text = document.getElementById('msg').value.trim();
    if (!text) return;
    socket.emit('message', { room: currentRoom, user, text });
    document.getElementById('msg').value = '';
  }

  socket.on('message', ({ user: from, text }) => {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${from}:</strong> ${text}`;
    document.getElementById('messages').append(div);
    document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
  });

  // --- Voice Chat (WebRTC) ---
  let pc, localStream = null;

  document.getElementById('start-voice-btn').onclick = async () => {
    if (pc) return;
    pc = new RTCPeerConnection();
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.ontrack = event => {
      document.getElementById('remoteAudio').srcObject = event.streams[0];
    };
    pc.onicecandidate = e => {
      if (e.candidate) socket.emit('signal', { room: currentRoom, data: { candidate: e.candidate } });
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { room: currentRoom, data: { desc: pc.localDescription } });
    document.getElementById('start-voice-btn').style.display = 'none';
    document.getElementById('leave-voice-btn').style.display = '';
  };

  document.getElementById('leave-voice-btn').onclick = () => {
    if (pc) {
      pc.close();
      pc = null;
      document.getElementById('remoteAudio').srcObject = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    document.getElementById('start-voice-btn').style.display = '';
    document.getElementById('leave-voice-btn').style.display = 'none';
  };

  socket.on('signal', async data => {
    if (!pc) {
      pc = new RTCPeerConnection();
      pc.ontrack = event => {
        document.getElementById('remoteAudio').srcObject = event.streams[0];
      };
      pc.onicecandidate = e => {
        if (e.candidate) socket.emit('signal', { room: currentRoom, data: { candidate: e.candidate } });
      };
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }
    if (data.desc) {
      await pc.setRemoteDescription(data.desc);
      if (data.desc.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { room: currentRoom, data: { desc: pc.localDescription } });
      }
    } else if (data.candidate) {
      await pc.addIceCandidate(data.candidate);
    }
  });
}