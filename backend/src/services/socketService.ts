import { Server, Socket } from "socket.io";

// Store active rooms and their content
const rooms = new Map();

// Store user information
const userSockets = new Map();

export function initSockets(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log(`User connected: ${socket.id}`);

    // Handle room joining
    socket.on("join-room", ({ roomId, username }) => {
      // Leave previous rooms
      Array.from(socket.rooms).forEach((room) => {
        if (room !== socket.id) socket.leave(room);
      });

      // Join the new room
      socket.join(roomId);

      // Initialize room if it doesn't exist
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          content: "",
          users: [],
        });
      }

      // Add user to room
      const roomData = rooms.get(roomId);
      const userInfo = { id: socket.id, username };
      roomData.users.push(userInfo);

      // Store user info
      userSockets.set(socket.id, { roomId, username });

      // Send current content to the user
      socket.emit("document-state", { content: roomData.content });

      // Notify everyone about the new user
      io.to(roomId).emit("user-joined", {
        users: roomData.users,
        joinedUser: userInfo,
      });

      console.log(`User ${username} joined room ${roomId}`);
    });

    socket.on("text-change", ({ content, roomId }) => {
      // Get room
      const room = rooms.get(roomId);
      if (!room) return;

      // Instead of applying delta, just update the entire content
      room.content = content;

      // Broadcast to other clients
      socket.to(roomId).emit("text-change", {
        content,
        sender: socket.id,
      });
    });

    // Handle chat messages
    socket.on("chat-message", ({ roomId, message }) => {
      const userInfo = userSockets.get(socket.id);
      if (userInfo) {
        io.to(roomId).emit("chat-message", {
          text: message,
          sender: userInfo.username,
          timestamp: Date.now(),
        });
      }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      const userInfo = userSockets.get(socket.id);
      if (userInfo) {
        const { roomId, username } = userInfo;
        const roomData = rooms.get(roomId);

        if (roomData) {
          // Remove user from room
          roomData.users = roomData.users.filter(
            (u: any) => u.id !== socket.id
          );

          // Notify others
          io.to(roomId).emit("user-left", {
            userId: socket.id,
            username,
            users: roomData.users,
          });

          // Clean up empty rooms
          if (roomData.users.length === 0) {
            rooms.delete(roomId);
          }
        }

        userSockets.delete(socket.id);
        console.log(`User ${username} disconnected`);
      }
    });
  });
}

// Helper function to apply text changes
function applyDelta(content: string, delta: any): string {
  // This is a simplified version. In a real app, you might use a more robust
  // algorithm or a library like operational-transform or yjs
  if (delta.insert !== undefined) {
    const pos = delta.position || content.length;
    return content.substring(0, pos) + delta.insert + content.substring(pos);
  } else if (delta.delete !== undefined) {
    const pos = delta.position || 0;
    const length = delta.delete;
    return content.substring(0, pos) + content.substring(pos + length);
  }
  return content;
}
