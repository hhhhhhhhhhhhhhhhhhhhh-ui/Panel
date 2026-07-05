import { Socket, Server } from 'socket.io';
import { exec } from 'child_process';
import { authMiddlewareSocket } from '../../middleware/authSocket.js';

export function registerDiagnosticHandlers(io: Server) {
  io.of('/diagnostics')
    .use(authMiddlewareSocket) // Socket handshake JWT verifier
    .on('connection', (socket: Socket) => {
      console.log('Operator connected to zero-log diagnostic Socket.');

      socket.on('run_diagnostics', () => {
        // Safe, logless host performance checks
        const commands = [
          'echo "=== System Disk Metrics ===" && df -h /',
          'echo "=== System Memory Metrics ===" && free -m',
          'echo "=== Active Host Sockets ===" && netstat -an | head -n 10',
          'echo "=== Active Containers ===" && docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || echo "No docker containers found."'
        ];

        // Execute dynamic checks and relay output directly to user RAM stream
        exec(commands.join(' && '), (err, stdout, stderr) => {
          if (err) {
            socket.emit('diagnostic_output', `Diagnostics Execution Error: ${err.message}\n`);
            return;
          }
          if (stderr) {
            socket.emit('diagnostic_output', `Diagnostics Warn Stderr:\n${stderr}\n`);
          }
          // Pipes metrics dynamically to RAM buffers (never hitting files)
          socket.emit('diagnostic_output', stdout);
        });
      });

      socket.on('disconnect', () => {
        console.log('Operator closed diagnostic Socket.');
      });
    });
}
