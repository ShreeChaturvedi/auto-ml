import net from 'node:net';

export async function canListen(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.listen(0, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}
